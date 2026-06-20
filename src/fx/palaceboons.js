import * as THREE from 'three';
import { settings } from '../core/settings.js';

const COLORS = {
  heal: new THREE.Color(0x7fe7c1),
  rallyDamage: new THREE.Color(0xf4cd6e),
  stunPulse: new THREE.Color(0xfff3c8),
  burnRing: new THREE.Color(0xff7a24),
  bindChains: new THREE.Color(0xb8bdc8),
  goldProvision: new THREE.Color(0xf4cd6e),
  rangeVision: new THREE.Color(0x7fe7ff),
  repairFortifications: new THREE.Color(0xd6c2a0),
  default: new THREE.Color(0xf4cd6e),
};

function colorFor(type) {
  return COLORS[type] || COLORS.default;
}

function circleLineGeometry(segments = 144) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function glowMaterial(color, opacity = 0.78, texture = null) {
  return new THREE.MeshBasicMaterial({
    color,
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function glowLineMaterial(color, opacity = 0.78) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

function sigilTexture(type) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  const gold = 'rgba(244,205,110,';
  const blue = 'rgba(127,231,255,';
  const red = 'rgba(255,122,36,';
  const chain = 'rgba(210,216,226,';
  const heal = 'rgba(127,231,193,';
  const grad = g.createLinearGradient(0, 0, 0, 256);
  const main = type === 'burnRing' ? red : type === 'bindChains' ? chain : type === 'heal' ? heal : type === 'rangeVision' ? blue : gold;
  grad.addColorStop(0, `${main}0)`);
  grad.addColorStop(0.18, `${main}0.72)`);
  grad.addColorStop(0.62, `${main}0.34)`);
  grad.addColorStop(1, `${main}0)`);
  g.fillStyle = grad;
  g.fillRect(58, 0, 12, 256);
  g.strokeStyle = `${main}0.86)`;
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (type === 'rangeVision') {
    g.beginPath(); g.moveTo(24, 126); g.lineTo(98, 82); g.lineTo(82, 108); g.moveTo(98, 82); g.lineTo(66, 78); g.stroke();
  } else if (type === 'bindChains') {
    for (const y of [74, 114, 154]) {
      g.beginPath(); g.ellipse(50, y, 18, 10, -0.6, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(78, y + 10, 18, 10, 0.6, 0, Math.PI * 2); g.stroke();
    }
  } else if (type === 'burnRing') {
    g.beginPath(); g.moveTo(64, 46); g.bezierCurveTo(106, 100, 84, 150, 64, 178); g.bezierCurveTo(34, 132, 26, 96, 64, 46); g.stroke();
  } else if (type === 'repairFortifications') {
    for (let y = 72; y <= 148; y += 28) for (let x = 28; x <= 78; x += 34) g.strokeRect(x + ((y / 28) % 2) * 17, y, 30, 18);
  } else if (type === 'goldProvision') {
    for (const [x, y, r] of [[45, 88, 15], [76, 116, 18], [52, 148, 13]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
  } else if (type === 'stunPulse') {
    g.beginPath(); g.moveTo(64, 58); g.lineTo(94, 112); g.lineTo(64, 166); g.lineTo(34, 112); g.closePath(); g.stroke();
  } else {
    g.beginPath(); g.moveTo(36, 70); g.lineTo(96, 92); g.lineTo(92, 150); g.lineTo(36, 128); g.closePath(); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function typeInk(type) {
  if (type === 'burnRing') return '255,122,36';
  if (type === 'bindChains') return '210,216,226';
  if (type === 'heal') return '127,231,193';
  if (type === 'rangeVision') return '127,231,255';
  if (type === 'repairFortifications') return '214,194,160';
  return '244,205,110';
}

function standardTexture(type) {
  const c = document.createElement('canvas');
  c.width = 144;
  c.height = 416;
  const g = c.getContext('2d');
  const ink = typeInk(type);
  const edge = type === 'bindChains' ? '235,238,246' : type === 'rangeVision' ? '190,244,255' : '255,239,190';
  const grad = g.createLinearGradient(0, 0, 0, 416);
  grad.addColorStop(0, `rgba(${ink},0)`);
  grad.addColorStop(0.16, `rgba(${ink},0.7)`);
  grad.addColorStop(0.66, `rgba(${ink},0.34)`);
  grad.addColorStop(1, `rgba(${ink},0)`);
  g.fillStyle = grad;
  g.fillRect(67, 0, 10, 416);

  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = `rgba(${edge},0.84)`;
  g.fillStyle = `rgba(${ink},0.18)`;
  g.beginPath();
  g.moveTo(34, 52);
  g.lineTo(112, 70);
  g.lineTo(102, 238);
  g.lineTo(36, 214);
  g.closePath();
  g.fill();
  g.stroke();

  g.strokeStyle = `rgba(${edge},0.62)`;
  for (const y of [98, 150, 202]) {
    g.beginPath();
    g.moveTo(42, y);
    g.lineTo(100, y + 14);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(38, 216);
  g.lineTo(30, 274);
  g.moveTo(68, 228);
  g.lineTo(66, 300);
  g.moveTo(100, 238);
  g.lineTo(112, 292);
  g.stroke();

  if (type === 'bindChains') {
    for (const y of [112, 162]) {
      g.beginPath(); g.ellipse(58, y, 14, 8, -0.45, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(84, y + 10, 14, 8, 0.45, 0, Math.PI * 2); g.stroke();
    }
  } else if (type === 'burnRing') {
    g.beginPath(); g.moveTo(70, 104); g.bezierCurveTo(96, 142, 84, 184, 68, 206); g.bezierCurveTo(48, 166, 42, 132, 70, 104); g.stroke();
  } else if (type === 'rangeVision') {
    g.beginPath(); g.moveTo(46, 164); g.lineTo(96, 122); g.lineTo(88, 146); g.moveTo(96, 122); g.lineTo(70, 120); g.stroke();
  } else {
    g.beginPath();
    g.moveTo(72, 112);
    g.lineTo(94, 154);
    g.lineTo(70, 200);
    g.lineTo(48, 154);
    g.closePath();
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function impactTexture(type) {
  const c = document.createElement('canvas');
  c.width = 168;
  c.height = 168;
  const g = c.getContext('2d');
  const ink = typeInk(type);
  const edge = type === 'bindChains'
    ? '238,241,248'
    : type === 'rangeVision'
      ? '196,246,255'
      : type === 'burnRing'
        ? '255,206,132'
        : '255,241,198';

  const glow = g.createRadialGradient(84, 84, 8, 84, 84, 78);
  glow.addColorStop(0, `rgba(${ink},0.36)`);
  glow.addColorStop(0.56, `rgba(${ink},0.15)`);
  glow.addColorStop(1, `rgba(${ink},0)`);
  g.fillStyle = glow;
  g.beginPath();
  g.arc(84, 84, 78, 0, Math.PI * 2);
  g.fill();

  g.lineWidth = 7;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = `rgba(${edge},0.94)`;
  g.fillStyle = `rgba(${ink},0.12)`;
  g.beginPath();
  g.moveTo(84, 20);
  g.lineTo(140, 84);
  g.lineTo(84, 148);
  g.lineTo(28, 84);
  g.closePath();
  g.fill();
  g.stroke();

  g.strokeStyle = `rgba(${edge},0.98)`;
  g.lineWidth = 9;
  if (type === 'burnRing') {
    g.beginPath();
    g.moveTo(86, 46);
    g.bezierCurveTo(116, 83, 104, 118, 82, 136);
    g.bezierCurveTo(58, 105, 58, 74, 86, 46);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(86, 76);
    g.bezierCurveTo(98, 96, 94, 114, 81, 126);
    g.bezierCurveTo(70, 105, 71, 89, 86, 76);
    g.stroke();
  } else if (type === 'bindChains') {
    for (const y of [66, 92, 118]) {
      g.beginPath();
      g.ellipse(67, y, 24, 12, -0.55, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(101, y + 12, 24, 12, 0.55, 0, Math.PI * 2);
      g.stroke();
    }
  } else if (type === 'rangeVision') {
    g.beginPath();
    g.moveTo(44, 98);
    g.lineTo(118, 54);
    g.lineTo(101, 81);
    g.moveTo(118, 54);
    g.lineTo(82, 52);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(80, 112, 32, 15, 0, 0, Math.PI * 2);
    g.moveTo(80, 112);
    g.arc(80, 112, 7, 0, Math.PI * 2);
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(84, 46);
    g.lineTo(112, 84);
    g.lineTo(84, 122);
    g.lineTo(56, 84);
    g.closePath();
    g.stroke();
    g.lineWidth = 5;
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      g.beginPath();
      g.moveTo(84 + Math.cos(a) * 42, 84 + Math.sin(a) * 42);
      g.lineTo(84 + Math.cos(a) * 58, 84 + Math.sin(a) * 58);
      g.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function pillarTexture(type) {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 384;
  const g = c.getContext('2d');
  const ink = typeInk(type);
  const edge = type === 'bindChains'
    ? '240,242,250'
    : type === 'rangeVision'
      ? '203,248,255'
      : type === 'burnRing'
        ? '255,211,142'
        : '255,241,198';

  const column = g.createLinearGradient(0, 0, 0, 384);
  column.addColorStop(0, `rgba(${ink},0)`);
  column.addColorStop(0.22, `rgba(${ink},0.54)`);
  column.addColorStop(0.58, `rgba(${ink},0.38)`);
  column.addColorStop(1, `rgba(${ink},0)`);
  g.fillStyle = column;
  g.beginPath();
  g.moveTo(48, 0);
  g.bezierCurveTo(78, 76, 70, 278, 48, 384);
  g.bezierCurveTo(26, 278, 18, 76, 48, 0);
  g.closePath();
  g.fill();

  g.strokeStyle = `rgba(${edge},0.9)`;
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(48, 22);
  g.lineTo(48, 348);
  g.stroke();

  g.lineWidth = 4;
  for (const y of [84, 160, 236]) {
    g.beginPath();
    g.moveTo(26, y);
    g.lineTo(48, y + 28);
    g.lineTo(70, y);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function burstLineGeometry(spokes = 16) {
  const pts = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const inner = 0.28 + (i % 2) * 0.08;
    const outer = 0.9 + (i % 3) * 0.2;
    pts.push(
      new THREE.Vector3(Math.cos(a) * inner, 0, Math.sin(a) * inner),
      new THREE.Vector3(Math.cos(a) * outer, 0, Math.sin(a) * outer),
    );
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function arcPoint(a, b, c, t) {
  const q = 1 - t;
  return new THREE.Vector3(
    a.x * q * q + b.x * 2 * q * t + c.x * t * t,
    a.y * q * q + b.y * 2 * q * t + c.y * t * t,
    a.z * q * q + b.z * 2 * q * t + c.z * t * t,
  );
}

function targetPos(target) {
  if (!target) return null;
  if (target.isVector3) return target;
  if (target.pos) return target.pos;
  if (target.group?.position) return target.group.position;
  return null;
}

export class PalaceBoonField {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.group = new THREE.Group();
    this.group.name = 'palace-boon-field';
    this.group.renderOrder = 10;
    this.ringGeo = circleLineGeometry(160);
    this.haloGeo = circleLineGeometry(96);
    this.waveGeo = new THREE.RingGeometry(0.74, 1.0, 192);
    this.sigilGeo = new THREE.PlaneGeometry(3.4, 7.2);
    this.standardGeo = new THREE.PlaneGeometry(4.8, 13.8);
    this.impactGeo = new THREE.PlaneGeometry(3.5, 3.5);
    this.impactHaloGeo = new THREE.RingGeometry(0.76, 1.0, 96);
    this.impactPillarGeo = new THREE.PlaneGeometry(2.7, 8.8);
    this.impactBurstGeo = burstLineGeometry(16);
    this.targetLockGeo = new THREE.RingGeometry(0.78, 1.04, 88);
    this.statusBadgeGeo = new THREE.PlaneGeometry(1.42, 1.42);
    this.statusPulseGeo = new THREE.RingGeometry(0.48, 0.64, 72);
    this.sparkGeo = new THREE.SphereGeometry(0.22, 8, 6);
    this.textures = new Map();
    this.standardTextures = new Map();
    this.impactTextures = new Map();
    this.pillarTextures = new Map();
    this.waves = [];
    this.rings = [];
    this.sigils = [];
    this.standards = [];
    this.impacts = [];
    this.impactHalos = [];
    this.impactPillars = [];
    this.impactBursts = [];
    this.targetLocks = [];
    this.statusReads = [];
    this.rays = [];
    this.commandThreads = [];
    this.visionSweeps = [];
    scene.add(this.group);
  }

  trigger(citadel, cfg, targets = {}) {
    if (settings.get('reducedMotion')) return;
    const type = cfg?.type || 'default';
    const color = colorFor(type);
    const keep = targets.keep || citadel?.group?.position || this.map.exitPos;
    const front = targets.front || keep;
    const radius = cfg?.radius || 30;
    const keepY = this.map.heightAt(keep.x, keep.z) + 0.24;
    const frontY = this.map.heightAt(front.x, front.z) + 0.2;
    this._addShockwave(front.x, frontY + 0.04, front.z, { max: radius * 1.08, life: 1.5, color, delay: 0 });
    this._addShockwave(keep.x, keepY + 0.09, keep.z, { max: Math.min(34, radius * 0.72), life: 1.24, color: COLORS.rallyDamage, delay: 0.1 });
    this._addRing(front.x, frontY, front.z, { max: radius, life: 1.2, color, delay: 0 });
    this._addRing(keep.x, keepY + 0.05, keep.z, { max: Math.min(28, radius * 0.62), life: 1.05, color: COLORS.rallyDamage, delay: 0.08 });
    this._addSigil(keep.x, keep.y + (citadel?.height || 18) * 0.72, keep.z, { type, color, life: 1.45, scale: 1.15, delay: 0.02 });
    this._addStandard(keep.x, keep.y + (citadel?.height || 18) * 0.86, keep.z, { type, color, life: 1.9, scale: 1.12, delay: 0.04 });
    this._addStandard(front.x, frontY + 6.6, front.z, { type, color, life: 1.35, scale: 0.72, delay: 0.12 });
    if (type === 'rangeVision') {
      this._addVisionSweep(keep, front, radius, color, { life: 2.65, delay: 0.02 });
      this._addImpactHalo(front.x, frontY + 0.14, front.z, { color, max: Math.min(7.8, radius * 0.24), life: 1.35, delay: 0.04 });
      this._addImpactPillar(front.x, frontY + 5.4, front.z, { type, color, life: 1.32, scale: 1.18, delay: 0.08 });
      this._addImpact(front.x, frontY + 3.4, front.z, { type, color, life: 1.28, scale: 1.12, delay: 0.12 });
    }

    const anchors = this._anchorsFor(type, targets).slice(0, 12);
    anchors.forEach((p, i) => {
      const y = p.y || this.map.heightAt(p.x, p.z);
      this._addSigil(p.x, y + 4.4, p.z, {
        type, color, life: 1.0, scale: 0.38, delay: 0.08 + i * 0.025,
      });
      if (i < 8) this._addStandard(p.x, y + 5.0, p.z, { type, color, life: 1.04, scale: 0.3, delay: 0.12 + i * 0.03 });
    });

    const enemyTargets = this._enemyTargetsFor(type, targets).slice(0, 12);
    const enemyAnchors = enemyTargets.map((target) => targetPos(target)).filter(Boolean);
    enemyAnchors.forEach((p, i) => {
      const y = p.y || this.map.heightAt(p.x, p.z);
      this._addImpactHalo(p.x, y + 0.09, p.z, { color, max: 2.8, life: 0.82, delay: 0.04 + i * 0.025 });
      this._addImpactBurst(p.x, y + 0.14, p.z, { color, max: 3.15, life: 0.72, delay: 0.04 + i * 0.025 });
      this._addImpactPillar(p.x, y + 4.35, p.z, { type, color, life: 0.78, scale: 0.84, delay: 0.045 + i * 0.026 });
      this._addImpact(p.x, y + 3.0, p.z, { type, color, life: 0.96, scale: 0.82, delay: 0.07 + i * 0.03 });
      this._addTargetLock(enemyTargets[i], color, { life: 1.18, delay: 0.02 + i * 0.024, scale: 1.18 });
      this._addStatusRead(enemyTargets[i], { type, color, life: 2.35, delay: 0.08 + i * 0.035 });
    });
    const threadAnchors = (enemyAnchors.length ? enemyAnchors : anchors).slice(0, 12);
    if (threadAnchors.length) {
      const start = new THREE.Vector3(keep.x, keepY + 4.2, keep.z);
      const gate = new THREE.Vector3(front.x, frontY + 2.3, front.z);
      const points = threadAnchors
        .slice()
        .sort((a, b) => a.distanceToSquared(front) - b.distanceToSquared(front))
        .map((p) => new THREE.Vector3(p.x, (p.y || this.map.heightAt(p.x, p.z)) + 2.1, p.z));
      this._addCommandThread([start, gate, ...points], color, { life: 1.32, delay: 0.05 });
      if (type === 'goldProvision' || type === 'repairFortifications' || type === 'heal') {
        this._addCommandThread([start, ...points.slice().reverse()], COLORS.rallyDamage, { life: 1.14, delay: 0.16 });
      }
    }

    const rayCounts = {
      rangeVision: 8,
      stunPulse: 10,
      goldProvision: 7,
      repairFortifications: 7,
      heal: 6,
      rallyDamage: 6,
      burnRing: 6,
      bindChains: 6,
    };
    const n = rayCounts[type] || 6;
    const rayLen = type === 'stunPulse'
      ? Math.min(radius * 0.72, 32)
      : Math.min(radius * 0.95, type === 'rangeVision' ? 48 : 42);
    const spin = type === 'rangeVision' ? 0.14 : type === 'goldProvision' ? 0.24 : type === 'repairFortifications' ? -0.12 : 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + spin;
      this._addRay(front, a, rayLen, color, 0.85 + i * 0.03, type === 'rangeVision' ? 1.65 : 1);
    }
  }

  _anchorsFor(type, targets) {
    if (type === 'burnRing' || type === 'bindChains' || type === 'stunPulse') {
      return (targets.enemies || []).map((e) => e.group?.position).filter(Boolean);
    }
    return (targets.towers || []).map((t) => t.pos).filter(Boolean);
  }

  _enemyTargetsFor(type, targets) {
    if (type !== 'burnRing' && type !== 'bindChains' && type !== 'stunPulse' && type !== 'rangeVision') return [];
    return (targets.enemies || []).filter((e) => targetPos(e));
  }

  _texture(type) {
    if (!this.textures.has(type)) this.textures.set(type, sigilTexture(type));
    return this.textures.get(type);
  }

  _standardTexture(type) {
    if (!this.standardTextures.has(type)) this.standardTextures.set(type, standardTexture(type));
    return this.standardTextures.get(type);
  }

  _impactTexture(type) {
    if (!this.impactTextures.has(type)) this.impactTextures.set(type, impactTexture(type));
    return this.impactTextures.get(type);
  }

  _pillarTexture(type) {
    if (!this.pillarTextures.has(type)) this.pillarTextures.set(type, pillarTexture(type));
    return this.pillarTextures.get(type);
  }

  _addShockwave(x, y, z, { max, life, color, delay }) {
    const mat = glowMaterial(color, 0);
    const mesh = new THREE.Mesh(this.waveGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.35);
    mesh.frustumCulled = false;
    mesh.renderOrder = 38;
    this.group.add(mesh);
    this.waves.push({ mesh, mat, max, life, t: -delay });
  }

  _addRing(x, y, z, { max, life, color, delay }) {
    const mat = glowLineMaterial(color, 0.86);
    const mesh = new THREE.LineLoop(max > 24 ? this.ringGeo : this.haloGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.35);
    mesh.frustumCulled = false;
    mesh.renderOrder = 40;
    this.group.add(mesh);
    this.rings.push({ mesh, mat, max, life, t: -delay });
  }

  _addSigil(x, y, z, { type, color, life, scale, delay }) {
    const mat = glowMaterial(color, 0, this._texture(type));
    const mesh = new THREE.Mesh(this.sigilGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    mesh.frustumCulled = false;
    mesh.renderOrder = 41;
    this.group.add(mesh);
    this.sigils.push({ mesh, mat, life, t: -delay, phase: Math.random() * Math.PI * 2 });
  }

  _addStandard(x, y, z, { type, color, life, scale, delay }) {
    const mat = glowMaterial(color, 0, this._standardTexture(type));
    const mesh = new THREE.Mesh(this.standardGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    mesh.frustumCulled = false;
    mesh.renderOrder = 42;
    this.group.add(mesh);
    this.standards.push({ mesh, mat, life, scale, t: -delay, phase: Math.random() * Math.PI * 2 });
  }

  _addImpact(x, y, z, { type, color, life, scale, delay }) {
    const mat = glowMaterial(color, 0, this._impactTexture(type));
    const mesh = new THREE.Mesh(this.impactGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    mesh.frustumCulled = false;
    mesh.renderOrder = 44;
    this.group.add(mesh);
    this.impacts.push({ mesh, mat, life, scale, t: -delay, phase: Math.random() * Math.PI * 2 });
  }

  _addImpactHalo(x, y, z, { color, max, life, delay }) {
    const mat = glowMaterial(color, 0);
    const mesh = new THREE.Mesh(this.impactHaloGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.35);
    mesh.frustumCulled = false;
    mesh.renderOrder = 43;
    this.group.add(mesh);
    this.impactHalos.push({ mesh, mat, max, life, t: -delay });
  }

  _addImpactPillar(x, y, z, { type, color, life, scale, delay }) {
    const mat = glowMaterial(color, 0, this._pillarTexture(type));
    const mesh = new THREE.Mesh(this.impactPillarGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    mesh.frustumCulled = false;
    mesh.renderOrder = 45;
    this.group.add(mesh);
    this.impactPillars.push({ mesh, mat, life, scale, t: -delay, phase: Math.random() * Math.PI * 2 });
  }

  _addImpactBurst(x, y, z, { color, max, life, delay }) {
    const mat = glowLineMaterial(color, 0);
    const mesh = new THREE.LineSegments(this.impactBurstGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.35);
    mesh.frustumCulled = false;
    mesh.renderOrder = 45;
    this.group.add(mesh);
    this.impactBursts.push({ mesh, mat, max, life, t: -delay, spin: Math.random() > 0.5 ? 1 : -1 });
  }

  _addTargetLock(target, color, { life, delay, scale }) {
    const p = targetPos(target);
    if (!p) return;
    const mat = glowMaterial(color, 0);
    const mesh = new THREE.Mesh(this.targetLockGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, this.map.heightAt(p.x, p.z) + 0.3, p.z);
    mesh.frustumCulled = false;
    mesh.renderOrder = 47;
    this.group.add(mesh);
    this.targetLocks.push({ target, mesh, mat, life, scale, t: -delay, spin: Math.random() > 0.5 ? 1 : -1 });
  }

  _addStatusRead(target, { type, color, life, delay }) {
    const p = targetPos(target);
    if (!p) return;
    const mat = glowMaterial(color, 0, this._impactTexture(type));
    const badge = new THREE.Mesh(this.statusBadgeGeo, mat);
    badge.frustumCulled = false;
    badge.renderOrder = 50;
    this.group.add(badge);

    const pulseMat = glowMaterial(color, 0);
    const pulse = new THREE.Mesh(this.statusPulseGeo, pulseMat);
    pulse.rotation.x = -Math.PI / 2;
    pulse.frustumCulled = false;
    pulse.renderOrder = 49;
    this.group.add(pulse);

    this.statusReads.push({
      target, badge, mat, pulse, pulseMat, type, life, t: -delay,
      phase: Math.random() * Math.PI * 2,
      spin: Math.random() > 0.5 ? 1 : -1,
    });
  }

  _addRay(origin, angle, len, color, life, strength = 1) {
    const start = new THREE.Vector3(origin.x, this.map.heightAt(origin.x, origin.z) + 0.42, origin.z);
    const endX = origin.x + Math.cos(angle) * len;
    const endZ = origin.z + Math.sin(angle) * len;
    const end = new THREE.Vector3(endX, this.map.heightAt(endX, endZ) + 0.72, endZ);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += Math.min(12, 3.0 + len * 0.08);
    const points = [];
    for (let i = 0; i <= 22; i++) points.push(arcPoint(start, mid, end, i / 22));

    const mat = glowLineMaterial(color, 0.52);
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mesh = new THREE.Line(geom, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 39;
    this.group.add(mesh);

    const sparkMat = glowMaterial(color, 0);
    const spark = new THREE.Mesh(this.sparkGeo, sparkMat);
    spark.position.copy(points[0]);
    spark.frustumCulled = false;
    spark.renderOrder = 42;
    this.group.add(spark);
    this.rays.push({ mesh, mat, geom, spark, sparkMat, points, life, t: 0, strength });
  }

  _addCommandThread(points, color, { life, delay }) {
    if (!points || points.length < 2) return;
    const curve = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const c = points[i + 1];
      const mid = a.clone().lerp(c, 0.5);
      mid.y += Math.min(8.5, 2.8 + a.distanceTo(c) * 0.06);
      for (let s = 0; s <= 9; s++) {
        if (i > 0 && s === 0) continue;
        curve.push(arcPoint(a, mid, c, s / 9));
      }
    }
    const mat = glowLineMaterial(color, 0);
    const geom = new THREE.BufferGeometry().setFromPoints(curve);
    const mesh = new THREE.Line(geom, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 46;
    this.group.add(mesh);
    this.commandThreads.push({ mesh, mat, geom, life, t: -delay, phase: Math.random() * Math.PI * 2 });
  }

  _addVisionSweep(keep, front, radius, color, { life, delay }) {
    const dir = front.clone().sub(keep);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
    else dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const base = front.clone();
    const arcPointAt = (localDir, distance, sideOffset, lift = 0.7) => {
      const p = base.clone().addScaledVector(localDir, distance).addScaledVector(side, sideOffset);
      p.y = this.map.heightAt(p.x, p.z) + lift;
      return p;
    };
    const segments = [];
    const addSegmentedArc = (a, c, b, steps = 12) => {
      let prev = a;
      for (let i = 1; i <= steps; i++) {
        const next = arcPoint(a, c, b, i / steps);
        segments.push(prev.clone(), next.clone());
        prev = next;
      }
    };

    const origin = arcPointAt(dir, 0, 0, 0.85);
    for (const spread of [-0.54, -0.3, 0, 0.3, 0.54]) {
      const distance = radius * (1.05 - Math.abs(spread) * 0.18);
      const end = arcPointAt(dir, distance, radius * spread, 0.78);
      const mid = origin.clone().lerp(end, 0.5);
      mid.y += Math.min(8.5, 3.8 + radius * 0.07);
      addSegmentedArc(origin, mid, end, 14);
    }

    for (const band of [0.32, 0.55, 0.78]) {
      const steps = 14;
      let prev = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps - 0.5;
        const p = arcPointAt(dir, radius * band, radius * t * (0.88 + band * 0.18), 0.68 + band * 0.18);
        if (prev) segments.push(prev.clone(), p.clone());
        prev = p;
      }
    }

    const geom = new THREE.BufferGeometry().setFromPoints(segments);
    const mat = glowLineMaterial(color, 0);
    const mesh = new THREE.LineSegments(geom, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 48;
    mesh.userData.visualLayer = 'palace-command-fx';
    this.group.add(mesh);
    this.visionSweeps.push({
      mesh,
      mat,
      geom,
      life,
      t: -delay,
      phase: Math.random() * Math.PI * 2,
    });
  }

  update(dt, camera, time = 0) {
    const cam = camera?.position;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt;
      if (w.t < 0) continue;
      const k = Math.min(1, w.t / w.life);
      if (k >= 1) { this._removeShockwave(i); continue; }
      const eased = 1 - Math.pow(1 - k, 2.25);
      w.mesh.scale.setScalar(0.75 + eased * w.max);
      w.mat.opacity = Math.sin(Math.PI * k) * (1 - k * 0.32) * 0.36;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t < 0) continue;
      const k = Math.min(1, r.t / r.life);
      if (k >= 1) { this._removeRing(i); continue; }
      const eased = 1 - Math.pow(1 - k, 2.1);
      r.mesh.scale.setScalar(0.65 + eased * r.max);
      r.mat.opacity = (1 - k) * 0.76;
    }
    for (let i = this.sigils.length - 1; i >= 0; i--) {
      const s = this.sigils[i];
      s.t += dt;
      if (s.t < 0) continue;
      const k = Math.min(1, s.t / s.life);
      if (k >= 1) { this._removeSigil(i); continue; }
      if (cam) s.mesh.lookAt(cam.x, s.mesh.position.y, cam.z);
      s.mesh.position.y += Math.sin(time * 4.6 + s.phase) * dt * 0.12;
      s.mat.opacity = Math.sin(Math.PI * k) * 0.78;
    }
    for (let i = this.standards.length - 1; i >= 0; i--) {
      const s = this.standards[i];
      s.t += dt;
      if (s.t < 0) continue;
      const k = Math.min(1, s.t / s.life);
      if (k >= 1) { this._removeStandard(i); continue; }
      const swell = Math.sin(Math.PI * k);
      if (cam) s.mesh.lookAt(cam.x, s.mesh.position.y, cam.z);
      s.mesh.position.y += Math.sin(time * 4.0 + s.phase) * dt * 0.14;
      s.mesh.scale.setScalar(s.scale * (0.78 + swell * 0.32));
      s.mat.opacity = swell * 0.76;
    }
    for (let i = this.impactHalos.length - 1; i >= 0; i--) {
      const h = this.impactHalos[i];
      h.t += dt;
      if (h.t < 0) continue;
      const k = Math.min(1, h.t / h.life);
      if (k >= 1) { this._removeImpactHalo(i); continue; }
      const eased = 1 - Math.pow(1 - k, 2.08);
      h.mesh.scale.setScalar(0.45 + eased * h.max);
      h.mat.opacity = Math.sin(Math.PI * k) * 0.46;
    }
    for (let i = this.impactBursts.length - 1; i >= 0; i--) {
      const b = this.impactBursts[i];
      b.t += dt;
      if (b.t < 0) continue;
      const k = Math.min(1, b.t / b.life);
      if (k >= 1) { this._removeImpactBurst(i); continue; }
      const eased = 1 - Math.pow(1 - k, 2.18);
      b.mesh.scale.setScalar(0.42 + eased * b.max);
      b.mesh.rotation.y += dt * b.spin * 1.7;
      b.mat.opacity = Math.sin(Math.PI * k) * 0.8;
    }
    for (let i = this.impactPillars.length - 1; i >= 0; i--) {
      const p = this.impactPillars[i];
      p.t += dt;
      if (p.t < 0) continue;
      const k = Math.min(1, p.t / p.life);
      if (k >= 1) { this._removeImpactPillar(i); continue; }
      const swell = Math.sin(Math.PI * k);
      if (cam) p.mesh.lookAt(cam.x, p.mesh.position.y, cam.z);
      p.mesh.position.y += Math.sin(time * 7.4 + p.phase) * dt * 0.12 + dt * 0.3;
      p.mesh.scale.set(p.scale * (0.58 + swell * 0.58), p.scale * (0.8 + swell * 0.36), p.scale);
      p.mat.opacity = swell * 0.84;
    }
    for (let i = this.targetLocks.length - 1; i >= 0; i--) {
      const lock = this.targetLocks[i];
      lock.t += dt;
      if (lock.t < 0) continue;
      const p = targetPos(lock.target);
      if (!p || lock.target?.alive === false) { this._removeTargetLock(i); continue; }
      const k = Math.min(1, lock.t / lock.life);
      if (k >= 1) { this._removeTargetLock(i); continue; }
      const swell = Math.sin(Math.PI * k);
      lock.mesh.position.set(p.x, this.map.heightAt(p.x, p.z) + 0.3 + swell * 0.1, p.z);
      lock.mesh.rotation.z += dt * lock.spin * 1.55;
      lock.mesh.scale.setScalar(lock.scale * (0.74 + swell * 0.62));
      lock.mat.opacity = swell * 0.6;
    }
    for (let i = this.statusReads.length - 1; i >= 0; i--) {
      const read = this.statusReads[i];
      read.t += dt;
      if (read.t < 0) continue;
      const p = targetPos(read.target);
      if (!p || read.target?.alive === false) { this._removeStatusRead(i); continue; }
      const k = Math.min(1, read.t / read.life);
      if (k >= 1) { this._removeStatusRead(i); continue; }
      const fade = Math.min(1, k / 0.16, (1 - k) / 0.24);
      const head = read.target?.model?.headH || 1.7;
      const groundY = this.map.heightAt(p.x, p.z);
      read.badge.position.set(
        p.x,
        groundY + head + 1.28 + Math.sin(time * 5.2 + read.phase) * 0.1,
        p.z,
      );
      if (cam) read.badge.lookAt(cam.x, read.badge.position.y, cam.z);
      read.badge.scale.setScalar(0.82 + fade * 0.5 + Math.sin(time * 4.6 + read.phase) * 0.03);
      read.mat.opacity = fade * 0.94;

      read.pulse.position.set(p.x, groundY + 0.25, p.z);
      read.pulse.rotation.z += dt * read.spin * 1.35;
      read.pulse.scale.setScalar(1.12 + Math.sin(Math.PI * k) * 0.86 + k * 0.36);
      read.pulseMat.opacity = fade * (0.3 + Math.sin(time * 6.4 + read.phase) * 0.08);
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const mark = this.impacts[i];
      mark.t += dt;
      if (mark.t < 0) continue;
      const k = Math.min(1, mark.t / mark.life);
      if (k >= 1) { this._removeImpact(i); continue; }
      const swell = Math.sin(Math.PI * k);
      if (cam) mark.mesh.lookAt(cam.x, mark.mesh.position.y, cam.z);
      mark.mesh.position.y += Math.sin(time * 7.0 + mark.phase) * dt * 0.11 + dt * 0.2;
      mark.mesh.scale.setScalar(mark.scale * (0.72 + swell * 0.48));
      mark.mat.opacity = swell * 0.92;
    }
    for (let i = this.rays.length - 1; i >= 0; i--) {
      const r = this.rays[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.life);
      if (k >= 1) { this._removeRay(i); continue; }
      const swell = Math.sin(Math.PI * k);
      const head = Math.min(1, Math.max(0, k * 1.1));
      const idx = Math.min(r.points.length - 1, Math.floor(head * (r.points.length - 1)));
      r.spark.position.copy(r.points[idx]);
      r.spark.scale.setScalar(0.8 + swell * 1.65);
      r.mat.opacity = ((1 - k) * 0.34 + swell * 0.18) * (r.strength || 1);
      r.sparkMat.opacity = swell * 0.88 * (r.strength || 1);
    }
    for (let i = this.commandThreads.length - 1; i >= 0; i--) {
      const th = this.commandThreads[i];
      th.t += dt;
      if (th.t < 0) continue;
      const k = Math.min(1, th.t / th.life);
      if (k >= 1) { this._removeCommandThread(i); continue; }
      const swell = Math.sin(Math.PI * k);
      th.mesh.position.y = Math.sin(time * 4.9 + th.phase) * 0.1 + k * 0.46;
      th.mat.opacity = swell * (0.5 + (1 - k) * 0.18);
    }
    for (let i = this.visionSweeps.length - 1; i >= 0; i--) {
      const sweep = this.visionSweeps[i];
      sweep.t += dt;
      if (sweep.t < 0) continue;
      const k = Math.min(1, sweep.t / sweep.life);
      if (k >= 1) { this._removeVisionSweep(i); continue; }
      const fade = Math.min(1, k / 0.12, (1 - k) / 0.34);
      sweep.mesh.position.y = Math.sin(time * 5.2 + sweep.phase) * 0.12 + k * 0.36;
      sweep.mesh.scale.setScalar(0.92 + Math.sin(Math.PI * k) * 0.1);
      sweep.mat.opacity = fade * (0.74 + Math.sin(time * 6.4 + sweep.phase) * 0.1);
    }
  }

  _removeShockwave(i) {
    const w = this.waves[i];
    this.group.remove(w.mesh);
    w.mat.dispose();
    this.waves.splice(i, 1);
  }

  _removeRing(i) {
    const r = this.rings[i];
    this.group.remove(r.mesh);
    r.mat.dispose();
    this.rings.splice(i, 1);
  }

  _removeSigil(i) {
    const s = this.sigils[i];
    this.group.remove(s.mesh);
    s.mat.dispose();
    this.sigils.splice(i, 1);
  }

  _removeStandard(i) {
    const s = this.standards[i];
    this.group.remove(s.mesh);
    s.mat.dispose();
    this.standards.splice(i, 1);
  }

  _removeImpact(i) {
    const mark = this.impacts[i];
    this.group.remove(mark.mesh);
    mark.mat.dispose();
    this.impacts.splice(i, 1);
  }

  _removeImpactHalo(i) {
    const h = this.impactHalos[i];
    this.group.remove(h.mesh);
    h.mat.dispose();
    this.impactHalos.splice(i, 1);
  }

  _removeImpactPillar(i) {
    const p = this.impactPillars[i];
    this.group.remove(p.mesh);
    p.mat.dispose();
    this.impactPillars.splice(i, 1);
  }

  _removeImpactBurst(i) {
    const b = this.impactBursts[i];
    this.group.remove(b.mesh);
    b.mat.dispose();
    this.impactBursts.splice(i, 1);
  }

  _removeTargetLock(i) {
    const lock = this.targetLocks[i];
    this.group.remove(lock.mesh);
    lock.mat.dispose();
    this.targetLocks.splice(i, 1);
  }

  _removeStatusRead(i) {
    const read = this.statusReads[i];
    this.group.remove(read.badge);
    this.group.remove(read.pulse);
    read.mat.dispose();
    read.pulseMat.dispose();
    this.statusReads.splice(i, 1);
  }

  _removeRay(i) {
    const r = this.rays[i];
    this.group.remove(r.mesh);
    this.group.remove(r.spark);
    r.mat.dispose();
    r.sparkMat?.dispose();
    r.geom?.dispose();
    this.rays.splice(i, 1);
  }

  _removeCommandThread(i) {
    const th = this.commandThreads[i];
    this.group.remove(th.mesh);
    th.mat.dispose();
    th.geom?.dispose();
    this.commandThreads.splice(i, 1);
  }

  _removeVisionSweep(i) {
    const sweep = this.visionSweeps[i];
    this.group.remove(sweep.mesh);
    sweep.mat.dispose();
    sweep.geom?.dispose();
    this.visionSweeps.splice(i, 1);
  }

  dispose() {
    while (this.waves.length) this._removeShockwave(this.waves.length - 1);
    while (this.rings.length) this._removeRing(this.rings.length - 1);
    while (this.sigils.length) this._removeSigil(this.sigils.length - 1);
    while (this.standards.length) this._removeStandard(this.standards.length - 1);
    while (this.impacts.length) this._removeImpact(this.impacts.length - 1);
    while (this.impactHalos.length) this._removeImpactHalo(this.impactHalos.length - 1);
    while (this.impactPillars.length) this._removeImpactPillar(this.impactPillars.length - 1);
    while (this.impactBursts.length) this._removeImpactBurst(this.impactBursts.length - 1);
    while (this.targetLocks.length) this._removeTargetLock(this.targetLocks.length - 1);
    while (this.statusReads.length) this._removeStatusRead(this.statusReads.length - 1);
    while (this.rays.length) this._removeRay(this.rays.length - 1);
    while (this.commandThreads.length) this._removeCommandThread(this.commandThreads.length - 1);
    while (this.visionSweeps.length) this._removeVisionSweep(this.visionSweeps.length - 1);
    for (const tex of this.textures.values()) tex.dispose();
    for (const tex of this.standardTextures.values()) tex.dispose();
    for (const tex of this.impactTextures.values()) tex.dispose();
    for (const tex of this.pillarTextures.values()) tex.dispose();
    this.ringGeo.dispose();
    this.haloGeo.dispose();
    this.waveGeo.dispose();
    this.sigilGeo.dispose();
    this.standardGeo.dispose();
    this.impactGeo.dispose();
    this.impactHaloGeo.dispose();
    this.impactPillarGeo.dispose();
    this.impactBurstGeo.dispose();
    this.targetLockGeo.dispose();
    this.statusBadgeGeo.dispose();
    this.statusPulseGeo.dispose();
    this.sparkGeo.dispose();
    this.scene.remove(this.group);
  }
}
