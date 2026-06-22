// Enemy entity — path following, armor/resist damage model, status effects,
// melee vs blocking soldiers, siege strikes vs towers, per-def special abilities,
// boss presence, procedural animation, health bar.
import * as THREE from 'three';
import { buildEnemyModel, animQuad, animSerpent, animShoulderSerpents } from '../models/creature.js';
import { animWalk, animAttack } from '../models/humanoid.js';
import { pointAt } from '../world/road.js';
import { FXC } from '../fx/particles.js';
import { settings } from '../core/settings.js';

const barGeo = new THREE.PlaneGeometry(1.2, 0.13);
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.75, depthWrite: false });
const barFgMat = new THREE.MeshBasicMaterial({ color: 0xc23b2a, depthWrite: false });
const barBossMat = new THREE.MeshBasicMaterial({ color: 0xe0b13e, depthWrite: false });
const telegraphRingGeo = new THREE.RingGeometry(0.92, 1.0, 112);
const telegraphCoreGeo = new THREE.CircleGeometry(1, 96);

const TELEGRAPH_HEX = {
  fireBreath: 0xff6b24,
  caveSlam: 0xd9b45d,
  siegeStrike: 0xd9b45d,
  rampage: 0xc23b2a,
  windLift: 0x8fd9ff,
  serpentFeed: 0x8fd36a,
  spawnLarvae: 0x7fbf42,
  guard: 0xe0b13e,
  phaseShift: 0x6d5aa8,
  blindingFog: 0xdce8ef,
  hiddenPit: 0x82684a,
  burrow: 0x82684a,
  charmTower: 0x7c5bd6,
  lassoBreak: 0xb8bcc8,
  falseTrail: 0x4e3d62,
  banner: 0xe0b13e,
  melee: 0xd9b45d,
  gateLine: 0xe0b13e,
  gateStagger: 0xff715c,
};

let nextId = 1;

// Runtime HP scale — ledger hp values are relative weight classes; this converts them
// to killable battle hp against tower DPS. Bosses keep more weight to feel epic.
export const HP_SCALE = 0.26;
export const BOSS_HP_SCALE = 0.38;

export class Enemy {
  constructor(game, def, pathIndex, hpMult = 1, isLarva = false, opts = {}) {
    this.id = nextId++;
    this.game = game;
    this.def = def;
    this.pathIndex = pathIndex;
    this.path = game.map.paths[pathIndex];
    this.dist = 0;
    this.alive = true;
    this.reachedEnd = false;
    this.boss = !!def.boss || !!opts.forceBoss;
    this.isLarva = isLarva;
    this.maxHp = def.hp * (this.boss ? BOSS_HP_SCALE : HP_SCALE) * hpMult * (isLarva ? 0.25 : 1) * (game.diffHpMult || 1);
    this.hp = this.maxHp;
    // random wave modifier (game.waveMod): tweak armor + speed at spawn (hp already folded into hpMult)
    const wmod = game.waveMod;
    this.armor = Math.min(0.95, def.armor + (wmod?.armorAdd || 0));
    this.resist = def.resist;
    this.baseSpeed = def.speed * (wmod?.speedMult || 1);
    this.flying = !!def.flying;
    // statuses
    this.slows = [];      // {factor, t}
    this.burns = [];      // {dps, t}
    this.bindT = 0;
    this.markT = 0; this.markBonus = 0;
    this.untargetableT = 0;
    this.stunT = 0;
    this.blockedBy = null;       // soldier engaging us
    this.meleeCd = 0;
    this.siegeCd = 3;
    this.deadT = 0;
    this.dmgFlash = 0;
    this.hitReactT = 0;
    this.hitReactDur = 0.12;
    this.hitReactPower = 0;
    this.hitReactSide = 1;
    this.hitReactKind = 'arrow';
    this._hitFxCd = 0;
    this._gateLineReactCd = 0;
    this.gateReadT = 0;
    this.gateRecoilT = 0;
    this.gateRecoilDur = 0.24;
    this.gateRecoilPower = 0;
    this.telegraphs = [];
    this.abilityBeams = [];
    this._meleeWindupT = 0;
    this._meleeWindupPrimed = false;
    this._siegeWarned = false;
    // ability state
    this.abilityT = {};
    this.buffSpeed = 1; this.buffDamage = 1; this.shieldNext = def.abilities?.includes('shieldedMarch') ? 1 : 0;
    this.guiseBroken = !def.abilities?.includes('falseGuise');
    this.wrathStacks = 0;
    this.prophecyUsed = false;
    this.fogBrokenT = 0;
    this.siegeSilencedT = 0;
    this.broodSilencedT = 0;
    this.counselBrokenT = 0;
    this.feudBrokenT = 0;
    this.guardBrokenT = 0;

    this.model = buildEnemyModel(def.model);
    if (isLarva) this.model.group.scale.multiplyScalar(0.45);
    this.group = new THREE.Group();
    this.visual = new THREE.Group();
    this.visual.add(this.model.group);
    this.group.add(this.visual);
    // generous click target: never rendered (colorWrite off) but raycastable
    const proxyH = (this.model.headH || 1.7) * (isLarva ? 0.5 : 1) + 0.5;
    const proxyR = Math.max(0.9, proxyH * 0.4);
    this.pickProxy = new THREE.Mesh(
      new THREE.CylinderGeometry(proxyR, proxyR, proxyH, 6),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true }),
    );
    this.pickProxy.position.y = proxyH / 2;
    this.pickProxy.userData.enemy = this;
    this.group.add(this.pickProxy);
    // lane offset so columns don't perfectly overlap
    this.laneOffset = (Math.random() - 0.5) * 2.2;
    game.scene.add(this.group);

    // health bar
    this.bar = new THREE.Group();
    const bg = new THREE.Mesh(barGeo, barBgMat);
    this.barFg = new THREE.Mesh(barGeo, this.boss ? barBossMat : barFgMat);
    this.barFg.position.z = 0.01;
    this.bar.add(bg, this.barFg);
    this.bar.position.y = (this.model.headH || 1.7) + 0.6;
    if (this.boss) this.bar.scale.setScalar(1.8);
    this.group.add(this.bar);

    this.meleeDamage = Math.max(6, def.bounty * 0.5) * (this.boss ? 2 : 1);
    this.siegeCapable = this.boss || def.class === 'beast' || def.class === 'div';
  }

  get speed() {
    if (this.bindT > 0 || this.stunT > 0) return 0;
    let s = this.baseSpeed * this.buffSpeed;
    let slowF = 1;
    for (const sl of this.slows) slowF = Math.min(slowF, sl.factor);
    // dynasticBanner aura: slow immunity
    if (this.game.hasAura?.('dynasticBanner', this.group.position) && this.def.class === 'human') slowF = Math.max(slowF, 0.85);
    return s * slowF;
  }

  takeDamage(amount, dmgType = 'arrow', opts = {}) {
    if (!this.alive) return false;
    if (this.untargetableT > 0) return false;
    if (this.shieldNext > 0 && dmgType !== 'true') { this.shieldNext--; return false; }
    const prevHp = this.hp;
    let dmg = amount;
    // armor/resist model
    if (dmgType === 'arrow') {
      let armor = this.armor;
      if (this.def.abilities?.includes('ironSkin')) armor = Math.min(0.9, armor + 0.2);
      dmg *= 1 - Math.max(0, armor - (opts.armorShred || 0));
    } else if (dmgType === 'impact') {
      dmg *= 1 - this.armor * 0.45;
    } else if (dmgType === 'fire' || dmgType === 'magic') {
      dmg *= 1 - this.resist;
    }
    // marks
    if (this.markT > 0) dmg *= 1 + this.markBonus;
    // jealousVeil: Salm resists while Tur alive
    if (this.def.id === 'salm' && this.feudBrokenT <= 0 && this.game.enemies.some((e) => e.alive && e.def.id === 'tur')) dmg *= 0.6;
    this.hp -= dmg;
    this.dmgFlash = Math.max(this.dmgFlash, 0.12);
    this._registerHitReaction(dmg, dmgType, opts);
    if (!this.guiseBroken) { this.guiseBroken = true; this.buffSpeed *= 1.6; }
    this._checkWoundBeat(prevHp, dmgType);
    if (this.hp <= 0) { this.die(); return true; }
    // prophecyDread: teleport once at low hp
    if (!this.prophecyUsed && this.def.abilities?.includes('prophecyDread') && this.hp < this.maxHp * 0.25) {
      this.prophecyUsed = true;
      this.dist = Math.min(this.path.length - 2, this.dist + 9);
      this.untargetableT = 0.8;
      this.game.particles.burst(this.group.position, 18, { speed: 3, life: 0.8, size: 0.5, color: FXC.shadow, grav: 0.5 });
    }
    return false;
  }

  applySlow(factor, dur) { this.slows.push({ factor, t: dur }); }
  applyBurn(dps, dur) { this.burns.push({ dps, t: dur }); }
  applyBind(dur) {
    // big bosses resist some bind duration
    this.bindT = Math.max(this.bindT, this.boss ? dur * 0.5 : dur);
  }
  applyMark(bonus, dur) { this.markT = Math.max(this.markT, dur); this.markBonus = Math.max(this.markBonus, bonus); }

  reactGateLine(anchor, dir = null, power = 1) {
    if (!this.alive || this.flying || this.untargetableT > 0) return;
    if ((this._gateLineReactCd || 0) > 0) return;
    const p = this.group.position;
    const force = Math.max(0.25, Math.min(1.8, power));
    this._gateLineReactCd = this.boss ? 0.72 : 0.38;
    this.gateReadT = Math.max(this.gateReadT || 0, this.boss ? 0.7 : 0.95);
    this.gateRecoilDur = Math.max(this.gateRecoilDur || 0, this.boss ? 0.28 : 0.38);
    this.gateRecoilPower = Math.max(this.gateRecoilPower || 0, this.boss ? 0.82 * force : 1.42 * force);
    this.gateRecoilT = Math.max(this.gateRecoilT || 0, this.gateRecoilDur);
    this.applySlow(this.boss ? 0.82 : 0.62, this.boss ? 0.55 : 0.95);
    this.dmgFlash = Math.max(this.dmgFlash, 0.16);
    this.hitReactDur = Math.max(this.hitReactDur, this.boss ? 0.24 : 0.32);
    this.hitReactPower = Math.max(this.hitReactPower, this.boss ? 0.92 * force : 1.34 * force);
    this.hitReactT = Math.max(this.hitReactT, this.hitReactDur);
    this.hitReactKind = 'impact';
    if (dir?.lengthSq?.() > 0.01) {
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const off = p.clone().sub(anchor || p);
      this.hitReactSide = off.dot(side) < 0 ? -1 : 1;
      this.dist = Math.max(0, this.dist - (this.boss ? 0.18 : 0.48) * force);
    } else {
      this.hitReactSide = Math.random() < 0.5 ? -1 : 1;
    }
    const head = this.model.headH || 1.7;
    if (!settings.get('reducedMotion')) {
      this._showTelegraph('gateLine', this, { radius: this.boss ? 3.1 : 2.1, life: 0.48, followSelf: true, burst: false });
      this._showTelegraph('gateStagger', this, {
        radius: this.boss ? 3.55 : 2.45,
        life: this.boss ? 0.62 : 0.5,
        followSelf: true,
        burstCount: this.boss ? 7 : 5,
      });
      if (anchor) this._addAbilityBeam('gateLine', anchor, p, { life: 0.34, fromY: 0.32, toY: head * 0.48, opacity: 0.48 });
      if (anchor) {
        const side = dir?.lengthSq?.() > 0.01 ? new THREE.Vector3(-dir.z, 0, dir.x).normalize() : new THREE.Vector3(1, 0, 0);
        const a = p.clone().addScaledVector(side, this.boss ? 1.0 : 0.65);
        const b = p.clone().addScaledVector(side, this.boss ? -1.0 : -0.65);
        this._addAbilityBeam('gateStagger', anchor, a, { life: 0.26, fromY: 0.36, toY: head * 0.62, opacity: 0.5 });
        this._addAbilityBeam('gateStagger', anchor, b, { life: 0.26, fromY: 0.36, toY: head * 0.42, opacity: 0.38 });
      }
    }
    this.game.particles.burst(p.clone().setY(p.y + head * 0.46), this.boss ? 12 : 7, {
      speed: this.boss ? 2.8 : 2.1,
      up: this.boss ? 1.4 : 1.05,
      life: 0.42,
      size: this.boss ? 0.48 : 0.34,
      color: FXC.gold,
      grav: 2.5,
      spread: this.boss ? 1.4 : 0.9,
      drag: 1.2,
    });
    if ((this.game._lastGateLineAudio || -99) + 0.28 < (this.game._time || 0)) {
      this.game._lastGateLineAudio = this.game._time || 0;
      this.game.audio.clank?.();
    }
  }

  _isMajorThreat() {
    if (this.boss || (this.def?.bounty || 0) >= 80) return true;
    const ab = this.def?.abilities || [];
    return ab.includes('divRally') || ab.includes('rampage') || ab.includes('dynasticBanner')
      || ab.includes('banneredAdvance') || ab.includes('princelyWrath') || ab.includes('ironSkin')
      || ab.includes('jealousVeil') || ab.includes('feudFury');
  }

  _hitColor(dmgType) {
    if (dmgType === 'fire') return FXC.ember;
    if (dmgType === 'magic') return FXC.sacred;
    if (dmgType === 'true') return FXC.gold;
    if (dmgType === 'impact') return FXC.stone;
    if (this.def.class === 'div') return FXC.shadow;
    if (this.def.class === 'serpent') return FXC.venom;
    return FXC.spark;
  }

  _registerHitReaction(dmg, dmgType, opts = {}) {
    if (!Number.isFinite(dmg) || dmg <= 0) return;
    const hpRatio = Math.max(0, dmg / Math.max(1, this.maxHp));
    const major = this._isMajorThreat();
    const typed = dmgType === 'impact' ? 0.18 : dmgType === 'true' || dmgType === 'magic' || dmgType === 'fire' ? 0.12 : 0;
    const command = opts.command ? 0.28 : 0;
    const explicit = Number.isFinite(opts.impact) ? opts.impact : 0;
    const power = Math.min(this.boss ? 1.15 : 1.75, 0.18 + typed + command + explicit + Math.sqrt(hpRatio) * (major ? 2.7 : 1.8));
    const dur = opts.command ? 0.26 : dmgType === 'impact' ? 0.2 : 0.14;
    if (this.hitReactT <= 0 || power >= this.hitReactPower || dur > this.hitReactDur) this.hitReactDur = dur;
    this.hitReactPower = Math.max(this.hitReactPower, power);
    this.hitReactT = Math.max(this.hitReactT, this.hitReactDur);
    this.hitReactSide = Math.random() < 0.5 ? -1 : 1;
    this.hitReactKind = dmgType;

    const heavy = opts.command || explicit >= 0.75 || dmgType === 'impact' || (major && hpRatio > 0.035);
    if (heavy && (this._hitFxCd || 0) <= 0) {
      this._hitFxCd = opts.command ? 0.05 : 0.12;
      const p = this.group.position.clone().setY(this.group.position.y + (this.model.headH || 1.7) * 0.45);
      this.game.particles.burst(p, opts.command ? 12 : 7, {
        speed: opts.command ? 3.2 : 2.2,
        up: opts.command ? 1.7 : 1.1,
        life: 0.42,
        size: opts.command ? 0.42 : 0.32,
        color: this._hitColor(dmgType),
        grav: 3.6,
        spread: opts.command ? 1.4 : 0.8,
        drag: 1.5,
      });
    }
  }

  _checkWoundBeat(prevHp, dmgType) {
    if (!this._isMajorThreat() || prevHp <= 0 || this.hp <= 0) return;
    const before = Math.floor(Math.max(0, Math.min(0.999, prevHp / this.maxHp)) * 4);
    const after = Math.floor(Math.max(0, Math.min(0.999, this.hp / this.maxHp)) * 4);
    if (after >= before) return;
    const p = this.group.position.clone().setY(this.group.position.y + (this.model.headH || 1.7) * 0.58);
    const bossScale = this.boss ? 1.5 : 1;
    this.game.particles.burst(p, this.boss ? 22 : 13, {
      speed: 2.8 * bossScale,
      up: 1.6,
      life: 0.64,
      size: this.boss ? 0.54 : 0.42,
      color: this._hitColor(dmgType),
      grav: 2.4,
      spread: this.boss ? 2.0 : 1.25,
      drag: 1.0,
    });
    this.game.engine.addShake?.(this.boss ? 0.28 : 0.11);
    this.game.engine.bloomPulse?.(this.boss ? 0.45 : 0.24);
  }

  _updateHitReaction(dt) {
    this._hitFxCd = Math.max(0, (this._hitFxCd || 0) - dt);
    if (this.gateReadT > 0) this.gateReadT = Math.max(0, this.gateReadT - dt);
    if (this.gateRecoilT > 0) {
      this.gateRecoilT = Math.max(0, this.gateRecoilT - dt);
      if (this.gateRecoilT <= 0) this.gateRecoilPower = 0;
    }
    const v = this.visual;
    if (!v) return;
    const readK = Math.min(1, (this.gateReadT || 0) / (this.boss ? 0.7 : 0.95));
    const readScale = 1 + readK * (this.boss ? 0.14 : 0.3);
    const recoilK = this.gateRecoilT > 0 ? Math.max(0, Math.min(1, this.gateRecoilT / Math.max(0.001, this.gateRecoilDur || 0.001))) : 0;
    const recoil = Math.sin(recoilK * Math.PI) * Math.max(0, this.gateRecoilPower || 0);
    if (this.hitReactT > 0) {
      this.hitReactT = Math.max(0, this.hitReactT - dt);
      const k = this.hitReactDur > 0 ? this.hitReactT / this.hitReactDur : 0;
      const wave = Math.sin(Math.PI * k);
      const power = this.hitReactPower * wave;
      const bossDamp = this.boss ? 0.58 : 1;
      v.position.x = this.hitReactSide * 0.12 * power;
      v.position.y = 0.08 * power + 0.06 * recoil;
      v.position.z = -0.24 * power * bossDamp - 0.42 * recoil * bossDamp;
      v.rotation.x = -0.08 * power * bossDamp - 0.14 * recoil * bossDamp;
      v.rotation.z = this.hitReactSide * (0.07 * power + 0.05 * recoil);
      v.scale.set((1 + 0.045 * power + 0.035 * recoil) * readScale, (1 - 0.028 * power - 0.018 * recoil) * readScale, (1 + 0.035 * power + 0.045 * recoil) * readScale);
      if (this.hitReactT <= 0) this.hitReactPower = 0;
    } else if (recoil > 0) {
      const bossDamp = this.boss ? 0.58 : 1;
      v.position.set(0, 0.06 * recoil, -0.42 * recoil * bossDamp);
      v.rotation.set(-0.14 * recoil * bossDamp, 0, this.hitReactSide * 0.05 * recoil);
      v.scale.set((1 + 0.035 * recoil) * readScale, (1 - 0.018 * recoil) * readScale, (1 + 0.045 * recoil) * readScale);
    } else {
      v.position.set(0, 0, 0);
      v.rotation.set(0, 0, 0);
      v.scale.setScalar(readScale);
    }
  }

  _telegraphColor(kind) {
    return TELEGRAPH_HEX[kind] || TELEGRAPH_HEX.melee;
  }

  _telegraphFx(kind) {
    if (kind === 'fireBreath') return FXC.ember;
    if (kind === 'serpentFeed' || kind === 'spawnLarvae') return FXC.venom;
    if (kind === 'blindingFog') return FXC.snow;
    if (kind === 'phaseShift' || kind === 'charmTower' || kind === 'falseTrail') return FXC.shadow;
    if (kind === 'windLift') return FXC.sacred;
    if (kind === 'hiddenPit' || kind === 'burrow') return FXC.dust;
    if (kind === 'lassoBreak') return FXC.chain;
    if (kind === 'rampage' || kind === 'gateStagger') return FXC.blood;
    return FXC.gold;
  }

  _telegraphPosition(target) {
    if (!target) return this.group.position;
    if (target.alive === false) return null;
    if (target.isVector3) return target;
    if (target.pos?.isVector3) return target.pos;
    if (target.group?.position) return target.group.position;
    return this.group.position;
  }

  _showTelegraph(kind, target = this.group.position, opts = {}) {
    if (settings.get('reducedMotion')) return;
    const base = this._telegraphPosition(target);
    if (!base) return;
    const color = opts.color || this._telegraphColor(kind);
    const radius = opts.radius || 5;
    const life = opts.life || 0.85;
    const group = new THREE.Group();
    group.name = `enemy-telegraph-${kind}`;
    group.renderOrder = 36;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const fillMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const core = new THREE.Mesh(telegraphCoreGeo, fillMat);
    const ring = new THREE.Mesh(telegraphRingGeo, mat);
    core.rotation.x = -Math.PI / 2;
    ring.rotation.x = -Math.PI / 2;
    core.frustumCulled = false;
    ring.frustumCulled = false;
    group.add(core, ring);
    group.position.set(base.x, this.game.map.heightAt(base.x, base.z) + 0.09, base.z);
    this.game.scene.add(group);
    this.telegraphs.push({ kind, target: opts.followSelf ? this : target, group, ring, core, mat, fillMat, t: 0, life, radius, follow: !!opts.follow || !!opts.followSelf });

    if (opts.burst !== false) {
      this.game.particles.burst(group.position.clone().setY(group.position.y + 0.55), opts.burstCount || 4, {
        speed: 1.3,
        up: 0.9,
        life: 0.45,
        size: 0.34,
        color: this._telegraphFx(kind),
        grav: 0.8,
        spread: Math.min(2.2, radius * 0.25),
        drag: 1.0,
      });
    }
  }

  _abilityPoint(source, yOffset = 0) {
    const p = this._telegraphPosition(source);
    if (!p) return null;
    const y = Number.isFinite(p.y) ? p.y : this.game.map.heightAt(p.x, p.z);
    return new THREE.Vector3(p.x, y + yOffset, p.z);
  }

  _syncAbilityBeam(beam) {
    const from = this._abilityPoint(beam.from, beam.fromY);
    const to = this._abilityPoint(beam.to, beam.toY);
    if (!from || !to) return false;
    const a = beam.geo.attributes.position.array;
    a[0] = from.x; a[1] = from.y; a[2] = from.z;
    a[3] = to.x; a[4] = to.y; a[5] = to.z;
    beam.geo.attributes.position.needsUpdate = true;
    return true;
  }

  _addAbilityBeam(kind, from, to, opts = {}) {
    if (settings.get('reducedMotion')) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const mat = new THREE.LineBasicMaterial({
      color: opts.color || this._telegraphColor(kind),
      transparent: true,
      opacity: opts.opacity ?? 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(geo, mat);
    line.name = `enemy-ability-beam-${kind}`;
    line.renderOrder = 42;
    line.frustumCulled = false;
    const beam = {
      kind,
      from,
      to,
      fromY: opts.fromY ?? ((this.model.headH || 1.7) * 0.58),
      toY: opts.toY ?? 0.95,
      geo,
      mat,
      line,
      t: 0,
      life: Math.max(0.1, opts.life ?? 0.58),
      opacity: opts.opacity ?? 0.78,
    };
    if (!this._syncAbilityBeam(beam)) { mat.dispose(); geo.dispose(); return; }
    this.game.scene.add(line);
    this.abilityBeams.push(beam);
  }

  _updateAbilityBeams(dt, time = 0) {
    for (let i = this.abilityBeams.length - 1; i >= 0; i--) {
      const beam = this.abilityBeams[i];
      beam.t += dt;
      const k = Math.min(1, beam.t / beam.life);
      if (k >= 1 || !this._syncAbilityBeam(beam)) { this._removeAbilityBeam(i); continue; }
      const pulse = 0.55 + Math.sin(time * 18 + beam.t * 26) * 0.45;
      beam.mat.opacity = (1 - k) * beam.opacity * (0.62 + pulse * 0.38);
    }
  }

  _removeAbilityBeam(i) {
    const beam = this.abilityBeams[i];
    if (!beam) return;
    this.game.scene.remove(beam.line);
    beam.mat.dispose();
    beam.geo.dispose();
    this.abilityBeams.splice(i, 1);
  }

  _clearAbilityBeams() {
    while (this.abilityBeams.length) this._removeAbilityBeam(this.abilityBeams.length - 1);
  }

  _bossAbilityBeat(kind, anchor = this.group.position, opts = {}) {
    if (!this.boss) return;
    if (!settings.get('reducedMotion')) {
      this.game.engine.bloomPulse?.(opts.bloom ?? 0.42);
      this.game.engine.addShake?.(opts.shake ?? 0.18);
      if (opts.focus) this.game.engine.rtsCamera?.focusBeat?.(anchor, opts.focus);
    }
    if (kind === 'guard') this.game.audio.hornCall?.();
    else if (kind === 'fireBreath') this.game.audio.fire?.();
    else if (kind === 'burrow') this.game.audio.mace?.();
    else if (kind === 'serpentFeed') this.game.audio.roar?.();
  }

  _warnAbility(T, kind, timer, warnAt, target, opts = {}) {
    const flag = `${kind}Warned`;
    if (timer < warnAt - 0.2) T[flag] = false;
    if (timer >= warnAt && !T[flag]) {
      T[flag] = true;
      this._showTelegraph(kind, target || this.group.position, opts);
      return true;
    }
    return false;
  }

  _updateTelegraphs(dt, time = 0) {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const tg = this.telegraphs[i];
      tg.t += dt;
      const k = Math.min(1, tg.t / Math.max(0.01, tg.life));
      if (k >= 1) { this._removeTelegraph(i); continue; }
      if (tg.follow) {
        const p = this._telegraphPosition(tg.target);
        if (!p) { this._removeTelegraph(i); continue; }
        tg.group.position.set(p.x, this.game.map.heightAt(p.x, p.z) + 0.09, p.z);
      }
      const pulse = 0.5 + Math.sin(time * 10 + tg.t * 11) * 0.5;
      const stagger = tg.kind === 'gateStagger';
      const snap = stagger ? Math.sin(Math.min(1, k * 1.45) * Math.PI) : 0;
      const draw = stagger
        ? 0.52 + k * 0.72 + snap * 0.18
        : 0.64 + k * 0.5 + pulse * 0.05;
      tg.ring.scale.setScalar(tg.radius * draw);
      tg.core.scale.setScalar(tg.radius * (stagger ? 0.48 + snap * 0.38 : 0.7 + k * 0.2));
      tg.ring.rotation.z += dt * (stagger ? 4.2 : 1.4 + tg.radius * 0.04);
      tg.mat.opacity = (1 - k) * (stagger ? 0.72 + pulse * 0.22 : 0.34 + pulse * 0.28);
      tg.fillMat.opacity = stagger ? Math.sin(Math.PI * k) * 0.2 : Math.sin(Math.PI * k) * 0.12;
    }
  }

  _removeTelegraph(i) {
    const tg = this.telegraphs[i];
    if (!tg) return;
    this.game.scene.remove(tg.group);
    tg.mat.dispose();
    tg.fillMat.dispose();
    this.telegraphs.splice(i, 1);
  }

  _clearTelegraphs() {
    while (this.telegraphs.length) this._removeTelegraph(this.telegraphs.length - 1);
  }

  _shouldMeleeWindup() {
    const ab = this.def.abilities || [];
    return this._isMajorThreat() || ab.includes('rampage') || ab.includes('windLift')
      || ab.includes('pounce') || ab.includes('twinBlades') || ab.includes('venomSpit');
  }

  _startMeleeWindup() {
    const ab = this.def.abilities || [];
    const kind = ab.includes('rampage') ? 'rampage' : ab.includes('windLift') ? 'windLift' : 'melee';
    const dur = this.boss ? 0.44 : 0.3;
    const radius = ab.includes('rampage') ? 4.8 : ab.includes('windLift') ? 3.6 : 2.7;
    this._meleeWindupPrimed = true;
    this._meleeWindupT = dur;
    this._attackAnim = 0;
    this._lunge = 0.45;
    this._showTelegraph(kind, this.blockedBy || this.group.position, { radius, life: dur + 0.16, follow: !!this.blockedBy, burstCount: 3 });
    this.game.particles.burst(this.group.position.clone().setY(this.group.position.y + 1.2), this.boss ? 9 : 5, {
      speed: this.boss ? 1.8 : 1.3,
      up: 1.0,
      life: 0.42,
      size: 0.36,
      color: this._telegraphFx(kind),
      grav: 1.1,
      spread: 0.8,
      drag: 1.0,
    });
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.deadT = 1.2;
    this._clearTelegraphs();
    this._clearAbilityBeams();
    if (this.blockedBy) { this.blockedBy.target = null; this.blockedBy = null; }
    this.game.onEnemyKilled(this);
    const p = this.group.position;
    const col = this.def.class === 'div' ? FXC.shadow : this.def.class === 'serpent' ? FXC.venom : FXC.dust;
    this.game.particles.burst(p, this.boss ? 36 : 14, { speed: 2.5, life: 0.9, size: 0.5, color: col, grav: 3 });
    if (this.boss) {
      // a fallen Div is a beat to feel: hit-stop, a hard shake, a bloom flash, a second debris plume
      this.game.engine.addShake(1.4);
      this.game.engine.hitStop(0.09);
      this.game.engine.bloomPulse(0.9);
      this.game.particles.burst(p, 28, { speed: 6, up: 3, life: 1.1, size: 0.7, color: FXC.ember, grav: 5, spread: 2 });
      this.game.audio.roar();
    } else {
      // a small bright pop so even rank-and-file deaths register
      this.game.particles.burst(p, 6, { speed: 3, up: 1.6, life: 0.5, size: 0.35, color: FXC.spark, grav: 4, spread: 0.8 });
    }
    // princelyWrath: allies rage on nearby deaths
    for (const e of this.game.enemies) {
      if (e.alive && e.def.abilities?.includes('princelyWrath') && e.group.position.distanceTo(p) < 12) {
        e.wrathStacks++;
        e.buffSpeed = 1 + e.wrathStacks * 0.08;
        e.buffDamage = 1 + e.wrathStacks * 0.15;
      }
      // feudFury: Tur rages when Salm falls
      if (this.def.id === 'salm' && e.alive && e.def.id === 'tur') { e.buffSpeed *= 1.5; e.buffDamage *= 1.6; }
      // devourGrow: worm eats the fallen
      if (e.alive && e.def.abilities?.includes('devourGrow') && e.group.position.distanceTo(p) < 9) {
        e.maxHp *= 1.04; e.hp = Math.min(e.maxHp, e.hp + this.maxHp * 0.06);
        e.group.scale.multiplyScalar(1.01);
      }
    }
  }

  _tickAbilities(dt) {
    const ab = this.def.abilities || [];
    const T = this.abilityT;
    const near = (r) => this.game.enemies.filter((e) => e.alive && e !== this && e.group.position.distanceTo(this.group.position) < r);

    if (ab.includes('phaseShift')) {
      T.phase = (T.phase || 0) + dt;
      this._warnAbility(T, 'phaseShift', T.phase, 6.05, this.group.position, { radius: 4.8, life: 0.95, followSelf: true });
      if (T.phase > 7) { T.phase = 0; this.untargetableT = 1.2; this.game.particles.burst(this.group.position, 10, { speed: 2, life: 0.6, size: 0.4, color: FXC.shadow }); }
    }
    if (ab.includes('divRally')) {
      for (const e of near(11)) if (e.def.class === 'div') { e.buffSpeed = Math.max(e.buffSpeed, 1.25); }
    }
    if (ab.includes('banneredAdvance')) {
      for (const e of near(10)) e.buffSpeed = Math.max(e.buffSpeed, 1.18);
    }
    if (ab.includes('roadBlock')) {
      for (const e of near(7)) if (e.dist < this.dist) e.roadShield = 0.5; // re-applied each frame
    }
    if (ab.includes('divRally') || ab.includes('banneredAdvance') || ab.includes('dynasticBanner') || (ab.includes('siegeHorns') && this.siegeSilencedT <= 0)) {
      T.auraPulse = (T.auraPulse || 0) - dt;
      if (T.auraPulse <= 0) {
        T.auraPulse = 4.2;
        const radius = ab.includes('siegeHorns') ? 12 : ab.includes('divRally') ? 11 : 10;
        this._showTelegraph('banner', this.group.position, { radius, life: 0.9, followSelf: true, burstCount: 3 });
      }
    }
    if (ab.includes('blindingFog') && this.fogBrokenT <= 0) {
      T.fogPulse = (T.fogPulse || 0) - dt;
      if (T.fogPulse <= 0) {
        T.fogPulse = 3.4;
        this._showTelegraph('blindingFog', this.group.position, { radius: 12.5, life: 1.35, followSelf: true, burstCount: 9 });
        const p = this.group.position.clone().setY(this.group.position.y + (this.model.headH || 1.7) * 0.55);
        this.game.particles.burst(p, this.boss ? 22 : 10, { speed: 1.6, up: 0.65, life: 1.1, size: 0.62, color: FXC.snow, grav: -0.4, spread: 4.8, drag: 0.8 });
        this._bossAbilityBeat('blindingFog', this.group.position, { bloom: 0.28, shake: 0.08 });
      }
    }
    if (ab.includes('serpentFeed')) {
      T.feed = (T.feed || 0) + dt;
      this._warnAbility(T, 'serpentFeed', T.feed, 2.0, this.group.position, { radius: 9.5, life: 0.8, followSelf: true });
      if (T.feed > 2.5) {
        T.feed = 0;
        const victims = near(10).filter((e) => !e.boss);
        if (victims.length && this.hp < this.maxHp) {
          const v = victims[0];
          v.takeDamage(40, 'true');
          this.hp = Math.min(this.maxHp, this.hp + 80);
          this._addAbilityBeam('serpentFeed', v, this, { life: 0.72, fromY: 0.9, toY: (this.model.headH || 1.7) * 0.72, opacity: 0.92 });
          this._showTelegraph('serpentFeed', v.group.position, { radius: 2.8, life: 0.62, burstCount: 7 });
          this.game.particles.burst(this.group.position, 16, { speed: 1.8, up: 1.1, life: 0.78, size: 0.46, color: FXC.blood, grav: 0.8, spread: 1.8, drag: 0.7 });
          this._bossAbilityBeat('serpentFeed', this.group.position, { bloom: 0.42, shake: 0.2, focus: { dur: 0.75, strength: 0.24, dist: 50, pitch: 0.78 } });
        }
      }
    }
    if (ab.includes('spawnLarvae') && this.broodSilencedT <= 0) {
      T.larva = (T.larva || 0) + dt;
      this._warnAbility(T, 'spawnLarvae', T.larva, 5.0, this.group.position, { radius: 5.2, life: 0.95, followSelf: true });
      if (T.larva > 6 && this.game.enemies.length < 80) {
        T.larva = 0;
        const larva = new Enemy(this.game, this.def, this.pathIndex, 1, true);
        larva.dist = Math.max(0, this.dist - 2);
        this.game.enemies.push(larva);
      }
    }
    if ((ab.includes('royalGuard') || ab.includes('heavyCavalry') || ab.includes('nobleEscort')) && this.guardBrokenT <= 0) {
      T.guard = (T.guard || 0) + dt;
      const interval = ab.includes('nobleEscort') ? 999 : 9;
      if (interval < 999) this._warnAbility(T, 'guard', T.guard, interval - 1.05, this.group.position, { radius: 8.5, life: 1.0, followSelf: true });
      if ((T.guard > interval || (ab.includes('nobleEscort') && !T.escorted)) && this.game.enemies.length < 70) {
        T.guard = 0; T.escorted = true;
        this._showTelegraph('guard', this.group.position, { radius: 8.5, life: 0.85, followSelf: true, burstCount: 5 });
        const escortDef = this.game.enemyDefById(ab.includes('heavyCavalry') ? 'barman' : 'barman');
        for (let i = 0; i < 2; i++) {
          const e = new Enemy(this.game, escortDef, this.pathIndex, this.game.waveHpMult);
          e.dist = Math.max(0, this.dist - 1.5 - i);
          const q = pointAt(e.path, e.dist);
          e.group.position.set(q.x, q.y, q.z);
          this.game.enemies.push(e);
          this._addAbilityBeam('guard', this, e, { life: 0.78, fromY: (this.model.headH || 1.7) * 0.8, toY: 1.25, opacity: 0.68 });
          this._showTelegraph('guard', e.group.position, { radius: 2.4, life: 0.72, burstCount: 4 });
        }
        this.game.particles.burst(this.group.position.clone().setY(this.group.position.y + 1.4), 18, { speed: 2.2, up: 1.4, life: 0.72, size: 0.42, color: FXC.gold, grav: 0.6, spread: 2.8, drag: 0.5 });
        this._bossAbilityBeat('guard', this.group.position, { bloom: 0.5, shake: 0.18, focus: this.boss ? { dur: 0.78, strength: 0.22, dist: 54, pitch: 0.82 } : null });
      }
    }
    if (ab.includes('nightRaid')) {
      T.sprint = (T.sprint || 0) + dt;
      if (T.sprint > 5) { T.sprint = 0; T.sprintLeft = 1.4; }
      if (T.sprintLeft > 0) { T.sprintLeft -= dt; this.buffSpeed = 1.9; } else if (this.wrathStacks === 0) this.buffSpeed = Math.max(1, this.buffSpeed * 0.99);
    }
    if (ab.includes('pathfinding')) {
      T.skip = (T.skip || 0) + dt;
      if (T.skip > 8) { T.skip = 0; this.dist = Math.min(this.path.length - 2, this.dist + 4); }
    }
    if (ab.includes('hiddenPit')) {
      T.pit = (T.pit || 0) + dt;
      const pitPads = this.game.map.pads.filter((p) => p.tower && p.pos.distanceTo(this.group.position) < 8 && p.tower.disabledT <= 0);
      this._warnAbility(T, 'hiddenPit', T.pit, 5.0, pitPads[0] || this.group.position, { radius: 2.7, life: 1.0, follow: !!pitPads[0] });
      if (T.pit > 6) {
        T.pit = 0;
        T.hiddenPitWarned = false;
        const pads = pitPads.length ? pitPads : this.game.map.pads.filter((p) => p.tower && p.pos.distanceTo(this.group.position) < 8 && p.tower.disabledT <= 0);
        if (pads.length) {
          pads[0].tower.disabledT = 4;
          this.game.particles.burst(pads[0].pos, 14, { speed: 2, life: 0.8, size: 0.5, color: FXC.dust, grav: 4 });
        }
      }
    }
    if (ab.includes('charmTower')) {
      T.charm = (T.charm || 0) + dt;
      let charmBest = null, charmBd = 14;
      for (const t of this.game.towers) {
        const d = t.pos.distanceTo(this.group.position);
        if (d < charmBd && t.alive) { charmBd = d; charmBest = t; }
      }
      this._warnAbility(T, 'charmTower', T.charm, 6.7, charmBest || this.group.position, { radius: 3.6, life: 1.05, follow: !!charmBest });
      if (T.charm > 8) {
        T.charm = 0;
        T.charmTowerWarned = false;
        const best = charmBest;
        if (best) { best.silencedT = 2.2; this.game.particles.burst(best.pos.clone().setY(best.pos.y + 3), 10, { speed: 1.5, life: 0.7, size: 0.5, color: FXC.shadow, grav: -0.5 }); }
      }
    }
    if (ab.includes('lassoBreak')) {
      T.lasso = (T.lasso || 0) + dt;
      const lassoTarget = this.game.towers.find((t) => t.alive && t.squads.length && t.pos.distanceTo(this.group.position) < 12);
      this._warnAbility(T, 'lassoBreak', T.lasso, 7.65, lassoTarget || this.group.position, { radius: 3.8, life: 1.1, follow: !!lassoTarget });
      if (T.lasso > 9) {
        T.lasso = 0;
        T.lassoBreakWarned = false;
        for (const t of this.game.towers) {
          if (t.squads.length && t.pos.distanceTo(this.group.position) < 12) { t.garrisonDisabledT = 3; break; }
        }
      }
    }
    if (ab.includes('falseTrail') && this.counselBrokenT <= 0) {
      T.lure = (T.lure || 0) + dt;
      this._warnAbility(T, 'falseTrail', T.lure, 5.8, this.group.position, { radius: 11, life: 1.0, followSelf: true });
      if (T.lure > 7) {
        T.lure = 0;
        T.falseTrailWarned = false;
        for (const s of this.game.allSoldiers()) {
          if (s.alive && s.group.position.distanceTo(this.group.position) < 11) { s.fearT = 2.0; }
        }
      }
    }
    if (ab.includes('caveSlam')) {
      T.slam = (T.slam || 0) + dt;
      this._warnAbility(T, 'caveSlam', T.slam, 5.0, this.group.position, { radius: 6, life: 0.95, followSelf: true });
      if (T.slam > 6) {
        T.slam = 0;
        T.caveSlamWarned = false;
        let any = false;
        for (const s of this.game.allSoldiers()) {
          if (s.alive && s.group.position.distanceTo(this.group.position) < 6) { s.stunT = 1.6; any = true; }
        }
        if (any) { this.game.engine.addShake(0.25); this.game.audio.mace(); }
      }
    }
    if (ab.includes('fireBreath')) {
      T.breath = (T.breath || 0) + dt;
      this._warnAbility(T, 'fireBreath', T.breath, 4.05, this.group.position, { radius: 7, life: 0.9, followSelf: true });
      if (T.breath > 5) {
        T.breath = 0;
        T.fireBreathWarned = false;
        const p = this.group.position;
        const hit = [];
        for (const s of this.game.allSoldiers()) {
          if (s.alive && s.group.position.distanceTo(p) < 7) { s.takeDamage(28, 'fire'); hit.push(s); }
        }
        if (hit.length) {
          for (const s of hit.slice(0, 7)) this._addAbilityBeam('fireBreath', this, s, { life: 0.46, fromY: (this.model.headH || 1.7) * 0.55, toY: 0.9, opacity: 0.74 });
        } else {
          const forward = new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
          const side = new THREE.Vector3(-forward.z, 0, forward.x);
          for (let i = -1; i <= 1; i++) {
            const target = p.clone().addScaledVector(forward, 5.2 + Math.abs(i) * 1.4).addScaledVector(side, i * 1.8);
            target.y = this.game.map.heightAt(target.x, target.z);
            this._addAbilityBeam('fireBreath', this, target, { life: 0.42, fromY: (this.model.headH || 1.7) * 0.55, toY: 0.45, opacity: 0.62 });
          }
        }
        for (let i = 0; i < 16; i++) this.game.particles.burst(p, 3, { speed: 4, up: 1, life: 0.6, size: 0.7, color: FXC.ember, grav: -1, spread: 4 });
        this._bossAbilityBeat('fireBreath', p, { bloom: 0.48, shake: 0.22, focus: this.boss ? { dur: 0.72, strength: 0.24, dist: 50, pitch: 0.78 } : null });
      }
    }
    // decay re-applied-each-frame shields
    this.roadShield = Math.max(0, (this.roadShield || 0) - dt * 2);
  }

  update(dt, time) {
    if (!this.alive) {
      this.deadT -= dt;
      const anim = this.model.anim;
      if (anim?.actions.death) {
        // skeletal death clip (GLTF characters)
        anim.mixer.update(dt);
        if (!this._deathPlayed) { this._deathPlayed = true; anim.play('death', { fade: 0.12 }); }
        if (this.deadT < 0.5) this.group.position.y -= dt * 1.0; // sink away at the end
      } else {
        // procedural topple with a small bounce, then sink — accelerates as it tips (gravity-like)
        // rather than spinning over at a constant, mechanical rate.
        const fallV = 2.2 + this.group.rotation.x * 3.5;
        this.group.rotation.x = Math.min(Math.PI / 2, this.group.rotation.x + dt * fallV);
        if (this.deadT > 0.9) this.group.position.y += dt * 0.5;
        else this.group.position.y -= dt * (this.deadT < 0.5 ? 1.3 : 0.3);
      }
      return this.deadT > 0;
    }
    this.untargetableT -= dt; this.stunT -= dt; this.bindT -= dt; this.markT -= dt;
    this.fogBrokenT -= dt; this.siegeSilencedT -= dt; this.broodSilencedT -= dt; this.counselBrokenT -= dt; this.feudBrokenT -= dt; this.guardBrokenT -= dt;
    this.dmgFlash -= dt;
    this._gateLineReactCd = Math.max(0, (this._gateLineReactCd || 0) - dt);
    for (let i = this.slows.length - 1; i >= 0; i--) { this.slows[i].t -= dt; if (this.slows[i].t <= 0) this.slows.splice(i, 1); }
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      b.t -= dt;
      this.takeDamage(b.dps * dt, 'true');
      if (Math.random() < dt * 6) this.game.particles.spawn(this.group.position.x, this.group.position.y + 1, this.group.position.z, 0, 1.5, 0, 0.5, 0.4, 1, 0.5, 0.15, -1, 0);
      if (b.t <= 0) this.burns.splice(i, 1);
      if (!this.alive) return true;
    }

    this._tickAbilities(dt);

    // melee engagement: ground enemies STOP and fight any soldier in reach —
    // they never simply push through a line of defenders
    if (this.blockedBy && !this.blockedBy.alive) {
      this.blockedBy = null;
      this._meleeWindupT = 0;
      this._meleeWindupPrimed = false;
    }
    if (!this.flying && !this.blockedBy) {
      this._contactT = (this._contactT || 0) - dt;
      if (this._contactT <= 0) {
        this._contactT = 0.12;
        const s = this.game.nearestSoldier(this.group.position, 2.0);
        if (s && s.alive && s.fearT <= 0) {
          this.blockedBy = s;
          if (!s.target || !s.target.alive) s.target = this;
        }
      }
    }
    if (this.blockedBy && !this.flying) {
      // square up to the duel
      const sp = this.blockedBy.group.position;
      this.group.rotation.y = Math.atan2(sp.x - this.group.position.x, sp.z - this.group.position.z);
      this.meleeCd -= dt;
      this._meleeWindupT = Math.max(0, this._meleeWindupT - dt);
      if (this.meleeCd <= 0) {
        if (this._meleeWindupT > 0) {
          // warning is active; the strike lands when the countdown ends.
        } else if (!this._meleeWindupPrimed && this._shouldMeleeWindup()) {
          this._startMeleeWindup();
        } else {
          this._meleeWindupPrimed = false;
          this.meleeCd = 1.1;
          this._attackAnim = 0;
          this._lunge = 1;
          this.model.anim?.strike();
          this.game.meleeClash(this.group.position.clone().lerp(sp, 0.5).setY(this.group.position.y + 1.0), this.boss);
          let dmg = this.meleeDamage * this.buffDamage;
          // pounce/twinBlades/rampage flavor
          if (this.def.abilities?.includes('pounce') && !this.abilityT.pounced) { dmg *= 3; this.abilityT.pounced = true; }
          this.blockedBy.takeDamage(dmg, 'impact');
          if (this.def.abilities?.includes('twinBlades')) {
            const other = this.game.allSoldiers().find((s) => s.alive && s !== this.blockedBy && s.group.position.distanceTo(this.group.position) < 2.5);
            other?.takeDamage(dmg * 0.7, 'impact');
          }
          if (this.def.abilities?.includes('venomSpit')) this.blockedBy.poisonT = 3;
          if (this.def.abilities?.includes('windLift') && Math.random() < 0.3) {
            this.blockedBy.stunT = 1.5;
            this.blockedBy.group.position.x += (Math.random() - 0.5) * 4;
            this.blockedBy.group.position.z += (Math.random() - 0.5) * 4;
            this.blockedBy.target = null; this.blockedBy = null;
          }
          if (this.def.abilities?.includes('rampage')) {
            this.blockedBy && (this.blockedBy.stunT = 0.8);
            if (Math.random() < 0.5) { this.blockedBy && (this.blockedBy.target = null); this.blockedBy = null; } // smashes through
          }
          if (this.def.abilities?.includes('burrow') && Math.random() < 0.35) {
            // burrow past the blockade
            const from = this.group.position.clone();
            this.untargetableT = 1.2;
            this.dist += 6;
            const q = pointAt(this.path, Math.min(this.path.length - 0.5, this.dist));
            const to = new THREE.Vector3(q.x, q.y, q.z);
            this._addAbilityBeam('burrow', from, to, { life: 0.62, fromY: 0.38, toY: 0.38, opacity: 0.72 });
            this._showTelegraph('burrow', to, { radius: 4.2, life: 0.82, burstCount: 8 });
            this.game.particles.burst(from, 16, { speed: 3.0, up: 0.7, life: 0.72, size: 0.55, color: FXC.dust, grav: 2.6, spread: 2.4, drag: 0.7 });
            this.game.particles.burst(to, 22, { speed: 3.4, up: 1.0, life: 0.82, size: 0.62, color: FXC.dust, grav: 2.2, spread: 2.8, drag: 0.7 });
            this.blockedBy && (this.blockedBy.target = null);
            this.blockedBy = null;
            this._bossAbilityBeat('burrow', to, { bloom: 0.32, shake: 0.3, focus: this.boss ? { dur: 0.65, strength: 0.24, dist: 50, pitch: 0.78 } : null });
          }
        }
      }
    } else {
      this._meleeWindupT = 0;
      this._meleeWindupPrimed = false;
      // advance along road
      this.dist += this.speed * dt;
      if (this.dist >= this.path.length - 0.5) {
        this.alive = false;
        this.reachedEnd = true;
        this.game.onEnemyReachedEnd(this);
        this.game.scene.remove(this.group);
        return false;
      }
      // siege strike vs towers in passing
      if (this.siegeCapable) {
        this.siegeCd -= dt;
        const siegeTarget = this.game.towers.find((t) => t.alive && t.pos.distanceTo(this.group.position) < 5.5);
        if (this.siegeCd <= 0.85 && !this._siegeWarned && siegeTarget) {
          this._siegeWarned = true;
          this._showTelegraph('siegeStrike', siegeTarget, { radius: 3.5, life: 0.82, follow: true, burstCount: 4 });
        } else if (!siegeTarget) {
          this._siegeWarned = false;
        }
        if (this.siegeCd <= 0) {
          for (const t of siegeTarget ? [siegeTarget] : this.game.towers) {
            if (t.alive && t.pos.distanceTo(this.group.position) < 5.5) {
              this.siegeCd = 4.5;
              this._siegeWarned = false;
              this._attackAnim = 0;
              t.takeDamage(this.meleeDamage * 1.6 * this.buffDamage * (this.game.siegeHornsActive ? 1.6 : 1));
              break;
            }
          }
          if (this.siegeCd <= 0) this.siegeCd = 0.5;
        }
      }
    }

    // position on road with lane offset
    const pt = pointAt(this.path, this.dist);
    const nx = -pt.tz, nz = pt.tx;
    const px = pt.x + nx * this.laneOffset * (this.isLarva ? 0.6 : 1);
    const pz = pt.z + nz * this.laneOffset * (this.isLarva ? 0.6 : 1);
    let py = pt.y;
    if (this.flying) py += 3.2 + Math.sin(time * 2.1 + this.id) * 0.5;
    this.group.position.set(px, py, pz);
    if (!this.blockedBy) this.group.rotation.y = Math.atan2(pt.tx, pt.tz); // duels keep facing the foe

    // animation
    const rig = this.model.rig;
    const animSpeed = this.speed / Math.max(0.6, this.baseSpeed);
    if (this.model.anim) {
      // skeletal GLTF character: real walk/idle clips driven by movement state
      const a = this.model.anim;
      a.mixer.update(dt);
      if (this.blockedBy) a.play('idle');
      else if (a.walkStride) {
        // stride-calibrated cadence: match the clip's foot speed to the world speed so
        // the paws plant instead of ice-skating. foot speed = stride*timeScale/duration,
        // set == this.speed. Scales correctly with slows/buffs (no fixed 0.5 floor).
        const ts = (this.speed / a.walkStride) * (a.walkDuration || 1);
        a.play('walk', { timeScale: Math.min(6, Math.max(0.2, ts)) });
      }
      else a.play('walk', { timeScale: Math.max(0.5, animSpeed) });
    }
    // melee lunge: quick push toward the foe and back
    if (this._lunge > 0) {
      this._lunge = Math.max(0, this._lunge - dt * 3.2);
      this.model.group.position.z = Math.sin(Math.min(1, this._lunge) * Math.PI) * 0.34;
    } else if (this.model.group.position.z !== 0) this.model.group.position.z = 0;
    if (this._attackAnim != null) {
      this._attackAnim += dt * 2.4;
      if (rig.armR) animAttack(rig, Math.min(1, this._attackAnim));
      if (this._attackAnim >= 1) this._attackAnim = null;
    }
    if (this.model.animType === 'biped' && rig.legL) animWalk(rig, time + this.id, this.blockedBy ? 0.3 : animSpeed);
    else if (this.model.animType === 'quad' && rig.legs) animQuad(rig, time + this.id, animSpeed);
    else if (this.model.animType === 'serpent' && rig.segments) animSerpent(rig, time + this.id, animSpeed);
    else if (this.model.animType === 'fly' && rig.veil) rig.veil.scale.setScalar(1 + Math.sin(time * 3) * 0.12);
    animShoulderSerpents(rig, time);

    // health bar faces camera
    this.barFg.scale.x = Math.max(0.001, this.hp / this.maxHp);
    this.barFg.position.x = -(1 - this.barFg.scale.x) * 0.6;
    this.bar.quaternion.copy(this.game.engine.camera.quaternion);
    this.bar.visible = this.hp < this.maxHp;

    // damage flash
    this.group.position.x += this.dmgFlash > 0 ? (Math.random() - 0.5) * 0.06 : 0;
    this._updateHitReaction(dt);
    this._updateTelegraphs(dt, time);
    this._updateAbilityBeams(dt, time);

    return true;
  }

  destroy() {
    this._clearTelegraphs();
    this._clearAbilityBeams();
    this.game.scene.remove(this.group);
  }
}
