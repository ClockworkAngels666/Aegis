"""Aegis API: FastAPI app served as a Vercel Python function (all /api/* routes)."""

from __future__ import annotations

import asyncio
import datetime as dt
import sys
from functools import lru_cache
from pathlib import Path

import math
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _lib import anomaly, config, hs_codes, jurisdiction, memo, mirror, radar, registry, sanctions, trade  # noqa: E402

app = FastAPI(
    title="Aegis API",
    description="Open-Source Trade Intelligence & Dual-Use Sanctions Radar: entity screening, trade anomalies, compliance briefings.",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)


def _valid_hs(v: str) -> str:
    code = hs_codes.clean_hs(v)
    if not hs_codes.HS_PATTERN.match(code):
        raise ValueError("HS code must have 6 digits")
    if not hs_codes.real_chapter(code):
        raise ValueError("Not a valid HS code: chapters run from 01 to 97")
    return code


def _valid_intermediary(v: str) -> str:
    v = v.upper()
    if v not in config.INTERMEDIARIES:
        raise ValueError("Unsupported intermediary country")
    return v


def _valid_weights(v: dict[str, float] | None) -> dict[str, float] | None:
    if v is None:
        return None
    if set(v) - set(anomaly.WEIGHTS) or any(x < 0 or x > 100 for x in v.values()):
        raise ValueError("Weights must use known components and lie between 0 and 100")
    return v


class AssessRequest(BaseModel):
    company: str = Field(min_length=2, max_length=200, examples=["Tech Alliance LLC"])
    jurisdiction: str | None = Field(default=None, examples=["KG"])
    ubos: list[str] = Field(default_factory=list, max_length=10)
    hs: str = Field(examples=["854231"])
    exporter: str = config.DEFAULT_EXPORTER
    intermediary: str = Field(examples=["KG"])
    live: bool = False
    weights: dict[str, float] | None = Field(default=None, description="Route-score weights; rescaled to 100")

    @field_validator("company")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("ubos")
    @classmethod
    def _ubos(cls, v: list[str]) -> list[str]:
        return [u.strip()[:120] for u in v if u and u.strip()]

    @field_validator("hs")
    @classmethod
    def _hs(cls, v: str) -> str:
        return _valid_hs(v)

    @field_validator("jurisdiction")
    @classmethod
    def _jur(cls, v: str | None) -> str | None:
        return v.strip().upper()[:2] if v and v.strip() else None

    @field_validator("exporter")
    @classmethod
    def _exporter(cls, v: str) -> str:
        if v not in config.EXPORTERS:
            raise ValueError("Unsupported exporter")
        return v

    @field_validator("intermediary")
    @classmethod
    def _intermediary(cls, v: str) -> str:
        return _valid_intermediary(v)

    @field_validator("weights")
    @classmethod
    def _weights(cls, v: dict[str, float] | None) -> dict[str, float] | None:
        return _valid_weights(v)


class CalculateRequest(BaseModel):
    """What-if input for the route score: yearly exports entered by the user instead of fetched."""

    hs: str = Field(examples=["848210"])
    intermediary: str = Field(examples=["KZ"])
    years: list[int] = Field(min_length=3, max_length=20, examples=[[2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]])
    values: list[float] = Field(description="Exports to the intermediary per year")
    russia: list[float] = Field(description="Direct exports to Russia per year")
    screening: Literal["CLEAN", "PARTIAL", "MATCH"] = "CLEAN"
    weights: dict[str, float] | None = None

    @field_validator("hs")
    @classmethod
    def _hs(cls, v: str) -> str:
        return _valid_hs(v)

    @field_validator("intermediary")
    @classmethod
    def _intermediary(cls, v: str) -> str:
        return _valid_intermediary(v)

    @field_validator("weights")
    @classmethod
    def _weights(cls, v: dict[str, float] | None) -> dict[str, float] | None:
        return _valid_weights(v)

    @field_validator("values", "russia")
    @classmethod
    def _amounts(cls, v: list[float]) -> list[float]:
        if any(not math.isfinite(x) or x < 0 or x > 1e12 for x in v):
            raise ValueError("Export values must be between 0 and 1 trillion")
        return v

    def model_post_init(self, _context) -> None:
        if not (len(self.years) == len(self.values) == len(self.russia)):
            raise ValueError("years, values and russia must have the same length")


async def _assess(req: AssessRequest) -> dict:
    classification = hs_codes.classify(req.hs)
    entity, series, monthly = await asyncio.gather(
        sanctions.screen(req.company, req.jurisdiction, req.ubos, req.live),
        trade.get_series(req.exporter, req.intermediary, req.hs, req.live),
        trade.get_monthly(req.exporter, req.intermediary, req.hs, req.live),
    )
    route = anomaly.analyse(series, classification, req.intermediary, req.weights)
    query = {
        **req.model_dump(),
        "exporter_name": config.EXPORTERS[req.exporter]["name"],
        "intermediary_name": config.INTERMEDIARIES[req.intermediary]["name"],
        "jurisdiction_name": config.JURISDICTIONS.get(req.jurisdiction or "", req.jurisdiction or "unknown"),
    }
    return {
        "query": query,
        "classification": classification,
        "entity": entity,
        "series": series,
        "route": route,
        "monthly": anomaly.monthly_stats(monthly) if monthly else None,
        "unit_values": anomaly.unit_values(series),
        "mirror": mirror.get(req.exporter, req.intermediary, req.hs),
        "flows": trade.flows(req.exporter, req.hs),
        "sankey": mirror.sankey(req.exporter, req.hs),
        "verdict": memo.decide(entity, route, classification),
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }


@lru_cache(maxsize=1)
def _robustness() -> dict:
    """Share of bundled corridors whose band is unchanged when all components are weighted equally."""
    data = trade.bundled()
    exporter = config.DEFAULT_EXPORTER
    same = total = 0
    for partner in config.INTERMEDIARIES:
        for hs in data["data"][exporter][partner]:
            series = trade._from_bundle(exporter, partner, hs)
            route = anomaly.analyse(series, hs_codes.classify(hs), partner)
            same += route["band"] == route["sensitivity"]["equal"]["band"]
            total += 1
    return {"exporter": config.EXPORTERS[exporter]["name"], "corridors": total, "band_unchanged": same}


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "trade_cache": trade.bundled()["meta"]["retrieved"],
        "sanctions_snapshot": sanctions.snapshot_meta()["retrieved"],
        "live": {
            "comtrade_key": bool(config.COMTRADE_API_KEY),
            "opensanctions_key": bool(config.OPENSANCTIONS_API_KEY),
            "redis": bool(config.UPSTASH_URL and config.UPSTASH_TOKEN),
            "llm": bool(config.LLM_API_KEY and config.LLM_BASE_URL and config.LLM_MODEL),
        },
    }


@app.get("/api/reference")
def reference() -> dict:
    meta = trade.bundled()["meta"]
    snap = sanctions.snapshot_meta()
    months = (trade.bundled_monthly() or {}).get("meta", {}).get("months", [])
    return {
        "exporters": [{"code": k, "name": v["name"], "bundled": k in config.BUNDLED_EXPORTERS}
                      for k, v in config.EXPORTERS.items()],
        "intermediaries": [{"code": k, "name": v["name"], "exposure": jurisdiction.profile(k)["exposure"]}
                           for k, v in config.INTERMEDIARIES.items()],
        "jurisdictions": [{"iso2": k, "name": v} for k, v in config.JURISDICTIONS.items()],
        "hs_codes": hs_codes.catalogue(),
        "tiers": hs_codes.chpl()["tiers"],
        "chpl_version": hs_codes.chpl()["meta"]["version"],
        "trade": {"years": meta["years"], "retrieved": meta["retrieved"], "source": meta["source"],
                  "unit": meta["unit"]},
        "sanctions": {"retrieved": snap["retrieved"], "entities": snap["entities"]},
        "monthly": {"months": [months[0], months[-1]] if months else None},
        "mirror": mirror.meta(),
        "baseline_years": list(config.BASELINE_YEARS),
        "z_threshold": config.Z_THRESHOLD,
        "weights": anomaly.WEIGHTS,
        "robustness": _robustness(),
    }


@app.get("/api/hs/{code}")
def hs_lookup(code: str) -> dict:
    hs = hs_codes.clean_hs(code)
    if not hs_codes.HS_PATTERN.match(hs):
        raise HTTPException(422, "HS code must have 6 digits")
    return hs_codes.classify(hs)


@app.post("/api/assess")
async def assess(req: AssessRequest) -> dict:
    return await _assess(req)


@app.post("/api/memo")
async def briefing(req: AssessRequest) -> dict:
    return await memo.build(await _assess(req))


@app.get("/api/radar")
def radar_view(exporter: str = Query(default=config.DEFAULT_EXPORTER)) -> dict:
    data = radar.matrix(exporter)
    if data is None:
        raise HTTPException(404, "The radar covers the bundled exporters only (Germany, EU-27).")
    return data


@app.get("/api/company")
async def company(name: str = Query(min_length=2, max_length=200),
                  country_code: str | None = Query(default=None, alias="country")) -> dict:
    cc = country_code.strip().upper()[:2] if country_code and country_code.strip() else None
    return await registry.lookup(name.strip(), cc)


class BatchRow(BaseModel):
    company: str = Field(min_length=2, max_length=200)
    country: str | None = None
    hs: str | None = None
    intermediary: str | None = None


class BatchRequest(BaseModel):
    rows: list[BatchRow] = Field(min_length=1, max_length=200)
    exporter: str = config.DEFAULT_EXPORTER


@app.post("/api/calculate")
def calculate(req: CalculateRequest) -> dict:
    """Route score and recommended action for user-entered yearly exports (same formulas as /api/assess)."""
    classification = hs_codes.classify(req.hs)
    series = {"years": req.years, "values": req.values, "russia": req.russia, "unit": "EUR"}
    route = anomaly.analyse(series, classification, req.intermediary, req.weights)
    verdict = memo.decide({"status": req.screening}, route, classification)
    return {"classification": classification, "route": route, "verdict": verdict}


@app.post("/api/batch")
async def batch(req: BatchRequest) -> dict:
    """Screen up to 200 counterparties against the bundled lists; add item and route checks when given."""
    exporter = req.exporter if req.exporter in config.EXPORTERS else config.DEFAULT_EXPORTER
    out = []
    for row in req.rows:
        cc = row.country.strip().upper()[:2] if row.country and row.country.strip() else None
        entity = await sanctions.screen(row.company.strip(), cc, [], live=False)
        top = entity["subjects"][0]["matches"][:1]
        result = {
            "company": row.company.strip(), "country": cc,
            "entity_status": entity["status"], "entity_score": entity["score"],
            "best_match": top[0]["name"] if top else None,
            "best_lists": top[0]["lists"] if top else [],
            "best_similarity": top[0]["score"] if top else None,
            "hs": None, "chpl_tier": None, "intermediary": None, "route_score": None, "route_band": None,
            "verdict": None,
        }
        hs = hs_codes.clean_hs(row.hs or "")
        if hs_codes.HS_PATTERN.match(hs) and hs_codes.real_chapter(hs):
            c = hs_codes.classify(hs)
            result.update(hs=hs, chpl_tier=c["tier"])
            inter = (row.intermediary or cc or "").strip().upper()[:2]
            series = trade._from_bundle(exporter, inter, hs) if inter in config.INTERMEDIARIES else None
            if series:
                route = anomaly.analyse(series, c, inter)
                v = memo.decide(entity, route, c)
                result.update(intermediary=inter, route_score=route["score"], route_band=route["band"], verdict=v["code"])
        if result["verdict"] is None:
            result["verdict"] = {"MATCH": "STOP", "PARTIAL": "HOLD"}.get(entity["status"], "STANDARD")
        out.append(result)
    order = {"STOP": 0, "HOLD": 1, "RED FLAG": 2, "ELEVATED": 3, "STANDARD": 4}
    out.sort(key=lambda r: (order[r["verdict"]], -(r["route_score"] or 0), -(r["best_similarity"] or 0)))
    summary = {code: sum(r["verdict"] == code for r in out) for code in order}
    return {"rows": out, "summary": summary, "exporter": exporter, "count": len(out)}
