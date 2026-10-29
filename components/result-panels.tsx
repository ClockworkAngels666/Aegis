"use client";

import { ArrowSquareOutIcon, SlidersHorizontalIcon, UserCircleIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel } from "@/components/panel";
import { StatusBadge, ToneIcon } from "@/components/status";
import { CompanyMark, Flag } from "@/components/visuals";
import { ProductArt } from "@/components/product-art";
import { RegistryLookup } from "@/components/registry-lookup";
import { bandTone, componentLabel, entityTone } from "@/lib/format";
import type { Classification, Entity, Route, Weights } from "@/lib/types";

export function LegalPanel({ c }: { c: Classification }) {
  const tone = c.chpl ? (c.tier === "1" || c.tier === "2" ? "critical" : "serious") : c.status === "NOT LISTED" ? "good" : "warning";
  return (
    <Panel title="Export control classification" subtitle="EU battlefield item list and dual-use rules." tour="legal" className="h-full">
      <div className="flex items-start justify-between gap-3">
        <ProductArt hs={c.hs} size={64} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-2xl font-bold tracking-wide tabular">{c.hs.slice(0, 4)}.{c.hs.slice(4)}</div>
          <p className="mt-1 font-sans text-[13px] leading-snug text-foreground/90">
            {c.description ?? "Not on the Common High Priority list"}
          </p>
        </div>
        <StatusBadge tone={tone}>{c.chpl ? `Tier ${c.tier}` : c.status}</StatusBadge>
      </div>
      {c.tier_label && <p className="mt-2 text-[11px] text-muted-foreground">{c.tier_label}</p>}
      {c.annex_i_indicative.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-muted-foreground">Possible dual-use entries (Annex I)</span>
          {c.annex_i_indicative.map((x) => (
            <Badge key={x} variant="outline" className="text-[12px]">{x}</Badge>
          ))}
        </div>
      )}
      <ul className="mt-3 space-y-1.5 border-t border-border pt-3 font-sans text-[12px] leading-snug text-foreground/85">
        {c.obligations.map((o) => (
          <li key={o} className="flex gap-2">
            <span className="text-faint">—</span>
            <span>{o}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-faint">{c.source}</p>
    </Panel>
  );
}

/** Name similarity with a bar: red at a match (93%+), orange for a partial match (80%+), grey below. */
function SimilarityBar({ score }: { score: number }) {
  const tone = score >= 93 ? "var(--status-critical)" : score >= 80 ? "var(--status-serious)" : "var(--chart-baseline)";
  return (
    <div className="flex items-center justify-end gap-2" title={score >= 93 ? "Match" : score >= 80 ? "Partial match" : "Weak similarity"}>
      <div className="h-1.5 w-16 rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.max(4, score)}%`, background: tone }} />
      </div>
      <span className="w-9 text-right font-semibold tabular">{score.toFixed(0)}%</span>
    </div>
  );
}

export function EntityPanel({ e, company, jurisdiction }: { e: Entity; company: string; jurisdiction: string | null }) {
  return (
    <Panel title="Sanctions screening" subtitle={`The buyer and its owners, checked against: ${e.lists.join(", ")}.`} tour="entity"
      action={<span className="text-[11px] text-faint">{e.source}</span>}>
      <div className="space-y-4">
        {e.subjects.map((s) => (
          <div key={s.role + s.name}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                {s.role === "Company" ? <CompanyMark name={s.name} size={30} flagged={s.status !== "CLEAN"} />
                  : <UserCircleIcon weight="duotone" className="size-[30px] shrink-0 text-muted-foreground" />}
                <div className="min-w-0">
                  <div className="text-[12px] text-faint">{s.role}</div>
                  <div className="truncate text-sm font-bold">{s.name}</div>
                </div>
              </div>
              <StatusBadge tone={entityTone[s.status]}>
                {s.status}{s.status !== "CLEAN" && ` · ${s.best_score.toFixed(0)}%`}
              </StatusBadge>
            </div>
            {s.matches.length > 0 ? (
              <Table className="mt-2 min-w-[620px] table-fixed text-[12px]">
                {/* fixed columns, so the company's and each owner's tables line up */}
                <colgroup>
                  <col className="w-[44%]" /><col className="w-[16%]" /><col className="w-[10%]" /><col className="w-[12%]" /><col className="w-[18%]" />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead>Listed name</TableHead>
                    <TableHead>Lists</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Listed since</TableHead>
                    <TableHead className="text-right">Similarity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.matches.slice(0, 5).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-normal">
                        <div className="flex items-start gap-2">
                          {m.kind === "O" ? <CompanyMark name={m.name} size={22} flagged />
                            : <UserCircleIcon weight="duotone" className="size-[22px] shrink-0 text-muted-foreground" />}
                          <div>
                            <a href={m.url} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 hover:text-series-1 hover:underline">
                              {m.name} <ArrowSquareOutIcon className="size-3 shrink-0 text-faint" />
                            </a>
                            {m.matched_on && <div className="text-[12px] text-faint">matched: {m.matched_on}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {m.lists.map((l) => <Badge key={l} variant="outline" className="text-[12px]">{l}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {m.countries.slice(0, 3).map((c) => <Flag key={c} code={c} size={18} />)}
                          {m.countries.length === 0 && <span className="text-faint">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="tabular">{m.listed_since || "—"}</TableCell>
                      <TableCell>
                        <SimilarityBar score={m.score} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                No listed name above 70% similarity.
              </p>
            )}
          </div>
        ))}
        {e.warning && <p className="text-[11px] text-warning-ink">{e.warning}</p>}
        <RegistryLookup name={company} country={jurisdiction} />
      </div>
    </Panel>
  );
}

export function ScoreBreakdown({ r, defaults, onWeights }: {
  r: Route;
  defaults: Weights;
  onWeights: (w: Weights | null) => void;
}) {
  const [adjust, setAdjust] = useState(false);
  const [draft, setDraft] = useState<Weights>(() =>
    Object.fromEntries(r.components.map((c) => [c.key, c.weight])));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const change = (key: string, value: number) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onWeights(next), 250);
  };
  const reset = () => {
    setDraft({ ...defaults });
    onWeights(null);
  };
  const { sensitivity: sens, jurisdiction_profile: jp } = r;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          {r.custom_weights ? "Custom weights" : "Default weights"} · score {r.score}
        </p>
        <div className="flex gap-1.5">
          {r.custom_weights && <Button size="xs" variant="ghost" onClick={reset}>Reset</Button>}
          <Button size="xs" variant={adjust ? "secondary" : "outline"} onClick={() => setAdjust(!adjust)}>
            <SlidersHorizontalIcon /> {adjust ? "Done" : "Adjust weights"}
          </Button>
        </div>
      </div>

      {r.components.map((c) => {
        const na = c.points === null;
        const share = na ? 0 : (c.points! / c.weight) * 100;
        return (
          <div key={c.key}>
            <div className="mb-1 flex justify-between text-[12px]">
              <span className={na ? "text-faint" : "text-muted-foreground"}>{componentLabel[c.key] ?? c.key}</span>
              <span className="font-mono tabular">
                {na ? <span className="text-faint">n/a</span> : <span className="text-foreground">{c.points!.toFixed(1)}</span>}
                <span className="text-faint"> / {c.weight.toFixed(0)}</span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full" style={{ background: "color-mix(in srgb, var(--series-1) 14%, transparent)" }}>
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${share}%`, background: "var(--series-1)" }} />
            </div>
            {adjust && (
              <input type="range" min={0} max={50} step={1} value={Math.round(draft[c.key] ?? c.weight)}
                onChange={(e) => change(c.key, Number(e.target.value))}
                aria-label={`Weight for ${componentLabel[c.key] ?? c.key}`}
                className="mt-1.5 h-1 w-full cursor-pointer accent-[var(--series-1)]" />
            )}
          </div>
        );
      })}

      <div className="space-y-1 border-t border-border pt-3 text-[12px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">With equal weights</span>
          <span className="inline-flex items-center gap-1.5 font-mono tabular">
            <ToneIcon tone={bandTone[sens.equal.band]} className="size-3.5" />
            {sens.equal.score} {sens.equal.band}
          </span>
        </div>
        {r.custom_weights && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Default weights</span>
            <span className="inline-flex items-center gap-1.5 font-mono tabular">
              <ToneIcon tone={bandTone[sens.default.band]} className="size-3.5" />
              {sens.default.score} {sens.default.band}
            </span>
          </div>
        )}
        <p className="text-[11px] text-faint">
          {sens.equal.band === r.band ? "Same band with equal weights." : "The band changes with equal weights, so read it with care."}
        </p>
      </div>

      {jp && (
        <div className="border-t border-border pt-3">
          <div className="mb-1.5 flex justify-between text-[12px]">
            <span className="flex items-center gap-1.5 font-bold"><Flag code={jp.iso2} /> {jp.name} exposure</span>
            <span className="font-mono tabular">{jp.exposure.toFixed(1)} / {jp.max}</span>
          </div>
          <ul className="space-y-0.5 text-[12px] text-muted-foreground">
            {jp.factors.map((f) => (
              <li key={f.key} className="flex justify-between gap-3">
                <span>{f.label} <span className="text-faint">({f.detail})</span></span>
                <span className="shrink-0 whitespace-nowrap font-mono tabular">{f.points.toFixed(1)} / {f.max}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
