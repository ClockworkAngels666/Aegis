"""Module 2a: bilateral export series, exporter-reported, with cached fallbacks.

Exports *reported by the EU exporter* are used rather than the intermediary's
imports: EU customs data is timely and reliable, while intermediaries may
under-report onward flows (mirror-statistics problem).

Sources, in order: Eurostat Comext (one keyless call, EUR) -> UN Comtrade
(USD; keyed call, or paced keyless calls) -> bundled Eurostat snapshot.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import gzip
import json
import time
from functools import lru_cache

import httpx

from . import cache, config, eurostat

PREVIEW_URL = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"
DATA_URL = "https://comtradeapi.un.org/data/v1/get/C/A/HS"
PREVIEW_SPACING = 1.6  # the keyless endpoint allows roughly one request every 1-2 s
LIVE_DEADLINE = 45  # seconds; stays inside the 60 s function limit (vercel.json)


@lru_cache(maxsize=1)
def bundled() -> dict:
    return json.loads((config.DATA_DIR / "trade_cache.json").read_text(encoding="utf-8"))


def _from_bundle(exporter: str, partner: str, hs: str) -> dict | None:
    data = bundled()
    try:
        values = data["data"][exporter][partner][hs]
        russia = data["data"][exporter][config.RUSSIA][hs]
    except KeyError:
        return None
    kg = data.get("kg", {}).get(exporter, {}).get(partner, {}).get(hs)
    return {
        "years": data["meta"]["years"],
        "values": values,
        "russia": russia,
        "kg": kg,
        "unit": data["meta"]["unit"],
        "source": data["meta"]["source"],
        "retrieved": data["meta"]["retrieved"],
    }


async def _fetch_eurostat(exporter: str, partner: str, hs: str) -> dict:
    async with httpx.AsyncClient(timeout=config.HTTP_TIMEOUT) as client:
        cells, periods = await eurostat.afetch(client, exporter, [partner, config.RUSSIA], [hs], "A",
                                               (eurostat.VALUE, eurostat.WEIGHT))
    if not periods:
        raise LookupError("No reported trade for this combination.")
    return {
        "years": [int(y) for y in periods],
        "values": [round(cells.get((eurostat.VALUE, partner, hs, y), 0.0)) for y in periods],
        "russia": [round(cells.get((eurostat.VALUE, config.RUSSIA, hs, y), 0.0)) for y in periods],
        "kg": [round(cells.get((eurostat.WEIGHT, partner, hs, y), 0.0) * 100) for y in periods],
        "unit": "EUR",
        "source": "Eurostat Comext (DS-045409)",
        "retrieved": dt.date.today().isoformat(),
    }


async def _comtrade_rows(client: httpx.AsyncClient, params: dict, keyed: bool) -> list[dict]:
    url = DATA_URL if keyed else PREVIEW_URL
    headers = {"Ocp-Apim-Subscription-Key": config.COMTRADE_API_KEY} if keyed else {}
    resp = await client.get(url, params=params, headers=headers)
    resp.raise_for_status()
    body = resp.json()
    if body.get("error"):
        raise httpx.HTTPError(str(body["error"]))
    return body.get("data") or []


async def _preview_with_backoff(client: httpx.AsyncClient, params: dict, deadline: float) -> list[dict]:
    while True:
        try:
            return await _comtrade_rows(client, params, keyed=False)
        except httpx.HTTPStatusError as exc:
            try:
                wait = float(exc.response.headers.get("retry-after", 2)) + 0.3
            except ValueError:
                wait = 2.3
            if exc.response.status_code != 429 or time.monotonic() + wait > deadline:
                raise
            await asyncio.sleep(wait)


async def _fetch_comtrade(exporter: str, partner: str, hs: str) -> dict:
    reporter = config.EXPORTERS[exporter]["m49"]
    if not reporter:
        raise LookupError("No UN Comtrade equivalent for this exporter.")
    p_m49 = config.INTERMEDIARIES[partner]["m49"]
    ru_m49 = config.REFERENCE_PARTNERS[config.RUSSIA]["m49"]
    years = list(range(config.BASELINE_YEARS[0], dt.date.today().year))
    base = {
        "reporterCode": reporter, "partnerCode": f"{p_m49},{ru_m49}", "cmdCode": hs,
        "flowCode": "X", "customsCode": "C00", "motCode": "0", "partner2Code": "0",
    }
    keyed = bool(config.COMTRADE_API_KEY)
    async with httpx.AsyncClient(timeout=config.HTTP_TIMEOUT) as client:
        if keyed:
            rows = await _comtrade_rows(client, {**base, "period": ",".join(map(str, years))}, True)
        else:
            # The keyless preview endpoint allows one period per call and rate-limits
            # bursts, so years are fetched one by one, backing off on HTTP 429.
            deadline = time.monotonic() + LIVE_DEADLINE
            rows = []
            for year in years:
                rows += await _preview_with_backoff(client, {**base, "period": str(year)}, deadline)
                await asyncio.sleep(PREVIEW_SPACING)

    seen_years = {int(r["period"]) for r in rows}
    while years and years[-1] not in seen_years:  # drop years not yet reported
        years.pop()
    if not years:
        raise LookupError("No reported trade for this combination.")
    totals: dict[tuple[str, int], float] = {}
    weight: dict[int, float] = {}
    for r in rows:
        key = (str(r["partnerCode"]), int(r["period"]))
        totals[key] = totals.get(key, 0.0) + float(r.get("primaryValue") or 0)
        if key[0] == p_m49:
            weight[key[1]] = weight.get(key[1], 0.0) + float(r.get("netWgt") or 0)
    return {
        "years": years,
        "values": [round(totals.get((p_m49, y), 0.0)) for y in years],
        "russia": [round(totals.get((ru_m49, y), 0.0)) for y in years],
        "kg": [round(weight.get(y, 0.0)) for y in years],
        "unit": "USD",
        "source": "UN Comtrade API" + (" v1" if keyed else " (public preview)"),
        "retrieved": dt.date.today().isoformat(),
    }


async def get_series(exporter: str, partner: str, hs: str, live: bool) -> dict:
    """Return the export series, never raising for upstream failures."""
    bundle = _from_bundle(exporter, partner, hs)
    if not live and bundle:
        return {**bundle, "mode": "demo"}

    key = f"trade:v2:{exporter}:{partner}:{hs}"
    hit = await cache.get(key)
    if hit:
        return {**hit, "mode": "cached"}
    errors = []
    for fetch in (_fetch_eurostat, _fetch_comtrade):
        try:
            series = await fetch(exporter, partner, hs)
            await cache.set(key, series)
            return {**series, "mode": "live"}
        except (httpx.HTTPError, LookupError, ValueError, KeyError) as exc:
            errors.append(type(exc).__name__)
    if bundle:
        return {**bundle, "mode": "fallback",
                "warning": f"Live sources failed ({', '.join(errors)}); showing bundled data."}
    return {
        "years": [], "values": [], "russia": [], "unit": "EUR", "mode": "unavailable",
        "source": "Eurostat / UN Comtrade", "retrieved": None,
        "warning": "No bundled data for this combination and the live sources failed. Try again later.",
    }


# ----------------------------------------------------------------------------- monthly and all-partner views

@lru_cache(maxsize=1)
def bundled_monthly() -> dict | None:
    path = config.DATA_DIR / "trade_monthly.json.gz"
    if not path.exists():
        return None
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


async def get_monthly(exporter: str, partner: str, hs: str, live: bool) -> dict | None:
    """Monthly exports since 2019 (Eurostat); None when unavailable."""
    data = bundled_monthly()
    bundle = None
    if data and exporter in data["data"]:
        try:
            bundle = {"months": data["meta"]["months"], "values": data["data"][exporter][partner][hs],
                      "russia": data["data"][exporter][config.RUSSIA][hs], "unit": "EUR",
                      "source": data["meta"]["source"], "mode": "demo"}
        except KeyError:
            bundle = None
    if bundle and not live:
        return bundle
    key = f"monthly:v1:{exporter}:{partner}:{hs}"
    hit = await cache.get(key)
    if hit:
        return {**hit, "mode": "cached"}
    try:
        async with httpx.AsyncClient(timeout=config.HTTP_TIMEOUT) as client:
            cells, months = await eurostat.afetch(client, exporter, [partner, config.RUSSIA], [hs], "M")
        if not months:
            return bundle
        series = {"months": months,
                  "values": [round(cells.get((eurostat.VALUE, partner, hs, m), 0.0)) for m in months],
                  "russia": [round(cells.get((eurostat.VALUE, config.RUSSIA, hs, m), 0.0)) for m in months],
                  "unit": "EUR", "source": "Eurostat Comext (DS-045409), monthly"}
        await cache.set(key, series)
        return {**series, "mode": "live"}
    except (httpx.HTTPError, KeyError, ValueError):
        return bundle


def flows(exporter: str, hs: str) -> dict | None:
    """Annual exports of one product to every intermediary and to Russia (bundled exporters only)."""
    data = bundled()
    if exporter not in data["data"]:
        return None
    partners = [*config.INTERMEDIARIES, config.RUSSIA]
    series = {p: data["data"][exporter][p][hs] for p in partners if hs in data["data"][exporter].get(p, {})}
    if not series:  # the bundle holds the listed items only
        return None
    return {"years": data["meta"]["years"], "unit": data["meta"]["unit"], "partners": series}
