// Enemy entity — path following, armor/resist damage model, status effects,
// melee vs blocking soldiers, siege strikes vs towers, per-def special abilities,
// boss presence, procedural animation, health bar.
import * as THREE from 'three';
import { buildEnemyModel, animQuad, animSerpent, animShoulderSerpents } from '../models/creature.js';
import { animWalk, animAttack } from '../models/humanoid.js';
import { pointAt } from '../world/road.js';
import { FXC } from '../fx/particles.js';

const barGeo = new THREE.PlaneGeometry(1.2, 0.13);
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.75, depthWrite: false });
const barFgMat = new THREE.MeshBasicMaterial({ color: 0xc23b2a, depthWrite: false });
const barBossMat = new THREE.MeshBasicMaterial({ color: 0xe0b13e, depthWrite: false });

let nextId = 1;

// Runtime HP scale — ledger hp values are relative weight classes; this converts them
// to killable battle hp against tower DPS. Bosses keep more weight to feel epic.
export const HP_SCALE = 0.26;
export const BOSS_HP_SCALE = 0.38;

export class Enemy {
  constructor(game, def, pathIndex, hpMult = 1, isLarva = false) {
    this.id = nextId++;
    this.game = game;
    this.def = def;
    this.pathIndex = pathIndex;
    this.path = game.map.paths[pathIndex];
    this.dist = 0;
    this.alive = true;
    this.reachedEnd = false;
    this.maxHp = def.hp * (def.boss ? BOSS_HP_SCALE : HP_SCALE) * hpMult * (isLarva ? 0.25 : 1) * (game.diffHpMult || 1);
    this.hp = this.maxHp;
    // random wave modifier (game.waveMod): tweak armor + speed at spawn (hp already folded into hpMult)
    const wmod = game.waveMod;
    this.armor = Math.min(0.95, def.armor + (wmod?.armorAdd || 0));
    this.resist = def.resist;
    this.baseSpeed = def.speed * (wmod?.speedMult || 1);
    this.flying = !!def.flying;
    this.boss = !!def.boss;
    this.isLarva = isLarva;
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
    // ability state
    this.abilityT = {};
    this.buffSpeed = 1; this.buffDamage = 1; this.shieldNext = def.abilities?.includes('shieldedMarch') ? 1 : 0;
    this.guiseBroken = !def.abilities?.includes('falseGuise');
    this.wrathStacks = 0;
    this.prophecyUsed = false;

    this.model = buildEnemyModel(def.model);
    if (isLarva) this.model.group.scale.multiplyScalar(0.45);
    this.group = new THREE.Group();
    this.group.add(this.model.group);
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
    if (this.def.id === 'salm' && this.game.enemies.some((e) => e.alive && e.def.id === 'tur')) dmg *= 0.6;
    this.hp -= dmg;
    this.dmgFlash = 0.12;
    if (!this.guiseBroken) { this.guiseBroken = true; this.buffSpeed *= 1.6; }
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

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.deadT = 1.2;
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
    if (ab.includes('serpentFeed')) {
      T.feed = (T.feed || 0) + dt;
      if (T.feed > 2.5) {
        T.feed = 0;
        const victims = near(10).filter((e) => !e.boss);
        if (victims.length && this.hp < this.maxHp) {
          const v = victims[0];
          v.takeDamage(40, 'true');
          this.hp = Math.min(this.maxHp, this.hp + 80);
          this.game.particles.burst(this.group.position, 8, { speed: 1.5, life: 0.7, size: 0.4, color: FXC.blood, grav: 1 });
        }
      }
    }
    if (ab.includes('spawnLarvae')) {
      T.larva = (T.larva || 0) + dt;
      if (T.larva > 6 && this.game.enemies.length < 80) {
        T.larva = 0;
        const larva = new Enemy(this.game, this.def, this.pathIndex, 1, true);
        larva.dist = Math.max(0, this.dist - 2);
        this.game.enemies.push(larva);
      }
    }
    if (ab.includes('royalGuard') || ab.includes('heavyCavalry') || ab.includes('nobleEscort')) {
      T.guard = (T.guard || 0) + dt;
      const interval = ab.includes('nobleEscort') ? 999 : 9;
      if ((T.guard > interval || (ab.includes('nobleEscort') && !T.escorted)) && this.game.enemies.length < 70) {
        T.guard = 0; T.escorted = true;
        const escortDef = this.game.enemyDefById(ab.includes('heavyCavalry') ? 'barman' : 'barman');
        for (let i = 0; i < 2; i++) {
          const e = new Enemy(this.game, escortDef, this.pathIndex, this.game.waveHpMult);
          e.dist = Math.max(0, this.dist - 1.5 - i);
          this.game.enemies.push(e);
        }
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
      if (T.pit > 6) {
        T.pit = 0;
        const pads = this.game.map.pads.filter((p) => p.tower && p.pos.distanceTo(this.group.position) < 8 && p.tower.disabledT <= 0);
        if (pads.length) {
          pads[0].tower.disabledT = 4;
          this.game.particles.burst(pads[0].pos, 14, { speed: 2, life: 0.8, size: 0.5, color: FXC.dust, grav: 4 });
        }
      }
    }
    if (ab.includes('charmTower')) {
      T.charm = (T.charm || 0) + dt;
      if (T.charm > 8) {
        T.charm = 0;
        let best = null, bd = 14;
        for (const t of this.game.towers) {
          const d = t.pos.distanceTo(this.group.position);
          if (d < bd && t.alive) { bd = d; best = t; }
        }
        if (best) { best.silencedT = 2.2; this.game.particles.burst(best.pos.clone().setY(best.pos.y + 3), 10, { speed: 1.5, life: 0.7, size: 0.5, color: FXC.shadow, grav: -0.5 }); }
      }
    }
    if (ab.includes('lassoBreak')) {
      T.lasso = (T.lasso || 0) + dt;
      if (T.lasso > 9) {
        T.lasso = 0;
        for (const t of this.game.towers) {
          if (t.squads.length && t.pos.distanceTo(this.group.position) < 12) { t.garrisonDisabledT = 3; break; }
        }
      }
    }
    if (ab.includes('falseTrail')) {
      T.lure = (T.lure || 0) + dt;
      if (T.lure > 7) {
        T.lure = 0;
        for (const s of this.game.allSoldiers()) {
          if (s.alive && s.group.position.distanceTo(this.group.position) < 11) { s.fearT = 2.0; }
        }
      }
    }
    if (ab.includes('caveSlam')) {
      T.slam = (T.slam || 0) + dt;
      if (T.slam > 6) {
        T.slam = 0;
        let any = false;
        for (const s of this.game.allSoldiers()) {
          if (s.alive && s.group.position.distanceTo(this.group.position) < 6) { s.stunT = 1.6; any = true; }
        }
        if (any) { this.game.engine.addShake(0.25); this.game.audio.mace(); }
      }
    }
    if (ab.includes('fireBreath')) {
      T.breath = (T.breath || 0) + dt;
      if (T.breath > 5) {
        T.breath = 0;
        const p = this.group.position;
        for (const s of this.game.allSoldiers()) {
          if (s.alive && s.group.position.distanceTo(p) < 7) s.takeDamage(28, 'fire');
        }
        for (let i = 0; i < 16; i++) this.game.particles.burst(p, 3, { speed: 4, up: 1, life: 0.6, size: 0.7, color: FXC.ember, grav: -1, spread: 4 });
        this.game.audio.fire();
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
    this.dmgFlash -= dt;
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
    if (this.blockedBy && !this.blockedBy.alive) this.blockedBy = null;
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
      if (this.meleeCd <= 0) {
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
          this.untargetableT = 1.2;
          this.dist += 6;
          this.blockedBy && (this.blockedBy.target = null);
          this.blockedBy = null;
          this.game.particles.burst(this.group.position, 16, { speed: 3, life: 0.8, size: 0.6, color: FXC.dust, grav: 5 });
        }
      }
    } else {
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
        if (this.siegeCd <= 0) {
          for (const t of this.game.towers) {
            if (t.alive && t.pos.distanceTo(this.group.position) < 5.5) {
              this.siegeCd = 4.5;
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
    else if (this.model.animType === 'crawl') {
      // static GLB crawler (no skeletal rig) — fake life with a slither weave + undulation
      const mg = this.model.group, ph = time * 2.6 + this.id, m = this.blockedBy ? 0.35 : 1;
      mg.rotation.z = Math.sin(ph) * 0.06 * m;             // side-to-side body roll
      mg.rotation.y = Math.sin(ph * 0.5 + 1) * 0.06 * m;   // head weave
      mg.position.y = Math.abs(Math.sin(ph * 2)) * 0.04 * m; // subtle vertical undulation
    }
    animShoulderSerpents(rig, time);

    // health bar faces camera
    this.barFg.scale.x = Math.max(0.001, this.hp / this.maxHp);
    this.barFg.position.x = -(1 - this.barFg.scale.x) * 0.6;
    this.bar.quaternion.copy(this.game.engine.camera.quaternion);
    this.bar.visible = this.hp < this.maxHp;

    // damage flash
    this.group.position.x += this.dmgFlash > 0 ? (Math.random() - 0.5) * 0.06 : 0;

    return true;
  }

  destroy() { this.game.scene.remove(this.group); }
}
