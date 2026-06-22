import * as THREE from 'three';
import { MATS, MeshBuilder } from '../models/materials.js';
import { makeFlame } from '../models/towerkit.js';
import { makeBanner } from './props.js';
import { getProp, instanceProp, propBase } from '../core/props3d.js';

const TAU = Math.PI * 2;

let cachedMats = null;
function kitMats() {
  if (cachedMats) return cachedMats;
  cachedMats = {
    dryScrub: new THREE.MeshStandardMaterial({ color: 0x6e7440, roughness: 1 }),
    dryScrubDark: new THREE.MeshStandardMaterial({ color: 0x4e5a32, roughness: 1 }),
    reed: new THREE.MeshStandardMaterial({ color: 0x8b8a50, roughness: 1 }),
    reedTip: new THREE.MeshStandardMaterial({ color: 0xb69b58, roughness: 1 }),
    padDust: new THREE.MeshStandardMaterial({
      color: 0x4f493d,
      roughness: 1,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    padShadow: new THREE.MeshStandardMaterial({ color: 0x4d463c, roughness: 1 }),
    padTop: new THREE.MeshStandardMaterial({ color: 0x7d7059, roughness: 1 }),
    padStone: new THREE.MeshStandardMaterial({ color: 0x96866a, roughness: 1 }),
    padRelief: new THREE.MeshStandardMaterial({ color: 0x5d5448, roughness: 1 }),
    forecourtDust: new THREE.MeshStandardMaterial({
      color: 0x76644b,
      roughness: 1,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    shoulderDust: new THREE.MeshStandardMaterial({
      color: 0x8f7d5d,
      roughness: 1,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    sandstone: new THREE.MeshStandardMaterial({ color: 0x998a70, roughness: 0.98 }),
    sandstoneDark: new THREE.MeshStandardMaterial({ color: 0x62584d, roughness: 1 }),
    terraceTop: new THREE.MeshStandardMaterial({ color: 0x77684d, roughness: 1 }),
    cliffFace: new THREE.MeshStandardMaterial({ color: 0x686a66, roughness: 1 }),
    cliffShadow: new THREE.MeshStandardMaterial({ color: 0x454845, roughness: 1 }),
    cliffWarm: new THREE.MeshStandardMaterial({ color: 0x81705b, roughness: 1 }),
    darkSoil: new THREE.MeshStandardMaterial({
      color: 0x6d6949,
      roughness: 1,
      transparent: true,
      opacity: 0.18,
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
  return true;
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
  dust.scale.set(3.65, 1, 2.78);
  dust.position.y = 0.035;
  dust.renderOrder = 1;
  g.add(dust);

  const addBox = (w, h, d, mat, x, y, z, ry = 0, rx = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  addBox(5.45, 0.18, 4.08, mats.padShadow, 0, 0.09, 0, 0.04);
  addBox(4.95, 0.13, 3.48, mats.padTop, 0.04, 0.25, -0.02, -0.025);
  addBox(4.2, 0.045, 0.16, mats.padRelief, 0.02, 0.34, -1.42);
  addBox(4.0, 0.045, 0.14, mats.padRelief, -0.08, 0.35, 1.35, 0.035);
  addBox(0.16, 0.045, 2.45, mats.padRelief, -2.12, 0.35, 0.0, -0.02);
  addBox(0.14, 0.045, 2.25, mats.padRelief, 2.18, 0.35, -0.06, 0.015);

  const tiles = [
    [-1.28, -0.72, 1.1, 0.74, 0.03],
    [0.02, -0.74, 1.18, 0.68, -0.04],
    [1.32, -0.66, 1.02, 0.76, 0.02],
    [-1.36, 0.24, 1.02, 0.76, -0.03],
    [-0.02, 0.18, 1.18, 0.82, 0.035],
    [1.28, 0.26, 1.08, 0.72, -0.025],
    [-0.72, 1.08, 1.05, 0.62, 0.04],
    [0.62, 1.06, 1.12, 0.58, -0.035],
  ];
  tiles.forEach(([x, z, w, d, ry], i) => {
    addBox(w, 0.052, d, i % 3 === 0 ? mats.padStone : mats.padTop, x, 0.39 + (i % 2) * 0.006, z, ry);
  });

  const chipGeo = new THREE.DodecahedronGeometry(0.22, 0);
  for (let i = 0; i < 14; i++) {
    const side = i % 4;
    const t = (Math.floor(i / 4) + 0.3 * (i % 2)) / 3.8;
    const x = side < 2 ? -2.66 + t * 5.32 : (side === 2 ? -2.7 : 2.68);
    const z = side < 2 ? (side === 0 ? -2.0 : 1.96) : -1.7 + t * 3.4;
    const stone = new THREE.Mesh(chipGeo.clone(), i % 2 ? mats.padShadow : mats.padStone);
    stone.position.set(x, 0.34 + (i % 3) * 0.015, z);
    stone.scale.set(1.05 + (i % 4) * 0.16, 0.38 + (i % 2) * 0.08, 0.74 + (i % 5) * 0.08);
    stone.rotation.set(0.2 + (i % 4) * 0.05, i * 0.71, -0.12 + (i % 3) * 0.08);
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
  const wall = new THREE.Mesh(openRingGeometry(), mats.sandstoneDark);
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);
  const lip = new THREE.Mesh(openRingGeometry(7.9, 15.6, 0.24, 64, 0.7), mats.terraceTop);
  lip.position.y = 3.04;
  lip.castShadow = true;
  lip.receiveShadow = true;
  g.add(lip);
  for (let i = 0; i < 34; i++) {
    const t = (i + 0.5) / 34;
    const a = 0.42 + (TAU - 0.84) * t;
    const r = 14.05 + (i % 3) * 0.18;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.2, 0.44), i % 2 ? mats.terraceTop : mats.sandstoneDark);
    stone.position.set(Math.sin(a) * r, 3.31, Math.cos(a) * r);
    stone.rotation.y = a;
    stone.scale.set(1 + (i % 4) * 0.08, 1, 0.82 + (i % 5) * 0.04);
    stone.castShadow = true;
    stone.receiveShadow = true;
    g.add(stone);
  }
  return g;
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
    fallbackDust.push(matrix(pad.pos.x, y + 0.04, pad.pos.z, pad.rot, 3.85, 1, 2.75));
    if (placeAuthoredGroundProp(map, group, 'zv_embedded_pad_set', pad.pos.x, pad.pos.z, pad.rot, { targetW: 6.05, yOffset: -0.13, tint: 0x4e4638 })) {
      continue;
    }
    const g = buildZabulistanPad();
    g.position.copy(pad.pos);
    g.position.y -= 0.15;
    g.rotation.y = pad.rot;
    group.add(g);
  }
  const authoredBlend = instanceProp('zv_pad_ground_blend', padBlends, {
    unit: 1,
    tint: 0x3f382d,
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
    for (let i = 4; i < samples.length - 5; i += 6) {
      const s = samples[i];
      const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
      for (const dir of [-1, 1]) {
        const jitter = 2.6 + rng() * 1.8;
        const x = s.pos.x + side.x * jitter * dir + (rng() - 0.5) * 0.9;
        const z = s.pos.z + side.z * jitter * dir + (rng() - 0.5) * 0.9;
        if (Math.hypot(x - map.exitPos.x, z - map.exitPos.z) < (map._footprint || 12) + 8) continue;
        if (map.visualBoard?.shape === 'circle' && Math.hypot(x, z) > map.visualBoard.radius - 2) continue;
        const y = map.heightAt(x, z) + 0.12;
        dust.push(matrix(x, y, z, rng() * TAU, 1.5 + rng() * 1.8, 1, 0.62 + rng() * 0.6));
        const along = Math.atan2(-s.tangent.z, s.tangent.x);
        if (rng() < 0.48) {
          roadAprons.push(matrix(
            x + (rng() - 0.5) * 0.9,
            y + 0.004,
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
            y + 0.015,
            z + (rng() - 0.5) * 0.8,
            along + (rng() - 0.5) * 0.28,
            0.78 + rng() * 0.34,
            1,
            0.72 + rng() * 0.24,
          ));
          if (rng() < 0.14) {
            roadFragments.push(matrix(
              x + (rng() - 0.5) * 1.1,
              y + 0.025,
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
            y + 0.008,
            z + (rng() - 0.5) * 0.7,
            along + (rng() - 0.5) * 0.34,
            0.88 + rng() * 0.28,
            1,
            0.72 + rng() * 0.22,
          ));
        }
        if (rng() < 0.58) stoneM.push(matrix(x + (rng() - 0.5) * 1.2, y + 0.06, z + (rng() - 0.5) * 1.2, rng() * TAU, 0.55 + rng() * 0.7, 0.22 + rng() * 0.22, 0.42 + rng() * 0.45, rng() * 0.35, rng() * 0.35));
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
  if (authoredEdges) group.add(authoredEdges);
  else addInstanced(group, dustGeo, mats.shoulderDust, dust, { castShadow: false, receiveShadow: false });
  const authoredScree = instanceProp('zv_road_scree_bank', roadScree, { unit: 1, tint: 0x504638, receiveShadow: true });
  if (authoredScree) group.add(authoredScree);
  const authoredFragments = instanceProp('zv_road_stone_fragments', roadFragments, { unit: 1, tint: 0x41382d, receiveShadow: true });
  if (authoredFragments) group.add(authoredFragments);
  const authoredStones = (authoredEdges || authoredFragments) ? null : instanceProp('zv_road_edge_stones', stoneM, { unit: 1, tint: 0x4a4034, receiveShadow: true });
  if (authoredStones) group.add(authoredStones);
  else if (!authoredEdges && !authoredFragments) addInstanced(group, stoneGeo, mats.sandstoneDark, stoneM);
}

function addGroundPatches(map, group, rng) {
  const mats = kitMats();
  const patchGeo = new THREE.CircleGeometry(1, 9);
  patchGeo.rotateX(-Math.PI / 2);
  const patches = [];
  for (let i = 0; i < 24; i++) {
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
  for (const path of map.paths || []) {
    if (!path.length) continue;
    const marks = [0.18, 0.36, 0.56, 0.74];
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

    const siegeMarks = [0.25, 0.68];
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
  const mats = kitMats();
  const cliffGeo = new THREE.DodecahedronGeometry(1, 0);
  const ridgeWalls = [];
  const cliff = [];
  const shadow = [];
  const radius = map.visualBoard?.radius || 86;
  const count = 42;
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
  const mats = kitMats();
  const exit = map.exitPos;
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
  addInstanced(group, geo, mats.cliffFace, rocks, { castShadow: true, receiveShadow: true });
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
    { key: 'left-upper', lane: -1, forward: 14.6, lateral: -11.0, targetW: 12.7, yawAdjust: -0.34 },
    { key: 'right-upper', lane: 1, forward: 15.4, lateral: 11.2, targetW: 12.3, yawAdjust: 0.36 },
    { key: 'left-lower', lane: -1, forward: 23.8, lateral: -13.8, targetW: 10.2, yawAdjust: -0.56 },
    { key: 'right-lower', lane: 1, forward: 25.2, lateral: 13.5, targetW: 10.0, yawAdjust: 0.52 },
  ];

  let authored = 0;
  for (const spec of placements) {
    const p = point(spec.forward, spec.lateral);
    if (!insideBoard(p, spec.key.includes('lower') ? 8 : 6)) continue;
    if (placeAuthoredGroundProp(map, group, 'zv_gate_cliff_siege_set', p.x, p.z, yaw + spec.yawAdjust, {
      targetW: spec.targetW,
      yOffset: -0.035,
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
  const mats = kitMats();
  const scrubGeo = new THREE.ConeGeometry(0.18, 0.9, 6);
  scrubGeo.translate(0, 0.45, 0);
  const darkGeo = new THREE.ConeGeometry(0.16, 0.72, 5);
  darkGeo.translate(0, 0.36, 0);
  const reedGeo = new THREE.ConeGeometry(0.055, 1.28, 5);
  reedGeo.translate(0, 0.64, 0);
  const tipGeo = new THREE.SphereGeometry(0.07, 6, 5);
  const scrub = [], scrubDark = [], reeds = [], reedTips = [];
  const patchGeo = new THREE.CircleGeometry(1, 20);
  patchGeo.rotateX(-Math.PI / 2);
  const patches = [];
  const scrubClusters = [];
  const reedPockets = [];
  const scrubCenters = [];
  const reedCenters = [];

  for (let i = 0; i < 34; i++) {
    const p = randomClearPoint(map, rng, 2.1, 70);
    if (!p) continue;
    const [cx, , cz] = p;
    const cy = map.heightAt(cx, cz);
    scrubCenters.push([cx, cy, cz]);
    scrubClusters.push(matrix(cx, cy + 0.025, cz, rng() * TAU, 0.82 + rng() * 0.42, 1, 0.78 + rng() * 0.32));
  }
  const authoredScrub =
    instanceProp('zv_dry_plant_set', scrubClusters, { unit: 1, tint: null, castShadow: false, receiveShadow: true }) ||
    instanceProp('zv_dry_scrub_cluster', scrubClusters, { unit: 1, tint: null, castShadow: false, receiveShadow: true });
  if (authoredScrub) {
    group.add(authoredScrub);
  } else {
    for (const [cx, , cz] of scrubCenters) {
    const count = 4 + Math.floor(rng() * 7);
    for (let k = 0; k < count; k++) {
      const a = rng() * TAU;
      const d = rng() * (1.3 + rng() * 1.4);
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const y = map.heightAt(x, z) + 0.02;
      const s = 0.62 + rng() * 0.92;
      const tilt = (rng() - 0.5) * 0.32;
      (rng() < 0.62 ? scrub : scrubDark).push(matrix(x, y, z, rng() * TAU, s * 0.82, s * (0.8 + rng() * 0.6), s * 0.82, tilt, (rng() - 0.5) * 0.18));
    }
  }
  }

  for (let i = 0; i < 7; i++) {
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
    for (let k = 0; k < 22; k++) {
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
    addInstanced(group, scrubGeo, mats.dryScrub, scrub, { castShadow: false, receiveShadow: true });
    addInstanced(group, darkGeo, mats.dryScrubDark, scrubDark, { castShadow: false, receiveShadow: true });
  }
  if (!authoredReeds) {
    addInstanced(group, reedGeo, mats.reed, reeds, { castShadow: false, receiveShadow: true });
    addInstanced(group, tipGeo, mats.reedTip, reedTips, { castShadow: false, receiveShadow: true });
  }
}

function scatterWeatheredRocks(map, group, rng) {
  const mats = kitMats();
  const fallbackGeo = new THREE.DodecahedronGeometry(0.9, 0);
  const fallback = [];
  const rubble = [];
  let glbPlaced = 0;
  for (let i = 0; i < 18; i++) {
    const p = randomClearPoint(map, rng, 5.2, 100);
    if (!p) continue;
    const [x, y, z] = p;
    const big = rng() < 0.26;
    if (big && glbPlaced < 5 && placeAuthoredGroundProp(map, group, 'zv_cliff_shoulder_set', x, z, rng() * TAU, {
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
  const inner = new THREE.Color(0x534838);
  const mid = new THREE.Color(0x665a44);
  const outer = new THREE.Color(0x7b6b4f);
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

  addPoly(0, -3.18, 3.1, 0.72, rng() * TAU, 9);
  addPoly(-2.6, -2.25, 1.05, 0.55, rng() * TAU, 7);
  addPoly(2.7, -2.18, 1.0, 0.58, rng() * TAU, 7);
  addPoly(-3.5, 0.2, 0.85, 0.42, rng() * TAU, 7);
  addPoly(3.35, 0.5, 0.8, 0.45, rng() * TAU, 7);
  addPoly(-1.15, -0.85, 0.9, 0.34, rng() * TAU, 6);
  addPoly(1.05, -0.72, 0.86, 0.36, rng() * TAU, 6);

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
  const pebbleCount = 46;
  const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleCount);
  for (let i = 0; i < pebbleCount; i++) {
    const lane = rng() < 0.5 ? -1 : 1;
    const lx = lane * (1.2 + rng() * 2.6) + (rng() - 0.5) * 0.42;
    const lz = -3.2 + rng() * 4.5;
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

  const causewayCenter = exit.clone().addScaledVector(fwd, 7.4);
  placeAuthoredGroundProp(map, group, 'zv_forecourt_causeway', causewayCenter.x, causewayCenter.z, yaw, {
    targetW: 10.8,
    yOffset: 0.045,
    tint: 0x453a2d,
    sceneName: 'zabulistan-forecourt-causeway',
  });
  placeAuthoredGroundProp(map, group, 'zv_forecourt_retaining_edges', causewayCenter.x, causewayCenter.z, yaw, {
    targetW: 11.2,
    yOffset: 0.055,
    tint: 0x453d31,
    sceneName: 'zabulistan-forecourt-retaining-edges',
  });
  placeAuthoredGroundProp(map, group, 'zv_forecourt_approach_edges', center.x, center.z, yaw, {
    targetW: 12.8,
    yOffset: 0.072,
    tint: 0x4b4134,
    sceneName: 'zabulistan-forecourt-approach-edges',
  });
  const lowerApproach = center.clone().addScaledVector(fwd, 7.3);
  placeAuthoredGroundProp(map, group, 'zv_forecourt_approach_edges', lowerApproach.x, lowerApproach.z, yaw, {
    targetW: 11.4,
    yOffset: 0.068,
    tint: 0x463c31,
    sceneName: 'zabulistan-forecourt-lower-approach-edges',
  });
  for (const lane of [-1, 1]) {
    const shoulder = lowerApproach.clone()
      .addScaledVector(side, lane * 4.8)
      .addScaledVector(fwd, lane > 0 ? 0.4 : -0.2);
    placeAuthoredGroundProp(map, group, 'zv_road_scree_bank', shoulder.x, shoulder.z, yaw + lane * 0.18, {
      targetW: 4.7,
      yOffset: 0.062,
      tint: 0x4a4034,
      sceneName: `zabulistan-forecourt-lower-scree-${lane < 0 ? 'left' : 'right'}`,
    });
  }

  const threshold = new THREE.Group();
  if (!placeAuthoredGroundProp(map, group, 'zv_forecourt_threshold', center.x, center.z, yaw, { targetW: 8.5, yOffset: 0.03 })) {
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
      targetW: 7.2,
      yOffset: 0.025,
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
      targetW: stagingPlaced ? 2.65 : 3.7,
      yOffset: 0.03,
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
  addPalaceCliffShelf(map, group, rng);
  addGateApproachDepth(map, group, rng);
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
