/** Draw-call reduction for the 3D views. Browser only. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function isDynamic(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return true;
  return false;
}

/**
 * Merges the static meshes under `root` that share a material instance (and the same `userData.part`)
 * into a single mesh each. Objects flagged `userData.dynamic` (and everything below them), sprites,
 * instanced and multi-material meshes are left as they are. Hover labels keep working because the
 * merged mesh copies the userData of the meshes it replaces.
 */
export function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, THREE.Mesh[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material) || isDynamic(o, root)) return;
    const key = `${o.material.uuid}|${o.userData.part ?? ""}`;
    buckets.set(key, [...(buckets.get(key) ?? []), o]);
  });
  const m = new THREE.Matrix4();
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const indexed = meshes.every((x) => x.geometry.index);
    const geos = meshes.map((x) => {
      const g = (indexed ? x.geometry.clone() : x.geometry.toNonIndexed()).applyMatrix4(m.multiplyMatrices(toRoot, x.matrixWorld));
      for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
      g.clearGroups();
      return g;
    });
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, meshes[0].material);
    mesh.userData = { ...meshes[0].userData };
    mesh.castShadow = meshes.some((x) => x.castShadow);
    mesh.receiveShadow = meshes.some((x) => x.receiveShadow);
    for (const x of meshes) {
      x.parent?.remove(x);
      x.geometry.dispose();
    }
    root.add(mesh);
  }
}
