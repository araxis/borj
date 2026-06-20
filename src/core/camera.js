// RTS camera rig: pan (WASD/arrows/middle-drag/edge), rotate (Q/E/right-drag),
// zoom (wheel/pinch), reset (Home/R... exposed as method), follow target, smooth easing.
import * as THREE from 'three';
import { settings } from './settings.js';

export class RTSCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 0, 0);
    this.targetGoal = new THREE.Vector3(0, 0, 0);
    this.yaw = -Math.PI / 4; this.yawGoal = this.yaw;
    this.pitch = 0.92; this.pitchGoal = this.pitch;
    this.dist = 70; this.distGoal = this.dist;
    this.bounds = { minX: -75, maxX: 75, minZ: -75, maxZ: 75 };
    this.minDist = 18; this.maxDist = 110;
    this.minPitch = 0.35; this.maxPitch = 1.35;
    this.follow = null; // entity with .group.position
    this._focusBeat = null;
    this._focusViewTarget = new THREE.Vector3();
    this._keys = new Set();
    this._drag = null;
    this.home = { target: new THREE.Vector3(0, 0, 0), yaw: -Math.PI / 4, pitch: 0.92, dist: 70 };
    this._bind();
    this.update(0);
  }

  setHome(x, z, dist = 70, yaw = -Math.PI / 4) {
    this.home.target.set(x, 0, z); this.home.dist = dist; this.home.yaw = yaw;
    this.reset();
  }

  reset() {
    this.targetGoal.copy(this.home.target);
    this.yawGoal = this.home.yaw;
    this.pitchGoal = this.home.pitch;
    this.distGoal = this.home.dist;
    this.follow = null;
    this._focusBeat = null;
  }

  followEntity(ent) { this.follow = ent; }

  focusBeat(anchor, opts = {}) {
    if (settings.get('reducedMotion') || this._fly) return;
    const source = anchor?.isVector3 ? anchor : anchor?.position?.isVector3 ? anchor.position : anchor?.group?.position;
    if (!source) return;
    const point = new THREE.Vector3(source.x, opts.y ?? 0, source.z);
    point.x = THREE.MathUtils.clamp(point.x, this.bounds.minX, this.bounds.maxX);
    point.z = THREE.MathUtils.clamp(point.z, this.bounds.minZ, this.bounds.maxZ);
    const zoom = opts.zoom ?? 0.82;
    this._focusBeat = {
      t: 0,
      dur: Math.max(0.25, opts.dur ?? 1.15),
      point,
      strength: THREE.MathUtils.clamp(opts.strength ?? 0.38, 0.05, 0.78),
      dist: THREE.MathUtils.clamp(opts.dist ?? this.distGoal * zoom, this.minDist, this.maxDist),
      pitch: opts.pitch == null ? null : THREE.MathUtils.clamp(opts.pitch, this.minPitch, this.maxPitch),
      yawOffset: opts.yawOffset ?? 0,
    };
  }

  _bind() {
    const d = this.dom;
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      this._keys.add(e.code);
      if (e.code === 'Home') this.reset();
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));
    window.addEventListener('blur', () => this._keys.clear());

    d.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || e.button === 2) {
        this._focusBeat = null;
        this._drag = { x: e.clientX, y: e.clientY, btn: e.button };
        d.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    });
    d.addEventListener('pointermove', (e) => {
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      this._drag.x = e.clientX; this._drag.y = e.clientY;
      if (this._drag.btn === 1) { // middle: pan
        const k = this.dist * 0.0016;
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        this.targetGoal.x -= (dx * cos - dy * sin) * k;
        this.targetGoal.z -= (dx * sin + dy * cos) * k;
        this.follow = null;
      } else { // right: orbit
        this.yawGoal -= dx * 0.005;
        this.pitchGoal = THREE.MathUtils.clamp(this.pitchGoal - dy * 0.004, this.minPitch, this.maxPitch);
      }
    });
    d.addEventListener('pointerup', (e) => { this._drag = null; try { d.releasePointerCapture(e.pointerId); } catch { /* */ } });
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._focusBeat = null;
      const k = 1 + Math.sign(e.deltaY) * 0.11;
      const newDist = THREE.MathUtils.clamp(this.distGoal * k, this.minDist, this.maxDist);
      // zoom toward the cursor: shift the target a fraction of the way to the point under it
      if (newDist < this.distGoal && this.groundPointAt) {
        const pt = this.groundPointAt(e.clientX, e.clientY);
        if (pt) {
          const f = 1 - newDist / this.distGoal;
          this.targetGoal.lerp(new THREE.Vector3(pt.x, 0, pt.z), f * 0.85);
          this.follow = null;
        }
      }
      this.distGoal = newDist;
    }, { passive: false });
  }

  // cinematic fly-in: sweep from `from` to the home view over `dur` seconds
  flyIn(from, dur = 4.5) {
    if (settings.get('reducedMotion')) { this.reset(); return; }
    this._focusBeat = null;
    this._fly = {
      t: 0, dur,
      fromTarget: from.clone(),
      fromYaw: this.home.yaw + Math.PI * 0.85,
      fromPitch: 0.42,
      fromDist: 34,
    };
    this.target.copy(from);
    this.targetGoal.copy(from);
    this.yaw = this.yawGoal = this._fly.fromYaw;
    this.pitch = this.pitchGoal = this._fly.fromPitch;
    this.dist = this.distGoal = this._fly.fromDist;
  }

  update(rawDt) {
    // cinematic fly-in overrides input until done
    if (this._fly) {
      const f = this._fly;
      f.t += rawDt;
      const k = Math.min(1, f.t / f.dur);
      const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
      this.target.lerpVectors(f.fromTarget, this.home.target, e);
      this.targetGoal.copy(this.target);
      this.yaw = this.yawGoal = f.fromYaw + (this.home.yaw - f.fromYaw) * e;
      this.pitch = this.pitchGoal = f.fromPitch + (this.home.pitch - f.fromPitch) * e;
      this.dist = this.distGoal = f.fromDist + (this.home.dist - f.fromDist) * e;
      if (k >= 1) this._fly = null;
      this._apply();
      return;
    }
    // keyboard pan with inertia
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = 0, mz = 0;
    if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) { mx += sin; mz -= cos; }
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) { mx -= sin; mz += cos; }
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) { mx -= cos; mz -= sin; }
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) { mx += cos; mz += sin; }
    this._vel = this._vel || new THREE.Vector3();
    if (mx || mz) {
      const accel = this.dist * 4.2 * rawDt;
      this._vel.x += mx * accel; this._vel.z += mz * accel;
      this.follow = null;
    }
    const maxV = this.dist * 1.1;
    this._vel.clampLength(0, maxV);
    if (this._vel.lengthSq() > 0.0001) {
      this.targetGoal.x += this._vel.x * rawDt;
      this.targetGoal.z += this._vel.z * rawDt;
      this._vel.multiplyScalar(Math.pow(0.002, rawDt)); // smooth glide stop
    }
    if (this._keys.has('KeyQ')) this.yawGoal += 1.6 * rawDt;
    if (this._keys.has('KeyE')) this.yawGoal -= 1.6 * rawDt;

    if (this.follow && this.follow.alive !== false) {
      this.targetGoal.copy(this.follow.group.position);
    } else if (this.follow) this.follow = null;

    this.targetGoal.x = THREE.MathUtils.clamp(this.targetGoal.x, this.bounds.minX, this.bounds.maxX);
    this.targetGoal.z = THREE.MathUtils.clamp(this.targetGoal.z, this.bounds.minZ, this.bounds.maxZ);

    // smooth easing (snappier when reduced motion)
    const ease = settings.get('reducedMotion') ? 1 : 1 - Math.pow(0.0001, rawDt);
    this.target.lerp(this.targetGoal, ease);
    this.yaw += (this.yawGoal - this.yaw) * ease;
    this.pitch += (this.pitchGoal - this.pitch) * ease;
    this.dist += (this.distGoal - this.dist) * ease;

    this._apply(this._focusView(rawDt));
  }

  _focusView(rawDt) {
    const beat = this._focusBeat;
    if (!beat) return null;
    beat.t += rawDt;
    const t = Math.min(beat.t, beat.dur);
    const attack = Math.max(0.08, Math.min(0.24, beat.dur * 0.22));
    const release = Math.max(0.12, Math.min(0.42, beat.dur * 0.34));
    let fade = 1;
    if (t < attack) {
      const k = THREE.MathUtils.clamp(t / attack, 0, 1);
      fade = k * k * (3 - 2 * k);
    } else if (t > beat.dur - release) {
      const k = THREE.MathUtils.clamp((beat.dur - t) / release, 0, 1);
      fade = k * k * (3 - 2 * k);
    }
    const w = beat.strength * fade;
    this._focusViewTarget.copy(this.target).lerp(beat.point, w);
    const view = {
      target: this._focusViewTarget,
      yaw: this.yaw + beat.yawOffset * w,
      pitch: beat.pitch == null ? this.pitch : THREE.MathUtils.lerp(this.pitch, beat.pitch, w),
      dist: THREE.MathUtils.lerp(this.dist, beat.dist, w),
    };
    if (beat.t >= beat.dur) this._focusBeat = null;
    return view;
  }

  _apply(view = null) {
    const target = view?.target || this.target;
    const yaw = view?.yaw ?? this.yaw;
    const pitch = view?.pitch ?? this.pitch;
    const dist = view?.dist ?? this.dist;
    const y = Math.sin(pitch) * dist;
    const r = Math.cos(pitch) * dist;
    this.camera.position.set(
      target.x + Math.sin(yaw) * r,
      target.y + y,
      target.z + Math.cos(yaw) * r,
    );
    this.camera.lookAt(target.x, target.y + 2, target.z);
  }
}
