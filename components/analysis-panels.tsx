"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status";
import { Flag } from "@/components/visuals";
import { monthLabel, money, times, moneyTick, niceTicks } from "@/lib/format";
import type { Mirror, Monthly, UnitValues, Unit } from "@/lib/types";

const TICK = { fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-sans)" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> };

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 border-l-2 pl-3" style={{ borderColor: tone ?? "var(--border)" }}>
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="text-xl font-bold leading-tight">{value}</div>
      {sub && <div className="text-[12px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function TipBox({ children }: { children: ReactNode }) {
  return <div className="min-w-40 border border-border bg-popover px-3 py-2 text-[12px] shadow-lg tabular">{children}</div>;
}

const ratioTone = (r: number | null) =>
  r === null ? undefined : r >= 3 ? "var(--status-critical)" : r >= 1.5 ? "var(--status-serious)" : "var(--status-good)";

/* ---------------- monthly exports ---------------- */

export function MonthlyPanel({ m }: { m: Monthly | null }) {
  if (!m) return <p className="py-8 text-center text-sm text-muted-foreground">No monthly data for this combination.</p>;
  const flagged = new Set(m.flagged);
  const data = m.months.map((mo, i) => ({ mo, value: m.values[i], z: m.z[i], flagged: flagged.has(mo), pre: mo <= m.baseline.to }));
  const ticks = niceTicks(Math.max(...m.values, m.baseline.upper, 1) * 1.05);
  const { ytd, last12 } = m;
  const yearTicks = data.filter((d) => d.mo.endsWith("-01")).map((d) => d.mo);
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`${ytd.year} so far (Jan–${MONTHS[ytd.through_month - 1]})`} value={money(ytd.value, m.unit)}
          sub={ytd.ratio !== null ? `${times(ytd.ratio)} the same months of ${ytd.reference_year}` : "no 2021 reference"}
          tone={ratioTone(ytd.ratio)} />
        <Stat label="Last 12 months" value={money(last12.value, m.unit)}
          sub={last12.ratio !== null ? `${times(last12.ratio)} all of ${ytd.reference_year}` : "—"} tone={ratioTone(last12.ratio)} />
        <Stat label="Unusual months" value={m.flagged.length} sub="above the pre-war range since March 2022"
          tone={m.flagged.length ? "var(--status-critical)" : undefined} />
        <Stat label="Latest month" value={monthLabel(m.latest)} sub={money(m.values.at(-1) ?? 0, m.unit)} />
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap={1}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <ReferenceArea x1={data[0].mo} x2={m.baseline.to} fill="var(--foreground)" fillOpacity={0.035} />
            <XAxis dataKey="mo" ticks={yearTicks} tickFormatter={(v: string) => v.slice(0, 4)} tickLine={false}
              axisLine={{ stroke: "var(--chart-axis)" }} tick={TICK} />
            <YAxis tickFormatter={(v: number) => moneyTick(v, m.unit)} width={56} tickLine={false} axisLine={false} tick={TICK}
              domain={[0, ticks.at(-1)!]} ticks={ticks} />
            <ReferenceLine y={m.baseline.mean} stroke="var(--muted-foreground)" />
            <ReferenceLine y={m.baseline.upper} stroke="var(--status-warning)" />
            <Tooltip cursor={{ fill: "rgba(127,127,127,0.08)" }} content={({ active, payload }: TipProps) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return (
                <TipBox>
                  <div className="font-bold">{monthLabel(d.mo)}</div>
                  <div>{money(d.value, m.unit, 2)}</div>
                  {d.z !== null && <div className="text-muted-foreground">Z {d.z.toFixed(1)}</div>}
                </TipBox>
              );
            }} />
            <Bar dataKey="value" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.mo} fill={d.flagged ? "var(--status-critical)" : d.pre ? "var(--chart-baseline)" : "var(--series-1)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">
        Grey: pre-war months ({monthLabel(m.baseline.from)}–{monthLabel(m.baseline.to)}). Red: more than two standard
        deviations above the pre-war average. Seasons and single large orders also move monthly figures.
      </p>
    </div>
  );
}

/* ---------------- price per kg ---------------- */

export function PricePanel({ u, unit }: { u: UnitValues | null; unit: Unit }) {
  if (!u || u.baseline === null) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No weight data for this combination.</p>;
  }
  const data = u.years.map((y, i) => ({ year: y, perKg: u.per_kg[i] }));
  const fmt = (v: number) => (v >= 1000 ? money(v, unit, 1) : `${unit === "EUR" ? "€" : "$"}${v.toFixed(v < 10 ? 2 : 0)}`);
  const priceTicks = niceTicks(Math.max(...u.per_kg.map((v) => v ?? 0), u.baseline ?? 0) * 1.1);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pre-war" value={`${fmt(u.baseline)}/kg`} />
          <Stat label="Since 2022" value={u.post !== null ? `${fmt(u.post)}/kg` : "—"} />
          <Stat label="Change" value={u.change !== null ? `${u.change.toFixed(1)}×` : "—"}
            tone={u.flag ? "var(--status-serious)" : "var(--status-good)"} />
        </div>
        <StatusBadge tone={u.flag ? "serious" : "good"}>{u.flag ? "Price shift" : "Stable"}</StatusBadge>
      </div>
      <div className="h-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={TICK} />
            <YAxis tickFormatter={(v: number) => fmt(v)} width={56} tickLine={false} axisLine={false} tick={TICK}
              domain={[0, priceTicks.at(-1)!]} ticks={priceTicks} />
            <ReferenceLine y={u.baseline} stroke="var(--muted-foreground)" />
            <Tooltip content={({ active, payload }: TipProps) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return <TipBox><div className="font-bold">{d.year}</div><div>{d.perKg !== null ? `${fmt(d.perKg)}/kg` : "—"}</div></TipBox>;
            }} />
            <Line dataKey="perKg" stroke="var(--series-1)" strokeWidth={2} connectNulls isAnimationActive={false}
              dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--card)", strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">
        Grey line: pre-war level. A large shift can mean misdeclared goods or a different product mix.
      </p>
    </div>
  );
}

/* ---------------- mirror statistics ---------------- */

const MIRROR = [
  { key: "de", color: "var(--series-1)", label: (c: string) => `Germany reports shipping to ${c}` },
  { key: "imp", color: "var(--series-3)", label: (c: string) => `${c} reports receiving from Germany` },
  { key: "ru", color: "var(--series-2)", label: (c: string) => `${c} reports exporting to Russia` },
] as const;

export function MirrorPanel({ m, partner, partnerCode }: { m: Mirror | null; partner: string; partnerCode: string }) {
  if (!m) return <p className="py-8 text-center text-sm text-muted-foreground">Mirror data covers Germany as the exporter and the listed items.</p>;
  const data = m.years.map((y, i) => ({ year: y, de: m.de_exports[i], imp: m.imports_from_de[i], ru: m.exports_to_ru[i] }));
  const mirrorTicks = niceTicks(Math.max(1, ...data.flatMap((d) => MIRROR.map((x) => d[x.key] ?? 0))) * 1.05);
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Stat label={m.gap_year ? `Reporting gap (${m.gap_year})` : "Reporting gap"}
          value={m.gap !== null ? `${(m.gap * 100).toFixed(0)}%` : "—"}
          sub={`of Germany's reported exports not recorded by ${partner}`}
          tone={m.gap !== null && m.gap >= 0.3 ? "var(--status-serious)" : undefined} />
        <Stat label={`${partner}'s exports to Russia`}
          value={times(m.onward_multiplier)} sub="post-2022 vs pre-war average"
          tone={m.onward_multiplier !== null && m.onward_multiplier >= 2 ? "var(--status-critical)" : undefined} />
      </div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {MIRROR.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ background: s.color }} />
            {s.key !== "de" && <Flag code={partnerCode} size={14} />}
            {s.label(partner)}
          </span>
        ))}
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={TICK} />
            <YAxis tickFormatter={(v: number) => moneyTick(v, "USD")} width={56} tickLine={false} axisLine={false} tick={TICK}
              domain={[0, mirrorTicks.at(-1)!]} ticks={mirrorTicks} />
            <Tooltip content={({ active, payload }: TipProps) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              const v = (x: number | null) => (x === null ? "not reported" : money(x, "USD", 2));
              return (
                <TipBox>
                  <div className="mb-1 font-bold">{d.year}</div>
                  {MIRROR.map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-0.5 w-3" style={{ background: s.color }} />{s.label(partner)}
                      </span>
                      <span className="font-bold">{v(d[s.key])}</span>
                    </div>
                  ))}
                </TipBox>
              );
            }} />
            {MIRROR.map((s) => (
              <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} isAnimationActive={false}
                dot={{ r: 3.5, fill: s.color, stroke: "var(--card)", strokeWidth: 2 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">
        UN Comtrade, USD. Gaps also come from valuation, timing and origin rules: treat them as questions to ask, not
        as proof.
      </p>
    </div>
  );
}
