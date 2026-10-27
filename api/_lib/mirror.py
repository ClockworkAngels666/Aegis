"""Mirror statistics: compare what Germany reports exporting with what the intermediary
reports importing from Germany, and what the intermediary reports exporting to Russia.

All three series come from UN Comtrade (USD, as reported), bundled by scripts/build_cache.py.
A large gap between the two sides, or a jump in the intermediary's own exports to Russia,
is a standard trade-forensics prompt for questions, not proof.
"""

from __future__ import annotations

import gzip
import json
from functools import lru_cache
from statistics import fmean

from . import config


@lru_cache(maxsize=1)
def _data() -> dict | None:
    path = config.DATA_DIR / "mirror.json.gz"
    if not path.exists():
        return None
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def meta() -> dict | None:
    d = _data()
    return d["meta"] if d else None


def get(exporter: str, partner: str, hs: str) -> dict | None:
    d = _data()
    # Mirror data is bundled for Germany and the listed items only
    if not d or exporter != "DE" or hs not in d["de_exports"].get(partner, {}):
        return None
    years = d["meta"]["years"]
    de = d["de_exports"][partner][hs]
    imp = d["imports_from_de"][partner][hs]
    onward = d["exports_to_ru"][partner][hs]
    reported = set(d["reported"].get(partner, []))

    # Latest year both sides reported and Germany shipped something material.
    gap = gap_year = None
    for i in range(len(years) - 1, -1, -1):
        if years[i] in reported and de[i] >= 10_000 and imp[i] is not None:
            gap, gap_year = max(0.0, (de[i] - imp[i]) / de[i]), years[i]
            break

    lo, hi = config.BASELINE_YEARS
    pre = [v for y, v in zip(years, onward) if lo <= y <= hi and v is not None]
    post = [v for y, v in zip(years, onward) if y >= config.SANCTIONS_YEAR and v is not None]
    onward_multiplier = fmean(post) / fmean(pre) if pre and post and fmean(pre) > 0 else None
    return {
        "years": years,
        "unit": d["meta"]["unit"],
        "source": d["meta"]["source"],
        "de_exports": de,
        "imports_from_de": imp,
        "exports_to_ru": onward,
        "reported_years": sorted(reported),
        "gap": gap,
        "gap_year": gap_year,
        "onward_multiplier": onward_multiplier,
    }


def sankey(exporter: str, hs: str) -> dict | None:
    """Flows for the latest year with partner reporting: Germany -> intermediaries -> Russia (USD)."""
    d = _data()
    if not d or exporter != "DE" or not any(hs in d["de_exports"].get(iso, {}) for iso in config.INTERMEDIARIES):
        return None
    years = d["meta"]["years"]
    # pick the latest year in which most intermediaries reported
    counts = {y: sum(y in set(v) for v in d["reported"].values()) for y in years}
    year = max((y for y in years if counts[y] >= max(counts.values()) - 1), default=years[-1])
    i = years.index(year)
    links = []
    for iso in config.INTERMEDIARIES:
        if hs not in d["de_exports"].get(iso, {}):
            continue
        de = d["de_exports"][iso][hs][i]
        out = d["exports_to_ru"][iso][hs][i]
        links.append({"partner": iso, "from_exporter": de, "to_russia": out,
                      "reported": year in set(d["reported"].get(iso, []))})
    return {"year": year, "unit": d["meta"]["unit"], "links": links}
