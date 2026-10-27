"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Which drawing represents an HS code (by heading). */
export function productKind(hs: string): string {
  const h4 = hs.slice(0, 4);
  const map: Record<string, string> = {
    "8542": "chip", "8517": "radio", "8529": "radio", "8526": "navigation", "8525": "camera", "8532": "capacitor",
    "8541": "transistor", "8536": "connector", "8548": "connector", "8471": "computer", "8504": "converter",
    "8482": "bearing", "8807": "drone", "9013": "optics", "9014": "navigation", "8486": "fab", "8534": "pcb",
    "8543": "instrument", "9030": "instrument", "9027": "instrument", "8457": "cnc", "8458": "cnc", "8459": "cnc",
    "8466": "cnc",
  };
  return map[h4] ?? "crate";
}

const DARK = "#2f3e4e";
const METAL = "#a7b1bd";
const METAL_D = "#7d8896";
const COPPER = "#c27c3a";
const GREEN = "#2f8f5b";
const GLASS = "#7aa1cc";

const ART: Record<string, ReactNode> = {
  chip: (
    <g>
      {[10, 15, 20, 25, 30].map((v) => (
        <g key={v} stroke={METAL} strokeWidth={1.6}>
          <line x1={v} y1={5} x2={v} y2={9} /><line x1={v} y1={31} x2={v} y2={35} />
          <line x1={5} y1={v} x2={9} y2={v} /><line x1={31} y1={v} x2={35} y2={v} />
        </g>
      ))}
      <rect x={9} y={9} width={22} height={22} rx={2} fill={DARK} />
      <rect x={14} y={14} width={12} height={12} rx={1} fill="#465a70" />
      <circle cx={12.5} cy={12.5} r={1.2} fill="#9aa5b1" />
    </g>
  ),
  bearing: (
    <g>
      <circle cx={20} cy={20} r={15} fill={METAL} />
      <circle cx={20} cy={20} r={11.5} fill="#e3e7ec" />
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return <circle key={i} cx={20 + 9.2 * Math.cos(a)} cy={20 + 9.2 * Math.sin(a)} r={2.2} fill={METAL_D} />;
      })}
      <circle cx={20} cy={20} r={6.5} fill={METAL} />
      <circle cx={20} cy={20} r={4} fill="var(--card)" />
    </g>
  ),
  radio: (
    <g>
      <line x1={12} y1={20} x2={8} y2={6} stroke={DARK} strokeWidth={2} strokeLinecap="round" />
      <line x1={28} y1={20} x2={32} y2={6} stroke={DARK} strokeWidth={2} strokeLinecap="round" />
      <rect x={6} y={19} width={28} height={12} rx={2.5} fill="#465a70" />
      {[11, 16, 21, 26].map((x) => <circle key={x} cx={x} cy={25} r={1.4} fill="#7fe0a0" />)}
      <path d="M5 4 Q8 1 11 4 M29 4 Q32 1 35 4" stroke={GLASS} strokeWidth={1.3} fill="none" />
    </g>
  ),
  camera: (
    <g>
      <rect x={6} y={12} width={28} height={19} rx={3} fill={DARK} />
      <rect x={11} y={9} width={9} height={4} rx={1} fill="#465a70" />
      <circle cx={20} cy={21.5} r={7} fill={METAL} />
      <circle cx={20} cy={21.5} r={4.6} fill={GLASS} />
      <circle cx={18.5} cy={20} r={1.4} fill="#e8f1fb" />
    </g>
  ),
  capacitor: (
    <g>
      <line x1={16} y1={30} x2={16} y2={36} stroke={METAL_D} strokeWidth={1.6} />
      <line x1={24} y1={30} x2={24} y2={36} stroke={METAL_D} strokeWidth={1.6} />
      <rect x={11} y={6} width={18} height={25} rx={3} fill="#2a78d6" />
      <rect x={11} y={6} width={5} height={25} rx={2} fill="#7fb2ee" />
      <ellipse cx={20} cy={6.5} rx={9} ry={2.4} fill={METAL} />
    </g>
  ),
  transistor: (
    <g>
      {[14, 20, 26].map((x) => <line key={x} x1={x} y1={22} x2={x} y2={36} stroke={METAL_D} strokeWidth={1.6} />)}
      <path d="M10 22 V12 A10 10 0 0 1 30 12 V22 Z" fill={DARK} />
      <rect x={10} y={20} width={20} height={3} fill="#465a70" />
    </g>
  ),
  connector: (
    <g>
      <rect x={6} y={13} width={20} height={14} rx={2} fill={DARK} />
      <rect x={26} y={16} width={6} height={8} fill={METAL} />
      {[10, 14, 18, 22].map((x) => <rect key={x} x={x} y={17} width={2} height={6} fill={COPPER} />)}
      <path d="M32 20 H37" stroke={DARK} strokeWidth={2.5} strokeLinecap="round" />
    </g>
  ),
  computer: (
    <g>
      <rect x={5} y={8} width={30} height={24} rx={2} fill={GREEN} />
      <rect x={9} y={12} width={10} height={10} rx={1} fill={DARK} />
      <rect x={22} y={12} width={9} height={4} fill={METAL} /><rect x={22} y={18} width={9} height={4} fill={METAL} />
      <rect x={9} y={25} width={22} height={3} fill={COPPER} />
    </g>
  ),
  converter: (
    <g>
      <rect x={6} y={9} width={28} height={22} rx={3} fill="#465a70" />
      <path d="M21 12 L14 22 H20 L18 29 L26 18 H20 Z" fill="#fab219" />
      {[9, 13].map((y) => <line key={y} x1={30} y1={y + 4} x2={30} y2={y + 6} stroke="#9aa5b1" />)}
    </g>
  ),
  drone: (
    <g>
      <path d="M11 11 L29 29 M29 11 L11 29" stroke={DARK} strokeWidth={2.4} />
      {[[11, 11], [29, 11], [11, 29], [29, 29]].map(([x, y]) => (
        <g key={`${x}${y}`}><circle cx={x} cy={y} r={6} fill="none" stroke={METAL} strokeWidth={1.4} />
          <circle cx={x} cy={y} r={1.8} fill={DARK} /></g>
      ))}
      <rect x={16} y={16} width={8} height={8} rx={2} fill="#465a70" />
      <circle cx={20} cy={20} r={1.5} fill="#d03b3b" />
    </g>
  ),
  optics: (
    <g>
      <rect x={6} y={16} width={28} height={8} rx={4} fill={DARK} />
      <rect x={4} y={14} width={6} height={12} rx={2} fill="#465a70" />
      <rect x={30} y={13} width={6} height={14} rx={2} fill="#465a70" />
      <ellipse cx={36} cy={20} rx={1.6} ry={5.5} fill={GLASS} />
      <rect x={17} y={11} width={6} height={5} rx={1} fill={METAL_D} />
    </g>
  ),
  navigation: (
    <g>
      <circle cx={20} cy={20} r={14} fill="none" stroke={METAL} strokeWidth={2} />
      <ellipse cx={20} cy={20} rx={14} ry={5} fill="none" stroke={METAL_D} strokeWidth={1.4} />
      <ellipse cx={20} cy={20} rx={5} ry={14} fill="none" stroke={METAL_D} strokeWidth={1.4} />
      <path d="M20 9 L23 20 L20 31 L17 20 Z" fill="#d03b3b" />
      <path d="M20 20 L23 20 L20 31 L17 20 Z" fill={DARK} />
    </g>
  ),
  fab: (
    <g>
      <circle cx={20} cy={20} r={15} fill="#c9d4e2" />
      <path d="M8 29 A15 15 0 0 0 32 29" fill="#aebccd" />
      {Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => {
        const x = 9 + c * 4, y = 9 + r * 4;
        return Math.hypot(x + 1.5 - 20, y + 1.5 - 20) < 11 ? <rect key={`${r}${c}`} x={x} y={y} width={3.2} height={3.2} fill="#7d8fb0" /> : null;
      }))}
    </g>
  ),
  pcb: (
    <g>
      <rect x={5} y={7} width={30} height={26} rx={2} fill={GREEN} />
      <path d="M9 12 H18 V20 H28 M9 28 H14 V22 M24 12 V16 H31 M22 28 H31" stroke={COPPER} strokeWidth={1.5} fill="none" />
      {[[9, 12], [28, 20], [9, 28], [31, 16], [31, 28]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.6} fill="#e8c27a" />)}
    </g>
  ),
  instrument: (
    <g>
      <rect x={4} y={8} width={32} height={24} rx={2.5} fill="#465a70" />
      <rect x={7} y={11} width={19} height={15} rx={1} fill="#0f2a1e" />
      <path d="M8 19 Q10 13 12 19 T16 19 T20 19 T24 19" stroke="#7fe0a0" strokeWidth={1.3} fill="none" />
      {[13, 19, 25].map((y) => <circle key={y} cx={31} cy={y - 1} r={1.8} fill={METAL} />)}
    </g>
  ),
  cnc: (
    <g>
      <rect x={6} y={24} width={28} height={9} rx={1.5} fill="#465a70" />
      <rect x={9} y={6} width={6} height={19} fill={METAL_D} />
      <rect x={9} y={6} width={22} height={6} fill={METAL} />
      <rect x={22} y={12} width={5} height={7} fill={DARK} />
      <path d="M24.5 19 V23" stroke={METAL} strokeWidth={1.6} />
      <rect x={17} y={22} width={12} height={3} fill={COPPER} />
    </g>
  ),
  crate: (
    <g>
      <rect x={7} y={10} width={26} height={22} rx={1.5} fill="#c79a5b" />
      <path d="M7 16 H33 M7 26 H33 M13 10 V32 M27 10 V32" stroke="#a87a3f" strokeWidth={1.4} />
    </g>
  ),
};

export function ProductArt({ hs, size = 40, className, framed = true }: {
  hs: string; size?: number; className?: string; framed?: boolean;
}) {
  const kind = productKind(hs);
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} role="img" aria-label={`${kind} illustration`}
      className={cn("shrink-0", framed && "rounded-md bg-muted ring-1 ring-border", className)}>
      {ART[kind]}
    </svg>
  );
}
