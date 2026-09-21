#!/usr/bin/env python3
"""Generate hunt.ics - the calendar feed the iPhone subscribes to.

Emits three kinds of entry:
  * All-day spans for each season (so you can see what's open at a glance).
  * Timed VALARM reminders ahead of every deadline, at each lead time.
  * Landowner-call tasks as dated events with the phone context in the body.

Subscribed once in iOS Settings > Calendar > Accounts > Add Subscribed Calendar,
it refreshes itself. No push server, no app permissions, and it keeps working
whether or not the app is ever opened.
"""
import json, os
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "docs", "data")
OUT = os.path.join(ROOT, "docs", "hunt.ics")

S = json.load(open(os.path.join(DATA, "seasons.json")))
C = json.load(open(os.path.join(DATA, "config.json")))
STAMP = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(t):
    return (str(t).replace("\\", "\\\\").replace(";", r"\;")
            .replace(",", r"\,").replace("\n", r"\n"))


def fold(line):
    """RFC 5545 caps lines at 75 octets."""
    b = line.encode("utf-8")
    if len(b) <= 73:
        return line
    out, cur = [], b""
    for ch in line:
        e = ch.encode("utf-8")
        if len(cur) + len(e) > 73:
            out.append(cur.decode("utf-8")); cur = b" "
        cur += e
    out.append(cur.decode("utf-8"))
    return "\r\n".join(out)


L = ["BEGIN:VCALENDAR", "VERSION:2.0",
     "PRODID:-//ranger-hawk//Pete Busch//EN",
     "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
     "X-WR-CALNAME:Ranger Hawk",
     "X-WR-CALDESC:Seasons, permit deadlines and access contacts for Utah hunting",
     "X-PUBLISHED-TTL:PT12H", "REFRESH-INTERVAL;VALUE=DURATION:PT12H"]


def ev(uid, start, end, summary, desc, alarms=(), allday=True, cat="SEASON"):
    L.append("BEGIN:VEVENT")
    L.append(f"UID:{uid}@utah-hunt-atlas")
    L.append(f"DTSTAMP:{STAMP}")
    if allday:
        L.append("DTSTART;VALUE=DATE:" + start.strftime("%Y%m%d"))
        L.append("DTEND;VALUE=DATE:" + (end + timedelta(days=1)).strftime("%Y%m%d"))
    else:
        L.append("DTSTART:" + start.strftime("%Y%m%dT%H%M%S"))
        L.append("DTEND:" + end.strftime("%Y%m%dT%H%M%S"))
    L.append(fold("SUMMARY:" + esc(summary)))
    L.append(fold("DESCRIPTION:" + esc(desc)))
    L.append(f"CATEGORIES:{cat}")
    L.append("TRANSP:TRANSPARENT")
    for days, label in alarms:
        L.append("BEGIN:VALARM")
        L.append("ACTION:DISPLAY")
        L.append(fold("DESCRIPTION:" + esc(label)))
        L.append(f"TRIGGER:-P{days}D" if days else "TRIGGER:-PT9H")
        L.append("END:VALARM")
    L.append("END:VEVENT")


GROUP = {"bird": "Bird", "deer": "Deer", "elk": "Elk", "turkey": "Turkey"}

# ---- season spans -----------------------------------------------------------
for s in S["seasons"]:
    a = date.fromisoformat(s["start"]); b = date.fromisoformat(s["end"])
    body = []
    if s.get("bag"):    body.append("Limit: " + s["bag"])
    if s.get("area"):   body.append("Area: " + s["area"])
    if s.get("permit"): body.append("Needs: " + s["permit"])
    if s.get("note"):   body.append("Note: " + s["note"])
    body.append("Source: " + S["_source"])
    ev(f"season-{s['id']}", a, b,
       f"{GROUP.get(s['group'], s['group']).upper()}: {s['name']}",
       "\n".join(body),
       alarms=[(3, f"{s['name']} opens in 3 days")],
       cat="SEASON")

# ---- deadlines --------------------------------------------------------------
KIND = {"application": "APPLY", "permit": "PERMIT", "closure": "CLOSES",
        "task": "TO DO", "season-close": "LAST DAY", "reporting": "REPORT"}
for d in S["deadlines"]:
    day = date.fromisoformat(d["date"])
    alarms = [(n, f"{d['title']} - {n} day{'s' if n != 1 else ''} out") for n in d.get("lead_days", [7])]
    alarms.append((0, d["title"]))
    body = d["detail"]
    if d.get("projected"):
        body = ("PROJECTED DATE - not yet confirmed by UDWR. The refresh job watches "
                "for the official announcement and will correct this.\n\n") + body
    ev(f"deadline-{d['id']}", day, day,
       f"[{KIND.get(d['kind'], 'NOTE')}] {d['title']}", body,
       alarms=alarms, cat="DEADLINE")

# ---- landowner calls --------------------------------------------------------
for i, w in enumerate(C.get("wia_landowner_calls", [])):
    day = date(2026, 10, 12) + timedelta(days=i)
    ev(f"wia-call-{i}", day, day,
       f"[CALL] {w['property']} WIA landowner",
       (f"{w['property']} - {w['county']} County, {w['acres']} acres.\n"
        f"{w['requirement']}\n{w.get('contact','')}\n"
        f"Coordinates: {w['lat']}, {w['lon']}\n\n"
        "Call before the Nov 7 pheasant opener - these take a week of phone tag in season."),
       alarms=[(7, f"Call {w['property']} landowner next week"), (0, f"Call {w['property']} landowner today")],
       cat="TASK")

# ---- DWR calls that are still open questions --------------------------------
for i, c in enumerate([c for c in C["contacts"] if c.get("priority") == "high"]):
    day = date(2026, 9, 28) + timedelta(days=i)
    ev(f"dwr-call-{i}", day, day, f"[CALL] {c['name']} - {c['phone']}",
       f"{c['why']}\n\nPhone: {c['phone']}",
       alarms=[(2, f"Call {c['name']}"), (0, f"Call {c['name']} today")], cat="TASK")

L.append("END:VCALENDAR")
open(OUT, "w", newline="").write("\r\n".join(L) + "\r\n")

n = sum(1 for x in L if x == "BEGIN:VEVENT")
print(f"wrote {OUT} - {n} events, {os.path.getsize(OUT)} bytes")
