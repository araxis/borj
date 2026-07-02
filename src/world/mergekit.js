// Post-build static-merge pass: collapse a dressed group's thousands of small
// static meshes into one mesh per (material × attribute-set × shadow flags ×
// renderOrder) bucket, baking world transforms into the merged geometry.
// Animated pieces (cloth banners, flames, anything flagged userData.noMerge)
// stay untouched, as do instanced/skinned/morphing meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mergeStaticGroup(root, excludeRoots = []) {
  if (!root) return { made: 0, removed: 0 };
  const excluded = new Set();
  for (const r of excludeRoots) r?.traverse?.((o) => excluded.add(o));
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();

  // geometry share-count: a geometry still referenced by an excluded/kept mesh
  // must never be disposed when its merged siblings are removed
  const useCount = new Map();
  root.traverse((o) => { if (o.isMesh && o.geometry) useCount.set(o.geometry, (useCount.get(o.geometry) || 0) + 1); });

  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry?.isBufferGeometry) return;
    if (Array.isArray(o.material)) return;
    if (o.morphTargetInfluences?.length) return;
    for (let p = o; p && p !== root.parent; p = p.parent) {
      if (excluded.has(p) || p.userData?.cloth || p.userData?.noMerge) return;
    }
    const attrs = Object.keys(o.geometry.attributes).sort().join(',');
    const key = `${o.material.uuid}|${attrs}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, ro: o.renderOrder, src: [] }));
    b.src.push(o);
  });

  let made = 0, removed = 0;
  for (const b of buckets.values()) {
    if (b.src.length < 2) continue;
    const geos = [];
    for (const s of b.src) {
      const g = s.geometry.index ? s.geometry.toNonIndexed() : s.geometry.clone();
      rel.multiplyMatrices(inv, s.matrixWorld);
      g.applyMatrix4(rel); // also fixes normals for rotated/scaled sources
      geos.push(g);
    }
    const g = mergeGeometries(geos, false);
    for (const t of geos) t.dispose();
    if (!g) continue;
    const m = new THREE.Mesh(g, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    m.renderOrder = b.ro;
    root.add(m);
    made++;
    for (const s of b.src) {
      s.removeFromParent();
      if (useCount.get(s.geometry) === 1 && !s.geometry.userData?.cached) s.geometry.dispose();
      removed++;
    }
  }
  return { made, removed };
}
