"""Rebuild the bundled datasets that power demo mode and the API fallbacks.

    python scripts/build_cache.py              # everything
    python scripts/build_cache.py --trade      # Eurostat annual values and weights
    python scripts/build_cache.py --monthly    # Eurostat monthly values since 2019
    python scripts/build_cache.py --mirror     # UN Comtrade mirror statistics
    python scripts/build_cache.py --sanctions  # sanctions lists + jurisdiction indicators

Trade: exports of every Common High Priority Item from Germany and the EU-27 to
each intermediary and reference partner, from Eurostat Comext (DS-045409, EUR, kg).

Mirror: what each intermediary itself reports to UN Comtrade (imports from
Germany, exports to Russia) next to Germany's reported exports to it (USD).

Sanctions: the official publications, not a third-party aggregation:
  EU   Consolidated Financial Sanctions List (European Commission, FSF)
  US   OFAC Specially Designated Nationals list (US Treasury, public domain)
  UN   Security Council Consolidated List
Also writes, per intermediary country, how many organisations based there are
designated under Russia- or Belarus-related programmes (jurisdictions.json).
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import io
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))

from _lib import config  # noqa: E402
from _lib import eurostat  # noqa: E402
from _lib.names import normalize  # noqa: E402

EU_URL = "https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw"
OFAC_URL = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/{name}.CSV"
UN_URL = "https://scsanctions.un.org/resources/xml/en/consolidated.xml"
UN_PAGE = "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list"
MAX_ALIASES = 20

EU_RUSSIA_PROGRAMMES = {"UKR", "RUSDA", "BLR"}
OFAC_RUSSIA = re.compile(r"RUSSIA|UKRAINE-EO1366|UKRAINE-EO13685|BELARUS")

# Country names used by OFAC and the UN that differ from the EU's descriptions.
COUNTRY_OVERRIDES = {
    "russia": "RU", "russian federation": "RU", "turkey": "TR", "türkiye": "TR", "turkiye": "TR",
    "united arab emirates": "AE", "hong kong": "HK", "china": "CN", "kazakhstan": "KZ",
    "kyrgyzstan": "KG", "armenia": "AM", "georgia": "GE", "uzbekistan": "UZ", "tajikistan": "TJ",
    "azerbaijan": "AZ", "serbia": "RS", "belarus": "BY", "ukraine": "UA", "iran": "IR",
    "iran (islamic republic of)": "IR", "korea, north": "KP", "democratic people's republic of korea": "KP",
    "korea, south": "KR", "burma": "MM", "syria": "SY", "syrian arab republic": "SY", "venezuela": "VE",
    "cuba": "CU", "united kingdom": "GB", "united states": "US", "united states of america": "US",
    "vietnam": "VN", "laos": "LA", "moldova": "MD", "czech republic": "CZ", "macau": "MO", "taiwan": "TW",
    "india": "IN", "germany": "DE", "singapore": "SG", "malaysia": "MY", "thailand": "TH",
    "congo, democratic republic of the": "CD", "democratic republic of the congo": "CD",
    "region: crimea": "UA", "west bank": "PS", "lebanon": "LB", "iraq": "IQ", "mexico": "MX",
}


# ----------------------------------------------------------------------------- trade

def _codes() -> list[str]:
    return sorted(json.loads((config.DATA_DIR / "chpl.json").read_text(encoding="utf-8"))["items"])


def _eurostat_chunked(client: httpx.Client, exporter: str, partners: list[str], codes: list[str], freq: str,
                      indicators: tuple[str, ...]) -> tuple[dict, list[str]]:
    """Eurostat is slow on large uncached queries: ask for 5 products at a time, retrying timeouts."""
    cells: dict = {}
    periods: list[str] = []
    for i in range(0, len(codes), 5):
        for attempt in range(4):
            try:
                part, got = eurostat.fetch(client, exporter, partners, codes[i:i + 5], freq, indicators)
                print(f"  {exporter} {freq} {codes[i]}..: {len(part)} cells", flush=True)
                break
            except httpx.TimeoutException:
                print(f"  timeout on {exporter} {codes[i]}..., retry {attempt + 1}")
                time.sleep(5)
        else:
            raise RuntimeError("Eurostat kept timing out")
        cells.update(part)
        periods = got if len(got) > len(periods) else periods
    return cells, periods


def build_trade() -> None:
    codes = _codes()
    partners = [*config.INTERMEDIARIES, *config.REFERENCE_PARTNERS]
    data: dict[str, dict] = {}
    kg: dict[str, dict] = {}
    years: list[str] = []
    with httpx.Client(timeout=180) as client:
        for exporter in config.BUNDLED_EXPORTERS:
            cells, years = _eurostat_chunked(client, exporter, partners, codes, "A", (eurostat.VALUE, eurostat.WEIGHT))
            data[exporter] = {p: {c: [round(cells.get((eurostat.VALUE, p, c, y), 0.0)) for y in years] for c in codes}
                              for p in partners}
            kg[exporter] = {p: {c: [round(cells.get((eurostat.WEIGHT, p, c, y), 0.0) * 100) for y in years]
                                for c in codes} for p in partners}
            print(f"{exporter}: {len(cells)} cells, years {years[0]}-{years[-1]}")
    out = {
        "meta": {
            "source": "Eurostat Comext (DS-045409)",
            "flow": "export",
            "unit": "EUR",
            "years": [int(y) for y in years],
            "retrieved": dt.date.today().isoformat(),
            "note": "A missing cell is stored as 0 (no reported trade). kg = net mass.",
        },
        "data": data,
        "kg": kg,
    }
    path = config.DATA_DIR / "trade_cache.json"
    path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")


def build_monthly() -> None:
    codes = _codes()
    partners = [*config.INTERMEDIARIES, *config.REFERENCE_PARTNERS]
    data: dict[str, dict] = {}
    months: list[str] = []
    with httpx.Client(timeout=180) as client:
        for exporter in config.BUNDLED_EXPORTERS:
            cells, months = _eurostat_chunked(client, exporter, partners, codes, "M", (eurostat.VALUE,))
            data[exporter] = {p: {c: [round(cells.get((eurostat.VALUE, p, c, m), 0.0)) for m in months] for c in codes}
                              for p in partners}
            print(f"{exporter}: {len(cells)} monthly cells, {months[0]} to {months[-1]}")
    out = {
        "meta": {"source": "Eurostat Comext (DS-045409), monthly", "unit": "EUR", "months": months,
                 "retrieved": dt.date.today().isoformat()},
        "data": data,
    }
    path = config.DATA_DIR / "trade_monthly.json.gz"
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")


# ----------------------------------------------------------------------------- mirror statistics

COMTRADE_PREVIEW = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"


def _comtrade(client: httpx.Client, params: dict) -> list[dict]:
    """Keyless preview call: one period, max 500 rows, ~1 request per 1.5 s."""
    for _ in range(12):
        resp = client.get(COMTRADE_PREVIEW, params=params)
        if resp.status_code == 429:
            time.sleep(float(resp.headers.get("retry-after", 2)) + 0.5)
            continue
        resp.raise_for_status()
        time.sleep(1.7)
        return resp.json().get("data") or []
    raise RuntimeError("UN Comtrade kept rate-limiting; try again later")


def build_mirror() -> None:
    codes = _codes()
    inter = config.INTERMEDIARIES
    m49 = {v["m49"]: k for k, v in inter.items()}
    de, ru = config.EXPORTERS["DE"]["m49"], config.REFERENCE_PARTNERS["RU"]["m49"]
    years = list(range(config.BASELINE_YEARS[0], dt.date.today().year))
    de_exp: dict = {}   # (iso2, hs, year) -> USD, reported by Germany
    imp: dict = {}      # (iso2, hs, year) -> USD, intermediary imports from Germany
    exp_ru: dict = {}   # (iso2, hs, year) -> USD, intermediary exports to Russia
    reported: dict[str, set[int]] = {k: set() for k in inter}
    base = {"flowCode": "X", "customsCode": "C00", "motCode": "0", "partner2Code": "0"}
    reporters = list(inter.values())
    with httpx.Client(timeout=90) as client:
        for year in years:
            for half in (codes[:25], codes[25:]):
                for r in _comtrade(client, {**base, "reporterCode": de, "period": str(year),
                                            "partnerCode": ",".join(v["m49"] for v in reporters),
                                            "cmdCode": ",".join(half)}):
                    key = (m49[str(r["partnerCode"])], r["cmdCode"], year)
                    de_exp[key] = de_exp.get(key, 0.0) + float(r.get("primaryValue") or 0)
            for i in range(0, len(reporters), 2):
                pair = reporters[i:i + 2]
                rows = _comtrade(client, {**base, "flowCode": "M,X", "reporterCode": ",".join(v["m49"] for v in pair),
                                          "period": str(year), "partnerCode": f"{de},{ru}", "cmdCode": ",".join(codes)})
                for r in rows:
                    iso, partner, flow = m49[str(r["reporterCode"])], str(r["partnerCode"]), r["flowCode"]
                    reported[iso].add(year)
                    key = (iso, r["cmdCode"], year)
                    if flow == "M" and partner == de:
                        imp[key] = imp.get(key, 0.0) + float(r.get("primaryValue") or 0)
                    elif flow == "X" and partner == ru:
                        exp_ru[key] = exp_ru.get(key, 0.0) + float(r.get("primaryValue") or 0)
            print(f"{year}: Germany + {len(reporters)} reporters done")

    def table(src: dict, nullable: bool) -> dict:
        return {iso: {c: [None if nullable and y not in reported[iso] else round(src.get((iso, c, y), 0.0))
                          for y in years] for c in codes} for iso in inter}

    out = {
        "meta": {"source": "UN Comtrade (public preview API)", "unit": "USD", "years": years,
                 "retrieved": dt.date.today().isoformat(),
                 "note": "null = the intermediary did not report that year."},
        "reported": {k: sorted(v) for k, v in reported.items()},
        "de_exports": table(de_exp, False),
        "imports_from_de": table(imp, True),
        "exports_to_ru": table(exp_ru, True),
    }
    path = config.DATA_DIR / "mirror.json.gz"
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"wrote {path} ({path.stat().st_size // 1024} KB); reporting years:",
          {k: (min(v), max(v)) if v else None for k, v in reported.items()})


# ----------------------------------------------------------------------------- sanctions

class Registry:
    """Collects listed subjects; organisations with identical normalised names are merged."""

    def __init__(self) -> None:
        self.items: list[dict] = []
        self.org_index: dict[str, int] = {}

    def add(self, *, id: str, kind: str, names: list[str], countries: set[str], source: str,
            program: str, since: str, url: str, russia: bool) -> None:
        names = [n.strip() for n in names if n and n.strip()]
        if not names:
            return
        key = normalize(names[0])
        if kind == "O" and key in self.org_index:
            item = self.items[self.org_index[key]]
            item["lists"] |= {source}
            item["countries"] |= countries
            item["russia"] |= russia
            item["names"] += names
            if since and (not item["since"] or since < item["since"]):
                item["since"] = since
            return
        self.items.append({"id": id, "kind": kind, "names": names, "countries": set(countries),
                           "lists": {source}, "program": program[:110], "since": since,
                           "url": url, "russia": russia})
        if kind == "O":
            self.org_index[key] = len(self.items) - 1

    def records(self) -> list[list]:
        out = []
        for it in self.items:
            primary = it["names"][0]
            seen, aliases = {normalize(primary)}, []
            for n in it["names"][1:]:
                norm = normalize(n)
                if norm and norm not in seen:
                    seen.add(norm)
                    aliases.append(n)
                if len(aliases) >= MAX_ALIASES:
                    break
            out.append([it["id"], it["kind"], primary, aliases, sorted(c.lower() for c in it["countries"]),
                        sorted(it["lists"]), it["program"], it["since"], it["url"]])
        return out


def _text(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _eu(client: httpx.Client, reg: Registry, country_map: dict[str, str]) -> None:
    rows = list(csv.DictReader(io.StringIO(_text(client.get(EU_URL).content)), delimiter=";"))
    by_id: dict[str, list[dict]] = {}
    for r in rows:
        by_id.setdefault(r["Entity_LogicalId"], []).append(r)
        for desc, iso in (("Address_CountryDescription", "Address_CountryIso2Code"),
                          ("Citizenship_CountryDescription", "Citizenship_CountryIso2Code")):
            if r.get(desc) and r.get(iso) and len(r[iso]) == 2:
                country_map.setdefault(r[desc].strip().lower(), r[iso].upper())
    for eid, group in by_id.items():
        first = group[0]
        names = list(dict.fromkeys(r["NameAlias_WholeName"] for r in group if r["NameAlias_WholeName"]))
        countries = {r[k].upper() for r in group for k in ("Address_CountryIso2Code", "Citizenship_CountryIso2Code")
                     if len(r.get(k) or "") == 2 and r[k].upper() != "00"}
        programme = first["Entity_Regulation_Programme"]
        since = first["Entity_DesignationDate"] or min(
            (r["Entity_Regulation_PublicationDate"] for r in group if r["Entity_Regulation_PublicationDate"]),
            default="")
        reg.add(id=f"EU-{eid}", kind="P" if first["Entity_SubjectType"] == "P" else "O", names=names,
                countries=countries, source="EU", program=f"EU {programme} · {first['Entity_Regulation_NumberTitle']}",
                since=since[:10], url=first["Entity_Regulation_PublicationUrl"],
                russia=programme in EU_RUSSIA_PROGRAMMES)
    print(f"EU: {len(by_id)} subjects")


def _ofac(client: httpx.Client, reg: Registry, country_map: dict[str, str]) -> None:
    def rows(name: str) -> list[list[str]]:
        text = _text(client.get(OFAC_URL.format(name=name)).content)
        return [[c.strip() for c in r] for r in csv.reader(io.StringIO(text)) if len(r) > 3]

    def val(x: str) -> str:
        return "" if x == "-0-" else x

    aliases: dict[str, list[str]] = {}
    for r in rows("ALT"):
        aliases.setdefault(r[0], []).append(val(r[3]))
    countries: dict[str, set[str]] = {}
    unmapped = set()
    for r in rows("ADD"):
        name = val(r[4]).lower()
        iso = country_map.get(name) or COUNTRY_OVERRIDES.get(name)
        if iso == "CN" and "hong kong" in f"{r[2]} {r[3]}".lower():
            iso = "HK"  # OFAC files Hong Kong addresses under "China"
        if iso:
            countries.setdefault(r[0], set()).add(iso)
        elif name:
            unmapped.add(name)
    n = 0
    for r in rows("SDN"):
        sdn_type = val(r[2]).lower()
        if sdn_type in ("vessel", "aircraft"):
            continue
        program = val(r[3])
        reg.add(id=f"OFAC-{r[0]}", kind="P" if sdn_type == "individual" else "O",
                names=[val(r[1]), *aliases.get(r[0], [])], countries=countries.get(r[0], set()),
                source="OFAC", program=f"OFAC {program}", since="",
                url=f"https://sanctionssearch.ofac.treas.gov/Details.aspx?id={r[0]}",
                russia=bool(OFAC_RUSSIA.search(program)))
        n += 1
    print(f"OFAC: {n} subjects ({len(unmapped)} unmapped country names)")


def _un(client: httpx.Client, reg: Registry, country_map: dict[str, str]) -> None:
    root = ET.fromstring(client.get(UN_URL).content)

    def iso(name: str | None) -> str | None:
        name = (name or "").strip().lower()
        return country_map.get(name) or COUNTRY_OVERRIDES.get(name)

    n = 0
    for kind, tag, alias_tag, addr_tag in (("P", "INDIVIDUAL", "INDIVIDUAL_ALIAS", "INDIVIDUAL_ADDRESS"),
                                           ("O", "ENTITY", "ENTITY_ALIAS", "ENTITY_ADDRESS")):
        for el in root.iter(tag):
            parts = [el.findtext(k) for k in ("FIRST_NAME", "SECOND_NAME", "THIRD_NAME", "FOURTH_NAME")]
            name = " ".join(p.strip() for p in parts if p and p.strip())
            alias = [a.findtext("ALIAS_NAME") or "" for a in el.findall(alias_tag)]
            countries = {c for c in (iso(a.findtext("COUNTRY")) for a in el.findall(addr_tag)) if c}
            countries |= {c for c in (iso(v.text) for v in el.findall("NATIONALITY/VALUE")) if c}
            reg.add(id=f"UN-{el.findtext('REFERENCE_NUMBER')}", kind=kind, names=[name, *alias],
                    countries=countries, source="UN", program=f"UN {el.findtext('UN_LIST_TYPE') or ''}",
                    since=(el.findtext("LISTED_ON") or "")[:10], url=UN_PAGE, russia=False)
            n += 1
    print(f"UN: {n} subjects")


def build_sanctions() -> None:
    reg = Registry()
    country_map: dict[str, str] = {}
    with httpx.Client(timeout=180, follow_redirects=True) as client:
        _eu(client, reg, country_map)
        _ofac(client, reg, country_map)
        _un(client, reg, country_map)
    today = dt.date.today().isoformat()

    out = {
        "meta": {
            "source": "EU Consolidated Financial Sanctions List; US OFAC SDN List; UN Security Council Consolidated List",
            "retrieved": today,
            "fields": ["id", "kind", "name", "aliases", "countries", "lists", "program", "listed_since", "url"],
        },
        "entities": reg.records(),
    }
    path = config.DATA_DIR / "sanctions_index.json.gz"
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {path} ({path.stat().st_size // 1024} KB, {len(reg.items)} subjects)")

    counts = {iso2: sum(1 for it in reg.items if it["kind"] == "O" and it["russia"] and iso2 in it["countries"])
              for iso2 in config.INTERMEDIARIES}
    jpath = config.DATA_DIR / "jurisdictions.json"
    jpath.write_text(json.dumps({
        "meta": {
            "definition": "Organisations with an address in the country that are designated under Russia- or "
                          "Belarus-related programmes (EU: UKR, RUSDA, BLR; US OFAC: RUSSIA-EO14024, "
                          "UKRAINE-EO13660/1/2/85, CAATSA-RUSSIA, BELARUS).",
            "retrieved": today,
        },
        "russia_designations": counts,
    }, indent=2), encoding="utf-8")
    print("Russia-related designations by country:", counts)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    steps = {"trade": build_trade, "monthly": build_monthly, "mirror": build_mirror, "sanctions": build_sanctions}
    for name in steps:
        parser.add_argument(f"--{name}", action="store_true")
    args = parser.parse_args()
    chosen = [n for n in steps if getattr(args, n)] or list(steps)
    for name in chosen:
        steps[name]()
