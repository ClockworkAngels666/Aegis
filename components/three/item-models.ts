/**
 * Procedural 3D models of the battlefield-item families (one per drawing in product-art.tsx).
 * Illustrative only: generic shapes, not to scale, not any specific product. Every mesh carries
 * `userData.part` (name) and `userData.note` so the viewer can label it on hover.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeStatic } from "@/lib/three-merge";

type V3 = [number, number, number];
export interface Model {
  group: THREE.Group;
  /** Per-frame animation (seconds since start). */
  tick?: (t: number) => void;
}

const DARK = "#2f3e4e", BLACK = "#1c2228", STEEL = "#9aa5b1", CHROME = "#d9dee4", ALU = "#c4cad1";
const COPPER = "#c27c3a", GOLD = "#d6a742", GREEN = "#2f7d4f", GLASS = "#6f9fd6", BRASS = "#c9a14a";

function mat(color: string, o: { metal?: number; rough?: number; glow?: string; opacity?: number; map?: THREE.Texture } = {}) {
  return new THREE.MeshStandardMaterial({
    color, metalness: o.metal ?? 0, roughness: o.rough ?? 0.55, map: o.map ?? null,
    emissive: o.glow ?? "#000000", emissiveIntensity: o.glow ? 1 : 0,
    transparent: o.opacity !== undefined, opacity: o.opacity ?? 1,
  });
}
const metal = (color = STEEL, rough = 0.28) => mat(color, { metal: 0.9, rough });

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], part: string,
  note: string, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(...p);
  mesh.rotation.set(...r);
  mesh.userData = { part, note };
  parent.add(mesh);
  return mesh;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const rbox = (w: number, h: number, d: number, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, r);
const cyl = (rt: number, rb: number, h: number, seg = 32) => new THREE.CylinderGeometry(rt, rb, h, seg);

function canvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ models */

function chip(g: THREE.Group): Model {
  add(g, box(2.3, 0.06, 2.3), mat(GREEN, { rough: 0.7 }), "Circuit board", "The chip is soldered onto a printed circuit board.", [0, -0.03, 0]);
  add(g, rbox(1.4, 0.16, 1.4, 0.03), mat(DARK, { rough: 0.75 }), "Moulded package", "Epoxy housing that protects the silicon.", [0, 0.13, 0]);
  add(g, box(0.52, 0.02, 0.52), mat("#3a4f93", { metal: 0.7, rough: 0.2 }), "Silicon die (decapped)",
    "The integrated circuit itself. Its performance decides whether dual-use controls apply.", [0, 0.215, 0]);
  add(g, cyl(0.05, 0.05, 0.01), mat("#93a0ad"), "Pin-1 marker", "Orientation mark for assembly.", [-0.52, 0.215, -0.52]);
  const pinMat = metal(CHROME, 0.25);
  for (let i = 0; i < 12; i++) {
    const t = -0.6 + (i * 1.2) / 11;
    for (const [ax, sign] of [["x", 1], ["x", -1], ["z", 1], ["z", -1]] as const) {
      const at = (d: number): V3 => (ax === "x" ? [sign * d, 0, t] : [t, 0, sign * d]);
      const seg = (len: number, d: number, y: number, h: number) => {
        const [x, , z] = at(d);
        add(g, ax === "x" ? box(len, h, 0.045) : box(0.045, h, len), pinMat, "Lead-frame pins", "Gull-wing leads that carry signals to the board.", [x, y, z]);
      };
      seg(0.14, 0.77, 0.1, 0.025);
      seg(0.025, 0.84, 0.055, 0.1);
      seg(0.1, 0.89, 0.01, 0.025);
    }
  }
  return { group: g };
}

function bearing(g: THREE.Group): Model {
  const ring = (rIn: number, rOut: number, h: number) =>
    new THREE.LatheGeometry([[rIn, -h / 2], [rOut, -h / 2], [rOut, h / 2], [rIn, h / 2], [rIn, -h / 2]].map(([x, y]) => new THREE.Vector2(x, y)), 64);
  const tilt = new THREE.Group();
  tilt.rotation.x = -1.05;
  g.add(tilt);
  add(tilt, ring(0.73, 0.95, 0.4), metal(STEEL, 0.22), "Outer race", "Hardened steel ring pressed into the housing.");
  const inner = new THREE.Group();
  inner.userData.dynamic = true;
  tilt.add(inner);
  add(inner, ring(0.3, 0.5, 0.4), metal(STEEL, 0.22), "Inner race", "Ring fitted on the rotating shaft.");
  const balls = new THREE.Group();
  balls.userData.dynamic = true;
  tilt.add(balls);
  const ballMat = metal(CHROME, 0.08);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    add(balls, new THREE.SphereGeometry(0.115, 24, 16), ballMat, "Steel balls",
      "Precision rolling elements. Bearings are on the list because they go into engines, drones and missiles.", [0.615 * Math.cos(a), 0, 0.615 * Math.sin(a)]);
  }
  add(balls, new THREE.TorusGeometry(0.615, 0.025, 8, 64), metal(BRASS, 0.35), "Cage", "Keeps the balls evenly spaced.", [0, 0, 0], [Math.PI / 2, 0, 0]);
  return { group: g, tick: (t) => { inner.rotation.y = t * 1.6; balls.rotation.y = t * 0.8; } };
}

function radio(g: THREE.Group): Model {
  add(g, rbox(1.7, 0.32, 1.05, 0.06), mat(DARK, { rough: 0.6 }), "Enclosure", "Router or radio housing.", [0, 0.16, 0]);
  const led = mat("#3be27f", { glow: "#2bd46e" });
  for (let i = 0; i < 5; i++) add(g, new THREE.SphereGeometry(0.028, 12, 8), led, "Status LEDs", "Link and power indicators.", [-0.5 + i * 0.16, 0.2, 0.53]);
  for (let i = 0; i < 4; i++) add(g, box(0.17, 0.12, 0.04), mat(BLACK), "Ethernet ports", "Network interfaces.", [-0.45 + i * 0.27, 0.15, -0.53]);
  for (let i = 0; i < 7; i++) add(g, box(0.9, 0.012, 0.035), mat(BLACK), "Cooling vents", "Ventilation slots.", [0.1, 0.322, -0.3 + i * 0.1]);
  const antMat = mat(BLACK, { rough: 0.45 });
  [[-0.7, 0.25], [0, -0.1], [0.7, -0.25]].forEach(([x, tiltZ]) => {
    const a = new THREE.Group();
    a.position.set(x, 0.33, -0.45);
    a.rotation.set(-0.18, 0, tiltZ);
    g.add(a);
    add(a, cyl(0.06, 0.06, 0.1, 16), antMat, "Antennas", "Wireless antennas (Wi-Fi or cellular).", [0, 0.05, 0]);
    add(a, cyl(0.03, 0.045, 0.85, 16), antMat, "Antennas", "Wireless antennas (Wi-Fi or cellular).", [0, 0.52, 0]);
  });
  return { group: g };
}

function navigation(g: THREE.Group): Model {
  add(g, box(1.5, 0.06, 1.5), mat(GREEN, { rough: 0.7 }), "Circuit board", "Receiver module board.", [0, 0.03, 0]);
  add(g, box(0.8, 0.14, 0.8), mat("#d6c8a6", { rough: 0.8 }), "Ceramic patch antenna", "Receives satellite navigation signals (GNSS).", [-0.2, 0.13, -0.15]);
  add(g, box(0.6, 0.012, 0.6), metal(CHROME, 0.3), "Ceramic patch antenna", "Receives satellite navigation signals (GNSS).", [-0.2, 0.206, -0.15]);
  add(g, box(0.45, 0.12, 0.38), metal(ALU, 0.35), "RF shield can", "Screens the radio-frequency front end.", [0.45, 0.12, 0.45]);
  add(g, cyl(0.075, 0.075, 0.3, 24), metal(GOLD, 0.3), "SMA connector", "Socket for an external antenna.", [0.85, 0.12, -0.3], [0, 0, Math.PI / 2]);
  add(g, cyl(0.1, 0.1, 0.06, 6), metal(GOLD, 0.3), "SMA connector", "Socket for an external antenna.", [0.72, 0.12, -0.3], [0, 0, Math.PI / 2]);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = add(g, new THREE.TorusGeometry(0.3, 0.012, 8, 64), mat(GLASS, { glow: "#2a78d6", opacity: 0.6 }), "Satellite signal",
      "Navigation satellites broadcast timing signals; the module computes position from them.", [-0.2, 0.3, -0.15], [Math.PI / 2, 0, 0]);
    m.userData.dynamic = true;
    rings.push(m);
  }
  return {
    group: g,
    tick: (t) => rings.forEach((r, i) => {
      const k = ((t * 0.45 + i / 3) % 1);
      r.position.y = 0.3 + k * 0.9;
      r.scale.setScalar(0.5 + k * 1.4);
      (r.material as THREE.MeshStandardMaterial).opacity = 0.7 * (1 - k);
    }),
  };
}

function camera(g: THREE.Group): Model {
  add(g, rbox(0.95, 0.75, 1.0, 0.07), mat(DARK, { rough: 0.5 }), "Camera body", "Houses the image sensor and electronics.", [0, 0.55, 0]);
  add(g, cyl(0.33, 0.33, 0.55, 48), mat(BLACK, { rough: 0.45 }), "Lens", "Optics; thermal and night-vision cameras are controlled separately.", [0, 0.55, 0.75], [Math.PI / 2, 0, 0]);
  add(g, cyl(0.36, 0.36, 0.06, 48), metal(ALU), "Lens", "Optics; thermal and night-vision cameras are controlled separately.", [0, 0.55, 1.03], [Math.PI / 2, 0, 0]);
  add(g, cyl(0.28, 0.28, 0.02, 48), mat(GLASS, { metal: 0.4, rough: 0.05 }), "Lens", "Optics; thermal and night-vision cameras are controlled separately.", [0, 0.55, 1.06], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 6; i++) add(g, box(0.035, 0.6, 0.18), metal(ALU, 0.4), "Heat sink", "Cools the sensor.", [-0.3 + i * 0.12, 0.55, -0.58]);
  add(g, cyl(0.09, 0.09, 0.2, 24), metal(STEEL), "Mount", "Tripod or turret mount.", [0, 0.08, 0]);
  add(g, box(0.7, 0.04, 0.7), metal(STEEL), "Mount", "Tripod or turret mount.", [0, -0.02, 0]);
  return { group: g };
}

function capacitor(g: THREE.Group): Model {
  add(g, cyl(0.45, 0.45, 1.3, 48), mat("#2a78d6", { rough: 0.35 }), "Aluminium can (sleeved)", "Electrolytic capacitor: stores charge in power circuits.", [0, 0.95, 0]);
  add(g, new THREE.CylinderGeometry(0.456, 0.456, 1.22, 24, 1, true, -0.35, 0.7), mat("#d6e6fa", { rough: 0.35 }), "Polarity stripe (−)", "Marks the negative lead.", [0, 0.95, 0]);
  add(g, cyl(0.43, 0.43, 0.02, 48), metal(ALU, 0.35), "Safety vent", "Scored top that opens under pressure.", [0, 1.61, 0]);
  add(g, box(0.6, 0.012, 0.03), mat("#7d8793"), "Safety vent", "Scored top that opens under pressure.", [0, 1.625, 0]);
  add(g, box(0.03, 0.012, 0.6), mat("#7d8793"), "Safety vent", "Scored top that opens under pressure.", [0, 1.625, 0]);
  add(g, cyl(0.03, 0.03, 0.32, 12), metal(CHROME), "Leads", "Solder leads.", [-0.17, 0.14, 0]);
  add(g, cyl(0.03, 0.03, 0.32, 12), metal(CHROME), "Leads", "Solder leads.", [0.17, 0.14, 0]);
  return { group: g };
}

function transistor(g: THREE.Group): Model {
  add(g, rbox(0.95, 0.85, 0.36, 0.03), mat(BLACK, { rough: 0.7 }), "Epoxy body", "Power transistor (TO-220 package).", [0, 0.95, 0.04]);
  const shape = new THREE.Shape();
  shape.moveTo(-0.48, 0);
  shape.lineTo(0.48, 0);
  shape.lineTo(0.48, 0.62);
  shape.lineTo(-0.48, 0.62);
  shape.lineTo(-0.48, 0);
  const hole = new THREE.Path();
  hole.absarc(0, 0.33, 0.15, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  add(g, new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false, curveSegments: 32 }), metal(CHROME, 0.25), "Heat-sink tab",
    "Metal tab bolted to a heat sink.", [0, 1.3, -0.17]);
  [-0.28, 0, 0.28].forEach((x) => add(g, box(0.08, 0.75, 0.035), metal(CHROME, 0.25), "Leads (gate, drain, source)", "Three terminals.", [x, 0.17, 0.04]));
  return { group: g };
}

function connector(g: THREE.Group): Model {
  const r = new THREE.Group();
  r.rotation.z = Math.PI / 2;
  r.position.y = 0.6;
  g.add(r);
  const olive = mat("#6e7a55", { metal: 0.6, rough: 0.4 });
  add(r, cyl(0.42, 0.42, 1.0, 48), olive, "Connector shell", "Rugged circular connector (military-standard style).", [0, 0.15, 0]);
  add(r, cyl(0.53, 0.53, 0.38, 48), olive, "Coupling nut", "Screws onto the mating plug.", [0, -0.2, 0]);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    add(r, box(0.05, 0.36, 0.05), olive, "Coupling nut", "Screws onto the mating plug.", [0.54 * Math.cos(a), -0.2, 0.54 * Math.sin(a)], [0, -a, 0]);
  }
  add(r, rbox(1.2, 0.08, 1.2, 0.03), olive, "Mounting flange", "Bolts the connector to an equipment panel.", [0, 0.25, 0]);
  add(r, cyl(0.36, 0.36, 0.02, 48), mat(BLACK), "Contacts", "Gold-plated pins.", [0, 0.66, 0]);
  [[0, 0], [0.18, 0], [-0.18, 0], [0, 0.18], [0, -0.18], [0.13, 0.13], [-0.13, -0.13]].forEach(([x, z]) =>
    add(r, cyl(0.03, 0.03, 0.1, 12), metal(GOLD, 0.25), "Contacts", "Gold-plated pins.", [x, 0.7, z]));
  return { group: g };
}

function computer(g: THREE.Group): Model {
  add(g, rbox(1.6, 0.12, 1.1, 0.04), mat("#3a434d", { rough: 0.6 }), "Chassis", "Rugged laptop or field computer.", [0, 0.06, 0]);
  const keyMat = mat(BLACK, { rough: 0.6 });
  for (let row = 0; row < 4; row++) for (let col = 0; col < 12; col++) {
    add(g, box(0.085, 0.025, 0.085), keyMat, "Keyboard", "Input.", [-0.58 + col * 0.105, 0.13, -0.05 + row * 0.105]);
  }
  const lid = new THREE.Group();
  lid.position.set(0, 0.12, -0.52);
  lid.rotation.x = -0.35;
  g.add(lid);
  add(lid, rbox(1.6, 1.0, 0.06, 0.03), mat("#3a434d", { rough: 0.6 }), "Chassis", "Rugged laptop or field computer.", [0, 0.5, 0]);
  const screen = canvas(512, 320, (ctx) => {
    ctx.fillStyle = "#0e1b2c";
    ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = "#1f3a5c";
    for (let x = 0; x < 512; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 320); ctx.stroke(); }
    for (let y = 0; y < 320; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    ctx.strokeStyle = "#3987e5";
    ctx.lineWidth = 5;
    ctx.beginPath();
    [40, 60, 55, 90, 140, 130, 190, 240, 230, 270].forEach((v, i) => (i ? ctx.lineTo(30 + i * 50, 300 - v) : ctx.moveTo(30, 300 - v)));
    ctx.stroke();
  });
  add(lid, new THREE.PlaneGeometry(1.42, 0.86), new THREE.MeshStandardMaterial({ map: screen, emissive: "#ffffff", emissiveMap: screen, emissiveIntensity: 0.9 }),
    "Display", "Screen.", [0, 0.5, 0.031]);
  return { group: g };
}

function converter(g: THREE.Group): Model {
  add(g, box(1.7, 0.06, 1.15), mat(GREEN, { rough: 0.7 }), "Circuit board", "Power-supply board.", [0, 0.03, 0]);
  add(g, new THREE.TorusGeometry(0.3, 0.13, 20, 48), metal(COPPER, 0.35), "Toroidal transformer", "Converts voltage; copper windings on a ring core.", [-0.4, 0.2, 0], [Math.PI / 2, 0, 0]);
  add(g, box(0.75, 0.08, 0.6), metal(ALU, 0.4), "Heat sink", "Cools the power transistors.", [0.4, 0.1, 0]);
  for (let i = 0; i < 9; i++) add(g, box(0.035, 0.45, 0.6), metal(ALU, 0.4), "Heat sink", "Cools the power transistors.", [0.08 + i * 0.08, 0.35, 0]);
  [[-0.65, 0.42], [-0.15, 0.42]].forEach(([x, z]) => add(g, cyl(0.1, 0.1, 0.32, 24), mat("#2a78d6", { rough: 0.35 }), "Capacitors", "Smooth the output.", [x, 0.22, z]));
  return { group: g };
}

function drone(g: THREE.Group): Model {
  add(g, rbox(0.55, 0.2, 0.9, 0.07), mat(DARK, { rough: 0.5 }), "Fuselage", "Battery, flight controller and radio.", [0, 0.55, 0]);
  const props: THREE.Group[] = [];
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => {
    const a = Math.atan2(sz, sx);
    add(g, box(0.85, 0.05, 0.07), mat(BLACK), "Arms", "Carbon-fibre arms.", [sx * 0.3, 0.55, sz * 0.3], [0, -a, 0]);
    const x = sx * 0.62, z = sz * 0.62;
    add(g, cyl(0.09, 0.09, 0.12, 24), metal(STEEL), "Motors", "Brushless motors.", [x, 0.62, z]);
    const p = new THREE.Group();
    p.userData.dynamic = true;
    p.position.set(x, 0.7, z);
    g.add(p);
    const pm = mat("#d6dbe1", { opacity: 0.85, rough: 0.4 });
    add(p, box(0.75, 0.012, 0.07), pm, "Propellers", "Spinning rotors.");
    props.push(p);
  });
  add(g, new THREE.SphereGeometry(0.12, 24, 16), mat(BLACK, { rough: 0.3 }), "Camera gimbal", "Stabilised camera.", [0, 0.37, 0.3]);
  add(g, cyl(0.06, 0.06, 0.04, 24), mat(GLASS, { metal: 0.4, rough: 0.05 }), "Camera gimbal", "Stabilised camera.", [0, 0.35, 0.42], [Math.PI / 2, 0, 0]);
  [-0.22, 0.22].forEach((x) => {
    add(g, cyl(0.02, 0.02, 0.9, 12), mat(BLACK), "Landing gear", "Skids.", [x, 0.08, 0], [Math.PI / 2, 0, 0]);
    add(g, cyl(0.02, 0.02, 0.4, 12), mat(BLACK), "Landing gear", "Skids.", [x, 0.27, 0.2]);
    add(g, cyl(0.02, 0.02, 0.4, 12), mat(BLACK), "Landing gear", "Skids.", [x, 0.27, -0.2]);
  });
  return { group: g, tick: (t) => props.forEach((p, i) => (p.rotation.y = t * 22 * (i % 2 ? 1 : -1))) };
}

function optics(g: THREE.Group): Model {
  const r = new THREE.Group();
  r.rotation.z = Math.PI / 2;
  r.position.y = 0.5;
  g.add(r);
  const body = mat(BLACK, { rough: 0.45 });
  const glass = mat(GLASS, { metal: 0.4, rough: 0.04, glow: "#16345e" });
  add(r, cyl(0.14, 0.14, 1.5, 40), body, "Main tube", "Rifle scope or optical sight body.");
  add(r, cyl(0.25, 0.14, 0.35, 40), body, "Objective lens", "Front lens gathers light.", [0, -0.9, 0]);
  add(r, cyl(0.22, 0.22, 0.02, 40), glass, "Objective lens", "Front lens gathers light.", [0, -1.08, 0]);
  add(r, cyl(0.15, 0.19, 0.32, 40), body, "Eyepiece", "Rear lens and focus ring.", [0, 0.9, 0]);
  add(r, cyl(0.16, 0.16, 0.02, 40), glass, "Eyepiece", "Rear lens and focus ring.", [0, 1.07, 0]);
  add(r, cyl(0.1, 0.1, 0.18, 24), metal(STEEL, 0.4), "Adjustment turrets", "Elevation and windage.", [0.2, 0, 0], [0, 0, Math.PI / 2]);
  add(r, cyl(0.1, 0.1, 0.18, 24), metal(STEEL, 0.4), "Adjustment turrets", "Elevation and windage.", [0, 0, 0.2], [Math.PI / 2, 0, 0]);
  [-0.4, 0.4].forEach((y) => add(r, cyl(0.17, 0.17, 0.12, 32), metal(STEEL, 0.4), "Mount rings", "Clamp the scope to a rail.", [0, y, 0]));
  add(g, box(1.4, 0.12, 0.2), metal(STEEL, 0.4), "Mount rings", "Clamp the scope to a rail.", [0, 0.26, 0]);
  return { group: g };
}

function fab(g: THREE.Group): Model {
  const spin = new THREE.Group();
  spin.userData.dynamic = true;
  g.add(spin);
  add(spin, cyl(1.0, 1.0, 0.14, 64), metal(ALU, 0.3), "Wafer chuck", "Holds the wafer during lithography or etching.", [0, 0.07, 0]);
  const dies = canvas(512, 512, (ctx) => {
    ctx.fillStyle = "#4a587a";
    ctx.beginPath();
    ctx.arc(256, 256, 254, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(256, 256, 244, 0, Math.PI * 2);
    ctx.clip();
    for (let x = 6; x < 512; x += 34) for (let y = 6; y < 512; y += 34) {
      ctx.fillStyle = `hsl(${(200 + x * 0.25 + y * 0.12) % 360} 45% ${45 + ((x + y) % 17)}%)`;
      ctx.fillRect(x, y, 30, 30);
    }
    ctx.restore();
  });
  const side = metal("#8e9bb3", 0.25);
  const top = new THREE.MeshStandardMaterial({ map: dies, metalness: 0.55, roughness: 0.18 });
  add(spin, cyl(0.92, 0.92, 0.025, 96), [side, top, side], "Silicon wafer", "Hundreds of chips are made on one wafer.", [0, 0.155, 0]);
  add(g, box(0.25, 0.04, 1.0), metal(STEEL), "Wafer-handling robot", "Moves wafers between process chambers.", [1.45, 0.2, 0.2]);
  add(g, box(0.6, 0.12, 0.2), metal(STEEL), "Wafer-handling robot", "Moves wafers between process chambers.", [1.6, 0.2, -0.35]);
  add(g, cyl(0.12, 0.14, 0.5, 24), metal(STEEL), "Wafer-handling robot", "Moves wafers between process chambers.", [1.85, 0.0, -0.35]);
  return { group: g, tick: (t) => (spin.rotation.y = t * 0.35) };
}

function pcb(g: THREE.Group): Model {
  const art = canvas(680, 480, (ctx) => {
    ctx.fillStyle = "#2f7d4f";
    ctx.fillRect(0, 0, 680, 480);
    ctx.strokeStyle = "#c98b4a";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    for (let i = 0; i < 14; i++) {
      const y = 40 + i * 30;
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(220 + (i % 4) * 30, y);
      ctx.lineTo(300 + (i % 4) * 30, y + 40);
      ctx.lineTo(640, y + 40);
      ctx.stroke();
    }
    ctx.fillStyle = "#e3b95a";
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.arc(30, 40 + i * 30, 9, 0, Math.PI * 2);
      ctx.arc(640, 80 + i * 30, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e8edf2";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("REV B  ·  8-LAYER", 420, 30);
  });
  const edge = mat("#2a6e46", { rough: 0.7 });
  add(g, box(1.8, 0.05, 1.25), [edge, edge, new THREE.MeshStandardMaterial({ map: art, roughness: 0.55 }), edge, edge, edge],
    "FR-4 board", "Bare printed circuit board: glass-fibre laminate with copper layers.", [0, 0.05, 0]);
  for (let i = 0; i < 14; i++) add(g, box(0.07, 0.012, 0.2), metal(GOLD, 0.25), "Edge connector", "Gold fingers that plug into a slot.", [-0.68 + i * 0.105, 0.08, 0.53]);
  return { group: g };
}

function instrument(g: THREE.Group): Model {
  add(g, rbox(1.6, 0.9, 0.9, 0.06), mat("#d5dade", { rough: 0.6 }), "Instrument housing", "Oscilloscope, analyser or test set.", [0, 0.5, 0]);
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 220;
  const ctx = c.getContext("2d")!;
  const screen = new THREE.CanvasTexture(c);
  screen.colorSpace = THREE.SRGBColorSpace;
  const draw = (phase: number) => {
    ctx.fillStyle = "#07140c";
    ctx.fillRect(0, 0, 320, 220);
    ctx.strokeStyle = "#1d3b27";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 320; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 220); ctx.stroke(); }
    for (let y = 0; y <= 220; y += 27.5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(320, y); ctx.stroke(); }
    ctx.strokeStyle = "#5cf08a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= 320; x += 4) {
      const y = 110 + 60 * Math.sin(x / 22 + phase) * Math.cos(x / 90 - phase / 3);
      if (x) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    screen.needsUpdate = true;
  };
  draw(0);
  add(g, new THREE.PlaneGeometry(0.85, 0.58), new THREE.MeshStandardMaterial({ map: screen, emissive: "#ffffff", emissiveMap: screen, emissiveIntensity: 0.85 }),
    "Display", "Measured signal.", [-0.3, 0.55, 0.452]);
  const knob = mat(BLACK, { rough: 0.4 });
  [[0.35, 0.78], [0.6, 0.78], [0.35, 0.55], [0.6, 0.55]].forEach(([x, y]) =>
    add(g, cyl(0.07, 0.08, 0.07, 24), knob, "Controls", "Timebase, gain and trigger.", [x, y, 0.48], [Math.PI / 2, 0, 0]));
  [0.25, 0.45, 0.65].forEach((x) => add(g, cyl(0.04, 0.04, 0.09, 16), metal(CHROME), "Probe inputs (BNC)", "Signal inputs.", [x, 0.25, 0.49], [Math.PI / 2, 0, 0]));
  add(g, box(1.0, 0.05, 0.08), metal(STEEL), "Carry handle", "Portable test equipment.", [0, 1.06, 0]);
  [-0.48, 0.48].forEach((x) => add(g, box(0.05, 0.12, 0.08), metal(STEEL), "Carry handle", "Portable test equipment.", [x, 1.0, 0]));
  return { group: g, tick: (t) => draw(t * 2.2) };
}

function cnc(g: THREE.Group): Model {
  const paint = mat("#98a3ae", { rough: 0.6 });
  add(g, box(1.9, 0.3, 1.0), paint, "Machine bed", "Heavy cast base.", [0, 0.15, 0]);
  const table = new THREE.Group();
  table.userData.dynamic = true;
  table.position.y = 0.34;
  g.add(table);
  add(table, box(1.2, 0.08, 0.6), metal(STEEL, 0.35), "Work table", "Moves the part under the cutter.", [0, 0, 0.1]);
  add(table, box(0.42, 0.22, 0.32), metal(ALU, 0.3), "Workpiece", "The metal part being machined.", [0, 0.15, 0.1]);
  add(g, box(0.45, 1.5, 0.38), paint, "Column", "Carries the spindle head.", [0, 1.0, -0.35]);
  add(g, box(0.36, 0.36, 0.55), mat("#2a78d6", { rough: 0.5 }), "Spindle head", "Motor and gearbox.", [0, 1.35, -0.02]);
  const spindle = new THREE.Group();
  spindle.userData.dynamic = true;
  spindle.position.set(0, 1.0, 0.1);
  g.add(spindle);
  add(spindle, cyl(0.08, 0.08, 0.3, 24), metal(CHROME), "Spindle and cutter", "Rotating tool; 5-axis machines are dual-use controlled.", [0, 0.05, 0]);
  add(spindle, cyl(0.03, 0.03, 0.22, 12), metal(GOLD, 0.25), "Spindle and cutter", "Rotating tool; 5-axis machines are dual-use controlled.", [0, -0.2, 0]);
  add(g, box(0.07, 0.5, 0.07), mat(DARK), "CNC controller", "Numerical control unit.", [0.82, 0.55, 0.15]);
  add(g, box(0.38, 0.55, 0.06), mat(DARK), "CNC controller", "Numerical control unit.", [0.82, 1.05, 0.15], [0, -0.5, 0]);
  add(g, new THREE.PlaneGeometry(0.28, 0.2), mat("#0e1b2c", { glow: "#1f5fae" }), "CNC controller", "Numerical control unit.", [0.835, 1.12, 0.185], [0, -0.5, 0]);
  return { group: g, tick: (t) => { spindle.rotation.y = t * 18; table.position.x = Math.sin(t * 0.7) * 0.28; } };
}

function crate(g: THREE.Group): Model {
  const wood = mat("#b98a52", { rough: 0.85 });
  const dark = mat("#8d643a", { rough: 0.85 });
  const stencil = canvas(512, 360, (ctx) => {
    ctx.fillStyle = "#b98a52";
    ctx.fillRect(0, 0, 512, 360);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let y = 0; y < 360; y += 60) ctx.fillRect(0, y, 512, 3);
    ctx.fillStyle = "#2b2b2b";
    ctx.font = "bold 46px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("EXPORT CONTROLLED", 256, 150);
    ctx.font = "bold 34px sans-serif";
    ctx.fillText("HANDLE WITH CARE  ↑", 256, 215);
  });
  add(g, box(1.4, 1.0, 1.0), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: stencil, roughness: 0.85 }), wood],
    "Shipping crate", "Goods in transit; the HS code on the customs declaration decides which rules apply.", [0, 0.62, 0]);
  for (const y of [0.15, 1.09]) for (const z of [-0.51, 0.51]) add(g, box(1.44, 0.08, 0.04), dark, "Shipping crate", "Goods in transit.", [0, y, z]);
  for (const x of [-0.6, 0, 0.6]) add(g, box(0.18, 0.1, 1.1), dark, "Pallet", "Wooden pallet for forklifts.", [x, 0.05, 0]);
  return { group: g };
}

const BUILDERS: Record<string, (g: THREE.Group) => Model> = {
  chip, bearing, radio, navigation, camera, capacitor, transistor, connector, computer, converter, drone, optics, fab, pcb,
  instrument, cnc, crate,
};

/** Builds the model for a product kind, scaled to about 2 units and standing on y = 0. */
export function buildModel(kind: string): Model {
  const g = new THREE.Group();
  const model = (BUILDERS[kind] ?? crate)(g);
  mergeStatic(g); // e.g. the chip's 144 pin segments become one draw call
  const bounds = new THREE.Box3().setFromObject(g);
  const size = bounds.getSize(new THREE.Vector3());
  const s = 2 / Math.max(size.x, size.y, size.z);
  g.scale.setScalar(s);
  const centre = bounds.getCenter(new THREE.Vector3());
  g.position.set(-centre.x * s, -bounds.min.y * s, -centre.z * s);
  return model;
}
