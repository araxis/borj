// Pooled CPU particle system — one THREE.Points cloud, additive soft sprites.
// Emitters: burst (hits, deaths, dust), fountain (fire), drift (mist, feathers).
import * as THREE from 'three';
import { settings } from '../core/settings.js';

function softCircleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const MAX = 2600;

export class ParticleSystem {
  constructor(scene) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.sizes = new Float32Array(MAX);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.mat = new THREE.PointsMaterial({
      size: 0.5, map: softCircleTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true, sizeAttenuation: true,
    });
    // per-point size via onBeforeCompile hook
    this.mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('uniform float size;', 'attribute float size;')
      ;
    };
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);   // remaining
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.baseSize = new Float32Array(MAX);
    this.head = 0;
    this.active = 0;
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -999;
  }

  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, grav = 0, drag = 0) {
    const budget = settings.get('quality') === 'low' ? 0.45 : settings.get('quality') === 'medium' ? 0.75 : 1;
    if (Math.random() > budget) return;
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.grav[i] = grav; this.drag[i] = drag;
  }

  burst(p, count, opts) {
    const { speed = 3, up = 1.5, life = 0.7, size = 0.5, color = [1, 0.7, 0.3], grav = 4, spread = 1, drag = 0 } = opts || {};
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      const s = (0.4 + Math.random() * 0.6) * speed;
      this.spawn(
        p.x + Math.cos(a) * r * 0.3, p.y, p.z + Math.sin(a) * r * 0.3,
        Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s,
        life * (0.6 + Math.random() * 0.7), size * (0.7 + Math.random() * 0.6),
        color[0], color[1], color[2], grav, drag,
      );
    }
  }

  update(dt) {
    if (dt <= 0) return;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; this.sizes[i] = 0; continue; }
      const k = this.drag[i] > 0 ? Math.max(0, 1 - this.drag[i] * dt) : 1;
      this.vel[i * 3] *= k; this.vel[i * 3 + 2] *= k;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.sizes[i] = this.baseSize[i] * (0.4 + t * 0.8);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

// shared color presets
export const FXC = {
  spark: [1.0, 0.75, 0.3],
  ember: [1.0, 0.45, 0.12],
  flameCore: [1.0, 0.9, 0.6],
  dust: [0.62, 0.55, 0.45],
  stone: [0.55, 0.52, 0.46],
  blood: [0.6, 0.12, 0.1],
  venom: [0.5, 0.85, 0.25],
  heal: [0.55, 0.95, 0.75],
  feather: [1.0, 0.85, 0.55],
  sacred: [0.5, 0.85, 1.0],
  snow: [0.92, 0.95, 1.0],
  shadow: [0.3, 0.22, 0.42],
  gold: [1.0, 0.85, 0.3],
  chain: [0.7, 0.72, 0.78],
};
