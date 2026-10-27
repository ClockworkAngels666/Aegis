"use client";

import { geoDistance, geoEquirectangular, geoGraticule10, geoInterpolate, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { Frame3D, type Tip, tipAt, usePicking, useStage } from "@/components/three/frame";
import { Flag, regionName } from "@/components/visuals";
import { CORRIDORS, type Corridor, type CorridorMode, EU27_NUMERIC, INTERMEDIARY_CODES, LEG_COLOR, MARKERS, NUMERIC } from "@/lib/corridors";
import { money } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { canvasTexture, cssVar, disposeTree, flagSrc, loadImage, pageFont, type Stage } from "@/lib/three-stage";
import type { Flows } from "@/lib/types";

type Pt = [number, number];
const DEG = Math.PI / 180;
const SURFACE = 1.004;

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const COUNTRIES = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features;
const INTERMEDIARY_IDS = new Set(INTERMEDIARY_CODES.map((k) => NUMERIC[k]));

/** Longitude/latitude to a point on a sphere, matching three.js sphere UVs (equirectangular). */
function lonLat([lon, lat]: Pt, r = 1): THREE.Vector3 {
  const phi = (90 - lat) * DEG, theta = (lon + 180) * DEG;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** Great-circle points along the corridor; air routes and the direct flow arc above the surface. */
function routePoints(path: Pt[], arc = 0): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  if (arc) {
    const interp = geoInterpolate(path[0], path[1]);
    const lift = 0.006 + geoDistance(path[0], path[1]) * arc;
    for (let i = 0; i <= 48; i++) out.push(lonLat(interp(i / 48) as Pt, SURFACE + lift * Math.sin(Math.PI * (i / 48))));
    return out;
  }
  for (let i = 0; i < path.length - 1; i++) {
    const interp = geoInterpolate(path[i], path[i + 1]);
    const steps = Math.max(2, Math.ceil(geoDistance(path[i], path[i + 1]) / (1.5 * DEG)));
    for (let s = 0; s < steps; s++) out.push(lonLat(interp(s / steps) as Pt, SURFACE));
  }
  out.push(lonLat(path[path.length - 1], SURFACE));
  return out;
}

/** Route points never change, so they are computed once per corridor. */
const POINTS = new Map<string, THREE.Vector3[]>();
function pointsFor(key: string, path: Pt[], arc = 0): THREE.Vector3[] {
  if (!POINTS.has(key)) POINTS.set(key, routePoints(path, arc));
  return POINTS.get(key)!;
}

/**
 * Changes a tube's radius in place. TubeGeometry normals point from the curve outwards, so moving
 * every vertex along its normal resizes the tube without rebuilding it (used by the time-lapse).
 */
function setTubeRadius(obj: THREE.Object3D, radius: number) {
  obj.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (!g || g.userData.radius === undefined || g.userData.radius === radius) return;
    const pos = g.attributes.position as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute;
    const d = radius - g.userData.radius;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * d, pos.getY(i) + nrm.getY(i) * d, pos.getZ(i) + nrm.getZ(i) * d);
    }
    pos.needsUpdate = true;
    g.userData.radius = radius;
    g.computeBoundingSphere();
  });
}

/** A tube along the points; dashed tubes are split into alternating pieces. */
function tube(points: THREE.Vector3[], radius: number, material: THREE.Material, dashed = false): THREE.Object3D {
  if (!dashed) {
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    const geo = new THREE.TubeGeometry(curve, Math.max(24, points.length * 3), radius, 6, false);
    geo.userData.radius = radius;
    return new THREE.Mesh(geo, material);
  }
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const n = Math.max(8, Math.round(curve.getLength() / 0.035));
  for (let i = 0; i < n; i += 2) {
    const piece = Array.from({ length: 5 }, (_, k) => curve.getPointAt((i + k / 4) / n));
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(piece), 6, radius, 6, false);
    geo.userData.radius = radius;
    g.add(new THREE.Mesh(geo, material));
  }
  return g;
}

function globeTexture(fill: (id: string) => string): THREE.CanvasTexture {
  const W = 4096, H = 2048;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const path = geoPath(geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]), ctx);
  ctx.fillStyle = cssVar("--map-ocean");
  ctx.fillRect(0, 0, W, H);
  ctx.beginPath();
  path(geoGraticule10());
  ctx.strokeStyle = cssVar("--map-grat");
  ctx.lineWidth = 2;
  ctx.stroke();
  for (const f of COUNTRIES) {
    ctx.beginPath();
    path(f);
    ctx.fillStyle = fill(String(f.id));
    ctx.fill();
  }
  ctx.beginPath();
  COUNTRIES.forEach((f) => path(f));
  ctx.strokeStyle = cssVar("--map-border");
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  ctx.stroke();
  // "RUSSIA", stretched so it reads at normal proportions at 62°N on the sphere
  ctx.save();
  ctx.translate(((92 + 180) / 360) * W, ((90 - 62) / 180) * H);
  ctx.scale(1 / Math.cos(62 * DEG), 1);
  ctx.font = `700 60px ${pageFont()}`;
  ctx.letterSpacing = "22px";
  ctx.textAlign = "center";
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = cssVar("--map-russia-text");
  ctx.fillText("RUSSIA", 0, 0);
  ctx.restore();
  return canvasTexture(c);
}

function flagSprite(code: string, alive: () => boolean, stage: Stage): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 136;
  c.height = 104;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = canvasTexture(c);
  void loadImage(flagSrc(code)).then((img) => {
    if (!img || !alive()) return;
    ctx.drawImage(img, 5, 5, 126, 94);
    ctx.strokeStyle = "rgba(17,19,24,0.45)";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
    tex.needsUpdate = true;
    stage.invalidate();
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  s.center.set(0.5, 0);
  return s;
}

const ATMOSPHERE = {
  vertexShader: `varying vec3 vN; varying vec3 vV;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 color; uniform float strength; varying vec3 vN; varying vec3 vV;
    void main() { float k = clamp(-dot(vN, vV) / 0.5, 0.0, 1.0); gl_FragColor = vec4(color, pow(k, 2.2) * strength); }`,
};

const UNIT_SPHERE = new THREE.Sphere(new THREE.Vector3(), 1);
const HIT = new THREE.Vector3();
const RADIUS: Record<CorridorMode, number> = { sea: 0.0042, rail: 0.0046, road: 0.0038, air: 0.0034 };
const SPEED: Record<CorridorMode, number> = { sea: 0.055, rail: 0.065, road: 0.06, air: 0.15 };
const MODE_NAME: Record<CorridorMode, string> = { sea: "Sea freight", rail: "Rail", road: "Road", air: "Air cargo" };

/** Named stops on the corridors serving this intermediary (Moscow has its own label). */
function stopsFor(intermediary: string): Map<string, Pt> {
  const out = new Map<string, Pt>();
  CORRIDORS.filter((c) => c.serves.includes(intermediary)).forEach((c) => c.stops.forEach(([name, lon, lat]) => {
    if (name !== "Moscow" && !name.startsWith("↓")) out.set(name, [lon, lat]);
  }));
  return out;
}

/** Pin height and flag width (world units) for a country marker. */
function markerSize(code: string, exporter: string, intermediary: string): { pin: number; flag: number } {
  if (code === intermediary) return { pin: 0.05, flag: 0.085 };
  if (code === "RU" || code === exporter) return { pin: 0.04, flag: 0.068 };
  return { pin: 0.028, flag: 0.05 };
}

/** HTML labels: country labels sit above their flag (`lift`), stop labels above their dot. */
function labelSpecs(exporter: string, intermediary: string) {
  const flagged = (id: string, code: string) => {
    const m = markerSize(code, exporter, intermediary);
    return { id, at: MARKERS[code]?.at ?? ([10, 51] as Pt), radius: 1 + m.pin, lift: m.flag * 0.765 + 0.006, strong: true };
  };
  return [
    flagged("exp", exporter),
    flagged("int", intermediary),
    flagged("ru", "RU"),
    ...[...stopsFor(intermediary).entries()].map(([name, at]) => ({ id: `s:${name}`, at, radius: SURFACE, lift: 0.012, strong: false })),
  ];
}

type Pick =
  | { kind: "country"; code: string }
  | { kind: "route"; corridor: Corridor }
  | { kind: "stop"; name: string }
  | { kind: "direct" };

export function Globe3D({ exporter, exporterName, intermediary, intermediaryName, onSelect, flows, yi, hover }: {
  exporter: string;
  exporterName: string;
  intermediary: string;
  intermediaryName: string;
  onSelect: (code: string) => void;
  flows: Flows | null;
  yi: number;
  hover: string | null;
}) {
  const { hostRef, stageRef, ready, failed, reduce } = useStage({ position: [0, 0.9, 2.6], minDistance: 1.35, maxDistance: 4.2 });
  const { theme } = useTheme();
  const [tip, setTip] = useState<Tip | null>(null);
  const pickables = useRef<THREE.Object3D[]>([]);
  // Route tubes for the time-lapse and hover, and their points for picking (cheaper than ray-testing tubes)
  const flowPicks = useRef<{ points: THREE.Vector3[]; pick: Pick }[]>([]);
  const routeMeshes = useRef(new Map<string, THREE.Object3D>());
  const directArc = useRef<THREE.Object3D | null>(null);
  const labelEls = useRef(new Map<string, HTMLDivElement>());
  const flownTo = useRef<string | null>(null);

  const text: Record<string, string> = { exp: exporterName, int: intermediaryName, ru: "Moscow" };
  const labels = labelSpecs(exporter, intermediary).map((l) => ({ ...l, text: text[l.id] ?? l.id.slice(2) }));

  /* ---------- base layer: globe, atmosphere, flags, stops ---------- */
  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    let alive = true;
    const g = new THREE.Group();
    const exporterIds = exporter.startsWith("EU") ? EU27_NUMERIC : [NUMERIC[exporter]];
    const fill = (id: string) => {
      if (id === NUMERIC[intermediary]) return cssVar("--map-inter-active");
      if (id === NUMERIC.RU || id === NUMERIC.BY) return cssVar("--map-ru");
      if (exporterIds.includes(id)) return cssVar("--map-exporter");
      if (INTERMEDIARY_IDS.has(id)) return cssVar("--map-inter");
      if (EU27_NUMERIC.includes(id)) return cssVar("--map-eu");
      return cssVar("--map-land");
    };
    const dark = theme === "dark";
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.MeshLambertMaterial({ map: globeTexture(fill) })));
    g.add(new THREE.AmbientLight(0xffffff, dark ? 2.3 : 2.5));
    const sun = new THREE.DirectionalLight(0xffffff, dark ? 1.25 : 0.95);
    sun.position.set(-1.6, 1.8, 2.4);
    stage.camera.add(sun);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.13, 96, 64), new THREE.ShaderMaterial({
      ...ATMOSPHERE,
      uniforms: { color: { value: new THREE.Color(dark ? "#3987e5" : "#2a78d6") }, strength: { value: dark ? 0.55 : 0.32 } },
      side: THREE.BackSide, transparent: true, depthWrite: false,
    }));
    g.add(halo);

    const picks: THREE.Object3D[] = [];
    const codes = [...INTERMEDIARY_CODES, "RU", exporter];
    for (const code of codes) {
      const m = MARKERS[code];
      if (!m) continue;
      const { pin: h, flag: w } = markerSize(code, exporter, intermediary);
      const base = lonLat(m.at, 1);
      const top = lonLat(m.at, 1 + h);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, h, 6),
        new THREE.MeshBasicMaterial({ color: cssVar("--map-label") }));
      pin.position.copy(base.clone().lerp(top, 0.5));
      pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), base.clone().normalize());
      g.add(pin);
      const s = flagSprite(code, () => alive, stage);
      s.scale.set(w, w * 0.765, 1);
      s.position.copy(top);
      s.userData.pick = { kind: "country", code } satisfies Pick;
      g.add(s);
      picks.push(s);
    }
    for (const [name, at] of stopsFor(intermediary)) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 12, 8), new THREE.MeshBasicMaterial({ color: cssVar("--map-label") }));
      dot.position.copy(lonLat(at, SURFACE + 0.002));
      dot.userData.pick = { kind: "stop", name } satisfies Pick;
      g.add(dot);
      picks.push(dot);
    }
    stage.scene.add(g);
    pickables.current = picks;
    stage.invalidate();

    // Turn the globe to face the corridor (exporter, intermediary and Moscow)
    const centre = ["RU", intermediary, exporter].reduce((v, k) => (MARKERS[k] ? v.add(lonLat(MARKERS[k].at)) : v), new THREE.Vector3());
    const pos = centre.normalize().multiplyScalar(2.75 * stage.boost(1.15)).add(new THREE.Vector3(0, 0.3, 0));
    stage.setHome(pos, new THREE.Vector3());
    const key = `${exporter}|${intermediary}`;
    if (flownTo.current !== key) stage.fly(pos, new THREE.Vector3(), flownTo.current ? 1.2 : 0);
    flownTo.current = key;

    return () => {
      alive = false;
      stage.camera.remove(sun);
      sun.dispose();
      stage.scene.remove(g);
      disposeTree(g);
      pickables.current = [];
    };
  }, [ready, stageRef, exporter, intermediary, theme]);

  /* ---------- flow layer: corridors, direct arc, moving shipments (built once per corridor) ---------- */
  const hasFlows = flows !== null;
  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    const g = new THREE.Group();
    const meshes = new Map<string, THREE.Object3D>();
    const picks: { points: THREE.Vector3[]; pick: Pick }[] = [];
    const shipments: { mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; speed: number; phase: number }[] = [];
    const boxGeo = new THREE.BoxGeometry(0.008, 0.008, 0.02);
    const planeGeo = new THREE.ConeGeometry(0.006, 0.024, 4).rotateX(Math.PI / 2);
    const shipMat = new THREE.MeshBasicMaterial({ color: "#f5b83d" });
    g.add(new THREE.Mesh(boxGeo, shipMat), new THREE.Mesh(planeGeo, shipMat)); // owned by the group for disposal
    g.children.forEach((c) => (c.visible = false));

    for (const c of CORRIDORS) {
      const active = c.serves.includes(intermediary);
      const mat = new THREE.MeshBasicMaterial({
        color: LEG_COLOR[c.leg], transparent: true,
        opacity: active ? (c.leg === "restricted" ? 0.75 : 1) : hasFlows && c.leg === "inbound" ? 0.45 : 0.28,
      });
      const pts = pointsFor(c.id, c.path, c.mode === "air" ? 0.2 : 0);
      const obj = tube(pts, Math.max(RADIUS[c.mode] * (active ? 1 : 0.45), 0.0013), mat, active && c.leg === "restricted");
      obj.userData = { corridor: c, active };
      g.add(obj);
      meshes.set(c.id, obj);
      picks.push({ points: pts, pick: { kind: "route", corridor: c } });
      if (active && c.leg !== "restricted") {
        const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
        const n = Math.min(4, Math.max(1, Math.round(curve.getLength() / 0.45)));
        for (let i = 0; i < n; i++) {
          const mesh = new THREE.Mesh(c.mode === "air" ? planeGeo : boxGeo, shipMat);
          g.add(mesh);
          shipments.push({ mesh, curve, speed: SPEED[c.mode] / curve.getLength(), phase: i / n });
        }
      }
    }

    const from = MARKERS[exporter]?.at;
    directArc.current = null;
    if (hasFlows && from) {
      const pts = pointsFor(`direct:${exporter}`, [from, MARKERS.RU.at], 0.5);
      const obj = tube(pts, 0.0012, new THREE.MeshBasicMaterial({ color: cssVar("--series-2"), transparent: true, opacity: 0.9 }), true);
      g.add(obj);
      directArc.current = obj;
      picks.push({ points: pts, pick: { kind: "direct" } });
    }

    const up = new THREE.Vector3(), ahead = new THREE.Vector3();
    const place = (t: number) => {
      for (const sh of shipments) {
        const u = (((sh.phase + t * sh.speed) % 1) + 1) % 1;
        sh.curve.getPointAt(u, sh.mesh.position);
        sh.curve.getTangentAt(u, ahead);
        sh.mesh.up.copy(up.copy(sh.mesh.position).normalize());
        sh.mesh.lookAt(ahead.add(sh.mesh.position));
      }
    };
    place(0);
    const animate = (t: number) => place(t);
    if (!reduce && shipments.length) stage.frame.add(animate);

    stage.scene.add(g);
    routeMeshes.current = meshes;
    flowPicks.current = picks;
    stage.invalidate();
    return () => {
      stage.frame.delete(animate);
      stage.scene.remove(g);
      disposeTree(g);
      routeMeshes.current = new Map();
      flowPicks.current = [];
      directArc.current = null;
    };
  }, [ready, stageRef, exporter, intermediary, hasFlows, reduce, theme]);

  /* ---------- time-lapse: line widths follow the year's export volumes (no rebuild) ---------- */
  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage || !flows) return;
    const peak = Math.max(1, ...Object.values(flows.partners).flat());
    const vol = (iso: string) => {
      const v = flows.partners[iso]?.[yi];
      return v === undefined ? undefined : 0.35 + 3.4 * Math.sqrt(v / peak);
    };
    routeMeshes.current.forEach((obj) => {
      const c = obj.userData.corridor as Corridor;
      if (c.leg !== "inbound") return;
      const scales = c.serves.map(vol).filter((x): x is number => x !== undefined);
      const scale = scales.length ? 0.45 + 0.5 * Math.max(...scales) : 1;
      setTubeRadius(obj, Math.max(RADIUS[c.mode] * scale * (obj.userData.active ? 1 : 0.45), 0.0013));
    });
    if (directArc.current) setTubeRadius(directArc.current, 0.0012 + 0.0075 * Math.sqrt((flows.partners.RU?.[yi] ?? 0) / peak));
    stage.invalidate();
  }, [ready, stageRef, flows, yi, exporter, intermediary, hasFlows, theme]);

  /* ---------- highlight the corridor hovered in the list ---------- */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    routeMeshes.current.forEach((o, id) => o.scale.setScalar(id === hover ? 1.012 : 1));
    routeMeshes.current.forEach((o, id) => o.traverse((m) => {
      const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (mat && "color" in mat) mat.color.set(id === hover ? "#f5b83d" : LEG_COLOR[CORRIDORS.find((c) => c.id === id)!.leg]);
    }));
    stage.invalidate();
  }, [hover, stageRef, ready, yi, intermediary]);

  /* ---------- HTML labels that follow the globe ---------- */
  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    const points = labelSpecs(exporter, intermediary)
      .map((l) => ({ ...l, p: lonLat(l.at, l.radius), n: lonLat(l.at).normalize() }));
    const cam = new THREE.Vector3(), up = new THREE.Vector3(), q = new THREE.Vector3();
    const update = () => {
      stage.camera.getWorldPosition(cam);
      up.set(0, 1, 0).applyQuaternion(stage.camera.quaternion);
      const shown: { x: number; y: number }[] = [];
      for (const { id, p, n, lift, strong } of points) { // country labels come first and win
        const el = labelEls.current.get(id);
        if (!el) continue;
        const facing = n.dot(q.copy(cam).sub(p).normalize());
        const { x, y } = stage.toScreen(q.copy(p).addScaledVector(up, lift));
        const clash = !strong && shown.some((o) => Math.abs(o.x - x) < 62 && Math.abs(o.y - y) < 17);
        const visible = facing > 0.12 && !clash;
        if (visible) shown.push({ x, y });
        el.style.opacity = visible ? "1" : "0";
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      }
    };
    stage.after.add(update);
    stage.invalidate();
    return () => {
      stage.after.delete(update);
    };
  }, [ready, stageRef, exporter, intermediary]);

  const describe = (p: Pick): ReactNode => {
    const unit = flows?.unit ?? "EUR";
    const year = flows?.years[yi];
    if (p.kind === "country") {
      const v = flows?.partners[p.code]?.[yi];
      if (p.code === exporter) return <><div className="flex items-center gap-1.5 font-bold"><Flag code={p.code} size={14} />{exporterName}</div><div className="text-muted-foreground">Exporter</div></>;
      return (
        <>
          <div className="flex items-center gap-1.5 font-bold"><Flag code={p.code} size={14} />{regionName(p.code)}</div>
          {v !== undefined && <div>{p.code === "RU" ? "Direct exports" : "Exports"} from {exporterName}, {year}: {money(v, unit)}</div>}
          {p.code !== "RU" && <div className="text-muted-foreground">{p.code === intermediary ? "Selected intermediary" : "Click to assess this country"}</div>}
        </>
      );
    }
    if (p.kind === "route") {
      return (
        <>
          <div className="font-bold">{p.corridor.name}</div>
          <div className="text-muted-foreground">{MODE_NAME[p.corridor.mode]} · {p.corridor.leg === "restricted" ? "restricted since 2022" : p.corridor.leg === "inbound" ? "EU → intermediary" : "onward to Russia"}</div>
          <div className="mt-1">{p.corridor.note}</div>
        </>
      );
    }
    if (p.kind === "stop") return <div className="font-bold">{p.name}</div>;
    return <><div className="font-bold">Direct exports to Russia</div><div>{year}: {money(flows?.partners.RU?.[yi] ?? 0, unit)}</div></>;
  };

  const pickAt = (e: PointerEvent, stage: Stage): Pick | null => {
    const hit = stage.pick(e, pickables.current)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.pick) o = o.parent;
    if (o) return o.userData.pick as Pick;
    // Routes: nearest route point to the pointer ray, on the visible side of the globe
    const ray = stage.rayAt(e);
    const front = ray.intersectSphere(UNIT_SPHERE, HIT);
    const limit = front ? ray.origin.distanceTo(HIT) + 0.03 : Infinity;
    const tol = 0.024 * (stage.camera.position.length() / 2.75); // about 6 px at the default zoom
    let best: Pick | null = null, bestD = tol * tol;
    for (const { points, pick } of flowPicks.current) {
      for (const pt of points) {
        if (ray.origin.distanceTo(pt) > limit) continue;
        const d = ray.distanceSqToPoint(pt);
        if (d < bestD) {
          bestD = d;
          best = pick;
        }
      }
    }
    return best;
  };

  usePicking(stageRef, ready, {
    move: (e, stage) => {
      const p = pickAt(e, stage);
      stage.renderer.domElement.style.cursor = p?.kind === "country" && p.code !== "RU" && p.code !== exporter && p.code !== intermediary ? "pointer" : "";
      setTip(p ? tipAt(e, stage, describe(p)) : null);
    },
    click: (e, stage) => {
      const p = pickAt(e, stage);
      if (p?.kind === "country" && INTERMEDIARY_CODES.includes(p.code) && p.code !== intermediary) {
        setTip(null);
        onSelect(p.code);
      }
    },
    leave: () => setTip(null),
  });

  return (
    <Frame3D hostRef={hostRef} stageRef={stageRef} failed={failed} tip={tip} className="h-[380px] bg-card sm:h-[520px]"
      label={`3D globe of freight corridors from ${exporterName} to ${intermediaryName} and on to Russia`}
      overlay={
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {labels.map((l) => (
            <div key={l.id} ref={(el) => {
              if (el) labelEls.current.set(l.id, el);
              else labelEls.current.delete(l.id);
            }}
              className={l.strong
                ? "absolute left-0 top-0 whitespace-nowrap text-[13px] font-bold text-[var(--map-label)] opacity-0 transition-opacity duration-200 [text-shadow:0_0_3px_var(--map-halo),0_0_3px_var(--map-halo),0_0_2px_var(--map-halo)]"
                : "absolute left-0 top-0 whitespace-nowrap text-[11px] text-[var(--map-label)] opacity-0 transition-opacity duration-200 [text-shadow:0_0_3px_var(--map-halo),0_0_2px_var(--map-halo)]"}>
              {l.text}
            </div>
          ))}
          {flows && <div className="absolute bottom-7 left-3 text-[40px] font-bold leading-none text-[var(--map-label)] opacity-20 tabular">{flows.years[yi]}</div>}
        </div>
      } />
  );
}
