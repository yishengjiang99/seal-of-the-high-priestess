"""Shared App Store Connect API helpers (JWT auth from the APP_STORE_CONNECT_* env vars; never prints them)."""
import json, os, sys, time, urllib.error, urllib.request

import jwt

APP = os.environ.get("ASC_APP_ID", "6819973123").strip()
BUNDLE_ID = os.environ.get("BUNDLE_ID", "com.ragnus.weather").strip()
_P8 = os.environ["APP_STORE_CONNECT_API_KEY_P8"].replace("\\n", "\n").strip()
BASE = "https://api.appstoreconnect.apple.com"


def tok():
    now = int(time.time())
    return jwt.encode({"iss": os.environ["APP_STORE_CONNECT_ISSUER_ID"].strip(), "iat": now, "exp": now + 1100,
                       "aud": "appstoreconnect-v1"}, _P8, algorithm="ES256",
                      headers={"kid": os.environ["APP_STORE_CONNECT_KEY_ID"].strip()})


def api(method, path, body=None, raw=None, headers=None):
    url = path if path.startswith("http") else BASE + path
    h = {"Authorization": "Bearer " + tok(), "Content-Type": "application/json"}
    h.update(headers or {})
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, method=method, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            txt = r.read().decode() or "{}"
            try:
                return r.status, json.loads(txt)
            except json.JSONDecodeError:
                return r.status, {"raw": txt[:500]}
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode()[:3000]}


class ASCError(RuntimeError):
    pass


def must(method, path, body=None, what=""):
    st, d = api(method, path, body)
    if st not in (200, 201, 204):
        msg = f"{what or method + ' ' + path} -> {st}: {d.get('error')}"
        print("::error::" + msg[:3000])
        raise ASCError(msg)
    return d


def get_all(path):
    out, url = [], path
    while url:
        d = must("GET", url)
        out += d.get("data", []) if isinstance(d.get("data"), list) else [d["data"]] if d.get("data") else []
        url = (d.get("links") or {}).get("next")
    return out


def upload_asset(reserve, data):
    """Run uploadOperations from a reserved asset (screenshot / image)."""
    for op in reserve["attributes"]["uploadOperations"]:
        chunk = data[op["offset"]:op["offset"] + op["length"]]
        req = urllib.request.Request(op["url"], method=op["method"], data=chunk,
                                     headers={h["name"]: h["value"] for h in op.get("requestHeaders", [])})
        urllib.request.urlopen(req, timeout=180).read()


def editable_version(platform="IOS"):
    """The app's App Store version that can still be edited (PREPARE_FOR_SUBMISSION etc.), or None."""
    vs = get_all(f"/v1/apps/{APP}/appStoreVersions?filter[platform]={platform}&limit=20")
    for v in vs:
        if v["attributes"].get("appStoreState") in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED",
                                                    "METADATA_REJECTED", "INVALID_BINARY"):
            return v
    return None
