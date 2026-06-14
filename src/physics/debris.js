// Debris physics — purpose-built rigid-chunk simulator for destruction:
// gravity, terrain collision via heightAt, bounce with energy loss, tumble,
// sleep + sink-fade removal. Far cheaper and more controllable than a full
// physics engine, and deterministic enough for a TD (see design-decisions.md).
import * as THREE from 'three';
import { settings } from '../core/settings.js';

const CHUNK_GEOS = [
  new THREE.BoxGeometry(0.5, 0.4, 0.45),
  new THREE.BoxGeometry(0.7, 0.3, 0.4),
  new THREE.BoxGeometry(0.35, 0.55, 0.35),
  new THREE.DodecahedronGeometry(0.3, 0),
  new THREE.TetrahedronGeometry(0.38, 0),
];

export class DebrisSystem {
  constructor(scene, heightAt) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.chunks = [];
    this.maxChunks = 140;
  }

  setHeightFn(fn) { this.heightAt = fn; }

  // burst of chunks from a structure at position p, using the structure's materials
  explode(p, materials, count = 10, power = 1) {
    const cap = settings.get('quality') === 'low' ? 0.5 : 1;
    count = Math.round(count * cap);
    for (let i = 0; i < count; i++) {
      if (this.chunks.length >= this.maxChunks) {
        const old = this.chunks.shift();
        this.scene.remove(old.mesh);
      }
      const geo = CHUNK_GEOS[Math.floor(Math.random() * CHUNK_GEOS.length)];
      const mat = materials[Math.floor(Math.random() * materials.length)];
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.8;
      mesh.position.set(p.x + Math.cos(a) * r, p.y + Math.random() * 1.2, p.z + Math.sin(a) * r);
      const s = 0.5 + Math.random() * 0.9;
      mesh.scale.setScalar(s);
      this.scene.add(mesh);
      this.chunks.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 3.5) * power, (3 + Math.random() * 4) * power, Math.sin(a) * (2 + Math.random() * 3.5) * power),
        angVel: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
        bounces: 0,
        sleep: 0,
        life: 6 + Math.random() * 3,
      });
    }
  }

  // collapse: drop an entire mesh layer with physics (staged tower destruction)
  dropLayer(layerGroup, origin, power = 1) {
    // detach and give the whole layer a single rigid motion (cheap, dramatic)
    const world = new THREE.Vector3();
    layerGroup.getWorldPosition(world);
    layerGroup.removeFromParent();
    layerGroup.position.copy(world);
    this.scene.add(layerGroup);
    this.chunks.push({
      mesh: layerGroup,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2 * power, 1.5 * power, (Math.random() - 0.5) * 2 * power),
      angVel: new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 1.6),
      bounces: 0, sleep: 0, life: 7, isLayer: true, baseY: origin?.y ?? world.y,
    });
  }

  update(dt) {
    if (dt <= 0) return;
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        if (!c.isLayer) { /* shared geo/mat — nothing to dispose */ }
        this.chunks.splice(i, 1);
        continue;
      }
      if (c.sleep > 2) {
        // sink + fade away
        c.mesh.position.y -= dt * 0.25;
        continue;
      }
      c.vel.y -= 14 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.angVel.x * dt;
      c.mesh.rotation.y += c.angVel.y * dt;
      c.mesh.rotation.z += c.angVel.z * dt;
      const ground = (this.heightAt ? this.heightAt(c.mesh.position.x, c.mesh.position.z) : 0) + 0.2;
      if (c.mesh.position.y < ground) {
        c.mesh.position.y = ground;
        if (Math.abs(c.vel.y) < 1.2 || c.bounces > 3) {
          c.vel.set(0, 0, 0);
          c.angVel.multiplyScalar(0.2);
          c.sleep += dt + 1.2;
        } else {
          c.vel.y = -c.vel.y * 0.38;            // restitution
          c.vel.x *= 0.6; c.vel.z *= 0.6;       // friction
          c.angVel.multiplyScalar(0.55);
          c.bounces++;
          if (this.onBounce) this.onBounce(c.mesh.position, c.isLayer);
        }
      }
    }
  }

  clear() {
    for (const c of this.chunks) this.scene.remove(c.mesh);
    this.chunks.length = 0;
  }
}
