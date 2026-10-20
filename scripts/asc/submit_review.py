#!/usr/bin/env python3
"""MANUAL App Store submission for Temple of the High Priestess (only run when Yisheng says so).

  1. pick the editable App Store version VERSION_STRING and attach build BUILD_NUMBER (must be VALID)
  2. re-apply review prerequisites (app_review_setup.py: age rating, content rights, review contact/notes)
  3. queue ALL in-app purchases (Full Game, Full Game B, Supporter Pack) with this version
     (POST /v1/inAppPurchaseSubmissions; first-time IAPs are reviewed together with the version)
  4. create/reuse a review submission, add the version, and submit it
DRY_RUN=1 (the default) stops after printing what would happen. CONFIRM must be "SUBMIT" to submit.
"""
import os, subprocess, sys, urllib.parse

from asc_common import APP, api, editable_version, get_all, must

BUILD = os.environ.get("BUILD_NUMBER", "").strip()
VERSION = os.environ.get("VERSION_STRING", "1.0").strip()
DRY = os.environ.get("DRY_RUN", "1") != "0"
CONFIRM = os.environ.get("CONFIRM", "").strip()
IAP_IDS = ["com.ragnus.weather.fullgame", "com.ragnus.weather.fullgame.b", "com.ragnus.weather.supporter"]

if not DRY and CONFIRM != "SUBMIT":
    sys.exit("::error::refusing to submit: set confirm to SUBMIT (or run as a dry run)")

v = editable_version()
if not v or v["attributes"]["versionString"] != VERSION:
    sys.exit(f"::error::no editable App Store version {VERSION} (found {v and v['attributes']})")
print("version", VERSION, v["id"], v["attributes"]["appStoreState"])

builds = must("GET", f"/v1/builds?filter[app]={APP}&filter[version]={urllib.parse.quote(BUILD)}&limit=5")["data"] if BUILD else \
         must("GET", f"/v1/builds?filter[app]={APP}&filter[processingState]=VALID&sort=-uploadedDate&limit=1")["data"]
if not builds:
    sys.exit(f"::error::build {BUILD or '(latest VALID)'} not found")
b = builds[0]
if b["attributes"].get("processingState") != "VALID":
    sys.exit(f"::error::build {b['attributes']['version']} is {b['attributes'].get('processingState')}, need VALID")
print("build", b["attributes"]["version"], b["id"], "VALID")

iaps = {x["attributes"]["productId"]: x for x in get_all(f"/v1/apps/{APP}/inAppPurchasesV2?limit=50")}
for pid in IAP_IDS:
    x = iaps.get(pid)
    print("IAP", pid, x and x["id"], x and x["attributes"].get("state"))
    if not x:
        sys.exit(f"::error::IAP {pid} missing; run asc-iap-products first")
    if x["attributes"].get("state") not in ("READY_TO_SUBMIT", "WAITING_FOR_REVIEW", "IN_REVIEW", "APPROVED", "DEVELOPER_ACTION_NEEDED", "REJECTED"):
        sys.exit(f"::error::IAP {pid} is {x['attributes'].get('state')} (fix metadata first)")

# Pattern from yishengjiang99/earsheet scripts/asc/submit_version_with_subscriptions.py:
# ONE reviewSubmission holding reviewSubmissionItems for the appStoreVersion AND one inAppPurchaseVersion
# per IAP (GET /v2/inAppPurchases/{id}/versions). No standalone inAppPurchaseSubmissions (Apple answers
# FIRST_NON_CONSUMABLE_MUST_BE_SUBMITTED_ON_VERSION). Submitted only if every item was added.
import json
DRAFT_STATES = ("PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "DEVELOPER_REJECTED", "REJECTED")
DRAFT_SUB = os.environ.get("REVIEW_SUBMISSION_ID", "2978da7e-92c2-433e-aac0-2200d941592b").strip()

def items_of(rs_id):
    its = get_all(f"/v1/reviewSubmissions/{rs_id}/items?limit=50")
    for it in its:
        rel = {k: (x.get("data") or {}).get("id") for k, x in (it.get("relationships") or {}).items() if isinstance(x, dict) and x.get("data")}
        print("  ITEM", it["id"], it["attributes"].get("state"), rel)
    return its

def add_item(rs_id, rel_name, rel_type, rel_id):
    st, d = api("POST", "/v1/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems",
                "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": rs_id}},
                                  rel_name: {"data": {"type": rel_type, "id": rel_id}}}}})
    blob = json.dumps(d)
    ok = st < 300 or "ALREADY" in blob.upper() or "DUPLICATE" in blob.upper()
    print(f"ADD ITEM {rel_name} {rel_id} -> {st}", "" if st < 300 else blob[:2000])
    if "FIRST_NON_CONSUMABLE_MUST_BE_SUBMITTED_ON_VERSION" in blob:
        sys.exit("::error::FIRST_NON_CONSUMABLE_MUST_BE_SUBMITTED_ON_VERSION again; NOT submitted")
    return ok

allsubs = get_all(f"/v1/reviewSubmissions?filter[app]={APP}&filter[platform]=IOS&limit=50")
for x in allsubs:
    print("existing reviewSubmission", x["id"], x["attributes"].get("state"), x["attributes"].get("submittedDate"))
busy = [x for x in allsubs if x["attributes"].get("state") in ("WAITING_FOR_REVIEW", "IN_REVIEW", "UNRESOLVED_ISSUES", "CANCELING")]
if busy:
    sys.exit(f"::error::a review submission is already submitted: {[(x['id'], x['attributes'].get('state')) for x in busy]}; not submitting again")

iap_vs = []
for pid in IAP_IDS:
    x = iaps[pid]
    if x["attributes"].get("state") != "READY_TO_SUBMIT":
        print("IAP", pid, "already", x["attributes"].get("state")); continue
    st, d = api("GET", f"/v2/inAppPurchases/{x['id']}/versions?limit=50")
    vs = d.get("data") or [] if st < 300 else []
    print("IAP", pid, "versions ->", st, [(y["id"], y["attributes"]) for y in vs] if st < 300 else str(d)[:400])
    iv = max(vs, key=lambda y: y["attributes"].get("version") or 0) if vs else None
    if not iv or iv["attributes"].get("state") not in DRAFT_STATES:
        sys.exit(f"::error::no submittable inAppPurchaseVersion for {pid}; NOT submitting the version without IAPs")
    iap_vs.append((pid, iv))

draft = None
for x in allsubs:
    if x["attributes"].get("state") == "READY_FOR_REVIEW" and (draft is None or x["id"] == DRAFT_SUB):
        draft = x
if draft:
    print("draft reviewSubmission", draft["id"], draft["attributes"].get("state")); items_of(draft["id"])

if DRY:
    print("\nDRY RUN: would attach the build, re-apply review prerequisites, add version", VERSION, "and",
          [(p, iv["id"]) for p, iv in iap_vs], "as reviewSubmissionItems to", draft and draft["id"] or "(new)", "and submit. Nothing changed.")
    sys.exit(0)

must("PATCH", f"/v1/appStoreVersions/{v['id']}/relationships/build", {"data": {"type": "builds", "id": b["id"]}}, what="attach build")
print("build attached")
subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "app_review_setup.py")], check=True)

sub = draft or must("POST", "/v1/reviewSubmissions", {"data": {"type": "reviewSubmissions", "attributes": {"platform": "IOS"},
                    "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}}, what="create review submission")["data"]
rs = sub["id"]; print("review submission", rs)
ok = add_item(rs, "appStoreVersion", "appStoreVersions", v["id"])
for pid, iv in iap_vs:
    ok = add_item(rs, "inAppPurchaseVersion", "inAppPurchaseVersions", iv["id"]) and ok
its = items_of(rs)
kinds = [k for it in its for k in (it.get("relationships") or {}) if (it["relationships"][k] or {}).get("data")]
if not ok or "appStoreVersion" not in kinds or kinds.count("inAppPurchaseVersion") < len(iap_vs):
    sys.exit(f"::error::reviewSubmission {rs} is missing items (have {kinds}); NOT submitted")
j = must("PATCH", f"/v1/reviewSubmissions/{rs}", {"data": {"type": "reviewSubmissions", "id": rs, "attributes": {"submitted": True}}}, what="submit")
a = j["data"]["attributes"]
print("SUBMIT_OK submission_id=", rs, "state=", a.get("state"), "submittedDate=", a.get("submittedDate"))
import time; time.sleep(10)
r = must("GET", f"/v1/reviewSubmissions/{rs}")["data"]["attributes"]
print("FINAL reviewSubmission", rs, r.get("state"), r.get("submittedDate"))
print("FINAL version", must("GET", f"/v1/appStoreVersions/{v['id']}")["data"]["attributes"].get("appStoreState"))
for pid in IAP_IDS:
    print("FINAL IAP", pid, must("GET", f"/v2/inAppPurchases/{iaps[pid]['id']}")["data"]["attributes"].get("state"))
