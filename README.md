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

Reddit rate-limits and sometimes blocks datacenter IPs, so it may fail from
Actions. It fails gracefully and is recorded in `changelog.json`. To make it
reliable, register a Reddit OAuth app and add the credentials as repo secrets.

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
| Ray-casting point-in-polygon (a dozen lines, inlined) | Which hunt unit am I in | public technique |
| [USGS Water Services](https://waterservices.usgs.gov/) | Great Salt Lake elevation, sites 10010000 and 10010100, parameter 62614 | public domain |
| [National Weather Service API](https://www.weather.gov/documentation/services-web-api) | Forecast per access point | public domain |

Looked at and deliberately left out: **MapLibre GL + Protomaps PMTiles** (the right
way to add an offline map, but a project of its own - a northern Utah basemap
extract has to be built and size-tested first); **Open-Meteo** (its free tier is
non-commercial only); **Turf.js** (half a megabyte to do one point-in-polygon
test); **Workbox** (needs a build step this app does not have); and the one open
hunting-regulation dataset on GitHub, which was archived in 2018.

Legal light is computed for Salt Lake City, which is what UDWR's own table uses,
and rounded to the safe side. Checked against the 2026-27 guidebook table: it
matches to the minute. The guidebook shifts a few minutes by county and remains
the legal authority.

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
