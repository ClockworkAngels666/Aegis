"""Module 2b: baseline statistics, Z-scores and the Transshipment (route) Risk Score.

Pure standard-library maths keeps the serverless bundle small and cold starts fast.
"""

from __future__ import annotations

import math
from statistics import NormalDist, fmean, stdev

from . import config, jurisdiction

# HS 2022 subheadings with no HS 2017 equivalent: as-reported data before 2022 is empty,
# so a pre-2022 baseline cannot be built and a jump from zero is a reclassification artefact.
HS2022_NEW = {"852589", "854149", "854151", "854159", "854800", "880730"}

WEIGHTS = {"anomaly": 30, "surge": 20, "materiality": 10, "criticality": 15,
           "jurisdiction": 15, "displacement": 10}


def normalise_weights(custom: dict[str, float] | None) -> dict[str, float]:
    """User weights rescaled to sum to 100; missing keys keep their default share."""
    if not custom:
        return dict(WEIGHTS)
    raw = {k: max(0.0, float(custom.get(k, WEIGHTS[k]))) for k in WEIGHTS}
    total = sum(raw.values())
    return {k: v * 100 / total for k, v in raw.items()} if total > 0 else dict(WEIGHTS)


def _weighted(parts: dict[str, float | None], weights: dict[str, float]) -> int:
    return round(sum((parts[k] or 0) * w for k, w in weights.items()))


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _log_scale(value: float, lo_exp: float, span: float) -> float:
    """0 at 10**lo_exp, 1 at 10**(lo_exp+span)."""
    return _clamp((math.log10(value) - lo_exp) / span) if value > 0 else 0.0


def band(score: float) -> str:
    if score >= 75:
        return "CRITICAL"
    if score >= 50:
        return "HIGH"
    if score >= 25:
        return "MODERATE"
    return "LOW"


def analyse(series: dict, classification: dict, partner: str,
            weights: dict[str, float] | None = None) -> dict:
    years, values, russia = series["years"], series["values"], series["russia"]
    lo, hi = config.BASELINE_YEARS
    base_i = [i for i, y in enumerate(years) if lo <= y <= hi]
    post_i = [i for i, y in enumerate(years) if y >= config.SANCTIONS_YEAR]
    base = [values[i] for i in base_i]
    post = [values[i] for i in post_i]

    hs = classification["hs"]
    reclassified = hs in HS2022_NEW
    has_baseline = len(base) >= 3 and sum(base) > 0 and not reclassified
    mu = fmean(base) if base else 0.0
    sigma = stdev(base) if len(base) >= 2 else 0.0
    emergent = not reclassified and len(base) >= 3 and sum(base) == 0 and sum(post) > 0

    points = []
    for i, (year, value) in enumerate(zip(years, values)):
        prev = values[i - 1] if i else None
        z = (value - mu) / sigma if has_baseline and sigma > 0 else None
        period = "baseline" if i in base_i else "post" if i in post_i else "other"
        flagged = period == "post" and ((z is not None and z > config.Z_THRESHOLD) or (emergent and value > 0))
        points.append({
            "year": year,
            "value": value,
            "russia": russia[i] if i < len(russia) else None,
            "yoy": (value - prev) / prev if prev else None,
            "z": z,
            "p_value": 1 - NormalDist().cdf(z) if z is not None else None,
            "period": period,
            "flagged": flagged,
        })

    post_points = [p for p in points if p["period"] == "post"]
    z_post = [p for p in post_points if p["z"] is not None]
    peak = max(z_post, key=lambda p: p["z"]) if z_post else None
    post_mean = fmean(post) if post else 0.0
    post_max = max(post) if post else 0.0
    multiplier = post_mean / mu if has_baseline and mu > 0 else None

    ru_base = [russia[i] for i in base_i if i < len(russia)]
    ru_post = [russia[i] for i in post_i if i < len(russia)]
    ru_ratio = fmean(ru_post) / fmean(ru_base) if ru_base and ru_post and fmean(ru_base) > 0 else None

    # --- route score components (each 0..1, then weighted) ---
    parts: dict[str, float | None] = {}
    if has_baseline:
        parts["anomaly"] = _clamp(peak["z"] / 6) if peak else (1.0 if sigma == 0 and post_max > mu else 0.0)
        parts["surge"] = _clamp(math.log2(multiplier) / 3) if multiplier and multiplier > 0 else 0.0
        parts["materiality"] = _log_scale(post_max - mu, 5, 2)  # $100k -> 0, $10m -> 1
    elif emergent:
        size = _log_scale(post_max, 4, 2)  # a new flow counts once it is material: $10k -> 0, $1m -> 1
        parts["anomaly"] = size
        parts["surge"] = size
        parts["materiality"] = _log_scale(post_max, 5, 2)
    else:
        parts["anomaly"] = parts["surge"] = None
        parts["materiality"] = _log_scale(post_max, 5, 2) if post else None

    parts["criticality"] = classification["criticality_points"] / 15
    profile = jurisdiction.profile(partner)
    parts["jurisdiction"] = (profile["exposure"] / profile["max"]) if profile else 0.0

    rise = _clamp(math.log2(multiplier) / 2) if multiplier and multiplier > 1 else (1.0 if emergent else 0.0)
    if ru_ratio is not None and (has_baseline or emergent):
        parts["displacement"] = _clamp((1 - ru_ratio) / 0.8) * rise
    else:
        parts["displacement"] = None

    w = normalise_weights(weights)
    components = [
        {"key": k, "weight": round(wk, 1), "default_weight": WEIGHTS[k], "share": parts[k],
         "points": round(parts[k] * wk, 1) if parts[k] is not None else None}
        for k, wk in w.items()
    ]
    score = _weighted(parts, w)
    # Does the conclusion depend on the weighting? Re-score with every component weighted equally.
    equal = _weighted(parts, {k: 100 / len(WEIGHTS) for k in WEIGHTS})
    default = _weighted(parts, WEIGHTS)

    if reclassified:
        note = "HS 2022 subheading: no comparable pre-2022 baseline, so statistical components are excluded."
    elif emergent:
        note = "No exports in the 2017-2021 baseline: any post-2022 flow is a new trade relationship."
    elif not has_baseline:
        note = "Too little pre-war trade for a reliable comparison."
    else:
        note = None

    return {
        "points": points,
        "baseline": {"years": [years[i] for i in base_i], "mean": mu, "std": sigma,
                     "upper": mu + config.Z_THRESHOLD * sigma},
        "post_mean": post_mean,
        "multiplier": multiplier,
        "z_max": peak["z"] if peak else None,
        "z_max_year": peak["year"] if peak else None,
        "flagged_years": [p["year"] for p in post_points if p["flagged"]],
        "emergent": emergent,
        "russia_ratio": ru_ratio,
        "diversion_pattern": bool(ru_ratio is not None and ru_ratio < 0.5 and rise >= 0.5),
        "score": score,
        "band": band(score),
        "components": components,
        "custom_weights": w != WEIGHTS,
        "sensitivity": {
            "default": {"score": default, "band": band(default)},
            "equal": {"score": equal, "band": band(equal)},
        },
        "jurisdiction_profile": profile,
        "note": note,
        "threshold": config.Z_THRESHOLD,
    }


# ----------------------------------------------------------------------------- price per kg

def unit_values(series: dict) -> dict | None:
    """Value per kilogram, baseline vs post-2022. A large shift can signal misdeclared goods
    (or simply a different product mix): a prompt for questions, not proof."""
    kg = series.get("kg")
    if not kg:
        return None
    years, values = series["years"], series["values"]
    per_kg = [round(v / k, 2) if k >= 10 else None for v, k in zip(values, kg)]
    lo, hi = config.BASELINE_YEARS

    def pooled(sel) -> tuple[float | None, float]:
        v = sum(values[i] for i, y in enumerate(years) if sel(y) and kg[i] >= 10)
        k = sum(kg[i] for i, y in enumerate(years) if sel(y) and kg[i] >= 10)
        return (v / k if k else None), k

    base, _ = pooled(lambda y: lo <= y <= hi)
    post, post_kg = pooled(lambda y: y >= config.SANCTIONS_YEAR)
    change = post / base if base and post else None
    return {
        "years": years,
        "per_kg": per_kg,
        "kg": kg,
        "baseline": base,
        "post": post,
        "change": change,
        "flag": bool(change and post_kg >= 100 and (change >= 2 or change <= 0.5)),
    }


# ----------------------------------------------------------------------------- monthly view

PRE_WAR_LAST_MONTH = "2022-01"
REFERENCE_YEAR = 2021


def monthly_stats(m: dict) -> dict | None:
    """Monthly Z-scores against the pre-invasion months, and this year so far vs the same months of 2021."""
    months, values = m.get("months") or [], m.get("values") or []
    if not months:
        return None
    base = [v for mo, v in zip(months, values) if mo <= PRE_WAR_LAST_MONTH]
    mu = fmean(base) if base else 0.0
    sd = stdev(base) if len(base) >= 2 else 0.0
    z = [round((v - mu) / sd, 2) if sd > 0 and mo >= "2022-03" else None for mo, v in zip(months, values)]
    flagged = [mo for mo, zz in zip(months, z) if zz is not None and zz > config.Z_THRESHOLD]

    latest = months[-1]
    year, upto = int(latest[:4]), int(latest[5:])
    ytd = sum(v for mo, v in zip(months, values) if mo.startswith(f"{year}-") and int(mo[5:]) <= upto)
    ref = sum(v for mo, v in zip(months, values) if mo.startswith(f"{REFERENCE_YEAR}-") and int(mo[5:]) <= upto)
    last12 = sum(values[-12:])
    ref12 = sum(v for mo, v in zip(months, values) if mo.startswith(f"{REFERENCE_YEAR}-"))
    return {
        "months": months,
        "values": values,
        "russia": m.get("russia"),
        "unit": m.get("unit", "EUR"),
        "source": m.get("source"),
        "baseline": {"from": months[0], "to": PRE_WAR_LAST_MONTH, "mean": mu, "std": sd,
                     "upper": mu + config.Z_THRESHOLD * sd},
        "z": z,
        "flagged": flagged,
        "latest": latest,
        "ytd": {"year": year, "through_month": upto, "value": ytd, "reference_year": REFERENCE_YEAR,
                "reference_value": ref, "ratio": ytd / ref if ref > 0 else None},
        "last12": {"value": last12, "reference_value": ref12, "ratio": last12 / ref12 if ref12 > 0 else None},
    }
