"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

const REGION = typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

/** ISO2 (or Eurostat "EU27_2020") -> flag file code. */
function flagCode(code: string): string {
  return code.startsWith("EU") ? "eu" : code.slice(0, 2).toLowerCase();
}

export function regionName(code: string): string {
  if (code.startsWith("EU")) return "European Union";
  try {
    return REGION?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** Country flag (flag-icons SVGs served from /public/flags). */
export function Flag({ code, size = 16, className }: { code: string; size?: number; className?: string }) {
  if (!code) return null;
  return (
    <Image
      src={`/flags/${flagCode(code)}.svg`}
      alt={regionName(code)}
      title={regionName(code)}
      width={size}
      height={Math.round(size * 0.75)}
      unoptimized
      className={cn("inline-block shrink-0 rounded-[2px] object-cover ring-1 ring-black/10", className)}
      style={{ width: size, height: Math.round(size * 0.75) }}
    />
  );
}

const LEGAL = new Set([
  "llc", "llp", "ltd", "limited", "inc", "co", "company", "corp", "gmbh", "ag", "sa", "jsc", "ojsc", "pjsc",
  "cjsc", "ooo", "oao", "zao", "pao", "ao", "fze", "fzco", "fz", "dmcc", "plc", "bv", "nv", "too", "the", "of",
  "and", "ооо", "оао", "зао", "пао", "ао",
]);
const MARK_COLORS = ["#2a78d6", "#0f766e", "#6250d6", "#475569", "#b45309", "#0e7490", "#7c3aed", "#1d4ed8"];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h);
}

export function initials(name: string): string {
  const words = name
    .replace(/["'«»“”.,()]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !LEGAL.has(w.toLowerCase()));
  const picked = (words.length ? words : name.split(/\s+/)).slice(0, 2);
  return picked.map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Colour, shape (0 rounded square, 1 circle, 2 shield) and initials of a generated company mark. */
export function markStyle(name: string) {
  const h = hash(name.toLowerCase());
  return { id: h, color: MARK_COLORS[h % MARK_COLORS.length], shape: h % 3, text: initials(name) };
}

/**
 * Generated company mark: a deterministic monogram "logo" from the name.
 * Real logos are not used: listed entities rarely have verifiable branding,
 * and reproducing trademarks would imply an endorsement or identification we cannot make.
 */
export function CompanyMark({ name, size = 32, flagged = false, className, x, y }: {
  name: string;
  size?: number;
  flagged?: boolean;
  className?: string;
  /** Position when nested inside another SVG. */
  x?: number;
  y?: number;
}) {
  const { id: h, color, shape, text } = markStyle(name);
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} x={x} y={y} className={cn("shrink-0", className)} role="img"
      aria-label={`${name} (generated mark)`}>
      <defs>
        <linearGradient id={`g${h}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity={0.72} />
        </linearGradient>
      </defs>
      {shape === 0 && <rect x="2" y="2" width="36" height="36" rx="8" fill={`url(#g${h})`} />}
      {shape === 1 && <circle cx="20" cy="20" r="18" fill={`url(#g${h})`} />}
      {shape === 2 && <path d="M20 2 L37 8 V20 C37 30 29 36 20 38 C11 36 3 30 3 20 V8 Z" fill={`url(#g${h})`} />}
      <path d="M8 31 L32 9" stroke="#fff" strokeOpacity={0.14} strokeWidth={6} />
      <text x="20" y="25.5" textAnchor="middle" fill="#fff" fontSize={text.length > 1 ? 14 : 17} fontWeight={700}
        style={{ fontFamily: "var(--font-sans)", letterSpacing: 0.5 }}>
        {text}
      </text>
      {flagged && <circle cx="20" cy="20" r="19" fill="none" stroke="var(--status-critical)" strokeWidth={2.5} />}
    </svg>
  );
}
