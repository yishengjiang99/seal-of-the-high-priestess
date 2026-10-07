#!/usr/bin/env python3
"""In-app purchases for Temple of the High Priestess (ASC app ASC_APP_ID). Idempotent.

For each product in PRODUCTS (all NON_CONSUMABLE, Family Sharing on):
  1. find or create the IAP (POST /v2/inAppPurchases)
  2. en-US localization (name <= 30, description <= 45 chars)
  3. price schedule with base territory USA at the listed USD tier (App Store equalizes other storefronts)
  4. availability: every territory the app can ship in, plus future territories
  5. App Review screenshot (REVIEW_SCREENSHOT, a PNG of the paywall), uploaded once
Then points App Store Server Notifications v2 (production + sandbox) at our server.
Never submits anything for review and never deletes anything. Prints a final state table.
Env: APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_API_KEY_P8, ASC_APP_ID,
     [REVIEW_SCREENSHOT], [ASSN_URL], [DRY_RUN=1]
"""
import hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request

import jwt

APP = os.environ["ASC_APP_ID"].strip()
P8 = os.environ["APP_STORE_CONNECT_API_KEY_P8"].replace("\\n", "\n").strip()
SHOT = (os.environ.get("REVIEW_SCREENSHOT") or "").strip()
ASSN = (os.environ.get("ASSN_URL") or "https://grepawk.com/high-priestess/api/v1/iap/notifications").strip()
DRY = os.environ.get("DRY_RUN") == "1"

REVIEW_NOTE = ("Non-consumable unlock. The prologue and region 1 are free; when the player tries to leave the "
               "Whispering Forest after defeating the Hollow Oak (or taps Menu > System > Unlock the Full Game, or "
               "Settings (gear icon) > Unlock the Full Game) the paywall appears. Restore Purchases is in Settings "
               "and on the paywall. Purchases are verified on our server (App Store Server Notifications v2 at "
               + ASSN + ").")
PRODUCTS = [
    {"productId": "com.ragnus.weather.fullgame", "name": "Full Game", "ref": "Full Game", "usd": "4.99",
     "desc": "Unlock every region and the full story.", "note": REVIEW_NOTE},
    {"productId": "com.ragnus.weather.fullgame.b", "name": "Full Game", "ref": "Full Game (price test B)", "usd": "6.99",
     "desc": "Unlock every region and the full story.",
     "note": "Same unlock as com.ragnus.weather.fullgame at a different price tier, for a server-configured price test. "
             "Only one of the two is offered to a given player. " + REVIEW_NOTE},
    {"productId": "com.ragnus.weather.supporter", "name": "Supporter Pack", "ref": "Supporter Pack", "usd": "2.99",
     "desc": "Voice Gallery, Kael icon & supporter badge",
     "note": "Optional cosmetic thank-you, no gameplay effect: unlocks a Voice Gallery (replay voiced lines), an "
             "alternate app icon and a badge. Settings (gear icon) > Supporter Pack."},
]
for p in PRODUCTS:
    assert len(p["name"]) <= 30 and len(p["desc"]) <= 45, p


def tok():
    now = int(time.time())
    return jwt.encode({"iss": os.environ["APP_STORE_CONNECT_ISSUER_ID"].strip(), "iat": now, "exp": now + 1100,
                       "aud": "appstoreconnect-v1"}, P8, algorithm="ES256",
                      headers={"kid": os.environ["APP_STORE_CONNECT_KEY_ID"].strip()})


def api(method, path, body=None):
    url = path if path.startswith("http") else "https://api.appstoreconnect.apple.com" + path
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + tok(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode()[:2000]}


BLOCKERS = []


def must(method, path, body=None, what=""):
    st, d = api(method, path, body)
    if st not in (200, 201, 204):
        msg = f"{what or method + ' ' + path} -> {st}: {d.get('error')}"
        print("::error::" + msg)
        raise RuntimeError(msg)
    return d


def get_all(path):
    out, url = [], path
    while url:
        d = must("GET", url)
        out += d.get("data", [])
        url = (d.get("links") or {}).get("next")
    return out


def ensure_iap(p, existing):
    cur = existing.get(p["productId"])
    if cur:
        print(f"[{p['productId']}] exists id={cur['id']} state={cur['attributes'].get('state')}")
        a = cur["attributes"]
        patch = {}
        if not a.get("familySharable"):
            patch["familySharable"] = True
        if (a.get("reviewNote") or "") != p["note"]:
            patch["reviewNote"] = p["note"]
        if patch and not DRY:
            st, d = api("PATCH", f"/v2/inAppPurchases/{cur['id']}", {"data": {"type": "inAppPurchases", "id": cur["id"], "attributes": patch}})
            print(f"  patch {list(patch)} -> {st} {d.get('error', '')[:300]}")
        return cur
    if DRY:
        print(f"[{p['productId']}] would create"); return None
    d = must("POST", "/v2/inAppPurchases", {"data": {"type": "inAppPurchases", "attributes": {
        "name": p["ref"], "productId": p["productId"], "inAppPurchaseType": "NON_CONSUMABLE",
        "reviewNote": p["note"], "familySharable": True},
        "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}}, what=f"create {p['productId']}")["data"]
    print(f"[{p['productId']}] created id={d['id']} state={d['attributes'].get('state')}")
    return d


def ensure_localization(iap, p):
    locs = get_all(f"/v2/inAppPurchases/{iap['id']}/inAppPurchaseLocalizations?limit=50")
    en = next((l for l in locs if l["attributes"].get("locale") == "en-US"), None)
    attrs = {"name": p["name"], "description": p["desc"]}
    if en:
        a = en["attributes"]
        if a.get("name") != p["name"] or a.get("description") != p["desc"]:
            must("PATCH", f"/v1/inAppPurchaseLocalizations/{en['id']}", {"data": {"type": "inAppPurchaseLocalizations", "id": en["id"], "attributes": attrs}})
            print("  localization updated")
        else:
            print("  localization ok")
        return
    must("POST", "/v1/inAppPurchaseLocalizations", {"data": {"type": "inAppPurchaseLocalizations",
        "attributes": {"locale": "en-US", **attrs},
        "relationships": {"inAppPurchaseV2": {"data": {"type": "inAppPurchases", "id": iap["id"]}}}}}, what="localization")
    print("  localization created")


def ensure_price(iap, p):
    st, sched = api("GET", f"/v2/inAppPurchases/{iap['id']}/iapPriceSchedule?include=manualPrices,baseTerritory")
    if st == 200 and any(i.get("type") == "inAppPurchasePrices" for i in sched.get("included", [])):
        print("  price schedule exists")
        return
    pts = get_all(f"/v2/inAppPurchases/{iap['id']}/pricePoints?filter[territory]=USA&limit=200")
    pt = next((x for x in pts if x["attributes"].get("customerPrice") == p["usd"]), None)
    if not pt:
        raise RuntimeError(f"no USD price point {p['usd']} (have {len(pts)})")
    must("POST", "/v1/inAppPurchasePriceSchedules", {
        "data": {"type": "inAppPurchasePriceSchedules", "relationships": {
            "inAppPurchase": {"data": {"type": "inAppPurchases", "id": iap["id"]}},
            "baseTerritory": {"data": {"type": "territories", "id": "USA"}},
            "manualPrices": {"data": [{"type": "inAppPurchasePrices", "id": "${p0}"}]}}},
        "included": [{"type": "inAppPurchasePrices", "id": "${p0}", "attributes": {"startDate": None},
                      "relationships": {"inAppPurchasePricePoint": {"data": {"type": "inAppPurchasePricePoints", "id": pt["id"]}}}}]},
        what="price schedule")
    print(f"  price set: USD {p['usd']} (base territory USA)")


TERRITORIES = None


def ensure_availability(iap):
    global TERRITORIES
    st, d = api("GET", f"/v2/inAppPurchases/{iap['id']}/inAppPurchaseAvailability")
    if st == 200 and d.get("data"):
        print("  availability exists")
        return
    if TERRITORIES is None:
        TERRITORIES = [t["id"] for t in get_all("/v1/territories?limit=200")]
    must("POST", "/v1/inAppPurchaseAvailabilities", {"data": {"type": "inAppPurchaseAvailabilities",
        "attributes": {"availableInNewTerritories": True},
        "relationships": {"inAppPurchase": {"data": {"type": "inAppPurchases", "id": iap["id"]}},
                          "availableTerritories": {"data": [{"type": "territories", "id": t} for t in TERRITORIES]}}}},
        what="availability")
    print(f"  availability set: {len(TERRITORIES)} territories + new")


def ensure_screenshot(iap):
    if not SHOT or not os.path.exists(SHOT):
        print("  (no review screenshot file)")
        return
    st, d = api("GET", f"/v2/inAppPurchases/{iap['id']}/appStoreReviewScreenshot")
    if st == 200 and d.get("data"):
        state = (d["data"]["attributes"].get("assetDeliveryState") or {}).get("state")
        if state in ("COMPLETE", "UPLOAD_COMPLETE"):
            print("  review screenshot present:", state)
            return
        print("  review screenshot in state", state, "- leaving it (no deletes)")
        return
    data = open(SHOT, "rb").read()
    res = must("POST", "/v1/inAppPurchaseAppStoreReviewScreenshots", {"data": {"type": "inAppPurchaseAppStoreReviewScreenshots",
        "attributes": {"fileName": os.path.basename(SHOT), "fileSize": len(data)},
        "relationships": {"inAppPurchaseV2": {"data": {"type": "inAppPurchases", "id": iap["id"]}}}}}, what="screenshot reserve")["data"]
    for op in res["attributes"]["uploadOperations"]:
        chunk = data[op["offset"]:op["offset"] + op["length"]]
        req = urllib.request.Request(op["url"], method=op["method"], data=chunk,
                                     headers={h["name"]: h["value"] for h in op.get("requestHeaders", [])})
        urllib.request.urlopen(req, timeout=120).read()
    must("PATCH", f"/v1/inAppPurchaseAppStoreReviewScreenshots/{res['id']}", {"data": {
        "type": "inAppPurchaseAppStoreReviewScreenshots", "id": res["id"],
        "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(data).hexdigest()}}}, what="screenshot commit")
    print("  review screenshot uploaded")


def ensure_assn():
    st, d = api("GET", f"/v1/apps/{APP}?fields[apps]=subscriptionStatusUrl,subscriptionStatusUrlVersion,subscriptionStatusUrlForSandbox,subscriptionStatusUrlVersionForSandbox")
    a = (d.get("data") or {}).get("attributes", {}) if st == 200 else {}
    want = {"subscriptionStatusUrl": ASSN, "subscriptionStatusUrlVersion": "V2",
            "subscriptionStatusUrlForSandbox": ASSN, "subscriptionStatusUrlVersionForSandbox": "V2"}
    if st == 200 and all(a.get(k) == v for k, v in want.items()):
        print("ASSN v2 URLs already set")
        return True
    if DRY:
        print("would set ASSN", want); return True
    st, d = api("PATCH", f"/v1/apps/{APP}", {"data": {"type": "apps", "id": APP, "attributes": want}})
    print("ASSN v2 URLs set" if st == 200 else f"::warning::ASSN URL patch -> {st}: {d.get('error', '')[:600]}")
    if st != 200:
        BLOCKERS.append(f"ASSN URL: HTTP {st}")
    return st == 200


existing = {x["attributes"]["productId"]: x for x in get_all(f"/v1/apps/{APP}/inAppPurchasesV2?limit=200")}
print("existing IAPs:", sorted(existing))
for p in PRODUCTS:
    try:
        iap = ensure_iap(p, existing)
        if not iap:
            continue
        for step in (lambda: ensure_localization(iap, p), lambda: ensure_price(iap, p), lambda: ensure_availability(iap), lambda: ensure_screenshot(iap)):
            try:
                step()
            except Exception as e:
                BLOCKERS.append(f"{p['productId']}: {e}")
    except Exception as e:
        BLOCKERS.append(f"{p['productId']}: {e}")
try:
    ensure_assn()
except Exception as e:
    BLOCKERS.append(f"ASSN: {e}")

print("\n=== state ===")
for x in get_all(f"/v1/apps/{APP}/inAppPurchasesV2?limit=200"):
    a = x["attributes"]
    print(f"{a['productId']:34} id={x['id']} type={a.get('inAppPurchaseType')} state={a.get('state')} family={a.get('familySharable')}")
if BLOCKERS:
    print("\nBLOCKERS:")
    for b in BLOCKERS:
        print(" -", b)
    sys.exit(1)
print("all IAP steps OK")
