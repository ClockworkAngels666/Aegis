"""Eurostat Comext client: EU exports by HS6 product (dataset DS-045409, values in EUR).

One request returns every period for several partners, products and indicators, without
an API key. Annual periods are "2024"; monthly periods are "2024-07".
"""

from __future__ import annotations

import httpx

from . import config

URL = "https://ec.europa.eu/eurostat/api/comext/dissemination/statistics/1.0/data/DS-045409"
VALUE = "VALUE_IN_EUROS"
WEIGHT = "QUANTITY_IN_100KG"
MONTHLY_START = "2019-01"
_TO_COMEXT = {"RS": "XS"}  # Comext geonomenclature differs from ISO for Serbia
_FROM_COMEXT = {v: k for k, v in _TO_COMEXT.items()}

Cells = dict[tuple[str, str, str, str], float]  # (indicator, partner ISO2, HS6, period) -> value


def _params(exporter: str, partners: list[str], products: list[str], freq: str,
            indicators: tuple[str, ...]) -> list[tuple[str, str]]:
    since = str(config.BASELINE_YEARS[0]) if freq == "A" else MONTHLY_START
    p = [("format", "JSON"), ("lang", "EN"), ("freq", freq), ("reporter", exporter), ("flow", "2"),
         ("sinceTimePeriod", since)]
    p += [("indicators", i) for i in indicators]
    p += [("partner", _TO_COMEXT.get(x, x)) for x in partners]
    p += [("product", c) for c in products]
    return p


def _parse(body: dict) -> tuple[Cells, list[str]]:
    """Decode a JSON-stat 2.0 response into cells plus the periods that have data (in order)."""
    dims, sizes = body["id"], body["size"]
    labels = [{pos: code for code, pos in body["dimension"][d]["category"]["index"].items()} for d in dims]
    cells: Cells = {}
    for flat, value in body.get("value", {}).items():
        rest, coord = int(flat), {}
        for d, size, lab in zip(reversed(dims), reversed(sizes), reversed(labels)):
            coord[d] = lab[rest % size]
            rest //= size
        partner = _FROM_COMEXT.get(coord["partner"], coord["partner"])
        indicator = coord.get("indicators", VALUE)
        cells[(indicator, partner, coord["product"], coord["time"])] = float(value or 0)
    all_periods = sorted(body["dimension"]["time"]["category"]["index"], key=lambda p: body["dimension"]["time"]["category"]["index"][p])
    seen = {p for _, _, _, p in cells}
    last = max((i for i, p in enumerate(all_periods) if p in seen), default=-1)
    return cells, all_periods[: last + 1]


def fetch(client: httpx.Client, exporter: str, partners: list[str], products: list[str], freq: str = "A",
          indicators: tuple[str, ...] = (VALUE,)) -> tuple[Cells, list[str]]:
    resp = client.get(URL, params=_params(exporter, partners, products, freq, indicators))
    resp.raise_for_status()
    return _parse(resp.json())


async def afetch(client: httpx.AsyncClient, exporter: str, partners: list[str], products: list[str],
                 freq: str = "A", indicators: tuple[str, ...] = (VALUE,)) -> tuple[Cells, list[str]]:
    resp = await client.get(URL, params=_params(exporter, partners, products, freq, indicators))
    resp.raise_for_status()
    return _parse(resp.json())
