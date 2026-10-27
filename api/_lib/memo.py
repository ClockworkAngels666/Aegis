"""Module 3: decision matrix and the export compliance briefing.

The briefing is assembled by rules from Modules 1 and 2, so every legal citation
is fixed text rather than generated. If an OpenAI-compatible LLM endpoint is
configured, it only adds a short analyst narrative grounded in the same facts.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json

import httpx

from . import config

LEVELS = {
    "STOP": {"level": 4, "title": "Sanctions match: do not proceed"},
    "HOLD": {"level": 3, "title": "Possible sanctions match: hold for manual review"},
    "RED FLAG": {"level": 3, "title": "Enhanced due diligence mandatory"},
    "ELEVATED": {"level": 2, "title": "Enhanced due diligence recommended"},
    "STANDARD": {"level": 1, "title": "Standard due diligence"},
}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

SOURCES = [
    {"label": "EU List of Common High Priority Items (Feb 2024)",
     "url": "https://finance.ec.europa.eu/document/download/5a2494db-d874-4e2b-bf2a-ec5a191d2dc0_en"},
    {"label": "Council Regulation (EU) No 833/2014 (consolidated)", "url": "https://eur-lex.europa.eu/eli/reg/2014/833/oj"},
    {"label": "Regulation (EU) 2021/821 (Dual-Use Regulation)", "url": "https://eur-lex.europa.eu/eli/reg/2021/821/oj"},
    {"label": "Außenwirtschaftsgesetz (AWG)", "url": "https://www.gesetze-im-internet.de/awg_2013/"},
    {"label": "BAFA: Export control", "url": "https://www.bafa.de/EN/Foreign_Trade/Export_Control/export_control_node.html"},
    {"label": "Eurostat Comext (DS-045409)", "url": "https://ec.europa.eu/eurostat/web/international-trade-in-goods/database"},
    {"label": "UN Comtrade", "url": "https://comtradeplus.un.org/"},
    {"label": "EU Consolidated Financial Sanctions List",
     "url": "https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions"},
    {"label": "US OFAC SDN List", "url": "https://sanctionssearch.ofac.treas.gov/"},
    {"label": "UN Security Council Consolidated List", "url": "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list"},
]

SYSTEM_PROMPT = """You are a senior export-control analyst writing for a German exporter's compliance board.
Write the 'Analyst assessment' paragraph of a compliance briefing on a proposed export.

Ground rules:
- Use ONLY the facts in the JSON you are given. Do not invent figures, entities, dates or listings.
- The legal frame is the German Foreign Trade and Payments Act (AWG) and Ordinance (AWV), BAFA practice,
  Council Regulation (EU) No 833/2014 (incl. Art. 12 anti-circumvention and Art. 12g 'No-Russia clause' for
  Annex XL Common High Priority Items) and Regulation (EU) 2021/821. Cite only these, and only where the facts support it.
- Keep route risk (country-level trade anomaly) separate from entity risk (name screening). A country-level surge
  shows that a corridor is anomalous, not that this buyer is involved.
- A clean name screen on a critical route is NOT reassurance: shell companies are often unlisted.
- Plain, precise English. 120-180 words. One paragraph, no headings, no bullet points, no preamble."""


def decide(entity: dict, route: dict, classification: dict) -> dict:
    notes = []
    if entity["status"] == "MATCH":
        code = "STOP"
    elif entity["status"] == "PARTIAL":
        code = "HOLD"
    elif route["band"] == "CRITICAL":
        code = "RED FLAG"
    elif route["band"] == "HIGH":
        code = "ELEVATED"
    else:
        code = "STANDARD"
    if entity["status"] == "CLEAN" and route["band"] in ("CRITICAL", "HIGH"):
        notes.append("Clean name screen does not offset route risk: shell companies are often unlisted.")
    if classification["chpl"]:
        notes.append("Art. 12g No-Russia clause is mandatory for this item whatever the risk level.")
    return {"code": code, **LEVELS[code], "notes": notes}


def _money(v: float, unit: str = "EUR") -> str:
    sym = "€" if unit == "EUR" else "$"
    a = abs(v)
    if a >= 1e9:
        return f"{sym}{v / 1e9:.2f}bn"
    if a >= 1e6:
        return f"{sym}{v / 1e6:.2f}m"
    if a >= 1e4:
        return f"{sym}{v / 1e3:.0f}k"
    # small amounts (and prices per kg) in full: "€1,020", "€3.45"
    return f"{sym}{v:,.0f}" if a >= 10 else f"{sym}{v:.2f}"


def _findings(ctx: dict) -> list[dict]:
    a, e, c, q = ctx["route"], ctx["entity"], ctx["classification"], ctx["query"]
    partner, hs, unit = q["intermediary_name"], c["hs"], ctx["series"].get("unit", "EUR")
    exporter = q["exporter_name"]
    out = []

    def add(severity: str, area: str, text: str) -> None:
        out.append({"severity": severity, "area": area, "text": text})

    for subj in e["subjects"]:
        if subj["status"] != "CLEAN" and subj["matches"]:
            m = subj["matches"][0]
            since = f"; listed since {m['listed_since']}" if m.get("listed_since") else ""
            add("critical" if subj["status"] == "MATCH" else "high", "Entity",
                f"{subj['role']} '{subj['name']}' resembles '{m['name']}' ({', '.join(m['lists'])}) at "
                f"{m['score']:.0f}% similarity{since}.")
    if e["status"] == "CLEAN":
        add("info", "Entity", f"No match above 80% for {len(e['subjects'])} screened name(s) against EU, OFAC SDN and "
                              f"UN lists ({e['source']}).")

    if c["chpl"]:
        add("high", "Item", f"HS {hs} ({c['description'].lower()}) is a Tier {c['tier']} Common High Priority Item, "
                            "a category found in Russian weapons systems on the battlefield.")

    if a["emergent"]:
        peak = max(a["points"], key=lambda p: p["value"])
        add("high", "Route", f"New trade flow: no exports of HS {hs} from {exporter} to {partner} in 2017-2021, "
                             f"then {_money(peak['value'], unit)} in {peak['year']}.")
    elif a["multiplier"] is not None:
        txt = (f"Exports of HS {hs} from {exporter} to {partner} averaged {a['multiplier']:.1f}× the 2017-2021 baseline "
               f"after 2022 ({_money(a['post_mean'], unit)} vs {_money(a['baseline']['mean'], unit)} a year).")
        if a["z_max"] is not None:
            above = "above" if a["z_max"] > a["threshold"] else "below"
            txt += f" Peak Z-score {a['z_max']:.1f} in {a['z_max_year']} ({above} the {a['threshold']:.1f} threshold)."
        add("high" if a["band"] in ("CRITICAL", "HIGH") else "medium", "Route", txt)
    if a["note"]:
        add("info", "Route", a["note"])

    if a["russia_ratio"] is not None:
        drop = (1 - a["russia_ratio"]) * 100
        if a["diversion_pattern"]:
            add("high", "Route", f"Direct exports of HS {hs} to Russia fell {drop:.0f}% over the same period while "
                                 f"exports to {partner} rose: the substitution pattern typical of diversion.")
        elif drop > 50:
            add("info", "Route", f"Direct exports to Russia fell {drop:.0f}%, without an offsetting rise to {partner}.")

    mo = ctx.get("monthly")
    if mo and mo["ytd"]["ratio"] is not None and mo["ytd"]["value"] > 0:
        y, r = mo["ytd"], mo["ytd"]["ratio"]
        span = f"{MONTHS[0]}–{MONTHS[y['through_month'] - 1]}"
        add("high" if r >= 2 else "info", "Monthly",
            f"So far in {y['year']} ({span}), exports are {r:.1f}× the same months of {y['reference_year']}"
            + (": the surge is continuing." if r >= 2 else "."))

    uv = ctx.get("unit_values")
    if uv and uv["flag"]:
        add("medium", "Price", f"Price per kg after 2022 is {uv['change']:.1f}× the pre-war level "
                               f"({_money(uv['post'], unit)}/kg vs {_money(uv['baseline'], unit)}/kg): "
                               "ask exactly what is being shipped.")

    mi = ctx.get("mirror")
    if mi:
        if mi.get("gap") is not None and mi["gap"] >= 0.3:
            add("medium", "Mirror", f"In {mi['gap_year']}, {partner} reported receiving {mi['gap'] * 100:.0f}% less than "
                                    "Germany reported shipping: goods may be re-routed or declared differently in transit.")
        if mi.get("onward_multiplier") is not None and mi["onward_multiplier"] >= 2:
            add("high", "Mirror", f"{partner}'s own reported exports of HS {hs} to Russia averaged "
                                  f"{mi['onward_multiplier']:.1f}× their pre-war level after 2022.")

    prof = a.get("jurisdiction_profile")
    if prof:
        add("medium" if prof["exposure"] >= 9 else "info", "Jurisdiction", f"{partner}: {prof['rationale']}")
    sens = a["sensitivity"]
    if a["custom_weights"]:
        add("info", "Method", f"Custom score weights applied: route score {a['score']} ({a['band']}); default weights "
                              f"give {sens['default']['score']} ({sens['default']['band']}).")
    elif sens["equal"]["band"] != a["band"]:
        add("info", "Method", f"Weighting matters here: with equal weights the route score is "
                              f"{sens['equal']['score']} ({sens['equal']['band']}).")
    order = {"critical": 0, "high": 1, "medium": 2, "info": 3}
    return sorted(out, key=lambda f: order[f["severity"]])


def _legal(ctx: dict) -> list[str]:
    e, c, v = ctx["entity"], ctx["classification"], ctx["verdict"]
    lists = {li for s in e["subjects"] for m in s["matches"][:1] if s["status"] != "CLEAN" for li in m["lists"]}
    out = []
    if lists & {"EU", "UN"}:
        out.append("EU/UN-listed party: making goods or funds available is prohibited (asset freeze, e.g. Art. 2 Reg. "
                   "(EU) 269/2014). Freeze, escalate and report: BAFA for economic resources, Deutsche Bundesbank for funds.")
    elif "OFAC" in lists:
        out.append("US OFAC SDN listing only: EU law may not bar the sale, but US secondary-sanctions exposure "
                   "(E.O. 14024 as amended by E.O. 14114) is significant and EU banks are likely to refuse payment.")
    if c["chpl"]:
        out.append("Art. 12g Reg. 833/2014: the contract must prohibit re-export to Russia and for use in Russia, "
                   "with adequate remedies; a breach by the buyer must be reported to the competent authority (BAFA).")
    out.append("Art. 12 Reg. 833/2014: knowingly and intentionally participating in activities that circumvent the "
               "export bans is itself prohibited; ignoring clear red flags can establish knowledge.")
    if c["annex_i_indicative"]:
        out.append("If the item meets Annex I parameters (indicatively " + ", ".join(c["annex_i_indicative"])
                   + "), a BAFA licence is required for export to any third country (Art. 3 Reg. 2021/821).")
    out.append("§ 18 AWG: intentional breaches of EU export bans are criminal offences (imprisonment). § 19 AWG: "
               "negligent breaches are administrative offences punishable by fines, and the company itself can be "
               "fined under § 30 OWiG.")
    if v["level"] >= 3:
        out.append("Directive (EU) 2024/1226 harmonises criminal penalties for sanctions violations across the EU, "
                   "including for companies; check the current AWG text when assessing exposure.")
    return out


def _edd(ctx: dict) -> list[str]:
    c, a, v = ctx["classification"], ctx["route"], ctx["verdict"]
    steps = []
    if v["code"] == "STOP":
        steps.append("Stop shipment and payment now; escalate to the export control officer "
                     "(Ausfuhrverantwortliche/r) and legal counsel.")
    if v["code"] == "HOLD":
        steps.append("Resolve the possible match first: compare dates of birth, addresses, registration numbers and "
                     "ownership against the listing before anything ships.")
    steps.append("Obtain a signed end-use statement naming the final consignee, end use and location "
                 "(BAFA end-use certificate form for listed items).")
    if c["chpl"]:
        steps.append("Verify the Art. 12g No-Russia clause is in the contract with enforceable remedies "
                     "(termination, contractual penalty, audit right).")
    steps += [
        "Corporate due diligence on the buyer: incorporation date (post-2022 shells are a classic flag), capital, "
        "real premises, web presence, staff and fit between its business and the order. Check the LEI register.",
        "Identify and screen beneficial owners and directors; look for Russian or Belarusian links and recent "
        "ownership changes.",
        "Check the logistics and payment chain: freight forwarder, final routing, payments from third parties or "
        "Russia-linked banks, unusual prepayment.",
    ]
    if a["band"] in ("CRITICAL", "HIGH") or a["emergent"]:
        steps.append("Test the order's plausibility: is the volume consistent with demand in the buyer's country, "
                     "given that the corridor shows an abnormal post-2022 surge?")
        steps.append("Arrange post-shipment verification (delivery proof, site visit) and repeat screening before "
                     "each delivery.")
    steps.append("Record the assessment and decision in the ICP audit trail; when classification is unclear, request "
                 "an AzG (Auskunft zur Güterliste) from BAFA.")
    return steps


def _limitations(ctx: dict) -> list[str]:
    years = ctx["series"]["years"]
    return [
        "Route risk is a macro indicator (country x HS code). It shows that a corridor is anomalous, not that this "
        "buyer is involved: treating it as proof would be an ecological fallacy.",
        f"Annual data lags 6-12 months (latest year here: {years[-1] if years else 'n/a'}); monthly data narrows that "
        f"to about two months. Exporter-reported statistics ({ctx['series'].get('source', 'Eurostat')}) are used "
        "because intermediaries under-report onward flows.",
        "Name screening cannot catch newly formed shells or nominee directors; a clean result is not clearance.",
        "Built on open data; not legal advice.",
    ]


async def _narrative(ctx: dict, findings: list[dict]) -> str | None:
    if not (config.LLM_API_KEY and config.LLM_BASE_URL and config.LLM_MODEL):
        return None
    facts = {
        "query": ctx["query"], "verdict": ctx["verdict"], "classification": ctx["classification"],
        "route_score": ctx["route"]["score"], "route_band": ctx["route"]["band"],
        "entity_status": ctx["entity"]["status"], "findings": [f["text"] for f in findings],
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{config.LLM_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {config.LLM_API_KEY}"},
                json={"model": config.LLM_MODEL, "temperature": 0.2, "max_tokens": 600,
                      "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                                   {"role": "user", "content": json.dumps(facts, ensure_ascii=False)}]},
            )
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"].strip()
            return text or None
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None


def _markdown(m: dict) -> str:
    lines = [
        f"# {m['title']}",
        f"**Ref:** {m['ref']}  |  **Date:** {m['date']}  |  **{m['marking']}**",
        "",
        f"**Subject:** {m['subject']}",
        "",
        "## Bottom line",
        m["bluf"],
        "",
        f"Route risk: **{m['scores']['route']}/100 ({m['scores']['route_band']})**  |  "
        f"Sanctions screening: **{m['scores']['entity']}/100 ({m['scores']['entity_status']})**",
        "",
    ]
    if m.get("narrative"):
        lines += ["## Analyst assessment", m["narrative"], ""]
    lines += ["## Key findings"] + [f"- **{f['area']}:** {f['text']}" for f in m["findings"]] + [""]
    lines += ["## Legal exposure"] + [f"- {x}" for x in m["legal"]] + [""]
    lines += ["## Recommended enhanced due diligence"] + [f"{i}. {x}" for i, x in enumerate(m["edd"], 1)] + [""]
    lines += ["## Limitations"] + [f"- {x}" for x in m["limitations"]] + [""]
    lines += ["## Sources"] + [f"- [{s['label']}]({s['url']})" for s in m["sources"]]
    return "\n".join(lines) + "\n"


async def build(ctx: dict) -> dict:
    q, v = ctx["query"], ctx["verdict"]
    today = dt.date.today()
    digest = hashlib.sha1(json.dumps({k: q[k] for k in ("company", "hs", "exporter", "intermediary")},
                                     sort_keys=True).encode()).hexdigest()[:4].upper()
    findings = _findings(ctx)
    subject = f"Export of HS {ctx['classification']['hs']} from {q['exporter_name']} to {q['company']}"
    if q["jurisdiction_name"] == q["intermediary_name"]:
        subject += f", {q['intermediary_name']}"
    else:
        subject += f" ({q['jurisdiction_name']}) via {q['intermediary_name']}"
    memo = {
        "title": "Export compliance briefing",
        "ref": f"AEG-{today:%Y%m%d}-{digest}",
        "date": today.isoformat(),
        "marking": "For compliance use · Not legal advice",
        "subject": subject,
        "verdict": v,
        "bluf": f"{v['code']}: {v['title']}." + (" " + " ".join(v["notes"]) if v["notes"] else ""),
        "scores": {"route": ctx["route"]["score"], "route_band": ctx["route"]["band"],
                   "entity": ctx["entity"]["score"], "entity_status": ctx["entity"]["status"]},
        "findings": findings,
        "legal": _legal(ctx),
        "edd": _edd(ctx),
        "limitations": _limitations(ctx),
        "sources": SOURCES,
    }
    narrative = await _narrative(ctx, findings)
    memo["narrative"] = narrative
    memo["engine"] = "rules+llm" if narrative else "rules"
    memo["markdown"] = _markdown(memo)
    return memo
