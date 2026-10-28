"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Frame3D, type Tip, tipAt, usePicking, useStage } from "@/components/three/frame";
import { StatusBadge } from "@/components/status";
import { Flag, regionName } from "@/components/visuals";
import { entityTone, toneVar, verdictTone } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { canvasTexture, cssVar, disposeTree, pageFont } from "@/lib/three-stage";
import type { BatchRowOut } from "@/lib/types";

const TIERS: (string | null)[] = ["1", "2", "3.A", "3.B", "4.A", "4.B", null];
const W = 2.2, H = 1.5, D = 2.0; // x: sanctions-match score, y: route score, z: item tier (tier 1 at the front)
const xOf = (s: number) => -W / 2 + (s / 100) * W;
const yOf = (s: number) => (s / 100) * H;
const zOf = (tier: string | null) => {
  const i = TIERS.indexOf(TIERS.includes(tier) ? tier : null);
  return D / 2 - ((i + 0.5) / TIERS.length) * D;
};
const HOME = { pos: new THREE.Vector3(1.55, 1.95, 3.7), target: new THREE.Vector3(0.05, 0.5, 0.1) };
const MATCH = 93, PARTIAL = 80, ROUTE_HIGH = 50;

/** Small deterministic offset so rows with identical scores do not hide each other. */
function jitter(i: number): [number, number] {
  const a = (i * 2.399963) % (Math.PI * 2), r = 0.03 + ((i * 7) % 5) * 0.012;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

function textPlane(lines: { text: string; x: number; y: number; size: number; bold?: boolean; align?: CanvasTextAlign; color?: string; rotate?: number }[],
  w: number, h: number, px = 300): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = Math.round(w * px);
  c.height = Math.round(h * px);
  const ctx = c.getContext("2d")!;
  const font = pageFont();
  for (const l of lines) {
    ctx.save();
    ctx.translate(l.x * px, l.y * px);
    if (l.rotate) ctx.rotate(l.rotate);
    ctx.font = `${l.bold ? 700 : 500} ${l.size * px}px ${font}`;
    ctx.fillStyle = l.color ?? cssVar("--muted-foreground");
    ctx.textAlign = l.align ?? "left";
    ctx.textBaseline = "middle";
    ctx.fillText(l.text, 0, 0);
    ctx.restore();
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: canvasTexture(c), transparent: true, depthWrite: false }));
}

/** Every screened counterparty as a point in a 3D decision space. */
export function RiskCube3D({ rows, onAssess }: { rows: BatchRowOut[]; onAssess?: (r: BatchRowOut) => void }) {
  const { hostRef, stageRef, ready, failed } = useStage({
    position: HOME.pos.toArray(), target: HOME.target.toArray(), minDistance: 1.5, maxDistance: 10, enablePan: true,
  });
  const { theme } = useTheme();
  const [tip, setTip] = useState<Tip | null>(null);
  const points = useRef<THREE.Mesh[]>([]);
  const labelEls = useRef(new Map<number, HTMLDivElement>());
  const labelled = rows.length <= 12;

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    stage.fitHome(HOME.pos, HOME.target, 1.8);
  }, [ready, stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    const g = new THREE.Group();
    const ink = cssVar("--muted-foreground"), axis = cssVar("--chart-axis");
    g.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 3);
    g.add(sun);

    // cube frame, floor grid (tiers) and back-wall grid (route score)
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)), new THREE.LineBasicMaterial({ color: axis }));
    frame.position.y = H / 2;
    g.add(frame);
    const grid: number[] = [];
    TIERS.forEach((_, i) => {
      const z = D / 2 - (i / TIERS.length) * D;
      grid.push(-W / 2, 0, z, W / 2, 0, z);
    });
    [25, 50, 75].forEach((s) => grid.push(-W / 2, yOf(s), -D / 2, W / 2, yOf(s), -D / 2, -W / 2, yOf(s), -D / 2, -W / 2, yOf(s), D / 2));
    [PARTIAL, MATCH].forEach((s) => grid.push(xOf(s), 0, -D / 2, xOf(s), 0, D / 2));
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(grid, 3));
    g.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: axis, transparent: true, opacity: 0.7 })));

    // decision zones: sanctions match (STOP) and partial match (HOLD) slabs, route HIGH plane
    const zone = (x0: number, x1: number, color: string, opacity: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(xOf(x1) - xOf(x0), H, D),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      m.position.set((xOf(x0) + xOf(x1)) / 2, H / 2, 0);
      g.add(m);
    };
    zone(MATCH, 100, cssVar("--status-critical"), theme === "dark" ? 0.2 : 0.13);
    zone(PARTIAL, MATCH, cssVar("--status-serious"), theme === "dark" ? 0.16 : 0.11);
    const high = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({
      color: cssVar("--status-warning"), transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false,
    }));
    high.rotation.x = -Math.PI / 2;
    high.position.y = yOf(ROUTE_HIGH);
    g.add(high);

    // axis labels painted on the floor (front and left edges) and the back wall
    const front = textPlane([
      ...[0, 50, PARTIAL, MATCH].map((s) => ({ text: String(s), x: 0.15 + (s / 100) * W, y: 0.12, size: 0.11, align: "center" as const })),
      { text: "Sanctions-match score →", x: 0.15 + W / 2, y: 0.34, size: 0.13, bold: true, align: "center" },
    ], W + 0.3, 0.46);
    front.rotation.x = -Math.PI / 2;
    front.position.set(0, 0.001, D / 2 + 0.23);
    g.add(front);
    const left = textPlane([
      // the canvas top lies at the back of the floor, so tier 1 (front) is drawn at the bottom
      ...TIERS.map((t, i) => ({ text: t ? `Tier ${t}` : "Not listed", x: 0.86, y: 0.1 + D - ((i + 0.5) / TIERS.length) * D, size: 0.105, align: "right" as const })),
    ], 0.95, D + 0.2);
    left.rotation.x = -Math.PI / 2;
    left.position.set(-W / 2 - 0.475, 0.001, 0);
    g.add(left);
    const back = textPlane([
      ...[0, 25, 50, 75, 100].map((s) => ({ text: String(s), x: 0.62, y: 0.1 + H - yOf(s), size: 0.11, align: "right" as const })),
      { text: "Route score ↑", x: 0.17, y: 0.1 + H / 2, size: 0.13, bold: true, align: "center", rotate: -Math.PI / 2 },
    ], 0.7, H + 0.2);
    back.position.set(-W / 2 - 0.35, H / 2, -D / 2);
    g.add(back);
    const zones = textPlane([
      { text: "Partial: HOLD", x: 0.02, y: 0.1, size: 0.1, bold: true, color: ink },
      { text: "Match: STOP", x: 0.02, y: 0.26, size: 0.1, bold: true, color: cssVar("--status-critical") },
    ], 1.0, 0.36);
    zones.position.set(xOf(PARTIAL) + 0.5, H + 0.2, -D / 2);
    g.add(zones);

    // points: verdict colour; flagged names drawn as diamonds; drop lines to the floor
    const meshes: THREE.Mesh[] = [];
    const drop: number[] = [];
    rows.forEach((r, i) => {
      const [jx, jz] = jitter(i);
      const x = xOf(r.entity_score) + jx, y = r.route_score === null ? 0.03 : yOf(r.route_score), z = zOf(r.chpl_tier) + jz;
      const color = cssVar(toneVar[verdictTone[r.verdict]].slice(4, -1));
      const geo = r.entity_status === "CLEAN" ? new THREE.SphereGeometry(0.055, 20, 14) : new THREE.OctahedronGeometry(0.075);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.15 }));
      m.position.set(x, y, z);
      m.userData.row = i;
      g.add(m);
      meshes.push(m);
      drop.push(x, y, z, x, 0, z);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(x, 0.002, z);
      g.add(dot);
    });
    const dropGeo = new THREE.BufferGeometry();
    dropGeo.setAttribute("position", new THREE.Float32BufferAttribute(drop, 3));
    g.add(new THREE.LineSegments(dropGeo, new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.45 })));

    const hide = stage.reveal(g);
    points.current = meshes;
    stage.invalidate();

    // HTML labels for small batches
    const update = () => meshes.forEach((m, i) => {
      const el = labelEls.current.get(i);
      if (!el) return;
      const { x, y } = stage.toScreen(m.position);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(10px, -50%)`;
      el.style.opacity = "1";
    });
    stage.after.add(update);
    return () => {
      stage.after.delete(update);
      hide();
      disposeTree(g);
      points.current = [];
    };
  }, [ready, stageRef, rows, theme]);

  usePicking(stageRef, ready, {
    move: (e, stage) => {
      const hit = stage.pick(e, points.current)[0];
      const r = hit ? rows[hit.object.userData.row as number] : null;
      stage.renderer.domElement.style.cursor = r && onAssess ? "pointer" : "";
      setTip(r ? tipAt(e, stage, (
        <>
          <div className="flex items-center gap-1.5 font-bold">{r.company}{r.country && <Flag code={r.country} size={14} />}</div>
          <div className="mt-1"><StatusBadge tone={verdictTone[r.verdict]}>{r.verdict}</StatusBadge></div>
          <div className="mt-1 flex items-center gap-1.5">
            <StatusBadge tone={entityTone[r.entity_status]}>{r.entity_status}</StatusBadge>
            <span>{r.best_similarity !== null ? `${r.best_similarity.toFixed(0)}% · ${r.best_match}` : "no listed name"}</span>
          </div>
          <div>Route: {r.route_score !== null && r.intermediary ? `${r.route_score} / 100 via ${regionName(r.intermediary)}` : "not checked (no HS code or route)"}</div>
          <div>Item: {r.hs ? `HS ${r.hs} · ${r.chpl_tier ? `Tier ${r.chpl_tier}` : "not on the list"}` : "no HS code"}</div>
          {onAssess && <div className="text-muted-foreground">Click to open the full assessment</div>}
        </>
      )) : null);
    },
    click: (e, stage) => {
      const hit = stage.pick(e, points.current)[0];
      if (hit && onAssess) onAssess(rows[hit.object.userData.row as number]);
    },
    leave: () => setTip(null),
  });

  return (
    <Frame3D hostRef={hostRef} stageRef={stageRef} failed={failed} tip={tip} className="h-[360px] bg-card sm:h-[440px]"
      label={`3D scatter of ${rows.length} screened counterparties by sanctions-match score, route score and item tier`}
      hint="Drag to rotate · right-drag to pan · Ctrl + scroll to zoom"
      overlay={labelled && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {rows.map((r, i) => (
            <div key={i} ref={(el) => {
              if (el) labelEls.current.set(i, el);
              else labelEls.current.delete(i);
            }} className="absolute left-0 top-0 max-w-[180px] truncate text-[12px] text-foreground opacity-0 [text-shadow:0_0_3px_var(--card),0_0_3px_var(--card)]">
              {r.company}
            </div>
          ))}
        </div>
      )} />
  );
}
