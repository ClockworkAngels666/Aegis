"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Frame3D, ToolButton, type Tip, tipAt, usePicking, useStage } from "@/components/three/frame";
import { monthLabel, money, zfmt } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { canvasTexture, cssVar, disposeTree, pageFont, themeColor } from "@/lib/three-stage";
import type { Monthly } from "@/lib/types";

const CELL = 0.2;
const MAX_H = 1.3;
const PX = 300;
const M = { left: 0.42, right: 0.05, front: 0.3, back: 0.05 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOME = { pos: new THREE.Vector3(0.55, 2.15, 2.8), target: new THREE.Vector3(0, 0.3, 0.12) };
const CAP = 0.03;

type Bar = { mo: string; value: number; russia: number | null; z: number | null; flagged: boolean; pre: boolean; kind: "inter" | "ru" };

function floorTexture(years: number[], war: { row: number; col: number } | null) {
  const n = 12, m = years.length;
  const W = Math.round((n * CELL + M.left + M.right) * PX), H = Math.round((m * CELL + M.front + M.back) * PX);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const gx = (i: number) => (M.left + i * CELL) * PX, gy = (j: number) => (M.back + j * CELL) * PX;
  const font = pageFont();
  ctx.fillStyle = cssVar("--muted");
  ctx.fillRect(gx(0), gy(0), n * CELL * PX, m * CELL * PX);
  ctx.strokeStyle = cssVar("--chart-axis");
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(gx(i), gy(0));
    ctx.lineTo(gx(i), gy(m));
    ctx.stroke();
  }
  for (let j = 0; j <= m; j++) {
    ctx.beginPath();
    ctx.moveTo(gx(0), gy(j));
    ctx.lineTo(gx(n), gy(j));
    ctx.stroke();
  }
  if (war) {
    ctx.strokeStyle = cssVar("--status-critical");
    ctx.lineWidth = 6;
    ctx.strokeRect(gx(war.col) + 3, gy(war.row) + 3, CELL * PX - 6, CELL * PX - 6);
  }
  ctx.fillStyle = cssVar("--foreground");
  ctx.textBaseline = "middle";
  ctx.font = `700 28px ${font}`;
  ctx.textAlign = "right";
  years.forEach((y, j) => ctx.fillText(String(y), gx(0) - 14, gy(j) + (CELL * PX) / 2));
  ctx.font = `600 26px ${font}`;
  ctx.textAlign = "center";
  MONTHS.forEach((mo, i) => ctx.fillText(mo, gx(i) + (CELL * PX) / 2, gy(m) + 32));
  return { tex: canvasTexture(c), w: W / PX, d: H / PX };
}

/** Monthly exports as a 3D landscape: one row per year, one column per month. */
export function Terrain3D({ m, partner }: { m: Monthly; partner: string }) {
  const { hostRef, stageRef, ready, failed, reduce } = useStage({
    position: HOME.pos.toArray(), target: HOME.target.toArray(), minDistance: 1.2, maxDistance: 9, maxPolarAngle: 1.45, enablePan: true,
  });
  const { theme } = useTheme();
  const [tip, setTip] = useState<Tip | null>(null);
  const [showRussia, setShowRussia] = useState(true);
  const bars = useRef<{ mesh: THREE.InstancedMesh; info: Bar[] } | null>(null);
  const hasRussia = !!m.russia?.some((v) => v > 0);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    stage.fitHome(HOME.pos, HOME.target, 1.6);
  }, [ready, stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    const g = new THREE.Group();
    const first = Number(m.months[0].slice(0, 4)), last = Number(m.months.at(-1)!.slice(0, 4));
    const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const rowOf = (mo: string) => Number(mo.slice(0, 4)) - first, colOf = (mo: string) => Number(mo.slice(5)) - 1;
    const n = 12, rows = years.length;
    const x0 = -(n * CELL) / 2, z0 = -(rows * CELL) / 2;
    const ru = showRussia && hasRussia ? m.russia : null;
    const peak = Math.max(1, ...m.values, ...(ru ?? []), m.baseline.upper);
    const h = (v: number) => Math.max(0.004, (v / peak) * MAX_H);

    const warIdx = m.months.indexOf("2022-02");
    const floor = floorTexture(years, warIdx >= 0 ? { row: rowOf("2022-02"), col: 1 } : null);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(floor.w, floor.d), new THREE.MeshBasicMaterial({ map: floor.tex, transparent: true }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x0 - M.left + floor.w / 2, 0, z0 - M.back + floor.d / 2);
    g.add(plane);
    g.add(new THREE.AmbientLight(0xffffff, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-2, 4, 3);
    g.add(sun);

    // Bars: the intermediary (and optionally Russia, side by side) for every month
    const flagged = new Set(m.flagged);
    const info: Bar[] = [];
    m.months.forEach((mo, i) => {
      const base = { mo, value: m.values[i], russia: m.russia?.[i] ?? null, z: m.z[i], flagged: flagged.has(mo), pre: mo <= m.baseline.to };
      info.push({ ...base, kind: "inter" });
      if (ru) info.push({ ...base, kind: "ru" });
    });
    const w = ru ? CELL * 0.36 : CELL * 0.7;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(w, 1, w).translate(0, 0.5, 0), new THREE.MeshLambertMaterial(), info.length);
    const color = { pre: themeColor("--chart-baseline"), post: themeColor("--series-1"), ru: themeColor("--series-2") };
    const mat = new THREE.Matrix4();
    const heights = info.map((b) => h(b.kind === "ru" ? (b.russia ?? 0) : b.value));
    const place = (k: number, s: number) => {
      const b = info[k];
      const dx = ru ? (b.kind === "inter" ? -CELL * 0.2 : CELL * 0.2) : 0;
      mat.makeScale(1, Math.max(0.0001, heights[k] * s), 1)
        .setPosition(x0 + (colOf(b.mo) + 0.5) * CELL + dx, 0, z0 + (rowOf(b.mo) + 0.5) * CELL);
      mesh.setMatrixAt(k, mat);
    };
    // Flagged months (above the pre-war mean + 2σ) get a red cap rather than a red bar, so the
    // intermediary (blue) and Russia (orange) stay the only two bar colours.
    const flaggedIdx = info.flatMap((b, k) => (b.kind === "inter" && b.flagged ? [k] : []));
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(w * 1.12, CAP, w * 1.12).translate(0, CAP / 2, 0),
      new THREE.MeshLambertMaterial({ color: cssVar("--status-critical") }), Math.max(1, flaggedIdx.length));
    caps.count = flaggedIdx.length;
    const placeCaps = () => {
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      flaggedIdx.forEach((k, c) => {
        mesh.getMatrixAt(k, mat);
        mat.decompose(p, q, sc);
        caps.setMatrixAt(c, mat.makeTranslation(p.x, sc.y, p.z));
      });
      caps.instanceMatrix.needsUpdate = true;
    };
    info.forEach((b, k) => {
      place(k, 1);
      mesh.setColorAt(k, b.kind === "ru" ? color.ru : b.pre ? color.pre : color.post);
    });
    placeCaps();
    g.add(mesh, caps);
    bars.current = { mesh, info };

    // Glass plane at the pre-war mean + 2σ: bars that break through it are flagged months
    const y = h(m.baseline.upper);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(n * CELL, rows * CELL), new THREE.MeshBasicMaterial({
      color: cssVar("--status-warning"), transparent: true, opacity: theme === "dark" ? 0.16 : 0.2, side: THREE.DoubleSide, depthWrite: false,
    }));
    glass.rotation.x = -Math.PI / 2;
    glass.position.set(0, y, 0);
    g.add(glass);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({ color: cssVar("--status-warning") }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.copy(glass.position);
    g.add(edge);

    let grow: ((t: number) => void) | null = null;
    if (!reduce) {
      let t0 = -1;
      grow = (t) => {
        if (t0 < 0) t0 = t;
        let done = true;
        info.forEach((b, k) => {
          const e = Math.min(1, Math.max(0, (t - t0 - rowOf(b.mo) * 0.09 - colOf(b.mo) * 0.012) / 0.5));
          if (e < 1) done = false;
          place(k, 1 - (1 - e) ** 3);
        });
        mesh.instanceMatrix.needsUpdate = true;
        placeCaps();
        if (done && grow) stage.frame.delete(grow);
      };
      stage.frame.add(grow);
    }

    const hide = stage.reveal(g);
    stage.invalidate();
    return () => {
      if (grow) stage.frame.delete(grow);
      hide();
      disposeTree(g);
      bars.current = null;
    };
  }, [ready, stageRef, m, theme, reduce, showRussia, hasRussia]);

  usePicking(stageRef, ready, {
    move: (e, stage) => {
      const b = bars.current;
      const id = b ? stage.pick(e, [b.mesh])[0]?.instanceId ?? -1 : -1;
      if (!b || id < 0) return setTip(null);
      const d = b.info[id];
      setTip(tipAt(e, stage, (
        <>
          <div className="font-bold">{monthLabel(d.mo)}</div>
          <div>{partner}: {money(d.value, m.unit, 2)}{d.z !== null && <span className="text-muted-foreground"> · {zfmt(d.z)} standard deviations from the pre-war average</span>}</div>
          {d.russia !== null && <div>Russia (direct): {money(d.russia, m.unit, 2)}</div>}
          <div className="text-muted-foreground">
            {d.pre ? "Pre-war baseline month" : d.flagged ? "Above the pre-war range" : "Within the pre-war range"}
          </div>
        </>
      )));
    },
    leave: () => setTip(null),
  });

  return (
    <div>
      <Frame3D hostRef={hostRef} stageRef={stageRef} failed={failed} tip={tip} className="h-[340px] bg-card sm:h-[400px]"
        label={`3D chart of monthly exports to ${partner} by year and month`}
        tools={hasRussia && (
          <ToolButton label="Show direct exports to Russia" active={showRussia} onClick={() => setShowRussia(!showRussia)}>Russia</ToolButton>
        )} />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5" style={{ background: "var(--chart-baseline)" }} />Pre-war months</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5" style={{ background: "var(--series-1)" }} />{partner}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 border-t-[3px]" style={{ borderColor: "var(--status-critical)", background: "var(--series-1)" }} />Red cap: above the pre-war range</span>
        {hasRussia && showRussia && <span className="inline-flex items-center gap-1.5"><span className="size-2.5" style={{ background: "var(--series-2)" }} />Russia (direct)</span>}
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 border" style={{ borderColor: "var(--status-warning)", background: "color-mix(in srgb, var(--status-warning) 22%, transparent)" }} />Pre-war range</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 border-2" style={{ borderColor: "var(--status-critical)" }} />February 2022</span>
      </div>
    </div>
  );
}
