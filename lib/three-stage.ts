/**
 * Shared three.js scaffolding for the 3D views: renderer, orbit camera, render loop that
 * sleeps off screen, picking, camera flights and full disposal. Browser only.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

let webgl: boolean | undefined;

/** Whether the browser can create a WebGL 2 context (checked once). */
export function supportsWebGL(): boolean {
  if (webgl === undefined) {
    try {
      const gl = document.createElement("canvas").getContext("webgl2");
      webgl = !!gl;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/** A CSS custom property from the current theme, as a string (for canvas drawing). */
export function cssVar(name: string, fallback = "#888888"): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** A theme colour as a three.js colour (hex or rgb() variables only). */
export function themeColor(name: string, fallback = "#888888"): THREE.Color {
  const v = cssVar(name, fallback);
  return new THREE.Color(v.startsWith("#") || v.startsWith("rgb(") ? v : fallback);
}

export const pageFont = () => getComputedStyle(document.body).fontFamily;

export function canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const images = new Map<string, Promise<HTMLImageElement | null>>();
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!images.has(src)) {
    images.set(src, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    }));
  }
  return images.get(src)!;
}

export const flagSrc = (code: string) => `/flags/${code.startsWith("EU") ? "eu" : code.slice(0, 2).toLowerCase()}.svg`;

/** Frees every geometry, material and texture below `root`. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

/** Ambient animations (moving vehicles, auto-rotation) are drawn at most this often. */
const AMBIENT_FPS = 30;
/** Rendering above 1.5 device pixels per CSS pixel costs a lot of GPU time for little visible gain. */
const MAX_PIXEL_RATIO = 1.5;

/** A Set that wakes the render loop when something is added. */
class WakingSet<T> extends Set<T> {
  wake: () => void = () => {};
  add(value: T) {
    super.add(value);
    this.wake();
    return this;
  }
}

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  /** Ambient animation callbacks, run at up to 30 frames a second while the view is on screen. */
  frame: Set<(t: number, dt: number) => void>;
  /** Called after each render, e.g. to place HTML labels. */
  after: Set<() => void>;
  reduce: boolean;
  invalidate(): void;
  pick(e: { clientX: number; clientY: number }, objects: THREE.Object3D[]): THREE.Intersection[];
  /** The pointer ray in world space (for picking without ray-testing every triangle). */
  rayAt(e: { clientX: number; clientY: number }): THREE.Ray;
  /** Position of a world point in CSS pixels within the host element. */
  toScreen(p: THREE.Vector3): { x: number; y: number };
  fly(position: THREE.Vector3, target?: THREE.Vector3, seconds?: number): void;
  zoom(factor: number): void;
  /** Distance factor (≥ 1) that keeps a scene composed for `aspect` in view on a narrower canvas. */
  boost(aspect: number): number;
  /** Sets the home view, pulled back on narrow canvases, and jumps there. */
  fitHome(position: THREE.Vector3, target: THREE.Vector3, aspect: number): void;
  setHome(position: THREE.Vector3, target: THREE.Vector3): void;
  home(): void;
  dispose(): void;
}

export function createStage(host: HTMLElement, o: {
  position: [number, number, number];
  target?: [number, number, number];
  fov?: number;
  minDistance?: number;
  maxDistance?: number;
  maxPolarAngle?: number;
  enablePan?: boolean;
  reduce: boolean;
}): Stage | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;outline:none";
  host.appendChild(canvas);

  // Plain scrolling keeps scrolling the page; Ctrl/⌘ + scroll (or pinch) zooms the scene.
  const wheelGuard = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation();
  };
  canvas.addEventListener("wheel", wheelGuard, { capture: true });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(o.fov ?? 38, 1, 0.01, 100);
  camera.position.set(...o.position);
  scene.add(camera);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...(o.target ?? [0, 0, 0]));
  controls.enablePan = o.enablePan ?? false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  if (o.minDistance) controls.minDistance = o.minDistance;
  if (o.maxDistance) controls.maxDistance = o.maxDistance;
  if (o.maxPolarAngle) controls.maxPolarAngle = o.maxPolarAngle;
  controls.update();
  const homePos = camera.position.clone();
  const homeTarget = controls.target.clone();

  // The loop only runs while something changes: user input, a camera flight, damping, auto-rotation or
  // an ambient animation. Ambient work is throttled to AMBIENT_FPS; interaction runs at the display rate.
  const frame = new WakingSet<(t: number, dt: number) => void>();
  const after = new Set<() => void>();
  let dirty = true;
  let raf = 0;
  let visible = true;
  let interacting = false;
  let settling = false;
  let flight: ((t: number, dt: number) => void) | null = null;
  const start = performance.now();
  let last = start;
  let lastAmbient = 0;

  const wake = () => {
    if (!raf && visible) raf = requestAnimationFrame(tick);
  };
  frame.wake = wake;
  const invalidate = () => {
    dirty = true;
    wake();
  };

  function tick(now: number) {
    raf = 0;
    if (!visible) return;
    const fullRate = interacting || settling || flight !== null || dirty;
    if (!fullRate && now - lastAmbient < 1000 / AMBIENT_FPS - 2) {
      raf = requestAnimationFrame(tick); // ambient only: skip this display frame
      return;
    }
    // rAF timestamps can precede `start` by a few ms on the first frame: never report negative time
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    lastAmbient = now;
    const t = Math.max(0, (now - start) / 1000);
    const moved = controls.update(dt);
    settling = moved && !interacting && !controls.autoRotate;
    flight?.(t, dt);
    frame.forEach((f) => f(t, dt));
    if (dirty || moved || flight || frame.size) {
      dirty = false;
      renderer.render(scene, camera);
      after.forEach((f) => f());
    }
    if (interacting || settling || flight || frame.size || controls.autoRotate) raf = requestAnimationFrame(tick);
  }

  controls.addEventListener("change", invalidate);
  controls.addEventListener("start", () => {
    interacting = true;
    wake();
  });
  controls.addEventListener("end", () => {
    interacting = false;
    settling = true;
    wake();
  });

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) invalidate();
  });
  io.observe(host);
  // three.js restores a lost WebGL context (GPU reset, too many contexts) itself; repaint once it is back
  canvas.addEventListener("webglcontextrestored", invalidate);
  wake();

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick: Stage["pick"] = (e, objects) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(objects, true);
  };
  const rayAt: Stage["rayAt"] = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.clone();
  };

  const v = new THREE.Vector3();
  const toScreen: Stage["toScreen"] = (p) => {
    v.copy(p).project(camera);
    return { x: ((v.x + 1) / 2) * host.clientWidth, y: ((1 - v.y) / 2) * host.clientHeight };
  };

  const stopFlight = () => {
    flight = null;
  };
  controls.addEventListener("start", stopFlight);

  const stage: Stage = {
    scene, camera, controls, renderer, frame, after, reduce: o.reduce, invalidate, pick, rayAt, toScreen,
    fly(position, target = controls.target.clone(), seconds = 1.1) {
      stopFlight();
      if (stage.reduce || seconds <= 0) {
        controls.target.copy(target);
        camera.position.copy(position);
        controls.update();
        invalidate();
        return;
      }
      const t0 = controls.target.clone();
      const a = camera.position.clone().sub(t0);
      const b = position.clone().sub(target);
      const la = a.length(), lb = b.length();
      const turn = new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
      const q = new THREE.Quaternion();
      let k = 0;
      flight = (_t, dt) => {
        k = Math.min(1, k + dt / seconds);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        controls.target.lerpVectors(t0, target, e);
        q.identity().slerp(turn, e);
        camera.position.copy(a).normalize().applyQuaternion(q).multiplyScalar(THREE.MathUtils.lerp(la, lb, e)).add(controls.target);
        if (k >= 1) stopFlight();
      };
      wake();
    },
    zoom(factor) {
      const off = camera.position.clone().sub(controls.target);
      const len = THREE.MathUtils.clamp(off.length() * factor, controls.minDistance, controls.maxDistance);
      stage.fly(controls.target.clone().add(off.setLength(len)), controls.target.clone(), 0.35);
    },
    boost(aspect) {
      return Math.max(1, aspect / camera.aspect);
    },
    fitHome(position, target, aspect) {
      const pos = position.clone().sub(target).multiplyScalar(stage.boost(aspect)).add(target);
      homePos.copy(pos);
      homeTarget.copy(target);
      stage.fly(pos, target.clone(), 0);
    },
    setHome(position, target) {
      homePos.copy(position);
      homeTarget.copy(target);
    },
    home() {
      stage.fly(homePos.clone(), homeTarget.clone(), 0.9);
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("wheel", wheelGuard, { capture: true });
      canvas.removeEventListener("webglcontextrestored", invalidate);
      controls.dispose();
      disposeTree(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
  return stage;
}
