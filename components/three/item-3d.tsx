"use client";

import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Frame3D, ToolButton, type Tip, tipAt, usePicking, useStage } from "@/components/three/frame";
import { buildModel } from "@/components/three/item-models";
import { productKind } from "@/components/product-art";
import { useTheme } from "@/lib/theme";
import { cssVar, disposeTree, studioEnvironment } from "@/lib/three-stage";
import { cn } from "@/lib/utils";

const HOME = { pos: new THREE.Vector3(2.3, 1.9, 2.6), target: new THREE.Vector3(0, 0.55, 0) };
const VIEW_DIR = new THREE.Vector3(2.3, 1.5, 2.6).normalize();
const FOV = 34;

/** Soft round shadow under the model. */
function contactShadow(): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.32)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return mesh;
}

/** A rotatable 3D model of the item family for an HS code, with labelled parts. */
export function Item3D({ hs, description }: { hs: string; description: string | null }) {
  const { hostRef, stageRef, ready, failed, reduce } = useStage({
    position: HOME.pos.toArray(), target: HOME.target.toArray(), minDistance: 1.5, maxDistance: 9, fov: FOV,
  });
  const { theme } = useTheme();
  const [tip, setTip] = useState<Tip | null>(null);
  const [parts, setParts] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(true);
  const [shown, setShown] = useState(false);
  const groupRef = useRef<THREE.Group | null>(null);
  // The model is shown once its reflections exist, so its shaders compile once, with them
  const envRef = useRef<Promise<unknown> | null>(null);
  const kind = productKind(hs);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    let alive = true;
    let env: THREE.Texture | null = null;
    envRef.current = studioEnvironment(stage.renderer, () => alive).then((t) => {
      if (alive) stage.scene.environment = env = t;
      else t?.dispose();
    }, () => undefined); // without reflections the model still shows, only flatter
    const stop = () => setSpinning(false);
    stage.controls.addEventListener("start", stop);
    return () => {
      alive = false;
      stage.controls.removeEventListener("start", stop);
      stage.scene.environment = null;
      env?.dispose();
      envRef.current = null;
    };
  }, [ready, stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.controls.autoRotate = spinning && !reduce;
    stage.controls.autoRotateSpeed = 1.6;
    stage.invalidate(); // wakes the render loop
  }, [ready, stageRef, spinning, reduce]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    const root = new THREE.Group();
    root.add(new THREE.AmbientLight(0xffffff, theme === "dark" ? 0.5 : 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 4);
    root.add(key);
    root.add(contactShadow());
    const model = buildModel(kind);
    root.add(model.group);
    let alive = true;
    let hide = () => {};
    (envRef.current ?? Promise.resolve()).then(() => {
      if (alive) hide = stage.reveal(root, () => setShown(true));
    });
    groupRef.current = model.group;

    // Frame the model: fit its bounding sphere in the vertical field of view
    const sphere = new THREE.Box3().setFromObject(model.group).getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius / Math.sin(((FOV / 2) * Math.PI) / 180)) * 1.08 * stage.boost(1);
    const pos = sphere.center.clone().addScaledVector(VIEW_DIR, dist);
    stage.setHome(pos, sphere.center);
    stage.fly(pos, sphere.center.clone(), 0);

    const names: string[] = [];
    model.group.traverse((o) => {
      const part = o.userData.part as string | undefined;
      if (part && !names.includes(part)) names.push(part);
      const m = (o as THREE.Mesh).material;
      (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => {
        if (x instanceof THREE.MeshStandardMaterial) x.userData.emissive ??= { color: x.emissive.clone(), intensity: x.emissiveIntensity };
      });
    });
    queueMicrotask(() => setParts(names));

    const tick = model.tick;
    if (tick) {
      tick(0);
      if (!reduce) stage.frame.add(tick);
    }
    stage.invalidate();
    return () => {
      alive = false;
      if (tick) stage.frame.delete(tick);
      hide();
      disposeTree(root);
      groupRef.current = null;
    };
  }, [ready, stageRef, kind, theme, reduce]);

  // Highlight every mesh of the hovered part
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    const glow = new THREE.Color(cssVar("--ring"));
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => {
        if (!(x instanceof THREE.MeshStandardMaterial) || !x.userData.emissive) return;
        const on = hovered !== null && o.userData.part === hovered;
        x.emissive.copy(on ? glow : x.userData.emissive.color);
        x.emissiveIntensity = on ? 0.55 : x.userData.emissive.intensity;
      });
    });
    stageRef.current?.invalidate();
  }, [hovered, stageRef, parts]);

  usePicking(stageRef, ready, {
    move: (e, stage) => {
      const g = groupRef.current;
      const hit = g ? stage.pick(e, [g])[0] : undefined;
      let o: THREE.Object3D | null = hit?.object ?? null;
      while (o && !o.userData.part) o = o.parent;
      const part = (o?.userData.part as string | undefined) ?? null;
      setHovered(part);
      setTip(o ? tipAt(e, stage, <><div className="font-bold">{part}</div><div className="text-muted-foreground">{o.userData.note}</div></>) : null);
    },
    leave: () => {
      setHovered(null);
      setTip(null);
    },
  });

  return (
    <div>
      <Frame3D hostRef={hostRef} stageRef={stageRef} failed={failed} tip={tip} className="h-[300px] bg-card"
        label={`Rotatable 3D model of HS ${hs}${description ? `, ${description}` : ""}`}
        hint="Drag to turn · hover a part to name it"
        overlay={!shown && !failed && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">Loading model…</div>
        )}
        tools={!reduce && (
          <ToolButton label={spinning ? "Stop turning" : "Turn automatically"} onClick={() => setSpinning(!spinning)}>
            {spinning ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
          </ToolButton>
        )} />
      {parts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Parts">
          {parts.map((p) => (
            <button key={p} type="button" onMouseEnter={() => setHovered(p)} onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(p)} onBlur={() => setHovered(null)}
              className={cn("border px-2 py-0.5 text-[12px] transition-colors", hovered === p ? "border-ring bg-ring/10" : "border-border")}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
