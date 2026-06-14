// Road system: authored control-point paths become real road geometry — a ribbon of
// ancient stone/packed earth conforming to terrain, with worn center, edge curbstones,
// and waymark pillars. NOT tubes. Enemies walk these exact curves.
import * as THREE from 'three';
import { makeRng } from './noise.js';

export const ROAD_WIDTH = 4.2;

function roadTexture(style = 'stone') {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  if (style === 'earth') {
    g.fillStyle = '#8a7458'; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 700; i++) {
      const v = Math.random() * 40 - 20;
      g.fillStyle = `rgba(${110 + v},${92 + v},${66 + v},0.6)`;
      g.fillRect(Math.random() * 128, Math.random() * 256, 3, 2);
    }
    // wheel ruts
    g.fillStyle = 'rgba(70,58,42,0.35)';
    g.fillRect(28, 0, 9, 256); g.fillRect(91, 0, 9, 256);
  } else {
    g.fillStyle = '#6e685c'; g.fillRect(0, 0, 128, 256);
    // irregular flagstones
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        const v = Math.random() * 26 - 13;
        g.fillStyle = `rgb(${138 + v},${130 + v},${114 + v})`;
        const off = (y % 2) * 16;
        g.fillRect(x * 32 + off % 32 + 2, y * 32 + 2, 28, 28);
      }
    }
    g.fillStyle = 'rgba(60,55,45,0.25)';
    g.fillRect(0, 0, 4, 256); g.fillRect(124, 0, 4, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let stoneTex = null, earthTex = null;

// Sample a Catmull-Rom curve through control points; returns arc-length-parameterized samples
export function samplePath(points2D, heightAt, step = 0.8) {
  const pts3 = points2D.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.35);
  const len = curve.getLength();
  const n = Math.max(24, Math.ceil(len / step));
  const samples = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    samples.push({ pos: p, tangent: tan, dist: t * len });
  }
  // smooth road height: average base terrain along a window so the road grades gently
  const hRaw = samples.map((s) => heightAt(s.pos.x, s.pos.z));
  const W = 7;
  for (let i = 0; i < samples.length; i++) {
    let acc = 0, cnt = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(samples.length - 1, i + W); j++) { acc += hRaw[j]; cnt++; }
    samples[i].pos.y = acc / cnt;
  }
  return { samples, length: len, curve };
}

export function buildRoadMesh(sampled, style = 'stone', seed = 'road') {
  if (!stoneTex) { stoneTex = roadTexture('stone'); earthTex = roadTexture('earth'); }
  const { samples } = sampled;
  const half = ROAD_WIDTH / 2;
  const verts = [], uvs = [], idx = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
    const lx = s.pos.x + side.x * half, lz = s.pos.z + side.z * half;
    const rx = s.pos.x - side.x * half, rz = s.pos.z - side.z * half;
    const y = s.pos.y + 0.08;
    verts.push(lx, y, lz, rx, y, rz);
    const v = s.dist / 6;
    uvs.push(0, v, 1, v);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); // wound to face up
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: style === 'earth' ? earthTex : stoneTex, roughness: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh);

  // curbstones + occasional waymark pillars
  const rng = makeRng(seed);
  const curbGeo = new THREE.BoxGeometry(0.34, 0.22, 0.6);
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x7d7563, roughness: 1 });
  const curbs = [];
  for (let i = 2; i < samples.length - 2; i += 3) {
    const s = samples[i];
    const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
    for (const dir of [-1, 1]) {
      if (rng() < 0.25) continue;
      const m = new THREE.Matrix4();
      const a = Math.atan2(s.tangent.x, s.tangent.z);
      m.makeRotationY(a);
      m.setPosition(s.pos.x + side.x * (half + 0.25) * dir, s.pos.y + 0.12, s.pos.z + side.z * (half + 0.25) * dir);
      curbs.push(m);
    }
  }
  const curbInst = new THREE.InstancedMesh(curbGeo, curbMat, curbs.length);
  curbs.forEach((m, i) => curbInst.setMatrixAt(i, m));
  curbInst.castShadow = true; curbInst.receiveShadow = true;
  group.add(curbInst);
  return group;
}

// position + facing along a sampled path at distance d
export function pointAt(sampled, d) {
  const { samples, length } = sampled;
  const dd = Math.max(0, Math.min(length, d));
  const f = (dd / length) * (samples.length - 1);
  const i = Math.min(samples.length - 2, Math.floor(f));
  const t = f - i;
  const a = samples[i], b = samples[i + 1];
  return {
    x: a.pos.x + (b.pos.x - a.pos.x) * t,
    y: a.pos.y + (b.pos.y - a.pos.y) * t,
    z: a.pos.z + (b.pos.z - a.pos.z) * t,
    tx: a.tangent.x + (b.tangent.x - a.tangent.x) * t,
    tz: a.tangent.z + (b.tangent.z - a.tangent.z) * t,
  };
}
