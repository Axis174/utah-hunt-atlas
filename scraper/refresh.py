#!/usr/bin/env python3
"""Refresh every dataset the atlas uses, and report what changed.

Writes docs/data/*.json and docs/data/changelog.json. Designed to run headless
in GitHub Actions on a cron. Never fails the build on a single bad source - it
records the failure and carries on, because a dead upstream should not blank
out the app.
"""
import hashlib, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sources as S

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "docs", "data")
UA = {"User-Agent": "utah-hunt-atlas/1.0 (personal hunting reference; contact via repo)"}
os.makedirs(DATA, exist_ok=True)

report = {"run": datetime.now(timezone.utc).isoformat(timespec="seconds"),
          "changes": [], "errors": [], "ok": []}


def get(url, tries=3, timeout=120, backoff=2):
    """Fetch with retries. 429 gets a much longer wait - Reddit in particular
    rate-limits hard and a tight retry just burns the budget."""
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 429:
                time.sleep(20 * (i + 1))
            elif e.code in (400, 404):
                raise                      # a bad URL will not fix itself
            else:
                time.sleep(backoff * (i + 1))
        except Exception as e:            # noqa: BLE001 - upstream can fail any way
            last = e
            time.sleep(backoff * (i + 1))
    raise last


def arcgis_query(base, where="1=1", geometry=True, bbox=None, out_sr=4326, offset=0):
    # f=geojson REQUIRES geometry; asking for geojson with returnGeometry=false
    # is a 400. Use Esri json for attribute-only pulls and normalise the shape.
    fmt = "geojson" if geometry else "json"
    p = {"where": where, "outFields": "*", "returnGeometry": str(geometry).lower(),
         "outSR": out_sr, "f": fmt, "resultOffset": offset,
         "resultRecordCount": 2000}
    if bbox:
        p.update({"geometry": bbox, "geometryType": "esriGeometryEnvelope",
                  "inSR": 4326, "spatialRel": "esriSpatialRelIntersects"})
    raw = json.loads(get(base + "/query?" + urllib.parse.urlencode(p)))
    if fmt == "json":
        if "error" in raw:
            raise RuntimeError(str(raw["error"])[:200])
        raw = {"type": "FeatureCollection",
               "features": [{"type": "Feature", "geometry": None,
                             "properties": f.get("attributes", {})}
                            for f in raw.get("features", [])],
               "exceededTransferLimit": raw.get("exceededTransferLimit", False)}
    return raw


def fetch_all(base, **kw):
    """Page through a layer until it stops handing back features."""
    feats, offset = [], 0
    while True:
        gj = arcgis_query(base, offset=offset, **kw)
        batch = gj.get("features", [])
        feats.extend(batch)
        if len(batch) < 2000 or not gj.get("exceededTransferLimit"):
            break
        offset += len(batch)
    return {"type": "FeatureCollection", "features": feats}


def digest(obj):
    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:16]


def load_prev(name):
    p = os.path.join(DATA, name)
    if os.path.exists(p):
        try:
            return json.load(open(p))
        except Exception:
            return None
    return None


def save(name, obj):
    json.dump(obj, open(os.path.join(DATA, name), "w"), separators=(",", ":"))


def watch_diff(key, prev, cur, watch_fields, id_field=None):
    """Field-level diff so the changelog says WHAT changed, not just 'changed'."""
    if not prev or not watch_fields:
        return []
    def index(fc):
        out = {}
        for f in fc.get("features", []):
            pr = f.get("properties", {})
            k = pr.get(id_field) if id_field else None
            if k is None:
                k = pr.get("name") or pr.get("Name") or pr.get("CHA_Name") \
                    or pr.get("Boundary_Name") or pr.get("Location")
            if k is None:
                continue
            out[str(k)] = pr
        return out
    a, b = index(prev), index(cur)
    notes = []
    for k in sorted(set(b) - set(a)):
        notes.append({"type": "added", "item": k})
    for k in sorted(set(a) - set(b)):
        notes.append({"type": "removed", "item": k})
    for k in sorted(set(a) & set(b)):
        for fld in watch_fields:
            if str(a[k].get(fld, "")) != str(b[k].get(fld, "")):
                notes.append({"type": "changed", "item": k, "field": fld,
                              "from": str(a[k].get(fld, ""))[:180],
                              "to": str(b[k].get(fld, ""))[:180]})
    return notes


# ---------------------------------------------------------------- ArcGIS ----
for key, spec in S.ARCGIS.items():
    name = f"raw_{key}.json"
    try:
        cur = fetch_all(spec["url"], geometry=spec.get("geometry", True))
        if not cur["features"] and spec.get("optional"):
            report["errors"].append({"source": key, "error": "empty (optional)"})
            continue
        prev = load_prev(name)
        notes = watch_diff(key, prev, cur, spec.get("watch", []))
        if prev is None:
            report["ok"].append({"source": key, "features": len(cur["features"]), "first_run": True})
        elif digest(prev) != digest(cur):
            report["changes"].append({"source": key, "desc": spec["desc"],
                                      "features": len(cur["features"]), "detail": notes[:40]})
        else:
            report["ok"].append({"source": key, "features": len(cur["features"])})
        save(name, cur)
    except Exception as e:                # noqa: BLE001
        report["errors"].append({"source": key, "error": repr(e)[:300]})

# Probe for a newer pheasant-release layer year (UDWR renames it annually).
try:
    yr = datetime.now().year
    for y in (yr + 1, yr):
        u = ("https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services"
             f"/{y}_Pheasant_Release_Areas_view/FeatureServer/0")
        try:
            meta = json.loads(get(u + "?f=json", tries=1, timeout=40))
            if meta.get("name"):
                report["ok"].append({"source": "pheasant_release_probe",
                                     "found_year": y, "layer": meta.get("name")})
                break
        except Exception:
            continue
except Exception as e:                    # noqa: BLE001
    report["errors"].append({"source": "pheasant_release_probe", "error": repr(e)[:200]})

# ------------------------------------------------------------- migration ----
mig = {"type": "FeatureCollection", "features": []}
for lname, lid in S.MIGRATION_LAYERS.items():
    try:
        fc = fetch_all(f"{S.MIGRATION_BASE}/{lid}", bbox=S.UTAH_BBOX)
        for f in fc["features"]:
            f.setdefault("properties", {})["_layer"] = lname
        mig["features"].extend(fc["features"])
        report["ok"].append({"source": f"migration:{lname}", "features": len(fc["features"])})
    except Exception as e:                # noqa: BLE001
        report["errors"].append({"source": f"migration:{lname}", "error": repr(e)[:300]})
if mig["features"]:
    prev = load_prev("migration_utah.json")
    if prev and digest(prev) != digest(mig):
        report["changes"].append({"source": "migration_utah",
                                  "desc": "USGS ungulate migration layers (Utah extent)",
                                  "features": len(mig["features"]), "detail": []})
    # Thin it. The raw pull is ~6 MB, which is too heavy to commit daily and far
    # too heavy to hand a phone. 4 decimal places is ~11 m - well inside the
    # precision of a collar-derived corridor - and we keep only the layer tag.
    def thin(coords):
        if isinstance(coords[0], (int, float)):
            return [round(coords[0], 4), round(coords[1], 4)]
        return [thin(c) for c in coords]
    slim = {"type": "FeatureCollection", "_source":
            "USGS Ungulate Migrations of the Western United States, Volume 1 (Utah extent)",
            "_note": "Coordinates rounded to 4 dp (~11 m).", "features": []}
    for f in mig["features"]:
        g = f.get("geometry")
        if not g or not g.get("coordinates"):
            continue
        slim["features"].append({
            "type": "Feature",
            "geometry": {"type": g["type"], "coordinates": thin(g["coordinates"])},
            "properties": {"layer": f["properties"].get("_layer")}})
    save("migration_utah.json", slim)

# ------------------------------------------------------------------ PDFs ----
hashes = load_prev("pdf_hashes.json") or {}
new_hashes = {}
for key, url in S.PDFS.items():
    try:
        b = get(url)
        h = hashlib.sha256(b).hexdigest()[:16]
        new_hashes[key] = {"sha": h, "bytes": len(b), "url": url}
        old = (hashes.get(key) or {}).get("sha")
        if old and old != h:
            report["changes"].append({
                "source": f"pdf:{key}", "desc": "GUIDEBOOK REISSUED - season tables need a human read",
                "detail": [{"type": "changed", "item": key, "field": "sha",
                            "from": old, "to": h}]})
        elif not old:
            report["ok"].append({"source": f"pdf:{key}", "first_run": True})
        else:
            report["ok"].append({"source": f"pdf:{key}"})
    except Exception as e:                # noqa: BLE001
        report["errors"].append({"source": f"pdf:{key}", "error": repr(e)[:300]})
if new_hashes:
    save("pdf_hashes.json", new_hashes)

# --------------------------------------------------- 2027 application watch --
app_hits = []
for key, url in S.WATCH_PAGES.items():
    try:
        html = get(url, timeout=60).decode("utf-8", "ignore")
        txt = re.sub(r"<[^>]+>", " ", html)
        for m in re.finditer(
            r"application period[^.]{0,160}?(20\d\d)|"
            r"(?:applications?|apply)[^.]{0,80}?"
            r"((?:Jan|Feb|March|Mar|April|Apr|May|June|Jun)[a-z]*\.?\s+\d{1,2})[^.]{0,60}?20(2[7-9])",
            txt, re.I):
            app_hits.append({"page": key, "snippet": " ".join(m.group(0).split())[:200]})
    except Exception as e:                # noqa: BLE001
        report["errors"].append({"source": f"watch:{key}", "error": repr(e)[:200]})
save("application_watch.json", {"checked": report["run"], "hits": app_hits[:30]})

# ------------------------------------------------------------- community ----
community = []
for sub in S.REDDIT_SUBS:
    # Reddit's .json API returns 403 to unauthenticated clients (and hard-blocks
    # datacenter IPs). The public Atom feed still serves, so use that.
    try:
        xml = get(S.REDDIT_RSS.format(sub=sub), timeout=60).decode("utf-8", "ignore")
        for m in re.finditer(r"<entry>(.*?)</entry>", xml, re.S):
            it = m.group(1)
            t = re.search(r"<title[^>]*>(.*?)</title>", it, re.S)
            l = re.search(r'<link[^>]*href="([^"]+)"', it)
            u = re.search(r"<updated>(.*?)</updated>", it, re.S)
            if not (t and l):
                continue
            title = re.sub(r"<[^>]+>", "", t.group(1)).strip()
            low = title.lower()
            if any(s in low for s in getattr(S, "REDDIT_SKIP", [])):
                continue
            if sub in getattr(S, "REDDIT_SUBS_FILTERED", []) and \
               not any(term in low for term in S.REDDIT_TERMS):
                continue
            community.append({"source": f"r/{sub}", "title": title[:220],
                              "url": l.group(1),
                              "created": (u.group(1).strip() if u else ""), "score": 0})
        time.sleep(8)
    except Exception as e:                # noqa: BLE001
        report["errors"].append({"source": f"reddit:{sub}", "error": repr(e)[:200]})
for nm, url in S.NEWS_PAGES.items():
    try:
        html = get(url, timeout=60).decode("utf-8", "ignore")
        seen = set()
        for path, label in re.findall(
                r'href="(/news/(\d{4})/(\d{2})/(\d{2})/[^"#?]+)"[^>]*>(.*?)</a>',
                html, re.S) and re.findall(
                r'href="(/news/\d{4}/\d{2}/\d{2}/[^"#?]+)"[^>]*>(.*?)</a>', html, re.S):
            title = " ".join(re.sub(r"<[^>]+>", "", label).split())
            if not title or path in seen:
                continue
            seen.add(path)
            if not any(t in title.lower() for t in S.NEWS_TERMS):
                continue
            d = re.search(r"/news/(\d{4})/(\d{2})/(\d{2})/", path)
            community.append({
                "source": nm, "title": title[:220],
                "url": "https://wildlife.utah.gov" + path,
                "created": f"{d.group(1)}-{d.group(2)}-{d.group(3)}" if d else "",
                "score": 0})
    except Exception as e:                # noqa: BLE001
        report["errors"].append({"source": f"news:{nm}", "error": repr(e)[:200]})
community.sort(key=lambda x: x.get("created", ""), reverse=True)
save("community.json", {"checked": report["run"], "items": community[:120],
                        "manual_watch": S.MANUAL_WATCH,
                        "policy": "Official sources, Reddit's public API and RSS only. "
                                  "Facebook and Instagram are deliberately excluded: they are "
                                  "auth-walled, their terms forbid scraping, and anything built "
                                  "on them breaks within weeks."})

# ---------------------------------------------------------------- report ----
log = load_prev("changelog.json") or {"runs": []}
log["runs"].insert(0, report)
log["runs"] = log["runs"][:60]
save("changelog.json", log)

print(f"changes={len(report['changes'])} ok={len(report['ok'])} errors={len(report['errors'])}")
for c in report["changes"]:
    print("  CHANGED:", c["source"], "-", c.get("desc", ""))
for e in report["errors"]:
    print("  ERROR:  ", e["source"], "-", e["error"][:120])
