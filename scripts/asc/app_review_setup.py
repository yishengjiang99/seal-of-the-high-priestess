#!/usr/bin/env python3
"""App Store Connect submission prerequisites for Temple of the High Priestess. Idempotent; never submits.

  1. age rating declaration      <- docs/asc/age-rating.json
  2. content rights declaration  <- DOES_NOT_USE_THIRD_PARTY_CONTENT (owns all rights)
  3. App Review contact + notes  <- REVIEW_* env + docs/asc/review-notes.txt, on the editable version
Env: APP_STORE_CONNECT_*; REVIEW_FIRST, REVIEW_LAST, REVIEW_EMAIL, REVIEW_PHONE
"""
import json, os, sys

from asc_common import APP, api, editable_version, must

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
problems = []

# 1. age rating
answers = {k: v for k, v in json.load(open(os.path.join(ROOT, "docs/asc/age-rating.json"))).items() if not k.startswith("_")}
infos = must("GET", f"/v1/apps/{APP}/appInfos")["data"]
info = next((i for i in infos if i["attributes"].get("state") in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "WAITING_FOR_REVIEW") or i["attributes"].get("appStoreState") == "PREPARE_FOR_SUBMISSION"), infos[0])
decl = must("GET", f"/v1/appInfos/{info['id']}/ageRatingDeclaration")["data"]
known = set(decl["attributes"])
send = {k: v for k, v in answers.items() if k in known}
skipped = sorted(set(answers) - known)
if skipped:
    print("::warning::age rating keys not in the API schema (skipped):", skipped)
missing = sorted(k for k in known if decl["attributes"].get(k) is None and k not in send
                 and k not in ("kidsAgeBand", "developerAgeRatingInfoUrl", "gracRatingClassificationNumber"))
if missing:
    print("::warning::age rating questions with no answer in age-rating.json:", missing)
st, d = api("PATCH", f"/v1/ageRatingDeclarations/{decl['id']}", {"data": {"type": "ageRatingDeclarations", "id": decl["id"], "attributes": send}})
if st == 200:
    print("age rating declaration set:", json.dumps(send, sort_keys=True))
else:
    problems.append(f"age rating PATCH -> {st}: {d.get('error', '')[:1500]}")
st, d = api("GET", f"/v1/appInfos/{info['id']}")
if st == 200:
    a = d["data"]["attributes"]
    print("computed ratings:", {k: v for k, v in a.items() if "AgeRating" in k or k == "appStoreAgeRating"})

# 2. content rights
st, d = api("PATCH", f"/v1/apps/{APP}", {"data": {"type": "apps", "id": APP, "attributes": {"contentRightsDeclaration": "DOES_NOT_USE_THIRD_PARTY_CONTENT"}}})
print("content rights: DOES_NOT_USE_THIRD_PARTY_CONTENT" if st == 200 else "")
if st != 200:
    problems.append(f"content rights PATCH -> {st}: {d.get('error', '')[:800]}")

# 3. review detail
v = editable_version()
if not v:
    problems.append("no editable App Store version for the review detail")
else:
    notes = open(os.path.join(ROOT, "docs/asc/review-notes.txt")).read().strip()
    attrs = {"contactFirstName": os.environ["REVIEW_FIRST"], "contactLastName": os.environ["REVIEW_LAST"],
             "contactEmail": os.environ["REVIEW_EMAIL"], "contactPhone": os.environ["REVIEW_PHONE"],
             "demoAccountRequired": False, "notes": notes}
    st, d = api("GET", f"/v1/appStoreVersions/{v['id']}/appStoreReviewDetail")
    if st == 200 and d.get("data"):
        rid = d["data"]["id"]
        st, d = api("PATCH", f"/v1/appStoreReviewDetails/{rid}", {"data": {"type": "appStoreReviewDetails", "id": rid, "attributes": attrs}})
    else:
        st, d = api("POST", "/v1/appStoreReviewDetails", {"data": {"type": "appStoreReviewDetails", "attributes": attrs,
                    "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": v["id"]}}}}})
    if st in (200, 201):
        print(f"review detail set on version {v['attributes']['versionString']}: contact {attrs['contactFirstName']} {attrs['contactLastName']}, notes {len(notes)} chars")
    else:
        problems.append(f"review detail -> {st}: {d.get('error', '')[:1500]}")

if problems:
    print("\nPROBLEMS:")
    for p in problems:
        print(" -", p)
    sys.exit(1)
print("all set (nothing submitted)")
