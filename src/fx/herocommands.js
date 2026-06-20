import * as THREE from 'three';
import { settings } from '../core/settings.js';

const COLORS = {
  heal: new THREE.Color(0x7fe7c1),
  fire: new THREE.Color(0xff7a24),
  vision: new THREE.Color(0x7fe7ff),
  bind: new THREE.Color(0xb8bdc8),
  rally: new THREE.Color(0xf4cd6e),
  default: new THREE.Color(0xf4cd6e),
};

const FIELD_RAYS = {
  heal: 5,
  fire: 7,
  vision: 8,
  bind: 6,
  rally: 6,
  default: 6,
};

const INK = {
  heal: '127,231,193',
  fire: '255,122,36',
  vision: '127,231,255',
  bind: '210,216,226',
  rally: '244,205,110',
  default: '244,205,110',
};

function kindColor(kind) {
  return COLORS[kind] || COLORS.default;
}

function inkFor(kind) {
  return INK[kind] || INK.default;
}

function circleLineGeometry(segments = 144) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function sigilShape(key, kind, g, ink) {
  g.strokeStyle = `${ink}0.86)`;
  g.fillStyle = `${ink}0.18)`;
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (kind === 'heal' || key.includes('simurgh') || key.includes('feather')) {
    g.beginPath();
    g.moveTo(74, 38);
    g.bezierCurveTo(24, 88, 26, 156, 70, 194);
    g.bezierCurveTo(76, 144, 104, 100, 74, 38);
    g.stroke();
    g.beginPath();
    g.moveTo(69, 74);
    g.lineTo(48, 174);
    g.moveTo(62, 104);
    g.lineTo(38, 116);
    g.moveTo(58, 132);
    g.lineTo(34, 146);
    g.stroke();
  } else if (kind === 'fire') {
    g.beginPath();
    g.moveTo(64, 42);
    g.bezierCurveTo(104, 92, 90, 146, 64, 190);
    g.bezierCurveTo(24, 136, 30, 90, 64, 42);
    g.stroke();
    g.beginPath();
    g.moveTo(65, 86);
    g.bezierCurveTo(82, 116, 76, 146, 62, 166);
    g.bezierCurveTo(46, 138, 48, 112, 65, 86);
    g.stroke();
  } else if (kind === 'vision' || key.includes('Cup') || key.includes('Arrow') || key.includes('Search')) {
    g.beginPath();
    g.moveTo(25, 130);
    g.lineTo(102, 82);
    g.lineTo(84, 112);
    g.moveTo(102, 82);
    g.lineTo(68, 78);
    g.stroke();
    g.beginPath();
    g.arc(54, 150, 24, 0, Math.PI * 2);
    g.moveTo(40, 150);
    g.quadraticCurveTo(54, 138, 68, 150);
    g.quadraticCurveTo(54, 162, 40, 150);
    g.stroke();
  } else if (kind === 'bind' || key.includes('Bind') || key.includes('Judgment') || key.includes('Challenge')) {
    g.beginPath();
    g.moveTo(38, 56);
    g.lineTo(84, 102);
    g.lineTo(58, 128);
    g.lineTo(92, 168);
    g.stroke();
    for (const y of [83, 122, 161]) {
      g.beginPath();
      g.ellipse(47, y, 18, 10, -0.6, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(77, y + 10, 18, 10, 0.6, 0, Math.PI * 2);
      g.stroke();
    }
  } else {
    g.beginPath();
    g.moveTo(42, 48);
    g.lineTo(90, 66);
    g.lineTo(84, 132);
    g.lineTo(42, 118);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(42, 48);
    g.lineTo(42, 190);
    g.stroke();
  }
}

function makeSigilTexture(key, kind) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  const color = kind === 'fire' ? 'rgba(255,122,36,' : kind === 'heal' ? 'rgba(127,231,193,' : kind === 'vision' ? 'rgba(127,231,255,' : kind === 'bind' ? 'rgba(210,216,226,' : 'rgba(244,205,110,';
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `${color}0)`);
  grad.addColorStop(0.18, `${color}0.68)`);
  grad.addColorStop(0.55, `${color}0.32)`);
  grad.addColorStop(1, `${color}0)`);
  g.fillStyle = grad;
  g.fillRect(58, 0, 12, 256);
  sigilShape(key, kind, g, color);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStandardTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 384;
  const g = c.getContext('2d');
  const ink = inkFor(kind);
  const accent = kind === 'fire' ? '255,198,112' : kind === 'vision' ? '190,244,255' : kind === 'bind' ? '235,238,246' : kind === 'heal' ? '192,255,226' : '255,239,180';
  const grad = g.createLinearGradient(0, 0, 0, 384);
  grad.addColorStop(0, `rgba(${ink},0)`);
  grad.addColorStop(0.18, `rgba(${ink},0.66)`);
  grad.addColorStop(0.68, `rgba(${ink},0.32)`);
  grad.addColorStop(1, `rgba(${ink},0)`);
  g.fillStyle = grad;
  g.fillRect(59, 0, 10, 384);

  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = `rgba(${accent},0.84)`;
  g.fillStyle = `rgba(${ink},0.18)`;
  g.beginPath();
  g.moveTo(30, 48);
  g.lineTo(98, 64);
  g.lineTo(86, 210);
  g.lineTo(34, 190);
  g.closePath();
  g.fill();
  g.stroke();

  g.strokeStyle = `rgba(${accent},0.72)`;
  g.beginPath();
  g.moveTo(38, 88);
  g.lineTo(90, 100);
  g.moveTo(38, 136);
  g.lineTo(88, 150);
  g.moveTo(34, 192);
  g.lineTo(28, 236);
  g.moveTo(60, 202);
  g.lineTo(56, 258);
  g.moveTo(84, 210);
  g.lineTo(92, 252);
  g.stroke();

  g.fillStyle = `rgba(${accent},0.22)`;
  g.beginPath();
  g.moveTo(64, 102);
  g.lineTo(82, 132);
  g.lineTo(62, 164);
  g.lineTo(44, 130);
  g.closePath();
  g.fill();
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeImpactTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 160;
  const g = c.getContext('2d');
  const ink = inkFor(kind);
  const accent = kind === 'fire'
    ? '255,205,128'
    : kind === 'vision'
      ? '197,246,255'
      : kind === 'bind'
        ? '237,240,248'
        : kind === 'heal'
          ? '196,255,227'
          : '255,236,174';
  const glow = g.createRadialGradient(80, 80, 6, 80, 80, 74);
  glow.addColorStop(0, `rgba(${ink},0.35)`);
  glow.addColorStop(0.58, `rgba(${ink},0.14)`);
  glow.addColorStop(1, `rgba(${ink},0)`);
  g.fillStyle = glow;
  g.beginPath();
  g.arc(80, 80, 74, 0, Math.PI * 2);
  g.fill();

  g.lineWidth = 7;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = `rgba(${accent},0.92)`;
  g.fillStyle = `rgba(${ink},0.12)`;
  g.beginPath();
  g.moveTo(80, 18);
  g.lineTo(132, 80);
  g.lineTo(80, 142);
  g.lineTo(28, 80);
  g.closePath();
  g.fill();
  g.stroke();

  g.strokeStyle = `rgba(${accent},0.98)`;
  g.lineWidth = 9;
  if (kind === 'fire') {
    g.beginPath();
    g.moveTo(82, 43);
    g.bezierCurveTo(112, 78, 102, 111, 80, 130);
    g.bezierCurveTo(55, 100, 56, 70, 82, 43);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(82, 72);
    g.bezierCurveTo(94, 91, 91, 109, 78, 121);
    g.bezierCurveTo(66, 101, 68, 84, 82, 72);
    g.stroke();
  } else if (kind === 'vision') {
    g.beginPath();
    g.moveTo(42, 95);
    g.lineTo(112, 52);
    g.lineTo(96, 78);
    g.moveTo(112, 52);
    g.lineTo(78, 50);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(76, 108, 30, 15, 0, 0, Math.PI * 2);
    g.moveTo(76, 108);
    g.arc(76, 108, 7, 0, Math.PI * 2);
    g.stroke();
  } else if (kind === 'bind') {
    for (const y of [62, 86, 110]) {
      g.beginPath();
      g.ellipse(64, y, 23, 12, -0.58, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(96, y + 12, 23, 12, 0.58, 0, Math.PI * 2);
      g.stroke();
    }
  } else if (kind === 'heal') {
    g.beginPath();
    g.moveTo(82, 42);
    g.bezierCurveTo(46, 76, 46, 116, 79, 134);
    g.bezierCurveTo(83, 100, 101, 73, 82, 42);
    g.stroke();
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(78, 68);
    g.lineTo(62, 126);
    g.moveTo(73, 89);
    g.lineTo(56, 96);
    g.moveTo(69, 106);
    g.lineTo(52, 116);
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(55, 48);
    g.lineTo(106, 62);
    g.lineTo(100, 108);
    g.lineTo(56, 96);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(55, 48);
    g.lineTo(55, 130);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePillarTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 384;
  const g = c.getContext('2d');
  const ink = inkFor(kind);
  const accent = kind === 'fire'
    ? '255,211,142'
    : kind === 'vision'
      ? '203,248,255'
      : kind === 'bind'
        ? '240,242,250'
        : kind === 'heal'
          ? '202,255,231'
          : '255,240,184';

  const column = g.createLinearGradient(0, 0, 0, 384);
  column.addColorStop(0, `rgba(${ink},0)`);
  column.addColorStop(0.22, `rgba(${ink},0.52)`);
  column.addColorStop(0.58, `rgba(${ink},0.36)`);
  column.addColorStop(1, `rgba(${ink},0)`);
  g.fillStyle = column;
  g.beginPath();
  g.moveTo(48, 0);
  g.bezierCurveTo(76, 72, 70, 280, 48, 384);
  g.bezierCurveTo(26, 280, 20, 72, 48, 0);
  g.closePath();
  g.fill();

  g.strokeStyle = `rgba(${accent},0.88)`;
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(48, 22);
  g.lineTo(48, 346);
  g.stroke();

  g.lineWidth = 4;
  for (const y of [92, 168, 244]) {
    g.beginPath();
    g.moveTo(28, y);
    g.lineTo(48, y + 24);
    g.lineTo(68, y);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStatusTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const g = c.getContext('2d');
  const ink = inkFor(kind);
  const accent = kind === 'fire'
    ? '255,215,150'
    : kind === 'vision'
      ? '204,248,255'
      : kind === 'bind'
        ? '240,242,250'
        : kind === 'heal'
          ? '204,255,231'
          : '255,239,180';

  const glow = g.createRadialGradient(48, 48, 5, 48, 48, 46);
  glow.addColorStop(0, `rgba(${ink},0.34)`);
  glow.addColorStop(0.72, `rgba(${ink},0.14)`);
  glow.addColorStop(1, `rgba(${ink},0)`);
  g.fillStyle = glow;
  g.fillRect(0, 0, 96, 96);

  g.strokeStyle = `rgba(${accent},0.92)`;
  g.fillStyle = `rgba(${ink},0.16)`;
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.arc(48, 48, 35, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  g.strokeStyle = `rgba(${accent},0.98)`;
  g.fillStyle = `rgba(${accent},0.18)`;
  g.lineWidth = 6;
  if (kind === 'fire') {
    g.beginPath();
    g.moveTo(50, 24);
    g.bezierCurveTo(70, 48, 64, 68, 48, 78);
    g.bezierCurveTo(31, 58, 35, 39, 50, 24);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(50, 43);
    g.bezierCurveTo(58, 55, 55, 66, 47, 72);
    g.bezierCurveTo(39, 60, 41, 49, 50, 43);
    g.stroke();
  } else if (kind === 'vision') {
    g.beginPath();
    g.ellipse(48, 52, 24, 13, 0, 0, Math.PI * 2);
    g.moveTo(48, 52);
    g.arc(48, 52, 6, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(29, 28);
    g.lineTo(65, 22);
    g.lineTo(56, 32);
    g.stroke();
  } else if (kind === 'bind') {
    for (const y of [37, 52, 67]) {
      g.beginPath();
      g.ellipse(38, y, 14, 8, -0.62, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(58, y + 6, 14, 8, 0.62, 0, Math.PI * 2);
      g.stroke();
    }
  } else if (kind === 'heal') {
    g.beginPath();
    g.moveTo(51, 24);
    g.bezierCurveTo(29, 43, 28, 68, 48, 77);
    g.bezierCurveTo(50, 56, 61, 39, 51, 24);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(47, 39);
    g.lineTo(38, 73);
    g.moveTo(44, 51);
    g.lineTo(34, 57);
    g.moveTo(42, 62);
    g.lineTo(32, 68);
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(35, 27);
    g.lineTo(65, 35);
    g.lineTo(60, 60);
    g.lineTo(36, 53);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(35, 27);
    g.lineTo(35, 76);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function burstLineGeometry(spokes = 14) {
  const pts = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const inner = 0.25 + (i % 2) * 0.1;
    const outer = 0.82 + (i % 3) * 0.18;
    pts.push(
      new THREE.Vector3(Math.cos(a) * inner, 0, Math.sin(a) * inner),
      new THREE.Vector3(Math.cos(a) * outer, 0, Math.sin(a) * outer),
    );
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function glowMaterial(color, opacity = 0.75, texture = null) {
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

function glowLineMaterial(color, opacity = 0.75) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

function posOf(target) {
  if (!target) return null;
  if (target.isVector3) return target;
  if (target.pos) return target.pos;
  if (target.group?.position) return target.group.position;
  return null;
}

function isEnemyTarget(target) {
  return !!target?.group?.position && !target?.pos && target.alive !== false;
}

function arcPoint(a, b, c, t) {
  const q = 1 - t;
  return new THREE.Vector3(
    a.x * q * q + b.x * 2 * q * t + c.x * t * t,
    a.y * q * q + b.y * 2 * q * t + c.y * t * t,
    a.z * q * q + b.z * 2 * q * t + c.z * t * t,
  );
}

export class HeroCommandField {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.group = new THREE.Group();
    this.group.name = 'hero-command-field';
    this.group.renderOrder = 11;
    this.ringGeo = circleLineGeometry(144);
    this.haloGeo = circleLineGeometry(96);
    this.waveGeo = new THREE.RingGeometry(0.76, 1.0, 192);
    this.sigilGeo = new THREE.PlaneGeometry(3.0, 6.6);
    this.standardGeo = new THREE.PlaneGeometry(3.8, 11.4);
    this.impactGeo = new THREE.PlaneGeometry(3.2, 3.2);
    this.impactHaloGeo = new THREE.RingGeometry(0.72, 1.0, 96);
    this.impactPillarGeo = new THREE.PlaneGeometry(2.4, 8.2);
    this.impactBurstGeo = burstLineGeometry(14);
    this.targetLockGeo = new THREE.RingGeometry(0.72, 1.0, 80);
    this.statusBadgeGeo = new THREE.PlaneGeometry(1.35, 1.35);
    this.statusPulseGeo = new THREE.RingGeometry(0.46, 0.6, 72);
    this.sparkGeo = new THREE.SphereGeometry(0.18, 8, 6);
    this.textures = new Map();
    this.standardTextures = new Map();
    this.impactTextures = new Map();
    this.pillarTextures = new Map();
    this.statusTextures = new Map();
    this.waves = [];
    this.rings = [];
    this.crowns = [];
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
    this.previewRings = [];
    this.previewLocks = [];
    scene.add(this.group);
  }

  preview(tower, { kind = 'default', rank = 0, range = 12, targets = [], ready = true } = {}) {
    this.clearPreview();
    if (settings.get('reducedMotion') || !tower?.alive) return;
    const color = ready ? kindColor(kind) : 0x9b8b68;
    const p = tower.pos;
    const y = this.map.heightAt(p.x, p.z) + 0.18;
    const max = Math.max(7, Math.min(30, range * 0.78));
    this._addPreviewRing(p.x, y, p.z, { max, color, life: 4.0, phase: 0.0, ready });
    this._addPreviewRing(p.x, y + 0.05, p.z, { max: Math.max(5, max * 0.48), color, life: 4.0, phase: 1.1, ready });
    const targetInfos = targets
      .map((target) => ({ target, pos: posOf(target) }))
      .filter((entry) => entry.pos)
      .slice(0, 12);
    targetInfos.forEach(({ target }, i) => {
      this._addPreviewLock(target, color, {
        life: 4.0,
        delay: i * 0.018,
        scale: 0.82 + Math.min(0.22, rank * 0.045),
        ready,
      });
    });
  }

  clearPreview() {
    while (this.previewRings.length) this._removePreviewRing(this.previewRings.length - 1);
    while (this.previewLocks.length) this._removePreviewLock(this.previewLocks.length - 1);
  }

  trigger(tower, { key = 'default', kind = 'default', rank = 0, range = 12, targets = [] } = {}) {
    this.clearPreview();
    if (settings.get('reducedMotion') || !tower?.alive) return;
    const color = kindColor(kind);
    const p = tower.pos;
    const y = this.map.heightAt(p.x, p.z) + 0.24;
    const max = Math.max(9, Math.min(38, range * 0.95));
    this._addShockwave(p.x, y + 0.03, p.z, { max: max * 1.08, life: 1.34, color, delay: 0 });
    this._addShockwave(p.x, y + 0.08, p.z, { max: Math.max(8, max * 0.58), life: 1.08, color: COLORS.rally, delay: 0.1 });
    this._addRing(p.x, y, p.z, { max, life: 1.15, color, delay: 0 });
    this._addRing(p.x, y + 0.05, p.z, { max: Math.max(6, max * 0.45), life: 0.95, color: COLORS.rally, delay: 0.09 });
    this._addCrown(p.x, y + 3.0, p.z, { max: 1.9 + rank * 0.16, lift: 1.1, life: 1.15, color, delay: 0.02, spin: 1.8 });
    this._addCrown(p.x, y + 4.25, p.z, { max: 1.25 + rank * 0.12, lift: 1.35, life: 1.0, color: COLORS.rally, delay: 0.12, spin: -2.2 });
    this._addSigil(p.x, p.y + 5.0 + rank * 0.25, p.z, { key, kind, color, life: 1.35, scale: 1.05 + rank * 0.08, delay: 0 });
    this._addStandard(p.x, p.y + 6.4 + rank * 0.25, p.z, { kind, color, life: 1.55, scale: 0.9 + rank * 0.08, delay: 0.05 });

    const targetInfos = targets
      .map((target) => ({ target, pos: posOf(target) }))
      .filter((entry) => entry.pos)
      .slice(0, 10);
    const anchors = targetInfos.map((entry) => entry.pos);
    if (anchors.length > 1) {
      const threadPoints = anchors
        .slice()
        .sort((a, b) => a.distanceToSquared(p) - b.distanceToSquared(p))
        .map((tp) => new THREE.Vector3(tp.x, (tp.y || this.map.heightAt(tp.x, tp.z)) + 2.2, tp.z));
      const start = new THREE.Vector3(p.x, y + 2.4, p.z);
      this._addCommandThread([start, ...threadPoints], color, { life: 1.15 + rank * 0.06, delay: 0.035 });
      if (kind === 'rally' || kind === 'heal') {
        this._addCommandThread([start, ...threadPoints.slice().reverse()], COLORS.rally, { life: 1.0 + rank * 0.04, delay: 0.13 });
      }
    }
    const rayAnchors = anchors.length ? anchors : this._fieldAnchors(p, kind, range);
    rayAnchors.forEach((tp, i) => {
      this._addRay(p, tp, color, 0.75 + i * 0.025);
      if (anchors.length) this._addSigil(tp.x, (tp.y || this.map.heightAt(tp.x, tp.z)) + 3.2, tp.z, {
        key, kind, color, life: 0.88, scale: 0.38, delay: 0.06 + i * 0.025,
      });
      if (isEnemyTarget(targetInfos[i]?.target)) {
        const ty = tp.y || this.map.heightAt(tp.x, tp.z);
        this._addImpactHalo(tp.x, ty + 0.08, tp.z, { color, life: 0.72, max: 2.2, delay: 0.04 + i * 0.025 });
        this._addImpactBurst(tp.x, ty + 0.13, tp.z, { color, life: 0.66, max: 2.8, delay: 0.04 + i * 0.025 });
        this._addImpactPillar(tp.x, ty + 4.1, tp.z, { kind, color, life: 0.72, scale: 0.82, delay: 0.045 + i * 0.026 });
        this._addImpact(tp.x, ty + 2.8, tp.z, { kind, color, life: 0.86, scale: 0.78, delay: 0.06 + i * 0.03 });
        this._addTargetLock(targetInfos[i].target, color, { life: 1.08, delay: 0.02 + i * 0.024, scale: 1.08 });
        this._addStatusRead(targetInfos[i].target, { kind, color, life: 2.15 + rank * 0.12, delay: 0.08 + i * 0.035 });
      }
      if (i < 7) {
        const ty = tp.y || this.map.heightAt(tp.x, tp.z);
        this._addStandard(tp.x, ty + 4.2, tp.z, { kind, color, life: 0.95, scale: 0.28, delay: 0.12 + i * 0.035 });
      }
    });
  }

  _fieldAnchors(origin, kind, range) {
    const n = FIELD_RAYS[kind] || FIELD_RAYS.default;
    const radius = Math.max(7, Math.min(24, range * (kind === 'vision' ? 0.62 : 0.48)));
    const twist = kind === 'fire' ? 0.18 : kind === 'vision' ? 0.36 : kind === 'bind' ? -0.18 : 0;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + twist;
      out.push(new THREE.Vector3(
        origin.x + Math.cos(a) * radius,
        0,
        origin.z + Math.sin(a) * radius,
      ));
    }
    return out;
  }

  _texture(key, kind) {
    const id = `${kind}:${key}`;
    if (!this.textures.has(id)) this.textures.set(id, makeSigilTexture(key, kind));
    return this.textures.get(id);
  }

  _standardTexture(kind) {
    if (!this.standardTextures.has(kind)) this.standardTextures.set(kind, makeStandardTexture(kind));
    return this.standardTextures.get(kind);
  }

  _impactTexture(kind) {
    if (!this.impactTextures.has(kind)) this.impactTextures.set(kind, makeImpactTexture(kind));
    return this.impactTextures.get(kind);
  }

  _pillarTexture(kind) {
    if (!this.pillarTextures.has(kind)) this.pillarTextures.set(kind, makePillarTexture(kind));
    return this.pillarTextures.get(kind);
  }

  _statusTexture(kind) {
    if (!this.statusTextures.has(kind)) this.statusTextures.set(kind, makeStatusTexture(kind));
    return this.statusTextures.get(kind);
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
    const mesh = new THREE.LineLoop(max > 15 ? this.ringGeo : this.haloGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.4);
    mesh.frustumCulled = false;
    mesh.renderOrder = 40;
    this.group.add(mesh);
    this.rings.push({ mesh, mat, max, life, t: -delay });
  }

  _addPreviewRing(x, y, z, { max, color, life, phase, ready }) {
    const mat = glowLineMaterial(color, 0);
    const mesh = new THREE.LineLoop(max > 15 ? this.ringGeo : this.haloGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(max);
    mesh.frustumCulled = false;
    mesh.renderOrder = 37;
    this.group.add(mesh);
    this.previewRings.push({ mesh, mat, max, life, t: 0, phase, ready });
  }

  _addCrown(x, y, z, { max, lift, life, color, delay, spin }) {
    const mat = glowLineMaterial(color, 0);
    const mesh = new THREE.LineLoop(this.haloGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.2);
    mesh.frustumCulled = false;
    mesh.renderOrder = 40;
    this.group.add(mesh);
    this.crowns.push({ mesh, mat, y, max, lift, life, spin, t: -delay });
  }

  _addSigil(x, y, z, { key, kind, color, life, scale, delay }) {
    const mat = glowMaterial(color, 0, this._texture(key, kind));
    const mesh = new THREE.Mesh(this.sigilGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    mesh.frustumCulled = false;
    mesh.renderOrder = 41;
    this.group.add(mesh);
    this.sigils.push({ mesh, mat, life, t: -delay, phase: Math.random() * Math.PI * 2 });
  }

  _addStandard(x, y, z, { kind, color, life, scale, delay }) {
    const mat = glowMaterial(color, 0, this._standardTexture(kind));
    const mesh = new THREE.Mesh(this.standardGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    mesh.frustumCulled = false;
    mesh.renderOrder = 42;
    this.group.add(mesh);
    this.standards.push({ mesh, mat, life, scale, t: -delay, phase: Math.random() * Math.PI * 2 });
  }

  _addImpact(x, y, z, { kind, color, life, scale, delay }) {
    const mat = glowMaterial(color, 0, this._impactTexture(kind));
    const mesh = new THREE.Mesh(this.impactGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    mesh.frustumCulled = false;
    mesh.renderOrder = 44;
    this.group.add(mesh);
    this.impacts.push({ mesh, mat, life, scale, t: -delay, phase: Math.random() * Math.PI * 2 });
  }

  _addImpactHalo(x, y, z, { color, life, max, delay }) {
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

  _addImpactPillar(x, y, z, { kind, color, life, scale, delay }) {
    const mat = glowMaterial(color, 0, this._pillarTexture(kind));
    const mesh = new THREE.Mesh(this.impactPillarGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    mesh.frustumCulled = false;
    mesh.renderOrder = 45;
    this.group.add(mesh);
    this.impactPillars.push({ mesh, mat, life, scale, t: -delay, phase: Math.random() * Math.PI * 2 });
  }

  _addImpactBurst(x, y, z, { color, life, max, delay }) {
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
    const p = posOf(target);
    if (!p) return;
    const mat = glowMaterial(color, 0);
    const mesh = new THREE.Mesh(this.targetLockGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, this.map.heightAt(p.x, p.z) + 0.28, p.z);
    mesh.frustumCulled = false;
    mesh.renderOrder = 47;
    this.group.add(mesh);
    this.targetLocks.push({ target, mesh, mat, life, scale, t: -delay, spin: Math.random() > 0.5 ? 1 : -1 });
  }

  _addPreviewLock(target, color, { life, delay, scale, ready }) {
    const p = posOf(target);
    if (!p) return;
    const mat = glowMaterial(color, 0);
    const mesh = new THREE.Mesh(this.targetLockGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, this.map.heightAt(p.x, p.z) + 0.24, p.z);
    mesh.frustumCulled = false;
    mesh.renderOrder = 38;
    this.group.add(mesh);
    this.previewLocks.push({ target, mesh, mat, life, scale, t: -delay, ready, spin: Math.random() > 0.5 ? 1 : -1 });
  }

  _addStatusRead(target, { kind, color, life, delay }) {
    const p = posOf(target);
    if (!p) return;
    const mat = glowMaterial(color, 0, this._statusTexture(kind));
    const badge = new THREE.Mesh(this.statusBadgeGeo, mat);
    badge.frustumCulled = false;
    badge.renderOrder = 49;
    this.group.add(badge);

    const pulseMat = glowMaterial(color, 0);
    const pulse = new THREE.Mesh(this.statusPulseGeo, pulseMat);
    pulse.rotation.x = -Math.PI / 2;
    pulse.frustumCulled = false;
    pulse.renderOrder = 48;
    this.group.add(pulse);

    this.statusReads.push({
      target, badge, mat, pulse, pulseMat, kind, life, t: -delay,
      phase: Math.random() * Math.PI * 2,
      spin: Math.random() > 0.5 ? 1 : -1,
    });
  }

  _addRay(from, to, color, life) {
    const start = new THREE.Vector3(from.x, this.map.heightAt(from.x, from.z) + 0.36, from.z);
    const end = new THREE.Vector3(to.x, this.map.heightAt(to.x, to.z) + 1.18, to.z);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += Math.min(9, 2.6 + start.distanceTo(end) * 0.08);
    const points = [];
    for (let i = 0; i <= 20; i++) points.push(arcPoint(start, mid, end, i / 20));

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
    this.rays.push({ mesh, mat, geom, spark, sparkMat, points, life, t: 0 });
  }

  _addCommandThread(points, color, { life, delay }) {
    if (!points || points.length < 2) return;
    const curve = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const c = points[i + 1];
      const mid = a.clone().lerp(c, 0.5);
      mid.y += Math.min(7, 2.2 + a.distanceTo(c) * 0.055);
      for (let s = 0; s <= 8; s++) {
        if (i > 0 && s === 0) continue;
        curve.push(arcPoint(a, mid, c, s / 8));
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

  update(dt, camera, time = 0) {
    const cam = camera?.position;
    for (let i = this.previewRings.length - 1; i >= 0; i--) {
      const r = this.previewRings[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.life);
      if (k >= 1) { this._removePreviewRing(i); continue; }
      const pulse = 0.5 + Math.sin(time * 3.4 + r.phase) * 0.5;
      r.mesh.scale.setScalar(r.max * (0.96 + pulse * 0.055));
      r.mat.opacity = (1 - k * 0.45) * (r.ready ? 0.32 : 0.18) + pulse * 0.04;
    }
    for (let i = this.previewLocks.length - 1; i >= 0; i--) {
      const lock = this.previewLocks[i];
      lock.t += dt;
      if (lock.t < 0) continue;
      const p = posOf(lock.target);
      if (!p || lock.target?.alive === false) { this._removePreviewLock(i); continue; }
      const k = Math.min(1, lock.t / lock.life);
      if (k >= 1) { this._removePreviewLock(i); continue; }
      const pulse = 0.5 + Math.sin(time * 4.0 + i * 0.73) * 0.5;
      lock.mesh.position.set(p.x, this.map.heightAt(p.x, p.z) + 0.24 + pulse * 0.05, p.z);
      lock.mesh.rotation.z += dt * lock.spin * 0.9;
      lock.mesh.scale.setScalar(lock.scale * (0.92 + pulse * 0.18));
      lock.mat.opacity = (1 - k * 0.4) * (lock.ready ? 0.34 : 0.18);
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt;
      if (w.t < 0) continue;
      const k = Math.min(1, w.t / w.life);
      if (k >= 1) { this._removeShockwave(i); continue; }
      const eased = 1 - Math.pow(1 - k, 2.35);
      w.mesh.scale.setScalar(0.75 + eased * w.max);
      w.mat.opacity = Math.sin(Math.PI * k) * (1 - k * 0.35) * 0.34;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t < 0) continue;
      const k = Math.min(1, r.t / r.life);
      if (k >= 1) { this._removeRing(i); continue; }
      const eased = 1 - Math.pow(1 - k, 2.15);
      r.mesh.scale.setScalar(0.65 + eased * r.max);
      r.mat.opacity = (1 - k) * 0.76;
    }
    for (let i = this.crowns.length - 1; i >= 0; i--) {
      const c = this.crowns[i];
      c.t += dt;
      if (c.t < 0) continue;
      const k = Math.min(1, c.t / c.life);
      if (k >= 1) { this._removeCrown(i); continue; }
      const swell = Math.sin(Math.PI * k);
      const eased = 1 - Math.pow(1 - k, 2.2);
      c.mesh.scale.setScalar(0.35 + eased * c.max);
      c.mesh.position.y = c.y + swell * c.lift;
      c.mesh.rotation.y += dt * c.spin;
      c.mat.opacity = swell * 0.58;
    }
    for (let i = this.sigils.length - 1; i >= 0; i--) {
      const s = this.sigils[i];
      s.t += dt;
      if (s.t < 0) continue;
      const k = Math.min(1, s.t / s.life);
      if (k >= 1) { this._removeSigil(i); continue; }
      if (cam) s.mesh.lookAt(cam.x, s.mesh.position.y, cam.z);
      s.mesh.position.y += Math.sin(time * 4.8 + s.phase) * dt * 0.13;
      s.mat.opacity = Math.sin(Math.PI * k) * 0.82;
    }
    for (let i = this.standards.length - 1; i >= 0; i--) {
      const s = this.standards[i];
      s.t += dt;
      if (s.t < 0) continue;
      const k = Math.min(1, s.t / s.life);
      if (k >= 1) { this._removeStandard(i); continue; }
      const swell = Math.sin(Math.PI * k);
      if (cam) s.mesh.lookAt(cam.x, s.mesh.position.y, cam.z);
      s.mesh.position.y += Math.sin(time * 4.2 + s.phase) * dt * 0.16;
      s.mesh.scale.setScalar(s.scale * (0.78 + swell * 0.3));
      s.mat.opacity = swell * 0.74;
    }
    for (let i = this.impactHalos.length - 1; i >= 0; i--) {
      const h = this.impactHalos[i];
      h.t += dt;
      if (h.t < 0) continue;
      const k = Math.min(1, h.t / h.life);
      if (k >= 1) { this._removeImpactHalo(i); continue; }
      const eased = 1 - Math.pow(1 - k, 2.1);
      h.mesh.scale.setScalar(0.4 + eased * h.max);
      h.mat.opacity = Math.sin(Math.PI * k) * 0.42;
    }
    for (let i = this.impactBursts.length - 1; i >= 0; i--) {
      const b = this.impactBursts[i];
      b.t += dt;
      if (b.t < 0) continue;
      const k = Math.min(1, b.t / b.life);
      if (k >= 1) { this._removeImpactBurst(i); continue; }
      const eased = 1 - Math.pow(1 - k, 2.2);
      b.mesh.scale.setScalar(0.4 + eased * b.max);
      b.mesh.rotation.y += dt * b.spin * 1.8;
      b.mat.opacity = Math.sin(Math.PI * k) * 0.78;
    }
    for (let i = this.impactPillars.length - 1; i >= 0; i--) {
      const p = this.impactPillars[i];
      p.t += dt;
      if (p.t < 0) continue;
      const k = Math.min(1, p.t / p.life);
      if (k >= 1) { this._removeImpactPillar(i); continue; }
      const swell = Math.sin(Math.PI * k);
      if (cam) p.mesh.lookAt(cam.x, p.mesh.position.y, cam.z);
      p.mesh.position.y += Math.sin(time * 7.8 + p.phase) * dt * 0.12 + dt * 0.28;
      p.mesh.scale.set(p.scale * (0.58 + swell * 0.55), p.scale * (0.8 + swell * 0.34), p.scale);
      p.mat.opacity = swell * 0.82;
    }
    for (let i = this.targetLocks.length - 1; i >= 0; i--) {
      const lock = this.targetLocks[i];
      lock.t += dt;
      if (lock.t < 0) continue;
      const p = posOf(lock.target);
      if (!p || lock.target?.alive === false) { this._removeTargetLock(i); continue; }
      const k = Math.min(1, lock.t / lock.life);
      if (k >= 1) { this._removeTargetLock(i); continue; }
      const swell = Math.sin(Math.PI * k);
      lock.mesh.position.set(p.x, this.map.heightAt(p.x, p.z) + 0.28 + swell * 0.08, p.z);
      lock.mesh.rotation.z += dt * lock.spin * 1.7;
      lock.mesh.scale.setScalar(lock.scale * (0.72 + swell * 0.6));
      lock.mat.opacity = swell * 0.58;
    }
    for (let i = this.statusReads.length - 1; i >= 0; i--) {
      const read = this.statusReads[i];
      read.t += dt;
      if (read.t < 0) continue;
      const p = posOf(read.target);
      if (!p || read.target?.alive === false) { this._removeStatusRead(i); continue; }
      const k = Math.min(1, read.t / read.life);
      if (k >= 1) { this._removeStatusRead(i); continue; }
      const fade = Math.min(1, k / 0.18, (1 - k) / 0.22);
      const head = read.target?.model?.headH || 1.7;
      const groundY = this.map.heightAt(p.x, p.z);
      read.badge.position.set(
        p.x,
        groundY + head + 1.25 + Math.sin(time * 5.0 + read.phase) * 0.08,
        p.z,
      );
      if (cam) read.badge.lookAt(cam.x, read.badge.position.y, cam.z);
      read.badge.scale.setScalar(0.78 + fade * 0.44 + Math.sin(time * 4.4 + read.phase) * 0.025);
      read.mat.opacity = fade * 0.92;

      read.pulse.position.set(p.x, groundY + 0.24, p.z);
      read.pulse.rotation.z += dt * read.spin * 1.25;
      read.pulse.scale.setScalar(1.05 + Math.sin(Math.PI * k) * 0.75 + k * 0.35);
      read.pulseMat.opacity = fade * (0.28 + Math.sin(time * 6.0 + read.phase) * 0.08);
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const mark = this.impacts[i];
      mark.t += dt;
      if (mark.t < 0) continue;
      const k = Math.min(1, mark.t / mark.life);
      if (k >= 1) { this._removeImpact(i); continue; }
      const swell = Math.sin(Math.PI * k);
      if (cam) mark.mesh.lookAt(cam.x, mark.mesh.position.y, cam.z);
      mark.mesh.position.y += Math.sin(time * 7.4 + mark.phase) * dt * 0.1 + dt * 0.18;
      mark.mesh.scale.setScalar(mark.scale * (0.72 + swell * 0.46));
      mark.mat.opacity = swell * 0.9;
    }
    for (let i = this.rays.length - 1; i >= 0; i--) {
      const r = this.rays[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.life);
      if (k >= 1) { this._removeRay(i); continue; }
      const swell = Math.sin(Math.PI * k);
      const head = Math.min(1, Math.max(0, k * 1.12));
      const idx = Math.min(r.points.length - 1, Math.floor(head * (r.points.length - 1)));
      r.spark.position.copy(r.points[idx]);
      r.spark.scale.setScalar(0.7 + swell * 1.45);
      r.mat.opacity = (1 - k) * 0.34 + swell * 0.16;
      r.sparkMat.opacity = swell * 0.82;
    }
    for (let i = this.commandThreads.length - 1; i >= 0; i--) {
      const th = this.commandThreads[i];
      th.t += dt;
      if (th.t < 0) continue;
      const k = Math.min(1, th.t / th.life);
      if (k >= 1) { this._removeCommandThread(i); continue; }
      const swell = Math.sin(Math.PI * k);
      th.mesh.position.y = Math.sin(time * 5.2 + th.phase) * 0.08 + k * 0.38;
      th.mat.opacity = swell * (0.46 + (1 - k) * 0.18);
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

  _removeCrown(i) {
    const c = this.crowns[i];
    this.group.remove(c.mesh);
    c.mat.dispose();
    this.crowns.splice(i, 1);
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

  _removePreviewRing(i) {
    const r = this.previewRings[i];
    this.group.remove(r.mesh);
    r.mat.dispose();
    this.previewRings.splice(i, 1);
  }

  _removePreviewLock(i) {
    const lock = this.previewLocks[i];
    this.group.remove(lock.mesh);
    lock.mat.dispose();
    this.previewLocks.splice(i, 1);
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

  dispose() {
    while (this.waves.length) this._removeShockwave(this.waves.length - 1);
    while (this.rings.length) this._removeRing(this.rings.length - 1);
    while (this.crowns.length) this._removeCrown(this.crowns.length - 1);
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
    this.clearPreview();
    for (const tex of this.textures.values()) tex.dispose();
    for (const tex of this.standardTextures.values()) tex.dispose();
    for (const tex of this.impactTextures.values()) tex.dispose();
    for (const tex of this.pillarTextures.values()) tex.dispose();
    for (const tex of this.statusTextures.values()) tex.dispose();
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
