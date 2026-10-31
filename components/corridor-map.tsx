"use client";

import { geoGraticule10, geoInterpolate, geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { regionName } from "@/components/visuals";
import { CORRIDORS, type Corridor, type CorridorMode, EU27_NUMERIC, LEG_COLOR, INTERMEDIARY_CODES, MARKERS, NUMERIC } from "@/lib/corridors";
import { money } from "@/lib/format";
import type { Flows } from "@/lib/types";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/* ---------------- projection and static basemap (computed once) ---------------- */

type Pt = [number, number];
const W = 1000;
// Cropped at the equator: the Cape of Good Hope route leaves and re-enters at the bottom edge.
const EXTENT = { type: "MultiPoint" as const, coordinates: [[-20, -4], [127, -4], [127, 63], [-20, 63]] };
const projection = geoNaturalEarth1().rotate([-52, 0]).fitWidth(W, EXTENT);
const path = geoPath(projection);
const H = Math.ceil(path.bounds(EXTENT)[1][1]);

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const COUNTRIES = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features
  .map((f: Feature<Geometry, { name: string }>) => ({ id: String(f.id), name: f.properties.name, d: path(f) ?? "" }));
const GRATICULE = path(geoGraticule10()) ?? "";

const project = (p: Pt): Pt => {
  const xy = projection(p) ?? [0, 0];
  return [Math.round(xy[0] * 10) / 10, Math.round(xy[1] * 10) / 10];
};

/** Catmull-Rom spline through the points, as an SVG path. */
function smooth(p: Pt[]): string {
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const RUSSIA_LABEL = project([92, 61]);
const INTERMEDIARY_IDS = new Set(INTERMEDIARY_CODES.map((k) => NUMERIC[k]));

const ROUTES = CORRIDORS.map((c) => {
  const geo: Pt[] = c.mode === "air"
    ? Array.from({ length: 41 }, (_, i) => geoInterpolate(c.path[0], c.path[1])(i / 40) as Pt)
    : c.path;
  const pts = geo.map(project);
  const length = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  return { ...c, d: smooth(pts), length };
});

/* ---------------- styling ---------------- */

const SPEED: Record<CorridorMode, number> = { sea: 34, rail: 42, road: 38, air: 80 };

function RouteLine({ r, active, hover, scale, dim = 0.22 }: {
  r: (typeof ROUTES)[number]; active: boolean; hover: boolean; scale?: number; dim?: number;
}) {
  const color = LEG_COLOR[r.leg];
  const w = (scale ?? (active ? 1 : 0.7)) + (hover ? 1.6 : 0);
  const common = { d: r.d, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g opacity={active ? 1 : dim}>
      <title>{r.name}</title>
      {r.mode === "sea" && <path {...common} stroke={color} strokeWidth={2.2 * w} />}
      {r.mode === "rail" && (
        <>
          <path {...common} stroke={color} strokeWidth={3.2 * w} strokeDasharray={r.leg === "restricted" ? "9 5" : undefined} />
          <path {...common} stroke="var(--map-halo)" strokeWidth={1.3 * w} strokeDasharray="2.5 4.5" />
        </>
      )}
      {r.mode === "road" && <path {...common} stroke={color} strokeWidth={2.2 * w} strokeDasharray="7 4" />}
      {r.mode === "air" && <path {...common} stroke={color} strokeWidth={2 * w} strokeDasharray="1 5" />}
    </g>
  );
}

/* small vehicles, drawn facing right around (0, 0) */
function MiniVehicle({ mode, color }: { mode: CorridorMode; color: string }) {
  if (mode === "sea") {
    return (
      <g>
        <rect x={-6} y={-6} width={4} height={3.2} fill="#eb6834" /><rect x={-1.6} y={-6} width={4} height={3.2} fill="#2a78d6" />
        <rect x={2.8} y={-8} width={3} height={5} fill="#eef1f4" stroke="#475569" strokeWidth={0.4} />
        <path d="M-9 -3 H9.5 L7 2 H-7 Z" fill="#1f3a5f" stroke="#fff" strokeWidth={0.5} />
      </g>
    );
  }
  if (mode === "rail") {
    return (
      <g stroke="#fff" strokeWidth={0.5}>
        <rect x={-11} y={-5} width={9} height={5} rx={0.8} fill={color} />
        <path d="M-1 -5 H6 L9 -2 V0 H-1 Z" fill="#2f3e4e" />
        <circle cx={-8} cy={1} r={1.4} fill="#1f2933" /><circle cx={-4} cy={1} r={1.4} fill="#1f2933" />
        <circle cx={2} cy={1} r={1.4} fill="#1f2933" /><circle cx={6} cy={1} r={1.4} fill="#1f2933" />
      </g>
    );
  }
  if (mode === "road") {
    return (
      <g stroke="#fff" strokeWidth={0.5}>
        <rect x={-9} y={-6} width={11} height={5.5} rx={0.6} fill={color} />
        <path d="M2.5 -4.5 H6.5 L9 -2 V-0.5 H2.5 Z" fill="#2f3e4e" />
        <circle cx={-6} cy={0.4} r={1.4} fill="#1f2933" /><circle cx={5.5} cy={0.4} r={1.4} fill="#1f2933" />
      </g>
    );
  }
  return (
    <path d="M-9 0 L6 -0.8 C9 -0.8 10 0 10 0.4 C10 0.8 9 1.4 6 1.4 L-9 0.8 Z M-1 -0.4 L-5 -6 L-3 -6 L3 -0.4 Z M-1 1 L-5 6.5 L-3 6.5 L3 1 Z M-8 0 L-10.5 -3.5 L-8.8 -3.5 L-6.5 0 Z"
      fill="#2f3e4e" stroke="#fff" strokeWidth={0.4} />
  );
}

function Moving({ r, flip }: { r: (typeof ROUTES)[number]; flip: boolean }) {
  const dur = Math.max(6, r.length / SPEED[r.mode]);
  const color = LEG_COLOR[r.leg];
  return (
    <>
      {[0, 0.5].map((phase) => (
        <g key={phase}>
          <g transform={flip && r.mode !== "air" ? "scale(-1,1)" : undefined}>
            <MiniVehicle mode={r.mode} color={color} />
          </g>
          <animateMotion dur={`${dur.toFixed(1)}s`} begin={`${(-phase * dur).toFixed(1)}s`} repeatCount="indefinite"
            rotate={r.mode === "air" ? "auto" : "0"} path={r.d} />
        </g>
      ))}
    </>
  );
}

/* ---------------- map ---------------- */

/** Great-circle line from the exporter to Moscow for the direct-exports flow. */
function directPath(exporter: string): string | null {
  const from = MARKERS[exporter]?.at;
  if (!from) return null;
  const pts = Array.from({ length: 31 }, (_, i) => project(geoInterpolate(from, MARKERS.RU.at)(i / 30) as Pt));
  return smooth(pts);
}

export function CorridorMap({ exporter, exporterName, intermediary, intermediaryName, onSelect, flows, yi, hover }: {
  exporter: string;
  exporterName: string;
  intermediary: string;
  intermediaryName: string;
  onSelect: (code: string) => void;
  flows: Flows | null;
  /** Year index into flows.years for the time-lapse. */
  yi: number;
  /** Corridor id highlighted from the list. */
  hover: string | null;
}) {
  const reduce = useReducedMotion();
  const years = flows?.years ?? [];

  const peak = flows ? Math.max(1, ...Object.values(flows.partners).flat()) : 1;
  const volumeScale = (iso: string) => {
    const v = flows?.partners[iso]?.[yi];
    return v === undefined ? undefined : 0.35 + 3.4 * Math.sqrt(v / peak);
  };
  const inboundScale = (r: (typeof ROUTES)[number]) => {
    if (!flows || r.leg !== "inbound") return undefined;
    const scales = r.serves.map(volumeScale).filter((x): x is number => x !== undefined);
    return scales.length ? Math.max(...scales) : undefined;
  };
  const direct = flows ? directPath(exporter) : null;
  const directValue = flows?.partners.RU?.[yi] ?? 0;
  const active = (c: Corridor) => c.serves.includes(intermediary);
  const activeRoutes = ROUTES.filter(active);
  const stops = new Map<string, Pt>();
  activeRoutes.forEach((r) => r.stops.forEach(([name, lon, lat]) => {
    if (name !== "Moscow") stops.set(name, project([lon, lat])); // labelled by its flag marker
  }));

  const exporterIds = exporter.startsWith("EU") ? EU27_NUMERIC : [NUMERIC[exporter]];
  const fillFor = (id: string) => {
    if (id === NUMERIC[intermediary]) return "var(--map-inter-active)";
    if (id === NUMERIC.RU || id === NUMERIC.BY) return "var(--map-ru)";
    if (exporterIds.includes(id)) return "var(--map-exporter)";
    if (INTERMEDIARY_IDS.has(id)) return "var(--map-inter)";
    if (EU27_NUMERIC.includes(id)) return "var(--map-eu)";
    return "var(--map-land)";
  };

  return (
    <div>
      <div className="overflow-hidden rounded-sm ring-1 ring-border">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
          aria-label={`Map of freight corridors from ${exporterName} to ${intermediaryName} and on to Russia`}>
          <rect width={W} height={H} fill="var(--map-ocean)" />
          <path d={GRATICULE} fill="none" stroke="var(--map-grat)" strokeWidth={0.6} />
          <g stroke="var(--map-border)" strokeWidth={0.6}>
            {COUNTRIES.map((c) => <path key={c.id + c.name} d={c.d} fill={fillFor(c.id)}><title>{c.name}</title></path>)}
          </g>
          <text x={RUSSIA_LABEL[0]} y={RUSSIA_LABEL[1]} textAnchor="middle" fontSize={22}
            fontWeight={700} letterSpacing={9} fill="var(--map-russia-text)" opacity={0.6}>RUSSIA</text>
          {flows && (
            <text x={18} y={H - 18} fontSize={44} fontWeight={700} fill="var(--map-label)" opacity={0.18}>{years[yi]}</text>
          )}

          {ROUTES.filter((r) => !active(r)).map((r) => (
            <RouteLine key={r.id} r={r} active={false} hover={false} scale={inboundScale(r)} dim={flows && r.leg === "inbound" ? 0.45 : 0.22} />
          ))}
          {direct && (
            <path d={direct} fill="none" stroke="var(--series-2)" strokeLinecap="round" opacity={0.75}
              strokeWidth={0.6 + 3.6 * Math.sqrt(directValue / peak) * 2.2} strokeDasharray="10 6">
              <title>{`Direct exports to Russia, ${years[yi]}: ${money(directValue, flows?.unit ?? "EUR")}`}</title>
            </path>
          )}
          {activeRoutes.map((r) => <RouteLine key={r.id} r={r} active hover={hover === r.id} scale={inboundScale(r)} />)}

          {activeRoutes.filter((r) => r.leg === "restricted").map((r) => {
            const [x, y] = project([r.stops[0][1], r.stops[0][2]]);
            return (
              <g key={r.id} transform={`translate(${x},${y})`}>
                <circle r={7} fill="var(--card)" stroke={LEG_COLOR.restricted} strokeWidth={1.5} />
                <path d="M-3 -3 L3 3 M3 -3 L-3 3" stroke="#d03b3b" strokeWidth={1.8} strokeLinecap="round" />
              </g>
            );
          })}

          {!reduce && activeRoutes.filter((r) => r.leg !== "restricted").map((r) => (
            <Moving key={r.id} r={r} flip={r.leg === "onward"} />
          ))}

          <g fontSize={10.5} fill="var(--map-label)" stroke="var(--map-halo)" strokeWidth={2.6} paintOrder="stroke" strokeLinejoin="round">
            {[...stops.entries()].map(([name, [x, y]]) => (
              <g key={name}>
                <circle cx={x} cy={y} r={2.6} fill="var(--card)" stroke="var(--map-label)" strokeWidth={1} />
                <text x={x + 5} y={y - 4}>{name}</text>
              </g>
            ))}
          </g>

          {INTERMEDIARY_CODES.map((code) => {
            const m = MARKERS[code];
            const [x0, y0] = project(m.at);
            const isActive = code === intermediary;
            const w = isActive ? 26 : 17;
            const h = w * 0.75;
            const x = x0 + (m.offset?.[0] ?? 0) - w / 2;
            const y = y0 + (m.offset?.[1] ?? 0) - h / 2;
            return (
              <g key={code} className="cursor-pointer" onClick={() => onSelect(code)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(code); } }}
                aria-label={`Assess ${regionName(code)}`}>
                <title>{`${regionName(code)}: click to assess this corridor`}</title>
                <rect x={x - 1.5} y={y - 1.5} width={w + 3} height={h + 3} rx={2} fill="#fff"
                  stroke={isActive ? "var(--foreground)" : "var(--chart-axis)"} strokeWidth={isActive ? 1.4 : 0.8} />
                <image href={`/flags/${code.toLowerCase()}.svg`} x={x} y={y} width={w} height={h} preserveAspectRatio="none" />
                {isActive && (
                  <text x={x + w / 2} y={y + h + 13} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--map-label)"
                    stroke="var(--map-halo)" strokeWidth={3} paintOrder="stroke">{intermediaryName}</text>
                )}
              </g>
            );
          })}

          {[["RU", "Moscow"], [exporter, exporterName]].map(([code, label]) => {
            const m = MARKERS[code];
            if (!m) return null;
            const [x0, y0] = project(m.at);
            const w = 22, h = 16.5;
            return (
              <g key={code}>
                <rect x={x0 - w / 2 - 1.5} y={y0 - h / 2 - 1.5} width={w + 3} height={h + 3} rx={2} fill="#fff" stroke="var(--foreground)" strokeWidth={1.2} />
                <image href={`/flags/${code.startsWith("EU") ? "eu" : code.toLowerCase()}.svg`} x={x0 - w / 2} y={y0 - h / 2}
                  width={w} height={h} preserveAspectRatio="none" />
                <text x={x0} y={y0 - h / 2 - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--map-label)"
                  stroke="var(--map-halo)" strokeWidth={3} paintOrder="stroke">{label}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
