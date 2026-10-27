"""Radar: route scores for every high-priority item x intermediary, from the bundled data."""

from __future__ import annotations

from functools import lru_cache

from . import anomaly, config, hs_codes, trade


def _ytd_ratio(exporter: str, partner: str, hs: str) -> float | None:
    data = trade.bundled_monthly()
    if not data or exporter not in data["data"]:
        return None
    try:
        values = data["data"][exporter][partner][hs]
    except KeyError:
        return None
    stats = anomaly.monthly_stats({"months": data["meta"]["months"], "values": values})
    return stats["ytd"]["ratio"] if stats else None


@lru_cache(maxsize=4)
def matrix(exporter: str) -> dict | None:
    if exporter not in trade.bundled()["data"]:
        return None
    partners = list(config.INTERMEDIARIES)
    rows = []
    for item in hs_codes.catalogue():
        hs = item["hs"]
        classification = hs_codes.classify(hs)
        cells = []
        for p in partners:
            series = trade._from_bundle(exporter, p, hs)
            a = anomaly.analyse(series, classification, p)
            cells.append({
                "partner": p,
                "score": a["score"],
                "band": a["band"],
                "multiplier": a["multiplier"],
                "emergent": a["emergent"],
                "diversion": a["diversion_pattern"],
                "latest": series["values"][-1],
                "spark": series["values"],
                "ytd": _ytd_ratio(exporter, p, hs),
            })
        rows.append({**item, "max": max(c["score"] for c in cells), "cells": cells})
    flat = [{"hs": r["hs"], "description": r["description"], "tier": r["tier"], **c} for r in rows for c in r["cells"]]
    top = sorted(flat, key=lambda c: (-c["score"], -(c["latest"] or 0)))[:12]
    counts = {b: sum(c["band"] == b for c in flat) for b in ("CRITICAL", "HIGH", "MODERATE", "LOW")}
    months = (trade.bundled_monthly() or {}).get("meta", {}).get("months", [])
    return {
        "exporter": exporter,
        "exporter_name": config.EXPORTERS[exporter]["name"],
        "years": trade.bundled()["meta"]["years"],
        "latest_month": months[-1] if months else None,
        "partners": [{"code": p, "name": config.INTERMEDIARIES[p]["name"]} for p in partners],
        "rows": rows,
        "top": top,
        "counts": counts,
    }
