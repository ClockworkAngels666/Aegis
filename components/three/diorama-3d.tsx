"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { flagTexture, markTexture } from "@/components/three/marks";
import { Frame3D, type Tip, tipAt, usePicking, useStage } from "@/components/three/frame";
import { regionName } from "@/components/visuals";
import { money } from "@/lib/format";
import { MODE_LABEL, ROUTE_MODES, type Mode } from "@/lib/routes";
import { useTheme } from "@/lib/theme";
import { mergeStatic } from "@/lib/three-merge";
import { cssVar, disposeTree, type Stage } from "@/lib/three-stage";
import type { Assessment } from "@/lib/types";

const X = { exporter: -3.6, buyer: 0, russia: 3.6 };
const HALF = 0.85; // half width of a plot
const HOME = { pos: new THREE.Vector3(1.0, 3.1, 5.9), target: new THREE.Vector3(0, 0.5, 0.05) };
const CONTAINER = ["#2a78d6", "#eb6834", "#0f766e", "#b45309", "#6250d6", "#475569"];

type Pick = { title: ReactNode; lines: ReactNode[] };

// Materials are shared within one build so that identical parts can be merged into one draw call.
const MATERIALS = new Map<string, THREE.MeshStandardMaterial>();
function std(color: string, rough = 0.6, metal = 0) {
  const key = `${color}|${rough}|${metal}`;
  if (!MATERIALS.has(key)) MATERIALS.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return MATERIALS.get(key)!;
}
function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
function cyl(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 20): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  return mesh;
}
function pick(o: THREE.Object3D, p: Pick) {
  o.userData.pick = p;
  return o;
}

/* ---------------- buildings ---------------- */

function plot(x: number): THREE.Group {
  const g = new THREE.Group();
  g.position.x = x;
  g.add(box(HALF * 2, 0.08, HALF * 2, std("#e3e8ee", 0.9)));
  return g;
}

/** Flag on a pole; returns the waving cloth so it can be animated. */
function flagPole(g: THREE.Group, code: string, at: [number, number], invalidate: () => void, alive: () => boolean) {
  g.add(cyl(0.012, 0.95, std("#6b7684", 0.4, 0.6), at[0], 0.08, at[1], 8));
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.255, 12, 1),
    new THREE.MeshStandardMaterial({ map: flagTexture(code, invalidate, alive), side: THREE.DoubleSide, roughness: 0.8 }));
  cloth.geometry.translate(0.17, 0, 0);
  cloth.position.set(at[0] + 0.012, 0.9, at[1]);
  cloth.castShadow = true;
  cloth.userData.dynamic = true;
  g.add(cloth);
  return cloth;
}

function factory(g: THREE.Group, smoke: THREE.Mesh[]) {
  const wall = std("#f2f4f7"), side = std("#d5dbe2"), glass = std("#9fc3ea", 0.25, 0.2), dark = std("#6b7684");
  g.add(box(1.15, 0.42, 0.8, wall, -0.05, 0.08, 0.1));
  for (let i = 0; i < 4; i++) {
    const tooth = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 3, 1), i % 2 ? side : glass);
    tooth.rotation.x = -Math.PI / 2; // prism axis front-to-back, ridge on top
    tooth.scale.set(1, 1, 0.75);
    tooth.position.set(-0.48 + i * 0.29, 0.58, 0.1);
    tooth.castShadow = true;
    g.add(tooth);
  }
  for (let i = 0; i < 5; i++) g.add(box(0.12, 0.12, 0.01, glass, -0.5 + i * 0.22, 0.25, 0.505));
  g.add(box(0.26, 0.24, 0.01, dark, 0.38, 0.08, 0.505));
  g.add(cyl(0.065, 1.05, std("#b9c1cb", 0.5), 0.52, 0.08, -0.45));
  g.add(cyl(0.07, 0.05, std("#d03b3b", 0.5), 0.52, 1.0, -0.45));
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8),
      new THREE.MeshStandardMaterial({ color: "#d6dce3", transparent: true, opacity: 0.7, roughness: 1 }));
    puff.position.set(0.52, 1.2 + i * 0.18, -0.45);
    puff.userData = { phase: i / 4, dynamic: true };
    smoke.push(puff);
    g.add(puff);
  }
  // pallets of crates by the loading door
  for (let i = 0; i < 3; i++) g.add(box(0.14, 0.12, 0.14, std("#c99a5d", 0.9), 0.62, 0.08 + (i === 2 ? 0.12 : 0), 0.62 - (i % 2) * 0.17));
}

function compound(g: THREE.Group, company: string, flagged: boolean, beacon: THREE.Mesh[]) {
  const tower = new THREE.Group();
  g.add(tower);
  const facade = (() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 320;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#dbe7f4";
    ctx.fillRect(0, 0, 128, 320);
    ctx.fillStyle = "#7aa1cc";
    for (let r = 0; r < 12; r++) for (let k = 0; k < 4; k++) ctx.fillRect(10 + k * 29, 12 + r * 25, 20, 15);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const fm = new THREE.MeshStandardMaterial({ map: facade, roughness: 0.4 });
  const roof = std("#c9d6e6");
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5), [fm, fm, roof, roof, fm, fm]);
  t.position.set(-0.3, 0.08 + 0.65, -0.2);
  t.castShadow = t.receiveShadow = true;
  tower.add(t);
  g.add(box(0.7, 0.32, 0.55, std("#eef1f4"), 0.35, 0.08, 0.3));
  g.add(box(0.24, 0.2, 0.01, std("#8a95a3"), 0.35, 0.08, 0.576));
  // rooftop sign with the generated company mark
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTexture(company, flagged) }));
  sign.scale.set(0.42, 0.42, 1);
  sign.position.set(-0.3, 1.66, -0.2);
  g.add(sign);
  g.add(cyl(0.01, 0.12, std("#6b7684"), -0.3, 1.38, -0.2, 6));
  if (flagged) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: "#ff4d4d", transparent: true }));
    light.position.set(-0.05, 1.42, -0.2);
    light.userData.dynamic = true;
    beacon.push(light);
    g.add(light);
  }
  return sign;
}

function depot(g: THREE.Group) {
  g.add(box(1.1, 0.42, 0.85, std("#efe7e1"), 0, 0.08, 0.05));
  g.add(box(1.18, 0.05, 0.93, std("#9b4a42", 0.7), 0, 0.5, 0.05));
  [-0.3, 0.05, 0.4].forEach((x) => g.add(box(0.24, 0.27, 0.01, std("#8d7f75"), x, 0.08, 0.48)));
  for (let i = 0; i < 2; i++) g.add(box(0.36, 0.17, 0.17, std(CONTAINER[i + 2], 0.6), -0.45 + i * 0.42, 0.08, 0.68));
}

/* ---------------- legs and vehicles ---------------- */

function truck(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.46, 0.15, 0.15, std(color, 0.55), -0.08, 0.035, 0));
  g.add(box(0.13, 0.13, 0.14, std("#2f3e4e", 0.5), 0.23, 0.035, 0));
  g.add(box(0.01, 0.06, 0.12, std("#9cc3ec", 0.2), 0.296, 0.1, 0));
  for (const x of [-0.25, -0.13, 0.22]) for (const z of [-0.075, 0.075]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 14), std("#1f2933", 0.8));
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.035, z);
    g.add(w);
  }
  g.traverse((o) => (o.castShadow = true));
  mergeStatic(g);
  return g;
}

function ship(n: number): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Shape();
  hull.moveTo(-0.55, 0);
  hull.lineTo(0.42, 0);
  hull.lineTo(0.62, 0.14);
  hull.lineTo(-0.6, 0.14);
  hull.closePath();
  const geo = new THREE.ExtrudeGeometry(hull, { depth: 0.28, bevelEnabled: false });
  geo.translate(0, -0.03, -0.14);
  const h = new THREE.Mesh(geo, std("#1f3a5f", 0.5));
  h.castShadow = true;
  g.add(h);
  g.add(box(1.16, 0.02, 0.285, std("#d03b3b", 0.6), 0.02, 0.07, 0));
  g.add(box(0.16, 0.22, 0.24, std("#eef1f4", 0.5), -0.45, 0.11, 0));
  g.add(box(0.17, 0.035, 0.25, std("#7aa1cc", 0.3), -0.45, 0.26, 0));
  for (let i = 0; i < n; i++) {
    const col = i % 4, tier = Math.floor(i / 4);
    g.add(box(0.19, 0.09, 0.22, std(CONTAINER[i % CONTAINER.length], 0.55), -0.2 + col * 0.2, 0.11 + tier * 0.092, 0));
  }
  mergeStatic(g);
  return g;
}

function plane(): THREE.Group {
  const g = new THREE.Group();
  const body = std("#eef1f4", 0.4), dark = std("#2f3e4e", 0.4);
  const f = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.6, 16), body);
  f.rotation.z = Math.PI / 2;
  g.add(f);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), body);
  nose.position.x = 0.3;
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 16), body);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.37;
  g.add(tail);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.62), dark);
  wing.position.x = 0.02;
  g.add(wing);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.22), dark);
  stab.position.x = -0.36;
  g.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.01), dark);
  fin.position.set(-0.37, 0.06, 0);
  g.add(fin);
  g.traverse((o) => (o.castShadow = true));
  mergeStatic(g);
  return g;
}

/** The track a leg's vehicles follow, from plot edge to plot edge. */
function legCurve(x1: number, x2: number, mode: Mode): THREE.Curve<THREE.Vector3> {
  if (mode === "air") {
    return new THREE.QuadraticBezierCurve3(new THREE.Vector3(x1 - 0.3, 0.5, 0.3), new THREE.Vector3((x1 + x2) / 2, 2.3, 0.3),
      new THREE.Vector3(x2 + 0.3, 0.5, 0.3));
  }
  const inset = mode === "sea" ? 0.5 : 0.25, y = mode === "sea" ? 0.04 : 0.02, z = mode === "sea" ? 0.25 : 0.33;
  return new THREE.LineCurve3(new THREE.Vector3(x1 + inset, y, z), new THREE.Vector3(x2 - inset, y, z));
}

function legSurface(g: THREE.Group, x1: number, x2: number, mode: Mode, waves: THREE.Texture[]) {
  const len = x2 - x1, mid = (x1 + x2) / 2;
  if (mode === "sea") {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#8fbbe8";
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 44, 14 + (i % 3) * 16);
      ctx.quadraticCurveTo(i * 44 + 11, 8 + (i % 3) * 16, i * 44 + 22, 14 + (i % 3) * 16);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(len / 1.2, 2);
    waves.push(tex);
    const water = new THREE.Mesh(new THREE.BoxGeometry(len + 0.3, 0.03, 1.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.1 }));
    water.position.set(mid, 0.0, 0.1);
    water.receiveShadow = true;
    g.add(water);
    for (const x of [x1 + 0.05, x2 - 0.05]) g.add(box(0.12, 0.05, 0.5, std("#a7b1bd", 0.8), x, 0.0, 0.25));
  } else if (mode === "land") {
    g.add(box(len, 0.02, 0.42, std("#5b6573", 0.85), mid, 0, 0.25));
    for (let x = x1 + 0.1; x < x2 - 0.05; x += 0.22) g.add(box(0.1, 0.004, 0.018, std("#ffffff", 0.6), x + 0.05, 0.02, 0.25));
  }
}

/** A dashed line along a curve. */
function dashes(g: THREE.Group, curve: THREE.Curve<THREE.Vector3>, color: string, lift = 0) {
  const n = 22;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  for (let i = 0; i < n; i += 2) {
    const pts = Array.from({ length: 6 }, (_, k) => curve.getPointAt(Math.min(1, (i + k / 5) / n)).add(new THREE.Vector3(0, lift, 0)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.012, 6, false), mat));
  }
}

/** Everything the scene shows, derived from the assessment. */
function derive(a: Assessment) {
  const { query: q, route, entity } = a;
  return {
    modes: ROUTE_MODES[q.intermediary] ?? { first: "land" as Mode, onward: "land" as Mode },
    flagged: entity.status !== "CLEAN",
    alert: route.band === "CRITICAL" || route.band === "HIGH",
    shipments: route.emergent ? 8 : Math.max(1, Math.min(8, Math.round(route.multiplier ?? 2))),
    buyerCountry: q.jurisdiction || q.intermediary,
    last: route.points.at(-1),
    ruDrop: route.russia_ratio !== null ? Math.round((1 - route.russia_ratio) * 100) : null,
  };
}

function warningSprite(): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#d03b3b";
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 84px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t }));
  s.scale.set(0.28, 0.28, 1);
  return s;
}

/* ---------------- component ---------------- */

/** The shipment as a small 3D diorama: exporter factory → buyer → Russian depot. */
export function Diorama3D({ a }: { a: Assessment }) {
  const { hostRef, stageRef, ready, failed, reduce } = useStage({
    position: HOME.pos.toArray(), target: HOME.target.toArray(), minDistance: 2.5, maxDistance: 14, maxPolarAngle: 1.42, fov: 32,
  });
  const { theme } = useTheme();
  const [tip, setTip] = useState<Tip | null>(null);
  const picks = useRef<THREE.Object3D[]>([]);
  const labelEls = useRef(new Map<string, HTMLDivElement>());

  const { query: q } = a;
  const { modes, alert } = derive(a);
  const labels = [
    { id: "l1", text: MODE_LABEL[modes.first] },
    { id: "l2", text: `${alert ? "suspected" : "possible"} onward route · ${MODE_LABEL[modes.onward]}` },
  ];

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    stage.fitHome(HOME.pos, HOME.target, 3.0);
    stage.renderer.shadowMap.enabled = true;
    stage.renderer.shadowMap.type = THREE.PCFShadowMap;
    stage.renderer.shadowMap.autoUpdate = false; // redrawn when the scene changes, see tick()
  }, [ready, stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    let alive = true;
    const root = new THREE.Group();
    const invalidate = () => stage.invalidate();
    const dark = theme === "dark";
    MATERIALS.clear();
    const { query: q, route, entity, series } = a;
    const { modes, flagged, alert, shipments, buyerCountry, last, ruDrop } = derive(a);

    root.add(new THREE.HemisphereLight(0xffffff, dark ? 0x30343a : 0xc9d2dc, dark ? 1.6 : 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, dark ? 1.9 : 2.1);
    sun.position.set(-3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 3, bottom: -3, near: 1, far: 16 });
    sun.shadow.bias = -0.0005;
    root.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), new THREE.MeshStandardMaterial({ color: cssVar("--muted"), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.016;
    ground.receiveShadow = true;
    root.add(ground);

    // plots and buildings
    const smoke: THREE.Mesh[] = [], beacon: THREE.Mesh[] = [];
    const exp = plot(X.exporter), buy = plot(X.buyer), ru = plot(X.russia);
    factory(exp, smoke);
    compound(buy, q.company, flagged, beacon);
    depot(ru);
    const cloths = [
      flagPole(exp, q.exporter, [-0.72, 0.72], invalidate, () => alive),
      flagPole(buy, buyerCountry, [-0.72, 0.72], invalidate, () => alive),
      flagPole(ru, "RU", [-0.72, 0.72], invalidate, () => alive),
    ];
    const unit = series.unit;
    pick(exp, { title: <>{q.exporter_name} · exporter</>, lines: [
      `HS ${a.classification.hs}${a.classification.description ? ` · ${a.classification.description}` : ""}`,
      last ? `${money(last.value, unit)} to ${q.intermediary_name} in ${last.year}${route.multiplier !== null ? ` · ${route.multiplier.toFixed(1)}× pre-war` : ""}` : "",
    ] });
    pick(buy, { title: <>{q.company}</>, lines: [
      `${regionName(buyerCountry)}${buyerCountry === q.intermediary ? " · buyer" : ` · via ${q.intermediary_name}`}`,
      `Sanctions screen: ${entity.status}${flagged ? ` (${entity.best_score.toFixed(0)}% similarity)` : ""}`,
      "Company mark is generated, not a real logo",
    ] });
    pick(ru, { title: <>Russia · sanctioned destination</>, lines: [
      ruDrop !== null ? `Direct exports of this item ${ruDrop > 0 ? "−" : "+"}${Math.abs(ruDrop)}% since 2021` : "",
      `Route risk ${route.score} / 100 · ${route.band}`,
    ] });
    [exp, buy, ru].forEach(mergeStatic);
    root.add(exp, buy, ru);

    // legs
    const waves: THREE.Texture[] = [];
    const movers: { obj: THREE.Object3D; curve: THREE.Curve<THREE.Vector3>; speed: number; phase: number; mode: Mode }[] = [];
    const legs: [number, number, Mode, number, boolean][] = [
      [X.exporter + HALF, X.buyer - HALF, modes.first, shipments, false],
      [X.buyer + HALF, X.russia - HALF, modes.onward, Math.max(1, Math.round(shipments / 2)), alert],
    ];
    legs.forEach(([x1, x2, mode, n, suspicious], li) => {
      const g = new THREE.Group();
      legSurface(g, x1, x2, mode, waves);
      const curve = legCurve(x1, x2, mode);
      if (mode === "air") dashes(g, curve, "#8f959e");
      if (suspicious) {
        dashes(g, mode === "air" ? curve : new THREE.LineCurve3(new THREE.Vector3(x1, 0.045, 0.62), new THREE.Vector3(x2, 0.045, 0.62)),
          cssVar("--status-critical"), mode === "air" ? 0.06 : 0);
        const w = warningSprite();
        w.position.set((x1 + x2) / 2, mode === "air" ? 2.0 : 0.75, 0.3);
        pick(w, { title: <>Suspected onward route</>, lines: [`Route risk ${route.band}: exports to ${q.intermediary_name} surged while direct exports to Russia fell.`] });
        g.add(w);
      }
      const vehicles = mode === "sea" ? [ship(n)] : mode === "air" ? [plane()] : Array.from({ length: Math.min(3, Math.ceil(n / 3)) }, (_, i) => truck(CONTAINER[(i + li) % CONTAINER.length]));
      vehicles.forEach((v, i) => {
        pick(v, { title: <>{mode === "sea" ? "Container ship" : mode === "air" ? "Cargo plane" : "Truck convoy"}</>, lines: [
          li === 0 ? `${MODE_LABEL[mode]} · ${q.exporter_name} → ${q.intermediary_name}` : `${MODE_LABEL[mode]} · ${q.intermediary_name} → Russia`,
          li === 0 && mode === "sea" ? `${n} containers ≈ the surge multiple (illustrative)` : "Illustrative, not an observed shipment",
        ] });
        v.userData.dynamic = true;
        g.add(v);
        movers.push({ obj: v, curve, speed: mode === "air" ? 0.11 : mode === "sea" ? 0.07 : 0.1, phase: i / vehicles.length + li * 0.37, mode });
      });
      mergeStatic(g);
      root.add(g);
    });

    const ahead = new THREE.Vector3();
    const place = (t: number) => {
      for (const m of movers) {
        const u = reduce ? 0.5 : (((m.phase + t * m.speed) % 1) + 1) % 1;
        m.curve.getPointAt(u, m.obj.position);
        m.curve.getTangentAt(u, ahead);
        m.obj.rotation.set(0, 0, m.mode === "air" ? Math.atan2(ahead.y, ahead.x) : 0);
        if (m.mode === "sea") m.obj.position.y += Math.sin(t * 2 + m.phase * 9) * 0.008;
      }
      waves.forEach((w) => (w.offset.x = -t * 0.05));
      smoke.forEach((p) => {
        const k = (t * 0.25 + p.userData.phase) % 1;
        p.position.y = 1.2 + k * 0.8;
        p.position.x = 0.52 + k * 0.25;
        p.scale.setScalar(0.6 + k * 1.3);
        (p.material as THREE.MeshStandardMaterial).opacity = 0.75 * (1 - k);
      });
      beacon.forEach((b) => (b.scale.setScalar(1 + 0.35 * Math.sin(t * 5))));
      cloths.forEach((cl, i) => {
        const pos = cl.geometry.attributes.position as THREE.BufferAttribute;
        for (let v = 0; v < pos.count; v++) {
          const x = pos.getX(v);
          pos.setZ(v, Math.sin(x * 18 - t * 4 + i) * 0.025 * (x / 0.34));
        }
        pos.needsUpdate = true;
      });
    };
    place(reduce ? 0 : 0.001);
    stage.renderer.shadowMap.needsUpdate = true;
    // Vehicle shadows follow at half the animation rate; the light and buildings never move
    let frames = 0;
    const tick = (t: number) => {
      place(t);
      if (++frames % 2 === 0) stage.renderer.shadowMap.needsUpdate = true;
    };
    if (!reduce) stage.frame.add(tick);

    const hide = stage.reveal(root);
    picks.current = [exp, buy, ru, ...movers.map((m) => m.obj), ...root.children.flatMap((c) => c.children.filter((o) => o instanceof THREE.Sprite))];
    stage.invalidate();
    return () => {
      alive = false;
      stage.frame.delete(tick);
      hide();
      disposeTree(root);
      picks.current = [];
    };
  }, [ready, stageRef, a, theme, reduce]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    const at = [
      { id: "l1", p: new THREE.Vector3((X.exporter + X.buyer) / 2, 0.02, 1.0) },
      { id: "l2", p: new THREE.Vector3((X.buyer + X.russia) / 2, 0.02, 1.0) },
    ];
    const update = () => at.forEach(({ id, p }) => {
      const el = labelEls.current.get(id);
      if (!el) return;
      const { x, y } = stage.toScreen(p);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 0)`;
      el.style.opacity = "1";
    });
    stage.after.add(update);
    stage.invalidate();
    return () => {
      stage.after.delete(update);
    };
  }, [ready, stageRef]);

  const find = (e: PointerEvent, stage: Stage): Pick | null => {
    let o: THREE.Object3D | null = stage.pick(e, picks.current)[0]?.object ?? null;
    while (o && !o.userData.pick) o = o.parent;
    return (o?.userData.pick as Pick | undefined) ?? null;
  };
  usePicking(stageRef, ready, {
    move: (e, stage) => {
      const p = find(e, stage);
      setTip(p ? tipAt(e, stage, <><div className="font-bold">{p.title}</div>{p.lines.filter(Boolean).map((l, i) => <div key={i} className={i ? "text-muted-foreground" : ""}>{l}</div>)}</>) : null);
    },
    leave: () => setTip(null),
  });

  return (
    <Frame3D hostRef={hostRef} stageRef={stageRef} failed={failed} tip={tip} className="h-[230px] bg-[var(--scene-sky-top)] sm:h-[330px]"
      label={`3D illustration: ${q.exporter_name} exports to ${q.company} in ${q.intermediary_name}, with a possible onward route to Russia`}
      hint="Drag to look around · hover a building or vehicle"
      overlay={
        <div className="pointer-events-none absolute inset-0 overflow-hidden max-sm:hidden">
          {labels.map((l) => (
            <div key={l.id} ref={(el) => {
              if (el) labelEls.current.set(l.id, el);
              else labelEls.current.delete(l.id);
            }} className="absolute left-0 top-0 whitespace-nowrap text-[13px] text-muted-foreground opacity-0">{l.text}</div>
          ))}
        </div>
      } />
  );
}
