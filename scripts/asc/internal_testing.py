#!/usr/bin/env python3
"""TestFlight internal testing for Temple of the High Priestess (ASC app ASC_APP_ID).

Idempotent:
  1. find or create the internal beta group GROUP_NAME (default "Internal")
  2. make sure each TESTER_EMAILS address (comma separated) is in the group
     (internal testers must already be App Store Connect users on the team)
  3. attach BUILD_NUMBER (default: newest VALID build) to the group, unless the group
     already gets every build
  4. print the group, each tester's state and the build's internal beta state
Never submits anything for review and never deletes anything.
Env: APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_API_KEY_P8, ASC_APP_ID,
     [BUILD_NUMBER], [TESTER_EMAILS], [GROUP_NAME]
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

import jwt

APP = os.environ["ASC_APP_ID"].strip()
GROUP = (os.environ.get("GROUP_NAME") or "Internal").strip()
EMAILS = [e.strip().lower() for e in (os.environ.get("TESTER_EMAILS") or "").split(",") if e.strip()]
WANT_BUILD = (os.environ.get("BUILD_NUMBER") or "").strip()
P8 = os.environ["APP_STORE_CONNECT_API_KEY_P8"].replace("\\n", "\n").strip()


def tok():
    now = int(time.time())
    return jwt.encode({"iss": os.environ["APP_STORE_CONNECT_ISSUER_ID"].strip(), "iat": now, "exp": now + 1100,
                       "aud": "appstoreconnect-v1"}, P8, algorithm="ES256",
                      headers={"kid": os.environ["APP_STORE_CONNECT_KEY_ID"].strip()})


def api(method, path, body=None, ok=(200, 201, 204)):
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + tok(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        if e.code in ok:
            return e.code, {}
        return e.code, {"error": txt[:1500]}


def must(method, path, body=None):
    st, d = api(method, path, body)
    if st not in (200, 201, 204):
        sys.exit(f"::error::{method} {path} -> {st}: {d.get('error')}")
    return d


# 1. group
groups = must("GET", f"/v1/apps/{APP}/betaGroups?limit=200")["data"]
for g in groups:
    a = g["attributes"]
    print("group", g["id"], repr(a.get("name")), "internal=", a.get("isInternalGroup"), "allBuilds=", a.get("hasAccessToAllBuilds"))
group = next((g for g in groups if g["attributes"].get("name") == GROUP and g["attributes"].get("isInternalGroup")), None)
if not group:
    group = must("POST", "/v1/betaGroups", {"data": {"type": "betaGroups",
        "attributes": {"name": GROUP, "isInternalGroup": True, "hasAccessToAllBuilds": False},
        "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})["data"]
    print("created internal group", group["id"], GROUP)
gid = group["id"]
all_builds = bool(group["attributes"].get("hasAccessToAllBuilds"))

# 2. testers
TESTER_FAIL = False
members = {t["attributes"].get("email", "").lower(): t for t in must("GET", f"/v1/betaGroups/{gid}/betaTesters?limit=200")["data"]}
for email in EMAILS:
    if email in members:
        continue
    users = must("GET", f"/v1/users?filter[username]={urllib.parse.quote(email)}&limit=5")["data"]
    if not users:
        print(f"::warning::{email} is not an App Store Connect user on this team; internal testers must be. Skipping.")
        continue
    ua = users[0]["attributes"]
    print("ASC user", email, "roles=", ua.get("roles"), "allAppsVisible=", ua.get("allAppsVisible"))
    if not ua.get("allAppsVisible"):
        vis = [a["id"] for a in must("GET", f"/v1/users/{users[0]['id']}/visibleApps?limit=200")["data"]]
        print("  visibleApps include this app:", APP in vis)
    # filter[email] is fuzzy; keep exact matches only. For internal groups, POST /v1/betaTesters with the
    # group works where linking an existing (external) tester record returns 409 "cannot be assigned".
    found = [t for t in must("GET", f"/v1/betaTesters?filter[email]={urllib.parse.quote(email)}&limit=20")["data"]
             if (t["attributes"].get("email") or "").lower() == email]
    for t in found:
        print("  existing betaTester", t["id"], {k: t["attributes"].get(k) for k in ("inviteType", "state", "appDevices")})
    done = False
    found_ids = found
    found = []  # create-with-group first; fall back to linking an existing record
    for attempt in range(4):
        if found:
            st, d = api("POST", f"/v1/betaGroups/{gid}/relationships/betaTesters", {"data": [{"type": "betaTesters", "id": found[0]["id"]}]})
        else:
            st, d = api("POST", "/v1/betaTesters", {"data": {"type": "betaTesters",
                "attributes": {"email": email, "firstName": ua.get("firstName") or "Tester", "lastName": ua.get("lastName") or "Internal"},
                "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": gid}]}}}})
        if st in (200, 201, 204):
            print("added", email, "to", GROUP, "status", st)
            done = True
            break
        print(f"  attempt {attempt + 1}: {st} {(d.get('error') or '')[:600]}")
        if attempt == 1:
            found = found_ids
        time.sleep(10)
    if not done:
        print(f"::warning::could not add {email} to {GROUP}; see attempts above")
        TESTER_FAIL = True

# 3. build
q = f"/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=20"
if WANT_BUILD:
    q += f"&filter[version]={WANT_BUILD}"
builds = [b for b in must("GET", q)["data"] if b["attributes"].get("processingState") == "VALID"]
if not builds:
    sys.exit(f"::error::no VALID build {WANT_BUILD or '(latest)'} for app {APP}")
build = builds[0]
bnum = build["attributes"]["version"]
if all_builds:
    print("group gets all builds; no attach needed")
else:
    attached = {b["id"] for b in must("GET", f"/v1/betaGroups/{gid}/builds?limit=200")["data"]}
    if build["id"] in attached:
        print("build", bnum, "already in", GROUP)
    else:
        must("POST", f"/v1/betaGroups/{gid}/relationships/builds", {"data": [{"type": "builds", "id": build["id"]}]})
        print("attached build", bnum, "to", GROUP)

# 4. report
time.sleep(3)
detail = must("GET", f"/v1/builds/{build['id']}/buildBetaDetail")["data"]["attributes"]
print(f"BUILD {bnum} processing=VALID internalBuildState={detail.get('internalBuildState')} externalBuildState={detail.get('externalBuildState')}")
for t in must("GET", f"/v1/betaGroups/{gid}/betaTesters?limit=200")["data"]:
    a = t["attributes"]
    print(f"TESTER {a.get('email')} state={a.get('state')} inviteType={a.get('inviteType')}")
summary = os.environ.get("GITHUB_STEP_SUMMARY")
if summary:
    with open(summary, "a") as f:
        f.write(f"### TestFlight internal testing\n- Group: {GROUP} ({gid})\n- Build {bnum}: {detail.get('internalBuildState')}\n")
if TESTER_FAIL:
    sys.exit("::error::one or more testers could not be added")
