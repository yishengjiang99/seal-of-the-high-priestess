#!/usr/bin/env python3
"""App availability + price schedule for Temple of the High Priestess. Idempotent; never submits anything.

Target: the app is FREE (price point $0, base territory USA) and available in ALL territories, with
availableInNewTerritories=true (appAvailabilityV2 via POST /v2/appAvailabilities). IAP prices are not touched.
Env: APP_STORE_CONNECT_* (via asc_common), [DRY_RUN=1]
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from asc_common import APP, api, must, get_all, ASCError

DRY = os.environ.get("DRY_RUN") == "1"


def current_availability():
    st, d = api("GET", f"/v1/apps/{APP}/appAvailabilityV2")
    if st == 404 or (st == 200 and not d.get("data")):
        return None, None
    if st != 200:
        print(f"::warning::GET appAvailabilityV2 -> {st}: {str(d.get('error'))[:1500]}")
        return None, None
    av = d["data"]
    tas = get_all(f"/v2/appAvailabilities/{av['id']}/territoryAvailabilities?limit=200")
    return av, tas


def show_avail(av, tas, label):
    if not av:
        print(f"[{label}] no appAvailabilityV2 exists"); return
    on = sorted(t["relationships"]["territory"]["data"]["id"] for t in tas if t["attributes"].get("available"))
    off = sorted(t["relationships"]["territory"]["data"]["id"] for t in tas if not t["attributes"].get("available"))
    print(f"[{label}] id={av['id']} availableInNewTerritories={av['attributes'].get('availableInNewTerritories')} "
          f"territoryAvailabilities={len(tas)} available={len(on)} unavailable={len(off)}")
    if off:
        print("  unavailable:", ",".join(off))
        for t in tas:
            if not t["attributes"].get("available"):
                print("   ", t["relationships"]["territory"]["data"]["id"], json.dumps(t["attributes"]))


def price_state():
    st, d = api("GET", f"/v1/apps/{APP}/appPriceSchedule?include=baseTerritory")
    if st != 200:
        print(f"[price] GET appPriceSchedule -> {st}: {str(d.get('error'))[:1500]}")
        return None, None, []
    sched = d["data"]
    base = ((sched.get("relationships") or {}).get("baseTerritory") or {}).get("data") or {}
    st, mp = api("GET", f"/v1/appPriceSchedules/{sched['id']}/manualPrices?include=appPricePoint&limit=50")
    prices = []
    if st == 200:
        inc = {i["id"]: i for i in mp.get("included", [])}
        for m in mp.get("data", []):
            pp = (m["relationships"]["appPricePoint"]["data"] or {}).get("id")
            prices.append({"start": m["attributes"].get("startDate"), "end": m["attributes"].get("endDate"),
                           "customerPrice": (inc.get(pp) or {}).get("attributes", {}).get("customerPrice"), "pp": pp})
    else:
        print(f"[price] GET manualPrices -> {st}: {str(mp.get('error'))[:1500]}")
    return sched, base.get("id"), prices


def show_price(label):
    sched, base, prices = price_state()
    print(f"[{label}] scheduleId={sched and sched['id']} baseTerritory={base} manualPrices={json.dumps(prices)}")
    return sched, base, prices


def is_free(base, prices):
    return base == "USA" and len(prices) >= 1 and all(p["customerPrice"] in ("0", "0.0", "0.00") for p in prices
                                                      if not p["end"])


def main():
    ok = True
    print(f"app {APP} dry_run={DRY}")
    territories = [t["id"] for t in get_all("/v1/territories?limit=200")]
    print(f"territories known to ASC: {len(territories)}")

    # ---- price ----
    sched, base, prices = show_price("price before")
    if is_free(base, prices):
        print("price: already free in USA, nothing to do")
    elif DRY:
        print("price: WOULD set free tier")
    else:
        pts = get_all(f"/v1/apps/{APP}/appPricePoints?filter[territory]=USA&limit=200")
        free = [p for p in pts if p["attributes"].get("customerPrice") in ("0", "0.0", "0.00")]
        if not free:
            raise ASCError("no $0 app price point found for USA")
        body = {"data": {"type": "appPriceSchedules", "relationships": {
                    "app": {"data": {"type": "apps", "id": APP}},
                    "baseTerritory": {"data": {"type": "territories", "id": "USA"}},
                    "manualPrices": {"data": [{"type": "appPrices", "id": "${price0}"}]}}},
                "included": [{"type": "appPrices", "id": "${price0}", "attributes": {"startDate": None},
                              "relationships": {"appPricePoint": {"data": {"type": "appPricePoints", "id": free[0]["id"]}}}}]}
        must("POST", "/v1/appPriceSchedules", body, "set free app price schedule")
        print("price: set free tier (USA)")
        _, base, prices = show_price("price after")
        ok &= is_free(base, prices)

    # ---- availability ----
    av, tas = current_availability()
    show_avail(av, tas, "availability before")
    have_all = (av and av["attributes"].get("availableInNewTerritories") is True and tas
                and all(t["attributes"].get("available") for t in tas)
                and set(territories) <= {t["relationships"]["territory"]["data"]["id"] for t in tas})
    if have_all:
        print("availability: already all territories + new territories, nothing to do")
    elif DRY:
        print("availability: WOULD (re)create with all territories")
    else:
        body = {"data": {"type": "appAvailabilities", "attributes": {"availableInNewTerritories": True},
                         "relationships": {
                             "app": {"data": {"type": "apps", "id": APP}},
                             "territoryAvailabilities": {"data": [{"type": "territoryAvailabilities", "id": "${t%d}" % i}
                                                                  for i in range(len(territories))]}}},
                "included": [{"type": "territoryAvailabilities", "id": "${t%d}" % i, "attributes": {"available": True},
                              "relationships": {"territory": {"data": {"type": "territories", "id": t}}}}
                             for i, t in enumerate(territories)]}
        st, d = api("POST", "/v2/appAvailabilities", body)
        print(f"POST /v2/appAvailabilities -> {st}")
        if st not in (200, 201):
            print("::error::" + str(d.get("error"))[:3000])
            ok = False
    av, tas = current_availability()
    show_avail(av, tas, "availability after")
    on = {t["relationships"]["territory"]["data"]["id"] for t in (tas or []) if t["attributes"].get("available")}
    missing = sorted(set(territories) - on)
    print(f"RESULT availableTerritories={len(on)}/{len(territories)} missing={missing} "
          f"availableInNewTerritories={av and av['attributes'].get('availableInNewTerritories')}")
    show_price("price final")
    if not DRY and (missing or not av or not av["attributes"].get("availableInNewTerritories")):
        ok = False
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
