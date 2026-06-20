import * as THREE from 'three';
import { settings } from '../core/settings.js';

const GOLD = new THREE.Color(0xf4cd6e);
const TURQUOISE = new THREE.Color(0x2fa7a0);
const WHITE_GOLD = new THREE.Color(0xfff3c8);

function makeRingMaterial(color, opacity = 0.85) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function makeStandardTexture() {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,244,190,0)');
  grad.addColorStop(0.18, 'rgba(255,229,123,0.8)');
  grad.addColorStop(0.52, 'rgba(64,207,192,0.5)');
  grad.addColorStop(1, 'rgba(255,229,123,0)');
  g.fillStyle = grad;
  g.fillRect(44, 0, 8, 256);
  g.fillStyle = 'rgba(255,244,190,0.22)';
  g.fillRect(35, 24, 26, 174);
  g.fillStyle = 'rgba(47,167,160,0.28)';
  g.fillRect(22, 88, 52, 28);
  return new THREE.CanvasTexture(c);
}

export class OathField {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.group = new THREE.Group();
    this.group.name = 'oath-field';
    this.group.renderOrder = 8;
    this.ringGeo = new THREE.RingGeometry(0.96, 1.0, 160);
    this.haloGeo = new THREE.RingGeometry(0.88, 1.0, 96);
    this.standardGeo = new THREE.PlaneGeometry(4.4, 15.5);
    this.standardTex = makeStandardTexture();
    this.rings = [];
    this.standards = [];
    scene.add(this.group);
  }

  trigger(citadel, towers, paths) {
    if (settings.get('reducedMotion')) return;
    const keep = citadel?.group?.position || this.map.exitPos;
    const y = this.map.heightAt(keep.x, keep.z) + 0.22;
    this._addRing(keep.x, y, keep.z, { max: 72, life: 1.75, width: 1.0, color: GOLD, delay: 0 });
    this._addRing(keep.x, y + 0.04, keep.z, { max: 48, life: 1.45, width: 0.65, color: TURQUOISE, delay: 0.12 });
    this._addRing(keep.x, y + 0.08, keep.z, { max: 28, life: 1.15, width: 0.35, color: WHITE_GOLD, delay: 0.22 });
    this._addStandard(keep.x, y + 7.4, keep.z, { life: 1.7, scale: 1.35, delay: 0.05 });

    for (const tower of towers.filter((t) => t.alive).slice(0, 18)) {
      const p = tower.pos;
      this._addRing(p.x, p.y + 0.2, p.z, { max: 9.5, life: 1.0, width: 0.45, color: GOLD, delay: 0.16 + Math.random() * 0.18 });
      this._addStandard(p.x, p.y + 5.0, p.z, { life: 1.25, scale: 0.42, delay: 0.12 + Math.random() * 0.18 });
    }

    for (const path of paths || []) {
      const samples = path.samples || [];
      for (let i = 16; i < samples.length; i += 38) {
        const p = samples[i].pos;
        this._addRing(p.x, p.y + 0.16, p.z, { max: 5.0, life: 0.9, width: 0.25, color: TURQUOISE, delay: 0.22 + i * 0.002 });
      }
    }
  }

  pulse(citadel, towers) {
    if (settings.get('reducedMotion')) return;
    const keep = citadel?.group?.position || this.map.exitPos;
    const y = this.map.heightAt(keep.x, keep.z) + 0.18;
    this._addRing(keep.x, y, keep.z, { max: 24, life: 0.9, width: 0.4, color: GOLD, delay: 0 });
    for (const tower of towers.filter((t) => t.alive && Math.random() < 0.22).slice(0, 6)) {
      this._addStandard(tower.pos.x, tower.pos.y + 4.5, tower.pos.z, { life: 0.75, scale: 0.3, delay: 0 });
    }
  }

  _addRing(x, y, z, { max, life, width, color, delay }) {
    const mat = makeRingMaterial(color, 0.85);
    const mesh = new THREE.Mesh(width > 0.6 ? this.ringGeo : this.haloGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.4);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.rings.push({ mesh, mat, max, life, t: -delay, width });
  }

  _addStandard(x, y, z, { life, scale, delay }) {
    const mat = new THREE.MeshBasicMaterial({
      map: this.standardTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.standardGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(scale, scale, scale);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.standards.push({ mesh, mat, life, t: -delay, phase: Math.random() * Math.PI * 2 });
  }

  update(dt, camera, time = 0) {
    if (dt <= 0) return;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t < 0) continue;
      const k = Math.min(1, r.t / r.life);
      if (k >= 1) { this._removeRing(i); continue; }
      const eased = 1 - Math.pow(1 - k, 2.4);
      r.mesh.scale.setScalar(0.8 + eased * r.max);
      r.mat.opacity = (1 - k) * (0.78 + r.width * 0.1);
    }
    const cam = camera?.position;
    for (let i = this.standards.length - 1; i >= 0; i--) {
      const s = this.standards[i];
      s.t += dt;
      if (s.t < 0) continue;
      const k = Math.min(1, s.t / s.life);
      if (k >= 1) { this._removeStandard(i); continue; }
      if (cam) s.mesh.lookAt(cam.x, s.mesh.position.y, cam.z);
      s.mesh.position.y += Math.sin(time * 4.0 + s.phase) * dt * 0.12;
      s.mat.opacity = Math.sin(Math.PI * k) * 0.72;
    }
  }

  _removeRing(i) {
    const r = this.rings[i];
    this.group.remove(r.mesh);
    r.mat.dispose();
    this.rings.splice(i, 1);
  }

  _removeStandard(i) {
    const s = this.standards[i];
    this.group.remove(s.mesh);
    s.mat.dispose();
    this.standards.splice(i, 1);
  }

  dispose() {
    while (this.rings.length) this._removeRing(this.rings.length - 1);
    while (this.standards.length) this._removeStandard(this.standards.length - 1);
    this.ringGeo.dispose();
    this.haloGeo.dispose();
    this.standardGeo.dispose();
    this.standardTex.dispose();
    this.scene.remove(this.group);
  }
}
