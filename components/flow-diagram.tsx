"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import type { Sankey } from "@/lib/types";
import { regionName } from "@/components/visuals";

const W = 1000;
const ROW = 34;
const TOP = 34;
const X_LEFT = 130;
const X_MID = 500;
const X_RIGHT = 870;
const BAR = 14;
const BOX = 125; // half-width of each country box
const MAX_BAND = 26;

type Row = Sankey["links"][number];

/** Stack the band ends on the two outer bars and give each row its middle position. */
function stack(items: { r: Row; wi: number; wo: number }[]) {
  return items.map((it, i) => {
    const before = items.slice(0, i);
    const yl = TOP + before.reduce((h, b) => h + b.wi + 2, 0) + it.wi / 2;
    const yr = TOP + before.reduce((h, b) => h + b.wo + 2, 0) + it.wo / 2;
    return { ...it, ym: TOP + i * ROW + ROW / 2, yl, yr };
  });
}

/** Exporter -> each intermediary (left) and each intermediary -> Russia (right), widths on a square-root scale. */
export function FlowDiagram({ s, exporterName, hs, highlight }: {
  s: Sankey | null; exporterName: string; hs: string; highlight: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  if (!s) return <p className="py-8 text-center text-sm text-muted-foreground">Flow data covers Germany as the exporter and the listed items.</p>;
  const rows = s.links
    .filter((l) => l.from_exporter + (l.to_russia ?? 0) > 10_000)
    .sort((a, b) => b.from_exporter + (b.to_russia ?? 0) - (a.from_exporter + (a.to_russia ?? 0)));
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No material flows in {s.year}.</p>;
  const peak = Math.max(...rows.flatMap((r) => [r.from_exporter, r.to_russia ?? 0]));
  const width = (v: number) => (v > 0 ? Math.max(1.5, MAX_BAND * Math.sqrt(v / peak)) : 0);
  const H = TOP + rows.length * ROW + 16;
  const totalIn = rows.reduce((a, r) => a + r.from_exporter, 0);
  const totalOut = rows.reduce((a, r) => a + (r.to_russia ?? 0), 0);

  const layout = stack(rows.map((r) => ({ r, wi: width(r.from_exporter), wo: width(r.to_russia ?? 0) })));
  const leftH = Math.max(layout.reduce((h, l) => h + l.wi + 2, 0), 20);
  const rightH = Math.max(layout.reduce((h, l) => h + l.wo + 2, 0), 20);
  const band = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Flows of HS ${hs}: ${exporterName} to intermediaries and on to Russia, ${s.year}`}>
        <text x={X_LEFT - BAR} y={18} fontSize={13} fontWeight={700} fill="var(--foreground)">{exporterName}</text>
        <text x={X_MID} y={18} fontSize={13} fontWeight={700} fill="var(--foreground)" textAnchor="middle">Intermediaries</text>
        <text x={X_RIGHT + BAR} y={18} fontSize={13} fontWeight={700} fill="var(--foreground)" textAnchor="end">Russia</text>

        {layout.map(({ r, wi, wo, ym, yl: l, yr: rr }) => {
          const on = hover === null || hover === r.partner;
          const strong = r.partner === highlight;
          return (
            <g key={r.partner} opacity={on ? 1 : 0.25} onMouseEnter={() => setHover(r.partner)} onMouseLeave={() => setHover(null)}>
              {wi > 0 && <path d={band(X_LEFT, l, X_MID - BOX, ym)} fill="none" stroke="var(--series-1)" strokeOpacity={strong ? 0.75 : 0.4} strokeWidth={wi} />}
              {wo > 0 && <path d={band(X_MID + BOX, ym, X_RIGHT, rr)} fill="none" stroke="var(--series-2)" strokeOpacity={strong ? 0.75 : 0.4} strokeWidth={wo} />}
              <rect x={X_MID - BOX} y={ym - 12} width={BOX * 2} height={24} rx={3} fill="var(--card)"
                stroke={strong ? "var(--foreground)" : "var(--border)"} strokeWidth={strong ? 1.4 : 1} />
              <text x={X_MID - BOX + 8} y={ym + 4} fontSize={11.5} fill="var(--foreground)" fontWeight={700}>{money(r.from_exporter, "USD")}</text>
              <image href={`/flags/${r.partner.toLowerCase()}.svg`} x={X_MID - 48} y={ym - 6} width={16} height={12} preserveAspectRatio="none" />
              <text x={X_MID - 28} y={ym + 4} fontSize={12} fontWeight={strong ? 700 : 400} fill="var(--foreground)">
                {regionName(r.partner).replace("United Arab Emirates", "UAE")}
              </text>
              <text x={X_MID + BOX - 8} y={ym + 4} fontSize={11.5} textAnchor="end" fill="var(--foreground)" fontWeight={700}>
                {r.reported ? money(r.to_russia ?? 0, "USD") : "n/r"}
              </text>
              <title>{`${regionName(r.partner)}: ${money(r.from_exporter, "USD", 2)} from ${exporterName}; ${r.reported ? money(r.to_russia ?? 0, "USD", 2) : "not reported"} to Russia (all origins)`}</title>
            </g>
          );
        })}

        <rect x={X_LEFT - BAR} y={TOP} width={BAR} height={leftH} rx={2} fill="var(--series-1)" />
        <text x={X_LEFT - BAR - 6} y={TOP + leftH / 2 + 4} fontSize={12} textAnchor="end" fill="var(--foreground)">{money(totalIn, "USD")}</text>
        <rect x={X_RIGHT} y={TOP} width={BAR} height={rightH} rx={2} fill="var(--series-2)" />
        <text x={X_RIGHT + BAR + 6} y={TOP + rightH / 2 + 4} fontSize={12} fill="var(--foreground)">{money(totalOut, "USD")}</text>
      </svg>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {s.year}, USD, UN Comtrade. Left: {exporterName}&apos;s exports of HS {hs} to each country. Right: each
        country&apos;s exports of the item to Russia, from any origin. Band widths use a square-root scale.
      </p>
    </div>
  );
}
