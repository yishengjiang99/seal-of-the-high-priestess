#!/usr/bin/env python3
"""Ship Game Center with App Store version VERSION_STRING (public ASC API, Apple tech talk 111377).
  1. gameCenterAppVersion (enabled=true) related to the appStoreVersion  (POST /v1/gameCenterAppVersions)
  2. one gameCenterAchievementRelease per achievement                   (POST /v1/gameCenterAchievementReleases)
  3. one gameCenterLeaderboardRelease per leaderboard                    (POST /v1/gameCenterLeaderboardReleases)
Idempotent, creates only, never deletes. DRY_RUN=1 prints only.
"""
import os, sys
from asc_common import APP, api, get_all, must, editable_version

VERSION = os.environ.get("VERSION_STRING", "1.0").strip()
DRY = os.environ.get("DRY_RUN", "1") != "0"
v = editable_version()
if not v or v["attributes"]["versionString"] != VERSION:
    sys.exit(f"::error::no editable version {VERSION}")
DID = must("GET", f"/v1/apps/{APP}/gameCenterDetail")["data"]["id"]
print("version", VERSION, v["id"], v["attributes"]["appStoreState"], "gameCenterDetail", DID, "dry" if DRY else "LIVE")
fail = []

st, d = api("GET", f"/v1/appStoreVersions/{v['id']}/gameCenterAppVersion")
gav = d.get("data") if st == 200 else None
print("gameCenterAppVersion on version ->", st, gav and (gav["id"], gav["attributes"]))
if not gav and not DRY:
    st, d = api("POST", "/v1/gameCenterAppVersions", {"data": {"type": "gameCenterAppVersions", "attributes": {"enabled": True},
                "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": v["id"]}}}}})
    print("create gameCenterAppVersion ->", st, d.get("data", {}).get("id") if st < 300 else str(d)[:1500])
    if st >= 300: fail.append("gameCenterAppVersion")
elif gav and not gav["attributes"].get("enabled") and not DRY:
    st, d = api("PATCH", f"/v1/gameCenterAppVersions/{gav['id']}", {"data": {"type": "gameCenterAppVersions", "id": gav["id"], "attributes": {"enabled": True}}})
    print("enable gameCenterAppVersion ->", st, "" if st < 300 else str(d)[:1500])
    if st >= 300: fail.append("enable gameCenterAppVersion")

for kind, rel, typ in (("Achievement", "gameCenterAchievement", "gameCenterAchievements"),
                       ("Leaderboard", "gameCenterLeaderboard", "gameCenterLeaderboards")):
    objs = get_all(f"/v1/gameCenterDetails/{DID}/{typ}?limit=200")
    st, d = api("GET", f"/v1/gameCenterDetails/{DID}/{rel}Releases?include={rel}&limit=200")
    released = {(r.get("relationships", {}).get(rel, {}).get("data") or {}).get("id") for r in (d.get("data") or [])} if st < 300 else set()
    print(f"{kind}s: {len(objs)}; existing releases ->", st, len(released))
    for o in objs:
        vid = o["attributes"]["vendorIdentifier"]
        if o["attributes"].get("archived"):
            print("  skip archived", vid); continue
        if o["id"] in released:
            print("  released", vid); continue
        if DRY:
            print("  would release", vid); continue
        st, d = api("POST", f"/v1/{rel}Releases", {"data": {"type": f"{rel}Releases", "relationships": {
                    "gameCenterDetail": {"data": {"type": "gameCenterDetails", "id": DID}},
                    rel: {"data": {"type": typ, "id": o["id"]}}}}})
        ok = st < 300 or "ALREADY" in str(d).upper()
        print("  release", vid, "->", st, "" if st < 300 else str(d)[:800])
        if not ok: fail.append(vid)
if fail:
    sys.exit(f"::error::Game Center release failures: {fail}")
print("GAME CENTER RELEASE OK" if not DRY else "DRY RUN done")
