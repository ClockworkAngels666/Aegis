"""Company registry lookup via GLEIF, the global Legal Entity Identifier (LEI) index (CC0 data).

Flags: incorporated after the full-scale invasion (24 Feb 2022), lapsed or inactive records,
and an ultimate parent in Russia or Belarus. No LEI at all is common for small traders and
is reported as such, not as a red flag.
"""

from __future__ import annotations

import datetime as dt

import httpx

from . import cache, config
from .names import normalize
from .sanctions import _similarity

API = "https://api.gleif.org/api/v1/lei-records"
INVASION = "2022-02-24"
HEADERS = {"Accept": "application/vnd.api+json"}


def _record(rec: dict, query: str) -> dict:
    a = rec["attributes"]
    e = a["entity"]
    name = e["legalName"]["name"]
    return {
        "lei": a["lei"],
        "name": name,
        "other_names": [n["name"] for n in (e.get("otherNames") or [])][:2],
        "country": e["legalAddress"].get("country"),
        "city": e["legalAddress"].get("city"),
        "created": (e.get("creationDate") or "")[:10] or None,
        "status": e.get("status"),
        "registration_status": a["registration"].get("status"),
        "registered": (a["registration"].get("initialRegistrationDate") or "")[:10],
        "similarity": round(_similarity(normalize(query), normalize(name)), 1),
        "url": f"https://search.gleif.org/#/record/{a['lei']}",
    }


async def _parent(client: httpx.AsyncClient, lei: str) -> dict | None:
    resp = await client.get(f"{API}/{lei}/ultimate-parent")
    if resp.status_code != 200:
        return None
    data = resp.json().get("data")
    if not data:
        return None
    e = data["attributes"]["entity"]
    return {"lei": data["attributes"]["lei"], "name": e["legalName"]["name"], "country": e["legalAddress"].get("country")}


async def lookup(name: str, country: str | None) -> dict:
    key = f"gleif:v1:{country}:{normalize(name)}"
    hit = await cache.get(key)
    if hit is None:
        params = {"filter[fulltext]": name, "page[size]": "8"}
        if country:
            params["filter[entity.legalAddress.country]"] = country
        try:
            async with httpx.AsyncClient(timeout=config.HTTP_TIMEOUT, headers=HEADERS) as client:
                resp = await client.get(API, params=params)
                resp.raise_for_status()
                records = sorted((_record(r, name) for r in resp.json().get("data", [])),
                                 key=lambda r: -r["similarity"])
                records = [r for r in records if r["similarity"] >= 60][:3]
                if records and records[0]["similarity"] >= 85:
                    records[0]["ultimate_parent"] = await _parent(client, records[0]["lei"])
        except (httpx.HTTPError, KeyError, ValueError):
            return {"available": False, "results": [], "flags": [],
                    "note": "The GLEIF register could not be reached; try again later."}
        hit = {"results": records, "retrieved": dt.date.today().isoformat()}
        await cache.set(key, hit, ttl=86400)

    flags = []
    best = hit["results"][0] if hit["results"] and hit["results"][0]["similarity"] >= 85 else None
    if best:
        if best["created"] and best["created"] >= INVASION:
            flags.append({"severity": "high", "text": f"Incorporated on {best['created']}, after Russia's full-scale invasion: a classic shell-company signal."})
        if best["status"] != "ACTIVE" or best["registration_status"] not in ("ISSUED", "PENDING_TRANSFER", "PENDING_ARCHIVAL"):
            flags.append({"severity": "medium", "text": f"Record status {best['status']} / {best['registration_status']}: the LEI is not current."})
        parent = best.get("ultimate_parent")
        if parent and parent.get("country") in ("RU", "BY"):
            flags.append({"severity": "critical", "text": f"Ultimate parent {parent['name']} is registered in {parent['country']}."})
    note = None if hit["results"] else "No LEI record found. Many small traders have none; ask the buyer for registry extracts instead."
    return {"available": True, "results": hit["results"], "flags": flags, "note": note,
            "source": "GLEIF (Global Legal Entity Identifier Foundation), CC0", "retrieved": hit.get("retrieved")}
