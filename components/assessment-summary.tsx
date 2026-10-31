"use client";

import { CaretRightIcon, ChartLineIcon, CheckIcon, FileTextIcon, LinkSimpleIcon, MapTrifoldIcon, PackageIcon, UserFocusIcon } from "@phosphor-icons/react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status";
import { CompanyMark, Flag, regionName } from "@/components/visuals";
import { bandTone, entityTone, type Tone, toneVar, times, verdictSolid, verdictTone } from "@/lib/format";
import type { Assessment } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Section = "overview" | "counterparty" | "goods" | "route" | "briefing";

function itemTone(a: Assessment): Tone {
  const c = a.classification;
  if (c.chpl) return c.tier === "1" || c.tier === "2" ? "critical" : "serious";
  return c.status === "NOT LISTED" ? "good" : "warning";
}

function Kpi({ label, value, sub, onClick }: { label: string; value: ReactNode; sub: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="group flex min-w-0 flex-col items-start gap-1 bg-card px-5 py-3 text-left transition-colors hover:bg-muted">
      <span className="flex w-full items-center justify-between text-[12px] text-muted-foreground">
        {label}
        <CaretRightIcon className="size-3.5 opacity-40 transition-opacity group-hover:opacity-100" aria-hidden />
      </span>
      <span className="flex min-h-8 flex-wrap items-center gap-2">{value}</span>
      <span className="line-clamp-3 text-[12.5px] leading-snug text-muted-foreground">{sub}</span>
    </button>
  );
}

/** Copies the address bar, which always describes the assessment on screen. */
function CopyLink() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setState("copied");
    } catch {
      // Older browsers or blocked clipboard permission: copy through a temporary text field
      const field = Object.assign(document.createElement("textarea"), { value: window.location.href });
      field.style.cssText = "position:fixed;opacity:0";
      document.body.append(field);
      field.select();
      setState(document.execCommand("copy") ? "copied" : "failed");
      field.remove();
    }
    window.setTimeout(() => setState("idle"), 2000);
  };
  return (
    <Button variant="ghost" size="sm" onClick={copy} aria-live="polite">
      {state === "copied" ? <CheckIcon /> : <LinkSimpleIcon />}
      {state === "copied" ? "Link copied" : state === "failed" ? "Copy the address bar" : "Copy link"}
    </Button>
  );
}

/** The recommended action as the headline, who and what was assessed, and the four figures behind it. */
export function AssessmentSummary({ a, onSection, listsDate }: { a: Assessment; onSection: (s: Section) => void; listsDate?: string }) {
  const { query: q, classification: c, route: r, entity: e } = a;
  const tone = verdictTone[a.verdict.code];
  const best = e.subjects.flatMap((s) => s.matches).sort((x, y) => y.score - x.score)[0];
  const ytd = a.monthly?.ytd;

  return (
    <section data-tour="verdict" className="border border-border bg-card" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 pt-4">
        <div className="flex min-w-0 items-start gap-3">
          <CompanyMark name={q.company} size={36} flagged={e.status !== "CLEAN"} />
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold leading-tight">{q.company}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-muted-foreground">
              {q.jurisdiction && <><Flag code={q.jurisdiction} size={14} /> {regionName(q.jurisdiction)} <span className="text-faint">·</span></>}
              <span>HS {c.hs.slice(0, 4)}.{c.hs.slice(4)}{c.description && ` ${c.description}`}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
              <Flag code={q.exporter} size={14} /> {q.exporter_name} <span className="text-faint">→</span>
              <Flag code={q.intermediary} size={14} /> {q.intermediary_name} <span className="text-faint">→</span>
              <Flag code="RU" size={14} /> Russia
            </div>
          </div>
        </div>
        <CopyLink />
      </div>

      <div className="px-5 pb-4 pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="sr-only">Recommended action:</span>
          <StatusBadge tone={tone} solid={verdictSolid(a.verdict.code)} large>{a.verdict.code}</StatusBadge>
          <p className="text-[22px] font-bold leading-tight sm:text-[26px]">{a.verdict.title}</p>
        </div>
        {a.verdict.notes.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[14px] text-muted-foreground">
            {a.verdict.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          {listsDate && <span>Sanctions lists checked {listsDate}</span>}
          <button type="button" onClick={() => onSection("briefing")}
            className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
            Due-diligence steps in the briefing
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-border bg-border lg:grid-cols-4">
        <Kpi label="Sanctions screening" onClick={() => onSection("counterparty")}
          value={<StatusBadge tone={entityTone[e.status]}>{e.status === "CLEAN" ? "No match" : e.status}</StatusBadge>}
          sub={best && e.status !== "CLEAN"
            ? `${best.name} · ${best.lists.join(", ")} · ${best.score.toFixed(0)}%`
            : `${e.subjects.length} name${e.subjects.length > 1 ? "s" : ""} checked against EU, US and UN lists`} />
        <Kpi label="Route risk" onClick={() => onSection("route")}
          value={<><span className="text-xl font-bold leading-none tabular">{r.score}</span><span className="text-muted-foreground">/ 100</span>
            <StatusBadge tone={bandTone[r.band]}>{r.band}</StatusBadge></>}
          sub={`${q.exporter_name} → ${q.intermediary_name} for this item`} />
        <Kpi label="Item" onClick={() => onSection("goods")}
          value={<StatusBadge tone={itemTone(a)}>{c.chpl ? `Tier ${c.tier}` : c.status}</StatusBadge>}
          sub={c.chpl ? "On the EU list of battlefield items" : "Not on the EU list of battlefield items"} />
        <Kpi label="Exports vs 2017–21" onClick={() => onSection("route")}
          value={<span className="text-xl font-bold leading-none tabular">{r.multiplier !== null ? times(r.multiplier) : r.emergent ? "New" : "—"}</span>}
          sub={ytd?.ratio != null ? `Average since 2022. ${ytd.year} so far: ${times(ytd.ratio)} the same months of ${ytd.reference_year}.` : "Average since 2022."} />
      </div>
    </section>
  );
}

const SECTIONS: { id: Section; label: string; icon: typeof PackageIcon }[] = [
  { id: "overview", label: "Overview", icon: MapTrifoldIcon },
  { id: "counterparty", label: "Counterparty", icon: UserFocusIcon },
  { id: "goods", label: "Goods", icon: PackageIcon },
  { id: "route", label: "Trade route", icon: ChartLineIcon },
  { id: "briefing", label: "Briefing", icon: FileTextIcon },
];

const DOT_WORD: Record<Tone, string> = { good: "clear", neutral: "info", warning: "check", serious: "check", critical: "alert" };

/** Section switcher for the assessment, with a status dot where a section carries a finding. */
export function SectionTabs({ value, onChange, a }: { value: Section; onChange: (s: Section) => void; a: Assessment }) {
  const dot: Partial<Record<Section, Tone>> = {
    counterparty: entityTone[a.entity.status],
    goods: itemTone(a),
    route: bandTone[a.route.band],
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = SECTIONS.findIndex((x) => x.id === value);
    const next = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: SECTIONS.length - 1 } as Record<string, number>)[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const id = SECTIONS[(next + SECTIONS.length) % SECTIONS.length].id;
    onChange(id);
    document.getElementById(`tab-${id}`)?.focus();
  };
  return (
    <div className="sticky top-0 z-20 -mx-1 bg-background px-1" data-tour="sections">
      {/* On phones the tabs scroll sideways; the fade at the right edge shows there is more */}
      <div role="tablist" aria-label="Assessment sections" onKeyDown={onKey}
        className="flex gap-0.5 overflow-x-auto border-b border-border max-sm:[mask-image:linear-gradient(to_right,#000_85%,transparent)] sm:gap-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={value === id} aria-controls="section-panel"
            tabIndex={value === id ? 0 : -1} onClick={() => onChange(id)}
            className={cn("flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[14px] transition-colors sm:px-3",
              value === id ? "border-foreground font-bold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="size-4 max-sm:hidden" aria-hidden /> {label}
            {dot[id] && <span className="size-2 rounded-full" style={{ background: toneVar[dot[id]!] }} aria-hidden />}
            {dot[id] && <span className="sr-only">({DOT_WORD[dot[id]!]})</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
