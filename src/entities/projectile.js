// Projectiles — visible, satisfying, type-distinct. Arrows fly flat with trails,
// stones lob on arcs, discs roll the road, chains lash instantly, wards drift.
import * as THREE from 'three';
import { MATS } from '../models/materials.js';
import { FXC } from '../fx/particles.js';
import { colorMat } from '../models/humanoid.js';

const geoCache = {};
function geo(kind) {
  if (geoCache[kind]) return geoCache[kind];
  let g;
  switch (kind) {
    case 'arrow': g = new THREE.CylinderGeometry(0.02, 0.03, 0.7, 4).rotateX(Math.PI / 2); break;
    case 'bolt': g = new THREE.CylinderGeometry(0.05, 0.07, 1.1, 5).rotateX(Math.PI / 2); break;
    case 'stone': g = new THREE.DodecahedronGeometry(0.34, 0); break;
    case 'disc': g = new THREE.CylinderGeometry(0.45, 0.45, 0.22, 12).rotateZ(Math.PI / 2); break;
    case 'feather': g = new THREE.PlaneGeometry(0.12, 0.55); break;
    case 'ward': g = new THREE.SphereGeometry(0.16, 8, 6); break;
    case 'firepot': g = new THREE.SphereGeometry(0.14, 6, 5); break;
    default: g = new THREE.SphereGeometry(0.1, 6, 5);
  }
  geoCache[kind] = g;
  return g;
}

const matFor = {
  arrow: () => MATS().woodDark,
  bolt: () => MATS().iron,
  stone: () => MATS().stoneDark,
  disc: () => MATS().stoneWhite,
  feather: () => MATS().featherGlow,
  ward: () => MATS().sacredGlow,
  firepot: () => MATS().flame,
};

export class Projectile {
  // opts: { kind, from:V3, target:enemy, speed, arc, onHit(enemy, pos), trail:[r,g,b], pierce, game }
  constructor(game, opts) {
    this.game = game;
    this.kind = opts.kind || 'arrow';
    this.target = opts.target;
    this.speed = opts.speed || 26;
    this.arc = opts.arc || 0;
    this.onHit = opts.onHit;
    this.trail = opts.trail;
    this.pierce = opts.pierce || 0;
    this.hitSet = new Set();
    this.alive = true;
    this.t = 0;
    this.from = opts.from.clone();
    this.mesh = new THREE.Mesh(geo(this.kind), (matFor[this.kind] || matFor.arrow)());
    this.mesh.position.copy(opts.from);
    this.mesh.castShadow = this.kind === 'stone' || this.kind === 'disc';
    game.scene.add(this.mesh);
    this.targetPos = this._targetPoint();
    if (this.arc > 0) this.flightTime = Math.max(0.35, this.from.distanceTo(this.targetPos) / this.speed);
  }

  _targetPoint() {
    if (!this.target || !this.target.alive) return this.targetPos || this.from;
    const p = this.target.group.position.clone();
    p.y += (this.target.model?.headH || 1.5) * 0.55;
    return p;
  }

  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    if (this.arc > 0) {
      // ballistic lob to (possibly moving) target point
      this.targetPos = this._targetPoint();
      const k = Math.min(1, this.t / this.flightTime);
      const p = this.from.clone().lerp(this.targetPos, k);
      p.y += Math.sin(k * Math.PI) * this.arc;
      this.mesh.position.copy(p);
      this.mesh.rotation.x += dt * (this.kind === 'disc' ? 9 : 3);
      if (this.kind === 'disc') {
        const g = this.game.map.heightAt(p.x, p.z);
        this.mesh.position.y = Math.max(p.y * 0.4 + g * 0.6, g + 0.5);
      }
      if (k >= 1) this._impact();
    } else {
      // homing dart
      this.targetPos = this._targetPoint();
      const dir = this.targetPos.clone().sub(this.mesh.position);
      const dist = dir.length();
      if (dist < 0.6 || (!this.target?.alive && dist < 2)) { this._impact(); return; }
      dir.normalize();
      this.mesh.position.addScaledVector(dir, this.speed * dt);
      this.mesh.lookAt(this.targetPos);
      if (this.kind === 'feather') this.mesh.rotation.z += dt * 6;
      // pierce check: hit enemies crossed along the way
      if (this.pierce > 0) {
        for (const e of this.game.enemies) {
          if (!e.alive || this.hitSet.has(e)) continue;
          if (e.group.position.distanceToSquared(this.mesh.position) < 1.2) {
            this.hitSet.add(e);
            this.onHit?.(e, this.mesh.position);
            this.pierce--;
            if (this.pierce <= 0) { this._die(); return; }
          }
        }
      }
      if (this.t > 4) this._die();
    }
    if (this.trail) {
      // dense, glowing wake — a couple of soft additive embers every frame that linger and fade,
      // instead of one sparse fleck 60% of frames (which barely read in motion).
      const p = this.mesh.position;
      const [tr, tg, tb] = this.trail;
      const n = this.kind === 'bolt' || this.kind === 'firepot' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        this.game.particles.spawn(
          p.x + (Math.random() - 0.5) * 0.06, p.y + (Math.random() - 0.5) * 0.06, p.z + (Math.random() - 0.5) * 0.06,
          (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4,
          0.5, 0.26, tr, tg, tb, 0, 1.5,
        );
      }
    }
  }

  _impact() {
    const p = this.mesh.position;
    if (this.target?.alive && !this.hitSet.has(this.target)) this.onHit?.(this.target, p);
    else if (this.arc > 0) this.onHit?.(null, p); // splash lobs hit ground
    // contact feedback: a spark burst at the point of impact, scaled by the projectile's heft.
    const heavy = this.kind === 'stone' || this.kind === 'disc' || this.kind === 'bolt' || this.kind === 'firepot';
    const col = this.trail || FXC.spark;
    this.game.particles.burst(p, heavy ? 12 : 6, {
      speed: heavy ? 4 : 2.4, up: heavy ? 2 : 1.2, life: 0.4, size: heavy ? 0.4 : 0.28,
      color: col, grav: 6, spread: heavy ? 1.2 : 0.7, drag: 2,
    });
    // heavy ordnance lands with weight — a beat of hit-stop, a kick of shake, a bloom flash.
    // Light darts skip this so rapid archers don't stutter the whole scene.
    if (heavy && this.game.engine) {
      this.game.engine.hitStop(0.03);
      this.game.engine.addShake(0.14);
      this.game.engine.bloomPulse(0.7);
    }
    this._die();
  }

  _die() {
    this.alive = false;
    this.game.scene.remove(this.mesh);
  }
}

// instant visual lash (chains, beams) — line that fades
export function lashEffect(game, from, to, color = 0xaab2bd, life = 0.25) {
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(g, mat);
  game.scene.add(line);
  const start = performance.now();
  const tick = () => {
    const t = (performance.now() - start) / (life * 1000);
    if (t >= 1) { game.scene.remove(line); g.dispose(); mat.dispose(); return; }
    mat.opacity = 0.9 * (1 - t);
    requestAnimationFrame(tick);
  };
  tick();
  const mid = from.clone().lerp(to, 0.6);
  game.particles.burst(mid, 4, { speed: 1, life: 0.4, size: 0.3, color: FXC.chain, grav: 2 });
}
