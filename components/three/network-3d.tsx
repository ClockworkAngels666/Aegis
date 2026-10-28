"use client";

import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { flagTexture, markTexture, personTexture } from "@/components/three/marks";
import { Frame3D, ToolButton, type Tip, tipAt, usePicking, useStage } from "@/components/three/frame";
import { StatusBadge } from "@/components/status";
import { Flag, regionName } from "@/components/visuals";
import { entityTone } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { canvasTexture, cssVar, disposeTree, pageFont } from "@/lib/three-stage";
import type { Entity, Match } from "@/lib/types";

const HUBS: { id: string; label: string; full: string }[] = [
  { id: "EU", label: "EU", full: "EU consolidated list (FSF)" },
  { id: "OFAC", label: "OFAC", full: "US OFAC SDN list" },
  { id: "UN", label: "UN", full: "UN Security Council list" },
];
const HOME = { pos: new THREE.Vector3(0.6, 0.85, 6.1), target: new THREE.Vector3(0, -0.02, 0) };

type Kind = "company" | "person" | "hub" | "match" | "country";
interface Node { id: string; kind: Kind; label: string; size: number; pos: THREE.Vector3; pinned?: boolean; flagged?: boolean;
  /** Listed individual (person icon) rather than a listed organisation. */
  individual?: boolean; info: ReactNode; url?: string;
  /** Label above the node (upper row of matches) instead of below. */
  labelAbove?: boolean }
interface Edge { a: string; b: string; kind: "owner" | "screened" | "match" | "listed" | "country"; score?: number }

/** Builds the graph: subjects, the three lists, listed names that matched, and the buyer's country. */
function graph(e: Entity, company: string, jurisdiction: string | null) {
  const nodes: Node[] = [], edges: Edge[] = [];
  const add = (n: Omit<Node, "pos">) => nodes.push({ ...n, pos: new THREE.Vector3() });
  HUBS.forEach((h) => add({ id: `hub:${h.id}`, kind: "hub", label: h.label, size: 0.42, pinned: true,
    info: <><div className="font-bold">{h.full}</div><div className="text-muted-foreground">Screened against the official list</div></> }));
  e.subjects.forEach((s, i) => {
    const id = `s:${i}`;
    const isCompany = s.role === "Company";
    add({ id, kind: isCompany ? "company" : "person", label: s.name, size: isCompany ? 0.56 : 0.42, pinned: isCompany, flagged: s.status !== "CLEAN",
      info: <><div className="text-[10px] uppercase tracking-wider text-faint">{s.role}</div><div className="font-bold">{s.name}</div>
        <div className="mt-1"><StatusBadge tone={entityTone[s.status]}>{s.status}{s.status !== "CLEAN" && ` · ${s.best_score.toFixed(0)}%`}</StatusBadge></div></> });
    if (!isCompany) edges.push({ a: "s:0", b: id, kind: "owner" });
    HUBS.forEach((h) => edges.push({ a: id, b: `hub:${h.id}`, kind: "screened" }));
    s.matches.filter((m) => m.score >= 60).slice(0, 4).forEach((m: Match) => {
      const mid = `m:${m.id}`;
      if (!nodes.some((n) => n.id === mid)) {
        add({ id: mid, kind: "match", label: m.name, size: 0.34, flagged: true, url: m.url, individual: m.kind === "P",
          info: <><div className="text-[10px] uppercase tracking-wider text-faint">Listed {m.kind === "P" ? "person" : "entity"}</div>
            <div className="font-bold">{m.name}</div>
            <div>{m.lists.join(" · ")}{m.program && ` · ${m.program}`}</div>
            {m.countries.length > 0 && <div className="flex items-center gap-1">{m.countries.map((c) => <Flag key={c} code={c} size={14} />)} {m.countries.map((c) => regionName(c)).join(", ")}</div>}
            {m.listed_since && <div className="text-muted-foreground">Listed since {m.listed_since}</div>}
            <div className="text-muted-foreground">Click to open the official record</div></> });
        m.lists.forEach((l) => HUBS.some((h) => h.id === l) && edges.push({ a: mid, b: `hub:${l}`, kind: "listed" }));
      }
      edges.push({ a: id, b: mid, kind: "match", score: m.score });
    });
  });
  if (jurisdiction) {
    add({ id: "country", kind: "country", label: regionName(jurisdiction), size: 0.32,
      info: <><div className="flex items-center gap-1.5 font-bold"><Flag code={jurisdiction} size={14} />{regionName(jurisdiction)}</div><div className="text-muted-foreground">Buyer&apos;s jurisdiction</div></> });
    edges.push({ a: "s:0", b: "country", kind: "country" });
  }
  return { nodes, edges };
}

/**
 * Layered layout: the three lists on top, the buyer and its owners in the middle, listed names that matched
 * below their subject, staggered in height and depth so that rotating the view separates them.
 */
function layout(nodes: Node[], edges: Edge[]) {
  const hubs = nodes.filter((n) => n.kind === "hub");
  hubs.forEach((h, i) => h.pos.set((i - 1) * 2.3, 1.35, -0.6));
  const subjects = nodes.filter((n) => n.kind === "company" || n.kind === "person");
  const gap = Math.min(2.7, 7 / Math.max(1, subjects.length));
  subjects.forEach((n, i) => n.pos.set((i - (subjects.length - 1) / 2) * gap, 0, 0.25));
  const placed = new Set<string>();
  for (const sub of subjects) {
    const own = edges.filter((e) => e.kind === "match" && e.a === sub.id && !placed.has(e.b)).map((e) => e.b);
    own.forEach((id, j) => {
      const m = nodes.find((n) => n.id === id)!;
      const spread = Math.min(0.8, (gap - 0.3) / Math.max(1, own.length - 1));
      m.pos.set(sub.pos.x + (j - (own.length - 1) / 2) * spread, -0.95 - (j % 2) * 0.4, j % 2 ? -0.45 : 0.45);
      m.labelAbove = j % 2 === 0;
      placed.add(id);
    });
  }
  const company = subjects.find((n) => n.kind === "company");
  const country = nodes.find((n) => n.kind === "country");
  if (company && country) country.pos.copy(company.pos).add(new THREE.Vector3(-0.85, 0.62, 0.7));
}

/** A cylinder between two points. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8, 1), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

function hubTexture(label: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 192;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2f3e4e";
  ctx.beginPath();
  ctx.arc(96, 96, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#a7b1bd";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${label.length > 2 ? 54 : 68}px ${pageFont()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 96, 100);
  return canvasTexture(c);
}

/** Link analysis: the buyer, its owners, the sanctions lists and any listed names that matched. */
export function Network3D({ e, company, jurisdiction }: { e: Entity; company: string; jurisdiction: string | null }) {
  const { hostRef, stageRef, ready, failed, reduce } = useStage({
    position: HOME.pos.toArray(), target: HOME.target.toArray(), minDistance: 2, maxDistance: 12, fov: 36,
  });
  const { theme } = useTheme();
  const [tip, setTip] = useState<Tip | null>(null);
  const [spinning, setSpinning] = useState(true);
  const sprites = useRef<THREE.Sprite[]>([]);
  const labelEls = useRef(new Map<string, HTMLDivElement>());
  const { nodes } = graph(e, company, jurisdiction);
  const matches = nodes.filter((n) => n.kind === "match").length;

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    stage.fitHome(HOME.pos, HOME.target, 2.0);
    const stop = () => setSpinning(false);
    stage.controls.addEventListener("start", stop);
    return () => stage.controls.removeEventListener("start", stop);
  }, [ready, stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.controls.autoRotate = spinning && !reduce;
    stage.controls.autoRotateSpeed = 1.1;
    stage.invalidate(); // wakes the render loop
  }, [ready, stageRef, spinning, reduce]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    let alive = true;
    const { nodes: ns, edges } = graph(e, company, jurisdiction);
    layout(ns, edges);
    const byId = new Map(ns.map((n) => [n.id, n]));
    const g = new THREE.Group();
    const critical = cssVar("--status-critical"), serious = cssVar("--status-serious"), muted = cssVar("--chart-baseline");

    for (const ed of edges) {
      const a = byId.get(ed.a)!.pos, b = byId.get(ed.b)!.pos;
      const s = ed.score ?? 0;
      const color = ed.kind === "match" ? (s >= 93 ? critical : s >= 80 ? serious : muted) : ed.kind === "listed" ? critical : muted;
      const r = ed.kind === "match" ? 0.008 + (s / 100) * 0.016 : ed.kind === "screened" ? 0.004 : 0.008;
      const opacity = ed.kind === "screened" ? (theme === "dark" ? 0.3 : 0.35) : ed.kind === "listed" ? 0.45 : 0.9;
      g.add(rod(a, b, r, new THREE.MeshBasicMaterial({ color, transparent: true, opacity })));
    }
    const list: THREE.Sprite[] = [];
    for (const n of ns) {
      const tex = n.kind === "company" ? markTexture(n.label, !!n.flagged)
        : n.kind === "person" ? personTexture(!!n.flagged)
        : n.kind === "hub" ? hubTexture(n.label)
        : n.kind === "country" ? flagTexture(jurisdiction ?? "", () => stage.invalidate(), () => alive)
        : n.individual ? personTexture(true) : markTexture(n.label, true);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
      sp.scale.set(n.size, n.kind === "country" ? n.size * 0.75 : n.size, 1);
      sp.position.copy(n.pos);
      sp.userData.node = n.id;
      g.add(sp);
      list.push(sp);
    }
    const hide = stage.reveal(g);
    sprites.current = list;

    const update = () => {
      for (const sp of list) {
        const el = labelEls.current.get(sp.userData.node as string);
        if (!el) continue;
        const n = byId.get(sp.userData.node as string)!;
        const { x, y } = stage.toScreen(sp.position);
        const off = (n.size / 2) * (stage.renderer.domElement.clientHeight / (2 * Math.tan((36 * Math.PI) / 360) * stage.camera.position.distanceTo(sp.position)));
        el.style.transform = n.labelAbove
          ? `translate(${x.toFixed(1)}px, ${(y - off - 2).toFixed(1)}px) translate(-50%, -100%)`
          : `translate(${x.toFixed(1)}px, ${(y + off + 3).toFixed(1)}px) translate(-50%, 0)`;
        el.style.opacity = "1";
      }
    };
    stage.after.add(update);
    stage.invalidate();
    return () => {
      alive = false;
      stage.after.delete(update);
      hide();
      disposeTree(g);
      sprites.current = [];
    };
  }, [ready, stageRef, e, company, jurisdiction, theme]);

  const nodeAt = (ev: PointerEvent) => {
    const stage = stageRef.current;
    const hit = stage ? stage.pick(ev, sprites.current)[0] : undefined;
    return hit ? nodes.find((n) => n.id === hit.object.userData.node) ?? null : null;
  };
  usePicking(stageRef, ready, {
    move: (ev, stage) => {
      const n = nodeAt(ev);
      stage.renderer.domElement.style.cursor = n?.url ? "pointer" : "";
      setTip(n ? tipAt(ev, stage, n.info) : null);
    },
    click: (ev) => {
      const n = nodeAt(ev);
      if (n?.url) window.open(n.url, "_blank", "noopener,noreferrer");
    },
    leave: () => setTip(null),
  });

  return (
    <div>
      <Frame3D hostRef={hostRef} stageRef={stageRef} failed={failed} tip={tip} className="h-[360px] bg-card sm:h-[400px]"
        label={`3D link analysis of ${company}: owners, sanctions lists and ${matches} listed names that matched`}
        hint="Drag to rotate · hover a node · click a listed name for the official record"
        tools={!reduce && (
          <ToolButton label={spinning ? "Stop turning" : "Turn automatically"} onClick={() => setSpinning(!spinning)}>
            {spinning ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
          </ToolButton>
        )}
        overlay={
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {nodes.map((n) => (
              <div key={n.id} ref={(el) => {
                if (el) labelEls.current.set(n.id, el);
                else labelEls.current.delete(n.id);
              }} className={`absolute left-0 top-0 max-w-[150px] truncate text-center opacity-0 [text-shadow:0_0_3px_var(--card),0_0_3px_var(--card)] ${n.kind === "match" ? "text-[11px] text-muted-foreground" : "text-[12px] font-bold text-foreground"} ${n.kind === "hub" ? "max-sm:hidden" : ""}`}>
                {n.kind === "hub" ? HUBS.find((h) => `hub:${h.id}` === n.id)?.full : n.label}
              </div>
            ))}
          </div>
        } />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {matches === 0 && <span className="font-bold text-foreground">No listed names matched (similarity ≥ 60%).</span>}
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5" style={{ background: "var(--status-critical)" }} />Match ≥ 93%</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5" style={{ background: "var(--status-serious)" }} />Partial 80–93%</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5" style={{ background: "var(--chart-baseline)" }} />Weak, screened or ownership link</span>
        <span>Line thickness: name similarity</span>
      </div>
    </div>
  );
}
