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
  if (style === 'zabulistan') {
    const rng = makeRng('road-texture:zabulistan');
    g.fillStyle = '#9a8660'; g.fillRect(0, 0, 128, 256);
    const shoulder = g.createLinearGradient(0, 0, 128, 0);
    shoulder.addColorStop(0, 'rgba(92,72,48,0.22)');
    shoulder.addColorStop(0.14, 'rgba(146,120,82,0.14)');
    shoulder.addColorStop(0.5, 'rgba(220,188,126,0.11)');
    shoulder.addColorStop(0.86, 'rgba(146,120,82,0.13)');
    shoulder.addColorStop(1, 'rgba(92,72,48,0.20)');
    g.fillStyle = shoulder;
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 980; i++) {
      const v = rng() * 44 - 22;
      g.fillStyle = `rgba(${150 + v},${130 + v},${90 + v},${0.22 + rng() * 0.18})`;
      g.fillRect(rng() * 128, rng() * 256, 1 + rng() * 4, 1 + rng() * 3);
    }
    for (let i = 0; i < 68; i++) {
      const x = 8 + rng() * 112;
      const y = rng() * 256;
      const w = 3 + rng() * 18;
      const h = 2 + rng() * 5;
      const v = rng() * 28 - 14;
      g.save();
      g.translate(x, y);
      g.rotate((rng() - 0.5) * 0.45);
      g.fillStyle = `rgba(${168 + v},${145 + v},${102 + v},0.18)`;
      g.fillRect(-w * 0.5, -h * 0.5, w, h);
      g.restore();
    }
    for (let y = 4; y < 256; y += 13 + rng() * 13) {
      for (const x of [31 + (rng() - 0.5) * 5, 94 + (rng() - 0.5) * 5]) {
        g.fillStyle = `rgba(104,78,48,${0.08 + rng() * 0.08})`;
        g.fillRect(x, y, 5 + rng() * 5, 6 + rng() * 15);
      }
    }
    for (let i = 0; i < 28; i++) {
      const y = rng() * 256;
      const x = 18 + rng() * 92;
      const w = 12 + rng() * 38;
      g.strokeStyle = `rgba(224,190,124,${0.08 + rng() * 0.09})`;
      g.lineWidth = 1 + rng() * 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(Math.min(126, x + w), y + (rng() - 0.5) * 5);
      g.stroke();
    }
    g.fillStyle = 'rgba(94,72,46,0.08)';
    g.fillRect(28, 0, 8, 256); g.fillRect(92, 0, 7, 256);
    g.fillStyle = 'rgba(238,205,142,0.07)';
    g.fillRect(46, 0, 32, 256);
  } else if (style === 'earth') {
    g.fillStyle = '#8a7458'; g.fillRect(0, 0, 128, 256);
    const edge = g.createLinearGradient(0, 0, 128, 0);
    edge.addColorStop(0, 'rgba(225,198,142,0.28)');
    edge.addColorStop(0.16, 'rgba(255,255,255,0)');
    edge.addColorStop(0.5, 'rgba(255,236,176,0.12)');
    edge.addColorStop(0.84, 'rgba(255,255,255,0)');
    edge.addColorStop(1, 'rgba(70,52,33,0.22)');
    g.fillStyle = edge;
    g.fillRect(0, 0, 128, 256);
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
    const wash = g.createLinearGradient(0, 0, 128, 0);
    wash.addColorStop(0, 'rgba(34,28,20,0.2)');
    wash.addColorStop(0.5, 'rgba(236,219,172,0.12)');
    wash.addColorStop(1, 'rgba(34,28,20,0.18)');
    g.fillStyle = wash;
    g.fillRect(0, 0, 128, 256);
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

let stoneTex = null, earthTex = null, zabulTex = null;

function roadEdgeOffsets(style, i, half, edgePhaseA, edgePhaseB) {
  const wobble = style === 'zabulistan'
    ? Math.sin(i * 0.43 + edgePhaseA) * 0.16 + Math.sin(i * 1.07 + edgePhaseB) * 0.06
    : 0;
  return {
    leftHalf: half + wobble + (style === 'zabulistan' ? Math.sin(i * 0.31 + edgePhaseB) * 0.07 : 0),
    rightHalf: half - wobble + (style === 'zabulistan' ? Math.sin(i * 0.37 + edgePhaseA) * 0.07 : 0),
    centerBias: style === 'zabulistan' ? Math.sin(i * 0.25 + edgePhaseA) * 0.045 : 0,
  };
}

function buildZabulistanRoadShoulder(samples, seed, half, edgePhaseA, edgePhaseB) {
  const lanes = 3;
  const verts = [];
  const colors = [];
  const idx = [];
  const palette = [
    new THREE.Color(0x6b6046),
    new THREE.Color(0x5f5b43),
    new THREE.Color(0x565840),
  ];
  const tint = new THREE.Color();
  const seedPhase = makeRng(seed + ':shoulder')() * Math.PI * 2;

  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const dir = sideIndex === 0 ? 1 : -1;
    const base = verts.length / 3;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
      const edge = roadEdgeOffsets('zabulistan', i, half, edgePhaseA, edgePhaseB);
      const edgeHalf = dir === 1 ? edge.leftHalf + edge.centerBias : edge.rightHalf - edge.centerBias;
      const midWave = Math.sin(i * 0.41 + seedPhase + sideIndex) * 0.035;
      const outerWave = Math.sin(i * 0.19 + seedPhase * 0.7 + sideIndex * 2.4) * 0.08
        + Math.sin(i * 0.53 + edgePhaseA) * 0.035;
      const offsets = [
        edgeHalf - 0.04,
        edgeHalf + 0.14 + midWave,
        edgeHalf + 0.46 + outerWave,
      ];
      for (let lane = 0; lane < lanes; lane++) {
        const rise = 0.055 - lane * 0.014 + Math.sin(i * 0.61 + lane + seedPhase) * 0.006;
        verts.push(
          s.pos.x + side.x * dir * offsets[lane],
          s.pos.y + rise,
          s.pos.z + side.z * dir * offsets[lane],
        );
        tint.copy(palette[lane]);
        const dust = Math.sin(i * 0.37 + lane * 1.8 + seedPhase) * 0.04;
        tint.offsetHSL(0, -0.03, dust);
        colors.push(tint.r, tint.g, tint.b);
      }
      if (i > 0) {
        const prev = base + (i - 1) * lanes;
        const curr = base + i * lanes;
        for (let lane = 0; lane < lanes - 1; lane++) {
          if (dir === 1) {
            idx.push(prev + lane, prev + lane + 1, curr + lane, curr + lane, prev + lane + 1, curr + lane + 1);
          } else {
            idx.push(prev + lane, curr + lane, prev + lane + 1, prev + lane + 1, curr + lane, curr + lane + 1);
          }
        }
      }
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
    polygonOffset: true,
    polygonOffsetFactor: -0.35,
    polygonOffsetUnits: -0.35,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'zabulistan-road-shoulder-blend';
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  return mesh;
}

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
  if (!stoneTex) { stoneTex = roadTexture('stone'); earthTex = roadTexture('earth'); zabulTex = roadTexture('zabulistan'); }
  const { samples } = sampled;
  const endDist = sampled.length || samples[samples.length - 1]?.dist || 0;
  const zabulistanForecourtTrim = 48;
  const roadSamples = style === 'zabulistan'
    ? samples.filter((s) => endDist - s.dist > zabulistanForecourtTrim - 2)
    : samples;
  const half = ROAD_WIDTH / 2;
  const verts = [], uvs = [], idx = [];
  const edgeRng = makeRng(seed + ':edge');
  const edgePhaseA = edgeRng() * Math.PI * 2;
  const edgePhaseB = edgeRng() * Math.PI * 2;
  for (let i = 0; i < roadSamples.length; i++) {
    const s = roadSamples[i];
    const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
    const edge = roadEdgeOffsets(style, i, half, edgePhaseA, edgePhaseB);
    const lx = s.pos.x + side.x * (edge.leftHalf + edge.centerBias), lz = s.pos.z + side.z * (edge.leftHalf + edge.centerBias);
    const rx = s.pos.x - side.x * (edge.rightHalf - edge.centerBias), rz = s.pos.z - side.z * (edge.rightHalf - edge.centerBias);
    const y = s.pos.y + 0.08;
    verts.push(lx, y, lz, rx, y, rz);
    const v = style === 'zabulistan' ? s.dist / 5.2 : s.dist / 6;
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
  const tex = style === 'earth' ? earthTex : style === 'zabulistan' ? zabulTex : stoneTex;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    bumpMap: tex,
    bumpScale: style === 'earth' ? 0.035 : style === 'zabulistan' ? 0.045 : 0.022,
    roughness: style === 'earth' || style === 'zabulistan' ? 0.98 : 0.92,
    metalness: 0,
    color: style === 'earth' ? 0xf0dfbd : style === 'zabulistan' ? 0xd1bd8f : 0xe6dcc6,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;

  const group = new THREE.Group();
  if (style === 'zabulistan') {
    const shoulderSamples = samples.filter((s) => endDist - s.dist > zabulistanForecourtTrim);
    if (shoulderSamples.length > 3) group.add(buildZabulistanRoadShoulder(shoulderSamples, seed, half, edgePhaseA, edgePhaseB));
  }
  group.add(mesh);

  // curbstones + occasional waymark pillars
  const rng = makeRng(seed);
  const curbGeo = style === 'zabulistan'
    ? new THREE.DodecahedronGeometry(0.34, 0)
    : new THREE.BoxGeometry(0.34, 0.22, 0.6);
  const curbMat = new THREE.MeshStandardMaterial({ color: style === 'zabulistan' ? 0x5f564b : 0x92846a, roughness: 1 });
  const curbs = [];
  const stride = style === 'zabulistan' ? 4 : 3;
  for (let i = 2; i < samples.length - 2; i += stride) {
    const s = samples[i];
    if (style === 'zabulistan' && endDist - s.dist < zabulistanForecourtTrim - 4) continue;
    const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
    for (const dir of [-1, 1]) {
      if (rng() < (style === 'zabulistan' ? 0.48 : 0.25)) continue;
      const m = new THREE.Matrix4();
      const a = Math.atan2(s.tangent.x, s.tangent.z);
      m.makeRotationY(a);
      if (style === 'zabulistan') {
        m.multiply(new THREE.Matrix4().makeScale(0.9 + rng() * 0.8, 0.28 + rng() * 0.18, 0.6 + rng() * 0.7));
        m.setPosition(s.pos.x + side.x * (half + 0.35 + rng() * 0.35) * dir, s.pos.y + 0.07, s.pos.z + side.z * (half + 0.35 + rng() * 0.35) * dir);
      } else {
        m.setPosition(s.pos.x + side.x * (half + 0.25) * dir, s.pos.y + 0.12, s.pos.z + side.z * (half + 0.25) * dir);
      }
      curbs.push(m);
    }
  }
  const curbInst = new THREE.InstancedMesh(curbGeo, curbMat, curbs.length);
  curbs.forEach((m, i) => curbInst.setMatrixAt(i, m));
  curbInst.castShadow = true; curbInst.receiveShadow = false;
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
