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

if DRY:
    print("\nDRY RUN: would attach the build, re-apply review prerequisites, queue the 3 IAPs with version", VERSION,
          "and submit the version for App Review. Nothing changed.")
    sys.exit(0)

must("PATCH", f"/v1/appStoreVersions/{v['id']}/relationships/build", {"data": {"type": "builds", "id": b["id"]}}, what="attach build")
print("build attached")
subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "app_review_setup.py")], check=True)

for pid in IAP_IDS:
    x = iaps[pid]
    if x["attributes"].get("state") != "READY_TO_SUBMIT":
        print("IAP", pid, "already", x["attributes"].get("state")); continue
    st, d = api("POST", "/v1/inAppPurchaseSubmissions", {"data": {"type": "inAppPurchaseSubmissions",
                "relationships": {"inAppPurchaseV2": {"data": {"type": "inAppPurchases", "id": x["id"]}}}}})
    if st not in (200, 201):
        sys.exit(f"::error::IAP submission {pid} -> {st}: {d.get('error', '')[:1500]}")
    print("IAP queued with the version:", pid)

subs = get_all(f"/v1/reviewSubmissions?filter[app]={APP}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&limit=10")
sub = subs[0] if subs else must("POST", "/v1/reviewSubmissions", {"data": {"type": "reviewSubmissions", "attributes": {"platform": "IOS"},
                                "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}}, what="create review submission")["data"]
print("review submission", sub["id"])
st, d = api("POST", "/v1/reviewSubmissionItems", {"data": {"type": "reviewSubmissionItems",
            "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub["id"]}},
                              "appStoreVersion": {"data": {"type": "appStoreVersions", "id": v["id"]}}}}})
if st not in (200, 201, 409):
    sys.exit(f"::error::add version to submission -> {st}: {d.get('error', '')[:1500]}")
must("PATCH", f"/v1/reviewSubmissions/{sub['id']}", {"data": {"type": "reviewSubmissions", "id": sub["id"], "attributes": {"submitted": True}}}, what="submit")
print("SUBMITTED version", VERSION, "build", b["attributes"]["version"], "with IAPs", IAP_IDS)
