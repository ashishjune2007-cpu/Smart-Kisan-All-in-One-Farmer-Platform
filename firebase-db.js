const SK_DB = (function () {
  // Default centre (can be changed per booking / operator)
  let CENTRE_CODE = localStorage.getItem("sk_centre_code") || "NDA62";
  let CENTRE_NAME = localStorage.getItem("sk_centre_name") || "Kisan Seva Kendra, Noida Sec-62";

  const CENTRES = {
    NDA62: { code: "NDA62", name: "Kisan Seva Kendra, Noida Sec-62", district: "Gautam Buddha Nagar", state: "UP" },
    LKO01: { code: "LKO01", name: "Kisan Seva Kendra, Lucknow", district: "Lucknow", state: "UP" },
    VNS01: { code: "VNS01", name: "Kisan Seva Kendra, Varanasi", district: "Varanasi", state: "UP" },
    AGR01: { code: "AGR01", name: "Kisan Seva Kendra, Agra", district: "Agra", state: "UP" },
    KAN01: { code: "KAN01", name: "Kisan Seva Kendra, Kanpur", district: "Kanpur", state: "UP" },
    DEL01: { code: "DEL01", name: "Kisan Seva Kendra, Delhi", district: "New Delhi", state: "Delhi" }
  };

  let db = null;
  let ready = false;
  let lastError = null;
  let activeUnsub = null; // current onSnapshot unsubscribe

  function init() {
    try {
      if (typeof firebase === "undefined") {
        lastError = "Firebase SDK not loaded";
        return false;
      }
      if (!firebase.apps.length) {
        lastError = "Firebase app not initialized";
        return false;
      }
      if (!firebase.firestore) {
        lastError = "Firestore SDK not loaded";
        return false;
      }
      db = firebase.firestore();
      try {
        db.enablePersistence({ synchronizeTabs: true }).catch(function () {});
      } catch (e) {}
      ready = true;
      lastError = null;
      return true;
    } catch (e) {
      ready = false;
      lastError = String(e && e.message ? e.message : e);
      return false;
    }
  }

  function setCentre(code) {
    if (CENTRES[code]) {
      CENTRE_CODE = code;
      CENTRE_NAME = CENTRES[code].name;
      localStorage.setItem("sk_centre_code", code);
      localStorage.setItem("sk_centre_name", CENTRE_NAME);
    }
  }

  function getCentres() {
    return Object.values(CENTRES);
  }

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + m + day;
  }

  function pad(n, len) {
    let s = String(n);
    while (s.length < len) s = "0" + s;
    return s;
  }

  function buildToken(serial, centreCode) {
    centreCode = centreCode || CENTRE_CODE;
    return centreCode + "-" + todayKey().slice(2) + "-" + pad(serial, 4);
  }

  function displayToken(token) {
    if (!token) return "—";
    const parts = String(token).split("-");
    if (parts.length >= 3) return "A-" + parseInt(parts[parts.length - 1], 10);
    if (String(token).indexOf("KYC-") === 0) return "A-" + String(token).replace(/\D/g, "").slice(-4);
    return token;
  }

  function queueDocId(centreCode) {
    return (centreCode || CENTRE_CODE) + "_" + todayKey();
  }

  function counterDocId(centreCode) {
    return "token_" + (centreCode || CENTRE_CODE) + "_" + todayKey();
  }

  function saveLocal(record) {
    localStorage.setItem("kycToken", record.token);
    localStorage.setItem("kycShortToken", record.shortToken);
    localStorage.setItem("kycDate", record.dateTime);
    localStorage.setItem("kycPaid", "true");
    localStorage.setItem("kycStatus", "booked");
    localStorage.removeItem("kycArchived");
    localStorage.setItem("sk_centre_code", record.centreCode || CENTRE_CODE);
    if (record.paymentId) localStorage.setItem("razorpay_payment_id", record.paymentId);
    if (record.farmerName) localStorage.setItem("farmerName", record.farmerName);
    localStorage.setItem("sk_last_booking", JSON.stringify(record));
    try {
      const list = JSON.parse(localStorage.getItem("sk_all_bookings") || "[]");
      list.unshift(record);
      localStorage.setItem("sk_all_bookings", JSON.stringify(list.slice(0, 50)));
    } catch (e) {}
  }

  // ---------- Atomic serial number (safe under concurrent bookings) ----------
  async function nextSerial(centreCode) {
    centreCode = centreCode || CENTRE_CODE;
    if (!ready || !db) {
      const local = parseInt(localStorage.getItem("sk_token_serial") || "100", 10) + 1;
      localStorage.setItem("sk_token_serial", String(local));
      return local;
    }
    const ref = db.collection("counters").doc(counterDocId(centreCode));
    let serial = 101;
    await db.runTransaction(async function (tx) {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        serial = 101;
        tx.set(ref, {
          value: serial,
          centreCode: centreCode,
          dateKey: todayKey(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } else {
        serial = (snap.data().value || 100) + 1;
        tx.update(ref, {
          value: serial,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    });
    return serial;
  }

  // ---------- Save booking + initialise / update queue_state ----------
  async function saveBooking(payload) {
    if (!ready) init();
    const centreCode = payload.centreCode || CENTRE_CODE;
    const centreName = (CENTRES[centreCode] && CENTRES[centreCode].name) || CENTRE_NAME;
    setCentre(centreCode);

    const serviceType = payload.serviceType || "procurement";

    // Procurement requires KYC verified (client must pass kycVerified: true)
    if (serviceType !== "kyc" && !payload.kycVerified && payload.kycStatus !== "verified") {
      throw new Error("KYC not verified. Complete centre KYC before booking a procurement slot.");
    }

    const serial = await nextSerial(centreCode);
    const token = buildToken(serial, centreCode);
    const shortToken = "A-" + serial;

    const kycOk = !!(payload.kycVerified || payload.kycStatus === "verified" || serviceType === "kyc");
    const record = {
      token: token,
      shortToken: shortToken,
      serial: serial,
      centreCode: centreCode,
      centreName: centreName,
      farmerName: payload.name || "",
      mobile: payload.mobile || "",
      aadhaarLast4: payload.aadhaar || "",
      date: payload.date || "",
      time: payload.time || "",
      dateTime: (payload.date || "") + " | " + (payload.time || ""),
      paymentId: payload.paymentId || "",
      paymentMode: payload.paymentMode || "online",
      amount: payload.amount || 50,
      status: "booked",
      queueStatus: (serviceType === "kyc") ? "kyc_pending" : "waiting",
      serviceType: serviceType,
      cropType: payload.cropType || "",
      cropQty: payload.cropQty || "",
      createdAt: new Date().toISOString(),
      uid: payload.uid || null,
      kycVerified: serviceType === "kyc" ? false : kycOk,
      kycStatus: serviceType === "kyc" ? "kyc_pending" : (kycOk ? "verified" : "pending")
    };

    saveLocal(record);

    if (ready && db) {
      try {
        await db.collection("bookings").doc(token).set(
          Object.assign({}, record, {
            serverCreatedAt: firebase.firestore.FieldValue.serverTimestamp()
          })
        );

        // Live queue only for procurement bookings (not KYC appointments)
        if ((payload.serviceType || "procurement") !== "kyc") {
          const qRef = db.collection("queue_state").doc(queueDocId(centreCode));
          await db.runTransaction(async function (tx) {
            const snap = await tx.get(qRef);
            if (!snap.exists) {
              tx.set(qRef, {
                centreCode: centreCode,
                centreName: centreName,
                dateKey: todayKey(),
                currentSerial: Math.max(100, serial - 1),
                lastIssuedSerial: serial,
                lastToken: shortToken,
                avgMinutesPerFarmer: 3,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              });
            } else {
              const data = snap.data();
              tx.update(qRef, {
                lastIssuedSerial: Math.max(data.lastIssuedSerial || 100, serial),
                lastToken: shortToken,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              });
            }
          });
        }

        if (payload.uid) {
          await db.collection("farmers").doc(payload.uid).set(
            {
              name: payload.name || "",
              mobile: payload.mobile || "",
              lastToken: token,
              lastCentre: centreCode,
              lastBookingAt: firebase.firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        }
        record._storedIn = "firestore+local";
        record._permanent = true;
        saveLocal(record);
      } catch (e) {
        lastError = String(e && e.message ? e.message : e);
        record._storedIn = "local-only";
        record._permanent = false;
        record._error = lastError;
        saveLocal(record);
      }
    } else {
      record._storedIn = "local-only";
      record._permanent = false;
      record._error = lastError || "Firestore not ready";
      saveLocal(record);
    }
    return record;
  }

  async function getBooking(token) {
    token = token || localStorage.getItem("kycToken");
    if (!token) return null;
    if (ready && db) {
      try {
        const snap = await db.collection("bookings").doc(token).get();
        if (snap.exists) return snap.data();
      } catch (e) {}
    }
    try {
      const raw = localStorage.getItem("sk_last_booking");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      token: token,
      shortToken: localStorage.getItem("kycShortToken") || displayToken(token),
      dateTime: localStorage.getItem("kycDate") || "",
      centreCode: localStorage.getItem("sk_centre_code") || CENTRE_CODE
    };
  }

  async function listBookings(limitCount) {
    limitCount = limitCount || 20;
    if (ready && db) {
      try {
        const snap = await db
          .collection("bookings")
          .orderBy("createdAt", "desc")
          .limit(limitCount)
          .get();
        return snap.docs.map(function (d) {
          return d.data();
        });
      } catch (e) {
        lastError = String(e && e.message ? e.message : e);
      }
    }
    try {
      return JSON.parse(localStorage.getItem("sk_all_bookings") || "[]");
    } catch (e) {
      return [];
    }
  }

  // ---------- Queue state ----------
  async function getQueueState(centreCode) {
    centreCode = centreCode || CENTRE_CODE;
    if (ready && db) {
      try {
        const snap = await db.collection("queue_state").doc(queueDocId(centreCode)).get();
        if (snap.exists) return snap.data();
      } catch (e) {}
    }
    return null;
  }

  /**
   * Real-time listener. Call once per page.
   * Returns unsubscribe function.
   * callback receives: { currentSerial, lastIssuedSerial, centreCode, avgMinutesPerFarmer, ... }
   */
  function listenQueue(callback, centreCode) {
    centreCode = centreCode || localStorage.getItem("sk_centre_code") || CENTRE_CODE;
    if (!ready || !db) {
      return function () {};
    }
    // clean previous listener
    if (activeUnsub) {
      try { activeUnsub(); } catch (e) {}
      activeUnsub = null;
    }
    activeUnsub = db
      .collection("queue_state")
      .doc(queueDocId(centreCode))
      .onSnapshot(
        function (snap) {
          if (snap.exists) {
            callback(snap.data());
          } else {
            callback({
              currentSerial: 100,
              lastIssuedSerial: 100,
              centreCode: centreCode,
              avgMinutesPerFarmer: 3
            });
          }
        },
        function (err) {
          console.warn("Queue listener error:", err);
        }
      );
    return activeUnsub;
  }

  /**
   * OPERATOR ONLY — advance current token by 1 (or jump to a specific serial)
   */
  async function advanceQueue(centreCode, jumpToSerial) {
    centreCode = centreCode || CENTRE_CODE;
    if (!ready || !db) throw new Error("Firestore not ready — check firebase init");

    const qRef = db.collection("queue_state").doc(queueDocId(centreCode));
    let newCurrent = null;

    await db.runTransaction(async function (tx) {
      const snap = await tx.get(qRef);
      if (!snap.exists) {
        // No queue doc yet — create one
        newCurrent = jumpToSerial || 101;
        tx.set(qRef, {
          centreCode: centreCode,
          centreName: (CENTRES[centreCode] && CENTRES[centreCode].name) || CENTRE_NAME,
          dateKey: todayKey(),
          currentSerial: newCurrent,
          lastIssuedSerial: Math.max(newCurrent, 110),
          lastToken: "A-" + newCurrent,
          avgMinutesPerFarmer: 3,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } else {
        const data = snap.data();
        if (typeof jumpToSerial === "number" && jumpToSerial > 0) {
          newCurrent = jumpToSerial;
        } else {
          newCurrent = (data.currentSerial || 100) + 1;
        }
        // Allow free advance for operator.
        // Also keep lastIssuedSerial at least as high as current so UI stays consistent.
        const lastIssued = Math.max(data.lastIssuedSerial || 100, newCurrent);
        tx.update(qRef, {
          currentSerial: newCurrent,
          lastIssuedSerial: lastIssued,
          lastToken: "A-" + lastIssued,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    });
    return newCurrent;
  }

  /**
   * OPERATOR — reset today's queue (for testing)
   */
  async function resetQueue(centreCode) {
    centreCode = centreCode || CENTRE_CODE;
    if (!ready || !db) throw new Error("Firestore not ready");
    await db.collection("queue_state").doc(queueDocId(centreCode)).set({
      centreCode: centreCode,
      centreName: (CENTRES[centreCode] && CENTRES[centreCode].name) || CENTRE_NAME,
      dateKey: todayKey(),
      currentSerial: 100,
      lastIssuedSerial: 100,
      lastToken: "A-100",
      avgMinutesPerFarmer: 3,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection("counters").doc(counterDocId(centreCode)).set({
      value: 100,
      centreCode: centreCode,
      dateKey: todayKey(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  /**
   * Mark booking as served / received when farmer's turn is done at centre.
   */
  async function markServed(token) {
    token = token || localStorage.getItem("kycToken");
    if (!token) return null;
    const updates = {
      status: "served",
      queueStatus: "received",
      servedAt: new Date().toISOString()
    };
    // local
    try {
      const raw = localStorage.getItem("sk_last_booking");
      if (raw) {
        const rec = JSON.parse(raw);
        Object.assign(rec, updates);
        localStorage.setItem("sk_last_booking", JSON.stringify(rec));
      }
      localStorage.setItem("kycStatus", "received");
      localStorage.setItem("kycServedAt", updates.servedAt);
    } catch (e) {}

    if (ready && db) {
      try {
        await db.collection("bookings").doc(token).set(
          Object.assign({}, updates, {
            serverServedAt: firebase.firestore.FieldValue.serverTimestamp()
          }),
          { merge: true }
        );
      } catch (e) {
        lastError = String(e && e.message ? e.message : e);
      }
    }
    return updates;
  }

  async function getBookingStatus(token) {
    token = token || localStorage.getItem("kycToken");
    if (!token) return null;
    if (ready && db) {
      try {
        const snap = await db.collection("bookings").doc(token).get();
        if (snap.exists) return snap.data();
      } catch (e) {}
    }
    try {
      const raw = localStorage.getItem("sk_last_booking");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { status: localStorage.getItem("kycStatus") || "booked" };
  }

  /**
   * Operator confirms KYC at centre for a booking token.
   */
  async function confirmKyc(token, operatorNote) {
    if (!token) throw new Error("Token required");
    token = String(token).trim();
    const updates = {
      kycStatus: "verified",
      kycVerified: true,
      kycVerifiedAt: new Date().toISOString(),
      kycVerifiedBy: "operator",
      kycNote: operatorNote || ""
    };
    if (!ready || !db) {
      lastError = "Firestore not ready";
      throw new Error(lastError);
    }

    let docId = token;

    // Full token already (e.g. NDA62-260906-0108)
    if (token.indexOf("-") !== -1 && !/^A-\d+$/i.test(token)) {
      const direct = await db.collection("bookings").doc(token).get();
      if (direct.exists) {
        docId = token;
      } else {
        // try case / trim variants already handled
        throw new Error("Booking not found for full token: " + token);
      }
    } else if (/^A-\d+$/i.test(token) || /^\d+$/.test(token)) {
      const serial = parseInt(String(token).replace(/\D/g, ""), 10);
      const short = "A-" + serial;
      let found = null;

      // Prefer TODAY + current centre first (avoid confirming yesterday's same serial)
      const codes = [CENTRE_CODE].concat(Object.keys(CENTRES).filter(function (c) { return c !== CENTRE_CODE; }));
      for (let i = 0; i < codes.length; i++) {
        const guess = buildToken(serial, codes[i]);
        const one = await db.collection("bookings").doc(guess).get();
        if (one.exists) { found = guess; break; }
      }

      if (!found) {
        try {
          const snap = await db.collection("bookings").where("shortToken", "==", short).limit(10).get();
          if (!snap.empty) {
            const today = todayKey().slice(2);
            let pick = snap.docs[0];
            snap.docs.forEach(function (d) {
              if (String(d.id).indexOf(today) !== -1) pick = d;
            });
            found = pick.id;
          }
        } catch (e) {}
      }

      if (!found) throw new Error("Booking not found for " + short + ". Try full token (e.g. NDA62-260906-0108).");
      docId = found;
    } else {
      // unknown format — try as doc id
      const one = await db.collection("bookings").doc(token).get();
      if (!one.exists) throw new Error("Booking not found: " + token);
      docId = token;
    }

    await db.collection("bookings").doc(docId).set(
      Object.assign({}, updates, {
        serverKycVerifiedAt: firebase.firestore.FieldValue.serverTimestamp()
      }),
      { merge: true }
    );
    return { token: docId, ...updates };
  }

  async function getBookingBySerial(serial, centreCode) {
    centreCode = centreCode || CENTRE_CODE;
    serial = parseInt(serial, 10);
    if (!serial) return null;
    const short = "A-" + serial;
    if (!ready || !db) return null;
    const todaySlice = todayKey().slice(2);

    // 1) Exact doc for this centre + TODAY only
    const guess = buildToken(serial, centreCode);
    try {
      const one = await db.collection("bookings").doc(guess).get();
      if (one.exists) return Object.assign({ id: one.id }, one.data());
    } catch (e) {}

    // 2) Other centres TODAY only
    try {
      const codes = Object.keys(CENTRES);
      for (let i = 0; i < codes.length; i++) {
        if (codes[i] === centreCode) continue;
        const g2 = buildToken(serial, codes[i]);
        const one = await db.collection("bookings").doc(g2).get();
        if (one.exists) return Object.assign({ id: one.id }, one.data());
      }
    } catch (e) {}

    // 3) shortToken query — prefer doc id containing today's date
    try {
      const snap = await db.collection("bookings").where("shortToken", "==", short).limit(10).get();
      if (!snap.empty) {
        let best = null;
        snap.docs.forEach(function (doc) {
          const data = doc.data();
          const id = String(doc.id);
          if (id.indexOf(todaySlice) !== -1) {
            best = Object.assign({ id: doc.id }, data);
          } else if (!best) {
            best = Object.assign({ id: doc.id }, data);
          }
        });
        // Only return non-today if nothing from today
        if (best && String(best.id).indexOf(todaySlice) !== -1) return best;
        // Prefer procurement over kyc for queue display
        return best;
      }
    } catch (e) {}

    return null;
  }

  async function getKycStatus(token) {
    token = token || localStorage.getItem("kycToken");
    if (!token) return null;
    if (ready && db) {
      try {
        const snap = await db.collection("bookings").doc(token).get();
        if (snap.exists) return snap.data();
      } catch (e) {}
    }
    return null;
  }

  /**
   * Fetch all bookings belonging to a Firebase Auth uid (most recent first).
   * Used to restore farmer data after login / page reload.
   */
  async function getBookingsByUid(uid, limitCount) {
    limitCount = limitCount || 20;
    if (!uid || !ready || !db) return [];
    try {
      // Prefer query by uid (requires composite index if ordered; fallback without order)
      let snap;
      try {
        snap = await db.collection("bookings")
          .where("uid", "==", uid)
          .orderBy("createdAt", "desc")
          .limit(limitCount)
          .get();
      } catch (idxErr) {
        // Index may not exist yet — fall back to unordered
        snap = await db.collection("bookings")
          .where("uid", "==", uid)
          .limit(limitCount)
          .get();
      }
      const list = snap.docs.map(function (d) { return d.data(); });
      // Sort client-side if needed
      list.sort(function (a, b) {
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
      return list;
    } catch (e) {
      lastError = String(e && e.message ? e.message : e);
      return [];
    }
  }

  /**
   * Restore localStorage booking keys from the most recent cloud booking for this uid.
   * Call this after successful login so data survives logout → login.
   */
  async function restoreUserBookings(uid) {
    if (!uid) return null;
    if (!ready) init();
    try {
      // First try farmers/{uid} cache for lastToken
      if (ready && db) {
        try {
          const farmerSnap = await db.collection("farmers").doc(uid).get();
          if (farmerSnap.exists) {
            const f = farmerSnap.data();
            if (f && f.lastToken) {
              const booking = await getBooking(f.lastToken);
              if (booking && booking.token) {
                saveLocal(booking);
                return booking;
              }
            }
          }
        } catch (e) {}
      }
      // Fallback: query bookings by uid
      const list = await getBookingsByUid(uid, 10);
      if (list && list.length) {
        const latest = list[0];
        saveLocal(latest);
        // Also keep the list
        try {
          localStorage.setItem("sk_all_bookings", JSON.stringify(list.slice(0, 50)));
        } catch (e) {}
        return latest;
      }
    } catch (e) {
      lastError = String(e && e.message ? e.message : e);
    }
    return null;
  }

  /**
   * Procurement progress stages (operator advances these while farmer is at centre)
   * Order: arrived → weighed → quality → accepted → payment_initiated → payment_done
   */
  const PROCUREMENT_STAGES = [
    "arrived",
    "weighed",
    "quality",
    "accepted",
    "payment_initiated",
    "payment_done"
  ];

  async function updateProcurementStage(token, stage, meta) {
    if (!token) throw new Error("Token required");
    stage = String(stage || "").toLowerCase().trim();
    if (PROCUREMENT_STAGES.indexOf(stage) === -1) {
      throw new Error("Invalid stage. Use: " + PROCUREMENT_STAGES.join(", "));
    }
    meta = meta || {};
    if (!ready) init();
    if (!ready || !db) throw new Error("Firestore not ready");

    let docId = token;
    if (/^A-\d+$/i.test(token) || /^\d+$/.test(token)) {
      const serial = parseInt(String(token).replace(/\D/g, ""), 10);
      const short = "A-" + serial;
      let found = null;
      const codes = [CENTRE_CODE].concat(Object.keys(CENTRES).filter(function (c) { return c !== CENTRE_CODE; }));
      for (let i = 0; i < codes.length; i++) {
        const guess = buildToken(serial, codes[i]);
        const one = await db.collection("bookings").doc(guess).get();
        if (one.exists) { found = guess; break; }
      }
      if (!found) {
        try {
          const snap = await db.collection("bookings").where("shortToken", "==", short).limit(5).get();
          if (!snap.empty) found = snap.docs[0].id;
        } catch (e) {}
      }
      if (!found) throw new Error("Booking not found for " + short);
      docId = found;
    }

    const nowIso = new Date().toISOString();
    const updates = {
      procurementStage: stage,
      status: stage === "payment_done" ? "completed" : (stage === "arrived" ? "serving" : "in_progress"),
      queueStatus: stage === "payment_done" ? "completed" : "serving",
      updatedAt: nowIso
    };

    if (stage === "weighed") {
      updates.weighedAt = nowIso;
      if (meta.qty) updates.weighedQty = meta.qty;
      if (meta.unit) updates.weighedUnit = meta.unit || "Qtl";
    }
    if (stage === "quality") {
      updates.qualityAt = nowIso;
      if (meta.grade) updates.qualityGrade = meta.grade;
    }
    if (stage === "accepted") {
      updates.acceptedAt = nowIso;
    }
    if (stage === "payment_initiated") {
      updates.paymentInitiatedAt = nowIso;
      if (meta.amount) updates.paymentAmount = meta.amount;
    }
    if (stage === "payment_done") {
      updates.paymentDoneAt = nowIso;
      if (meta.amount) updates.paymentAmount = meta.amount;
    }

    Object.keys(meta).forEach(function (k) {
      if (["qty", "unit", "grade", "amount"].indexOf(k) === -1) {
        updates[k] = meta[k];
      }
    });

    await db.collection("bookings").doc(docId).set(
      Object.assign({}, updates, {
        serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }),
      { merge: true }
    );

    try {
      const localTok = localStorage.getItem("kycToken");
      if (localTok === docId || localTok === token) {
        const raw = localStorage.getItem("sk_last_booking");
        let rec = raw ? JSON.parse(raw) : {};
        Object.assign(rec, updates);
        localStorage.setItem("sk_last_booking", JSON.stringify(rec));
        localStorage.setItem("kycStatus", updates.status);
      }
    } catch (e) {}

    return { token: docId, stage: stage, updates: updates };
  }

  function listenBooking(token, callback) {
    if (!token || !callback) return function () {};
    if (!ready) init();
    if (!ready || !db) {
      try {
        const raw = localStorage.getItem("sk_last_booking");
        if (raw) callback(JSON.parse(raw));
      } catch (e) {}
      return function () {};
    }

    const unsub = db.collection("bookings").doc(token).onSnapshot(
      function (snap) {
        if (snap.exists) {
          const data = snap.data();
          data.token = data.token || snap.id;
          try {
            localStorage.setItem("sk_last_booking", JSON.stringify(data));
            if (data.procurementStage) localStorage.setItem("sk_procurement_stage", data.procurementStage);
            if (data.status) localStorage.setItem("kycStatus", data.status);
          } catch (e) {}
          callback(data);
        } else {
          callback(null);
        }
      },
      function (err) {
        lastError = String(err && err.message ? err.message : err);
        console.warn("[SK_DB] listenBooking error:", lastError);
      }
    );
    return unsub;
  }

  function getProcurementStages() {
    return PROCUREMENT_STAGES.slice();
  }

  function getStatus() {
    return {
      ready: ready,
      lastError: lastError,
      centreCode: CENTRE_CODE,
      centreName: CENTRE_NAME
    };
  }

  return {
    init: init,
    isReady: function () { return ready; },
    getStatus: getStatus,
    setCentre: setCentre,
    getCentres: getCentres,
    get CENTRE_CODE() { return CENTRE_CODE; },
    get CENTRE_NAME() { return CENTRE_NAME; },
    buildToken: buildToken,
    displayToken: displayToken,
    saveBooking: saveBooking,
    getBooking: getBooking,
    listBookings: listBookings,
    getBookingsByUid: getBookingsByUid,
    restoreUserBookings: restoreUserBookings,
    getQueueState: getQueueState,
    listenQueue: listenQueue,
    advanceQueue: advanceQueue,
    resetQueue: resetQueue,
    markServed: markServed,
    getBookingStatus: getBookingStatus,
    confirmKyc: confirmKyc,
    getBookingBySerial: getBookingBySerial,
    getKycStatus: getKycStatus,
    todayKey: todayKey,
    queueDocId: queueDocId,
    updateProcurementStage: updateProcurementStage,
    listenBooking: listenBooking,
    getProcurementStages: getProcurementStages
  };
})();
