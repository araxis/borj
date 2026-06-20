import * as THREE from 'three';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _color = new THREE.Color();

const ARTIFACT_NAME = /(helper|shadow|receiver|plane|proxy|occlusion|collision|bounds|card|cutout|backdrop|range)/i;
const INTENTIONAL_FX_LAYERS = new Set(['boss-omen']);

function materialsOf(mesh) {
  if (!mesh?.material) return [];
  return Array.isArray(mesh.material) ? mesh.material.filter(Boolean) : [mesh.material];
}

function materialIsDark(mat) {
  if (!mat) return false;
  if (mat.color?.isColor) _color.copy(mat.color);
  else _color.set(0xffffff);
  const hsl = {};
  _color.getHSL(hsl);
  return hsl.l < 0.23;
}

function materialLooksSuspicious(mat) {
  if (!mat) return false;
  const name = `${mat.name || ''} ${mat.map?.name || ''}`;
  const dark = materialIsDark(mat);
  return ARTIFACT_NAME.test(name) || dark;
}

function meshDims(mesh) {
  mesh.updateWorldMatrix(true, false);
  _box.setFromObject(mesh);
  if (_box.isEmpty()) return null;
  _box.getSize(_size);
  const dims = [_size.x, _size.y, _size.z].sort((a, b) => a - b);
  return {
    x: _size.x,
    y: _size.y,
    z: _size.z,
    thin: dims[0],
    mid: dims[1],
    wide: dims[2],
  };
}

function isIntentionalFx(mesh) {
  let node = mesh;
  while (node) {
    if (node.userData?.visualQaIgnore || INTENTIONAL_FX_LAYERS.has(node.userData?.visualLayer)) return true;
    node = node.parent;
  }
  return false;
}

function classifyMesh(mesh, scope = 'scene') {
  if (!mesh?.isMesh && !mesh?.isSkinnedMesh && !mesh?.isInstancedMesh) return null;
  if (isIntentionalFx(mesh)) return null;
  const dims = meshDims(mesh);
  if (!dims) return null;
  const mats = materialsOf(mesh);
  const names = `${mesh.name || ''} ${mesh.parent?.name || ''}`;
  const nameHit = ARTIFACT_NAME.test(names);
  const materialHit = mats.some(materialLooksSuspicious);
  const flat = dims.thin <= 0.42 && dims.wide >= 18 && dims.mid >= 5;
  const giantFlat = dims.thin <= 0.72 && dims.wide >= 42 && dims.mid >= 10;
  const helperScope = scope === 'palace' || scope === 'horizon';
  const shouldHide = (giantFlat && (helperScope || nameHit || materialHit)) || (flat && (nameHit || materialHit));
  const shouldDeshadow = flat || giantFlat;
  if (!shouldHide && !shouldDeshadow) return null;
  return {
    mesh,
    name: mesh.name || mesh.parent?.name || mesh.type,
    uuid: mesh.uuid,
    dims,
    flat,
    giantFlat,
    nameHit,
    materialHit,
    shouldHide,
    shouldDeshadow,
    visible: mesh.visible,
    materials: mats.map((m) => ({
      name: m.name || m.type,
      type: m.type,
      transparent: !!m.transparent,
      opacity: Number.isFinite(m.opacity) ? m.opacity : 1,
      alphaTest: Number.isFinite(m.alphaTest) ? m.alphaTest : 0,
      color: m.color?.isColor ? `#${m.color.getHexString()}` : null,
    })),
  };
}

export function auditVisualArtifacts(root, { scope = 'scene' } = {}) {
  const findings = [];
  if (!root?.traverse) return findings;
  root.updateWorldMatrix?.(true, true);
  root.traverse((o) => {
    const hit = classifyMesh(o, scope);
    if (hit?.shouldHide) {
      findings.push({
        name: hit.name,
        uuid: hit.uuid,
        dims: {
          x: Number(hit.dims.x.toFixed(2)),
          y: Number(hit.dims.y.toFixed(2)),
          z: Number(hit.dims.z.toFixed(2)),
        },
        visible: hit.visible,
        flat: hit.flat,
        giantFlat: hit.giantFlat,
        nameHit: hit.nameHit,
        materialHit: hit.materialHit,
        materials: hit.materials,
      });
    }
  });
  return findings;
}

export function sanitizeVisualArtifacts(root, { scope = 'scene', hide = true } = {}) {
  let hidden = 0;
  let deshadowed = 0;
  if (!root?.traverse) return { hidden, deshadowed };
  root.updateWorldMatrix?.(true, true);
  root.traverse((o) => {
    const hit = classifyMesh(o, scope);
    if (!hit) return;
    if (hit.shouldDeshadow) {
      o.castShadow = false;
      o.receiveShadow = false;
      deshadowed++;
    }
    if (hide && hit.shouldHide) {
      o.visible = false;
      o.userData.visualQaHidden = true;
      o.userData.visualQaReason = hit.giantFlat ? 'giant-flat' : 'flat-helper';
      hidden++;
    }
  });
  return { hidden, deshadowed };
}
