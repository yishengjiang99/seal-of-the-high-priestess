#!/usr/bin/env python3
"""Game Center for Temple of the High Priestess. Idempotent; creates/updates only, never deletes.

  1. GAME_CENTER capability on the App ID (bundle com.ragnus.weather)
  2. Game Center detail for the app
  3. achievements from ios/GameCenter/gamecenter.json (+ en-US localization + 512px image)
  4. boss-time leaderboards (elapsed time, lowest wins) + en-US localization
Env: APP_STORE_CONNECT_*, ASC_APP_ID, [BUNDLE_ID]
"""
import hashlib, json, os, sys

from asc_common import APP, BUNDLE_ID, api, get_all, must, upload_asset

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
GC = json.load(open(os.path.join(ROOT, "ios/GameCenter/gamecenter.json")))
problems = []


def step(label, fn):
    try:
        return fn()
    except Exception as e:
        problems.append(f"{label}: {e}")
        print("::warning::", label, e)


# 1. capability
def capability():
    b = [x for x in must("GET", f"/v1/bundleIds?filter[identifier]={BUNDLE_ID}&filter[platform]=IOS&include=bundleIdCapabilities")["data"]
         if x["attributes"]["identifier"] == BUNDLE_ID][0]
    caps = [c["attributes"]["capabilityType"] for c in must("GET", f"/v1/bundleIds/{b['id']}/bundleIdCapabilities")["data"]]
    if "GAME_CENTER" in caps:
        print("capability GAME_CENTER already enabled", caps); return
    st, d = api("POST", "/v1/bundleIdCapabilities", {"data": {"type": "bundleIdCapabilities", "attributes": {"capabilityType": "GAME_CENTER"},
                "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": b["id"]}}}}})
    if st not in (200, 201):
        raise RuntimeError(f"enable GAME_CENTER -> {st}: {d.get('error', '')[:800]}")
    print("capability GAME_CENTER enabled (existing App Store profiles for this App ID need regenerating; CI does that)")


step("capability", capability)

# 2. detail
st, d = api("GET", f"/v1/apps/{APP}/gameCenterDetail")
detail = d.get("data") if st == 200 else None
if not detail:
    st, d = api("POST", "/v1/gameCenterDetails", {"data": {"type": "gameCenterDetails",
                "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})
    if st not in (200, 201):
        print(f"::error::create gameCenterDetail -> {st}: {d.get('error', '')[:1500]}")
        sys.exit(1)
    detail = d["data"]
    print("Game Center enabled for the app:", detail["id"])
else:
    print("Game Center detail:", detail["id"])
DID = detail["id"]


def ensure_image(loc_id, path):
    st, d = api("GET", f"/v1/gameCenterAchievementLocalizations/{loc_id}/gameCenterAchievementImage")
    if st == 200 and d.get("data"):
        state = (d["data"]["attributes"].get("assetDeliveryState") or {}).get("state")
        if state in ("COMPLETE", "UPLOAD_COMPLETE"):
            return "present"
        return f"existing image in state {state}"
    data = open(path, "rb").read()
    res = must("POST", "/v1/gameCenterAchievementImages", {"data": {"type": "gameCenterAchievementImages",
               "attributes": {"fileName": os.path.basename(path), "fileSize": len(data)},
               "relationships": {"gameCenterAchievementLocalization": {"data": {"type": "gameCenterAchievementLocalizations", "id": loc_id}}}}},
               what="reserve achievement image")["data"]
    upload_asset(res, data)
    must("PATCH", f"/v1/gameCenterAchievementImages/{res['id']}", {"data": {"type": "gameCenterAchievementImages", "id": res["id"],
         "attributes": {"uploaded": True}}}, what="commit achievement image")
    return "uploaded"


# 3. achievements
have = {a["attributes"]["vendorIdentifier"]: a for a in get_all(f"/v1/gameCenterDetails/{DID}/gameCenterAchievements?limit=200")}
for a in GC["achievements"]:
    def one(a=a):
        attrs = {"referenceName": a["name"], "points": a["points"], "showBeforeEarned": not a["hidden"], "repeatable": False}
        cur = have.get(a["id"])
        if cur:
            diff = {k: v for k, v in attrs.items() if cur["attributes"].get(k) != v}
            if diff:
                st, d = api("PATCH", f"/v1/gameCenterAchievements/{cur['id']}", {"data": {"type": "gameCenterAchievements", "id": cur["id"], "attributes": diff}})
                print(f"  {a['id']}: patch {list(diff)} -> {st}")
        else:
            cur = must("POST", "/v1/gameCenterAchievements", {"data": {"type": "gameCenterAchievements",
                       "attributes": {"vendorIdentifier": a["id"], **attrs},
                       "relationships": {"gameCenterDetail": {"data": {"type": "gameCenterDetails", "id": DID}}}}}, what=f"create {a['id']}")["data"]
            print(f"  {a['id']}: created")
        locs = get_all(f"/v1/gameCenterAchievements/{cur['id']}/localizations?limit=20")
        en = next((l for l in locs if l["attributes"].get("locale") == "en-US"), None)
        lattrs = {"name": a["name"], "beforeEarnedDescription": a["before"], "afterEarnedDescription": a["after"]}
        if not en:
            en = must("POST", "/v1/gameCenterAchievementLocalizations", {"data": {"type": "gameCenterAchievementLocalizations",
                      "attributes": {"locale": "en-US", **lattrs},
                      "relationships": {"gameCenterAchievement": {"data": {"type": "gameCenterAchievements", "id": cur["id"]}}}}}, what="achievement localization")["data"]
        elif any(en["attributes"].get(k) != v for k, v in lattrs.items()):
            must("PATCH", f"/v1/gameCenterAchievementLocalizations/{en['id']}", {"data": {"type": "gameCenterAchievementLocalizations", "id": en["id"], "attributes": lattrs}})
        img = ensure_image(en["id"], os.path.join(ROOT, "ios/GameCenter/images", a["id"].split(".")[-1] + ".png"))
        print(f"  {a['id']}: {a['points']} pts, localization ok, image {img}")
    step(a["id"], one)

# 4. leaderboards
dflt = GC["leaderboardDefaults"]
haveLb = {l["attributes"]["vendorIdentifier"]: l for l in get_all(f"/v1/gameCenterDetails/{DID}/gameCenterLeaderboards?limit=200")}
for lb in GC["leaderboards"]:
    def one(lb=lb):
        cur = haveLb.get(lb["id"])
        if not cur:
            cur = must("POST", "/v1/gameCenterLeaderboards", {"data": {"type": "gameCenterLeaderboards", "attributes": {
                "referenceName": lb["name"], "vendorIdentifier": lb["id"], "defaultFormatter": dflt["formatter"],
                "submissionType": dflt["submission"], "scoreSortType": dflt["sort"],
                "scoreRangeStart": str(dflt["rangeStart"]), "scoreRangeEnd": str(dflt["rangeEnd"])},
                "relationships": {"gameCenterDetail": {"data": {"type": "gameCenterDetails", "id": DID}}}}}, what=f"create {lb['id']}")["data"]
            print(f"  {lb['id']}: created")
        locs = get_all(f"/v1/gameCenterLeaderboards/{cur['id']}/localizations?limit=20")
        if not any(l["attributes"].get("locale") == "en-US" for l in locs):
            must("POST", "/v1/gameCenterLeaderboardLocalizations", {"data": {"type": "gameCenterLeaderboardLocalizations",
                 "attributes": {"locale": "en-US", "name": lb["name"]},
                 "relationships": {"gameCenterLeaderboard": {"data": {"type": "gameCenterLeaderboards", "id": cur["id"]}}}}}, what="leaderboard localization")
        print(f"  {lb['id']}: ok ({dflt['formatter']}, {dflt['sort']})")
    step(lb["id"], one)

print("\n=== state ===")
for a in get_all(f"/v1/gameCenterDetails/{DID}/gameCenterAchievements?limit=200"):
    x = a["attributes"]; print("achievement", x["vendorIdentifier"], x.get("points"), "archived=", x.get("archived"))
for l in get_all(f"/v1/gameCenterDetails/{DID}/gameCenterLeaderboards?limit=200"):
    x = l["attributes"]; print("leaderboard", x["vendorIdentifier"], x.get("defaultFormatter"), x.get("scoreSortType"))
if problems:
    print("\nPROBLEMS:"); [print(" -", p) for p in problems]; sys.exit(1)
print("Game Center OK")
