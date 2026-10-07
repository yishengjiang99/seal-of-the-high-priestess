#!/usr/bin/env python3
"""Read-only App Store Connect status for Temple of the High Priestess. Changes nothing."""
import json
from asc_common import APP, BUNDLE_ID, api, get_all


def show(title, st, d, keys=None):
    print(f"\n== {title} ({st})")
    if st != 200:
        print(d.get("error", "")[:800]); return
    data = d.get("data")
    items = data if isinstance(data, list) else [data] if data else []
    for x in items:
        a = x.get("attributes", {})
        if keys:
            a = {k: a.get(k) for k in keys}
        print(x.get("type"), x.get("id"), json.dumps(a, sort_keys=True)[:3000])


st, d = api("GET", f"/v1/apps/{APP}")
show("app", st, d)
st, d = api("GET", f"/v1/apps/{APP}/appStoreVersions?limit=10")
show("appStoreVersions", st, d, ["versionString", "appStoreState", "platform", "releaseType", "copyright"])
versions = d.get("data", []) if st == 200 else []
for v in versions[:2]:
    st, r = api("GET", f"/v1/appStoreVersions/{v['id']}/appStoreReviewDetail")
    show(f"reviewDetail {v['attributes']['versionString']}", st, r, ["contactFirstName", "contactLastName", "contactEmail", "demoAccountRequired", "notes"])
    st, r = api("GET", f"/v1/appStoreVersions/{v['id']}/build")
    show(f"build of {v['attributes']['versionString']}", st, r, ["version", "processingState"])
st, d = api("GET", f"/v1/apps/{APP}/appInfos")
show("appInfos", st, d)
for info in d.get("data", []) if st == 200 else []:
    st, r = api("GET", f"/v1/appInfos/{info['id']}/ageRatingDeclaration")
    show(f"ageRatingDeclaration ({info['attributes'].get('appStoreState') or info['attributes'].get('state')})", st, r)
    st, r = api("GET", f"/v1/appInfos/{info['id']}/primaryCategory")
    show("primaryCategory", st, r, [])
st, d = api("GET", f"/v1/apps/{APP}/gameCenterDetail")
show("gameCenterDetail", st, d)
st, d = api("GET", f"/v1/bundleIds?filter[identifier]={BUNDLE_ID}&include=bundleIdCapabilities")
show("bundleId", st, d, ["identifier", "name", "platform"])
for inc in d.get("included", []) if st == 200 else []:
    print("  capability", inc["attributes"].get("capabilityType"))
st, d = api("GET", "/v1/profiles?limit=50&filter[profileType]=IOS_APP_STORE")
show("App Store profiles", st, d, ["name", "profileState", "expirationDate"])
for x in get_all(f"/v1/apps/{APP}/inAppPurchasesV2?limit=50"):
    a = x["attributes"]; print("IAP", a["productId"], a.get("state"))
