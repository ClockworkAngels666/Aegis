import type { Band, EntityStatus, Unit, VerdictCode } from "./types";

export function money(v: number, unit: Unit = "EUR", digits = 1): string {
  const sym = unit === "EUR" ? "€" : "$";
  const a = Math.abs(v);
  if (a >= 1e9) return `${sym}${(v / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${sym}${(v / 1e6).toFixed(digits)}M`;
  if (a >= 1e3) return `${sym}${(v / 1e3).toFixed(0)}K`;
  return `${sym}${v.toFixed(0)}`;
}

/** Multiples: one decimal below 100, whole numbers above (tiny baselines make huge ratios). */
export function times(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return "—";
  return x >= 100 ? `${Math.round(x).toLocaleString("en-US")}×` : `${x.toFixed(1)}×`;
}

export function monthLabel(m: string): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
}

export function pct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
}

export function zfmt(z: number | null): string {
  if (z === null) return "—";
  return Math.abs(z) >= 100 ? Math.round(z).toLocaleString("en-US") : z.toFixed(1);
}

export type Tone = "good" | "warning" | "serious" | "critical" | "neutral";

export const bandTone: Record<Band, Tone> = {
  LOW: "good",
  MODERATE: "warning",
  HIGH: "serious",
  CRITICAL: "critical",
};

export const entityTone: Record<EntityStatus, Tone> = {
  CLEAN: "good",
  PARTIAL: "serious",
  MATCH: "critical",
};

export const verdictTone: Record<VerdictCode, Tone> = {
  STOP: "critical",
  HOLD: "serious",
  "RED FLAG": "critical",
  ELEVATED: "serious",
  STANDARD: "good",
};

/** Decisions that block the shipment (Stop, Hold) get a solid badge; warnings stay outlined. */
export const verdictSolid = (code: VerdictCode) => code === "STOP" || code === "HOLD";

export const toneVar: Record<Tone, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
  neutral: "var(--muted-foreground)",
};

export const componentLabel: Record<string, string> = {
  anomaly: "Unusual years",
  surge: "Surge vs baseline",
  materiality: "Materiality (value)",
  criticality: "Item criticality",
  jurisdiction: "Jurisdiction exposure",
  displacement: "Russia displacement",
};

/** Round, evenly spaced axis ticks from 0 to just above `max` (about `count` intervals). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const n = Math.ceil(max / step - 1e-9);
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
}

/** Axis label for a money tick: whole millions/billions without decimals, otherwise one decimal. */
export function moneyTick(v: number, unit: Unit = "EUR"): string {
  const a = Math.abs(v);
  const whole = a >= 1e9 ? v % 1e9 === 0 : a >= 1e6 ? v % 1e6 === 0 : true;
  return money(v, unit, whole ? 0 : 1);
}
