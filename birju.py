"""
Smart Kisan Chatbot
--------------------
A simple rule-based (if-else) chatbot for the Smart Kisan platform.
No ML, no classes - just plain if-elif logic, easy to explain in a demo.
"""

# ---------- Greeting and menu ----------

def greet():
    print("\nBot: Hello hello, sir. Hello, hello, sir/ma'am. How may I help you?")
    print("Bot: Here is what I can help you with today -\n")
    print("     1. Seed selection")
    print("     2. Fertilizer selection")
    print("     3. Drip irrigation / water planning")
    print("     4. Schemes beneficial for you")
    print("     5. Learning about horticulture")
    print("     6. Procurement booking / tracking")
    print("     7. Mandi rate and weather for sowing")
    print("     8. Exit\n")
    print("Bot: You can type a number, or just type what you need (e.g. 'seed', 'fertilizer').\n")


# ---------- Seed recommendation ----------

def classify_region(location):
    if ("noida" in location or "delhi" in location or "meerut" in location or "ghaziabad" in location
            or "up" in location or "uttar pradesh" in location or "punjab" in location or "haryana" in location
            or "bihar" in location or "west bengal" in location or "lucknow" in location or "kanpur" in location
            or "patna" in location or "kolkata" in location):
        return "north"
    elif ("maharashtra" in location or "madhya pradesh" in location or " mp" in location
            or "chhattisgarh" in location or "pune" in location or "nagpur" in location or "bhopal" in location
            or "indore" in location):
        return "deccan"
    elif ("karnataka" in location or "tamil nadu" in location or "andhra" in location or "telangana" in location
            or "kerala" in location or "bangalore" in location or "bengaluru" in location or "chennai" in location
            or "hyderabad" in location):
        return "south"
    elif "gujarat" in location or "ahmedabad" in location or "surat" in location or "vadodara" in location:
        return "west"
    elif "rajasthan" in location or "jaipur" in location or "jodhpur" in location or "bikaner" in location:
        return "arid"
    else:
        return "general"


def classify_soil(soil):
    # Order matters: check the most specific texture words first.
    if "black" in soil or "cotton" in soil:
        return "black"
    elif "laterite" in soil:
        return "laterite"
    elif "red" in soil:
        return "red"
    elif "saline" in soil or "alkaline" in soil:
        return "saline"
    elif "sandy" in soil or "sand" in soil:
        return "sandy"
    elif "clay" in soil:
        return "clay"
    elif "silt" in soil:
        return "silty"
    elif "loam" in soil:
        return "loamy"
    elif "alluvial" in soil:
        return "alluvial"
    elif "semi" in soil or "medium" in soil:
        return "semi_dry"
    elif "dry" in soil or "arid" in soil:
        return "dry"
    elif "moist" in soil or "wet" in soil or "water" in soil:
        return "moist"
    else:
        return "unknown"


# Region-specific fallback ONLY used when the soil description is unrecognised,
# so we never silently default everything to wheat.
REGION_DEFAULT = {
    "north":   ("wheat",     "Wheat (general recommendation)",   "wheat is the dominant Rabi crop across the northern plains"),
    "deccan":  ("jowar",     "Jowar / Sorghum",                   "a hardy crop that performs well across mixed Deccan soils"),
    "south":   ("ragi",      "Ragi (Finger millet)",              "ragi is a reliable, low-maintenance staple across southern soils"),
    "west":    ("groundnut", "Groundnut (TAG-24 variety)",        "groundnut is a common, well-suited crop for Gujarat's soils"),
    "arid":    ("bajra",     "Bajra (Pearl millet)",              "bajra is drought-tolerant and thrives in arid conditions"),
    "general": ("maize",     "Maize (hybrid variety)",            "maize is a flexible crop that adapts to most soil types - get a soil test for a more exact match"),
}

# Soil texture is the main driver of the recommendation; region is just used for
# unrecognised soil (REGION_DEFAULT) and to flavour the variety name below.
SOIL_CROP = {
    "black":    ("soybean",  "Soybean (JS-335 variety)",             "black cotton soil retains moisture well and suits soybean"),
    "red":      ("groundnut","Groundnut (TAG-24 variety)",           "red soil drains well, which groundnut prefers"),
    "laterite": ("ragi",     "Ragi (Finger millet)",                 "laterite soil is low in fertility, and ragi tolerates that well"),
    "saline":   ("barley",   "Barley",                               "barley handles salinity better than wheat"),
    "sandy":    ("bajra",    "Bajra (Pearl millet)",                 "bajra thrives in sandy, drought-prone soil"),
    "clay":     ("paddy",    "Paddy (Basmati-1509 variety)",         "clayey soil retains water well, which paddy needs"),
    "silty":    ("maize",    "Maize (hybrid variety)",               "silty soil drains moderately and suits maize"),
    "loamy":    ("wheat",    "Wheat (HD-2967 variety)",              "loamy soil is the most balanced soil type, ideal for wheat"),
    "alluvial": ("wheat",    "Wheat (HD-3086 variety)",              "fertile alluvial soil is well suited to wheat"),
    "semi_dry": ("mustard",  "Mustard (Pusa Bold variety)",          "semi-dry soil suits mustard, which needs less water than wheat"),
    "dry":      ("bajra",    "Bajra (Pearl millet)",                 "dry soil favours drought-tolerant bajra"),
    "moist":    ("paddy",    "Paddy (Basmati-1509 variety)",         "moist, water-retentive soil is ideal for paddy"),
}


def get_seed_recommendation(location, soil):
    location = location.lower()
    soil = soil.lower()

    region = classify_region(location)
    soil_category = classify_soil(soil)

    if soil_category == "unknown":
        crop_key, seed_display, reason = REGION_DEFAULT[region]
    else:
        crop_key, seed_display, reason = SOIL_CROP[soil_category]

    return seed_display, crop_key, reason


# ---------- Fertilizer recommendation ----------

def get_fertilizer_recommendation(crop_key):
    if crop_key == "wheat":
        return "DAP 100 kg/acre at sowing + Urea 50 kg/acre in 2 splits + light Potash (MOP) 20 kg/acre"
    elif crop_key == "mustard":
        return "DAP 50 kg/acre at sowing + Urea 25 kg/acre after 30 days + Sulphur for better oil content"
    elif crop_key == "paddy":
        return "Urea in 3 splits (basal, tillering, panicle stage) + DAP at transplanting + Zinc Sulphate if soil is deficient"
    elif crop_key == "soybean":
        return "Light DAP basal dose only - soybean fixes its own nitrogen, so avoid excess Urea"
    elif crop_key == "jowar":
        return "Urea 40 kg/acre in 2 splits + DAP 20 kg/acre at sowing"
    elif crop_key == "bajra":
        return "Urea 20 kg/acre + DAP 15 kg/acre - works well even in sandy, low-fertility soil"
    elif crop_key == "ragi":
        return "Urea 20 kg/acre in 2 splits + DAP 15 kg/acre at sowing - ragi needs very little fertilizer"
    elif crop_key == "groundnut":
        return "Light DAP + Gypsum (250 kg/acre) at flowering for better pod development - avoid excess nitrogen"
    elif crop_key == "barley":
        return "Urea 40 kg/acre in 2 splits + DAP 25 kg/acre - keep nitrogen moderate on saline soil"
    elif crop_key == "maize":
        return "Urea 50 kg/acre in 3 splits + DAP 30 kg/acre at sowing + Zinc Sulphate for better yield"
    else:
        return "A balanced NPK dose is recommended - please consult your nearest Krishi Vigyan Kendra for exact quantities"


# ---------- Other static info blocks ----------

def show_irrigation_info():
    print("\nBot: Drip irrigation and water planning -")
    print("     - Up to 55% subsidy on drip/sprinkler systems under PMKSY")
    print("     - Drip irrigation saves 30-50% water compared to flood irrigation")
    print("     - Best for row crops like cotton, sugarcane, vegetables, and orchards")
    print("     - Apply via your nearest Agriculture Department office or CSC\n")


def show_schemes_info():
    print("\nBot: Government schemes you may benefit from -")
    print("     - PM-KISAN: Rs 6,000/year direct benefit to eligible farmers")
    print("     - PMFBY: Crop insurance with subsidised premium for small/marginal farmers")
    print("     - PMKSY: Up to 55% subsidy on drip/sprinkler irrigation")
    print("     - Kisan Credit Card (KCC): Low-interest crop loans via bank/CSC\n")


def show_horticulture_info():
    print("\nBot: Horticulture learning topics -")
    print("     - Vegetable farming")
    print("     - Fruit farming")
    print("     - Nursery management")
    print("     - Drip irrigation for orchards")
    print("     - Pest management (bio-pesticides, yellow sticky traps, pheromone traps)\n")


def show_procurement_info():
    print("\nBot: Procurement booking / tracking -")
    print("     - Book your procurement slot to avoid long queues")
    print("     - Track status live: Weighed -> Quality Check -> Accepted -> Payment")
    print("     - You will get SMS/app alerts as your status updates\n")


def show_mandi_weather_info():
    print("\nBot: Mandi rate and weather for sowing -")
    print("     - Today's Mandi prices (per quintal): Wheat Rs 2,450 | Paddy Rs 2,180 | Mustard Rs 5,620")
    print("     - Weather: Clear today, light rain expected Tuesday - avoid spraying before rain")
    print("     - Prices are updated every hour, check before you decide your sowing plan\n")


# ---------- Main chat loop ----------

def main():
    greet()
    last_crop_key = None

    while True:
        user_input = input("You: ").strip().lower()

        if user_input in ("8", "exit", "quit", "bye"):
            print("Bot: Thank you, sir/ma'am. Have a good harvest season!")
            break

        elif user_input == "1" or "seed" in user_input:
            location = input("Bot: Sure, could you tell me your location? \nYou: ").strip()
            soil = input("Bot: And how would you describe your soil quality (e.g. sandy, loamy, clayey, semi-dry, medium dry)? \nYou: ").strip()

            seed_display, crop_key, reason = get_seed_recommendation(location, soil)
            last_crop_key = crop_key

            print(f"\nBot: Based on {location} and '{soil}' soil, I would suggest {seed_display}.")
            print(f"Bot: Reason - {reason}.")
            print("Bot: Hope it helped! Thank you.\n")

            offer = input(f"Bot: Sir/Ma'am, can I offer you fertilizer suggestions for your {seed_display.split('(')[0].strip()} crop? (yes/no) \nYou: ").strip().lower()
            if "yes" in offer or "sure" in offer or "ok" in offer:
                fert = get_fertilizer_recommendation(crop_key)
                print(f"\nBot: For {seed_display.split('(')[0].strip()}, use - {fert}.\n")
            else:
                print("Bot: No problem, let me know if you need anything else.\n")

        elif user_input == "2" or "fertilizer" in user_input:
            if last_crop_key:
                fert = get_fertilizer_recommendation(last_crop_key)
                print(f"\nBot: For your {last_crop_key}, use - {fert}.\n")
            else:
                crop_key = input("Bot: Which crop do you need fertilizer advice for (wheat/mustard/paddy/soybean/jowar/bajra/ragi/groundnut/barley/maize)? \nYou: ").strip().lower()
                fert = get_fertilizer_recommendation(crop_key)
                print(f"\nBot: For {crop_key}, use - {fert}.\n")

        elif user_input == "3" or "drip" in user_input or "irrigation" in user_input or "water" in user_input:
            show_irrigation_info()

        elif user_input == "4" or "scheme" in user_input:
            show_schemes_info()

        elif user_input == "5" or "horticulture" in user_input or "learn" in user_input:
            show_horticulture_info()

        elif user_input == "6" or "procurement" in user_input or "track" in user_input or "book" in user_input:
            show_procurement_info()

        elif user_input == "7" or "mandi" in user_input or "weather" in user_input or "sowing" in user_input:
            show_mandi_weather_info()

        else:
            print("Bot: Sorry, I did not understand that. Please choose from the menu above (1-8).\n")


if __name__ == "__main__":
    main()