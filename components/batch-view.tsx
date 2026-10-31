"use client";

import { ArrowRightIcon, CubeIcon, DownloadSimpleIcon, ListChecksIcon, SpinnerGapIcon, TableIcon, UploadSimpleIcon, XIcon } from "@phosphor-icons/react";
import { lazy3D } from "@/components/three/lazy";
import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Segmented } from "@/components/corridor-panel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, Panel } from "@/components/panel";
import { ProductArt } from "@/components/product-art";
import { StatusBadge } from "@/components/status";
import { CompanyMark, Flag } from "@/components/visuals";
import { api } from "@/lib/api";
import { bandTone, entityTone, verdictSolid, verdictTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BatchResult, BatchRowIn, BatchRowOut, VerdictCode } from "@/lib/types";

const RiskCube3D = lazy3D(() => import("@/components/three/risk-cube-3d").then((m) => m.RiskCube3D), "Risk cube", "h-[360px] sm:h-[440px]");

const SAMPLE = `company,country,hs,intermediary
Northwind Components LLP,KZ,848210,KZ
Contoso Electronics LLC,KG,854239,KG
OOO Радиоавтоматика,RU,854231,AM
Fabrikam Trading FZE,AE,854231,AE
Adventure Works Trading,TR,851762,TR
Wide World Importers,AM,854232,AM
Tailspin Toys GmbH,DE,950300,
Kalashnikov Concern,RU,,`;

function SanctionsCell({ r }: { r: BatchRowOut }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge tone={entityTone[r.entity_status]}>{r.entity_status === "CLEAN" ? "No match" : r.entity_status}</StatusBadge>
      {r.best_match && r.entity_status !== "CLEAN" && (
        <span className="text-muted-foreground">{r.best_match} · {r.best_lists.join(", ")} · {r.best_similarity?.toFixed(0)}%</span>
      )}
    </div>
  );
}

function ItemCell({ r }: { r: BatchRowOut }) {
  return r.hs ? (
    <div className="flex items-center gap-2">
      <ProductArt hs={r.hs} size={24} />
      <span className="tabular">{r.hs}</span>
      <span className="text-muted-foreground">{r.chpl_tier ? `Tier ${r.chpl_tier}` : "not listed"}</span>
    </div>
  ) : <span className="text-faint">—</span>;
}

function RouteCell({ r }: { r: BatchRowOut }) {
  return r.route_score !== null && r.route_band && r.intermediary ? (
    <div className="flex items-center gap-2">
      <Flag code={r.intermediary} size={14} />
      <StatusBadge tone={bandTone[r.route_band]}>{r.route_score}</StatusBadge>
    </div>
  ) : <span className="text-faint">—</span>;
}

/** Minimal CSV parser: commas, quoted fields, optional header row. Counts the rows it leaves out. */
function parseCsv(text: string): { rows: BatchRowIn[]; short: number; extra: number } {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
      } else if ((ch === "," || ch === ";" || ch === "\t") && !quoted) {
        cells.push(cur.trim()); cur = "";
      } else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  if (!rows.length) return { rows: [], short: 0, extra: 0 };
  const header = rows[0].map((h) => h.toLowerCase());
  const hasHeader = header.includes("company");
  const idx = (name: string, fallback: number) => (hasHeader ? header.indexOf(name) : fallback);
  const [ci, co, hs, im] = [idx("company", 0), idx("country", 1), idx("hs", 2), idx("intermediary", 3)];
  const all = (hasHeader ? rows.slice(1) : rows)
    .map((r) => ({ company: r[ci] ?? "", country: co >= 0 ? r[co] : undefined, hs: hs >= 0 ? r[hs] : undefined, intermediary: im >= 0 ? r[im] : undefined }));
  const named = all.filter((r) => r.company.length >= 2);
  return { rows: named.slice(0, 200), short: all.length - named.length, extra: Math.max(0, named.length - 200) };
}

function toCsv(result: BatchResult): string {
  const head = ["verdict", "company", "country", "sanctions_status", "best_match", "lists", "similarity", "hs", "chpl_tier", "intermediary", "route_score", "route_band"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = result.rows.map((r) => [r.verdict, r.company, r.country, r.entity_status, r.best_match, r.best_lists.join(" "),
    r.best_similarity, r.hs, r.chpl_tier, r.intermediary, r.route_score, r.route_band].map(esc).join(","));
  return [head.join(","), ...lines].join("\n");
}

/** Kept by the dashboard so results survive switching views (e.g. after opening a row's assessment). */
export interface BatchState {
  text: string;
  result: BatchResult | null;
}

export function BatchView({ state, onState, onAssess }: {
  state: BatchState;
  onState: Dispatch<SetStateAction<BatchState>>;
  onAssess?: (r: BatchRowOut) => void;
}) {
  const { text, result } = state;
  const setText = (t: string) => onState((s) => ({ ...s, text: t }));
  const setResult = (r: BatchResult | null) => onState((s) => ({ ...s, result: r }));
  const [mode, setMode] = useState<"table" | "3d">("table");
  const [only, setOnly] = useState<VerdictCode | null>(null);
  const shown = useMemo(() => (result ? result.rows.filter((r) => !only || r.verdict === only) : []), [result, only]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const { rows, short, extra } = parseCsv(text);

  const run = async () => {
    setLoading(true);
    setError(null);
    setOnly(null);
    try {
      setResult(await api.batch(rows, "DE"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screening failed");
    } finally {
      setLoading(false);
    }
  };
  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([toCsv(result)], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "aegis-batch-screening.csv" }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Batch screening"
        description="Screen up to 200 counterparties against the EU, US and UN sanctions lists. Rows with an HS code and a route also get the item and route checks." />

      <Panel title="Counterparties" subtitle={<>CSV columns: <b>company</b> (required), country, hs, intermediary. Paste below or upload a file.</>}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false}
          placeholder="company,country,hs,intermediary" aria-label="Counterparties as CSV"
          className="w-full resize-y border border-input bg-transparent px-3 py-2 text-[13px] tabular outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50" />
        {(short > 0 || extra > 0) && (
          <p className="mt-2 text-[13px] text-muted-foreground" role="status">
            {extra > 0 && `Only the first 200 rows are screened; ${extra} more ${extra === 1 ? "was" : "were"} left out. `}
            {short > 0 && `${short} row${short === 1 ? " has" : "s have"} no company name of at least 2 characters and ${short === 1 ? "is" : "are"} skipped.`}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => file.current?.click()}><UploadSimpleIcon /> Upload CSV</Button>
          <Button variant="outline" onClick={() => setText(SAMPLE)}><ListChecksIcon /> Load sample</Button>
          <Button onClick={run} disabled={loading || rows.length === 0}>
            {loading ? <SpinnerGapIcon className="animate-spin" /> : <ListChecksIcon />}
            {loading ? "Screening…" : `Screen ${rows.length} row${rows.length === 1 ? "" : "s"}`}
          </Button>
          {error && <span className="text-[13px] text-destructive">{error}</span>}
        </div>
      </Panel>

      {result && (
        <Panel title="Results" tour="cube"
          subtitle={`${result.count} counterpart${result.count === 1 ? "y" : "ies"}, most severe first.${mode === "3d" ? " Click a point to open its assessment." : ""}`}
          action={<>
            <Segmented value={mode} onChange={setMode} options={[
              { value: "table", label: "Table", icon: <TableIcon className="size-4" /> },
              { value: "3d", label: "3D", icon: <CubeIcon className="size-4" /> },
            ]} />
            <Button size="sm" variant="outline" onClick={download}><DownloadSimpleIcon /> Download CSV</Button>
          </>}>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(Object.keys(result.summary) as VerdictCode[]).filter((k) => result.summary[k] > 0).map((k) => (
              <button key={k} type="button" onClick={() => setOnly(only === k ? null : k)} aria-pressed={only === k}
                title={only === k ? "Show all rows" : `Show only ${k}`}
                className={cn("transition-opacity", only && only !== k && "opacity-40 hover:opacity-80")}>
                <StatusBadge tone={verdictTone[k]} solid={verdictSolid(k)}>{`${result.summary[k]} ${k}`}</StatusBadge>
              </button>
            ))}
            {only && (
              <button type="button" onClick={() => setOnly(null)} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                <XIcon className="size-3.5" /> Show all
              </button>
            )}
          </div>
          {mode === "3d" ? (
            <>
              <RiskCube3D rows={shown} onAssess={onAssess} />
              <p className="mt-2 text-[13px] text-muted-foreground">
                Left to right: sanctions-match score. Up: route risk. Front to back: item tier. Diamonds have a sanctions
                match; shaded slabs mark the Stop and Hold zones.
              </p>
            </>
          ) : (
          <>
          <ul className="divide-y divide-border border-y border-border md:hidden">
            {shown.map((r, i) => (
              <li key={i} className="space-y-2 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <CompanyMark name={r.company} size={24} flagged={r.entity_status !== "CLEAN"} />
                    <span className="truncate font-bold">{r.company}</span>
                    {r.country && <Flag code={r.country} size={14} />}
                  </div>
                  <StatusBadge tone={verdictTone[r.verdict]} solid={verdictSolid(r.verdict)}>{r.verdict}</StatusBadge>
                </div>
                <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                  <dt className="text-muted-foreground">Sanctions</dt><dd><SanctionsCell r={r} /></dd>
                  <dt className="text-muted-foreground">Item</dt><dd><ItemCell r={r} /></dd>
                  <dt className="text-muted-foreground">Route risk</dt><dd><RouteCell r={r} /></dd>
                </dl>
                {onAssess && (
                  <Button size="xs" variant="outline" onClick={() => onAssess(r)} aria-label={`Open the assessment of ${r.company}`}>
                    Assess <ArrowRightIcon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto max-md:hidden">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Sanctions screening</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Route risk</TableHead>
                  {onAssess && <TableHead className="w-24"><span className="sr-only">Open</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell><StatusBadge tone={verdictTone[r.verdict]} solid={verdictSolid(r.verdict)}>{r.verdict}</StatusBadge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CompanyMark name={r.company} size={24} flagged={r.entity_status !== "CLEAN"} />
                        <span className="font-bold">{r.company}</span>
                        {r.country && <Flag code={r.country} size={14} />}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal"><SanctionsCell r={r} /></TableCell>
                    <TableCell><ItemCell r={r} /></TableCell>
                    <TableCell><RouteCell r={r} /></TableCell>
                    {onAssess && (
                      <TableCell className="text-right">
                        <Button size="xs" variant="ghost" onClick={() => onAssess(r)} aria-label={`Open the assessment of ${r.company}`}>
                          Assess <ArrowRightIcon />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
          )}
        </Panel>
      )}
    </div>
  );
}
