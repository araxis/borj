import * as THREE from 'three';
import { MATS } from '../models/materials.js';
import { animateBanner, makeBanner, makeFlame } from '../models/towerkit.js';
import { settings } from '../core/settings.js';

function lineMat(color, opacity) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

function glowMat(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function orientToward(obj, dir) {
  obj.rotation.y = Math.atan2(dir.x, dir.z);
}

export class PalaceGateStage {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.group = new THREE.Group();
    this.group.name = 'palace-gate-last-stand-stage';
    this.group.renderOrder = 6;
    this.banners = [];
    this.flames = [];
    this.beacons = [];
    this.alarmItems = [];
    this.dynamicMats = [];
    this.customMats = [];
    this.frontLine = null;
    this.alarmT = 0;
    this.alarmDur = 0;
    this.alarmPulseT = 0;
    this.pressure = 0;
    this.ready = false;
    scene.add(this.group);
  }

  rebuild({ cit, front, keep, dir }) {
    this.clear();
    if (!cit || !front || !keep || !dir) return;
    const mats = MATS();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const inward = keep.clone().sub(front);
    if (inward.lengthSq() < 0.01) inward.copy(dir).multiplyScalar(-1); else inward.normalize();
    const y = front.y + 0.08;
    const width = Math.max(8, Math.min(16, (cit.footprint || 14) * 0.92));
    this.frontLine = { front: front.clone(), side: side.clone(), width };

    this._threshold(front, side, inward, width, y);
    this._bannerLine(front, side, inward, width, y);
    this._shieldLine(front, side, inward, width, y, mats);
    this._braziers(front, side, inward, width, y, mats);

    this.ready = true;
  }

  _threshold(front, side, inward, width, y) {
    const gold = lineMat(0xffd26a, 0.62);
    const sacred = lineMat(0x7fe7ff, 0.24);
    this.customMats.push(gold, sacred);
    this.dynamicMats.push({ mat: gold, base: 0.46, amp: 0.4, speed: 3.2 });
    this.dynamicMats.push({ mat: sacred, base: 0.14, amp: 0.32, speed: 2.0 });

    const a = front.clone().addScaledVector(side, -width * 0.58).setY(y + 0.07);
    const b = front.clone().addScaledVector(side, width * 0.58).setY(y + 0.07);
    const c = a.clone().addScaledVector(inward, 1.4);
    const d = b.clone().addScaledVector(inward, 1.4);
    const threshold = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), gold);
    const rear = new THREE.Line(new THREE.BufferGeometry().setFromPoints([c, d]), sacred);
    threshold.renderOrder = 36;
    rear.renderOrder = 35;
    this.group.add(threshold, rear);

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1.0, 128), glowMat(0xffd26a, 0.22));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(front).addScaledVector(inward, 0.7).setY(y + 0.05);
    ring.scale.setScalar(width * 0.5);
    ring.renderOrder = 34;
    this.customMats.push(ring.material);
    this.dynamicMats.push({ mat: ring.material, base: 0.08, amp: 0.24, speed: 2.5 });
    this.group.add(ring);
  }

  _bannerLine(front, side, inward, width, y) {
    const colors = ['clothRed', 'clothGold', 'clothTeal', 'clothWhite'];
    const offsets = [-0.62, -0.34, 0.34, 0.62];
    offsets.forEach((off, i) => {
      const banner = makeBanner(colors[i], i % 2 ? 0.9 : 1.05, i % 2 ? 1.55 : 1.85, i % 2 ? 3.3 : 3.75);
      banner.position.copy(front)
        .addScaledVector(side, off * width)
        .addScaledVector(inward, i < 2 ? 2.7 : 3.45);
      banner.position.y = this.map.heightAt(banner.position.x, banner.position.z);
      orientToward(banner, inward);
      banner.userData.stageStrength = i % 2 ? 0.85 : 1.1;
      this.banners.push(banner);
      this.group.add(banner);
    });
  }

  _shieldLine(front, side, inward, width, y, mats) {
    const shieldGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 14);
    const spearGeo = new THREE.CylinderGeometry(0.025, 0.032, 1.85, 5);
    const tipGeo = new THREE.ConeGeometry(0.075, 0.22, 6);
    shieldGeo.userData.stageOwned = true;
    spearGeo.userData.stageOwned = true;
    tipGeo.userData.stageOwned = true;
    const count = 9;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const lane = (t - 0.5) * width * 0.95;
      const row = Math.abs(t - 0.5) * 1.1;
      const p = front.clone().addScaledVector(side, lane).addScaledVector(inward, 0.85 + row);
      p.y = this.map.heightAt(p.x, p.z);
      const shield = new THREE.Mesh(shieldGeo.clone(), i % 3 === 0 ? mats.bronze : mats.iron);
      shield.position.copy(p).setY(p.y + 0.62);
      shield.rotation.x = Math.PI / 2;
      orientToward(shield, inward);
      shield.castShadow = true;
      this.group.add(shield);

      const spear = new THREE.Mesh(spearGeo.clone(), mats.woodDark);
      spear.position.copy(p).addScaledVector(inward, 0.18).setY(p.y + 1.25);
      spear.rotation.z = (i % 2 ? -0.18 : 0.18);
      this.group.add(spear);

      const tip = new THREE.Mesh(tipGeo.clone(), mats.iron);
      tip.position.copy(spear.position).setY(p.y + 2.28);
      tip.rotation.z = spear.rotation.z;
      this.group.add(tip);
    }
    shieldGeo.dispose();
    spearGeo.dispose();
    tipGeo.dispose();
  }

  _braziers(front, side, inward, width, y, mats) {
    for (const sign of [-1, 1]) {
      const p = front.clone().addScaledVector(side, sign * width * 0.72).addScaledVector(inward, 1.2);
      p.y = this.map.heightAt(p.x, p.z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.54, 0.5, 12), mats.bronze);
      base.position.copy(p).setY(p.y + 0.25);
      base.castShadow = true;
      this.group.add(base);

      const flame = makeFlame(0.9);
      flame.position.copy(p).setY(p.y + 0.48);
      this.flames.push(flame);
      this.group.add(flame);

      const beacon = new THREE.Mesh(new THREE.RingGeometry(0.58, 1.15, 72), glowMat(0xffb64a, 0));
      beacon.rotation.x = -Math.PI / 2;
      beacon.position.copy(p).setY(p.y + 0.63);
      beacon.renderOrder = 38;
      this.beacons.push(beacon);
      this.customMats.push(beacon.material);
      this.dynamicMats.push({ mat: beacon.material, base: 0, amp: 0.55, speed: 4.1 });
      this.group.add(beacon);
    }
  }

  setPressure(v) {
    this.pressure = Math.max(0, Math.min(1, v || 0));
  }

  signalAlarm({ front = null, keep = null, dir = null, pressure = 1, dur = 3.8 } = {}) {
    const anchor = front?.clone?.() || this.frontLine?.front?.clone?.();
    if (!anchor) return;
    const out = dir?.clone?.() || new THREE.Vector3(0, 0, -1);
    if (out.lengthSq() < 0.01) out.set(0, 0, -1); else out.normalize();
    const side = new THREE.Vector3(-out.z, 0, out.x).normalize();
    const inward = keep?.clone?.().sub(anchor) || out.clone().multiplyScalar(-1);
    if (inward.lengthSq() < 0.01) inward.copy(out).multiplyScalar(-1); else inward.normalize();
    const width = Math.max(8, Math.min(17, this.frontLine?.width || 12));
    const p = Math.max(0.2, Math.min(1, pressure || 0.8));
    const life = Math.max(1.2, dur || 3.8);

    this._clearAlarm();
    this.alarmT = life;
    this.alarmDur = life;
    this.alarmPulseT = 0;
    this.setPressure(Math.max(this.pressure, p * 0.72));

    const mats = MATS();
    const colors = [0x9f2f24, 0xffd26a, 0x2c8f8a];
    const offsets = [-0.48, 0, 0.48];
    for (let i = 0; i < offsets.length; i++) {
      const group = new THREE.Group();
      const base = anchor.clone()
        .addScaledVector(side, offsets[i] * width)
        .addScaledVector(inward, 0.65 + Math.abs(offsets[i]) * 1.2);
      base.y = this.map.heightAt(base.x, base.z);
      group.position.copy(base);
      orientToward(group, inward);

      const poleGeo = new THREE.CylinderGeometry(0.04, 0.05, 4.1 + p * 0.55, 6);
      const pole = new THREE.Mesh(poleGeo, mats.woodDark);
      pole.position.y = 2.1 + p * 0.24;
      pole.castShadow = true;
      group.add(pole);

      const clothGeo = new THREE.PlaneGeometry(1.35 + p * 0.28, 2.85 + p * 0.58, 1, 4);
      const clothMat = new THREE.MeshBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      const cloth = new THREE.Mesh(clothGeo, clothMat);
      cloth.position.set(0.62, 3.1 + p * 0.32, 0.04);
      cloth.renderOrder = 44;
      group.add(cloth);

      const spearGeo = new THREE.ConeGeometry(0.12, 0.32, 6);
      const spear = new THREE.Mesh(spearGeo, mats.gold);
      spear.position.y = 4.22 + p * 0.55;
      group.add(spear);

      this.group.add(group);
      this.alarmItems.push({
        group,
        cloth,
        clothMat,
        geos: [poleGeo, clothGeo, spearGeo],
        baseY: group.position.y,
        phase: i * 1.7,
        baseOpacity: 0.6 + p * 0.12,
        kind: 'standard',
      });
    }

    const ringGeo = new THREE.RingGeometry(0.94, 1.0, 128);
    const ringMat = glowMat(0xffd26a, 0);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(anchor).addScaledVector(inward, 0.55).setY(anchor.y + 0.12);
    ring.renderOrder = 43;
    this.group.add(ring);
    this.alarmItems.push({
      group: ring,
      clothMat: ringMat,
      geos: [ringGeo],
      baseY: ring.position.y,
      phase: 0,
      baseOpacity: 0.08 + p * 0.08,
      kind: 'ring',
      width,
      pressure: p,
    });
  }

  update(dt, time, particles = null) {
    if (!this.ready) return;
    const reduced = settings.get('reducedMotion');
    const p = this.pressure;
    if (this.alarmT > 0) {
      this.alarmT = Math.max(0, this.alarmT - dt);
      this.alarmPulseT = Math.max(0, this.alarmPulseT - dt);
      const k = Math.max(0, Math.min(1, this.alarmT / Math.max(0.001, this.alarmDur || 1)));
      const appear = Math.min(1, (1 - k) * 4.2);
      for (const item of this.alarmItems) {
        const pulse = 0.7 + Math.sin(time * 7.5 + item.phase) * 0.3;
        if (item.kind === 'standard') {
          item.group.position.y = item.baseY + Math.sin(time * 2.6 + item.phase) * 0.12;
          item.cloth.scale.x = 1 + Math.sin(time * 5.2 + item.phase) * 0.12;
          item.clothMat.opacity = item.baseOpacity * appear * k * pulse;
        } else if (item.kind === 'ring') {
          item.group.scale.setScalar((item.width || 10) * (0.14 + (1 - k) * 0.18 + (item.pressure || 0.8) * 0.06));
          item.clothMat.opacity = item.baseOpacity * appear * k * pulse;
        }
      }
      if (!reduced && particles && this.alarmPulseT <= 0 && this.frontLine) {
        this.alarmPulseT = 0.16;
        const off = (Math.random() - 0.5) * this.frontLine.width * 1.05;
        const wp = this.frontLine.front.clone().addScaledVector(this.frontLine.side, off);
        wp.y = this.map.heightAt(wp.x, wp.z) + 0.6;
        particles.spawn(
          wp.x, wp.y, wp.z,
          (Math.random() - 0.5) * 0.55,
          1.2 + Math.random() * 0.9,
          (Math.random() - 0.5) * 0.55,
          0.55 + Math.random() * 0.45,
          0.14,
          1.0, 0.76, 0.3,
          -0.45, 0.45,
        );
      }
      if (this.alarmT <= 0) this._clearAlarm();
    }
    for (const banner of this.banners) {
      animateBanner(banner, time + banner.position.x * 0.04, reduced ? 0.18 : (0.35 + p * 0.85) * (banner.userData.stageStrength || 1));
    }
    for (const item of this.dynamicMats) {
      const pulse = 0.5 + Math.sin(time * item.speed) * 0.5;
      item.mat.opacity = item.base + item.amp * (p * 0.45 + pulse * 0.2);
    }
    for (let i = 0; i < this.beacons.length; i++) {
      const pulse = 0.5 + Math.sin(time * 4.6 + i * Math.PI) * 0.5;
      this.beacons[i].scale.setScalar(0.75 + p * 0.85 + pulse * 0.22);
    }
    if (!particles || reduced || p <= 0.05) return;
    if (this.frontLine && p > 0.22 && Math.random() < dt * (1.4 + p * 5.8)) {
      const off = (Math.random() - 0.5) * this.frontLine.width * 1.1;
      const wp = this.frontLine.front.clone().addScaledVector(this.frontLine.side, off);
      wp.y = this.map.heightAt(wp.x, wp.z) + 0.35;
      particles.spawn(
        wp.x,
        wp.y,
        wp.z,
        (Math.random() - 0.5) * 0.45,
        1.0 + Math.random() * 0.7 + p * 0.6,
        (Math.random() - 0.5) * 0.45,
        0.65 + Math.random() * 0.55,
        0.08 + p * 0.05,
        p > 0.62 ? 1.0 : 0.55,
        0.82,
        p > 0.62 ? 0.36 : 1.0,
        -0.55,
        0.5,
      );
    }
    for (const flame of this.flames) {
      if (Math.random() < dt * (2.5 + p * 8)) {
        const wp = new THREE.Vector3();
        flame.getWorldPosition(wp);
        particles.spawn(
          wp.x + (Math.random() - 0.5) * 0.28,
          wp.y + 0.7,
          wp.z + (Math.random() - 0.5) * 0.28,
          (Math.random() - 0.5) * 0.35,
          1.25 + Math.random() * 0.8 + p * 0.45,
          (Math.random() - 0.5) * 0.35,
          0.8 + Math.random() * 0.5,
          0.1 + p * 0.05,
          1.0, 0.78, 0.34,
          -0.8, 0.6,
        );
      }
    }
  }

  clear() {
    this.ready = false;
    this._clearAlarm();
    this.banners.length = 0;
    this.flames.length = 0;
    this.beacons.length = 0;
    this.dynamicMats.length = 0;
    this.frontLine = null;
    for (const mat of this.customMats) mat.dispose();
    this.customMats.length = 0;
    this.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
    });
    while (this.group.children.length) this.group.remove(this.group.children[0]);
  }

  _clearAlarm() {
    for (const item of this.alarmItems) {
      this.group.remove(item.group);
      for (const geo of item.geos || []) geo.dispose();
      item.clothMat?.dispose?.();
    }
    this.alarmItems.length = 0;
    this.alarmT = 0;
    this.alarmDur = 0;
    this.alarmPulseT = 0;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
