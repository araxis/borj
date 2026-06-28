import * as THREE from 'three';
import { MATS, MeshBuilder } from '../models/materials.js';
import { makeFlame } from '../models/towerkit.js';
import { makeBanner } from './props.js';
import { getProp, instanceProp, propBase } from '../core/props3d.js';
import { zabulistanVisualProfile } from '../data/zabulistanVisualProfile.js';

const TAU = Math.PI * 2;
const DEFAULT_KIT_PROFILE = Object.freeze({
  roadShoulderStride: 6,
  groundPatchCount: 24,
  scrubClusterCount: 34,
  reedPocketCount: 7,
  weatheredRockCount: 18,
  ridgeWallCount: 42,
  beaconMarks: Object.freeze([0.18, 0.36, 0.56, 0.74]),
  siegeMarks: Object.freeze([0.25, 0.68]),
});

function stageKitProfile(map) {
  return zabulistanVisualProfile(map?.def?.id)?.kit || DEFAULT_KIT_PROFILE;
}

let cachedMats = null;
function kitMats() {
  if (cachedMats) return cachedMats;
  cachedMats = {
    dryScrub: new THREE.MeshStandardMaterial({ color: 0x6d704b, roughness: 1 }),
    dryScrubDark: new THREE.MeshStandardMaterial({ color: 0x4b5438, roughness: 1 }),
    reed: new THREE.MeshStandardMaterial({ color: 0x81784c, roughness: 1 }),
    reedTip: new THREE.MeshStandardMaterial({ color: 0xa68a52, roughness: 1 }),
    padDust: new THREE.MeshStandardMaterial({
      color: 0x806c4d,
      roughness: 1,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    padEdgeSand: new THREE.MeshStandardMaterial({
      color: 0xa28a63,
      roughness: 1,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    padShadow: new THREE.MeshStandardMaterial({ color: 0x65533b, roughness: 1 }),
    padTop: new THREE.MeshStandardMaterial({ color: 0x927a58, roughness: 1 }),
    padStone: new THREE.MeshStandardMaterial({ color: 0xb1966c, roughness: 1 }),
    padRelief: new THREE.MeshStandardMaterial({ color: 0x70553a, roughness: 1 }),
    padInset: new THREE.MeshStandardMaterial({ color: 0x80684b, roughness: 1 }),
    roadRut: new THREE.MeshStandardMaterial({
      color: 0x6e5031,
      roughness: 1,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
    forecourtDust: new THREE.MeshStandardMaterial({
      color: 0x7a6c52,
      roughness: 1,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    shoulderDust: new THREE.MeshStandardMaterial({
      color: 0x9a855f,
      roughness: 1,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    sandstone: new THREE.MeshStandardMaterial({ color: 0x998a70, roughness: 0.98 }),
    sandstoneDark: new THREE.MeshStandardMaterial({ color: 0x766752, roughness: 1 }),
    facadeStone: new THREE.MeshStandardMaterial({ color: 0x907a59, roughness: 0.98 }),
    facadeLight: new THREE.MeshStandardMaterial({ color: 0xab8c5f, roughness: 0.96 }),
    gateShadow: new THREE.MeshStandardMaterial({ color: 0x493725, roughness: 1 }),
    gateWood: new THREE.MeshStandardMaterial({ color: 0x674228, roughness: 0.94 }),
    gateBronze: new THREE.MeshStandardMaterial({ color: 0x806033, roughness: 0.74, metalness: 0.1 }),
    agedTurquoise: new THREE.MeshStandardMaterial({ color: 0x2a7770, roughness: 0.86, metalness: 0.02 }),
    terraceTop: new THREE.MeshStandardMaterial({ color: 0x89785b, roughness: 1 }),
    cliffFace: new THREE.MeshStandardMaterial({ color: 0x686a66, roughness: 1 }),
    cliffShadow: new THREE.MeshStandardMaterial({ color: 0x454845, roughness: 1 }),
    cliffWarm: new THREE.MeshStandardMaterial({ color: 0x927c5d, roughness: 1 }),
    darkSoil: new THREE.MeshStandardMaterial({
      color: 0x625f46,
      roughness: 1,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  };
  return cachedMats;
}

function addInstanced(group, geo, mat, matrices, { castShadow = true, receiveShadow = true } = {}) {
  if (!matrices.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  group.add(mesh);
  return mesh;
}

function matrix(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.scale(new THREE.Vector3(sx, sy, sz));
  m.setPosition(x, y, z);
  return m;
}

function pathApproach(map) {
  const samples = map.paths?.[0]?.samples || [];
  const exit = map.exitPos;
  const s = samples[Math.max(0, samples.length - 8)] || samples[0];
  const fwd = new THREE.Vector3((s?.pos.x || 0) - exit.x, 0, (s?.pos.z || 0) - exit.z);
  if (fwd.lengthSq() < 0.0001) fwd.set(0, 0, 1);
  fwd.normalize();
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  return { fwd, side, yaw: Math.atan2(fwd.x, fwd.z) };
}

function clearLoose(map, x, z, r) {
  if (map.visualBoard?.shape === 'circle' && Math.hypot(x, z) > map.visualBoard.radius - r) return false;
  if (!map._isClear?.(x, z, r)) return false;
  if (map._clearOfFoliage && !map._clearOfFoliage(x, z, Math.max(1.5, r * 0.8))) return false;
  return true;
}

function randomClearPoint(map, rng, r = 3, tries = 80) {
  const radius = Math.min(78, (map.visualBoard?.radius || 86) - r - 3);
  while (tries-- > 0) {
    const a = rng() * TAU;
    const d = Math.sqrt(rng()) * radius;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (clearLoose(map, x, z, r)) return [x, map.heightAt(x, z), z];
  }
  return null;
}

function clearPadAndCitadel(map, x, z, r = 2) {
  if (map.visualBoard?.shape === 'circle' && Math.hypot(x, z) > map.visualBoard.radius - r) return false;
  if (Math.hypot(x - map.exitPos.x, z - map.exitPos.z) < (map._footprint || 12) + r + 2) return false;
  for (const pad of map.pads || []) {
    if (Math.hypot(x - pad.pos.x, z - pad.pos.z) < r + 2.9) return false;
  }
  return true;
}

function placeAuthoredGroundProp(map, group, name, x, z, ry, { targetW = null, targetH = null, unit = 1, yOffset = 0, tint = null, sceneName = null } = {}) {
  const base = propBase(name);
  if (!base) return false;
  const scale = targetH != null
    ? targetH / (base.baseH || 1)
    : targetW != null
      ? targetW / (base.baseW || 1)
      : unit;
  const prop = getProp(name, { unit: scale, tint });
  if (!prop) return false;
  if (sceneName) prop.name = sceneName;
  prop.position.set(x, map.heightAt(x, z) - (base.baseY || 0) * scale + yOffset, z);
  prop.rotation.y = ry;
  group.add(prop);
  return prop;
}

function authoredChild(name, unit = 1) {
  const base = propBase(name);
  if (!base) return null;
  const prop = getProp(name, { unit, tint: null });
  if (!prop) return null;
  prop.position.y = -(base.baseY || 0) * unit;
  return prop;
}

function buildZabulistanPad() {
  const mats = kitMats();
  const g = new THREE.Group();
  const dustGeo = new THREE.CircleGeometry(1, 24);
  dustGeo.rotateX(-Math.PI / 2);
  const dust = new THREE.Mesh(dustGeo, mats.padDust);
  dust.scale.set(4.15, 1, 3.05);
  dust.position.y = 0.026;
  dust.renderOrder = 1;
  g.add(dust);
  const edgeDust = new THREE.Mesh(dustGeo.clone(), mats.padEdgeSand);
  edgeDust.scale.set(3.38, 1, 2.48);
  edgeDust.rotation.y = 0.18;
  edgeDust.position.y = 0.032;
  edgeDust.renderOrder = 2;
  g.add(edgeDust);

  const addPlate = (sx, h, sz, mat, x, y, z, ry = 0, seg = 8, rx = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, h, seg), mat);
    mesh.scale.set(sx, 1, sz);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  addPlate(2.78, 0.068, 2.0, mats.padShadow, 0, 0.052, 0, 0.12, 10, 0.008, -0.006);
  addPlate(2.4, 0.046, 1.64, mats.padTop, 0.04, 0.108, -0.02, -0.07, 12, -0.005, 0.008);
  addPlate(1.52, 0.014, 0.96, mats.padInset, 0.02, 0.14, -0.02, -0.04, 12, -0.004, 0.006);

  const surfaceStones = [
    [-0.96, -0.58, 0.6, 0.34, 0.12, 6],
    [-0.18, -0.62, 0.72, 0.38, -0.08, 5],
    [0.82, -0.5, 0.56, 0.32, 0.18, 6],
    [-1.22, 0.02, 0.5, 0.38, -0.18, 5],
    [-0.43, -0.02, 0.64, 0.4, 0.05, 7],
    [0.4, 0.06, 0.58, 0.36, -0.12, 6],
    [1.12, 0.12, 0.44, 0.3, 0.2, 5],
    [-0.76, 0.62, 0.54, 0.32, 0.22, 6],
    [0.04, 0.7, 0.62, 0.34, -0.14, 5],
    [0.82, 0.58, 0.44, 0.28, 0.1, 6],
  ];
  surfaceStones.forEach(([x, z, w, d, ry, seg], i) => {
    addPlate(
      w,
      0.02,
      d,
      i % 3 === 0 ? mats.padStone : mats.padTop,
      x,
      0.162 + (i % 2) * 0.004,
      z,
      ry,
      seg,
      i % 2 ? 0.012 : -0.01,
      (i % 3 - 1) * 0.01,
    );
  });

  const chipGeo = new THREE.DodecahedronGeometry(0.16, 0);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + (i % 3) * 0.045;
    const rX = 2.42 + (i % 4) * 0.08;
    const rZ = 1.72 + (i % 5) * 0.055;
    const x = Math.cos(a) * rX;
    const z = Math.sin(a) * rZ;
    const stone = new THREE.Mesh(chipGeo.clone(), i % 2 ? mats.padShadow : mats.padStone);
    stone.position.set(x, 0.128 + (i % 3) * 0.006, z);
    stone.scale.set(0.86 + (i % 4) * 0.1, 0.16 + (i % 2) * 0.05, 0.58 + (i % 5) * 0.06);
    stone.rotation.set(0.14 + (i % 4) * 0.035, a + Math.PI / 2, -0.08 + (i % 3) * 0.06);
    stone.castShadow = true;
    stone.receiveShadow = true;
    g.add(stone);
  }
  return g;
}

function openRingGeometry(inner = 8.2, outer = 15.2, height = 3.2, segments = 64, gap = 0.62) {
  const verts = [];
  const faces = [];
  const halfGap = gap / 2;
  const start = halfGap;
  const end = TAU - halfGap;
  for (let i = 0; i <= segments; i++) {
    const a = start + (end - start) * (i / segments);
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    verts.push(
      sx * outer, 0, cz * outer,
      sx * outer, height, cz * outer,
      sx * inner, 0, cz * inner,
      sx * inner, height, cz * inner,
    );
  }
  for (let i = 0; i < segments; i++) {
    const p = i * 4;
    const n = p + 4;
    faces.push(
      p, n, n + 1, p, n + 1, p + 1,
      p + 2, p + 3, n + 3, p + 2, n + 3, n + 2,
      p + 1, n + 1, n + 3, p + 1, n + 3, p + 3,
      p, p + 2, n + 2, p, n + 2, n,
    );
  }
  faces.push(0, 1, 3, 0, 3, 2);
  const last = segments * 4;
  faces.push(last, last + 2, last + 3, last, last + 3, last + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(faces);
  geo.computeVertexNormals();
  return geo;
}

function buildPalaceBaseWrap() {
  const mats = kitMats();
  const g = new THREE.Group();
  g.userData.visualQaIgnore = true;
  const wall = new THREE.Mesh(openRingGeometry(8.7, 15.1, 1.05, 64, 0.72), mats.sandstone);
  wall.name = 'zabulistan-palace-base-low-terrace';
  wall.position.y = -0.12;
  wall.castShadow = false;
  wall.receiveShadow = true;
  g.add(wall);
  const lip = new THREE.Mesh(openRingGeometry(8.35, 15.45, 0.16, 64, 0.78), mats.cliffWarm);
  lip.name = 'zabulistan-palace-base-warm-lip';
  lip.position.y = 0.84;
  lip.castShadow = true;
  lip.receiveShadow = true;
  g.add(lip);
  for (let i = 0; i < 34; i++) {
    const t = (i + 0.5) / 34;
    const a = 0.42 + (TAU - 0.84) * t;
    const r = 14.05 + (i % 3) * 0.18;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.16, 0.38), i % 2 ? mats.terraceTop : mats.sandstone);
    stone.name = `zabulistan-palace-base-cap-${i}`;
    stone.position.set(Math.sin(a) * r, 1.07, Math.cos(a) * r);
    stone.rotation.y = a;
    stone.scale.set(1 + (i % 4) * 0.08, 1, 0.82 + (i % 5) * 0.04);
    stone.castShadow = true;
    stone.receiveShadow = true;
    g.add(stone);
  }
  return g;
}

function addPalaceFacadeDressing(map, group, fwd, side, yaw) {
  const exit = map.exitPos;
  const base = exit.clone().addScaledVector(fwd, 11.5);

  const mats = kitMats();
  const fallback = new THREE.Group();
  fallback.name = 'zabulistan-palace-facade-fallback';
  fallback.position.set(base.x, map.heightAt(base.x, base.z) + 0.12, base.z);
  fallback.rotation.y = yaw;
  fallback.userData.visualQaIgnore = true;

  const box = new THREE.BoxGeometry(1, 1, 1);
  const addBox = (name, x, y, z, sx, sy, sz, mat, rz = 0) => {
    const mesh = new THREE.Mesh(box, mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    fallback.add(mesh);
    return mesh;
  };

  addBox('zabulistan-palace-facade-shadow-recess', 0, 2.15, -0.16, 1.34, 2.9, 0.1, mats.gateShadow);
  addBox('zabulistan-palace-facade-left-jamb', -1.18, 2.38, 0.0, 0.42, 3.86, 0.3, mats.facadeStone, 0.012);
  addBox('zabulistan-palace-facade-right-jamb', 1.18, 2.38, 0.0, 0.42, 3.86, 0.3, mats.facadeStone, -0.012);
  addBox('zabulistan-palace-facade-left-buttress', -2.35, 2.08, 0.02, 0.54, 3.35, 0.34, mats.sandstone);
  addBox('zabulistan-palace-facade-right-buttress', 2.35, 2.08, 0.02, 0.54, 3.35, 0.34, mats.sandstone);
  addBox('zabulistan-palace-facade-left-door', -0.42, 1.55, 0.08, 0.78, 2.36, 0.055, mats.gateWood);
  addBox('zabulistan-palace-facade-right-door', 0.42, 1.55, 0.08, 0.78, 2.36, 0.055, mats.gateWood);
  addBox('zabulistan-palace-facade-door-seam', 0, 1.55, 0.13, 0.045, 2.42, 0.04, mats.gateBronze);
  for (const z of [0.72, 1.45, 2.16]) {
    addBox(`zabulistan-palace-facade-door-band-${z}`, 0, z, 0.15, 1.46, 0.045, 0.04, mats.gateBronze);
  }
  addBox('zabulistan-palace-facade-turquoise-sill', 0, 3.04, 0.14, 1.48, 0.09, 0.04, mats.agedTurquoise);
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * (i / 10);
    const x = Math.cos(a) * 1.14;
    const y = 3.14 + Math.sin(a) * 1.08;
    addBox(`zabulistan-palace-facade-arch-stone-${i}`, x, y, 0.04, 0.34, 0.25, 0.13, i % 4 === 1 ? mats.facadeLight : mats.facadeStone, Math.PI / 2 - a);
  }
  for (const [i, y] of [4.22, 4.9, 5.56].entries()) {
    addBox(`zabulistan-palace-facade-weathered-course-${i}`, 0, y, 0.06, 4.9 - i * 0.28, 0.09, 0.16, i === 1 ? mats.facadeLight : mats.sandstone);
  }
  for (const [i, x] of [-2.38, -1.5, -0.62, 0.62, 1.5, 2.38].entries()) {
    addBox(`zabulistan-palace-facade-parapet-chip-${i}`, x, 5.98 + (i % 2) * 0.04, -0.02, 0.42, 0.32, 0.22, i % 2 ? mats.facadeStone : mats.sandstone);
  }
  for (const lane of [-1, 1]) {
    addBox(`zabulistan-palace-facade-standard-pole-${lane < 0 ? 'left' : 'right'}`, lane * 2.1, 3.12, -0.48, 0.055, 1.78, 0.045, mats.gateWood);
    addBox(`zabulistan-palace-facade-standard-cloth-${lane < 0 ? 'left' : 'right'}`, lane * 2.34, 2.8, -0.52, 0.46, 1.04, 0.036, lane < 0 ? MATS().clothRed : MATS().clothGold, lane * 0.04);
  }
  group.add(fallback);
  return false;
}

function trackFlame(map, kitGroup, flame, campPoint = null) {
  kitGroup.userData.animatedFlames?.push(flame);
  map.propFlames?.push(flame);
  if (campPoint) {
    kitGroup.userData.campfires?.push(campPoint);
    map.campfires?.push(campPoint);
  }
}

function replacePads(map, group) {
  const mats = kitMats();
  const padBlends = [];
  const fallbackDust = [];
  const dustGeo = new THREE.CircleGeometry(1, 24);
  dustGeo.rotateX(-Math.PI / 2);
  for (const pad of map.pads || []) {
    if (pad.mesh) {
      pad.mesh.visible = false;
      pad.mesh.userData.zabulistanReplaced = true;
    }
    const y = map.heightAt(pad.pos.x, pad.pos.z);
    padBlends.push(matrix(pad.pos.x, y + 0.035, pad.pos.z, pad.rot, 1, 1, 1));
    fallbackDust.push(matrix(pad.pos.x, y + 0.035, pad.pos.z, pad.rot, 4.25, 1, 3.05));
    const g = buildZabulistanPad();
    g.position.copy(pad.pos);
    g.position.y -= 0.12;
    g.rotation.y = pad.rot;
    group.add(g);
  }
  const authoredBlend = instanceProp('zv_pad_ground_blend', padBlends, {
    unit: 1,
    tint: 0x5d3d26,
    castShadow: false,
    receiveShadow: true,
    frustumCulled: false,
  });
  if (authoredBlend) {
    authoredBlend.name = 'zabulistan-pad-ground-blend';
    authoredBlend.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
        o.renderOrder = 1;
      }
    });
    group.add(authoredBlend);
  } else {
    addInstanced(group, dustGeo, mats.padDust, fallbackDust, { castShadow: false, receiveShadow: false });
  }
}

function dressRoadShoulders(map, group, rng) {
  const profile = stageKitProfile(map);
  const mats = kitMats();
  const dustGeo = new THREE.CircleGeometry(1, 18);
  dustGeo.rotateX(-Math.PI / 2);
  const dust = [];
  const roadEdges = [];
  const roadFragments = [];
  const roadScree = [];
  const roadAprons = [];
  const stoneM = [];
  const stoneGeo = new THREE.DodecahedronGeometry(0.38, 0);
  for (const path of map.paths || []) {
    const samples = path.samples || [];
    for (let i = 4; i < samples.length - 5; i += profile.roadShoulderStride) {
      const s = samples[i];
      const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
      for (const dir of [-1, 1]) {
        const jitter = 2.6 + rng() * 1.8;
        const x = s.pos.x + side.x * jitter * dir + (rng() - 0.5) * 0.9;
        const z = s.pos.z + side.z * jitter * dir + (rng() - 0.5) * 0.9;
        if (Math.hypot(x - map.exitPos.x, z - map.exitPos.z) < (map._footprint || 12) + 8) continue;
        if (map.visualBoard?.shape === 'circle' && Math.hypot(x, z) > map.visualBoard.radius - 2) continue;
        const y = map.heightAt(x, z) + 0.065;
        dust.push(matrix(x, y, z, rng() * TAU, 1.65 + rng() * 1.95, 1, 0.68 + rng() * 0.62));
        const along = Math.atan2(-s.tangent.z, s.tangent.x);
        if (rng() < 0.48) {
          roadAprons.push(matrix(
            x + (rng() - 0.5) * 0.9,
            y + 0.003,
            z + (rng() - 0.5) * 0.9,
            along + (rng() - 0.5) * 0.35,
            0.92 + rng() * 0.36,
            1,
            0.72 + rng() * 0.25,
          ));
        }
        if (rng() < 0.52) {
          roadEdges.push(matrix(
            x + (rng() - 0.5) * 0.8,
            y + 0.008,
            z + (rng() - 0.5) * 0.8,
            along + (rng() - 0.5) * 0.28,
            0.78 + rng() * 0.34,
            1,
            0.72 + rng() * 0.24,
          ));
          if (rng() < 0.14) {
            roadFragments.push(matrix(
              x + (rng() - 0.5) * 1.1,
              y + 0.014,
              z + (rng() - 0.5) * 1.1,
              along + (rng() - 0.5) * 0.42,
              0.58 + rng() * 0.22,
              1,
              0.66 + rng() * 0.18,
            ));
          }
        }
        if (rng() < 0.44) {
          roadScree.push(matrix(
            x + (rng() - 0.5) * 0.7,
            y + 0.005,
            z + (rng() - 0.5) * 0.7,
            along + (rng() - 0.5) * 0.34,
            0.88 + rng() * 0.28,
            1,
            0.72 + rng() * 0.22,
          ));
        }
        if (rng() < 0.58) stoneM.push(matrix(x + (rng() - 0.5) * 1.2, y + 0.028, z + (rng() - 0.5) * 1.2, rng() * TAU, 0.52 + rng() * 0.64, 0.12 + rng() * 0.16, 0.4 + rng() * 0.4, rng() * 0.26, rng() * 0.26));
      }
    }
  }
  const authoredAprons = instanceProp('zv_road_apron_breakup', roadAprons, { unit: 1, tint: 0x40372c, castShadow: false, receiveShadow: true });
  if (authoredAprons) {
    authoredAprons.name = 'zabulistan-road-apron-breakup';
    authoredAprons.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
        o.renderOrder = 1;
      }
    });
    group.add(authoredAprons);
  }
  const authoredEdges = instanceProp('zv_packed_road_edge', roadEdges, { unit: 1, tint: 0x453b30, receiveShadow: true });
  addInstanced(group, dustGeo, mats.shoulderDust, dust, { castShadow: false, receiveShadow: false });
  if (authoredEdges) group.add(authoredEdges);
  const authoredScree = instanceProp('zv_road_scree_bank', roadScree, { unit: 1, tint: 0x504638, receiveShadow: true });
  if (authoredScree) group.add(authoredScree);
  const authoredFragments = instanceProp('zv_road_stone_fragments', roadFragments, { unit: 1, tint: 0x41382d, receiveShadow: true });
  if (authoredFragments) group.add(authoredFragments);
  const authoredStones = (authoredEdges || authoredFragments) ? null : instanceProp('zv_road_edge_stones', stoneM, { unit: 1, tint: 0x4a4034, receiveShadow: true });
  if (authoredStones) group.add(authoredStones);
  else if (!authoredEdges && !authoredFragments) addInstanced(group, stoneGeo, mats.sandstoneDark, stoneM);
}

function addGroundPatches(map, group, rng) {
  const profile = stageKitProfile(map);
  const mats = kitMats();
  const patchGeo = new THREE.CircleGeometry(1, 9);
  patchGeo.rotateX(-Math.PI / 2);
  const patches = [];
  for (let i = 0; i < profile.groundPatchCount; i++) {
    const p = randomClearPoint(map, rng, 3.6, 90);
    if (!p) continue;
    const [x, y, z] = p;
    const near = map._nearRoad?.(x, z, 11);
    const sx = near ? 1.15 + rng() * 1.8 : 1.5 + rng() * 2.6;
    const sz = near ? 0.34 + rng() * 0.56 : 0.48 + rng() * 0.82;
    patches.push(matrix(x, y + 0.055, z, rng() * TAU, sx, 1, sz));
  }
  addInstanced(group, patchGeo, mats.padDust, patches, { castShadow: false, receiveShadow: false });
}

function addRoadsideCliffShoulders(map, group, rng) {
  const mats = kitMats();
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const shoulderSets = [];
  const face = [];
  const shadow = [];
  const warm = [];
  for (const path of map.paths || []) {
    const samples = path.samples || [];
    for (let i = 7; i < samples.length - 8; i += 8) {
      const s = samples[i];
      const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      for (const dir of [-1, 1]) {
        if (rng() < 0.34) continue;
        const off = 5.1 + rng() * 3.1;
        const x = s.pos.x + side.x * off * dir + (rng() - 0.5) * 0.9;
        const z = s.pos.z + side.z * off * dir + (rng() - 0.5) * 0.9;
        if (!clearPadAndCitadel(map, x, z, 3.6)) continue;
        const h = 1.1 + rng() * 2.8;
        shoulderSets.push(matrix(
          x,
          map.heightAt(x, z) - 0.06,
          z,
          yaw + Math.PI / 2 + (rng() - 0.5) * 0.45,
          0.78 + rng() * 0.3,
          0.8 + Math.min(0.44, h * 0.12),
          0.82 + rng() * 0.28,
          (rng() - 0.5) * 0.08,
          (rng() - 0.5) * 0.08,
        ));
        const mat = rng() < 0.22 ? shadow : rng() < 0.58 ? warm : face;
        mat.push(matrix(
          x,
          map.heightAt(x, z) + h * 0.34 - 0.28,
          z,
          yaw + Math.PI / 2 + (rng() - 0.5) * 0.55,
          0.9 + rng() * 1.7,
          h,
          0.9 + rng() * 2.1,
          (rng() - 0.5) * 0.28,
          (rng() - 0.5) * 0.26,
        ));

        if (rng() < 0.35) {
          const x2 = x + side.x * dir * (1.3 + rng() * 1.3);
          const z2 = z + side.z * dir * (1.3 + rng() * 1.3);
          if (clearPadAndCitadel(map, x2, z2, 2.6)) {
            warm.push(matrix(
              x2,
              map.heightAt(x2, z2) + 0.16,
              z2,
              yaw + (rng() - 0.5) * 0.7,
              1.2 + rng() * 2.0,
              0.28 + rng() * 0.26,
              0.7 + rng() * 1.3,
              (rng() - 0.5) * 0.18,
              (rng() - 0.5) * 0.18,
            ));
          }
        }
      }
    }
  }
  const authoredShoulders = instanceProp('zv_cliff_shoulder_set', shoulderSets, { unit: 1, tint: 0x4f4f49, receiveShadow: true });
  if (authoredShoulders) {
    group.add(authoredShoulders);
    return;
  }
  addInstanced(group, rockGeo, mats.cliffFace, face, { castShadow: true, receiveShadow: true });
  addInstanced(group, rockGeo, mats.cliffShadow, shadow, { castShadow: true, receiveShadow: true });
  addInstanced(group, rockGeo, mats.cliffWarm, warm, { castShadow: true, receiveShadow: true });
}

function buildSpikeFence(width = 5.4, height = 1.55) {
  const b = new MeshBuilder();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + (width * i) / (n - 1);
    b.cyl(0.045, 0.07, height, 5, 'woodDark', x, height * 0.48, 0, 0.26, (i % 2 ? -0.16 : 0.16));
    b.cone(0.13, 0.42, 5, 'wood', x, height + 0.06, 0);
  }
  b.box(width + 0.5, 0.12, 0.16, 'wood', 0, 0.72, 0.04, 0, 0, 0.06);
  b.box(width + 0.2, 0.1, 0.14, 'woodDark', 0, 1.18, -0.05, 0, 0, -0.05);
  return b.build(true, true);
}

function buildBeaconTower(scale = 1) {
  const g = new THREE.Group();
  const b = new MeshBuilder();
  const s = scale;
  for (const x of [-0.95, 0.95]) {
    for (const z of [-0.95, 0.95]) {
      b.box(0.16 * s, 3.35 * s, 0.16 * s, 'woodDark', x * s, 1.66 * s, z * s, 0, x * z > 0 ? 0.08 : -0.08, x > 0 ? 0.06 : -0.06);
    }
  }
  b.box(2.45 * s, 0.18 * s, 2.45 * s, 'wood', 0, 3.0 * s, 0);
  b.box(2.9 * s, 0.16 * s, 0.16 * s, 'woodDark', 0, 1.25 * s, 0.9 * s, 0, 0, 0.18);
  b.box(2.9 * s, 0.16 * s, 0.16 * s, 'woodDark', 0, 2.02 * s, -0.9 * s, 0, 0, -0.18);
  b.box(0.16 * s, 0.16 * s, 2.9 * s, 'woodDark', 0.9 * s, 1.6 * s, 0, 0.18);
  b.box(0.16 * s, 0.16 * s, 2.9 * s, 'woodDark', -0.9 * s, 2.34 * s, 0, -0.18);
  b.cyl(0.64 * s, 0.78 * s, 0.26 * s, 14, 'bronze', 0, 3.24 * s, 0);
  b.cyl(0.36 * s, 0.48 * s, 0.18 * s, 14, 'stoneDark', 0, 3.4 * s, 0);
  b.box(2.6 * s, 0.12 * s, 0.18 * s, 'woodDark', 0, 3.42 * s, 1.22 * s);
  b.box(2.6 * s, 0.12 * s, 0.18 * s, 'woodDark', 0, 3.42 * s, -1.22 * s);
  b.box(0.18 * s, 0.12 * s, 2.6 * s, 'woodDark', 1.22 * s, 3.42 * s, 0);
  b.box(0.18 * s, 0.12 * s, 2.6 * s, 'woodDark', -1.22 * s, 3.42 * s, 0);
  g.add(b.build(true, true));
  const flame = makeFlame(0.84 * s);
  flame.position.y = 3.42 * s;
  g.add(flame);
  g.userData.flame = flame;
  return g;
}

function buildSiegeFrame(scale = 1) {
  const g = new THREE.Group();
  const b = new MeshBuilder();
  const s = scale;
  b.box(2.9 * s, 0.22 * s, 1.4 * s, 'woodDark', 0, 0.55 * s, 0);
  b.box(0.22 * s, 1.7 * s, 0.22 * s, 'wood', -1.15 * s, 1.2 * s, -0.42 * s, 0, 0, -0.22);
  b.box(0.22 * s, 1.7 * s, 0.22 * s, 'wood', 1.15 * s, 1.2 * s, -0.42 * s, 0, 0, 0.22);
  b.box(0.18 * s, 2.55 * s, 0.18 * s, 'woodDark', 0, 1.8 * s, 0.02 * s, Math.PI / 2, 0.42);
  b.cyl(0.28 * s, 0.28 * s, 0.22 * s, 16, 'wood', -1.2 * s, 0.22 * s, 0.82 * s, Math.PI / 2);
  b.cyl(0.28 * s, 0.28 * s, 0.22 * s, 16, 'wood', 1.2 * s, 0.22 * s, 0.82 * s, Math.PI / 2);
  b.box(0.66 * s, 0.36 * s, 0.36 * s, 'stoneDark', 0.55 * s, 2.7 * s, 0.18 * s, 0.22);
  g.add(b.build(true, true));
  return g;
}

function placeLocalGroup(map, group, obj, x, z, ry, yOffset = 0) {
  obj.position.set(x, map.heightAt(x, z) + yOffset, z);
  obj.rotation.y = ry;
  group.add(obj);
}

function addSiegeLandmarks(map, group, rng) {
  const profile = stageKitProfile(map);
  for (const path of map.paths || []) {
    if (!path.length) continue;
    const marks = profile.beaconMarks;
    for (let i = 0; i < marks.length; i++) {
      const s = path.samples[Math.max(0, Math.min(path.samples.length - 1, Math.floor(marks[i] * (path.samples.length - 1))))];
      const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
      const dir = i % 2 ? -1 : 1;
      const x = s.pos.x + side.x * (7.0 + rng() * 2.2) * dir;
      const z = s.pos.z + side.z * (7.0 + rng() * 2.2) * dir;
      if (!clearLoose(map, x, z, 3.2)) continue;
      const yaw = Math.atan2(s.tangent.x, s.tangent.z) + Math.PI * (dir > 0 ? 0.5 : -0.5);
      const tower = buildBeaconTower(0.86 + rng() * 0.18);
      placeLocalGroup(map, group, tower, x, z, yaw);
      trackFlame(map, group, tower.userData.flame);
    }

    const siegeMarks = profile.siegeMarks;
    for (let i = 0; i < siegeMarks.length; i++) {
      const s = path.samples[Math.max(0, Math.min(path.samples.length - 1, Math.floor(siegeMarks[i] * (path.samples.length - 1))))];
      const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
      const dir = i % 2 ? 1 : -1;
      const x = s.pos.x + side.x * (10.5 + rng() * 2.4) * dir;
      const z = s.pos.z + side.z * (10.5 + rng() * 2.4) * dir;
      if (!clearLoose(map, x, z, 4.0)) continue;
      const yaw = Math.atan2(s.tangent.x, s.tangent.z) + (dir > 0 ? -0.9 : 0.9);
      placeLocalGroup(map, group, buildSiegeFrame(0.95 + rng() * 0.22), x, z, yaw);
    }
  }
}

function addRoadDefenses(map, group, rng) {
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const mats = kitMats();
  const wallM = [];
  for (const path of map.paths || []) {
    const samples = path.samples || [];
    for (let i = 10; i < samples.length - 14; i += 13) {
      if (rng() < 0.72) continue;
      const s = samples[i];
      const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      for (const dir of [-1, 1]) {
        if (rng() < 0.64) continue;
        const x = s.pos.x + side.x * (3.9 + rng() * 0.75) * dir;
        const z = s.pos.z + side.z * (3.9 + rng() * 0.75) * dir;
        if (map.visualBoard?.shape === 'circle' && Math.hypot(x, z) > map.visualBoard.radius - 3) continue;
        wallM.push(matrix(x, map.heightAt(x, z) + 0.15, z, yaw + (rng() - 0.5) * 0.28, 0.82 + rng() * 0.65, 0.22 + rng() * 0.18, 0.34 + rng() * 0.18));
      }
      if (rng() < 0.035) {
        const fence = buildSpikeFence(4.8 + rng() * 1.8, 1.2 + rng() * 0.22);
        const dir = rng() < 0.5 ? -1 : 1;
        const x = s.pos.x + side.x * 4.0 * dir;
        const z = s.pos.z + side.z * 4.0 * dir;
        placeLocalGroup(map, group, fence, x, z, yaw + Math.PI / 2 + (rng() - 0.5) * 0.45, 0.02);
      }
    }
  }
  addInstanced(group, wallGeo, mats.cliffWarm, wallM, { castShadow: true, receiveShadow: true });
}

function addCliffTerraces(map, group, rng) {
  const profile = stageKitProfile(map);
  const mats = kitMats();
  const cliffGeo = new THREE.DodecahedronGeometry(1, 0);
  const ridgeWalls = [];
  const cliff = [];
  const shadow = [];
  const radius = map.visualBoard?.radius || 86;
  const count = profile.ridgeWallCount;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + (rng() - 0.5) * 0.08;
    const r = radius - 5.4 - rng() * 5.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 4.2 + rng() * 6.4;
    const w = 2.2 + rng() * 3.8;
    const d = 2.8 + rng() * 4.8;
    const y = map.heightAt(x, z) + h * 0.42 - 1.0;
    if (rng() > 0.22) {
      ridgeWalls.push(matrix(
        x,
        map.heightAt(x, z) - 0.42,
        z,
        -a + Math.PI / 2 + (rng() - 0.5) * 0.42,
        0.64 + rng() * 0.28,
        0.58 + rng() * 0.22,
        0.58 + rng() * 0.3,
        (rng() - 0.5) * 0.08,
        (rng() - 0.5) * 0.1,
      ));
    }
    const m = matrix(x, y, z, -a + Math.PI / 2 + (rng() - 0.5) * 0.35, w, h, d, (rng() - 0.5) * 0.22, (rng() - 0.5) * 0.2);
    (i % 3 === 0 ? shadow : cliff).push(m);
  }

  const authoredRidge = instanceProp('zv_outer_ridge_wall_set', ridgeWalls, { unit: 1, tint: 0x4b4b45, receiveShadow: true });
  if (authoredRidge) {
    group.add(authoredRidge);
    return;
  }

  for (const path of map.paths || []) {
    const samples = path.samples || [];
    for (let i = 16; i < samples.length - 16; i += 20) {
      const s = samples[i];
      const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
      for (const dir of [-1, 1]) {
        if (rng() < 0.45) continue;
        const x = s.pos.x + side.x * (9.4 + rng() * 3.4) * dir;
        const z = s.pos.z + side.z * (9.4 + rng() * 3.4) * dir;
        if (!clearLoose(map, x, z, 4.5)) continue;
        const h = 2.8 + rng() * 3.8;
        cliff.push(matrix(x, map.heightAt(x, z) + h * 0.4 - 0.7, z, Math.atan2(s.tangent.x, s.tangent.z) + Math.PI / 2 + (rng() - 0.5), 1.8 + rng() * 2.8, h, 2.0 + rng() * 2.6, rng() * 0.22, rng() * 0.22));
      }
    }
  }

  addInstanced(group, cliffGeo, mats.cliffFace, cliff, { castShadow: true, receiveShadow: true });
  addInstanced(group, cliffGeo, mats.cliffShadow, shadow, { castShadow: true, receiveShadow: true });
}

function addPalaceCliffShelf(map, group, rng) {
  const { fwd, side, yaw } = pathApproach(map);
  const exit = map.exitPos;
  const insideBoard = (p, margin = 6) => {
    if (map.visualBoard?.shape !== 'circle') return true;
    return Math.hypot(p.x, p.z) < map.visualBoard.radius - margin;
  };
  const point = (forward, lateral) => exit.clone().addScaledVector(fwd, forward).addScaledVector(side, lateral);
  const placements = [
    { key: 'left-upper', forward: 2.6, lateral: -12.6, targetW: 8.2, yawAdjust: -0.62, yOffset: -0.08, tint: 0x555048, margin: 7 },
    { key: 'right-upper', forward: 3.0, lateral: 12.6, targetW: 8.0, yawAdjust: 0.58, yOffset: -0.08, tint: 0x565048, margin: 7 },
    { key: 'left-lower', forward: 10.0, lateral: -14.2, targetW: 7.8, yawAdjust: -0.78, yOffset: -0.1, tint: 0x514b43, margin: 6 },
    { key: 'right-lower', forward: 10.6, lateral: 14.0, targetW: 7.6, yawAdjust: 0.74, yOffset: -0.1, tint: 0x514b43, margin: 6 },
  ];

  let authored = 0;
  for (const spec of placements) {
    const p = point(spec.forward, spec.lateral);
    if (!insideBoard(p, spec.margin)) continue;
    if (placeAuthoredGroundProp(map, group, 'zv_palace_slope_terrace_set', p.x, p.z, yaw + spec.yawAdjust, {
      targetW: spec.targetW,
      yOffset: spec.yOffset,
      tint: spec.tint,
      sceneName: `zabulistan-palace-slope-terrace-${spec.key}`,
    })) authored++;
  }
  if (authored) return;

  const mats = kitMats();
  const fallback = new THREE.Group();
  fallback.name = 'zabulistan-palace-slope-terrace-fallback';
  group.add(fallback);

  const geo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = [];
  for (let i = 0; i < 16; i++) {
    const lane = i % 2 ? -1 : 1;
    const p = exit.clone()
      .addScaledVector(side, lane * (12.2 + (i % 4) * 1.15))
      .addScaledVector(fwd, -2.4 + Math.floor(i / 2) * 2.3);
    const h = 1.8 + rng() * 2.4;
    rocks.push(matrix(p.x, map.heightAt(p.x, p.z) + h * 0.34 - 0.52, p.z, yaw + lane * (Math.PI / 2 + rng() * 0.28), 1.45 + rng() * 1.2, h, 1.35 + rng() * 1.45, rng() * 0.14, rng() * 0.14));
  }
  addInstanced(fallback, geo, mats.cliffFace, rocks, { castShadow: true, receiveShadow: true });
}

function addPalaceForegroundTerraceWall(map, group, rng) {
  const { fwd, side, yaw } = pathApproach(map);
  const exit = map.exitPos;
  const insideBoard = (p, margin = 6) => {
    if (map.visualBoard?.shape !== 'circle') return true;
    return Math.hypot(p.x, p.z) < map.visualBoard.radius - margin;
  };
  const point = (forward, lateral) => exit.clone().addScaledVector(fwd, forward).addScaledVector(side, lateral);
  const addWarmApronCover = () => {
    const lateralRows = [-10.6, -7.1, -3.7, -1.2, 1.4, 4.1, 7.2, 10.4];
    const forwardRows = [5.45, 7.65, 10.25, 12.85];
    const verts = [];
    const colors = [];
    const idx = [];
    const edge = new THREE.Color(0x6e5b42);
    const mid = new THREE.Color(0x9b7d55);
    const sun = new THREE.Color(0xb69563);
    const c = new THREE.Color();
    for (let z = 0; z < forwardRows.length; z++) {
      for (let x = 0; x < lateralRows.length; x++) {
        const lat = lateralRows[x];
        const edgeT = Math.min(1, Math.abs(lat) / 10.6);
        const forward = forwardRows[z] + Math.sin(x * 1.37 + z * 0.72) * 0.28 + edgeT * 0.24;
        const p = point(forward, lat + Math.sin(z * 1.9 + x * 0.81) * 0.22);
        verts.push(p.x, map.heightAt(p.x, p.z) + 0.185 + z * 0.012, p.z);
        c.copy(sun).lerp(mid, z * 0.18).lerp(edge, edgeT * 0.55);
        c.offsetHSL(0, -0.04, (rng() - 0.5) * 0.035);
        colors.push(c.r, c.g, c.b);
      }
    }
    const row = lateralRows.length;
    for (let z = 0; z < forwardRows.length - 1; z++) {
      for (let x = 0; x < lateralRows.length - 1; x++) {
        const a = z * row + x;
        idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2.5,
      polygonOffsetUnits: -2.5,
    });
    const apron = new THREE.Mesh(geo, mat);
    apron.name = 'zabulistan-palace-foreground-warm-apron';
    apron.castShadow = false;
    apron.receiveShadow = false;
    apron.renderOrder = 3;
    apron.userData.visualQaIgnore = true;
    group.add(apron);

    const coverRows = [12.15, 13.05, 13.95];
    const coverLanes = [-10.2, -7.3, -4.4, -1.5, 1.4, 4.2, 7.1, 10.0];
    const coverVerts = [];
    const coverColors = [];
    const coverIdx = [];
    const coverEdge = new THREE.Color(0x8b6f4e);
    const coverMid = new THREE.Color(0xb89460);
    const coverLight = new THREE.Color(0xcda76c);
    for (let z = 0; z < coverRows.length; z++) {
      for (let x = 0; x < coverLanes.length; x++) {
        const lateral = coverLanes[x] + Math.sin(z * 1.41 + x * 0.72) * 0.18;
        const forward = coverRows[z] + Math.sin(x * 0.93 + z * 1.22) * 0.14;
        const p = point(forward, lateral);
        const edgeT = Math.min(1, Math.abs(lateral) / 10.2);
        c.copy(coverLight).lerp(coverMid, z * 0.24).lerp(coverEdge, edgeT * 0.4);
        c.offsetHSL(0, -0.025, (rng() - 0.5) * 0.03);
        coverVerts.push(p.x, map.heightAt(p.x, p.z) + 0.265 + z * 0.01, p.z);
        coverColors.push(c.r, c.g, c.b);
      }
    }
    const coverRow = coverLanes.length;
    for (let z = 0; z < coverRows.length - 1; z++) {
      for (let x = 0; x < coverLanes.length - 1; x++) {
        const a = z * coverRow + x;
        coverIdx.push(a, a + coverRow, a + 1, a + 1, a + coverRow, a + coverRow + 1);
      }
    }
    const coverGeo = new THREE.BufferGeometry();
    coverGeo.setAttribute('position', new THREE.Float32BufferAttribute(coverVerts, 3));
    coverGeo.setAttribute('color', new THREE.Float32BufferAttribute(coverColors, 3));
    coverGeo.setIndex(coverIdx);
    coverGeo.computeVertexNormals();
    const coverMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const cover = new THREE.Mesh(coverGeo, coverMat);
    cover.name = 'zabulistan-palace-threshold-warm-cover';
    cover.castShadow = false;
    cover.receiveShadow = false;
    cover.renderOrder = 7;
    cover.userData.visualQaIgnore = true;
    group.add(cover);

    const sillGeo = new THREE.BoxGeometry(1, 1, 1);
    const sillMats = kitMats();
    const sillBands = [
      { forward: 7.15, lanes: [-7.6, -4.75, -1.9, 1.05, 4.2, 7.25], width: 2.05, height: 0.18, depth: 0.42, y: 0.41, mat: sillMats.sandstone },
      { forward: 8.55, lanes: [-6.45, -3.35, -0.25, 2.85, 6.1], width: 2.25, height: 0.15, depth: 0.36, y: 0.46, mat: sillMats.terraceTop },
      { forward: 10.05, lanes: [-5.55, -2.65, 0.45, 3.65, 6.75], width: 1.9, height: 0.14, depth: 0.32, y: 0.5, mat: sillMats.sandstone },
      { forward: 11.85, lanes: [-8.25, -5.1, -1.95, 1.45, 4.85, 8.1], width: 2.3, height: 0.14, depth: 0.34, y: 0.42, mat: sillMats.sandstone },
      { forward: 13.45, lanes: [-8.75, -5.55, -2.15, 1.25, 4.9, 8.35], width: 2.05, height: 0.12, depth: 0.28, y: 0.36, mat: sillMats.terraceTop },
    ];
    for (const [i, band] of sillBands.entries()) {
      for (const [j, lateral] of band.lanes.entries()) {
        if ((i + j) % 7 === 0) continue;
        const offset = Math.sin(i * 1.4 + j * 0.77) * 0.18;
        const p = point(band.forward + Math.cos(j * 0.9 + i) * 0.08, lateral + offset);
        const sill = new THREE.Mesh(sillGeo, band.mat);
        sill.name = `zabulistan-palace-foreground-warm-sill-${i}-${j}`;
        sill.position.set(p.x, map.heightAt(p.x, p.z) + band.y + (j % 2) * 0.012, p.z);
        sill.rotation.y = yaw + (i - 2) * 0.018 + (j - band.lanes.length / 2) * 0.01;
        sill.scale.set(band.width * (0.82 + ((i + j) % 3) * 0.12), band.height, band.depth * (0.9 + (j % 2) * 0.16));
        sill.castShadow = false;
        sill.receiveShadow = true;
        group.add(sill);
      }
    }

    const chipGeo = new THREE.DodecahedronGeometry(1, 0);
    const chips = [];
    for (let i = 0; i < 34; i++) {
      const lane = i % 2 ? -1 : 1;
      const p = point(6.0 + rng() * 6.8, lane * (3.0 + rng() * 6.2));
      const s = 0.18 + rng() * 0.36;
      chips.push(matrix(p.x, map.heightAt(p.x, p.z) + 0.21, p.z, rng() * TAU, s * (1.1 + rng() * 1.2), s * 0.24, s * (0.62 + rng() * 0.82), rng() * 0.2, rng() * 0.18));
    }
    addInstanced(group, chipGeo, sillMats.sandstone, chips, { castShadow: false, receiveShadow: true });
  };
  const placements = [
    { key: 'main', forward: 8.2, lateral: 0, targetW: 22.4, yawAdjust: 0, yOffset: 0.04, tint: 0x806d4f, margin: 9 },
  ];

  let authored = 0;
  for (const spec of placements) {
    const p = point(spec.forward, spec.lateral);
    if (!insideBoard(p, spec.margin)) continue;
    if (placeAuthoredGroundProp(map, group, 'zv_palace_foreground_terrace_wall', p.x, p.z, yaw + spec.yawAdjust, {
      targetW: spec.targetW,
      yOffset: spec.yOffset,
      tint: spec.tint,
      sceneName: `zabulistan-palace-foreground-terrace-wall-${spec.key}`,
    })) authored++;
  }
  if (authored) {
    addWarmApronCover();
    return;
  }

  const mats = kitMats();
  const fallback = new THREE.Group();
  fallback.name = 'zabulistan-palace-foreground-terrace-wall-fallback';
  group.add(fallback);

  const center = point(8.2, 0);
  const dustGeo = new THREE.CircleGeometry(1, 36);
  dustGeo.rotateX(-Math.PI / 2);
  const wash = addInstanced(fallback, dustGeo, mats.forecourtDust, [
    matrix(center.x, map.heightAt(center.x, center.z) + 0.14, center.z, yaw, 12.2, 1, 6.4),
  ], { castShadow: false, receiveShadow: false });
  if (wash) {
    wash.name = 'zabulistan-palace-foreground-terrace-wall-wash';
    wash.userData.visualQaIgnore = true;
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const step = [];
  for (let i = 0; i < 4; i++) {
    const p = point(4.9 + i * 0.62, 0.08 - i * 0.06);
    step.push(matrix(p.x, map.heightAt(p.x, p.z) + 0.16 + i * 0.035, p.z, yaw - 0.015 + i * 0.018, 7.8 - i * 0.6, 0.12, 0.34));
  }
  addInstanced(fallback, boxGeo, mats.sandstone, step, { castShadow: true, receiveShadow: true });

  const wall = [];
  const caps = [];
  const shoulder = [];
  for (const lane of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const p = point(4.6 + i * 0.72, lane * (5.55 + i * 0.34 + (i % 2) * 0.16));
      wall.push(matrix(p.x, map.heightAt(p.x, p.z) + 0.42, p.z, yaw + lane * (0.18 + i * 0.032), 1.14 + (i % 3) * 0.16, 0.72 + (i % 2) * 0.08, 0.54));
      caps.push(matrix(p.x + side.x * lane * 0.08, map.heightAt(p.x, p.z) + 0.82, p.z + side.z * lane * 0.08, yaw + lane * (0.18 + i * 0.032), 1.04 + (i % 2) * 0.12, 0.16, 0.36));
    }
    for (let i = 0; i < 9; i++) {
      const p = point(4.2 + i * 0.94, lane * (8.1 + (i % 4) * 0.46));
      const h = 1.0 + rng() * 1.4;
      shoulder.push(matrix(p.x, map.heightAt(p.x, p.z) + h * 0.28 - 0.18, p.z, yaw + lane * (0.52 + rng() * 0.24), 0.8 + rng() * 0.72, h, 0.72 + rng() * 0.75, rng() * 0.12, rng() * 0.12));
    }
  }
  addInstanced(fallback, boxGeo, mats.sandstoneDark, wall, { castShadow: true, receiveShadow: true });
  addInstanced(fallback, boxGeo, mats.sandstone, caps, { castShadow: true, receiveShadow: true });
  addInstanced(fallback, new THREE.DodecahedronGeometry(1, 0), mats.cliffFace, shoulder, { castShadow: true, receiveShadow: true });

  const pebbles = [];
  const pebbleGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 38; i++) {
    const lane = i % 2 ? -1 : 1;
    const p = point(5.0 + rng() * 6.6, lane * (2.2 + rng() * 5.2));
    const s = 0.18 + rng() * 0.32;
    pebbles.push(matrix(p.x, map.heightAt(p.x, p.z) + 0.12, p.z, rng() * TAU, s * (1.3 + rng() * 0.8), s * 0.34, s * (0.8 + rng() * 0.7), rng() * 0.22, rng() * 0.2));
  }
  addInstanced(fallback, pebbleGeo, mats.cliffWarm, pebbles, { castShadow: true, receiveShadow: true });
  addWarmApronCover();
}

function addGateApproachDepth(map, group, rng) {
  const { fwd, side, yaw } = pathApproach(map);
  const exit = map.exitPos;
  const insideBoard = (p, margin = 6) => {
    if (map.visualBoard?.shape !== 'circle') return true;
    return Math.hypot(p.x, p.z) < map.visualBoard.radius - margin;
  };
  const point = (forward, lateral) => exit.clone().addScaledVector(fwd, forward).addScaledVector(side, lateral);
  const placements = [
    { key: 'left-upper', lane: -1, forward: 14.6, lateral: -11.0, targetW: 11.2, yawAdjust: -0.34 },
    { key: 'right-upper', lane: 1, forward: 15.4, lateral: 11.2, targetW: 10.9, yawAdjust: 0.36 },
    { key: 'left-lower', lane: -1, forward: 23.8, lateral: -13.8, targetW: 8.9, yawAdjust: -0.56 },
    { key: 'right-lower', lane: 1, forward: 25.2, lateral: 13.5, targetW: 8.7, yawAdjust: 0.52 },
  ];

  let authored = 0;
  for (const spec of placements) {
    const p = point(spec.forward, spec.lateral);
    if (!insideBoard(p, spec.key.includes('lower') ? 8 : 6)) continue;
    if (placeAuthoredGroundProp(map, group, 'zv_gate_cliff_siege_set', p.x, p.z, yaw + spec.yawAdjust, {
      targetW: spec.targetW,
      yOffset: -0.035,
      tint: 0x4f4638,
      sceneName: `zabulistan-gate-cliff-siege-${spec.key}`,
    })) authored++;
  }

  const beaconSpecs = [
    { key: 'left', lane: -1, forward: 12.4, lateral: -8.7, scale: 0.6, yawAdjust: -0.18 },
    { key: 'right', lane: 1, forward: 12.9, lateral: 8.8, scale: 0.6, yawAdjust: 0.18 },
    { key: 'lower-left', lane: -1, forward: 22.6, lateral: -10.5, scale: 0.54, yawAdjust: -0.28 },
    { key: 'lower-right', lane: 1, forward: 23.9, lateral: 10.3, scale: 0.54, yawAdjust: 0.28 },
  ];
  for (const spec of beaconSpecs) {
    const p = point(spec.forward, spec.lateral);
    if (!insideBoard(p, 6)) continue;
    const tower = buildBeaconTower(spec.scale);
    tower.name = `zabulistan-gate-depth-beacon-${spec.key}`;
    placeLocalGroup(map, group, tower, p.x, p.z, yaw + spec.yawAdjust);
    trackFlame(map, group, tower.userData.flame, new THREE.Vector3(p.x, map.heightAt(p.x, p.z) + 1.0, p.z));
  }

  if (authored) return;

  const mats = kitMats();
  const fallback = new THREE.Group();
  fallback.name = 'zabulistan-gate-approach-depth-fallback';
  group.add(fallback);
  const cliffGeo = new THREE.DodecahedronGeometry(1, 0);
  const face = [];
  const shadow = [];
  const warm = [];
  for (const spec of placements) {
    const center = point(spec.forward, spec.lateral);
    if (!insideBoard(center, 7)) continue;
    for (let i = 0; i < 5; i++) {
      const lane = spec.lane;
      const p = center.clone()
        .addScaledVector(side, lane * (-1.4 + i * 0.78 + rng() * 0.35))
        .addScaledVector(fwd, -2.0 + i * 0.92 + (rng() - 0.5) * 0.52);
      const h = 1.8 + rng() * 2.6 + (spec.key.includes('upper') ? 0.8 : 0);
      const target = i % 3 === 0 ? shadow : i % 2 === 0 ? warm : face;
      target.push(matrix(
        p.x,
        map.heightAt(p.x, p.z) + h * 0.34 - 0.5,
        p.z,
        yaw + spec.yawAdjust + lane * (0.42 + rng() * 0.2),
        1.2 + rng() * 1.4,
        h,
        1.0 + rng() * 1.3,
        (rng() - 0.5) * 0.2,
        (rng() - 0.5) * 0.18,
      ));
    }
    const frameAt = center.clone().addScaledVector(fwd, spec.key.includes('upper') ? 0.4 : -0.6);
    const frame = buildSiegeFrame(spec.key.includes('upper') ? 0.74 : 0.58);
    frame.name = `zabulistan-gate-depth-siege-frame-${spec.key}`;
    placeLocalGroup(map, fallback, frame, frameAt.x, frameAt.z, yaw + spec.yawAdjust);
    const fenceAt = center.clone().addScaledVector(side, spec.lane * -2.2).addScaledVector(fwd, -1.8);
    const fence = buildSpikeFence(spec.key.includes('upper') ? 4.6 : 3.7, spec.key.includes('upper') ? 1.22 : 1.04);
    fence.name = `zabulistan-gate-depth-palisade-${spec.key}`;
    placeLocalGroup(map, fallback, fence, fenceAt.x, fenceAt.z, yaw + spec.yawAdjust + Math.PI / 2, 0.02);
  }
  addInstanced(fallback, cliffGeo, mats.cliffFace, face, { castShadow: true, receiveShadow: true });
  addInstanced(fallback, cliffGeo, mats.cliffShadow, shadow, { castShadow: true, receiveShadow: true });
  addInstanced(fallback, cliffGeo, mats.cliffWarm, warm, { castShadow: true, receiveShadow: true });
}

function scatterScrubAndReeds(map, group, rng) {
  const profile = stageKitProfile(map);
  const mats = kitMats();
  const scrubGeo = new THREE.ConeGeometry(0.22, 0.62, 6);
  scrubGeo.translate(0, 0.31, 0);
  const darkGeo = new THREE.ConeGeometry(0.18, 0.52, 5);
  darkGeo.translate(0, 0.26, 0);
  const reedGeo = new THREE.ConeGeometry(0.055, 1.28, 5);
  reedGeo.translate(0, 0.64, 0);
  const tipGeo = new THREE.SphereGeometry(0.07, 6, 5);
  const scrub = [], scrubDark = [], reeds = [], reedTips = [];
  const patchGeo = new THREE.CircleGeometry(1, 20);
  patchGeo.rotateX(-Math.PI / 2);
  const patches = [];
  const scrubGround = [];
  const scrubClusters = [];
  const reedPockets = [];
  const scrubCenters = [];
  const reedCenters = [];

  for (let i = 0; i < profile.scrubClusterCount; i++) {
    const p = randomClearPoint(map, rng, 2.1, 70);
    if (!p) continue;
    const [cx, , cz] = p;
    const cy = map.heightAt(cx, cz);
    scrubCenters.push([cx, cy, cz]);
    scrubClusters.push(matrix(cx, cy + 0.025, cz, rng() * TAU, 0.82 + rng() * 0.42, 1, 0.78 + rng() * 0.32));
    scrubGround.push(matrix(cx, cy + 0.052, cz, rng() * TAU, 1.7 + rng() * 1.1, 1, 0.78 + rng() * 0.62));
  }
  const authoredScrub =
    instanceProp('zv_dry_plant_set', scrubClusters, { unit: 1, tint: null, castShadow: false, receiveShadow: true }) ||
    instanceProp('zv_dry_scrub_cluster', scrubClusters, { unit: 1, tint: null, castShadow: false, receiveShadow: true });
  if (authoredScrub) {
    group.add(authoredScrub);
  } else {
    for (const [cx, , cz] of scrubCenters) {
      const count = 4 + Math.floor(rng() * 5);
      for (let k = 0; k < count; k++) {
        const a = rng() * TAU;
        const d = rng() * (1.3 + rng() * 1.4);
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        const y = map.heightAt(x, z) + 0.02;
        const s = 0.62 + rng() * 0.92;
        const tilt = (rng() - 0.5) * 0.34;
        (rng() < 0.62 ? scrub : scrubDark).push(matrix(x, y, z, rng() * TAU, s * 0.92, s * (0.5 + rng() * 0.45), s * 0.86, tilt, (rng() - 0.5) * 0.22));
      }
    }
  }

  for (let i = 0; i < profile.reedPocketCount; i++) {
    const p = randomClearPoint(map, rng, 4.2, 100);
    if (!p) continue;
    const [cx, cy, cz] = p;
    reedCenters.push([cx, cy, cz]);
    reedPockets.push(matrix(cx, cy + 0.025, cz, rng() * TAU, 0.9 + rng() * 0.32, 1, 0.88 + rng() * 0.34));
  }
  const authoredReeds = instanceProp('zv_reed_pocket', reedPockets, { unit: 1, tint: null, castShadow: false, receiveShadow: true });
  if (authoredReeds) {
    group.add(authoredReeds);
  } else {
    for (const [cx, cy, cz] of reedCenters) {
      patches.push(matrix(cx, cy + 0.105, cz, rng() * TAU, 3.4 + rng() * 2.0, 1, 1.5 + rng() * 1.0));
      for (let k = 0; k < 16; k++) {
        const a = rng() * TAU;
        const d = Math.sqrt(rng()) * (2.2 + rng() * 1.6);
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        const y = map.heightAt(x, z) + 0.02;
        const s = 0.72 + rng() * 0.92;
        reeds.push(matrix(x, y, z, rng() * TAU, s * 0.55, s, s * 0.55, (rng() - 0.5) * 0.22, (rng() - 0.5) * 0.22));
        if (rng() < 0.42) reedTips.push(matrix(x, y + 1.08 * s, z, 0, s * 0.7, s * 0.55, s * 0.7));
      }
    }
  }

  if (!authoredReeds) addInstanced(group, patchGeo, mats.darkSoil, patches, { castShadow: false, receiveShadow: false });
  if (!authoredScrub) {
    addInstanced(group, patchGeo, mats.darkSoil, scrubGround, { castShadow: false, receiveShadow: false });
    addInstanced(group, scrubGeo, mats.dryScrub, scrub, { castShadow: false, receiveShadow: true });
    addInstanced(group, darkGeo, mats.dryScrubDark, scrubDark, { castShadow: false, receiveShadow: true });
  }
  if (!authoredReeds) {
    addInstanced(group, reedGeo, mats.reed, reeds, { castShadow: false, receiveShadow: true });
    addInstanced(group, tipGeo, mats.reedTip, reedTips, { castShadow: false, receiveShadow: true });
  }
}

function scatterWeatheredRocks(map, group, rng) {
  const profile = stageKitProfile(map);
  const mats = kitMats();
  const fallbackGeo = new THREE.DodecahedronGeometry(0.9, 0);
  const fallback = [];
  const rubble = [];
  let glbPlaced = 0;
  for (let i = 0; i < profile.weatheredRockCount; i++) {
    const p = randomClearPoint(map, rng, 5.2, 100);
    if (!p) continue;
    const [x, y, z] = p;
    const big = rng() < 0.26;
    if (big && glbPlaced < 4 && placeAuthoredGroundProp(map, group, 'zv_cliff_shoulder_set', x, z, rng() * TAU, {
      targetW: 3.2 + rng() * 1.5,
      yOffset: -0.1,
      tint: 0x4f4f49,
    })) {
      glbPlaced++;
      continue;
    }
    rubble.push(matrix(x, y + 0.04, z, rng() * TAU, 0.72 + rng() * 0.36, 1, 0.64 + rng() * 0.38, rng() * 0.08, rng() * 0.08));
    fallback.push(matrix(x, y + 0.12, z, rng() * TAU, 1.0 + rng() * 1.5, 0.42 + rng() * 0.48, 0.75 + rng() * 1.3, rng() * 0.42, rng() * 0.35));
  }
  const authoredRubble = instanceProp('zv_ridge_rubble_set', rubble, { unit: 1, tint: 0x4a4439, receiveShadow: true });
  if (authoredRubble) group.add(authoredRubble);
  else addInstanced(group, fallbackGeo, mats.sandstone, fallback);
}

function makePahlavanStandard(color, scale = 1) {
  const g = makeBanner(color, 0.72 * scale, 1.18 * scale, 2.9 * scale);
  const mats = MATS();
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.16 * scale, 0.06 * scale, 16), mats.gold);
  disk.rotation.x = Math.PI / 2;
  disk.position.y = 3.05 * scale;
  g.add(disk);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 0.045 * scale, 0.045 * scale), mats.bronze);
  cross.position.y = 2.88 * scale;
  g.add(cross);
  return g;
}

function attachStandardCloth(group, color, scale = 1) {
  const mats = MATS();
  const w = 0.72 * scale;
  const h = 1.18 * scale;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 5, 4), mats[color]);
  cloth.position.set(0, 2.9 * scale - 0.12 * scale - h / 2, 0.035 * scale);
  cloth.castShadow = true;
  group.add(cloth);
  group.userData.cloth = cloth;
  group.userData.base = cloth.geometry.attributes.position.array.slice();
  return group;
}

function makePahlavanStandardAssembly(color, scale = 1) {
  const frame = authoredChild('zv_standard_frame', scale);
  if (!frame) return makePahlavanStandard(color, scale);
  const group = new THREE.Group();
  group.add(frame);
  return attachStandardCloth(group, color, scale);
}

function makeMaceMarker(scale = 1) {
  const mats = MATS();
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * scale, 0.055 * scale, 1.45 * scale, 7), mats.woodDark);
  shaft.position.y = 0.74 * scale;
  shaft.rotation.z = 0.12;
  g.add(shaft);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 10, 8), mats.bronze);
  head.position.set(0.11 * scale, 1.48 * scale, 0);
  g.add(head);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045 * scale, 0.18 * scale, 6), mats.gold);
    spike.position.set(Math.cos(a) * 0.25 * scale + 0.11 * scale, 1.48 * scale, Math.sin(a) * 0.25 * scale);
    spike.rotation.z = Math.PI / 2;
    spike.rotation.y = -a;
    g.add(spike);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function makeTetherRail(width = 3.2) {
  const mats = MATS();
  const g = new THREE.Group();
  for (const x of [-width / 2, width / 2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 7), mats.woodDark);
    post.position.set(x, 0.45, 0);
    g.add(post);
  }
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, width, 7), mats.wood);
  rail.rotation.z = Math.PI / 2;
  rail.position.y = 0.72;
  g.add(rail);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.55), mats.clothRed);
  saddle.position.set(0, 0.86, 0);
  saddle.rotation.y = 0.12;
  g.add(saddle);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function buildGateContactGrit(map, center, fwd, side, rng) {
  const group = new THREE.Group();
  group.name = 'zabulistan-gate-contact-grit';
  const verts = [];
  const colors = [];
  const idx = [];
  const c = new THREE.Color();
  const inner = new THREE.Color(0x5a4d3b);
  const mid = new THREE.Color(0x6d6049);
  const outer = new THREE.Color(0x827257);
  const toWorld = (lx, lz) => center.clone().addScaledVector(side, lx).addScaledVector(fwd, lz);
  const addPoly = (lx, lz, w, d, rot, points = 8) => {
    const base = verts.length / 3;
    const origin = toWorld(lx, lz);
    verts.push(origin.x, map.heightAt(origin.x, origin.z) + 0.108, origin.z);
    colors.push(inner.r, inner.g, inner.b);
    for (let i = 0; i < points; i++) {
      const a = (i / points) * TAU + rot;
      const radius = 0.72 + rng() * 0.34 + Math.sin(i * 1.7 + rot) * 0.08;
      const px = lx + Math.cos(a) * w * radius;
      const pz = lz + Math.sin(a) * d * radius;
      const p = toWorld(px, pz);
      verts.push(p.x, map.heightAt(p.x, p.z) + 0.105 + rng() * 0.012, p.z);
      c.copy(i % 2 ? mid : outer).offsetHSL(0, -0.04, (rng() - 0.5) * 0.04);
      colors.push(c.r, c.g, c.b);
    }
    for (let i = 1; i <= points; i++) idx.push(base, base + i, base + (i % points) + 1);
  };

  addPoly(0, -3.02, 2.1, 0.42, rng() * TAU, 8);
  addPoly(-2.18, -2.05, 0.78, 0.38, rng() * TAU, 6);
  addPoly(2.16, -1.92, 0.74, 0.4, rng() * TAU, 6);
  addPoly(-0.85, -0.72, 0.72, 0.26, rng() * TAU, 6);
  addPoly(0.92, -0.62, 0.68, 0.28, rng() * TAU, 6);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -0.6,
    polygonOffsetUnits: -0.6,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  group.add(mesh);

  const pebbleGeo = new THREE.DodecahedronGeometry(0.16, 0);
  const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x675c48, roughness: 1, metalness: 0 });
  const pebbleCount = 30;
  const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleCount);
  for (let i = 0; i < pebbleCount; i++) {
    const lane = rng() < 0.5 ? -1 : 1;
    const lx = lane * (1.0 + rng() * 2.25) + (rng() - 0.5) * 0.34;
    const lz = -3.25 + rng() * 3.45;
    const p = toWorld(lx, lz);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rng() * 0.55, rng() * TAU, rng() * 0.35));
    const s = 0.45 + rng() * 0.9;
    m.scale(new THREE.Vector3(s * (1.0 + rng() * 0.8), s * (0.16 + rng() * 0.16), s * (0.65 + rng() * 0.5)));
    m.setPosition(p.x, map.heightAt(p.x, p.z) + 0.13, p.z);
    pebbles.setMatrixAt(i, m);
  }
  pebbles.castShadow = false;
  pebbles.receiveShadow = false;
  group.add(pebbles);
  return group;
}

function addGateRoadTransition(map, group, center, fwd, side, yaw, rng) {
  const mats = kitMats();
  const toWorld = (forward, lateral) => center.clone().addScaledVector(fwd, forward).addScaledVector(side, lateral);
  const rows = [0.4, 3.1, 6.0, 9.1, 12.4, 15.8, 19.2];
  const lanes = [-1, -0.66, -0.32, 0, 0.34, 0.68, 1];
  const verts = [];
  const colors = [];
  const idx = [];
  const c = new THREE.Color();
  const edge = new THREE.Color(0x5c4b37);
  const mid = new THREE.Color(0x7b6245);
  const sun = new THREE.Color(0x9b7b54);
  for (let r = 0; r < rows.length; r++) {
    const t = r / Math.max(1, rows.length - 1);
    const half = 4.05 + t * 1.75 + Math.sin(r * 1.43) * 0.2;
    for (let l = 0; l < lanes.length; l++) {
      const lane = lanes[l];
      const lateral = lane * half + Math.sin(r * 0.86 + l * 1.41) * 0.18;
      const forward = rows[r] + Math.sin(l * 0.92 + r * 1.18) * 0.18;
      const p = toWorld(forward, lateral);
      const edgeT = Math.pow(Math.abs(lane), 0.72);
      c.copy(sun).lerp(mid, t * 0.42).lerp(edge, edgeT * 0.62);
      c.offsetHSL(0, -0.035, (rng() - 0.5) * 0.035);
      verts.push(p.x, map.heightAt(p.x, p.z) + 0.135 + t * 0.018, p.z);
      colors.push(c.r, c.g, c.b);
    }
  }
  const row = lanes.length;
  for (let r = 0; r < rows.length - 1; r++) {
    for (let l = 0; l < lanes.length - 1; l++) {
      const a = r * row + l;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const road = new THREE.Mesh(geo, mat);
  road.name = 'zabulistan-gate-road-packed-transition';
  road.castShadow = false;
  road.receiveShadow = false;
  road.renderOrder = 4;
  road.userData.visualQaIgnore = true;
  group.add(road);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const rutGeo = new THREE.CircleGeometry(1, 8);
  rutGeo.rotateX(-Math.PI / 2);
  const curb = [];
  const ruts = [];
  const crossings = [];
  const rubble = [];
  const rubbleGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 12; i++) {
    const forward = 0.9 + i * 1.55 + Math.sin(i * 0.77) * 0.22;
    const t = Math.min(1, forward / 19.2);
    const half = 4.05 + t * 1.75;
    for (const lane of [-1, 1]) {
      const p = toWorld(forward + (rng() - 0.5) * 0.18, lane * (half + 0.34 + rng() * 0.42));
      curb.push(matrix(
        p.x,
        map.heightAt(p.x, p.z) + 0.21,
        p.z,
        yaw + (rng() - 0.5) * 0.28,
        0.32 + rng() * 0.18,
        0.13 + rng() * 0.04,
        0.72 + rng() * 0.48,
        (rng() - 0.5) * 0.05,
        (rng() - 0.5) * 0.06,
      ));
      for (let k = 0; k < 2; k++) {
        const rp = toWorld(forward + (rng() - 0.5) * 0.85, lane * (half + 0.9 + rng() * 1.25));
        const s = 0.16 + rng() * 0.32;
        rubble.push(matrix(rp.x, map.heightAt(rp.x, rp.z) + 0.18, rp.z, rng() * TAU, s * (1.25 + rng()), s * 0.22, s * (0.72 + rng() * 0.8), rng() * 0.2, rng() * 0.18));
      }
    }
    for (const lateral of [-1.18, 1.16]) {
      const p = toWorld(forward + 0.16, lateral + Math.sin(i * 1.1 + lateral) * 0.12);
      ruts.push(matrix(p.x, map.heightAt(p.x, p.z) + 0.155, p.z, yaw + (rng() - 0.5) * 0.08, 0.12, 1, 0.82 + rng() * 0.28));
    }
    if (i % 3 === 1 && i > 1 && i < 10) {
      const p = toWorld(forward, (rng() - 0.5) * 0.8);
      crossings.push(matrix(p.x, map.heightAt(p.x, p.z) + 0.158, p.z, yaw + Math.PI / 2 + (rng() - 0.5) * 0.2, 0.16, 1, 1.1 + rng() * 0.5));
    }
  }
  const curbMesh = addInstanced(group, boxGeo, mats.sandstoneDark, curb, { castShadow: true, receiveShadow: true });
  if (curbMesh) curbMesh.name = 'zabulistan-gate-road-irregular-curbs';
  const rutMesh = addInstanced(group, rutGeo, mats.roadRut, ruts, { castShadow: false, receiveShadow: false });
  if (rutMesh) {
    rutMesh.name = 'zabulistan-gate-road-traffic-ruts';
    rutMesh.renderOrder = 5;
    rutMesh.userData.visualQaIgnore = true;
  }
  const crossingMesh = addInstanced(group, rutGeo, mats.roadRut, crossings, { castShadow: false, receiveShadow: false });
  if (crossingMesh) {
    crossingMesh.name = 'zabulistan-gate-road-hoof-scuffs';
    crossingMesh.renderOrder = 5;
    crossingMesh.userData.visualQaIgnore = true;
  }
  const rubbleMesh = addInstanced(group, rubbleGeo, mats.sandstone, rubble, { castShadow: true, receiveShadow: true });
  if (rubbleMesh) rubbleMesh.name = 'zabulistan-gate-road-edge-rubble';
}

function addPalaceSideTerrainClusters(map, group, rng) {
  const { fwd, side, yaw } = pathApproach(map);
  const exit = map.exitPos;
  const mats = kitMats();
  const point = (forward, lateral) => exit.clone().addScaledVector(fwd, forward).addScaledVector(side, lateral);
  const insideBoard = (p, margin = 7) => map.visualBoard?.shape !== 'circle' || Math.hypot(p.x, p.z) < map.visualBoard.radius - margin;
  const clearPads = (p, radius = 3.2) => !(map.pads || []).some((pad) => Math.hypot(p.x - pad.pos.x, p.z - pad.pos.z) < radius + 3.2);
  const dustGeo = new THREE.CircleGeometry(1, 18);
  dustGeo.rotateX(-Math.PI / 2);
  const wash = [];
  const fallbackRocks = [];
  const fallbackScrub = [];
  const fallbackScrubDark = [];
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const scrubGeo = new THREE.ConeGeometry(0.23, 0.62, 6);
  scrubGeo.translate(0, 0.31, 0);
  const darkScrubGeo = new THREE.ConeGeometry(0.18, 0.52, 5);
  darkScrubGeo.translate(0, 0.26, 0);
  const clusters = [
    { key: 'left-watch', forward: 13.6, lateral: -15.2, sx: 4.8, sz: 1.95, yawAdjust: -0.34, plant: 2.9, rubble: 3.4, scatter: 2.1, standard: 'clothGold' },
    { key: 'right-watch', forward: 14.2, lateral: 15.0, sx: 4.65, sz: 1.9, yawAdjust: 0.32, plant: 2.8, rubble: 3.25, scatter: 2.0, standard: 'clothRed' },
    { key: 'left-outer', forward: 23.4, lateral: -19.4, sx: 5.9, sz: 2.15, yawAdjust: -0.48, plant: 3.4, rubble: 4.4, camp: 2.0 },
    { key: 'right-outer', forward: 24.6, lateral: 19.0, sx: 5.7, sz: 2.1, yawAdjust: 0.46, plant: 3.3, rubble: 4.2, camp: 1.95 },
    { key: 'left-low', forward: 33.4, lateral: -14.8, sx: 4.8, sz: 1.75, yawAdjust: -0.58, plant: 2.7, rubble: 3.6 },
    { key: 'right-low', forward: 34.2, lateral: 14.6, sx: 4.7, sz: 1.75, yawAdjust: 0.56, plant: 2.65, rubble: 3.5 },
  ];

  for (const spec of clusters) {
    const p = point(spec.forward, spec.lateral);
    if (!insideBoard(p, 8) || !clearPads(p, 4.2)) continue;
    const y = map.heightAt(p.x, p.z);
    wash.push(matrix(p.x, y + 0.08, p.z, yaw + spec.yawAdjust, spec.sx, 1, spec.sz));
    const plant = placeAuthoredGroundProp(map, group, 'zv_dry_plant_set', p.x, p.z, yaw + spec.yawAdjust, {
      targetW: spec.plant,
      yOffset: 0.025,
      tint: null,
      sceneName: `zabulistan-side-terrain-plant-${spec.key}`,
    });
    const rubblePoint = p.clone()
      .addScaledVector(side, Math.sign(spec.lateral || 1) * (1.6 + rng() * 0.8))
      .addScaledVector(fwd, -0.6 + rng() * 1.1);
    const rubble = placeAuthoredGroundProp(map, group, 'zv_ridge_rubble_set', rubblePoint.x, rubblePoint.z, yaw + spec.yawAdjust + Math.sign(spec.lateral || 1) * 0.16, {
      targetW: spec.rubble,
      yOffset: 0.02,
      tint: 0x5d503f,
      sceneName: `zabulistan-side-terrain-rubble-${spec.key}`,
    });
    if (spec.scatter) {
      const scatterPoint = p.clone().addScaledVector(fwd, -1.35).addScaledVector(side, Math.sign(spec.lateral || 1) * -0.55);
      const scatter = placeAuthoredGroundProp(map, group, 'zv_forecourt_scatter_set', scatterPoint.x, scatterPoint.z, yaw + spec.yawAdjust * 0.6, {
        targetW: spec.scatter,
        yOffset: 0.03,
        tint: 0x594633,
        sceneName: `zabulistan-side-terrain-scatter-${spec.key}`,
      });
    }
    if (spec.camp) {
      const campPoint = p.clone().addScaledVector(fwd, 0.9).addScaledVector(side, Math.sign(spec.lateral || 1) * 0.72);
      const camp = placeAuthoredGroundProp(map, group, 'zv_camp_ground_props', campPoint.x, campPoint.z, yaw + Math.PI / 2 + spec.yawAdjust, {
        targetW: spec.camp,
        yOffset: 0.03,
        tint: 0x493829,
        sceneName: `zabulistan-side-terrain-camp-${spec.key}`,
      });
    }
    if (spec.standard) {
      const standardPoint = p.clone().addScaledVector(fwd, -0.4).addScaledVector(side, Math.sign(spec.lateral || 1) * -1.25);
      const standard = makePahlavanStandardAssembly(spec.standard, 0.54);
      standard.name = `zabulistan-side-terrain-standard-${spec.key}`;
      standard.position.set(standardPoint.x, map.heightAt(standardPoint.x, standardPoint.z), standardPoint.z);
      standard.rotation.y = yaw + spec.yawAdjust + Math.sign(spec.lateral || 1) * 0.18;
      group.add(standard);
      group.userData.animatedBanners?.push(standard);
      map.propBanners?.push(standard);
    }
    if (!plant || !rubble) {
      for (let i = 0; i < 9; i++) {
        const a = rng() * TAU;
        const d = Math.sqrt(rng()) * (1.2 + rng() * 2.1);
        const fp = p.clone().addScaledVector(side, Math.cos(a) * d).addScaledVector(fwd, Math.sin(a) * d * 0.6);
        const fy = map.heightAt(fp.x, fp.z);
        if (!plant) {
          const s = 0.52 + rng() * 0.78;
          (rng() < 0.58 ? fallbackScrub : fallbackScrubDark).push(matrix(fp.x, fy + 0.02, fp.z, rng() * TAU, s * 0.92, s * (0.5 + rng() * 0.42), s * 0.86, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.22));
        }
        if (!rubble && rng() < 0.62) {
          const s = 0.18 + rng() * 0.38;
          fallbackRocks.push(matrix(fp.x, fy + 0.09, fp.z, rng() * TAU, s * (1.4 + rng()), s * 0.32, s * (0.85 + rng()), rng() * 0.18, rng() * 0.18));
        }
      }
    }
  }

  const washMesh = addInstanced(group, dustGeo, mats.padDust, wash, { castShadow: false, receiveShadow: false });
  if (washMesh) {
    washMesh.name = 'zabulistan-side-terrain-ground';
    washMesh.renderOrder = 2;
    washMesh.userData.visualQaIgnore = true;
  }
  addInstanced(group, rockGeo, mats.sandstoneDark, fallbackRocks, { castShadow: true, receiveShadow: true });
  addInstanced(group, scrubGeo, mats.dryScrub, fallbackScrub, { castShadow: false, receiveShadow: true });
  addInstanced(group, darkScrubGeo, mats.dryScrubDark, fallbackScrubDark, { castShadow: false, receiveShadow: true });
}

function addPalaceContactTerrain(map, group, center, fwd, side, yaw, rng) {
  const contact = placeAuthoredGroundProp(map, group, 'zv_palace_contact_terrain_set', center.x, center.z, yaw, {
    targetW: 18.4,
    yOffset: 0.11,
    tint: 0x76654d,
    sceneName: 'zabulistan-palace-contact-terrain',
  });
  if (contact) {
    contact.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = true;
      node.renderOrder = 8;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.filter(Boolean).forEach((mat) => {
        if (mat.color?.isColor) mat.color.lerp(new THREE.Color(0x806d50), 0.28);
        mat.transparent = true;
        mat.opacity = Math.min(Number.isFinite(mat.opacity) ? mat.opacity : 1, 0.9);
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -3.2;
        mat.polygonOffsetUnits = -3.2;
      });
    });
    return;
  }

  const fallback = new THREE.Group();
  fallback.name = 'zabulistan-palace-contact-terrain-fallback';
  group.add(fallback);

  const rows = [-4.2, -3.1, -1.9, -0.65, 0.72, 2.05, 3.28];
  const lanes = [-8.2, -5.55, -2.85, -0.45, 2.05, 4.9, 7.8];
  const verts = [];
  const colors = [];
  const idx = [];
  const c = new THREE.Color();
  const outer = new THREE.Color(0x695d48);
  const mid = new THREE.Color(0x88714f);
  const light = new THREE.Color(0xa2845a);
  const toWorld = (lx, lz) => center.clone().addScaledVector(side, lx).addScaledVector(fwd, lz);

  for (let z = 0; z < rows.length; z++) {
    for (let x = 0; x < lanes.length; x++) {
      const lateral = lanes[x] + Math.sin(z * 1.72 + x * 0.84) * 0.28;
      const forward = rows[z] + Math.sin(x * 1.31 + z * 0.66) * 0.18;
      const edgeT = Math.min(1, Math.abs(lateral) / 8.2);
      const depthT = z / Math.max(1, rows.length - 1);
      const p = toWorld(lateral, forward);
      verts.push(p.x, map.heightAt(p.x, p.z) + 0.155 + depthT * 0.018, p.z);
      c.copy(light).lerp(mid, depthT * 0.52).lerp(outer, edgeT * 0.5);
      c.offsetHSL(0, -0.04, (rng() - 0.5) * 0.035);
      colors.push(c.r, c.g, c.b);
    }
  }

  const row = lanes.length;
  for (let z = 0; z < rows.length - 1; z++) {
    for (let x = 0; x < lanes.length - 1; x++) {
      if ((x + z) % 5 === 0) continue;
      const a = z * row + x;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3.6,
    polygonOffsetUnits: -3.6,
  });
  const blend = new THREE.Mesh(geo, mat);
  blend.name = 'zabulistan-palace-contact-soft-blend';
  blend.castShadow = false;
  blend.receiveShadow = false;
  blend.renderOrder = 6;
  blend.userData.visualQaIgnore = true;
  fallback.add(blend);

  const mats = kitMats();
  const chipGeo = new THREE.DodecahedronGeometry(1, 0);
  const chips = [];
  for (let i = 0; i < 28; i++) {
    const lane = i % 2 ? -1 : 1;
    const local = toWorld(lane * (2.6 + rng() * 5.8), -3.4 + rng() * 6.7);
    const s = 0.16 + rng() * 0.28;
    chips.push(matrix(local.x, map.heightAt(local.x, local.z) + 0.18, local.z, rng() * TAU, s * (1.1 + rng()), s * 0.22, s * (0.72 + rng() * 0.7), rng() * 0.22, rng() * 0.2));
  }
  addInstanced(fallback, chipGeo, mats.sandstone, chips, { castShadow: false, receiveShadow: true });
}

function addPalaceThresholdContactMask(map, group, center, fwd, side, rng) {
  const rows = [-7.55, -6.82, -6.1, -5.35];
  const lanes = [-11.2, -8.6, -6.0, -3.35, -0.72, 1.92, 4.58, 7.25, 9.82, 11.6];
  const verts = [];
  const colors = [];
  const idx = [];
  const warm = new THREE.Color(0xa48158);
  const packed = new THREE.Color(0x806648);
  const edge = new THREE.Color(0x65513b);
  const c = new THREE.Color();
  const toWorld = (lx, lz) => center.clone().addScaledVector(side, lx).addScaledVector(fwd, lz);

  for (let z = 0; z < rows.length; z++) {
    for (let x = 0; x < lanes.length; x++) {
      const lateral = lanes[x] + Math.sin(x * 0.94 + z * 1.28) * 0.22;
      const forward = rows[z] + Math.sin(x * 1.17 + z * 0.71) * 0.16;
      const p = toWorld(lateral, forward);
      const edgeT = Math.min(1, Math.abs(lateral) / 11.6);
      const depthT = z / Math.max(1, rows.length - 1);
      verts.push(p.x, map.heightAt(p.x, p.z) + 0.29 + depthT * 0.014, p.z);
      c.copy(warm).lerp(packed, depthT * 0.45).lerp(edge, edgeT * 0.28);
      c.offsetHSL(0, -0.035, (rng() - 0.5) * 0.03);
      colors.push(c.r, c.g, c.b);
    }
  }

  const row = lanes.length;
  for (let z = 0; z < rows.length - 1; z++) {
    for (let x = 0; x < lanes.length - 1; x++) {
      if ((x + z) % 6 === 0) continue;
      const a = z * row + x;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5,
  });
  const mask = new THREE.Mesh(geo, mat);
  mask.name = 'zabulistan-palace-contact-threshold-mask';
  mask.castShadow = false;
  mask.receiveShadow = false;
  mask.renderOrder = 9;
  mask.userData.visualQaIgnore = true;
  group.add(mask);

  const mats = kitMats();
  const chipGeo = new THREE.DodecahedronGeometry(1, 0);
  const chips = [];
  for (let i = 0; i < 30; i++) {
    const lane = i % 2 ? -1 : 1;
    const p = toWorld(lane * (2.4 + rng() * 8.2), -7.25 + rng() * 1.95);
    const s = 0.14 + rng() * 0.22;
    chips.push(matrix(p.x, map.heightAt(p.x, p.z) + 0.32, p.z, rng() * TAU, s * (1.2 + rng()), s * 0.18, s * (0.72 + rng() * 0.65), rng() * 0.18, rng() * 0.2));
  }
  const chipMesh = addInstanced(group, chipGeo, mats.sandstone, chips, { castShadow: false, receiveShadow: true });
  if (chipMesh) chipMesh.name = 'zabulistan-palace-contact-threshold-stones';
}

function buildForecourt(map, group, rng) {
  const { fwd, side, yaw } = pathApproach(map);
  const mats = kitMats();
  const exit = map.exitPos;
  const center = exit.clone().addScaledVector(fwd, 11.5);
  const cy = map.heightAt(center.x, center.z);
  const wrap = buildPalaceBaseWrap();
  wrap.position.set(exit.x, map.heightAt(exit.x, exit.z) - 0.02, exit.z);
  wrap.rotation.y = yaw;
  group.add(wrap);
  addPalaceFacadeDressing(map, group, fwd, side, yaw);
  const baseCenter = exit.clone().addScaledVector(fwd, 5.5);
  if (placeAuthoredGroundProp(map, group, 'zv_palace_base_transition', baseCenter.x, baseCenter.z, yaw, {
    targetW: 17.6,
    yOffset: 0.06,
    sceneName: 'zabulistan-palace-base-transition-main',
  })) {
    for (const lane of [-1, 1]) {
      const p = exit.clone().addScaledVector(fwd, 7.2).addScaledVector(side, lane * 5.8);
      placeAuthoredGroundProp(map, group, 'zv_palace_base_transition', p.x, p.z, yaw + lane * 0.18, {
        targetW: 10.8,
        yOffset: 0.045,
        sceneName: `zabulistan-palace-base-transition-${lane < 0 ? 'left' : 'right'}`,
      });
    }
  }
  const dustGeo = new THREE.CircleGeometry(1, 40);
  dustGeo.rotateX(-Math.PI / 2);
  const forecourtWash = addInstanced(group, dustGeo, mats.forecourtDust, [
    matrix(center.x, cy + 0.14, center.z, yaw, 8.3, 1, 4.9),
    matrix(center.x + fwd.x * 7.8, map.heightAt(center.x + fwd.x * 7.8, center.z + fwd.z * 7.8) + 0.13, center.z + fwd.z * 7.8, yaw, 6.2, 1, 2.2),
  ], { castShadow: false, receiveShadow: false });
  if (forecourtWash) {
    forecourtWash.name = 'zabulistan-forecourt-soft-ground';
    forecourtWash.userData.visualQaIgnore = true;
  }
  addGateRoadTransition(map, group, center, fwd, side, yaw, rng);

  const causewayCenter = exit.clone().addScaledVector(fwd, 7.4);
  placeAuthoredGroundProp(map, group, 'zv_forecourt_causeway', causewayCenter.x, causewayCenter.z, yaw, {
    targetW: 10.8,
    yOffset: 0.032,
    tint: 0x6f614b,
    sceneName: 'zabulistan-forecourt-causeway',
  });
  placeAuthoredGroundProp(map, group, 'zv_forecourt_retaining_edges', causewayCenter.x, causewayCenter.z, yaw, {
    targetW: 11.2,
    yOffset: 0.038,
    tint: 0x6c604c,
    sceneName: 'zabulistan-forecourt-retaining-edges',
  });
  placeAuthoredGroundProp(map, group, 'zv_forecourt_approach_edges', center.x, center.z, yaw, {
    targetW: 12.8,
    yOffset: 0.048,
    tint: 0x6c6048,
    sceneName: 'zabulistan-forecourt-approach-edges',
  });
  const lowerApproach = center.clone().addScaledVector(fwd, 7.3);
  placeAuthoredGroundProp(map, group, 'zv_forecourt_approach_edges', lowerApproach.x, lowerApproach.z, yaw, {
    targetW: 11.4,
    yOffset: 0.046,
    tint: 0x6e614a,
    sceneName: 'zabulistan-forecourt-lower-approach-edges',
  });
  for (const lane of [-1, 1]) {
    const shoulder = lowerApproach.clone()
      .addScaledVector(side, lane * 4.8)
      .addScaledVector(fwd, lane > 0 ? 0.4 : -0.2);
    placeAuthoredGroundProp(map, group, 'zv_road_scree_bank', shoulder.x, shoulder.z, yaw + lane * 0.18, {
      targetW: 4.7,
      yOffset: 0.044,
      tint: 0x6d624e,
      sceneName: `zabulistan-forecourt-lower-scree-${lane < 0 ? 'left' : 'right'}`,
    });
  }

  const transitionPlaced = placeAuthoredGroundProp(map, group, 'zv_gate_threshold_transition', center.x, center.z, yaw, {
    targetW: 8.45,
    yOffset: 0.04,
    tint: 0x74634b,
    sceneName: 'zabulistan-gate-threshold-transition',
  });
  addPalaceContactTerrain(map, group, center, fwd, side, yaw, rng);
  addPalaceThresholdContactMask(map, group, center, fwd, side, rng);
  if (!transitionPlaced) {
    const threshold = new THREE.Group();
    if (!placeAuthoredGroundProp(map, group, 'zv_forecourt_threshold', center.x, center.z, yaw, {
      targetW: 8.5,
      yOffset: 0.03,
      sceneName: 'zabulistan-forecourt-threshold',
    })) {
      threshold.position.set(center.x, cy + 0.04, center.z);
      threshold.rotation.y = yaw;
      const b = new MeshBuilder();
      b.box(8.0, 0.1, 0.3, 'relief', 0, 0.06, -2.2);
      b.box(7.1, 0.08, 0.24, 'reliefGlow', 0, 0.14, -2.65);
      b.box(1.3, 0.12, 0.42, 'stoneDark', -3.9, 0.13, -2.2);
      b.box(1.3, 0.12, 0.42, 'stoneDark', 3.9, 0.13, -2.2);
      threshold.add(b.build(false, true));
      group.add(threshold);
    }
    group.add(buildGateContactGrit(map, center, fwd, side, rng));
  }

  const bannerColors = ['clothRed', 'clothGold', 'clothRed', 'clothTeal'];
  for (let i = 0; i < 4; i++) {
    const lane = i < 2 ? -1 : 1;
    const row = i % 2;
    const p = center.clone()
      .addScaledVector(side, lane * (4.0 + row * 1.4))
      .addScaledVector(fwd, -1.6 + row * 4.2);
    const y = map.heightAt(p.x, p.z);
    const standard = makePahlavanStandardAssembly(bannerColors[i], row ? 0.9 : 1.05);
    standard.position.set(p.x, y, p.z);
    standard.rotation.y = yaw + (lane > 0 ? -0.14 : 0.14);
    group.add(standard);
    group.userData.animatedBanners?.push(standard);
    map.propBanners?.push(standard);
  }

  for (const lane of [-1, 1]) {
    const p = center.clone().addScaledVector(side, lane * 5.4).addScaledVector(fwd, 5.5);
    if (!placeAuthoredGroundProp(map, group, 'zv_mace_marker', p.x, p.z, yaw + lane * 0.22, { targetH: 1.82 })) {
      const mace = makeMaceMarker(0.95);
      mace.position.set(p.x, map.heightAt(p.x, p.z), p.z);
      mace.rotation.y = yaw + lane * 0.22;
      group.add(mace);
    }
  }

  for (const lane of [-1, 1]) {
    const p = center.clone().addScaledVector(side, lane * 6.4).addScaledVector(fwd, 2.8 + (lane > 0 ? 0.8 : 0));
    placeAuthoredGroundProp(map, group, 'zv_forecourt_scatter_set', p.x, p.z, yaw + lane * 0.42, { targetW: 2.9, yOffset: 0.03 });
  }

  for (const lane of [-1, 1]) {
    const p = center.clone().addScaledVector(side, lane * 7.4).addScaledVector(fwd, 11.9);
    const staging = center.clone().addScaledVector(side, lane * 10.2).addScaledVector(fwd, 13.2);
    const stagingPlaced = placeAuthoredGroundProp(map, group, 'zv_cavalry_staging_set', staging.x, staging.z, yaw + Math.PI / 2 + lane * 0.12, {
      targetW: 5.9,
      yOffset: 0.025,
      tint: 0x3b3329,
      sceneName: `zabulistan-cavalry-staging-${lane < 0 ? 'left' : 'right'}`,
    });
    if (stagingPlaced) {
      const pennant = makePahlavanStandardAssembly(lane < 0 ? 'clothGold' : 'clothRed', 0.58);
      const pp = center.clone().addScaledVector(side, lane * 12.4).addScaledVector(fwd, 12.6);
      pennant.position.set(pp.x, map.heightAt(pp.x, pp.z), pp.z);
      pennant.rotation.y = yaw + lane * 0.22;
      group.add(pennant);
      group.userData.animatedBanners?.push(pennant);
      map.propBanners?.push(pennant);
    } else if (!placeAuthoredGroundProp(map, group, 'zv_cavalry_tether', p.x, p.z, yaw + Math.PI / 2 + lane * 0.08, { targetW: 3.5 })) {
      const rail = makeTetherRail(3.0);
      rail.position.set(p.x, map.heightAt(p.x, p.z), p.z);
      rail.rotation.y = yaw + Math.PI / 2 + lane * 0.08;
      group.add(rail);
    }
    const camp = center.clone().addScaledVector(side, lane * 11.5).addScaledVector(fwd, 14.2);
    placeAuthoredGroundProp(map, group, 'zv_camp_ground_props', camp.x, camp.z, yaw + Math.PI / 2 + lane * 0.36, {
      targetW: stagingPlaced ? 2.05 : 3.0,
      yOffset: 0.03,
      tint: 0x3b3329,
      sceneName: `zabulistan-camp-ground-props-${lane < 0 ? 'left' : 'right'}`,
    });
  }

  for (const lane of [-1, 1]) {
    const p = center.clone().addScaledVector(side, lane * 8.6).addScaledVector(fwd, 6.8);
    const beacon = buildBeaconTower(0.68);
    placeLocalGroup(map, group, beacon, p.x, p.z, yaw + lane * 0.2);
    trackFlame(map, group, beacon.userData.flame, new THREE.Vector3(p.x, map.heightAt(p.x, p.z) + 1.0, p.z));
  }
}

export function buildZabulistanVisualKit(map, rng) {
  if (map.def?.id !== 'zabulistan' || !map.kitGroup) return null;
  const group = new THREE.Group();
  group.name = 'zabulistan-visual-kit';
  group.userData.animatedBanners = [];
  group.userData.animatedFlames = [];
  group.userData.campfires = [];
  map.kitGroup.add(group);
  replacePads(map, group);
  addGroundPatches(map, group, rng);
  addCliffTerraces(map, group, rng);
  addRoadsideCliffShoulders(map, group, rng);
  dressRoadShoulders(map, group, rng);
  addRoadDefenses(map, group, rng);
  scatterScrubAndReeds(map, group, rng);
  scatterWeatheredRocks(map, group, rng);
  buildForecourt(map, group, rng);
  addPalaceForegroundTerraceWall(map, group, rng);
  addPalaceCliffShelf(map, group, rng);
  addGateApproachDepth(map, group, rng);
  addPalaceSideTerrainClusters(map, group, rng);
  addSiegeLandmarks(map, group, rng);
  return group;
}

export function clearZabulistanVisualKit(map) {
  const group = map.zabulistanVisualKit;
  if (!group) return;
  const banners = new Set(group.userData.animatedBanners || []);
  if (banners.size && map.propBanners) map.propBanners = map.propBanners.filter((b) => !banners.has(b));
  const flames = new Set(group.userData.animatedFlames || []);
  if (flames.size && map.propFlames) map.propFlames = map.propFlames.filter((f) => !flames.has(f));
  const campfires = new Set(group.userData.campfires || []);
  if (campfires.size && map.campfires) map.campfires = map.campfires.filter((c) => !campfires.has(c));
  group.parent?.remove(group);
  group.traverse((o) => {
    if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
  });
  map.zabulistanVisualKit = null;
}

export function rebuildZabulistanVisualKit(map, rng) {
  clearZabulistanVisualKit(map);
  map.zabulistanVisualKit = buildZabulistanVisualKit(map, rng);
  return map.zabulistanVisualKit;
}
