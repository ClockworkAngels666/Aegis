"use client";

import { ArrowCounterClockwiseIcon, DownloadSimpleIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Segmented } from "@/components/corridor-panel";
import { Stat } from "@/components/analysis-panels";
import { PageHeader, Panel } from "@/components/panel";
import { ScoreBreakdown } from "@/components/result-panels";
import { StatusBadge } from "@/components/status";
import { AnomalyChart } from "@/components/trade-charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag } from "@/components/visuals";
import { api } from "@/lib/api";
import { bandTone, money, pct, times, verdictTone } from "@/lib/format";
import type { Assessment, CalcResult, EntityStatus, Reference, Unit, Weights } from "@/lib/types";
import { cn } from "@/lib/utils";

const SANCTIONS_YEAR = 2022;

interface Inputs {
  hs: string;
  intermediary: string;
  screening: EntityStatus;
  unit: Unit;
  years: number[];
  /** Table cells as typed, in thousands. */
  values: string[];
  russia: string[];
}

const k = (v: number) => (v / 1000).toFixed(v < 10_000 ? 1 : 0);
const num = (s: string) => {
  const x = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(x) && x > 0 ? x * 1000 : 0;
};

/** An illustrative starting point when no assessment has been run yet. */
const EXAMPLE: Inputs = {
  hs: "848210", intermediary: "KZ", screening: "CLEAN", unit: "EUR",
  years: [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
  values: ["900", "1000", "1100", "950", "1050", "2500", "4000", "4800", "5200"],
  russia: ["3000", "3200", "3400", "3100", "3300", "900", "300", "200", "150"],
};

function fromAssessment(a: Assessment): Inputs {
  return {
    hs: a.classification.hs, intermediary: a.query.intermediary, screening: a.entity.status, unit: a.series.unit,
    years: a.series.years, values: a.series.values.map(k), russia: a.series.years.map((_, i) => k(a.series.russia[i] ?? 0)),
  };
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[13px]">
        <span className="font-semibold">{label}</span>
        <span className="font-bold tabular">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-[var(--series-1)]" />
    </div>
  );
}

/** What-if calculator: edit the export figures and see the route score and recommended action update. */
export function CalculatorView({ reference, from }: { reference: Reference | null; from: Assessment | null }) {
  const start = useMemo(() => (from ? fromAssessment(from) : EXAMPLE), [from]);
  const [inputs, setInputs] = useState<Inputs>(start);
  const [toCountry, setToCountry] = useState(0); // log2 multiplier for exports to the country since 2022
  const [toRussia, setToRussia] = useState(1); // multiplier for direct exports to Russia since 2022
  const [weights, setWeights] = useState<Weights | null>(null);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const set = (patch: Partial<Inputs>) => setInputs((s) => ({ ...s, ...patch }));
  const reset = () => {
    setInputs(start);
    setToCountry(0);
    setToRussia(1);
    setWeights(null);
  };
  const countryName = reference?.intermediaries.find((x) => x.code === inputs.intermediary)?.name ?? inputs.intermediary;
  const hsInfo = reference?.hs_codes.find((h) => h.hs === inputs.hs);
  const hsValid = /^\d{6}$/.test(inputs.hs);
  const sym = inputs.unit === "EUR" ? "€" : "$";

  // The figures sent to the engine: table values with the two "since 2022" multipliers applied
  const series = useMemo(() => {
    const post = (y: number) => y >= SANCTIONS_YEAR;
    return {
      values: inputs.years.map((y, i) => num(inputs.values[i] ?? "") * (post(y) ? 2 ** toCountry : 1)),
      russia: inputs.years.map((y, i) => num(inputs.russia[i] ?? "") * (post(y) ? toRussia : 1)),
    };
  }, [inputs, toCountry, toRussia]);

  useEffect(() => {
    if (!hsValid) return;
    const id = ++seq.current;
    const timer = window.setTimeout(() => {
      setBusy(true);
      api.calculate({ hs: inputs.hs, intermediary: inputs.intermediary, years: inputs.years, ...series, screening: inputs.screening, weights })
        .then((r) => { if (id === seq.current) { setResult(r); setError(null); } })
        .catch((e: Error) => { if (id === seq.current) setError(e.message); })
        .finally(() => { if (id === seq.current) setBusy(false); });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [inputs.hs, inputs.intermediary, inputs.years, inputs.screening, series, weights, hsValid]);

  const r = result?.route;
  const download = () => {
    const rows = [["year", `exports_to_${inputs.intermediary}`, "direct_to_russia"], ...inputs.years.map((y, i) => [y, series.values[i], series.russia[i]])];
    const url = URL.createObjectURL(new Blob([rows.map((x) => x.join(",")).join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `aegis-calculator-${inputs.hs}-${inputs.intermediary}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Risk calculator"
        description="Change the export figures and see how the route risk and the recommended action respond. Same formulas as the assessment."
        actions={<>
          <Button variant="outline" size="sm" onClick={reset}><ArrowCounterClockwiseIcon /> {from ? "Reset to assessment" : "Reset"}</Button>
          <Button variant="outline" size="sm" onClick={download}><DownloadSimpleIcon /> Download CSV</Button>
        </>} />

      <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
        <Panel title="Inputs" subtitle={from ? `Started from the assessment of ${from.query.company}.` : "Example figures. Run an assessment to start from real data."}
          className="lg:sticky lg:top-4 lg:self-start" bodyClassName="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="calc-hs" className="text-[13px] font-semibold">HS code</Label>
              <Input id="calc-hs" list="calc-hs-list" inputMode="numeric" value={inputs.hs} maxLength={6} aria-invalid={!hsValid}
                onChange={(e) => set({ hs: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
              <datalist id="calc-hs-list">
                {reference?.hs_codes.map((h) => <option key={h.hs} value={h.hs}>{`Tier ${h.tier} · ${h.description}`}</option>)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calc-via" className="text-[13px] font-semibold">Country</Label>
              <Select value={inputs.intermediary} onValueChange={(v) => set({ intermediary: v })}>
                <SelectTrigger id="calc-via" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {reference?.intermediaries.map((x) => <SelectItem key={x.code} value={x.code}><Flag code={x.code} /> {x.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="-mt-2 text-[12px] text-muted-foreground">
            {hsInfo ? `Tier ${hsInfo.tier} · ${hsInfo.description}` : hsValid ? "Not on the EU battlefield item list" : "Six digits"}
          </p>

          <div className="space-y-1.5">
            <span className="block text-[13px] font-semibold">Sanctions screening result</span>
            <Segmented value={inputs.screening} onChange={(v) => set({ screening: v })} options={[
              { value: "CLEAN", label: "No match" }, { value: "PARTIAL", label: "Partial" }, { value: "MATCH", label: "Match" },
            ]} />
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <Slider label={`Exports to ${countryName} since 2022`} value={toCountry} min={-2} max={2} step={0.05}
              onChange={setToCountry} format={(v) => times(2 ** v)} />
            <Slider label="Direct exports to Russia since 2022" value={toRussia} min={0} max={2} step={0.05}
              onChange={setToRussia} format={(v) => times(v)} />
          </div>

          <div className="border-t border-border pt-4">
            <div className="mb-2 text-[13px] font-semibold">Yearly exports ({sym} thousand)</div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-muted-foreground">
                  <th className="pb-1 font-normal">Year</th>
                  <th className="pb-1 font-normal"><span className="inline-flex items-center gap-1"><Flag code={inputs.intermediary} size={14} /> {countryName}</span></th>
                  <th className="pb-1 font-normal"><span className="inline-flex items-center gap-1"><Flag code="RU" size={14} /> Russia</span></th>
                </tr>
              </thead>
              <tbody>
                {inputs.years.map((y, i) => (
                  <tr key={y} className={cn(y < SANCTIONS_YEAR && "text-muted-foreground", y === SANCTIONS_YEAR && "border-t-2 border-border")}>
                    <td className="py-0.5 pr-2 tabular">{y}</td>
                    {(["values", "russia"] as const).map((col) => (
                      <td key={col} className="py-0.5 pr-1">
                        <Input inputMode="decimal" value={inputs[col][i] ?? ""} className="h-7 text-right tabular"
                          aria-label={`${col === "values" ? countryName : "Russia"} ${y}`}
                          onChange={(e) => setInputs((s) => {
                            const next = [...s[col]];
                            next[i] = e.target.value.replace(/[^\d.,]/g, "");
                            return { ...s, [col]: next };
                          })} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Above the line: the {inputs.years[0]}–{SANCTIONS_YEAR - 1} pre-war baseline. The sliders scale the years from {SANCTIONS_YEAR} on.
            </p>
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          {error && <p className="border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">{error}</p>}
          {!r || !result ? (
            <div className="grid h-64 place-items-center border border-border bg-card text-sm text-muted-foreground">
              {hsValid ? "Calculating…" : "Enter a six-digit HS code."}
            </div>
          ) : (
            <>
              <section className={cn("border border-border bg-card transition-opacity", busy && "opacity-70")} aria-live="polite">
                <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                  <div>
                    <div className="text-[12px] text-muted-foreground">Route risk</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-4xl font-bold leading-none tabular">{r.score}</span>
                      <span className="text-muted-foreground">/ 100</span>
                      <StatusBadge tone={bandTone[r.band]}>{r.band}</StatusBadge>
                      {busy && <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <span className="text-[12px] text-muted-foreground">Recommended action</span>
                    <StatusBadge tone={verdictTone[result.verdict.code]} className="h-8 px-3 text-[13px]">{result.verdict.code}</StatusBadge>
                  </div>
                </div>
                <div className="border-t border-border px-5 py-3">
                  <p className="text-[15px] font-bold">{result.verdict.title}</p>
                  {result.verdict.notes.map((n) => <p key={n} className="text-[13px] text-muted-foreground">{n}</p>)}
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-border px-5 py-3 md:grid-cols-4">
                  <Stat label="Pre-war average" value={money(r.baseline.mean, inputs.unit)} sub={`± ${money(r.baseline.std, inputs.unit)} a year`} />
                  <Stat label="Since 2022 vs pre-war" value={r.multiplier !== null ? times(r.multiplier) : r.emergent ? "New flow" : "—"} />
                  <Stat label="Highest Z-score" value={r.z_max !== null ? r.z_max.toFixed(1) : "—"}
                    sub={r.z_max_year ? `${r.z_max_year} · unusual above ${r.threshold}` : undefined} />
                  <Stat label="Direct exports to Russia" value={r.russia_ratio !== null ? pct(r.russia_ratio - 1) : "—"} sub="since 2022 vs pre-war" />
                </div>
                {r.note && <p className="border-t border-border px-5 py-2 text-[13px] text-muted-foreground">{r.note}</p>}
              </section>

              <Panel title={`Exports to ${countryName}`} subtitle="Bars above the yellow line are more than two standard deviations above the pre-war average.">
                <AnomalyChart route={r} partner={countryName} unit={inputs.unit} />
              </Panel>

              <Panel title="Route risk breakdown" subtitle="Weights can be changed here too.">
                <ScoreBreakdown r={r} defaults={reference?.weights ?? {}} onWeights={setWeights} />
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
