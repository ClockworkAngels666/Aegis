"use client";

import { CrosshairIcon, CubeIcon, GridFourIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { lazy3D } from "@/components/three/lazy";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Segmented } from "@/components/corridor-panel";
import { PageHeader, Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { ProductArt } from "@/components/product-art";
import { StatusBadge } from "@/components/status";
import { Flag, regionName } from "@/components/visuals";
import { api, ApiUnavailable } from "@/lib/api";
import { bandTone, money, times } from "@/lib/format";
import { usePersisted } from "@/lib/persisted";
import type { Radar, RadarCell } from "@/lib/types";
import { useReconnect } from "@/lib/use-reconnect";

const Skyline3D = lazy3D(() => import("@/components/three/skyline-3d").then((m) => m.Skyline3D), "Risk skyline", "h-[280px] sm:h-[460px]");

const EXPORTERS = [{ code: "DE", name: "Germany" }, { code: "EU27_2020", name: "EU-27" }];
type Hovered = RadarCell & { hs: string; description: string; tier: string };

function Spark({ values, w = 90, h = 26 }: { values: number[]; w?: number; h?: number }) {
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(" ");
  const pre = Math.round((5 / (values.length - 1)) * w);
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <rect x={0} y={0} width={pre} height={h} fill="var(--foreground)" opacity={0.04} />
      <polyline points={pts} fill="none" stroke="var(--series-1)" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

function cellStyle(score: number) {
  return {
    background: `color-mix(in srgb, var(--status-critical) ${Math.max(4, score)}%, var(--card))`,
    color: score >= 58 ? "#fff" : "var(--foreground)",
  };
}

/**
 * The 600-cell heatmap. Memoized: hovering a cell updates the side panel without re-rendering the table.
 */
const Heatmap = memo(function Heatmap({ rows, partners, onHover, onAssess }: {
  rows: Radar["rows"];
  partners: Radar["partners"];
  onHover: (c: Hovered) => void;
  onAssess: (hs: string, partner: string) => void;
}) {
  return (
    <div className="max-h-[680px] overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-[12px]">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th className="sticky left-0 z-20 min-w-[230px] border-b border-border bg-card px-3 py-2 text-left">Item</th>
            {partners.map((p) => (
              <th key={p.code} className="border-b border-border px-1 py-2 font-normal" title={p.name}>
                <div className="flex flex-col items-center gap-0.5">
                  <Flag code={p.code} size={18} />
                  <span className="text-[12px] text-muted-foreground">{p.code}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.hs}>
              <th className="sticky left-0 z-[5] border-b border-border bg-card px-3 py-1 text-left font-normal">
                <div className="flex items-center gap-2">
                  <ProductArt hs={r.hs} size={24} />
                  <div className="min-w-0">
                    <div className="font-bold tabular">{r.hs} <span className="font-normal text-faint">Tier {r.tier}</span></div>
                    <div className="max-w-[180px] truncate text-[12px] text-muted-foreground">{r.description}</div>
                  </div>
                </div>
              </th>
              {r.cells.map((c) => (
                <td key={c.partner} className="border-b border-border p-0.5">
                  <button type="button" style={cellStyle(c.score)}
                    onMouseEnter={() => onHover({ ...c, hs: r.hs, description: r.description, tier: r.tier })}
                    onFocus={() => onHover({ ...c, hs: r.hs, description: r.description, tier: r.tier })}
                    onClick={() => onAssess(r.hs, c.partner)}
                    aria-label={`HS ${r.hs} to ${c.partner}: score ${c.score}, ${c.band}`}
                    className="block h-7 w-full min-w-[40px] text-center text-[12px] font-bold tabular outline-none ring-inset transition-shadow hover:ring-2 hover:ring-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    {c.score}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export function RadarView({ onAssess }: { onAssess: (hs: string, partner: string, exporter: string) => void }) {
  const [exporter, setExporter] = useState("DE");
  const [data, setData] = useState<Radar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<"tier" | "risk">("tier");
  const [hover, setHover] = useState<Hovered | null>(null);
  // Touch screens get the heatmap first: the 3D skyline needs hover to read
  const touch = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
  const [mode, setMode] = usePersisted<"3d" | "heatmap">("aegis-radar-view", touch ? "heatmap" : "3d", ["3d", "heatmap"]);

  useEffect(() => {
    let live = true;
    api.radar(exporter)
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e: Error) => {
        if (!live) return;
        setError(e.message);
        if (e instanceof ApiUnavailable) setOffline(true);
      });
    return () => { live = false; };
  }, [exporter, attempt]);

  useReconnect(offline, () => {
    setOffline(false);
    setAttempt((n) => n + 1);
  });

  const rows = useMemo(() => {
    if (!data || data.exporter !== exporter) return [];
    return sort === "risk" ? [...data.rows].sort((a, b) => b.max - a.max) : data.rows;
  }, [data, sort, exporter]);
  const ready = data && data.exporter === exporter;
  // Stable callbacks so the memoized heatmap and skyline do not re-render on hover
  const assess = useCallback((hs: string, partner: string) => onAssess(hs, partner, exporter), [onAssess, exporter]);
  const detail = hover ?? (ready ? data.top[0] : null);

  return (
    <div className="space-y-4">
      <PageHeader title="Radar" tour="radar"
        description={`Route risk for ${data?.rows.length ?? 50} listed items in ${data?.partners.length ?? 12} countries, based on reported exports. Select a corridor to assess it.`}
        actions={
          <Segmented value={exporter} onChange={setExporter}
            options={EXPORTERS.map((x) => ({ value: x.code, label: x.name, icon: <Flag code={x.code} size={14} /> }))} />
        } />

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!ready ? (
        <div className="grid h-64 place-items-center border border-border bg-card text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><SpinnerGapIcon className="size-4 animate-spin" /> Scoring corridors…</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
            {(["CRITICAL", "HIGH", "MODERATE", "LOW"] as const).map((b) => (
              <div key={b} className="flex items-center justify-between gap-2 bg-card px-4 py-3">
                <StatusBadge tone={bandTone[b]}>{b}</StatusBadge>
                <span className="text-2xl font-bold tabular">{data.counts[b]}</span>
              </div>
            ))}
          </div>

          <Panel title="Highest-risk corridors" subtitle={`${data.exporter_name}, ranked by route risk.`}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.top.slice(0, 9).map((c) => (
                <button key={c.hs + c.partner} type="button" onClick={() => onAssess(c.hs, c.partner, exporter)}
                  className="flex items-center gap-3 border border-border p-3 text-left transition-colors hover:border-ring hover:bg-muted/50">
                  <ProductArt hs={c.hs} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[13px] font-bold">
                      <span className="tabular">{c.hs}</span> → <Flag code={c.partner} size={14} /> {regionName(c.partner)}
                    </div>
                    <div className="truncate text-[12px] text-muted-foreground">{c.description}</div>
                    <div className="mt-1 flex items-center gap-2 text-[12px] tabular">
                      <StatusBadge tone={bandTone[c.band]}>{c.score}</StatusBadge>
                      <span>{c.multiplier !== null ? `${times(c.multiplier)} pre-war` : c.emergent ? "new flow" : ""}</span>
                      {c.ytd !== null && <span className="text-muted-foreground">this year {times(c.ytd)}</span>}
                    </div>
                    {Math.max(c.multiplier ?? 0, c.ytd ?? 0) >= 20 && (
                      <div className="mt-0.5 text-[12px] text-muted-foreground">Small pre-war base: the multiple overstates the volume.</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <Panel title="All corridors" tour="skyline" bodyClassName={mode === "heatmap" ? "p-0" : undefined}
              subtitle={mode === "3d" ? "Bar height and colour show the route risk. Hover for details, click to assess." : "Stronger colour means a higher route risk. Click a cell to assess."}
              action={<>
                <Segmented value={sort} onChange={setSort} options={[{ value: "tier", label: "By tier" }, { value: "risk", label: "By risk" }]} />
                <Segmented value={mode} onChange={setMode} options={[
                  { value: "3d", label: "3D", icon: <CubeIcon className="size-4" /> },
                  { value: "heatmap", label: "Heatmap", icon: <GridFourIcon className="size-4" /> },
                ]} />
              </>}>
              {mode === "3d" ? (
                <Skyline3D data={data} rows={rows} byTier={sort === "tier"} onHover={setHover} onAssess={assess} />
              ) : (
                <>
                  <Heatmap rows={rows} partners={data.partners} onHover={setHover} onAssess={assess} />
                  <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
                    Route risk 0
                    <span className="h-2.5 w-40" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--status-critical) 4%, var(--card)), var(--status-critical))" }} />
                    100
                  </div>
                </>
              )}
            </Panel>

            <div className="xl:sticky xl:top-4 xl:self-start">
              <Panel title="Selected corridor" subtitle="Hover a bar or cell to inspect it.">
                {detail && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <ProductArt hs={detail.hs} size={56} />
                      <div>
                        <div className="text-lg font-bold tabular">HS {detail.hs}</div>
                        <div className="text-[13px] text-muted-foreground">{detail.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[14px] font-bold">
                      <Flag code={exporter} /> {data.exporter_name} → <Flag code={detail.partner} /> {regionName(detail.partner)}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={bandTone[detail.band]}>{detail.band}</StatusBadge>
                      <span className="text-2xl font-bold tabular">{detail.score}</span>
                      <span className="text-muted-foreground">/ 100</span>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-[13px]">
                      <dt className="text-muted-foreground">Vs 2017–21</dt>
                      <dd className="text-right font-bold tabular">{detail.multiplier !== null ? times(detail.multiplier) : detail.emergent ? "new flow" : "—"}</dd>
                      <dt className="text-muted-foreground">{data.years.at(-1)} exports</dt>
                      <dd className="text-right font-bold tabular">{money(detail.latest)}</dd>
                      <dt className="text-muted-foreground">This year vs 2021</dt>
                      <dd className="text-right font-bold tabular">{times(detail.ytd)}</dd>
                      <dt className="text-muted-foreground">Russia exports fell</dt>
                      <dd className="text-right font-bold">{detail.diversion ? "Yes" : "No"}</dd>
                    </dl>
                    <div>
                      <div className="mb-1 text-[12px] text-muted-foreground">Exports {data.years[0]}–{data.years.at(-1)} (shaded: pre-war)</div>
                      <Spark values={detail.spark} w={260} h={60} />
                    </div>
                    <Button className="w-full" onClick={() => onAssess(detail.hs, detail.partner, exporter)}>
                      <CrosshairIcon /> Assess this corridor
                    </Button>
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
