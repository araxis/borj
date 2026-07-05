// Floating combat text: pooled DOM numbers that appear at hit positions.
// Fire-and-forget at spawn, throttled per enemy so rapid hits read as one value.
import * as THREE from 'three';
import { settings } from '../core/settings.js';

const THROTTLE = 0.15;
const BIG_FRAC = 0.11;
const MAX_ACTIVE = 48;

class Floaters {
  constructor() {
    this.engine = null;
    this.layer = null;
    this.pool = [];
    this.active = 0;
    this._v = new THREE.Vector3();
    this._src = new WeakMap();
  }

  attach(engine) {
    this.engine = engine;
    if (!this.layer && typeof document !== 'undefined') {
      this.layer = document.createElement('div');
      this.layer.className = 'float-layer';
      this.layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(this.layer);
    }
  }

  clear() {
    if (this.layer) this.layer.replaceChildren();
    this.pool.length = 0;
    this.active = 0;
    this._src = new WeakMap();
  }

  hit(enemy, amount, type = 'arrow', kill = false) {
    if (!this.layer || !this.engine?.camera || amount <= 0) return;
    if (!settings.get('damageNumbers')) return;
    const now = performance.now() / 1000;
    let source = this._src.get(enemy);
    if (!source) {
      source = { acc: 0, last: -1, maxHp: enemy.maxHp || 100 };
      this._src.set(enemy, source);
    }
    source.acc += amount;
    if (!kill && now - source.last < THROTTLE) return;
    const shown = Math.round(source.acc);
    source.acc = 0;
    source.last = now;
    if (shown < 1) return;
    this._spawn(enemy.group.position, shown, type, shown >= source.maxHp * BIG_FRAC || kill);
  }

  reward(worldPos, gold) {
    if (!this.layer || !this.engine?.camera || gold <= 0 || !settings.get('damageNumbers')) return;
    this._spawn(worldPos, `+${Math.round(gold)}🪙`, 'gold', true);
  }

  _spawn(worldPos, value, type, big) {
    if (this.active >= MAX_ACTIVE) return;
    const camera = this.engine.camera;
    this._v.copy(worldPos);
    this._v.y += 2.2;
    this._v.project(camera);
    if (this._v.z > 1) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const x = (this._v.x * 0.5 + 0.5) * width;
    const y = (-this._v.y * 0.5 + 0.5) * height;
    if (x < -60 || x > width + 60 || y < -60 || y > height + 60) return;

    const el = this.pool.pop() || document.createElement('div');
    el.className = 'floatnum t-' + type + (big ? ' big' : '');
    el.textContent = value;
    el.style.left = `${x + (Math.random() - 0.5) * 26}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--rise', `${big ? -58 : -40}px`);
    this.layer.appendChild(el);
    this.active += 1;

    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';

    clearTimeout(el._recycle);
    el._recycle = setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
      this.active = Math.max(0, this.active - 1);
      if (this.pool.length < 64) this.pool.push(el);
    }, 820);
  }
}

export const floaters = new Floaters();
