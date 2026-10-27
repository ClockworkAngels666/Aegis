"use client";

import { AirplaneIcon, BoatIcon, PauseIcon, PlayIcon, ProhibitIcon, TrainIcon, TruckIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { lazy3D, Loading3D } from "@/components/three/lazy";
import { Flag } from "@/components/visuals";
import { CORRIDORS, type Corridor, LEG_COLOR } from "@/lib/corridors";
import { money } from "@/lib/format";
import type { Flows } from "@/lib/types";
import { cn } from "@/lib/utils";

const Globe3D = lazy3D(() => import("@/components/three/globe-3d").then((m) => m.Globe3D), "Globe", "h-[380px] sm:h-[520px]");

// The flat map carries the world outline (~140 KB); the globe is the default, so load it on demand
const CorridorMap = dynamic(() => import("@/components/corridor-map").then((m) => m.CorridorMap), {
  ssr: false, loading: () => <Loading3D className="aspect-[2/1] w-full" label="Loading map…" />,
});

const MODE_ICON = { sea: BoatIcon, rail: TrainIcon, road: TruckIcon, air: AirplaneIcon };

/** Year stepping for the export-volume time-lapse. */
export function useTimelapse(count: number) {
  const [idx, setIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const yi = idx === null || idx >= count ? count - 1 : idx;
  const yiRef = useRef(yi);
  useEffect(() => {
    yiRef.current = yi;
  });
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const next = yiRef.current + 1;
      if (next >= count) setPlaying(false);
      else setIdx(next);
    }, 950);
    return () => window.clearInterval(id);
  }, [playing, count]);
  return {
    yi,
    playing,
    toggle: () => {
      if (playing) return setPlaying(false);
      if (yi >= count - 1) setIdx(0);
      setPlaying(true);
    },
    seek: (i: number) => {
      setPlaying(false);
      setIdx(i);
    },
  };
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: ReactNode }[];
}) {
  return (
    <div className="inline-flex border border-border">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={cn("flex h-7 items-center gap-1.5 px-2.5 text-[13px]",
            value === o.value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
          {o.icon} {o.label}
        </button>
      ))}
    </div>
  );
}

/** Freight corridors: 3D globe or flat map, a shared time-lapse and the corridor list. */
export function CorridorPanel({ exporter, exporterName, intermediary, intermediaryName, onSelect, flows, view }: {
  exporter: string;
  exporterName: string;
  intermediary: string;
  intermediaryName: string;
  onSelect: (code: string) => void;
  flows: Flows | null;
  view: "globe" | "flat";
}) {
  const [hover, setHover] = useState<string | null>(null);
  const years = flows?.years ?? [];
  const t = useTimelapse(years.length);
  const directValue = flows?.partners.RU?.[t.yi] ?? 0;
  const props = { exporter, exporterName, intermediary, intermediaryName, onSelect, flows, yi: t.yi, hover };

  const active = CORRIDORS.filter((c) => c.serves.includes(intermediary));
  const groups: { title: ReactNode; leg: Corridor["leg"] }[] = [
    { title: <>{exporterName} → {intermediaryName}</>, leg: "inbound" },
    { title: <>{intermediaryName} → Russia</>, leg: "onward" },
    { title: "Restricted since 2022", leg: "restricted" },
  ];

  return (
    <div>
      <div className="mb-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5" style={{ background: LEG_COLOR.inbound }} />EU → intermediary</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5" style={{ background: LEG_COLOR.onward }} />Onward to Russia</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5" style={{ background: LEG_COLOR.restricted }} />Restricted</span>
          {flows && <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed" style={{ borderColor: "var(--series-2)" }} />Direct to Russia</span>}
          <span className="inline-flex items-center gap-1"><BoatIcon className="size-3.5" />sea</span>
          <span className="inline-flex items-center gap-1"><TrainIcon className="size-3.5" />rail</span>
          <span className="inline-flex items-center gap-1"><TruckIcon className="size-3.5" />road</span>
          <span className="inline-flex items-center gap-1"><AirplaneIcon className="size-3.5" />air</span>
        </div>
      </div>

      {flows && years.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[13px]">
          <button type="button" onClick={t.toggle}
            className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1 font-bold hover:bg-muted">
            {t.playing ? <PauseIcon weight="fill" className="size-3.5" /> : <PlayIcon weight="fill" className="size-3.5" />}
            {t.playing ? "Pause" : `Play ${years[0]}–${years.at(-1)}`}
          </button>
          <input type="range" min={0} max={years.length - 1} value={t.yi} aria-label="Year"
            onChange={(e) => t.seek(Number(e.target.value))} className="w-40 accent-[var(--series-1)]" />
          <span className="font-bold tabular">{years[t.yi]}</span>
          <span className="text-muted-foreground">
            Line width: exports of this item in {years[t.yi]} · direct to Russia {money(directValue, flows.unit)}
          </span>
        </div>
      )}

      {view === "globe" ? <Globe3D {...props} /> : <CorridorMap {...props} />}
      <p className="mt-1.5 text-right text-[12px] text-faint">Click a flag to assess that country</p>

      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {groups.map((g) => {
          const items = active.filter((r) => r.leg === g.leg);
          if (!items.length) return null;
          return (
            <div key={g.leg}>
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {g.leg === "inbound" && <Flag code={exporter} size={14} />}
                {g.leg === "onward" && <Flag code={intermediary} size={14} />}
                {g.leg === "restricted" && <ProhibitIcon className="size-3.5 text-destructive" />}
                {g.title}
              </h3>
              <ul className="space-y-2">
                {items.map((r) => {
                  const Icon = MODE_ICON[r.mode];
                  return (
                    <li key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}
                      className={cn("flex gap-2.5 border-l-2 py-0.5 pl-2.5 transition-colors", hover === r.id && "bg-muted")}
                      style={{ borderColor: LEG_COLOR[r.leg] }}>
                      <Icon weight="duotone" className="mt-0.5 size-4 shrink-0" style={{ color: LEG_COLOR[r.leg] }} />
                      <div className="text-[13px] leading-snug">
                        <div className="font-bold">{r.name}</div>
                        <div className="text-muted-foreground">{r.note}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
