"""Module 1a: entity and UBO screening against EU, US OFAC and UN sanctions lists.

Default: a bundled snapshot of the official publications (EU Consolidated
Financial Sanctions List, OFAC SDN List, UN Security Council Consolidated List)
with local fuzzy matching (Levenshtein + token logic over transliterated,
legal-form-stripped names). Optional: the OpenSanctions /match API when
OPENSANCTIONS_API_KEY is set (subject to its own licence).
"""

from __future__ import annotations

import gzip
import json
from functools import lru_cache

import httpx
from rapidfuzz import fuzz, process
from rapidfuzz.distance import Levenshtein

from . import cache, config
from .names import distinctive, normalize

MATCH_AT = 93
PARTIAL_AT = 80
LIST_LABELS = {"eu_fsf": "EU", "us_ofac_sdn": "OFAC", "un_sc_sanctions": "UN",
               "gb_hmt_sanctions": "UK", "ch_seco_sanctions": "CH"}
API_URL = "https://api.opensanctions.org/match/sanctions"


@lru_cache(maxsize=1)
def _index():
    with gzip.open(config.DATA_DIR / "sanctions_index.json.gz", "rt", encoding="utf-8") as fh:
        raw = json.load(fh)
    pools: dict[str, tuple[list[str], list[int]]] = {"O": ([], []), "P": ([], [])}
    for idx, ent in enumerate(raw["entities"]):
        names, refs = pools[ent[1]]
        for name in (ent[2], *ent[3]):
            norm = normalize(name)
            if norm:
                names.append(norm)
                refs.append(idx)
    return raw["meta"], raw["entities"], pools


def snapshot_meta() -> dict:
    meta, entities, _ = _index()
    return {**meta, "entities": len(entities)}


def _similarity(query: str, candidate: str, kind: str = "O") -> float:
    """Levenshtein similarity (0-100) on the compact and the token-sorted forms."""
    q_toks, c_toks = query.split(), candidate.split()
    score = 100 * max(
        Levenshtein.normalized_similarity(query.replace(" ", ""), candidate.replace(" ", "")),
        Levenshtein.normalized_similarity(" ".join(sorted(q_toks)), " ".join(sorted(c_toks))),
    )
    qd, cd = distinctive(q_toks), distinctive(c_toks)
    if not (qd and cd):
        return score
    if qd == cd:
        return max(score, 88.0)  # same distinctive words, different generic ones: review
    # Shared generic words ("electronics", "trading") must not carry the score.
    core = 100 * Levenshtein.normalized_similarity(" ".join(sorted(qd)), " ".join(sorted(cd)))
    score = (score + core) / 2
    # One name's distinctive words contain the other's: review. A person needs two shared
    # name parts, since single-word aliases ("John") identify no one.
    if (qd <= cd or cd <= qd) and (kind == "O" or len(qd & cd) >= 2):
        shared = sum(len(t) for t in qd & cd)
        cover = shared / max(sum(map(len, qd)), sum(map(len, cd)))
        score = max(score, 80 + 8 * cover)
    return score


def _local_match(name: str, kind: str, jurisdiction: str | None) -> list[dict]:
    _, entities, pools = _index()
    query = normalize(name)
    if not query:
        return []
    names, refs = pools[kind]
    candidates = {
        i for scorer in (fuzz.token_set_ratio, fuzz.ratio)
        for _, _, i in process.extract(query, names, scorer=scorer, processor=None,
                                       limit=40, score_cutoff=60)
    }
    best: dict[int, tuple[float, str]] = {}
    for i in candidates:
        score = _similarity(query, names[i], kind)
        ent = refs[i]
        if score >= PARTIAL_AT - 10 and score > best.get(ent, (0, ""))[0]:
            best[ent] = (score, names[i])

    out = []
    for ent_idx, (score, matched) in sorted(best.items(), key=lambda kv: -kv[1][0])[:8]:
        ent = entities[ent_idx]
        out.append({
            "id": ent[0], "name": ent[2], "matched_on": matched, "score": round(score, 1),
            "kind": ent[1], "countries": ent[4], "lists": ent[5], "program": ent[6],
            "listed_since": ent[7],
            "jurisdiction_match": bool(jurisdiction and jurisdiction.lower() in ent[4]),
            "url": ent[8],
        })
    return out


async def _api_match(name: str, kind: str, jurisdiction: str | None) -> list[dict]:
    props: dict[str, list[str]] = {"name": [name]}
    if jurisdiction:
        props["country"] = [jurisdiction.lower()]
    body = {"queries": {"q": {"schema": "Person" if kind == "P" else "Company", "properties": props}}}
    async with httpx.AsyncClient(timeout=config.HTTP_TIMEOUT) as client:
        resp = await client.post(API_URL, json=body,
                                 headers={"Authorization": f"ApiKey {config.OPENSANCTIONS_API_KEY}"})
        resp.raise_for_status()
    results = resp.json()["responses"]["q"]["results"]
    out = []
    for r in results[:8]:
        props = r.get("properties", {})
        countries = props.get("country", []) or props.get("jurisdiction", []) or props.get("nationality", [])
        out.append({
            "id": r["id"], "name": r.get("caption"), "matched_on": None,
            "score": round(r.get("score", 0) * 100, 1),
            "kind": "P" if r.get("schema") == "Person" else "O",
            "countries": countries,
            "lists": sorted({LIST_LABELS.get(d, d) for d in r.get("datasets", [])}),
            "program": (props.get("program") or [""])[0][:110],
            "listed_since": (r.get("first_seen") or "")[:10],
            "jurisdiction_match": bool(jurisdiction and jurisdiction.lower() in countries),
            "url": f"https://www.opensanctions.org/entities/{r['id']}/",
        })
    return out


def _status(score: float) -> str:
    return "MATCH" if score >= MATCH_AT else "PARTIAL" if score >= PARTIAL_AT else "CLEAN"


def entity_score(best: float, status: str) -> int:
    """0-100 entity (micro) risk derived from the best match score."""
    if status == "MATCH":
        return round(85 + (best - MATCH_AT) / (100 - MATCH_AT) * 15)
    if status == "PARTIAL":
        return round(50 + (best - PARTIAL_AT) / (MATCH_AT - PARTIAL_AT) * 30)
    return round(min(best, PARTIAL_AT) * 0.25)


async def screen(company: str, jurisdiction: str | None, ubos: list[str], live: bool) -> dict:
    subjects = [(company, "O", "Company")] + [(u, "P", "UBO / director") for u in ubos]
    use_api = live and bool(config.OPENSANCTIONS_API_KEY)
    snapshot = "Official lists snapshot " + snapshot_meta()["retrieved"]
    source = "OpenSanctions match API" if use_api else snapshot
    warning = None

    results = []
    for name, kind, role in subjects:
        matches = None
        if use_api:
            key = f"os:{kind}:{jurisdiction}:{normalize(name)}"
            matches = await cache.get(key)
            if matches is None:
                try:
                    matches = await _api_match(name, kind, jurisdiction)
                    await cache.set(key, matches, ttl=86400)
                except (httpx.HTTPError, KeyError, ValueError):
                    warning = "OpenSanctions API unavailable; screened against the bundled official lists."
                    source = snapshot
        if matches is None:
            matches = _local_match(name, kind, jurisdiction)
        best = matches[0]["score"] if matches else 0.0
        status = _status(best)
        results.append({"name": name, "role": role, "status": status, "best_score": best,
                        "matches": [m for m in matches if m["score"] >= PARTIAL_AT - 10]})

    order = {"CLEAN": 0, "PARTIAL": 1, "MATCH": 2}
    worst = max(results, key=lambda r: (order[r["status"]], r["best_score"]))
    return {
        "status": worst["status"],
        "best_score": worst["best_score"],
        "score": entity_score(worst["best_score"], worst["status"]),
        "subjects": results,
        "source": source,
        "lists": ["EU consolidated (FSF)", "US OFAC SDN", "UN Security Council"],
        "warning": warning,
    }
