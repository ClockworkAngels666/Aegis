"use client";

import { ArrowsOutIcon, EyeIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Frame3D, ToolButton, type Tip, tipAt, usePicking, useStage } from "@/components/three/frame";
import { StatusBadge } from "@/components/status";
import { Flag, regionName } from "@/components/visuals";
import { bandTone, money, times } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { canvasTexture, cssVar, disposeTree, flagSrc, loadImage, pageFont, themeColor } from "@/lib/three-stage";
import type { Radar, RadarCell } from "@/lib/types";

export type SkylineCell = RadarCell & { hs: string; description: string; tier: string };
type Row = Radar["rows"][number];

const CELL = 0.1; // along the items (x)
const CELL_Z = 0.15; // along the countries (z)
const BAR = 0.072;
const BAR_Z = 0.1;
const MAX_H = 0.78;
const PX = 360; // floor texture pixels per world unit
const M = { left: 0.34, right: 0.05, front: 0.5, back: 0.1 };
const height = (score: number) => 0.012 + (score / 100) * MAX_H;
const HOME = { pos: new THREE.Vector3(0.1, 3.35, 3.2), target: new THREE.Vector3(0, 0, -0.15) };
const TOP = { pos: new THREE.Vector3(0, 6.4, 0.4), target: new THREE.Vector3(0, 0, 0.2) };

/** Floor with the grid, partner flags (rows), HS codes (columns) and tier groups. */
function floorTexture(rows: Row[], partners: Radar["partners"], byTier: boolean, alive: () => boolean, onReady: () => void) {
  const n = rows.length, m = partners.length;
  const W = Math.round((n * CELL + M.left + M.right) * PX), H = Math.round((m * CELL_Z + M.front + M.back) * PX);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const gx = (i: number) => (M.left + i * CELL) * PX, gy = (j: number) => (M.back + j * CELL_Z) * PX;
  const font = pageFont();
  const draw = (flags: (HTMLImageElement | null)[]) => {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = cssVar("--muted");
    ctx.fillRect(gx(0), gy(0), n * CELL * PX, m * CELL_Z * PX);
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
    ctx.fillStyle = cssVar("--foreground");
    ctx.textBaseline = "middle";
    // rows: partner flags and codes
    ctx.font = `700 26px ${font}`;
    ctx.textAlign = "right";
    partners.forEach((p, j) => {
      const y = gy(j) + (CELL_Z * PX) / 2;
      const img = flags[j];
      if (img) ctx.drawImage(img, gx(0) - 50, y - 16, 43, 32);
      ctx.fillText(p.code, gx(0) - 56, y + 1);
    });
    // columns: HS codes, reading away from the viewer
    ctx.font = `600 21px ${font}`;
    rows.forEach((r, i) => {
      ctx.save();
      ctx.translate(gx(i) + (CELL * PX) / 2, gy(m) + 10);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "right";
      ctx.fillText(r.hs, 0, 1);
      ctx.restore();
    });
    // tier groups along the back edge
    if (byTier) {
      ctx.font = `700 24px ${font}`;
      ctx.textAlign = "left";
      ctx.strokeStyle = cssVar("--foreground");
      ctx.lineWidth = 3;
      let start = 0;
      rows.forEach((r, i) => {
        const end = i === n - 1 || rows[i + 1].tier !== r.tier;
        if (!end) return;
        ctx.fillText(`Tier ${r.tier}`, gx(start) + 6, gy(0) - 16);
        if (i < n - 1) {
          ctx.beginPath();
          ctx.moveTo(gx(i + 1), gy(0) - 30);
          ctx.lineTo(gx(i + 1), gy(m));
          ctx.stroke();
        }
        start = i + 1;
      });
    }
  };
  draw([]);
  const tex = canvasTexture(c);
  void Promise.all(partners.map((p) => loadImage(flagSrc(p.code)))).then((flags) => {
    if (!alive()) return;
    draw(flags);
    tex.needsUpdate = true;
    onReady();
  });
  return { tex, w: W / PX, d: H / PX };
}

export function Skyline3D({ data, rows, byTier, onHover, onAssess }: {
  data: Radar;
  rows: Row[];
  byTier: boolean;
  onHover: (c: SkylineCell) => void;
  onAssess: (hs: string, partner: string) => void;
}) {
  const { hostRef, stageRef, ready, failed, reduce } = useStage({
    position: HOME.pos.toArray(), target: HOME.target.toArray(), minDistance: 1.2, maxDistance: 14, maxPolarAngle: 1.45, enablePan: true,
  });
  const { theme } = useTheme();
  const [tip, setTip] = useState<Tip | null>(null);
  const [top, setTop] = useState(false);
  const bars = useRef<{ mesh: THREE.InstancedMesh; colors: THREE.Color[]; hovered: number } | null>(null);
  const grown = useRef(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    stage.fitHome(HOME.pos, HOME.target, 2.2);
  }, [ready, stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    let alive = true;
    const g = new THREE.Group();
    const n = rows.length, m = data.partners.length;
    const x0 = -(n * CELL) / 2, z0 = -(m * CELL_Z) / 2;

    const floor = floorTexture(rows, data.partners, byTier, () => alive, () => stage.invalidate());
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(floor.w, floor.d), new THREE.MeshBasicMaterial({ map: floor.tex, transparent: true }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x0 - M.left + floor.w / 2, 0, z0 - M.back + floor.d / 2);
    g.add(plane);

    g.add(new THREE.AmbientLight(0xffffff, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-2, 4, 3);
    g.add(sun);

    const geo = new THREE.BoxGeometry(BAR, 1, BAR_Z).translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), n * m);
    const card = themeColor("--card").convertLinearToSRGB(), crit = themeColor("--status-critical").convertLinearToSRGB();
    const colors: THREE.Color[] = [];
    const heights: number[] = [];
    const mat = new THREE.Matrix4();
    rows.forEach((r, i) => r.cells.forEach((c, j) => {
      const k = i * m + j;
      heights[k] = height(c.score);
      mat.makeScale(1, heights[k], 1).setPosition(x0 + (i + 0.5) * CELL, 0, z0 + (j + 0.5) * CELL_Z);
      mesh.setMatrixAt(k, mat);
      colors[k] = new THREE.Color().lerpColors(card, crit, Math.max(0.12, c.score / 100)).convertSRGBToLinear();
      mesh.setColorAt(k, colors[k]);
    }));
    g.add(mesh);
    bars.current = { mesh, colors, hovered: -1 };

    // Bars rise column by column the first time the skyline appears
    let grow: ((t: number) => void) | null = null;
    if (!reduce && !grown.current) {
      let t0 = -1;
      grow = (t) => {
        if (t0 < 0) t0 = t;
        let done = true;
        for (let i = 0; i < n; i++) {
          const e = Math.min(1, Math.max(0, (t - t0 - i * 0.014) / 0.55));
          if (e < 1) done = false;
          const s = 1 - (1 - e) ** 3;
          for (let j = 0; j < m; j++) {
            const k = i * m + j;
            mat.makeScale(1, Math.max(0.0001, heights[k] * s), 1).setPosition(x0 + (i + 0.5) * CELL, 0, z0 + (j + 0.5) * CELL_Z);
            mesh.setMatrixAt(k, mat);
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (done && grow) stage.frame.delete(grow);
      };
      stage.frame.add(grow);
    }
    grown.current = true;

    stage.scene.add(g);
    stage.invalidate();
    return () => {
      alive = false;
      if (grow) stage.frame.delete(grow);
      stage.scene.remove(g);
      disposeTree(g);
      bars.current = null;
    };
  }, [ready, stageRef, data, rows, byTier, theme, reduce]);

  const m = data.partners.length;
  const cellAt = (id: number): SkylineCell => {
    const r = rows[Math.floor(id / m)];
    return { ...r.cells[id % m], hs: r.hs, description: r.description, tier: r.tier };
  };
  const highlight = (id: number) => {
    const b = bars.current;
    if (!b || b.hovered === id) return;
    if (b.hovered >= 0) b.mesh.setColorAt(b.hovered, b.colors[b.hovered]);
    if (id >= 0) b.mesh.setColorAt(id, new THREE.Color(cssVar("--ring")));
    b.hovered = id;
    b.mesh.instanceColor!.needsUpdate = true;
    stageRef.current?.invalidate();
  };

  usePicking(stageRef, ready, {
    move: (e, stage) => {
      const b = bars.current;
      const id = b ? stage.pick(e, [b.mesh])[0]?.instanceId ?? -1 : -1;
      highlight(id);
      stage.renderer.domElement.style.cursor = id >= 0 ? "pointer" : "";
      if (id < 0) return setTip(null);
      const c = cellAt(id);
      onHover(c);
      setTip(tipAt(e, stage, (
        <>
          <div className="flex items-center gap-1.5 font-bold">HS {c.hs} → <Flag code={c.partner} size={14} /> {regionName(c.partner)}</div>
          <div className="text-muted-foreground">{c.description}</div>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge tone={bandTone[c.band]}>{c.band}</StatusBadge>
            <span className="text-[15px] font-bold">{c.score}</span><span className="text-muted-foreground">/ 100</span>
          </div>
          <div className="mt-1">
            {c.multiplier !== null ? `${times(c.multiplier)} the 2017–21 baseline` : c.emergent ? "New flow since 2022" : "No baseline"}
            {c.ytd !== null && <> · YTD {times(c.ytd)}</>}
          </div>
          <div className="text-muted-foreground">{data.years.at(-1)}: {money(c.latest)} · click to assess</div>
        </>
      )));
    },
    click: (e, stage) => {
      const b = bars.current;
      const id = b ? stage.pick(e, [b.mesh])[0]?.instanceId ?? -1 : -1;
      if (id >= 0) {
        const c = cellAt(id);
        onAssess(c.hs, c.partner);
      }
    },
    leave: () => {
      highlight(-1);
      setTip(null);
    },
  });

  const view = (isTop: boolean) => {
    const stage = stageRef.current;
    if (!stage) return;
    setTop(isTop);
    if (!isTop) return stage.home();
    stage.fly(TOP.pos.clone().sub(TOP.target).multiplyScalar(stage.boost(2.2)).add(TOP.target), TOP.target.clone(), 1);
  };

  return (
    <Frame3D hostRef={hostRef} stageRef={stageRef} failed={failed} tip={tip} className="h-[280px] bg-card sm:h-[460px]"
      label={`3D skyline of route risk scores for ${rows.length} items and ${m} countries, exporter ${data.exporter_name}`}
      hint="Drag to rotate · right-drag to pan · Ctrl + scroll to zoom"
      tools={<>
        <ToolButton label="Perspective view" active={!top} onClick={() => view(false)}><ArrowsOutIcon className="size-3.5" /> 3D</ToolButton>
        <ToolButton label="Top view (like the heatmap)" active={top} onClick={() => view(true)}><EyeIcon className="size-3.5" /> Top</ToolButton>
      </>} />
  );
}
