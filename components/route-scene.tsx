"use client";

import { lazy3D } from "@/components/three/lazy";
import { StatusBadge } from "@/components/status";
import { CompanyMark, Flag, regionName } from "@/components/visuals";
import { bandTone, entityTone, money } from "@/lib/format";
import { MODE_LABEL, ROUTE_MODES, type Mode } from "@/lib/routes";
import type { Assessment } from "@/lib/types";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const Diorama3D = lazy3D(() => import("@/components/three/diorama-3d").then((m) => m.Diorama3D), "3D shipment", "h-[230px] sm:h-[330px]");

/* ---------- isometric drawing helpers (2:1 projection) ---------- */

const C = 0.866;
const S = 0.5;
type Pt = [number, number];
const pts = (a: Pt[]) => a.map((p) => p.join(",")).join(" ");

/** A footprint of w x d centred on (cx, cy) on screen; returns a projector for (X, Y, Z). */
function plot(cx: number, cy: number, w: number, d: number) {
  const ox = cx - ((w - d) / 2) * C;
  const oy = cy - ((w + d) / 2) * S;
  return (X: number, Y: number, Z: number): Pt => [ox + (X - Y) * C, oy + (X + Y) * S - Z];
}
type Proj = ReturnType<typeof plot>;

function Box({ p, x, y, z, w, d, h, top, left, right }: {
  p: Proj; x: number; y: number; z: number; w: number; d: number; h: number; top: string; left: string; right: string;
}) {
  const q = (X: number, Y: number, Z: number) => p(x + X, y + Y, z + Z);
  return (
    <g stroke="#9aa5b1" strokeWidth={0.6} strokeLinejoin="round">
      <polygon points={pts([q(0, d, 0), q(w, d, 0), q(w, d, h), q(0, d, h)])} fill={left} />
      <polygon points={pts([q(w, 0, 0), q(w, d, 0), q(w, d, h), q(w, 0, h)])} fill={right} />
      <polygon points={pts([q(0, 0, h), q(w, 0, h), q(w, d, h), q(0, d, h)])} fill={top} />
    </g>
  );
}

/** Rectangles painted on the front-left (Y = y + d) face of a box. */
function LeftPanes({ p, x, y, z, d, items, fill }: {
  p: Proj; x: number; y: number; z: number; d: number; fill: string; items: [number, number, number, number][];
}) {
  return (
    <g fill={fill}>
      {items.map(([a, b, ww, hh], i) => (
        <polygon key={i} points={pts([p(x + a, y + d, z + b), p(x + a + ww, y + d, z + b),
          p(x + a + ww, y + d, z + b + hh), p(x + a, y + d, z + b + hh)])} />
      ))}
    </g>
  );
}

/** Rectangles painted on the front-right (X = x + w) face of a box. */
function RightPanes({ p, x, y, z, w, items, fill }: {
  p: Proj; x: number; y: number; z: number; w: number; fill: string; items: [number, number, number, number][];
}) {
  return (
    <g fill={fill}>
      {items.map(([a, b, ww, hh], i) => (
        <polygon key={i} points={pts([p(x + w, y + a, z + b), p(x + w, y + a + ww, z + b),
          p(x + w, y + a + ww, z + b + hh), p(x + w, y + a, z + b + hh)])} />
      ))}
    </g>
  );
}

function grid(cols: number, rows: number, x0: number, z0: number, ww: number, hh: number, gx: number, gz: number) {
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([x0 + c * gx, z0 + r * gz, ww, hh]);
  return out;
}

function FlagPole({ at, code }: { at: Pt; code: string }) {
  const [x, y] = at;
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - 64} stroke="#6b7684" strokeWidth={1.6} />
      <circle cx={x} cy={y - 65} r={1.8} fill="#6b7684" />
      <image href={`/flags/${code.startsWith("EU") ? "eu" : code.toLowerCase()}.svg`} x={x + 1} y={y - 63}
        width={28} height={21} preserveAspectRatio="none" />
      <rect x={x + 1} y={y - 63} width={28} height={21} fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={0.6} />
    </g>
  );
}

const PLATFORM = { top: "#eef1f4", left: "#dde2e8", right: "#cdd4dc" };

function Factory({ cx, cy, code }: { cx: number; cy: number; code: string }) {
  const p = plot(cx, cy, 110, 110);
  return (
    <g>
      <Box p={p} x={0} y={0} z={0} w={110} d={110} h={6} {...PLATFORM} />
      <Box p={p} x={78} y={12} z={6} w={11} d={11} h={84} top="#b9c1cb" left="#c9d0d8" right="#aab3be" />
      <g className="smoke">
        {[0, 1, 2].map((i) => {
          const [sx, sy] = p(83, 17, 96);
          return <circle key={i} cx={sx} cy={sy} r={5 + i * 2} fill="#cfd6de" style={{ animationDelay: `${i * 1.2}s` }} />;
        })}
      </g>
      <Box p={p} x={10} y={28} z={6} w={88} d={66} h={38} top="#f7f9fb" left="#e7ebf0" right="#ccd4dd" />
      {[0, 1, 2, 3].map((i) => (
        <Box key={i} p={p} x={16 + i * 20} y={34} z={44} w={10} d={54} h={7} top="#bcd6f2" left="#a9c8ea" right="#8fb4dd" />
      ))}
      <LeftPanes p={p} x={10} y={28} z={6} d={66} fill="#a9c8ea" items={grid(5, 1, 8, 16, 10, 10, 16, 0)} />
      <RightPanes p={p} x={10} y={28} z={6} w={88} fill="#7d8896" items={[[14, 0, 22, 24], [42, 0, 16, 24]]} />
      <FlagPole at={p(4, 104, 6)} code={code} />
    </g>
  );
}

function BuyerCompound({ cx, cy, code, name, flagged }: { cx: number; cy: number; code: string; name: string; flagged: boolean }) {
  const p = plot(cx, cy, 110, 110);
  const [mx, my] = p(34, 34, 116);
  return (
    <g>
      <Box p={p} x={0} y={0} z={0} w={110} d={110} h={6} {...PLATFORM} />
      <Box p={p} x={14} y={14} z={6} w={40} d={40} h={98} top="#eaf2fb" left="#d5e3f3" right="#b7cbe2" />
      <LeftPanes p={p} x={14} y={14} z={6} d={40} fill="#8fb4dd" items={grid(3, 6, 5, 12, 8, 9, 12, 14)} />
      <RightPanes p={p} x={14} y={14} z={6} w={40} fill="#7aa1cc" items={grid(3, 6, 5, 12, 8, 9, 12, 14)} />
      <Box p={p} x={60} y={42} z={6} w={44} d={58} h={30} top="#f7f9fb" left="#e7ebf0" right="#ccd4dd" />
      <LeftPanes p={p} x={60} y={42} z={6} d={58} fill="#8a95a3" items={[[6, 0, 13, 20], [25, 0, 13, 20]]} />
      <RightPanes p={p} x={60} y={42} z={6} w={44} fill="#a9b3bf" items={[[10, 18, 38, 5]]} />
      <line x1={mx} y1={my + 8} x2={mx} y2={my + 2} stroke="#6b7684" strokeWidth={1.4} />
      <CompanyMark name={name} size={34} flagged={flagged} x={mx - 17} y={my - 34} />
      <FlagPole at={p(4, 104, 6)} code={code} />
    </g>
  );
}

function Depot({ cx, cy, code }: { cx: number; cy: number; code: string }) {
  const p = plot(cx, cy, 110, 110);
  return (
    <g>
      <Box p={p} x={0} y={0} z={0} w={110} d={110} h={6} {...PLATFORM} />
      <Box p={p} x={18} y={22} z={6} w={78} d={70} h={34} top="#f1ece8" left="#e2d9d2" right="#c9bdb4" />
      <Box p={p} x={18} y={22} z={40} w={78} d={70} h={4} top="#d8cdc4" left="#cbbfb5" right="#b6a99f" />
      <LeftPanes p={p} x={18} y={22} z={6} d={70} fill="#8d7f75" items={[[8, 0, 16, 22], [32, 0, 16, 22], [56, 0, 14, 22]]} />
      <FlagPole at={p(4, 104, 6)} code={code} />
    </g>
  );
}

/* ---------- vehicles (drawn facing right, centred on the path) ---------- */

const CONTAINER = ["#2a78d6", "#eb6834", "#0f766e", "#b45309", "#6250d6", "#475569"];

function Ship({ n }: { n: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={-27 + (i % 4) * 10} y={-12 - Math.floor(i / 4) * 7} width={9} height={6.5} rx={0.8}
          fill={CONTAINER[i % CONTAINER.length]} stroke="#fff" strokeWidth={0.6} />
      ))}
      <rect x={14} y={-20} width={10} height={15} fill="#eef1f4" stroke="#7d8896" strokeWidth={0.6} />
      <rect x={15.5} y={-17} width={7} height={2.5} fill="#7aa1cc" />
      <path d="M-34 -5 L36 -5 L29 7 L-29 7 Z" fill="#1f3a5f" />
      <path d="M-34 -5 L36 -5 L35 -2.5 L-33 -2.5 Z" fill="#d03b3b" opacity={0.85} />
    </g>
  );
}

function Truck({ n }: { n: number }) {
  return (
    <g>
      <rect x={-32} y={-20} width={40} height={16} rx={1.5} fill={CONTAINER[n % CONTAINER.length]} stroke="#fff" strokeWidth={0.6} />
      {[0, 1, 2, 3].map((i) => <line key={i} x1={-26 + i * 9} y1={-18} x2={-26 + i * 9} y2={-6} stroke="#fff" strokeOpacity={0.35} />)}
      <path d="M10 -15 H21 L27 -9 V-4 H10 Z" fill="#2f3e4e" />
      <rect x={20} y={-13.5} width={4} height={4} fill="#9cc3ec" />
      {[-24, -14, 18].map((cx) => <circle key={cx} cx={cx} cy={-2} r={3.4} fill="#1f2933" stroke="#fff" strokeWidth={0.8} />)}
    </g>
  );
}

function Plane() {
  return (
    <path d="M-26 0 L16 -2 C24 -2 28 0 28 1 C28 2 24 3 16 3 L-26 2 Z M-2 -1 L-14 -16 L-8 -16 L8 -1 Z M-2 2 L-14 16 L-8 16 L8 2 Z M-24 0 L-30 -9 L-25 -9 L-18 0 Z"
      fill="#2f3e4e" />
  );
}

function Vehicle({ mode, n }: { mode: Mode; n: number }) {
  if (mode === "sea") return <Ship n={n} />;
  if (mode === "air") return <Plane />;
  return <Truck n={n} />;
}

/* ---------- legs ---------- */

function legPath(x1: number, x2: number, y: number, mode: Mode) {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y} Q ${mid} ${mode === "air" ? y - 120 : y + 20} ${x2} ${y}`;
}

function Leg({ id, d, mode, alert }: { id: string; d: string; mode: Mode; alert: boolean }) {
  return (
    <g>
      {mode === "sea" && (
        <>
          <path d={d} fill="none" stroke="#d6e7f8" strokeWidth={26} strokeLinecap="round" />
          <path d={d} fill="none" stroke="#b4d2f0" strokeWidth={1.2} strokeDasharray="6 9" transform="translate(0,-6)" />
          <path d={d} fill="none" stroke="#b4d2f0" strokeWidth={1.2} strokeDasharray="4 11" transform="translate(0,6)" />
        </>
      )}
      {mode === "land" && (
        <>
          <path d={d} fill="none" stroke="#d3d8de" strokeWidth={18} strokeLinecap="round" />
          <path d={d} fill="none" stroke="#ffffff" strokeWidth={1.6} strokeDasharray="9 8" />
        </>
      )}
      {mode === "air" && <path d={d} fill="none" stroke="#b7c0ca" strokeWidth={1.6} strokeDasharray="2 7" strokeLinecap="round" />}
      <path id={id} d={d} fill="none" stroke={alert ? "var(--status-critical)" : "none"} strokeWidth={2}
        strokeDasharray="7 6" opacity={0.9} />
    </g>
  );
}

function Moving({ path, dur, begin, still, tilt, children }: {
  path: string; dur: number; begin: number; still: Pt; tilt: boolean; children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <g transform={`translate(${still[0]},${still[1]})`}>{children}</g>;
  return (
    <g>
      {children}
      <animateMotion dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" rotate={tilt ? "auto" : "0"} keyPoints="0;1"
        keyTimes="0;1" calcMode="linear">
        <mpath href={`#${path}`} />
      </animateMotion>
    </g>
  );
}

/* ---------- scene ---------- */

const NODES = { exporter: 167, buyer: 500, russia: 833 };
const GROUND = 186;

export function RouteScene({ a, view }: { a: Assessment; view: "3d" | "flat" }) {
  const { query: q, route, entity, series } = a;
  const modes = ROUTE_MODES[q.intermediary] ?? { first: "land", onward: "land" };
  const last = route.points.at(-1);
  const flagged = entity.status !== "CLEAN";
  const alert = route.band === "CRITICAL" || route.band === "HIGH";
  const shipments = route.emergent ? 8 : Math.max(1, Math.min(8, Math.round(route.multiplier ?? 2)));
  const leg1 = legPath(NODES.exporter + 95, NODES.buyer - 95, GROUND, modes.first);
  const leg2 = legPath(NODES.buyer + 95, NODES.russia - 95, GROUND, modes.onward);
  const mid = (x1: number, x2: number, mode: Mode): Pt => [(x1 + x2) / 2, mode === "air" ? GROUND - 60 : GROUND + 10];
  const ruDrop = route.russia_ratio !== null ? Math.round((1 - route.russia_ratio) * 100) : null;
  const buyerCountry = q.jurisdiction || q.intermediary;

  return (
    <div>
      {view === "3d" ? <Diorama3D a={a} /> : (
      <>
      <svg viewBox="0 0 1000 268" className="w-full" role="img"
        aria-label={`Illustration: ${q.exporter_name} exports to ${q.company} in ${q.intermediary_name}, with a possible onward route to Russia`}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--scene-sky-top)" />
            <stop offset="1" stopColor="var(--scene-sky-bottom)" />
          </linearGradient>
        </defs>
        <rect width="1000" height="268" rx="8" fill="url(#sky)" />
        <Leg id="leg1" d={leg1} mode={modes.first} alert={false} />
        <Leg id="leg2" d={leg2} mode={modes.onward} alert={alert} />
        <Factory cx={NODES.exporter} cy={GROUND} code={q.exporter} />
        <BuyerCompound cx={NODES.buyer} cy={GROUND} code={buyerCountry} name={q.company} flagged={flagged} />
        <Depot cx={NODES.russia} cy={GROUND} code="RU" />
        <Moving path="leg1" dur={9} begin={0} still={mid(NODES.exporter + 95, NODES.buyer - 95, modes.first)}
          tilt={modes.first === "air"}>
          <Vehicle mode={modes.first} n={shipments} />
        </Moving>
        <Moving path="leg2" dur={7} begin={2} still={mid(NODES.buyer + 95, NODES.russia - 95, modes.onward)}
          tilt={modes.onward === "air"}>
          <Vehicle mode={modes.onward} n={Math.max(1, Math.round(shipments / 2))} />
        </Moving>
        <g className="max-sm:hidden" fontSize={13} fill="var(--muted-foreground)" textAnchor="middle">
          <text x={(NODES.exporter + NODES.buyer) / 2} y={GROUND + 66}>{MODE_LABEL[modes.first]}</text>
          <text x={(NODES.buyer + NODES.russia) / 2} y={GROUND + 66}>
            {alert ? "suspected onward route" : "possible onward route"} · {MODE_LABEL[modes.onward]}
          </text>
        </g>
        {alert && (
          <g transform={`translate(${(NODES.buyer + NODES.russia) / 2}, ${modes.onward === "air" ? GROUND - 92 : GROUND - 30})`}>
            <circle r={11} fill="var(--status-critical)" />
            <text y={4.5} textAnchor="middle" fontSize={15} fontWeight={700} fill="#fff">?</text>
          </g>
        )}
      </svg>

      <div className="mt-1 grid grid-cols-3 gap-3 text-center text-[12px] leading-snug">
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5 font-bold"><Flag code={q.exporter} /> {q.exporter_name}</div>
          <div className="text-muted-foreground">Exporter · HS {a.classification.hs}</div>
          {last && <div className="tabular">{money(last.value, series.unit)} in {last.year}
            {route.multiplier !== null && <span className="text-muted-foreground"> · {route.multiplier.toFixed(1)}× pre-war</span>}</div>}
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5 font-bold">
            <CompanyMark name={q.company} size={18} flagged={flagged} />
            <span className="max-w-[16ch] truncate sm:max-w-none">{q.company}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Flag code={buyerCountry} /> {regionName(buyerCountry)}
            {buyerCountry === q.intermediary ? " · buyer" : ` · via ${q.intermediary_name}`}
          </div>
          <StatusBadge tone={entityTone[entity.status]}>{entity.status}</StatusBadge>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5 font-bold"><Flag code="RU" /> Russia</div>
          <div className="text-muted-foreground">Sanctioned destination</div>
          {ruDrop !== null && <div className="tabular">Direct exports {ruDrop > 0 ? "−" : "+"}{Math.abs(ruDrop)}%</div>}
          <StatusBadge tone={bandTone[route.band]}><span className="max-sm:hidden">Route</span> {route.band}</StatusBadge>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
