#!/usr/bin/env python3
"""Prepare the App Store listing of Temple of the High Priestess (com.ragnus.weather, ASC app 6819973123, en-US).

Listing prep only. This script NEVER creates a review submission and never submits for review
(that is .github/workflows/asc-submit-review.yml, run by hand by the owner). It does not touch the
Game Center attachment, in-app purchases, pricing or the Paid Apps Agreement.

Sources (fastlane deliver layout, modeled on the ProTune script in yishengjiang99/photo-recipes):
  docs/asc/metadata/en-US/{name,subtitle,description,keywords,promotional_text,
                           support_url,marketing_url,privacy_url}.txt   (+ optional whatsnew.txt, not allowed on a first version)
  docs/asc/metadata/{copyright,primary_category,primary_subcategory_one,primary_subcategory_two,secondary_category}.txt
  docs/asc/metadata/review_information/{first_name,last_name,phone_number,email_address,demo_required,notes}.txt
  docs/asc/age-rating.json                                              (rationale: docs/asc/age-rating.md)
  docs/asc/screenshots/en-US/iphone-69-*.png -> APP_IPHONE_67           (6.9" iPhone, landscape 2868x1320 or portrait 1320x2868)
  docs/asc/screenshots/en-US/ipad-13-*.png   -> APP_IPAD_PRO_3GEN_129   (13" iPad, landscape 2752x2064 or portrait 2064x2752)
The app is landscape-only, so the repo frames must be landscape (enforced below). The iPad set is only uploaded and
verified when INCLUDE_IPAD=true (the target is iPhone-only today, TARGETED_DEVICE_FAMILY=1; ASC asks for iPad
screenshots only for apps that run natively on iPad).

Steps: metadata + URLs + categories + copyright + App Review contact and notes + age rating (docs/asc/age-rating.json)
+ export compliance for BUILD_NUMBER + attach BUILD_NUMBER to the version + (UPLOAD_SCREENSHOTS=true) replace
screenshots, then a read-only verification that exits 1 if anything is off. VERIFY_ONLY=true skips every write.

Env: APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_API_KEY_P8,
     BUNDLE_ID (com.ragnus.weather), VERSION_STRING (1.0), BUILD_NUMBER (5),
     UPLOAD_SCREENSHOTS (true/false), VERIFY_ONLY (true/false), INCLUDE_IPAD (true/false), SKIP_IF_NOT_EDITABLE (true/false)
Used by asc-seal-listing-upload.yml.
"""
from __future__ import annotations
import hashlib, json, os, struct, time
from pathlib import Path
import jwt, requests

ROOT = Path(__file__).resolve().parents[2]
META = ROOT / "docs/asc/metadata"
LOC_DIR = META / "en-US"
SHOTS = ROOT / "docs/asc/screenshots/en-US"
LOCALE = "en-US"
# ASC accepts either orientation for each display type; this app is landscape-only, so only landscape is allowed in the repo.
SHOT_TYPES = {"iphone-69": ("APP_IPHONE_67", (2868, 1320)), "ipad-13": ("APP_IPAD_PRO_3GEN_129", (2752, 2064))}
ASC_ACCEPTED = {"APP_IPHONE_67": {(1320, 2868), (2868, 1320)}, "APP_IPAD_PRO_3GEN_129": {(2064, 2752), (2752, 2064)}}
MAX_SHOT_BYTES = 10 * 1024 * 1024  # ASC limit per screenshot
AGE_RATING = ROOT / "docs/asc/age-rating.json"
BASE = "https://api.appstoreconnect.apple.com"
EDITABLE = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"}

BUNDLE_ID = os.environ.get("BUNDLE_ID", "com.ragnus.weather").strip()
VERSION = os.environ.get("VERSION_STRING", "1.0").strip()
BUILD_NUMBER = os.environ.get("BUILD_NUMBER", "5").strip()
# Submit workflow sync: a version still in review is left alone (the submit step cancels + resubmits)
SKIP_IF_NOT_EDITABLE = os.environ.get("SKIP_IF_NOT_EDITABLE", "false").strip().lower() == "true"
UPLOAD_SHOTS = os.environ.get("UPLOAD_SCREENSHOTS", "true").strip().lower() == "true"
VERIFY_ONLY = os.environ.get("VERIFY_ONLY", "false").strip().lower() == "true"
INCLUDE_IPAD = os.environ.get("INCLUDE_IPAD", "false").strip().lower() == "true"
UNMANAGED = set() if INCLUDE_IPAD else {"APP_IPAD_PRO_3GEN_129"}
_tok = {"v": None, "t": 0}


def token() -> str:
    now = int(time.time())
    if _tok["v"] and now - _tok["t"] < 600:
        return _tok["v"]
    p8 = os.environ["APP_STORE_CONNECT_API_KEY_P8"].replace("\\n", "\n").strip()
    _tok["v"] = jwt.encode({"iss": os.environ["APP_STORE_CONNECT_ISSUER_ID"].strip(), "iat": now,
                            "exp": now + 1100, "aud": "appstoreconnect-v1"}, p8, algorithm="ES256",
                           headers={"kid": os.environ["APP_STORE_CONNECT_KEY_ID"].strip()})
    _tok["t"] = now
    return _tok["v"]


class ApiError(Exception):
    pass


def api(method, path, body=None, ok404=False):
    assert "reviewSubmission" not in path and "appStoreVersionSubmission" not in path, "never submits"
    if VERIFY_ONLY and method != "GET":
        raise SystemExit(f"VERIFY_ONLY but tried {method} {path}")
    r = requests.request(method, path if path.startswith("http") else BASE + path, json=body,
                         headers={"Authorization": "Bearer " + token()}, timeout=120)
    if ok404 and r.status_code == 404:
        return None
    if r.status_code >= 300:
        raise ApiError(f"{method} {path} -> {r.status_code}: {r.text[:1500]}")
    return r.json() if r.text else {}


def txt(p: Path) -> str:
    return p.read_text().strip() if p.exists() else ""


def age_answers() -> dict:
    return {k: v for k, v in json.loads(AGE_RATING.read_text()).items() if not k.startswith("_")}


def png_size(p: Path):
    b = p.read_bytes()[:24]
    return struct.unpack(">II", b[16:24])


def main():
    L = {k: txt(LOC_DIR / f"{k}.txt") for k in ("name", "subtitle", "description", "keywords", "promotional_text",
                                                  "support_url", "marketing_url", "privacy_url", "whatsnew")}
    copyright_ = txt(META / "copyright.txt")
    # cat = {"primary", "sub1", "sub2", "secondary"}: Games + up to two game genres (Role Playing, Adventure)
    cat1 = {"primary": txt(META / "primary_category.txt"), "sub1": txt(META / "primary_subcategory_one.txt"),
            "sub2": txt(META / "primary_subcategory_two.txt"), "secondary": txt(META / "secondary_category.txt")}
    assert cat1["primary"], "primary_category.txt is empty"
    R = {k: txt(META / "review_information" / f"{k}.txt") for k in ("first_name", "last_name", "phone_number", "email_address", "demo_required")}
    _notes = META / "review_information" / "notes.txt"
    R["notes"] = _notes.read_text().strip() if _notes.exists() else ""
    blob = " ".join(L.values()).lower()
    for banned in ("grok",):
        assert banned not in blob, f"metadata mentions {banned!r}"
    for k, lim in (("name", 30), ("subtitle", 30), ("promotional_text", 170), ("keywords", 100), ("description", 4000)):
        assert 0 < len(L[k]) <= lim, f"{k}: {len(L[k])} chars (limit {lim})"
    assert len(L["whatsnew"]) <= 4000, "whatsnew too long"
    for k in ("support_url", "privacy_url", "marketing_url"):
        assert L[k].startswith("https://"), f"{k} must be an https URL"
    shots = {}
    for prefix, (dtype, size) in SHOT_TYPES.items():
        if dtype == "APP_IPAD_PRO_3GEN_129" and not INCLUDE_IPAD:
            shots[dtype] = []
            print("iPad screenshots skipped (INCLUDE_IPAD=false: iPhone-only target)")
            continue
        files = sorted(SHOTS.glob(f"{prefix}-*.png"))
        for f in files:
            sz = png_size(f)
            assert sz in ASC_ACCEPTED[dtype], f"{f.name} is {sz}, ASC accepts {sorted(ASC_ACCEPTED[dtype])} for {dtype}"
            assert sz == size, f"{f.name} is {sz}; this landscape-only app uses {size}"
            assert f.stat().st_size <= MAX_SHOT_BYTES, f"{f.name} is over 10 MB"
        shots[dtype] = files
    assert len(shots["APP_IPHONE_67"]) >= 5, f"need at least 5 iPhone 6.9\" screenshots, found {len(shots['APP_IPHONE_67'])}"
    assert len(shots["APP_IPHONE_67"]) <= 10, "ASC allows at most 10 screenshots per set"
    print("screenshots in repo:", {k: [f.name for f in v] for k, v in shots.items()})

    app = api("GET", f"/v1/apps?filter[bundleId]={BUNDLE_ID}")["data"][0]
    app_id = app["id"]
    print("APP", app_id, app["attributes"].get("name"), BUNDLE_ID)
    vers = api("GET", f"/v1/apps/{app_id}/appStoreVersions?filter[platform]=IOS&filter[versionString]={VERSION}")["data"]
    if not vers:
        if VERIFY_ONLY:
            raise SystemExit(f"version {VERSION} not found")
        print(f"No IOS version {VERSION}; creating PREPARE_FOR_SUBMISSION...")
        ver = api("POST", "/v1/appStoreVersions", {"data": {"type": "appStoreVersions",
            "attributes": {"platform": "IOS", "versionString": VERSION},
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}})["data"]
        print("created version", ver["id"], ver["attributes"].get("appStoreState"))
    else:
        ver = vers[0]
    vstate = ver["attributes"].get("appVersionState") or ver["attributes"].get("appStoreState")
    print("VERSION", ver["id"], VERSION, ver["attributes"].get("appStoreState"), ver["attributes"].get("appVersionState"))
    infos = api("GET", f"/v1/apps/{app_id}/appInfos")["data"]
    info = next((i for i in infos if (i["attributes"].get("state") or i["attributes"].get("appStoreState")) not in ("READY_FOR_DISTRIBUTION", "READY_FOR_SALE")), infos[0])
    print("APPINFO", info["id"], info["attributes"].get("state") or info["attributes"].get("appStoreState"))
    builds = api("GET", f"/v1/builds?filter[app]={app_id}&filter[version]={BUILD_NUMBER}&limit=10")["data"]
    build = next((b for b in builds if not b["attributes"].get("expired")), None)
    if not build:
        raise SystemExit(f"build {BUILD_NUMBER} not found")
    print("BUILD", build["id"], BUILD_NUMBER, build["attributes"].get("processingState"), "encryption=", build["attributes"].get("usesNonExemptEncryption"))

    warnings = []
    if not VERIFY_ONLY:
        if ver["attributes"].get("appStoreState") not in EDITABLE and vstate not in EDITABLE:
            if SKIP_IF_NOT_EDITABLE:
                print(f"WARNING: version {VERSION} not editable ({vstate}); listing sync skipped, nothing written")
                return
            raise SystemExit(f"version {VERSION} not editable ({vstate}); nothing written")
        write(app_id, ver, info, build, L, copyright_, cat1, R, shots, warnings)
    ok = verify(app_id, app, ver["id"], info["id"], L, copyright_, cat1, R, shots, warnings)
    print("\nWARNINGS:" if warnings else "\nno warnings", *warnings, sep="\n  ")
    if not ok:
        raise SystemExit("VERIFY FAILED")
    print("VERIFY OK")


def write(app_id, ver, info, build, L, copyright_, cat1, R, shots, warnings):
    vid = ver["id"]
    # App info localization: name, subtitle, privacy policy URL
    locs = api("GET", f"/v1/appInfos/{info['id']}/appInfoLocalizations")["data"]
    loc = next(l for l in locs if l["attributes"]["locale"] == LOCALE)
    attrs = {"name": L["name"], "subtitle": L["subtitle"], "privacyPolicyUrl": L["privacy_url"]}
    api("PATCH", f"/v1/appInfoLocalizations/{loc['id']}", {"data": {"type": "appInfoLocalizations", "id": loc["id"], "attributes": attrs}})
    print("appInfoLocalization:", list(attrs))
    rel = {"primaryCategory": {"data": {"type": "appCategories", "id": cat1["primary"]}}}
    for key, relname in (("sub1", "primarySubcategoryOne"), ("sub2", "primarySubcategoryTwo"), ("secondary", "secondaryCategory")):
        if cat1[key]:
            rel[relname] = {"data": {"type": "appCategories", "id": cat1[key]}}
    api("PATCH", f"/v1/appInfos/{info['id']}", {"data": {"type": "appInfos", "id": info["id"], "relationships": rel}})
    print("categories:", {k: v for k, v in cat1.items() if v})

    # Age rating: every answer comes from docs/asc/age-rating.json (rationale in age-rating.md); keys the API schema
    # does not know are skipped with a warning (e.g. socialMediaAgeRestricted is a TODO for Yisheng if ASC asks for it).
    ard = api("GET", f"/v1/appInfos/{info['id']}/ageRatingDeclaration", ok404=True)
    if ard and ard.get("data"):
        known = set(ard["data"]["attributes"])
        answers = age_answers()
        send = {k: v for k, v in answers.items() if k in known}
        skipped = sorted(set(answers) - known)
        if skipped:
            warnings.append(f"age rating keys not in the API schema, skipped: {skipped}")
        print("ageRating current:", ard["data"]["attributes"])
        try:
            api("PATCH", f"/v1/ageRatingDeclarations/{ard['data']['id']}", {"data": {"type": "ageRatingDeclarations", "id": ard["data"]["id"], "attributes": send}})
            print("ageRating set from age-rating.json:", sorted(send))
        except ApiError as e:
            print("ageRating bulk patch failed, per field:", e)
            for k, v in send.items():
                try:
                    api("PATCH", f"/v1/ageRatingDeclarations/{ard['data']['id']}", {"data": {"type": "ageRatingDeclarations", "id": ard["data"]["id"], "attributes": {k: v}}})
                except ApiError as e2:
                    warnings.append(f"age rating {k}={v} rejected: {e2}")
    else:
        warnings.append("no ageRatingDeclaration found on appInfo")

    # Version: copyright
    api("PATCH", f"/v1/appStoreVersions/{vid}", {"data": {"type": "appStoreVersions", "id": vid, "attributes": {"copyright": copyright_}}})
    print("copyright:", copyright_)

    # Version localization: description, keywords, promo, support + marketing URL
    vlocs = api("GET", f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations")["data"]
    vloc = next((l for l in vlocs if l["attributes"]["locale"] == LOCALE), None)
    vattrs = {"description": L["description"], "keywords": L["keywords"], "promotionalText": L["promotional_text"],
              "supportUrl": L["support_url"]}
    if L["whatsnew"]:  # ASC rejects whatsNew on a first version, so 1.0 ships without whatsnew.txt
        vattrs["whatsNew"] = L["whatsnew"]
    if L["marketing_url"]:
        vattrs["marketingUrl"] = L["marketing_url"]
    elif vloc and vloc["attributes"].get("marketingUrl"):
        vattrs["marketingUrl"] = None  # blank in repo -> clear
    if vloc:
        api("PATCH", f"/v1/appStoreVersionLocalizations/{vloc['id']}", {"data": {"type": "appStoreVersionLocalizations", "id": vloc["id"], "attributes": vattrs}})
    else:
        vloc = api("POST", "/v1/appStoreVersionLocalizations", {"data": {"type": "appStoreVersionLocalizations", "attributes": {"locale": LOCALE, **vattrs},
                   "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})["data"]
    print("appStoreVersionLocalization:", list(vattrs))

    # App Review contact
    rd = api("GET", f"/v1/appStoreVersions/{vid}/appStoreReviewDetail", ok404=True)
    rattrs = {"contactFirstName": R["first_name"], "contactLastName": R["last_name"], "contactPhone": R["phone_number"],
              "contactEmail": R["email_address"], "demoAccountRequired": R["demo_required"].lower() == "true"}
    if R.get("notes"):
        rattrs["notes"] = R["notes"]
    if rd and rd.get("data"):
        api("PATCH", f"/v1/appStoreReviewDetails/{rd['data']['id']}", {"data": {"type": "appStoreReviewDetails", "id": rd["data"]["id"], "attributes": rattrs}})
    else:
        api("POST", "/v1/appStoreReviewDetails", {"data": {"type": "appStoreReviewDetails", "attributes": rattrs,
            "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})
    print("review contact:", rattrs)

    # Export compliance + attach build
    ba = build["attributes"]
    if ba.get("processingState") != "VALID":
        raise SystemExit(f"build {BUILD_NUMBER} is {ba.get('processingState')}, not VALID")
    if ba.get("usesNonExemptEncryption") is not False:
        api("PATCH", f"/v1/builds/{build['id']}", {"data": {"type": "builds", "id": build["id"], "attributes": {"usesNonExemptEncryption": False}}})
        print("export compliance: usesNonExemptEncryption=false set")
    else:
        print("export compliance: already cleared")
    api("PATCH", f"/v1/appStoreVersions/{vid}/relationships/build", {"data": {"type": "builds", "id": build["id"]}})
    print("attached build", BUILD_NUMBER, build["id"], "to version", VERSION)

    if UPLOAD_SHOTS:
        replace_screenshots(vloc["id"], shots, warnings)


def upload_one(set_id, f: Path) -> str:
    data = f.read_bytes()
    shot = api("POST", "/v1/appScreenshots", {"data": {"type": "appScreenshots", "attributes": {"fileName": f.name, "fileSize": len(data)},
               "relationships": {"appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": set_id}}}}})["data"]
    for op in shot["attributes"]["uploadOperations"]:
        chunk = data[op["offset"]: op["offset"] + op["length"]]
        h = {x["name"]: x["value"] for x in op.get("requestHeaders", [])}
        requests.request(op["method"], op["url"], data=chunk, headers=h, timeout=180).raise_for_status()
    api("PATCH", f"/v1/appScreenshots/{shot['id']}", {"data": {"type": "appScreenshots", "id": shot["id"],
        "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(data).hexdigest()}}})
    for _ in range(60):
        st = (api("GET", f"/v1/appScreenshots/{shot['id']}")["data"]["attributes"].get("assetDeliveryState") or {})
        if st.get("state") in ("UPLOAD_COMPLETE", "COMPLETE", "FAILED"):
            break
        time.sleep(5)
    if st.get("state") not in ("UPLOAD_COMPLETE", "COMPLETE"):
        raise SystemExit(f"screenshot {f.name} delivery {st}")
    print("  uploaded", f.name, shot["id"], st.get("state"))
    return shot["id"]


def replace_screenshots(vloc_id, shots, warnings):
    sets = api("GET", f"/v1/appStoreVersionLocalizations/{vloc_id}/appScreenshotSets?limit=50")["data"]
    for s in sets:  # sets for other display types would keep stale frames: remove them
        dt = s["attributes"]["screenshotDisplayType"]
        if dt in UNMANAGED:
            continue  # iPad frames are not managed while INCLUDE_IPAD=false: leave whatever is in ASC alone
        if dt not in shots or not shots[dt]:
            n = len(api("GET", f"/v1/appScreenshotSets/{s['id']}/appScreenshots")["data"])
            api("DELETE", f"/v1/appScreenshotSets/{s['id']}")
            print(f"deleted stale set {dt} ({n} screenshots)")
    for dtype, files in shots.items():
        if not files:
            continue
        sset = next((s for s in sets if s["attributes"]["screenshotDisplayType"] == dtype), None)
        if sset is None:
            sset = api("POST", "/v1/appScreenshotSets", {"data": {"type": "appScreenshotSets", "attributes": {"screenshotDisplayType": dtype},
                       "relationships": {"appStoreVersionLocalization": {"data": {"type": "appStoreVersionLocalizations", "id": vloc_id}}}}})["data"]
        old_items = api("GET", f"/v1/appScreenshotSets/{sset['id']}/appScreenshots")["data"]
        want_names = [f.name for f in files]
        got_names = [x["attributes"].get("fileName") for x in old_items]
        states_ok = all(
            ((x["attributes"].get("assetDeliveryState") or {}).get("state") in ("UPLOAD_COMPLETE", "COMPLETE"))
            for x in old_items)
        if got_names == want_names and states_ok:
            print(f"{dtype}: set {sset['id']}, {len(files)} screenshot(s) already in place, skipping upload")
            continue
        old = [x["id"] for x in old_items]
        print(f"{dtype}: set {sset['id']}, replacing {len(old)} old screenshot(s)")
        for oid in old:  # Apple caps a set at 10; delete first, then upload in order
            api("DELETE", f"/v1/appScreenshots/{oid}")
        new = [upload_one(sset["id"], f) for f in files]
        api("PATCH", f"/v1/appScreenshotSets/{sset['id']}/relationships/appScreenshots",
            {"data": [{"type": "appScreenshots", "id": i} for i in new]})
        print(f"{dtype}: order set", [f.name for f in files])


def verify(app_id, app, vid, info_id, L, copyright_, cat1, R, shots, warnings) -> bool:
    print("\n==== VERIFY (read-only) ====")
    ok = True

    def check(label, cond, detail=""):
        nonlocal ok
        ok &= bool(cond)
        print(f"[{'OK ' if cond else 'BAD'}] {label} {detail}")

    v = api("GET", f"/v1/appStoreVersions/{vid}")["data"]["attributes"]
    check("version state (editable)", v.get("appStoreState") in EDITABLE or v.get("appVersionState") in EDITABLE,
          f"{VERSION} appStoreState={v.get('appStoreState')} appVersionState={v.get('appVersionState')}")
    check("copyright", v.get("copyright") == copyright_, repr(v.get("copyright")))
    b = (api("GET", f"/v1/appStoreVersions/{vid}/build", ok404=True) or {}).get("data")
    check("attached build", b and b["attributes"].get("version") == BUILD_NUMBER,
          f"{b and b['attributes'].get('version')} {b and b['attributes'].get('processingState')} encryption={b and b['attributes'].get('usesNonExemptEncryption')}")
    check("export compliance", b and b["attributes"].get("usesNonExemptEncryption") is False)
    vloc = next((l for l in api("GET", f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations")["data"] if l["attributes"]["locale"] == LOCALE), None)
    va = vloc["attributes"] if vloc else {}
    check("description", va.get("description") == L["description"], f"{len(va.get('description') or '')} chars")
    if L["whatsnew"]:
        check("whatsNew", va.get("whatsNew") == L["whatsnew"], f"{len(va.get('whatsNew') or '')} chars")
    check("keywords", va.get("keywords") == L["keywords"])
    check("promotional text", va.get("promotionalText") == L["promotional_text"])
    check("support URL", va.get("supportUrl") == L["support_url"], repr(va.get("supportUrl")))
    check("marketing URL", (va.get("marketingUrl") or "") == L["marketing_url"], repr(va.get("marketingUrl")))
    il = next(l for l in api("GET", f"/v1/appInfos/{info_id}/appInfoLocalizations")["data"] if l["attributes"]["locale"] == LOCALE)["attributes"]
    check("name/subtitle", il.get("name") == L["name"] and il.get("subtitle") == L["subtitle"], f"{il.get('name')!r} / {il.get('subtitle')!r}")
    check("privacy policy URL", il.get("privacyPolicyUrl") == L["privacy_url"], repr(il.get("privacyPolicyUrl")))
    def rel_id(name):
        return ((api("GET", f"/v1/appInfos/{info_id}/{name}", ok404=True) or {}).get("data") or {}).get("id")
    pc, s1, s2, sc = rel_id("primaryCategory"), rel_id("primarySubcategoryOne"), rel_id("primarySubcategoryTwo"), rel_id("secondaryCategory")
    check("primary category", pc == cat1["primary"], f"{pc} (want {cat1['primary']})")
    check("primary subcategory one", s1 == (cat1["sub1"] or None), f"{s1} (want {cat1['sub1']})")
    check("primary subcategory two", s2 == (cat1["sub2"] or None), f"{s2} (want {cat1['sub2']})")
    check("secondary category", sc == (cat1["secondary"] or None), f"{sc} (want {cat1['secondary'] or 'none'})")
    ard = (api("GET", f"/v1/appInfos/{info_id}/ageRatingDeclaration", ok404=True) or {}).get("data")
    if ard:
        a = ard["attributes"]
        want = {k: v for k, v in age_answers().items() if k in a}
        diff = {k: (a.get(k), v) for k, v in want.items() if a.get(k) != v}
        check("age rating matches docs/asc/age-rating.json", not diff, f"differences (asc, repo)={diff}")
        unknown = sorted(set(age_answers()) - set(a))
        if unknown:
            warnings.append(f"age rating keys in age-rating.json unknown to the API: {unknown}")
        # Optional / region-specific fields that are legitimately null; socialMediaAgeRestricted is a TODO for Yisheng.
        optional = {"developerAgeRatingInfoUrl", "gracRatingClassificationNumber", "kidsAgeBand"}
        todo_yisheng = {"socialMediaAgeRestricted"}
        unset = sorted(k for k, x in a.items() if x is None and k not in want and k not in optional | todo_yisheng)
        print(f"[INFO] age rating unset fields with no answer in age-rating.json: {unset}")
        check("age rating has no unanswered questions", not unset, f"unset={unset}")
        for k in sorted(todo_yisheng):
            if a.get(k) is None:
                print(f"[TODO] age rating {k} is unset: Yisheng to answer in App Store Connect > App Information > Age Rating")
                warnings.append(f"TODO Yisheng: age rating {k} is unset (not set by this script; social media does not apply: the game has no social features)")
        ai = (api("GET", f"/v1/appInfos/{info_id}", ok404=True) or {}).get("data", {}).get("attributes", {})
        print("[INFO] computed rating:", {k: x for k, x in ai.items() if "AgeRating" in k or k == "appStoreAgeRating"})
    else:
        check("age rating declaration exists", False)
    rd = ((api("GET", f"/v1/appStoreVersions/{vid}/appStoreReviewDetail", ok404=True) or {}).get("data") or {}).get("attributes", {})
    check("App Review notes", (rd.get("notes") or "").strip() == R["notes"].strip(), f"{len(rd.get('notes') or '')} chars (want {len(R['notes'])})")
    check("App Review demo account not required", rd.get("demoAccountRequired") == (R["demo_required"].lower() == "true"))
    check("App Review contact", rd.get("contactFirstName") == R["first_name"] and rd.get("contactLastName") == R["last_name"]
          and rd.get("contactPhone") == R["phone_number"] and rd.get("contactEmail") == R["email_address"],
          f"{rd.get('contactFirstName')} {rd.get('contactLastName')} {rd.get('contactPhone')} {rd.get('contactEmail')} demo={rd.get('demoAccountRequired')}")
    if vloc:
        def fetch_seen():
            seen = {}
            for s in api("GET", f"/v1/appStoreVersionLocalizations/{vloc['id']}/appScreenshotSets?limit=50")["data"]:
                dt = s["attributes"]["screenshotDisplayType"]
                items = api("GET", f"/v1/appScreenshotSets/{s['id']}/appScreenshots")["data"]
                desc = []
                for it in items:
                    ia = it["attributes"]
                    img = ia.get("imageAsset") or {}
                    desc.append((ia.get("fileName"), img.get("width"), img.get("height"),
                                 (ia.get("assetDeliveryState") or {}).get("state")))
                seen[dt] = desc
            return seen
        seen = fetch_seen()
        # Apple derives image assets asynchronously: states move UPLOAD_COMPLETE -> COMPLETE
        # and dimensions appear a few minutes after upload. Wait for it to settle.
        for _ in range(32):
            pending = [(dt, n) for dt, items in seen.items() for n, w, h, st in items
                       if st not in ("UPLOAD_COMPLETE", "COMPLETE") or not w or not h]
            if not pending:
                break
            print(f"      screenshots still processing: {pending[:4]}{'...' if len(pending) > 4 else ''}")
            time.sleep(15)
            seen = fetch_seen()
        for dt, desc in seen.items():
            print(f"      SET {dt}: {desc}")
        for dtype, files in shots.items():
            if not files:
                continue
            size = next(sz for dt, sz in SHOT_TYPES.values() if dt == dtype)
            want = [(f.name, *size) for f in files]
            got = [(n, w, h) for n, w, h, st in seen.get(dtype, [])]
            states_ok = all(st in ("UPLOAD_COMPLETE", "COMPLETE") for *_, st in seen.get(dtype, []))
            check(f"screenshots {dtype}", got == want and states_ok, f"{len(got)} present, want {len(want)} in order")
        extra = [d for d in seen if d not in UNMANAGED and (d not in shots or not shots[d])]
        check("no stale screenshot sets", not extra, str(extra))
    # Read-only extras the submit needs but this script does not set
    aa = api("GET", f"/v1/apps/{app_id}")["data"]["attributes"]
    crd = aa.get("contentRightsDeclaration")
    print(f"[INFO] contentRightsDeclaration={crd}")
    if not crd:
        warnings.append("Content Rights (third-party content) declaration is unset: run the 'ASC review prerequisites' workflow (DOES_NOT_USE_THIRD_PARTY_CONTENT) or set it in App Store Connect > App Information")
    ps = api("GET", f"/v1/apps/{app_id}/appPriceSchedule", ok404=True)
    print(f"[INFO] appPriceSchedule={'set' if ps and ps.get('data') else 'NOT SET'}")
    if not (ps and ps.get("data")):
        warnings.append("Price schedule not set: set Pricing and Availability (e.g. Free) in App Store Connect")
    av = api("GET", f"/v1/apps/{app_id}/appAvailabilityV2", ok404=True)
    print(f"[INFO] appAvailabilityV2={'set' if av and av.get('data') else 'NOT SET'}")
    if not (av and av.get("data")):
        warnings.append("App availability (territories) not set: set in Pricing and Availability")
    return ok


if __name__ == "__main__":
    main()
