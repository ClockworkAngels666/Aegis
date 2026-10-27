"""Module 1b: export-control classification of a 6-digit HS code."""

from __future__ import annotations

import json
import re
from functools import lru_cache

from . import config

TIER_WEIGHT = {"1": 15, "2": 12, "3.A": 9, "3.B": 9, "4.A": 6, "4.B": 6}  # of 15 route-score points
HS_PATTERN = re.compile(r"^\d{6}$")


@lru_cache(maxsize=1)
def chpl() -> dict:
    return json.loads((config.DATA_DIR / "chpl.json").read_text(encoding="utf-8"))


def clean_hs(code: str) -> str:
    return re.sub(r"\D", "", code or "")[:6]


def classify(hs: str) -> dict:
    """Legal status of an HS code under the EU Russia regime and the Dual-Use Regulation."""
    data = chpl()
    item = data["items"].get(hs)
    chapter = hs[:2]
    catch_all = "Catch-all (Art. 4 Reg. 2021/821) applies if you are aware of a military end-use in an embargoed country."
    if item:
        tier = item["tier"]
        return {
            "hs": hs,
            "description": item["description"],
            "chpl": True,
            "tier": tier,
            "tier_label": data["tiers"][tier],
            "criticality_points": TIER_WEIGHT[tier],
            "annex_i_indicative": item["annex_i"],
            "status": "HIGH PRIORITY",
            "obligations": [
                "Listed in Annex XL to Reg. (EU) 833/2014 (Common High Priority Items).",
                "Export, sale or supply to Russia prohibited (Reg. 833/2014; Belarus: Reg. 765/2006).",
                "Art. 12g: contracts with third-country buyers must contractually prohibit re-export to Russia ('No-Russia clause').",
                "Art. 12: knowing and intentional participation in circumvention is itself prohibited.",
            ]
            + (["Dual-use licence required if the item meets Annex I parameters (Art. 3 Reg. 2021/821)."]
               if item["annex_i"] else []),
            "source": f"{data['meta']['title']} ({data['meta']['version']})",
        }
    sensitive = chapter in {"84", "85", "88", "90", "93"}
    return {
        "hs": hs,
        "description": None,
        "chpl": False,
        "tier": None,
        "tier_label": None,
        "criticality_points": 3 if sensitive else 0,
        "annex_i_indicative": [],
        "status": "CHECK PARAMETERS" if sensitive else "NOT LISTED",
        "obligations": (
            [f"Not a Common High Priority Item, but chapter {chapter} goods are often covered by Annexes VII, XI "
                     "or XXIII to Reg. 833/2014 or Annex I to Reg. 2021/821. Classify by technical parameters."]
            if sensitive else
            ["Not a Common High Priority Item. Russia-specific bans may still apply via other annexes to Reg. 833/2014."]
        ) + [catch_all],
        "source": f"{data['meta']['title']} ({data['meta']['version']})",
    }


def catalogue() -> list[dict]:
    data = chpl()
    return [
        {"hs": hs, "tier": it["tier"], "description": it["description"]}
        for hs, it in data["items"].items()
    ]
