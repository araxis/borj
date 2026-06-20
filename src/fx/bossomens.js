import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { pointAt } from '../world/road.js';

const GOLD = new THREE.Color(0xf4cd6e);
const BLOOD = new THREE.Color(0xb83a2a);
const SHADOW = new THREE.Color(0x35243f);
const SACRED = new THREE.Color(0x7fe7ff);
const CHAIN = new THREE.Color(0xb8bdc8);
const EMBER = new THREE.Color(0xff7a24);
const VENOM = new THREE.Color(0x9de35b);
const IRON = new THREE.Color(0x8f9aa7);

const SIGIL_TEX = new Map();

function ringMaterial(color, opacity = 0.8) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function omenTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 192;
  const g = c.getContext('2d');
  const gold = kind === 'fail' ? 'rgba(194,59,42,' : 'rgba(244,205,110,';
  const blue = kind === 'fail' ? 'rgba(80,42,92,' : 'rgba(90,225,235,';
  const grad = g.createLinearGradient(0, 0, 0, 192);
  grad.addColorStop(0, `${gold}0)`);
  grad.addColorStop(0.2, `${gold}0.78)`);
  grad.addColorStop(0.55, `${blue}0.52)`);
  grad.addColorStop(1, `${gold}0)`);
  g.fillStyle = grad;
  g.fillRect(43, 0, 10, 192);
  g.beginPath();
  g.moveTo(48, 28); g.lineTo(72, 56); g.lineTo(48, 84); g.lineTo(24, 56); g.closePath();
  g.fillStyle = `${gold}0.52)`;
  g.fill();
  g.strokeStyle = `${blue}0.78)`;
  g.lineWidth = 3;
  g.stroke();
  g.beginPath();
  g.arc(48, 112, 21, 0, Math.PI * 2);
  g.strokeStyle = `${gold}0.42)`;
  g.lineWidth = 4;
  g.stroke();
  return new THREE.CanvasTexture(c);
}

function weakPointTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const glow = g.createRadialGradient(64, 64, 5, 64, 64, 60);
  glow.addColorStop(0, 'rgba(244,205,110,0.42)');
  glow.addColorStop(0.56, 'rgba(184,58,42,0.18)');
  glow.addColorStop(1, 'rgba(244,205,110,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);

  g.strokeStyle = 'rgba(255,237,174,0.95)';
  g.fillStyle = 'rgba(244,205,110,0.12)';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(64, 18);
  g.lineTo(106, 64);
  g.lineTo(64, 110);
  g.lineTo(22, 64);
  g.closePath();
  g.fill();
  g.stroke();

  g.strokeStyle = 'rgba(184,58,42,0.92)';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(43, 42);
  g.lineTo(82, 42);
  g.lineTo(72, 62);
  g.lineTo(91, 62);
  g.lineTo(51, 92);
  g.lineTo(61, 68);
  g.lineTo(39, 68);
  g.stroke();

  g.strokeStyle = 'rgba(255,237,174,0.82)';
  g.lineWidth = 4;
  for (const r of [18, 31]) {
    g.beginPath();
    g.arc(64, 64, r, 0, Math.PI * 2);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function successColor(type) {
  if (type === 'antiTyrantChains' || type === 'silenceSiege') return CHAIN;
  if (type === 'clearFog' || type === 'unmaskCounsel' || type === 'unmaskTrail' || type === 'coolWrath') return SACRED;
  if (type === 'crackIron') return EMBER;
  if (type === 'cutBrood') return VENOM;
  return GOLD;
}

function failureColor(type) {
  if (type === 'whiteFog') return SHADOW;
  if (type === 'dragonBurrow' || type === 'siegeHorns' || type === 'ironHide') return EMBER;
  if (type === 'serpentFeed' || type === 'wormBrood') return VENOM;
  return BLOOD;
}

function bossIdentity(enemy) {
  const id = enemy?.def?.id;
  if (id === 'zahhak') return { kind: 'chains', main: CHAIN, accent: VENOM, shadow: BLOOD };
  if (id === 'div-e-sepid') return { kind: 'fog', main: SACRED, accent: SHADOW, shadow: SHADOW };
  if (id === 'azhdaha') return { kind: 'flame', main: EMBER, accent: GOLD, shadow: BLOOD };
  if (id === 'haftvad-worm') return { kind: 'worm', main: VENOM, accent: GOLD, shadow: SHADOW };
  if (id === 'afrasiab') return { kind: 'diadem', main: GOLD, accent: SACRED, shadow: BLOOD };
  if (id === 'arjasp') return { kind: 'horn', main: GOLD, accent: EMBER, shadow: BLOOD };
  if (id === 'kamus') return { kind: 'cavalry', main: GOLD, accent: CHAIN, shadow: BLOOD };
  if (id === 'puladwand') return { kind: 'iron', main: IRON, accent: EMBER, shadow: CHAIN };
  const ab = enemy?.def?.abilities || [];
  if (ab.includes('siegeHorns')) return { kind: 'horn', main: GOLD, accent: EMBER, shadow: BLOOD };
  if (ab.includes('ironSkin')) return { kind: 'iron', main: IRON, accent: GOLD, shadow: CHAIN };
  if (ab.includes('lassoBreak') || ab.includes('heavyCavalry')) return { kind: 'cavalry', main: GOLD, accent: CHAIN, shadow: BLOOD };
  if (ab.includes('serpentFeed')) return { kind: 'chains', main: CHAIN, accent: VENOM, shadow: BLOOD };
  if (ab.includes('spawnLarvae') || ab.includes('devourGrow')) return { kind: 'worm', main: VENOM, accent: GOLD, shadow: SHADOW };
  if (enemy?.def?.class === 'div') return { kind: 'fog', main: SACRED, accent: SHADOW, shadow: SHADOW };
  if (enemy?.def?.class === 'beast') return { kind: 'flame', main: EMBER, accent: GOLD, shadow: BLOOD };
  return { kind: 'banner', main: GOLD, accent: SACRED, shadow: BLOOD };
}

function sigilTexture(kind) {
  if (SIGIL_TEX.has(kind)) return SIGIL_TEX.get(kind);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  const glow = g.createRadialGradient(64, 64, 4, 64, 64, 60);
  glow.addColorStop(0, 'rgba(255,238,180,0.34)');
  glow.addColorStop(0.62, 'rgba(244,205,110,0.16)');
  glow.addColorStop(1, 'rgba(244,205,110,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,238,180,0.94)';
  g.fillStyle = 'rgba(255,238,180,0.14)';
  g.lineCap = 'round';
  g.lineJoin = 'round';

  if (kind === 'chains') {
    g.lineWidth = 8;
    for (const x of [48, 80]) {
      g.beginPath();
      g.moveTo(x, 20);
      g.bezierCurveTo(x - 24, 42, x + 24, 64, x, 88);
      g.bezierCurveTo(x - 16, 102, x + 10, 110, x, 120);
      g.stroke();
    }
    g.lineWidth = 5;
    for (const y of [39, 66, 92]) {
      g.beginPath(); g.moveTo(38, y); g.lineTo(90, y + 6); g.stroke();
    }
  } else if (kind === 'fog') {
    g.lineWidth = 7;
    for (const y of [38, 58, 80]) {
      g.beginPath();
      g.moveTo(22, y);
      g.bezierCurveTo(44, y - 15, 68, y + 15, 106, y - 5);
      g.stroke();
    }
    g.beginPath(); g.ellipse(64, 64, 23, 14, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(64, 64, 6, 0, Math.PI * 2); g.fill();
  } else if (kind === 'flame') {
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(64, 114);
    g.bezierCurveTo(28, 82, 54, 52, 60, 18);
    g.bezierCurveTo(92, 44, 104, 74, 64, 114);
    g.closePath(); g.fill(); g.stroke();
    g.beginPath();
    g.moveTo(66, 104);
    g.bezierCurveTo(50, 78, 72, 66, 72, 42);
    g.stroke();
  } else if (kind === 'worm') {
    g.lineWidth = 8;
    g.beginPath();
    for (let a = 0; a < Math.PI * 5.5; a += 0.18) {
      const r = 6 + a * 3.0;
      const x = 64 + Math.cos(a) * r;
      const y = 64 + Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.beginPath(); g.arc(91, 88, 8, 0, Math.PI * 2); g.fill();
  } else if (kind === 'diadem') {
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(24, 78); g.lineTo(42, 42); g.lineTo(64, 78); g.lineTo(86, 42); g.lineTo(104, 78);
    g.stroke();
    g.beginPath(); g.moveTo(28, 88); g.quadraticCurveTo(64, 102, 100, 88); g.stroke();
    g.beginPath(); g.arc(64, 74, 9, 0, Math.PI * 2); g.fill();
  } else if (kind === 'horn') {
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(30, 82);
    g.bezierCurveTo(58, 48, 88, 34, 108, 28);
    g.bezierCurveTo(94, 60, 68, 84, 35, 96);
    g.stroke();
    g.beginPath(); g.arc(34, 90, 12, -0.8, Math.PI * 1.2); g.stroke();
  } else if (kind === 'cavalry') {
    g.lineWidth = 7;
    g.beginPath(); g.arc(54, 68, 27, 0.25, Math.PI * 1.85); g.stroke();
    g.beginPath(); g.moveTo(74, 42); g.lineTo(96, 62); g.lineTo(72, 86); g.stroke();
    g.beginPath(); g.moveTo(38, 98); g.lineTo(88, 98); g.stroke();
  } else if (kind === 'iron') {
    g.lineWidth = 6;
    for (const [x, y] of [[64, 26], [39, 62], [89, 62], [64, 98]]) {
      g.beginPath();
      g.moveTo(x, y - 18); g.lineTo(x + 18, y); g.lineTo(x, y + 18); g.lineTo(x - 18, y); g.closePath();
      g.fill(); g.stroke();
    }
  } else {
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(44, 20); g.lineTo(44, 112); g.stroke();
    g.beginPath(); g.moveTo(48, 24); g.lineTo(96, 42); g.lineTo(48, 60); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(48, 68); g.lineTo(88, 82); g.lineTo(48, 96); g.stroke();
  }

  g.strokeStyle = 'rgba(255,238,180,0.5)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  SIGIL_TEX.set(kind, tex);
  return tex;
}

export class BossOmenField {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.group = new THREE.Group();
    this.group.name = 'boss-omen-field';
    this.group.userData.visualLayer = 'boss-omen';
    this.group.userData.visualQaIgnore = true;
    this.group.renderOrder = 9;
    this.ringGeo = new THREE.RingGeometry(0.9, 1.0, 128);
    this.haloGeo = new THREE.RingGeometry(0.72, 1.0, 96);
    this.standardGeo = new THREE.PlaneGeometry(3.2, 6.8);
    this.weakSealGeo = new THREE.PlaneGeometry(2.2, 2.2);
    this.sigilGeo = new THREE.PlaneGeometry(2.7, 2.7);
    this.weakRingGeo = new THREE.RingGeometry(0.82, 1.0, 128);
    this.roadMarkGeo = new THREE.RingGeometry(0.55, 1.0, 96);
    this.omenTex = omenTexture('omen');
    this.failTex = omenTexture('fail');
    this.weakTex = weakPointTexture();
    this.active = null;
    this.pulses = [];
    this.standards = [];
    scene.add(this.group);
  }

  start(enemy, challenge = null) {
    this.clear();
    if (!enemy?.alive || settings.get('reducedMotion')) return;
    const identity = bossIdentity(enemy);
    const ringMat = ringMaterial(identity.main, 0.72);
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.frustumCulled = false;
    const haloMat = ringMaterial(identity.shadow, 0.42);
    const halo = new THREE.Mesh(this.haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.frustumCulled = false;
    const stdMat = new THREE.MeshBasicMaterial({
      map: this.omenTex,
      color: identity.main,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const standard = new THREE.Mesh(this.standardGeo, stdMat);
    standard.frustumCulled = false;
    const sigilMat = new THREE.MeshBasicMaterial({
      map: sigilTexture(identity.kind),
      color: identity.main,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const sigil = new THREE.Mesh(this.sigilGeo, sigilMat);
    sigil.frustumCulled = false;
    sigil.renderOrder = 54;
    const weakMat = new THREE.MeshBasicMaterial({
      map: this.weakTex,
      color: identity.accent,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const weakSeal = new THREE.Mesh(this.weakSealGeo, weakMat);
    weakSeal.frustumCulled = false;
    weakSeal.renderOrder = 53;
    const weakRingMat = ringMaterial(BLOOD, 0.62);
    weakRingMat.depthTest = false;
    const weakRing = new THREE.Mesh(this.weakRingGeo, weakRingMat);
    weakRing.rotation.x = -Math.PI / 2;
    weakRing.frustumCulled = false;
    weakRing.renderOrder = 52;
    const breakRingMat = ringMaterial(identity.main, 0.0);
    breakRingMat.depthTest = false;
    const breakRing = new THREE.Mesh(this.weakRingGeo, breakRingMat);
    breakRing.rotation.x = -Math.PI / 2;
    breakRing.frustumCulled = false;
    breakRing.renderOrder = 52;
    const roadMarks = this._makeRoadMarks(enemy, challenge);
    this.group.add(ring, halo, standard, sigil, weakSeal, weakRing, breakRing, ...roadMarks.map((m) => m.mesh));
    this.active = {
      enemy, challenge, ring, ringMat, halo, haloMat, standard, stdMat,
      sigil, sigilMat, weakSeal, weakMat, weakRing, weakRingMat, breakRing, breakRingMat,
      roadMarks, identity,
      t: 0, weakBucket: -1,
    };
  }

  _makeRoadMarks(enemy, challenge) {
    const path = this.map.paths?.[enemy.pathIndex] || enemy.path;
    if (!path?.samples?.length || !Number.isFinite(path.length) || path.length <= 0) return [];
    const count = challenge ? 8 : 5;
    const marks = [];
    for (let i = 0; i < count; i++) {
      const mat = ringMaterial(i % 2 ? GOLD : BLOOD, 0.26);
      mat.depthTest = false;
      const mesh = new THREE.Mesh(this.roadMarkGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 31 + i;
      mesh.frustumCulled = false;
      marks.push({
        mesh,
        mat,
        offset: 7 + i * 8.5,
        side: i % 2 ? 1 : -1,
        phase: i * 0.74,
        base: 1.35 + i * 0.08,
      });
    }
    return marks;
  }

  arrival(enemy) {
    if (!enemy?.alive || settings.get('reducedMotion')) return;
    const p = enemy.group.position;
    const identity = bossIdentity(enemy);
    this._addPulse(p, identity.shadow, { max: 26, life: 1.05, width: 0.82, delay: 0 });
    this._addPulse(p, identity.main, { max: 16, life: 0.95, width: 0.58, delay: 0.08 });
    this._addPulse(p, identity.accent, { max: 34, life: 1.45, width: 0.5, delay: 0.14 });
    this._addStandard(p, sigilTexture(identity.kind), identity.main, { life: 1.55, scale: 1.22, delay: 0 });
    this._addStandard(p, this.failTex, identity.shadow, { life: 1.35, scale: 0.9, delay: 0.1 });
    this._addRoadProcession(enemy);
  }

  elite(enemy) {
    if (!enemy?.alive || enemy.boss || settings.get('reducedMotion')) return;
    const p = enemy.group.position;
    const cls = enemy.def?.class;
    const main = cls === 'div' ? SHADOW : cls === 'beast' ? EMBER : cls === 'serpent' ? VENOM : GOLD;
    const accent = cls === 'human' ? SACRED : GOLD;
    this._addPulse(p, main, { max: 11, life: 0.85, width: 0.56, delay: 0 });
    this._addPulse(p, accent, { max: 7, life: 0.75, width: 0.42, delay: 0.06 });
    this._addStandard(p, this.omenTex, main, { life: 0.95, scale: 0.58, delay: 0.02 });
    this._addEliteRoadMark(enemy, main, accent);
  }

  _addEliteRoadMark(enemy, main, accent) {
    const path = this.map.paths?.[enemy.pathIndex] || enemy.path;
    if (!path?.samples?.length || !Number.isFinite(path.length) || path.length <= 0) return;
    const f = Math.max(0.04, Math.min(0.34, ((enemy.dist || 0) / path.length) + 0.08));
    const idx = Math.min(path.samples.length - 1, Math.round(f * (path.samples.length - 1)));
    const sample = path.samples[idx];
    const p = sample.pos.clone();
    p.y = this.map.heightAt(p.x, p.z);
    this._addPulse(p, accent, { max: 8, life: 0.82, width: 0.45, delay: 0.12 });
    this._addStandard(p, this.omenTex, main, { life: 0.92, scale: 0.44, delay: 0.14 });
  }

  _addRoadProcession(enemy) {
    const path = this.map.paths?.[enemy.pathIndex] || enemy.path;
    if (!path?.samples?.length || !Number.isFinite(path.length) || path.length <= 0) return;
    const identity = bossIdentity(enemy);
    const count = Math.min(7, Math.max(4, Math.floor(path.length / 24)));
    const start = Math.max(0.06, Math.min(0.24, ((enemy.dist || 0) / path.length) + 0.05));
    const span = 0.7;
    for (let i = 0; i < count; i++) {
      const f = Math.min(0.9, start + span * (i / Math.max(1, count - 1)));
      const idx = Math.min(path.samples.length - 1, Math.round(f * (path.samples.length - 1)));
      const sample = path.samples[idx];
      const side = new THREE.Vector3(-sample.tangent.z, 0, sample.tangent.x).normalize();
      const dir = i % 2 === 0 ? -1 : 1;
      const p = sample.pos.clone().addScaledVector(side, 3.2 * dir);
      p.y = this.map.heightAt(p.x, p.z);
      const delay = 0.05 + i * 0.07;
      this._addPulse(p, i % 2 === 0 ? identity.shadow : identity.main, { max: 9 + i * 1.1, life: 1.05, width: 0.48, delay });
      this._addStandard(p, i % 2 === 0 ? this.failTex : sigilTexture(identity.kind), i % 2 === 0 ? identity.shadow : identity.main, {
        life: 1.25 + i * 0.03,
        scale: 0.72,
        delay: delay + 0.02,
      });
    }
  }

  finale(kind, anchor) {
    if (settings.get('reducedMotion')) return;
    const p = anchor?.isVector3 ? anchor : anchor?.group?.position || this.map.exitPos;
    const won = kind === 'victory';
    const main = won ? GOLD : BLOOD;
    const echo = won ? SACRED : SHADOW;
    const tex = won ? this.omenTex : this.failTex;
    this._addPulse(p, main, { max: won ? 36 : 30, life: 1.45, width: 0.8, delay: 0 });
    this._addPulse(p, echo, { max: won ? 52 : 44, life: 1.9, width: 0.55, delay: 0.08 });
    this._addStandard(p, tex, main, { life: 1.7, scale: won ? 1.42 : 1.24, delay: 0.02 });
  }

  success(enemy, type) {
    this.clear();
    if (!enemy || settings.get('reducedMotion')) return;
    const p = enemy.group.position;
    const color = successColor(type);
    this._addPulse(p, color, { max: 17, life: 1.15, width: 0.7, delay: 0 });
    this._addPulse(p, GOLD, { max: 25, life: 1.35, width: 0.45, delay: 0.08 });
    this._addStandard(p, this.omenTex, color, { life: 1.3, scale: 1.0, delay: 0.03 });
  }

  failure(enemy, type) {
    this.clear();
    if (!enemy || settings.get('reducedMotion')) return;
    const p = enemy.group.position;
    const color = failureColor(type);
    this._addPulse(p, color, { max: 19, life: 1.0, width: 0.75, delay: 0 });
    this._addPulse(p, SHADOW, { max: 28, life: 1.45, width: 0.55, delay: 0.05 });
    this._addStandard(p, this.failTex, color, { life: 1.25, scale: 1.05, delay: 0 });
  }

  phase(enemy, bucket = 0, hpFrac = 1) {
    if (!enemy?.alive || settings.get('reducedMotion')) return;
    const p = enemy.group.position;
    const identity = bossIdentity(enemy);
    const danger = bucket <= 0 ? identity.shadow : bucket === 1 ? identity.accent : identity.main;
    const scale = bucket <= 0 ? 1.45 : bucket === 1 ? 1.22 : 1.0;
    this._addPulse(p, danger, { max: 18 + scale * 10, life: 1.05 + scale * 0.18, width: 0.82, delay: 0 });
    this._addPulse(p, identity.main, { max: 24 + (1 - hpFrac) * 16, life: 1.35, width: 0.48, delay: 0.06 });
    this._addStandard(p, sigilTexture(identity.kind), danger, { life: 1.2 + scale * 0.12, scale: 0.86 + scale * 0.2, delay: 0.02 });
  }

  clear() {
    if (!this.active) return;
    const a = this.active;
    this.group.remove(a.ring, a.halo, a.standard, a.sigil, a.weakSeal, a.weakRing, a.breakRing);
    a.ringMat.dispose();
    a.haloMat.dispose();
    a.stdMat.dispose();
    a.sigilMat.dispose();
    a.weakMat.dispose();
    a.weakRingMat.dispose();
    a.breakRingMat.dispose();
    for (const mark of a.roadMarks || []) {
      this.group.remove(mark.mesh);
      mark.mat.dispose();
    }
    this.active = null;
  }

  _updateRoadMarks(a, progress, urgent, time) {
    const marks = a.roadMarks || [];
    if (!marks.length) return;
    const enemy = a.enemy;
    const identity = a.identity || bossIdentity(enemy);
    const path = this.map.paths?.[enemy.pathIndex] || enemy.path;
    if (!path?.samples?.length || !Number.isFinite(path.length) || path.length <= 0) return;
    const color = progress > 0.66 ? identity.main : progress > 0.33 ? identity.accent : identity.shadow;
    const shadowColor = urgent > 0.58 ? identity.shadow : BLOOD;
    for (let i = 0; i < marks.length; i++) {
      const mark = marks[i];
      const wave = 0.5 + Math.sin(time * (3.8 + urgent * 1.8) - mark.phase) * 0.5;
      const d = Math.min(path.length - 1, Math.max(0, (enemy.dist || 0) + mark.offset + wave * 2.5));
      const q = pointAt(path, d);
      const side = new THREE.Vector3(-q.tz, 0, q.tx);
      if (side.lengthSq() > 0.01) side.normalize();
      const lateral = (1.15 + urgent * 0.65 + progress * 0.35) * mark.side;
      const y = this.map.heightAt(q.x, q.z) + 0.18 + i * 0.006;
      mark.mesh.position.set(q.x + side.x * lateral, y, q.z + side.z * lateral);
      mark.mesh.rotation.z = Math.atan2(q.tx, q.tz) + time * (0.45 + urgent * 0.8) * mark.side;
      mark.mesh.scale.setScalar(mark.base + progress * 0.9 + urgent * 0.6 + wave * 0.22);
      mark.mat.opacity = (0.1 + progress * 0.26 + urgent * 0.24) * (0.55 + wave * 0.45);
      mark.mat.color.copy(i % 2 ? color : shadowColor);
    }
  }

  _addPulse(p, color, { max, life, width, delay }) {
    const mat = ringMaterial(color, 0.82);
    const mesh = new THREE.Mesh(width > 0.6 ? this.ringGeo : this.haloGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, this.map.heightAt(p.x, p.z) + 0.24, p.z);
    mesh.scale.setScalar(0.4);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.pulses.push({ mesh, mat, max, life, t: -delay, width });
  }

  _addStandard(p, tex, color, { life, scale, delay }) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.standardGeo, mat);
    const y = Number.isFinite(p.y) ? p.y : this.map.heightAt(p.x, p.z);
    mesh.position.set(p.x, y + 5.6, p.z);
    mesh.scale.setScalar(scale);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.standards.push({ mesh, mat, life, t: -delay, phase: Math.random() * Math.PI * 2 });
  }

  update(dt, camera, time = 0) {
    const cam = camera?.position;
    if (this.active?.enemy?.alive) {
      const a = this.active;
      a.t += Math.max(0, dt);
      const p = a.enemy.group.position;
      const head = a.enemy.model?.headH || 2.4;
      const y = this.map.heightAt(p.x, p.z) + 0.22;
      const ch = a.challenge;
      const needed = ch ? Math.max(1, (ch.startHp || a.enemy.maxHp) - (ch.targetHp || a.enemy.maxHp * 0.75)) : a.enemy.maxHp * 0.25;
      const progress = ch ? Math.max(0, Math.min(1, ((ch.startHp || a.enemy.maxHp) - a.enemy.hp) / needed)) : Math.max(0, Math.min(1, 1 - a.enemy.hp / a.enemy.maxHp));
      const timePressure = ch ? Math.max(0, Math.min(1, (ch.t || 0) / Math.max(1, ch.dur || 1))) : 1;
      const pulse = 0.5 + Math.sin(a.t * 5.0) * 0.5;
      const urgent = 1 - timePressure;
      a.ring.position.set(p.x, y, p.z);
      a.halo.position.set(p.x, y + 0.05, p.z);
      a.ring.scale.setScalar(4.8 + pulse * 0.7 + progress * 0.85);
      a.halo.scale.setScalar(6.2 + pulse * 1.15 + urgent * 1.1);
      a.ringMat.opacity = 0.42 + pulse * 0.2 + progress * 0.18;
      a.haloMat.opacity = 0.16 + pulse * 0.14 + urgent * 0.22;
      a.standard.position.set(p.x, p.y + head + 3.7 + Math.sin(a.t * 3.2) * 0.25, p.z);
      a.stdMat.opacity = 0.38 + pulse * 0.16 + urgent * 0.16;
      if (cam) a.standard.lookAt(cam.x, a.standard.position.y, cam.z);
      a.stdMat.color.copy(a.identity.main).lerp(a.identity.shadow, urgent * 0.38);

      a.sigil.position.set(
        p.x + Math.sin(a.t * 1.4) * (0.22 + urgent * 0.16),
        p.y + head + 2.05 + Math.sin(a.t * 4.2) * 0.14,
        p.z + Math.cos(a.t * 1.4) * (0.22 + urgent * 0.16),
      );
      if (cam) a.sigil.lookAt(cam.x, a.sigil.position.y, cam.z);
      a.sigil.scale.setScalar(0.86 + progress * 0.26 + urgent * 0.34 + pulse * 0.08);
      a.sigilMat.opacity = 0.38 + progress * 0.24 + urgent * 0.28 + pulse * 0.08;
      a.sigilMat.color.copy(a.identity.main).lerp(a.identity.accent, progress * 0.55).lerp(a.identity.shadow, urgent * 0.34);

      const sealY = p.y + head + 1.15 + Math.sin(a.t * 4.4) * 0.12;
      a.weakSeal.position.set(p.x, sealY, p.z);
      if (cam) a.weakSeal.lookAt(cam.x, a.weakSeal.position.y, cam.z);
      a.weakSeal.scale.setScalar(0.72 + progress * 0.42 + pulse * 0.1);
      a.weakMat.opacity = 0.54 + progress * 0.34 + pulse * 0.12;
      a.weakMat.color.copy(progress > 0.66 ? a.identity.main : progress > 0.33 ? a.identity.accent : a.identity.shadow);

      a.weakRing.position.set(p.x, y + 0.42, p.z);
      a.weakRing.rotation.z += dt * (1.1 + urgent * 1.6);
      a.weakRing.scale.setScalar(2.4 + progress * 1.4 + pulse * 0.22);
      a.weakRingMat.opacity = 0.24 + urgent * 0.24 + pulse * 0.16;
      a.weakRingMat.color.copy(progress > 0.5 ? a.identity.main : a.identity.shadow);

      a.breakRing.position.set(p.x, y + 0.48, p.z);
      a.breakRing.rotation.z -= dt * (1.4 + progress * 1.5);
      a.breakRing.scale.setScalar(1.35 + progress * 3.4);
      a.breakRingMat.opacity = progress * (0.18 + pulse * 0.28);
      this._updateRoadMarks(a, progress, urgent, time);

      const bucket = progress >= 0.66 ? 2 : progress >= 0.33 ? 1 : 0;
      if (bucket > a.weakBucket) {
        a.weakBucket = bucket;
        const color = bucket >= 2 ? a.identity.main : a.identity.accent;
        this._addPulse(p, color, { max: 10 + bucket * 4, life: 0.85, width: 0.55, delay: 0 });
        this._addStandard(p, sigilTexture(a.identity.kind), color, { life: 0.9, scale: 0.68 + bucket * 0.12, delay: 0.02 });
      }
    } else if (this.active) {
      this.clear();
    }

    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.t += dt;
      if (p.t < 0) continue;
      const k = Math.min(1, p.t / p.life);
      if (k >= 1) { this._removePulse(i); continue; }
      const eased = 1 - Math.pow(1 - k, 2.2);
      p.mesh.scale.setScalar(0.7 + eased * p.max);
      p.mat.opacity = (1 - k) * (0.68 + p.width * 0.12);
    }

    for (let i = this.standards.length - 1; i >= 0; i--) {
      const s = this.standards[i];
      s.t += dt;
      if (s.t < 0) continue;
      const k = Math.min(1, s.t / s.life);
      if (k >= 1) { this._removeStandard(i); continue; }
      if (cam) s.mesh.lookAt(cam.x, s.mesh.position.y, cam.z);
      s.mesh.position.y += Math.sin(time * 4.0 + s.phase) * dt * 0.18;
      s.mat.opacity = Math.sin(Math.PI * k) * 0.78;
    }
  }

  _removePulse(i) {
    const p = this.pulses[i];
    this.group.remove(p.mesh);
    p.mat.dispose();
    this.pulses.splice(i, 1);
  }

  _removeStandard(i) {
    const s = this.standards[i];
    this.group.remove(s.mesh);
    s.mat.dispose();
    this.standards.splice(i, 1);
  }

  dispose() {
    this.clear();
    while (this.pulses.length) this._removePulse(this.pulses.length - 1);
    while (this.standards.length) this._removeStandard(this.standards.length - 1);
    this.ringGeo.dispose();
    this.haloGeo.dispose();
    this.standardGeo.dispose();
    this.weakSealGeo.dispose();
    this.sigilGeo.dispose();
    this.weakRingGeo.dispose();
    this.roadMarkGeo.dispose();
    this.omenTex.dispose();
    this.failTex.dispose();
    this.weakTex.dispose();
    this.scene.remove(this.group);
  }
}
