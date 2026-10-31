import pytest
from fastapi.testclient import TestClient

from _lib import anomaly, hs_codes
from _lib.names import normalize
from index import app

client = TestClient(app)

BASE = {"exporter": "DE", "live": False}


def assess(**kw):
    resp = client.post("/api/assess", json={**BASE, **kw})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_health_and_reference():
    assert client.get("/api/health").json()["status"] == "ok"
    ref = client.get("/api/reference").json()
    assert len(ref["hs_codes"]) == 50
    assert sum(ref["weights"].values()) == 100


@pytest.mark.parametrize("raw, expected", [
    ("OOO Радиоавтоматика", "radioavtomatika"),
    ("ALLIANCE FIRST TRADING L.L.C", "alliance first trading"),
    ("JSC Kalashnikov Concern", "kalashnikov concern"),
])
def test_normalize(raw, expected):
    assert normalize(raw) == expected


def test_hs_classification():
    chip = client.get("/api/hs/8542.31").json()
    assert chip["chpl"] and chip["tier"] == "1"
    assert any("12g" in o for o in chip["obligations"])
    toys = hs_codes.classify("950300")
    assert not toys["chpl"] and toys["status"] == "NOT LISTED"
    assert client.get("/api/hs/12").status_code == 422


def test_clean_buyer_on_critical_route_is_red_flag():
    a = assess(company="Northwind Components LLP", jurisdiction="KZ", ubos=["John Doe"],
               hs="848210", intermediary="KZ")
    assert a["entity"]["status"] == "CLEAN"
    assert a["route"]["band"] == "CRITICAL"
    assert a["route"]["diversion_pattern"]
    assert a["verdict"]["code"] == "RED FLAG"
    assert a["series"]["mode"] == "demo" and a["series"]["unit"] == "EUR"


def test_listed_entity_stops_the_deal():
    a = assess(company="OOO Радиоавтоматика", jurisdiction="RU", hs="854231", intermediary="AM")
    assert a["entity"]["status"] == "MATCH"
    assert a["verdict"]["code"] == "STOP"


def test_validation():
    r = client.post("/api/assess", json={**BASE, "company": "X Co", "hs": "85A", "intermediary": "KZ"})
    assert r.status_code == 422
    r = client.post("/api/assess", json={**BASE, "company": "X Co", "hs": "854231", "intermediary": "RU"})
    assert r.status_code == 422  # Russia is a reference series, not an intermediary
    for code in ("999999", "980000", "770000", "000000"):  # outside HS chapters 01-97 (77 reserved)
        r = client.post("/api/assess", json={**BASE, "company": "X Co", "hs": code, "intermediary": "KZ"})
        assert r.status_code == 422, code
        assert "chapters run from 01 to 97" in r.text


def test_memo_sections():
    m = client.post("/api/memo", json={**BASE, "company": "Contoso Electronics LLC", "jurisdiction": "KG",
                                       "hs": "854239", "intermediary": "KG"}).json()
    assert m["engine"] == "rules"
    assert m["findings"] and m["legal"] and m["edd"]
    assert "Art. 12g" in m["markdown"] and "§ 18 AWG" in m["markdown"]


def test_zscore_maths():
    series = {"years": list(range(2017, 2025)),
              "values": [100, 110, 90, 100, 100, 400, 100, 100],
              "russia": [50] * 5 + [0] * 3}
    a = anomaly.analyse(series, hs_codes.classify("854231"), "KZ")
    z2022 = next(p for p in a["points"] if p["year"] == 2022)["z"]
    assert a["baseline"]["mean"] == pytest.approx(100)
    assert z2022 == pytest.approx(300 / a["baseline"]["std"])
    assert a["flagged_years"] == [2022]


def test_hs2022_code_has_no_fake_baseline():
    series = {"years": list(range(2017, 2025)), "values": [0] * 5 + [500_000] * 3, "russia": [0] * 8}
    a = anomaly.analyse(series, hs_codes.classify("880730"), "KZ")
    assert not a["emergent"] and a["z_max"] is None
    assert a["components"][0]["points"] is None


def test_llm_narrative_is_optional(monkeypatch):
    import httpx
    from _lib import config

    req = {**BASE, "company": "Contoso Electronics LLC", "jurisdiction": "KG", "hs": "854239", "intermediary": "KG"}
    monkeypatch.setattr(config, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(config, "LLM_BASE_URL", "https://llm.invalid/v1")
    monkeypatch.setattr(config, "LLM_MODEL", "any-model")

    async def ok_post(self, url, **kw):
        assert url.endswith("/chat/completions") and kw["json"]["messages"][0]["role"] == "system"
        return httpx.Response(200, json={"choices": [{"message": {"content": "Grounded narrative."}}]},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", ok_post)
    m = client.post("/api/memo", json=req).json()
    assert m["engine"] == "rules+llm" and m["narrative"] == "Grounded narrative."

    async def failing_post(self, url, **kw):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx.AsyncClient, "post", failing_post)
    m = client.post("/api/memo", json=req).json()
    assert m["engine"] == "rules" and m["narrative"] is None


def test_weights_and_sensitivity():
    req = dict(company="Contoso Electronics LLC", jurisdiction="KG", hs="854239", intermediary="KG")
    base = assess(**req)["route"]
    assert not base["custom_weights"] and base["sensitivity"]["default"]["score"] == base["score"]
    only_item = assess(**req, weights={"anomaly": 0, "surge": 0, "materiality": 0, "criticality": 100,
                                       "jurisdiction": 0, "displacement": 0})["route"]
    assert only_item["custom_weights"] and only_item["score"] == 100  # Tier 1 item = full criticality
    bad = client.post("/api/assess", json={**BASE, **req, "weights": {"vibes": 50}})
    assert bad.status_code == 422


def test_exposure_is_data_driven():
    from _lib import jurisdiction
    kz, ae = jurisdiction.profile("KZ"), jurisdiction.profile("AE")
    assert kz["factors"][0]["points"] == 5 and ae["factors"][0]["points"] == 0  # EAEU membership
    assert 0 < ae["factors"][2]["points"] <= 7  # Russia-related designations based in the UAE
    assert kz["exposure"] == sum(f["points"] for f in kz["factors"])
    assert kz["rationale"].startswith("EAEU customs union with Russia")


def test_eurostat_jsonstat_parser():
    from _lib import eurostat
    body = {"id": ["reporter", "partner", "product", "time"], "size": [1, 2, 1, 3],
            "dimension": {"reporter": {"category": {"index": {"DE": 0}}},
                          "partner": {"category": {"index": {"XS": 0, "RU": 1}}},
                          "product": {"category": {"index": {"848210": 0}}},
                          "time": {"category": {"index": {"2017": 0, "2018": 1, "2019": 2}}}},
            "value": {"0": 5, "1": 7, "4": 9}}
    cells, periods = eurostat._parse(body)
    v = eurostat.VALUE
    assert cells[(v, "RS", "848210", "2017")] == 5 and cells[(v, "RS", "848210", "2018")] == 7
    assert cells[(v, "RU", "848210", "2018")] == 9
    assert periods == ["2017", "2018"]


def test_assessment_includes_new_signals():
    a = assess(company="Northwind Components LLP", jurisdiction="KZ", hs="848210", intermediary="KZ")
    m = a["monthly"]
    assert m and m["months"][0] == "2019-01" and len(m["values"]) == len(m["months"])
    assert m["ytd"]["reference_year"] == 2021 and m["ytd"]["ratio"] is not None
    assert a["unit_values"] and len(a["unit_values"]["per_kg"]) == len(a["series"]["years"])
    assert a["mirror"] and a["mirror"]["unit"] == "USD" and len(a["mirror"]["de_exports"]) == len(a["mirror"]["years"])
    assert "RU" in a["flows"]["partners"] and len(a["flows"]["partners"]) == 13
    assert a["sankey"] and len(a["sankey"]["links"]) == 12


def test_monthly_stats_maths():
    months = [f"{y}-{m:02d}" for y in (2021, 2022, 2023) for m in range(1, 13)] + ["2024-01", "2024-02"]
    values = [100] * 12 + [100] + [100] * 11 + [100] * 12 + [400, 200]
    st = anomaly.monthly_stats({"months": months, "values": values})
    assert st["latest"] == "2024-02" and st["ytd"]["through_month"] == 2
    assert st["ytd"]["ratio"] == pytest.approx(600 / 200)
    assert st["flagged"] == []  # no variance in the baseline, so no Z-scores


def test_unit_values_flag_large_price_shift():
    series = {"years": list(range(2017, 2025)), "values": [1000] * 5 + [9000] * 3, "kg": [100] * 8}
    u = anomaly.unit_values(series)
    assert u["baseline"] == pytest.approx(10) and u["post"] == pytest.approx(90)
    assert u["flag"] is True


def test_radar_matrix():
    r = client.get("/api/radar?exporter=DE").json()
    assert len(r["rows"]) == 50 and len(r["partners"]) == 12
    assert sum(r["counts"].values()) == 600
    assert r["top"][0]["score"] >= r["top"][-1]["score"]
    assert client.get("/api/radar?exporter=FR").status_code == 404


def test_batch_screening():
    rows = [{"company": "OOO Радиоавтоматика", "country": "RU"},
            {"company": "Northwind Components LLP", "country": "KZ", "hs": "848210", "intermediary": "KZ"},
            {"company": "Tailspin Toys GmbH", "country": "DE", "hs": "950300"}]
    out = client.post("/api/batch", json={"rows": rows}).json()
    by = {r["company"]: r for r in out["rows"]}
    assert by["OOO Радиоавтоматика"]["verdict"] == "STOP"
    assert by["Northwind Components LLP"]["verdict"] == "RED FLAG" and by["Northwind Components LLP"]["route_band"] == "CRITICAL"
    assert by["Tailspin Toys GmbH"]["chpl_tier"] is None and by["Tailspin Toys GmbH"]["verdict"] == "STANDARD"
    assert out["rows"][0]["verdict"] == "STOP"  # sorted by severity


def test_registry_flags_new_shell(monkeypatch):
    import httpx
    from _lib import cache

    monkeypatch.setattr(cache, "_memory", {})
    record = {"attributes": {"lei": "TEST00000000000000LEI", "registration": {"status": "ISSUED", "initialRegistrationDate": "2023-05-01T00:00:00Z"},
                             "entity": {"legalName": {"name": "Silk Road Components LLP"}, "otherNames": [],
                                        "legalAddress": {"country": "KZ", "city": "Almaty"},
                                        "creationDate": "2023-04-02T00:00:00Z", "status": "ACTIVE"}}}

    async def fake_get(self, url, **kw):
        req = httpx.Request("GET", url)
        if url.endswith("/ultimate-parent"):
            return httpx.Response(404, json={}, request=req)
        return httpx.Response(200, json={"data": [record]}, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    d = client.get("/api/company?name=Silk Road Components LLP&country=KZ").json()
    assert d["results"][0]["created"] == "2023-04-02"
    assert any("after Russia's full-scale invasion" in f["text"] for f in d["flags"])


def test_unlisted_item_has_no_bundled_mirror_or_flows():
    # The bundles hold the 50 listed items only; unlisted codes must not raise (regression: KeyError -> 500)
    from _lib import mirror, trade
    assert mirror.get("DE", "KZ", "950300") is None
    assert mirror.sankey("DE", "950300") is None
    assert trade.flows("DE", "950300") is None
    assert mirror.get("DE", "KZ", "848210") is not None


@pytest.mark.parametrize("name", ["Firm", "Trading Firm", "Global Parts Distribution LLC"])
def test_generic_words_alone_do_not_match(name):
    from _lib import sanctions
    assert all(m["score"] < 80 for m in sanctions._local_match(name, "O", None))


def test_calculator_matches_engine_and_validates():
    years = list(range(2017, 2026))
    body = {"hs": "848210", "intermediary": "KZ", "years": years,
            "values": [9e5, 1e6, 1.1e6, 9.5e5, 1.05e6, 2.5e6, 4e6, 4.8e6, 5.2e6],
            "russia": [3e6, 3.2e6, 3.4e6, 3.1e6, 3.3e6, 9e5, 3e5, 2e5, 1.5e5]}
    out = client.post("/api/calculate", json=body).json()
    assert out["route"]["band"] == "CRITICAL" and out["verdict"]["code"] == "RED FLAG"
    assert abs(out["route"]["score"] - sum(c["points"] or 0 for c in out["route"]["components"])) <= 1
    assert client.post("/api/calculate", json={**body, "screening": "MATCH"}).json()["verdict"]["code"] == "STOP"
    flat = client.post("/api/calculate", json={**body, "values": [1e6] * 9, "russia": [3e6] * 9}).json()
    assert flat["route"]["band"] in ("LOW", "MODERATE") and flat["route"]["multiplier"] == 1
    assert client.post("/api/calculate", json={**body, "values": [1.0, 2.0]}).status_code == 422
    assert client.post("/api/calculate", json={**body, "values": [-1.0] * 9}).status_code == 422
