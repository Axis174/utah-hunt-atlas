# Ranger Hawk

**Live at https://rangerhawk.com** &middot; calendar feed at https://rangerhawk.com/hunt.ics

_Formerly "Utah Hunt Atlas" (the repo keeps that slug). The name goes back to RangerHawk, a hunting and fishing community site first built in 2016._

A personal, installable phone app plus a daily data refresh for Utah hunting —
birds (pheasant, chukar, duck, ptarmigan) and big game (deer and elk, archery
through rifle) — measured from three homes: **North Salt Lake**, **Heber City**
and **Torrey**.

Not affiliated with UDWR. Always confirm against the current guidebook and the
[Utah Hunt Planner](https://hunt.utah.gov/) before you hunt.

---

## Brand

Pulled from the 2016 RangerHawk site (`~/Documents/Hunt-2026/rangerhawk-2016/`):
white RANGER**HAWK** wordmark with the hawk over the R, brand blue `#1D95CA`,
orange `#E98728`, charcoal `#2C2C2C`; the old site set type in Lato. The only
logo file that survives is a 271 x 50 pixel PNG (its own filename calls it a
placeholder). It is sharp enough for a phone header and was enlarged for the app
icon, where the edges are slightly soft. A redrawn vector logo is the fix.
Links and buttons use a darker blue, `#15709A`, because the brand blue is too
light to read as small text on white.

## Moving this to another GitHub account

`./move-to-personal.sh <username>` creates the repo under that account, pushes,
enables Pages, waits for the deploy and verifies the live URLs. Sign in first
with `gh auth login`, then `gh auth switch --user <username>`.

The app answers at the custom domain **rangerhawk.com** (DNS at Cloudflare, two
DNS-only CNAME records to `<account>.github.io`). After a move, set the custom
domain on the new repo's Pages settings and repoint both CNAME records at the new
account; the public address, the home screen icon and the calendar subscription
all stay the same.

## Setup, once

**1. Turn on GitHub Pages.** Repo *Settings → Pages → Build and deployment →
Source: **GitHub Actions***. The workflow deploys `docs/` on every run.

**2. Install the app on your phone.** Open the Pages URL in **Safari** (it must
be Safari — Chrome on iOS cannot install a PWA), then *Share → Add to Home
Screen*. It gets its own icon and works offline from then on.

**3. Subscribe to the calendar.** In the app, *Reminders → Subscribe in
Calendar*. Or by hand: iPhone *Settings → Apps → Calendar → Calendar Accounts →
Add Account → Other → Add Subscribed Calendar*, and paste
`https://<your-pages-url>/hunt.ics`.

That is the whole install. Reminders arrive through the normal calendar, so they
work whether or not you ever open the app.

---

## What it does

**Today** — the next deadline as a countdown, legal shooting light for the day,
what is open right now, the five closest places to whichever home is selected,
the Great Salt Lake level, and what is coming. **Where am I** reads the phone's
GPS and names the big game hunt boundaries you are standing in plus the closest
access points; it works with no signal once the app has been opened online.

**Access** — all 88 bird access points, searchable, sorted by real road drive
time from the selected home. Each one opens to season dates, restrictions,
required permits, contact, source and confidence, plus a National Weather
Service forecast for that spot when there is a signal.

**Map** — all of Utah, offline. Roads, dirt two-tracks (brown dashes), trails
(brown dots), water and place names, with DWR properties in green, Walk-In
Access in amber, big game hunt unit lines in purple and the access points as
dots you can tap. Tap anywhere for the property and hunt units at that spot. The
GPS button follows you with no signal. **Save map for offline** stores the 65 MB
map on the phone once; after that the map never needs a connection.

**Seasons** — every season for birds, deer, elk and turkey with live open/closed
state.

**Reminders** — calendar subscription, every deadline, and the permit checklist.

**Contacts** — the DWR offices with open questions attached, the Walk-In Access
landowners who must be phoned before you set foot on the property, and Utah's
written-permission law spelled out.

Switch homes with the **NSL / HEB / TOR** control in the header. Drive times
recompute against that home everywhere.

---

## The data

Refreshed daily at 5:15 a.m. Mountain by `.github/workflows/refresh.yml`.
Everything lands in `docs/data/`.

| File | What it is |
|---|---|
| `bird_access.json` | 88 access points, road-routed from all three homes |
| `seasons.json` | Season dates and deadlines. **Hand-maintained** from the guidebooks |
| `config.json` | Homes, contacts, landowner calls, permits, trespass law |
| `migration_utah.json` | 492 USGS ungulate migration features, Utah extent |
| `raw_*.json` | Verbatim upstream pulls, kept so diffs are auditable |
| `community.json` | UDWR news and Reddit, filtered for relevance |
| `changelog.json` | Last 60 runs: what changed, field by field |

### Sources
- UDWR 2026-27 Waterfowl, Upland Game and Turkey Guidebook
- UDWR 2026 Big Game Field Regulations and Application Guidebooks
- UDWR ArcGIS services: Walk-In Access, pheasant release areas, all public
  properties, commercial hunting areas, big game hunt boundaries
- USGS *Ungulate Migrations of the Western United States, Volume 1* — Utah
  extent: 278 elk routes, 111 mule deer routes, 56 corridors, 47 winter-range
  polygons
- UGRC county and NHD lake geometry
- Road routing: OSRM

### What the refresh actually watches
Not just "did the file change" — it diffs **specific fields** and reports them:
WIA `PrimaryPurpose`, `SeasonalClosure`, `SpecialRestrict`, `Status`; property
`closureDates` and `restrictions`; CHA `Status` and contact details; pheasant
release `Location` and `Hunt`. Guidebook PDFs are hashed, so a reissue is
flagged loudly — those need a human read, because season tables are the one
thing that must not be parsed by guesswork.

It also scans UDWR pages for the **2027 big game application window**, which is
not yet published. The two application deadlines in `seasons.json` are marked
`projected: true` and carry the 2026 dates until the real ones appear.

---

## On social media

**Facebook and Instagram are deliberately not scraped.** They are auth-walled,
their terms forbid it, and anything built on them breaks within weeks and risks
the account. What is used instead: UDWR's news page, Reddit's public feeds, and
a hand-curated watch list in the app that you check yourself.

**How Reddit is read (rebuilt 2026-09-20).** Tested that day: Reddit returns an
empty feed for any search by a logged-out reader, and allows an anonymous reader
about one request per half minute. So the job reads the newest 100 posts of six
communities, one at a time, waiting exactly as long as Reddit's own
`x-ratelimit-reset` header says. National hunting communities (r/Hunting,
r/elkhunting, r/bowhunting, r/Waterfowl) are filtered for Utah place names; Utah
communities (r/Utah, r/SaltLakeCity) are filtered for hunting words. Matches are
kept for 60 days, because most days have none. This adds about five minutes to
the daily run. r/utahhunting was dropped: its only post dates from 2022.

It is still the most fragile source here. Reddit has said its public feeds may
close, and since November 2025 a new API key needs Reddit's approval even for a
personal read-only script, under terms that are non-commercial. If the feed
dies the app loses nothing else; failures are logged in `changelog.json`.

---

## Maintaining it

**`seasons.json` is the one file you edit by hand**, and deliberately so. Season
dates and bag limits come out of a PDF that changes layout year to year; a
scraper that guessed at them would eventually be confidently wrong about a legal
limit. The job flags the reissue, a human reads the table, the file gets edited.

Run locally:

```bash
python3 scraper/refresh.py && python3 scraper/build_calendar.py
```

No dependencies — standard library only, so the Actions run cannot break on a
package upgrade.

---

## Borrowed, and why

Checked 2026-09-20 against what is current and maintained on GitHub.

| Piece | Used for | Licence |
|---|---|---|
| [SunCalc](https://github.com/mourner/suncalc) 2.0.1, vendored in `docs/vendor/` | Sunrise and sunset for legal light, offline | BSD-2-Clause |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) 5.24.0, vendored | Draws the map | BSD-3-Clause |
| [PMTiles](https://github.com/protomaps/PMTiles) 4.5.0, vendored | Reads one map file by byte range, no tile server | BSD-3-Clause |
| [Protomaps basemaps](https://github.com/protomaps/basemaps) 5.7.2 + fonts and icons, vendored | Map style; data extract `docs/maps/utah.pmtiles` | BSD-3-Clause code; map data (c) OpenStreetMap, ODbL - attribution is shown on the map and must stay |
| [USDA NRCS SNOTEL](https://wcc.sc.egov.usda.gov/awdbRestApi/swagger-ui/index.html) | Snow depth at four high-country gauges | public domain |
| [maplibre-contour](https://github.com/onthegomap/maplibre-contour) 0.1.1, vendored | Draws contour lines on the phone from elevation tiles | BSD-3-Clause |
| [Mapterhorn](https://mapterhorn.com) elevation tiles (USGS 3DEP in the US) | Contours and hill shading | open; attribution shown on the map |
| [USFS Motor Vehicle Use Map](https://www.fs.usda.gov/visit/maps/mvum) data | Which forest roads are legally open, to what, and when | public domain |
| [tippecanoe](https://github.com/felt/tippecanoe) 2.x (build tool, not shipped) | Cuts the land ownership layer into an offline map file | BSD-2-Clause |
| Ray-casting point-in-polygon (a dozen lines, inlined) | Which hunt unit am I in | public technique |
| [USGS Water Services](https://waterservices.usgs.gov/) | Great Salt Lake elevation, sites 10010000 and 10010100, parameter 62614 | public domain |
| [National Weather Service API](https://www.weather.gov/documentation/services-web-api) | Forecast per access point | public domain |

### Land ownership layer

`docs/maps/land.pmtiles` (6.5 MB) is all 16,045 parcels of the Utah Trust Lands
ownership layer - BLM, National Forest, state trust (SITLA), DWR, state parks,
National Park, refuge, military, tribal and private - cut into an offline vector
file with [tippecanoe](https://github.com/felt/tippecanoe) (BSD-2). It draws under
the roads, has a legend and an on/off button, saves offline with the basemap, and
a tap anywhere names the owner. Source, pulled 2026-09-21:
`https://gis.trustlands.utah.gov/mapping/rest/services/Land_Ownership/FeatureServer/0`.
To rebuild: page the layer to GeoJSON, reduce each parcel to a class code, then

    tippecanoe -f -o docs/maps/land.pmtiles -l land -Z5 -z12 \
      --coalesce-densest-as-needed --detect-shared-borders --simplification=4 land.geojson

**Ownership is a guide, not a survey.** Parcels are simplified, the state updates
the layer on its own schedule, and public ownership does not by itself mean open
to hunting or legally reachable. No licence text is published on the service; the
state's open-data practice is free use with credit, which the map shows.

### Legal forest roads (USFS Motor Vehicle Use Map)

`docs/maps/mvum.pmtiles` (3.4 MB) holds every road and motorized trail the Forest
Service designates as open in Utah's forests - 8,287 road segments and 1,629
trails across Uinta-Wasatch-Cache, Ashley, Fishlake, Manti-La Sal and Dixie, plus
the slivers of Sawtooth, Caribou-Targhee and Humboldt-Toiyabe inside the state.
Public domain. Pulled 2026-09-21 from
`https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer` (layer 1
roads, layer 2 trails, Utah bounding box).

Each segment carries a legal open window per vehicle class. The build keeps two:
**truck** (high clearance, else 4WD, else passenger car) and **ATV** (ATV, else
other wheeled OHV), stored as month*100+day so the map can colour a road **green
if that vehicle may be on it today, red if it is seasonally closed today, grey if
that vehicle is never allowed**. Trails draw dashed. Road numbers label from zoom
11. Tap a road for its number, name, every vehicle class and its dates, surface
and maintenance level. A Truck / ATV switch recolours the map. Date logic handles
winter windows that wrap the new year (tested).

    tippecanoe -f -o docs/maps/mvum.pmtiles -l mvum -Z7 -z12 \
      --drop-densest-as-needed --simplification=3 mvum.geojson

**The MVUM is the legal document; this is a copy of its data.** Forests publish
emergency and fire closures separately and those are not in here. A road missing
from the MVUM is closed to motor vehicles even if it exists on the ground. BLM
and state roads are not covered - this is National Forest land only.

### Terrain: contour lines and hill shading

Pre-drawn contour lines for a whole state run to hundreds of megabytes. Instead
the app carries compact elevation tiles and draws the contours on the phone with
[maplibre-contour](https://github.com/onthegomap/maplibre-contour) 0.1.1 (BSD-3);
MapLibre shades the hills from the same tiles.

- `docs/maps/terrain-utah.pmtiles` (60 MB) - all of Utah to zoom 10, about 58 m
  per pixel.
- `docs/maps/terrain-detail.pmtiles` (40 MB) - zoom 11, about 29 m per pixel, for
  two blocks: Wasatch-Uintas-Box Elder (-113.2,39.7 to -109.9,42.05) and
  Boulder-Fishlake (-112.4,37.6 to -110.8,39.0).

Both are extracts of [Mapterhorn](https://mapterhorn.com) (terrarium encoding,
512 px WebP tiles; in the US the source is USGS 3DEP, public domain; Mapterhorn
asks for the attribution link the map shows). Outside the two detail blocks the
app cuts the zoom-10 parent tile into its quadrant and doubles it with smoothing
off - smoothing would blend the colour channels separately and corrupt the
encoded heights. Checked 2026-09-21: Kings Peak reads 13,465 ft (true 13,528),
Timpanogos 11,654 (11,752), Moab 4,032 (about 4,026); the fallback path returns
the same heights as its parent.

Contour interval by zoom: 200 ft (index 1,000) at zoom 11, 100 ft (index 500) at
12-13, 50 ft (index 250) from 14. Labels in feet on index lines. **The 50 ft lines
are interpolated from 29-58 m data: good for reading the shape of the country,
not for judging a cliff band.** Terrain is a separate, optional 100 MB download
("Save terrain") and has its own on/off chip.

    pmtiles extract https://download.mapterhorn.com/planet.pmtiles docs/maps/terrain-utah.pmtiles \
      --bbox=-114.1,36.95,-109.0,42.05 --maxzoom=10
    pmtiles extract https://download.mapterhorn.com/planet.pmtiles docs/maps/terrain-detail.pmtiles \
      --region=detail-blocks.geojson --minzoom=11 --maxzoom=11

Zoom 12 (15 m) would be sharper but is 598 MB statewide; a single hunting block
at zoom 12 is about 45 MB and could be added the same way.

### Rebuilding the map file

`docs/maps/utah.pmtiles` is a one-off extract, not part of the daily job (roads
do not change daily, and every rebuild adds 65 MB to the repo history). To
refresh it, once a year is plenty:

    brew install pmtiles
    pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles docs/maps/utah.pmtiles \
      --bbox=-114.1,36.95,-109.0,42.05 --maxzoom=13

Zoom 13 was chosen by test: dirt tracks and trails are already in the data at
12-13, all of Utah is 65 MB, and zoom 14 would be 141 MB - over GitHub's 100 MB
file limit. The service worker answers the map's byte-range reads from the saved
copy, which lives in its own cache so an app update never discards it.

Looked at and deliberately left out: **Open-Meteo** (its free tier is
non-commercial only); **Turf.js** (half a megabyte to do one point-in-polygon
test); **Workbox** (needs a build step this app does not have); and the one open
hunting-regulation dataset on GitHub, which was archived in 2018.

Legal light is computed for Salt Lake City, which is what UDWR's own table uses,
and rounded to the safe side. Checked against the 2026-27 guidebook table: it
matches to the minute. The guidebook shifts a few minutes by county and remains
the legal authority.

## Worth adding next (checked 2026-09-20, not built)

- **UDOT mountain pass status** (Mirror Lake Highway closure) - free, but needs a
  UDOT developer key.
- **eBird** recent sightings - free key, but the terms are non-commercial.
- **[PWABuilder](https://github.com/pwa-builder/PWABuilder)** - packages this exact
  app for the App Store and Play Store when the time comes, without a rewrite.

## Known gaps

- Hunt unit shapes are simplified to about 200 m and overlap by hunt type. Near a
  boundary, the Utah Hunt Planner and the permit govern.

- Home anchors are town-level on purpose. Drive times were computed from a
  street-level point and stored as minutes, not coordinates.
- Six large marsh units are mapped at property centroids, so routing runs the
  last miles down dike roads and overstates the drive. Those show a range.
- Chukar range points are approximate range centroids, **not parking areas**.
- Blackhawk WMA's 2026-27 status is unconfirmed — UDWR's layer still carries
  stale 2025-26 closure text.
- The Deer Creek retriever-dog restriction is forum-sourced, unverified.
