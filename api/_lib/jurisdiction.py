"""Jurisdiction exposure (0-15 route-score points) from verifiable facts and official-list data.

    EAEU customs union with Russia     5   no customs border between the country and Russia
    Land border with Russia            3   physical route that avoids EU-controlled transit
    Russia-related designations        7   organisations based there that the EU or US designated under
                                           Russia/Belarus programmes; log-scaled, 200+ = full points
"""

from __future__ import annotations

import json
import math
from functools import lru_cache

from . import config

POINTS = {"eaeu": 5, "land_border": 3, "designations": 7}
FULL_AT = 200


@lru_cache(maxsize=1)
def _designations() -> dict:
    return json.loads((config.DATA_DIR / "jurisdictions.json").read_text(encoding="utf-8"))


def profile(iso2: str) -> dict | None:
    facts = config.INTERMEDIARIES.get(iso2)
    if not facts:
        return None
    n = _designations()["russia_designations"].get(iso2, 0)
    d_share = min(1.0, math.log10(n + 1) / math.log10(FULL_AT + 1))
    factors = [
        {"key": "eaeu", "label": "EAEU customs union with Russia",
         "max": POINTS["eaeu"], "points": POINTS["eaeu"] if facts["eaeu"] else 0, "detail": "yes" if facts["eaeu"] else "no"},
        {"key": "land_border", "label": "Land border with Russia",
         "max": POINTS["land_border"], "points": POINTS["land_border"] if facts["land_border"] else 0,
         "detail": "yes" if facts["land_border"] else "no"},
        {"key": "designations", "label": "Russia-related designations based here",
         "max": POINTS["designations"], "points": round(POINTS["designations"] * d_share, 1),
         "detail": f"{n} organisations"},
    ]
    parts: list[str] = []
    if facts["eaeu"]:
        parts.append("EAEU customs union with Russia (no customs border)")
    if facts["land_border"]:
        parts.append("land border with Russia")
    parts.append(f"{n} organisations based here are designated by the EU or US under Russia/Belarus programmes")
    rationale = "; ".join(parts)
    return {
        "iso2": iso2,
        "name": facts["name"],
        "exposure": round(sum(f["points"] for f in factors), 1),
        "max": sum(POINTS.values()),
        "factors": factors,
        "rationale": rationale[0].upper() + rationale[1:] + ".",
        "as_of": _designations()["meta"]["retrieved"],
        "designations": n,
    }
