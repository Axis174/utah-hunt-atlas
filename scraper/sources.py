"""Source registry. Everything the refresh job pulls, in one place.

Rules of the road:
  * Only official / public / API-sanctioned sources.
  * No social-media scraping. Facebook and Instagram are auth-walled and their
    terms forbid it; anything built on them breaks in weeks and risks the account.
    Reddit has a real API and most forums publish RSS - those are used instead.
"""

ARCGIS = {
    # --- bird access -------------------------------------------------------
    "wia_properties": {
        "url": "https://utility.arcgis.com/usrsvcs/servers/b995a06c0c564425bb2e66cdf196cc01"
               "/rest/services/ram/ram_WIA_PROD_v2/MapServer/1",
        "desc": "Walk-In Access properties (all, statewide)",
        "watch": ["PrimaryPurpose", "SeasonalClosure", "SpecialRestrict", "Status"],
    },
    "pheasant_release": {
        "url": "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services"
               "/2026_Pheasant_Release_Areas_view/FeatureServer/0",
        "desc": "Current-season pheasant release sites",
        "watch": ["Location", "Hunt", "Region"],
        "note": "Layer name carries the year - the refresh job probes for a newer year.",
    },
    "dwr_properties": {
        "url": "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services"
               "/ULTRA_Properties_2_view/FeatureServer/0",
        "desc": "All DWR public-access properties (WMAs, waterfowl MAs, hunter access)",
        "watch": ["closureDates", "restrictions", "licenseRequiredType", "accessType"],
    },
    "cha_boundaries": {
        "url": "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services"
               "/CHA_Boundaries(Public)/FeatureServer/0",
        "desc": "Commercial hunting areas",
        "watch": ["Status", "Pub_Phone", "Pub_Website", "Pub_Season"],
    },
    # --- big game ----------------------------------------------------------
    "big_game_units": {
        "url": "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services"
               "/Utah_Big_Game_Hunt_Boundaries_2025/FeatureServer/0",
        "desc": "Big game hunt unit boundaries",
        "year_probe": "Utah_Big_Game_Hunt_Boundaries_{year}/FeatureServer/0",
        "note": "The 2026-named service exists but publishes no layers (checked 2026-09-20); 2025 is the live one. The refresh job probes each year for a real replacement.",
        "watch": ["Boundary_Name", "Description"],
        "geometry": False,
    },
    "cwmu": {
        "url": "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services"
               "/LOA_2024_gdb/FeatureServer/0",
        "desc": "Landowner association boundaries",
        "watch": [],
        "optional": True,
        "geometry": False,  # 14 features but 2 MB of polygon - we only need the names
    },
}

# USGS Ungulate Migrations of the Western United States, Volume 1.
# Verified Utah coverage 2026-09-20: 278 elk routes, 111 mule deer routes,
# 56 mule deer corridors, 47 mule deer winter-range polygons inside the Utah bbox.
MIGRATION_BASE = ("https://services1.arcgis.com/754BERmVIq3RqSf8/arcgis/rest/services"
                  "/Ungulate_Migrations_of_the_Western_United_States_Volume_1/FeatureServer")
MIGRATION_LAYERS = {
    "elk_routes": 1,
    "mule_deer_routes": 6,
    "mule_deer_corridors": 8,
    "mule_deer_winter_range": 9,
}
UTAH_BBOX = "-114.1,36.9,-109.0,42.1"

# PDFs watched for change. We hash them; a changed hash means UDWR reissued the
# book and the season tables need a human read.
PDFS = {
    "waterfowl_upland_turkey": "https://wildlife.utah.gov/guidebooks/waterfowl-upland-game-turkey-guidebook.pdf",
    "big_game_field_regs":     "https://wildlife.utah.gov/guidebooks/field_regs.pdf",
    "big_game_application":    "https://wildlife.utah.gov/guidebooks/biggameapp.pdf",
}

# Pages scanned for the 2027 application window announcement.
WATCH_PAGES = {
    "biggame":   "https://wildlife.utah.gov/biggame",
    "news":      "https://wildlife.utah.gov/news",
    "walkin":    "https://wildlife.utah.gov/walkinaccess",
    "uplandgame":"https://wildlife.utah.gov/uplandgame",
}

# Community sources. Public, API-sanctioned or RSS only.
REDDIT_RSS = "https://www.reddit.com/r/{sub}/new/.rss"
# Utah-specific subs: take everything. General subs: only Utah-relevant posts.
REDDIT_SUBS_ALL = ["utahhunting"]
REDDIT_SUBS_FILTERED = ["Hunting", "elkhunting", "bowhunting"]
REDDIT_SUBS = REDDIT_SUBS_ALL + REDDIT_SUBS_FILTERED
REDDIT_SKIP = ["lounge", "megathread", "weekly thread", "daily thread"]
REDDIT_TERMS = ["utah", "wasatch", "boulder mountain", "fishlake", "plateau",
                "thousand lakes", "manti", "migration", "walk-in", "wia"]
# UDWR advertises an RSS endpoint but it serves the HTML page, not a feed
# (checked 2026-09-20). So the news listing is parsed directly - a public page,
# no auth wall, light polling once a day.
NEWS_PAGES = {
    "UDWR news": "https://wildlife.utah.gov/news",
}
NEWS_TERMS = ["hunt", "deer", "elk", "pheasant", "chukar", "waterfowl", "duck",
              "upland", "permit", "draw", "application", "season", "walk-in",
              "wma", "migration", "ptarmigan", "turkey", "antlerless", "board"]
# Checked by hand, not scraped - kept here so the app can link them.
MANUAL_WATCH = [
    {"name": "Utah Wildlife Network forum - Upland Game",  "url": "https://www.utahwildlife.net/forums/upland-game.16/"},
    {"name": "Utah Wildlife Network forum - Waterfowl",    "url": "https://www.utahwildlife.net/forums/waterfowl.15/"},
    {"name": "Utah Wildlife Network forum - Big Game",     "url": "https://www.utahwildlife.net/forums/big-game.13/"},
    {"name": "UDWR Hunt Planner",                          "url": "https://hunt.utah.gov/"},
    {"name": "Utah Wildlife Migration Initiative",         "url": "https://wildlife.utah.gov/wildlife-migration-initiative.html"},
    {"name": "UGRC land ownership (check before you park)","url": "https://gis.trustlands.utah.gov/mapping/"},
]
