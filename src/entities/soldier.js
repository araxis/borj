// Soldier squads — spawned by barracks towers. They hold the road, patrol,
// intercept and block enemies, rally to player-chosen points, heal/repair,
// and use squad-specific abilities. Fallen members respawn at the tower.
import * as THREE from 'three';
import { buildSoldierModel, animQuad } from '../models/creature.js';
import { animWalk, animIdle, animAttack } from '../models/humanoid.js';
import { FXC } from '../fx/particles.js';

const ENGAGE_RADIUS = 8;       // from anchor
const LEASH_RADIUS = 14;
const PALACE_APPROACH_RADIUS = 32;
const PALACE_APPROACH_LEASH = 46;

let soldierId = 1;

export class Soldier {
  constructor(game, squad, def) {
    this.id = soldierId++;
    this.game = game;
    this.squad = squad;
    this.def = def;
    this.alive = true;
    this.maxHp = def.hp * squad.powerMult;
    this.hp = this.maxHp;
    this.damage = def.damage * squad.powerMult;
    this.rate = def.rate;
    this.speed = def.speed * (squad.speedMult || 1);
    this.attackCd = 0;
    this.target = null;          // enemy we block
    this.stunT = 0; this.fearT = 0; this.poisonT = 0;
    this.lastStandUsed = false;
    this.model = buildSoldierModel(def.model);
    this._baseModelScale = this.model.group.scale.clone();
    this.group = new THREE.Group();
    this.group.add(this.model.group);
    game.scene.add(this.group);
    this.group.position.copy(squad.anchor).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
    this.healCd = 0;
    this.deadT = 0;
    this.sortieT = 0;
    this.gateReadT = 0;
    this.braceT = 0;
    this.braceDur = 0;
    this.bracePower = 0;
    this._palaceModelHidden = false;
  }

  takeDamage(amount, dmgType = 'impact') {
    if (!this.alive) return;
    let dmg = amount;
    if (this.squad.palaceStandAnchor && this.squad.gateLineT > 0) {
      const nearGate = this.group.position.distanceTo(this.squad.palaceStandAnchor) <= Math.max(4.5, (this.squad.gateLineWidth || 8) * 0.72);
      if (nearGate) {
        dmg *= this.def.mounted ? 0.76 : 0.68;
        this.gateReadT = Math.max(this.gateReadT || 0, this.model?.mounted ? 0.72 : 0.86);
      }
    }
    if (this.def.ability?.key === 'shieldWall') {
      const allies = this.squad.members.filter((m) => m.alive && m !== this && m.group.position.distanceTo(this.group.position) < 3);
      if (allies.length >= 1) dmg *= 0.65;
    }
    if (this.squad.tower?.auraCache?.armorBonus) dmg *= 1 - Math.min(0.5, this.squad.tower.auraCache.armorBonus);
    this.hp -= dmg;
    if (this.hp <= 0) {
      if (this.def.ability?.key === 'lastStand' && !this.lastStandUsed) {
        this.lastStandUsed = true;
        this.hp = 1;
        return;
      }
      this.die();
    }
  }

  die() {
    this.alive = false;
    this.deadT = 1.0;
    // release EVERY enemy locked onto this soldier (several may be dueling them)
    for (const e of this.game.enemies) {
      if (e.blockedBy === this) e.blockedBy = null;
    }
    this.target = null;
    this.game.particles.burst(this.group.position, 8, { speed: 1.5, life: 0.7, size: 0.4, color: FXC.dust, grav: 3 });
    this.squad.onMemberDied(this);
    this.game.onSoldierDied?.(this);
  }

  _findTarget() {
    if (this.def.behavior === 'support') return null;
    const standTarget = this._findPalaceStandTarget();
    if (standTarget) return standTarget;
    // prefer an unengaged enemy; otherwise gang up on the nearest engaged one
    let best = null, bd = ENGAGE_RADIUS;
    let backup = null, bbd = ENGAGE_RADIUS;
    for (const e of this.game.enemies) {
      if (!e.alive || e.flying || e.untargetableT > 0) continue;
      const d = e.group.position.distanceTo(this.squad.anchor);
      if (e.blockedBy && e.blockedBy !== this) {
        if (d < bbd) { bbd = d; backup = e; }
        continue;
      }
      if (d < bd) { bd = d; best = e; }
    }
    return best || backup;
  }

  _findPalaceStandTarget() {
    const stand = this.squad.palaceStandAnchor;
    if (!stand) return null;
    const dir = this.squad.palaceStandDir?.clone?.();
    if (dir && dir.lengthSq() > 0.01) dir.normalize();
    const side = dir ? new THREE.Vector3(-dir.z, 0, dir.x) : null;
    const radius = Math.max(PALACE_APPROACH_RADIUS, this.squad.palaceStandRadius || 0);
    const width = this.squad.palaceStandWidth || Math.max(9, radius * 0.62);
    const idx = Math.max(0, this.squad.members.indexOf(this));
    const n = Math.max(1, this.squad.members.length);
    const rank = this.squad.palaceStandRank || 0;
    const preferredLane = ((idx - (n - 1) * 0.5) * (width / Math.max(3, n + 1))) + ((rank % 3) - 1) * 1.35;
    let best = null, bestScore = Infinity;
    let backup = null, backupScore = Infinity;
    for (const e of this.game.enemies) {
      if (!e.alive || e.flying || e.untargetableT > 0) continue;
      const ep = e.group.position;
      const off = ep.clone().sub(stand);
      const flatDist = Math.hypot(off.x, off.z);
      if (flatDist > radius + 5.0) continue;
      let lanePenalty = flatDist;
      if (dir && side) {
        const along = off.x * dir.x + off.z * dir.z;
        const lateralRaw = off.x * side.x + off.z * side.z;
        const lateral = Math.abs(lateralRaw);
        if (along < -8.5 || along > radius + 7 || lateral > width) continue;
        const laneFit = Math.abs(lateralRaw - preferredLane);
        lanePenalty = laneFit * 1.15 + lateral * 0.38 + Math.max(0, Math.abs(along) - 2) * 0.36;
      }
      const progressBonus = Math.min(10, (e.dist || 0) * 0.03);
      const blockedPenalty = e.blockedBy && e.blockedBy !== this ? 4.5 : 0;
      const bossBias = e.boss ? -2.2 : 0;
      const score = lanePenalty + blockedPenalty + bossBias - progressBonus;
      if (e.blockedBy && e.blockedBy !== this) {
        if (score < backupScore) { backupScore = score; backup = e; }
        continue;
      }
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best || backup;
  }

  update(dt, time) {
    if (!this.alive) {
      this.deadT -= dt;
      const animD = this.model.anim;
      if (animD?.actions.death) {
        animD.mixer.update(dt);
        if (!this._deathPlayed) { this._deathPlayed = true; animD.play('death', { fade: 0.12 }); }
      } else {
        this.group.rotation.x = Math.min(Math.PI / 2, this.group.rotation.x + dt * 3.5);
        this.group.position.y -= dt * 0.3;
      }
      return this.deadT > 0;
    }
    this.stunT -= dt; this.fearT -= dt;
    if (this.model.anim) this.model.anim.mixer.update(dt); // skeletal clip playback
    if (this.poisonT > 0) { this.poisonT -= dt; this.takeDamage(6 * dt, 'true'); if (!this.alive) return true; }
    if (this.sortieT > 0) this.sortieT = Math.max(0, this.sortieT - dt);
    if (this.gateReadT > 0) this.gateReadT = Math.max(0, this.gateReadT - dt);
    if (this.braceT > 0) {
      this.braceT = Math.max(0, this.braceT - dt);
      if (this.braceT <= 0) this.bracePower = 0;
    }
    if (this.stunT > 0) return true;

    const rig = this.model.rig;
    const pos = this.group.position;
    this._updateGateReadabilityScale();
    this._updatePalaceStandModelVisibility();

    // flee when feared
    if (this.fearT > 0) {
      const away = pos.clone().sub(this.squad.anchor).normalize();
      pos.addScaledVector(away.lengthSq() > 0.01 ? away : new THREE.Vector3(1, 0, 0), this.speed * dt);
      this._snapToGround();
      if (rig.legL) animWalk(rig, time + this.id, 1.4);
      return true;
    }

    // support behaviors: heal / repair
    if (this.def.behavior === 'support') {
      this._supportTick(dt, time);
      this._moveToward(this.squad.slotFor(this), dt, time, rig);
      return true;
    }

    // acquire / fight
    const leashAnchor = this.squad.palaceStandAnchor || this.squad.anchor;
    const leashRadius = this.squad.palaceStandAnchor ? PALACE_APPROACH_LEASH : LEASH_RADIUS;
    if (this.target && (!this.target.alive || this.target.group.position.distanceTo(leashAnchor) > leashRadius)) {
      if (this.target.blockedBy === this) this.target.blockedBy = null;
      this.target = null;
    }
    if (!this.target) this.target = this._findTarget();

    if (this.target) {
      const tp = this.target.group.position;
      const d = pos.distanceTo(tp);
      const isRanged = this.def.behavior === 'skirmish';
      const wantDist = isRanged ? 5.0 : 1.3;
      if (d > wantDist) {
        this._moveToward(tp, dt, time, rig, this.def.ability?.key === 'counterCharge' || this.def.ability?.key === 'hornCharge' ? 1.4 : 1);
        // trample: cavalry damages enemies ridden through
        if (this.def.ability?.key === 'trample') {
          for (const e of this.game.enemies) {
            if (e.alive && !e.flying && !e.boss && e.group.position.distanceTo(pos) < 1.4 && (e._trampleCd || 0) <= 0) {
              e._trampleCd = 1.0;
              const gateLineMult = this.squad.gateLineMultAt?.(pos) || 1;
              e.takeDamage(this.damage * gateLineMult * (1 + (this.squad.trampleBonus || 0)), 'impact', { impact: gateLineMult > 1 ? 0.55 : 0.25 });
            }
            if (e._trampleCd > 0) e._trampleCd -= dt;
          }
        }
      } else {
        // engage: block if melee
        if (!isRanged && !this.target.blockedBy) this.target.blockedBy = this;
        this.attackCd -= dt;
        if (this.attackCd <= 0) {
          const gateLineMult = this.squad.gateLineMultAt?.(pos) || 1;
          this.attackCd = 1 / (this.rate * (this.squad.rateMult || 1) * this.game.rhythmBonusAt(pos) * (gateLineMult > 1 ? 1.12 : 1));
          this._attackAnim = 0;
          this._lunge = 1;
          this.model.anim?.strike();
          if (!isRanged) this.game.meleeClash(pos.clone().lerp(tp, 0.5).setY(pos.y + 1.0));
          // capture locally: a killing first hit nulls this.target via enemy.die()
          const target = this.target;
          const dmg = this.damage * gateLineMult;
          if (this.model?.mounted && !isRanged && target?.group?.position && (gateLineMult > 1 || this.squad?.palaceStandAnchor)) {
            this.game.cavalryLanceBeat?.(this, target, gateLineMult);
          }
          if (gateLineMult > 1) this.game.particles.burst(pos.clone().setY(pos.y + 1.0), 4, { speed: 1.6, up: 1.0, life: 0.4, size: 0.3, color: FXC.gold, grav: 1.4, spread: 0.8 });
          if (this.def.ability?.key === 'armorBite') {
            target.takeDamage(dmg, 'arrow', { armorShred: 0.3 });
          } else if (this.def.ability?.key === 'hornCharge' && !this._charged) {
            this._charged = true;
            target.takeDamage(dmg * 2, 'impact', { impact: 0.55 });
          } else if (this.def.ability?.key === 'firePot') {
            target.takeDamage(dmg, 'fire', { impact: 0.32 });
            if (target.alive) target.applyBurn(4, 1.5);
            this.game.particles.burst(tp, 5, { speed: 1.5, life: 0.5, size: 0.4, color: FXC.ember, grav: -0.5 });
          } else if (this.def.ability?.key === 'bindCast' && Math.random() < 0.3) {
            target.takeDamage(dmg, 'impact', { impact: 0.45 });
            if (target.alive) target.applyBind(1.0);
            this.game.audio.chain();
          } else {
            target.takeDamage(dmg, isRanged ? 'arrow' : 'impact', { impact: gateLineMult > 1 ? 0.35 : 0 });
          }
          if (this.def.ability?.key === 'counterCharge' && target.alive) target.takeDamage(dmg * 0.3, 'impact', { impact: 0.35 });
        }
        this.group.rotation.y = Math.atan2(tp.x - pos.x, tp.z - pos.z);
        if (this.model.anim) this.model.anim.play('idle', this.model.mounted ? { timeScale: 0.18 } : undefined);
        else if (rig.legL && this.model.animType === 'biped') animIdle(rig, time + this.id);
      }
    } else {
      this._charged = false;
      // patrol or hold formation slot
      const slot = this.squad.slotFor(this);
      this._moveToward(slot, dt, time, rig);
    }

    if (this._attackAnim != null && rig.armR) {
      this._attackAnim += dt * 3;
      animAttack(rig, Math.min(1, this._attackAnim));
      if (this._attackAnim >= 1) this._attackAnim = null;
    }
    // melee lunge toward the foe and back
    if (this._lunge > 0) {
      this._lunge = Math.max(0, this._lunge - dt * 3.4);
      this.model.group.position.z = Math.sin(Math.min(1, this._lunge) * Math.PI) * 0.26;
    } else if (this.model.group.position.z !== 0) this.model.group.position.z = 0;
    this._updatePalaceStandModelVisibility();
    return true;
  }

  _supportTick(dt, time) {
    this.healCd -= dt;
    if (this.healCd > 0) return;
    const key = this.def.ability?.key;
    const pos = this.group.position;
    const palaceStand = this.squad.palaceStandAnchor;
    if (palaceStand && (key === 'standardAura' || key === 'featherMend' || key === 'masonRepair' || key === 'warRhythm' || key === 'lanternReveal')) {
      this.healCd = key === 'featherMend' ? 0.75 : 0.95;
      const radius = Math.max(10, (this.squad.palaceStandRadius || PALACE_APPROACH_RADIUS) * 0.58);
      const enemies = this.game.enemies
        .filter((e) => e.alive && !e.flying && e.untargetableT <= 0 && e.group.position.distanceTo(palaceStand) <= radius)
        .sort((a, b) => b.dist - a.dist)
        .slice(0, 3);
      for (const e of enemies) {
        if (key === 'lanternReveal') e.untargetableT = 0;
        e.applySlow(e.boss ? 0.86 : 0.72, 0.9);
        if (key === 'standardAura' || key === 'warRhythm') e.applyMark(0.08, 1.2);
        if (key === 'masonRepair') e.takeDamage(2.5 * this.squad.powerMult, 'impact', { command: true, impact: 0.12 });
      }
      for (const s of this.game.soldiersNear(pos, 8)) {
        if (s.alive && s.hp < s.maxHp && key === 'featherMend') s.hp = Math.min(s.maxHp, s.hp + 8 * this.squad.powerMult);
        if (s.alive && key === 'standardAura') s.fearT = 0;
      }
      const color = key === 'featherMend' ? FXC.heal : key === 'masonRepair' ? FXC.spark : FXC.gold;
      this.game.particles.burst(pos.clone().setY(pos.y + 1.15), enemies.length ? 5 : 2, {
        speed: enemies.length ? 1.5 : 0.7,
        up: 0.75,
        life: 0.55,
        size: 0.32,
        color,
        grav: 0.2,
        spread: enemies.length ? 1.2 : 0.55,
      });
      return;
    }
    if (key === 'featherMend' || key === 'standardAura' || key === 'warRhythm' || key === 'lanternReveal') {
      this.healCd = 1.0;
      if (key === 'featherMend') {
        for (const s of this.squad.tower ? this.game.soldiersNear(pos, 7) : []) {
          if (s.alive && s.hp < s.maxHp) {
            s.hp = Math.min(s.maxHp, s.hp + 6 * this.squad.powerMult);
            if (Math.random() < 0.3) this.game.particles.burst(s.group.position, 3, { speed: 0.8, life: 0.6, size: 0.35, color: FXC.heal, grav: -1 });
          }
        }
      }
      // standardAura/warRhythm handled via game.rhythmBonusAt / aura queries
    } else if (key === 'fieldRepair' || key === 'masonRepair') {
      this.healCd = 0.8;
      const rate = key === 'masonRepair' ? 14 : 8;
      for (const t of this.game.towers) {
        if (t.alive && t.hp < t.maxHp && t.pos.distanceTo(pos) < 9) {
          t.hp = Math.min(t.maxHp, t.hp + rate * this.squad.powerMult);
          this.game.particles.burst(t.pos.clone().setY(t.pos.y + 1.5), 3, { speed: 1.2, life: 0.5, size: 0.35, color: FXC.spark, grav: 3 });
          if (Math.random() < 0.4) this.game.audio.forgeHammer();
          break;
        }
      }
    } else this.healCd = 1;
  }

  _updateGateReadabilityScale() {
    if (!this._baseModelScale) return;
    const atPalaceGate = !!this.squad.palaceStandAnchor && (this.target || this.sortieT > 0 || this.squad.gateLineT > 0);
    const active = Math.max(0, this.gateReadT || 0);
    const floor = atPalaceGate ? 0.5 : 0;
    const k = Math.max(floor, Math.min(1, active / 0.72));
    const braceDur = Math.max(0.001, this.braceDur || 0.001);
    const braceK = this.braceT > 0 ? Math.sin(Math.max(0, Math.min(1, this.braceT / braceDur)) * Math.PI) : 0;
    const bracePower = braceK * Math.max(0, this.bracePower || 0);
    const boost = 1 + k * (this.model.mounted ? 0.22 : 0.32) + bracePower * (this.model.mounted ? 0.1 : 0.16);
    this.model.group.scale.copy(this._baseModelScale).multiplyScalar(boost);
    this.model.group.position.y = -bracePower * (this.model.mounted ? 0.035 : 0.075);
  }

  _updatePalaceStandModelVisibility() {
    const group = this.model?.group;
    if (!group) return;
    if (!this.squad?.palaceStandAnchor) {
      if (this._palaceModelHidden) {
        group.visible = true;
        this._palaceModelHidden = false;
      }
      return;
    }
    const activelyEngaging = !!(this.target?.alive)
      || (this.squad.palaceEngageT || 0) > 0.05
      || (this.braceT || 0) > 0.05;
    const shouldHide = !activelyEngaging;
    if (this._palaceModelHidden !== shouldHide) {
      group.visible = !shouldHide;
      this._palaceModelHidden = shouldHide;
    }
  }

  _moveToward(targetPos, dt, time, rig, speedMult = 1) {
    const pos = this.group.position;
    const d = pos.distanceTo(targetPos);
    if (d > 0.5) {
      const dir = targetPos.clone().sub(pos).normalize();
      const sortieBoost = this.sortieT > 0 ? (this.model.mounted ? 1.85 : 1.45) : 1;
      const moveMult = speedMult * sortieBoost;
      pos.addScaledVector(dir, Math.min(d, this.speed * moveMult * dt));
      this.group.rotation.y = Math.atan2(dir.x, dir.z);
      this._snapToGround();
      if (this.sortieT > 0 && Math.random() < dt * (this.model.mounted ? 9 : 5)) {
        this.game.particles.spawn(
          pos.x - dir.x * 0.35, pos.y + 0.18, pos.z - dir.z * 0.35,
          -dir.x * (1.0 + Math.random() * 0.7) + (Math.random() - 0.5) * 0.4,
          0.25 + Math.random() * 0.3,
          -dir.z * (1.0 + Math.random() * 0.7) + (Math.random() - 0.5) * 0.4,
          0.45, this.model.mounted ? 0.58 : 0.38,
          FXC.dust[0], FXC.dust[1], FXC.dust[2],
          1.8, 0.6,
        );
      }
      if (this.model.anim) { this.model.anim.play('walk', { timeScale: Math.max(0.6, moveMult) }); if (this.model.mounted && Math.random() < dt * 1.2) this.game.audio.gallop(); }
      else if (this.model.animType === 'quad' && rig.mount) { animQuad(rig.mount, time + this.id, moveMult); if (Math.random() < dt * 1.2) this.game.audio.gallop(); }
      else if (rig.legL) animWalk(rig, time + this.id, moveMult);
    } else {
      // a mounted GLB has only a gallop clip — ease it to a slow paw-in-place so it doesn't sprint while standing
      if (this.model.anim) this.model.anim.play('idle', this.model.mounted ? { timeScale: 0.18 } : undefined);
      else if (this.model.animType === 'quad' && rig.mount) animQuad(rig.mount, time + this.id, 0.1);
      else if (rig.legL) animIdle(rig, time + this.id);
    }
  }

  _snapToGround() {
    this.group.position.y = this.game.map.heightAt(this.group.position.x, this.group.position.z);
  }

  destroy() { this.game.scene.remove(this.group); }
}

export class Squad {
  constructor(game, tower, soldierDef, count) {
    this.game = game;
    this.tower = tower;
    this.def = soldierDef;
    this.size = count;
    this.members = [];
    this.respawnQueue = [];
    this.powerMult = 1;
    this.speedMult = 1;
    this.rateMult = 1;
    this.trampleBonus = 0;
    this.gateLineT = 0;
    this.gateLineAnchor = null;
    this.gateLineDir = null;
    this.gateLineRadius = 0;
    this.gateLineWidth = 0;
    this.gateLineMult = 1;
    this.gateLineDur = 0;
    this._gateLinePulseT = 0;
    this.rallyArrivalT = 0;
    this.rallyArrivalAnchor = null;
    this.rallyArrivalDone = false;
    this.palaceStandAnchor = null;
    this.palaceStandDir = null;
    this.palaceStandRadius = 0;
    this.palaceStandWidth = 0;
    this.palaceStandRank = 0;
    this.palaceStandDepth = 0;
    this.palaceStandSpread = 1;
    this.palaceSurgeT = 0;
    this.palaceSurgeDur = 0;
    this.palaceSurgePower = 0;
    this.palaceEngageT = 0;
    this.palaceEngageDur = 0;
    this.palaceEngagePower = 0;
    this.palaceEngagePoint = null;
    this.gateBraceT = 0;
    this.gateBraceDur = 0;
    this.gateBracePower = 0;
    // anchor: nearest road point to the tower
    const road = game.map._nearRoad(tower.pos.x, tower.pos.z, 12);
    this.homeAnchor = road ? road.pos.clone() : tower.pos.clone();
    this.anchor = this.homeAnchor.clone();
    this.rallyOverride = null;
    this.patrolT = 0;
    this.patrolDir = 1;
    for (let i = 0; i < count; i++) this.members.push(new Soldier(game, this, soldierDef));
  }

  setRally(point, { silent = false } = {}) {
    this.rallyOverride = point.clone();
    this.anchor = this.rallyOverride;
    this.palaceStandAnchor = null;
    this.palaceStandDir = null;
    this.palaceStandDepth = 0;
    this.palaceStandSpread = 1;
    this.members.forEach((m) => m._updatePalaceStandModelVisibility?.());
    if (!silent) this.game.audio.hornCall();
  }

  setPalaceStand(point, dir, { rank = 0, radius = PALACE_APPROACH_RADIUS, width = 8.5, depth = 0.35, spread = 1 } = {}) {
    this.palaceStandAnchor = point.clone();
    this.palaceStandDir = dir?.clone?.() || new THREE.Vector3(0, 0, -1);
    if (this.palaceStandDir.lengthSq() < 0.01) this.palaceStandDir.set(0, 0, -1);
    this.palaceStandDir.normalize();
    this.palaceStandRadius = radius;
    this.palaceStandWidth = width;
    this.palaceStandRank = rank;
    this.palaceStandDepth = depth;
    this.palaceStandSpread = spread;
    this._palaceStandPulseT = 0;
    this.members.forEach((m) => m._updatePalaceStandModelVisibility?.());
  }

  triggerPalaceSurge(enemy = null, { dur = 0.95, power = 1 } = {}) {
    if (!this.palaceStandAnchor) return;
    this.palaceSurgeT = Math.max(this.palaceSurgeT || 0, dur);
    this.palaceSurgeDur = Math.max(this.palaceSurgeDur || 0, dur);
    this.palaceSurgePower = Math.max(this.palaceSurgePower || 0, power);
    const ep = enemy?.group?.position;
    const fighters = this.members
      .filter((m) => m.alive && m.def.behavior !== 'support' && m.fearT <= 0)
      .sort((a, b) => {
        if (!ep) return this.members.indexOf(a) - this.members.indexOf(b);
        return a.group.position.distanceTo(ep) - b.group.position.distanceTo(ep);
      });
    for (const m of fighters.slice(0, Math.min(4, fighters.length))) {
      m.sortieT = Math.max(m.sortieT || 0, m.model?.mounted ? 1.35 : 1.0);
      m.gateReadT = Math.max(m.gateReadT || 0, m.model?.mounted ? 0.82 : 0.95);
      if (enemy?.alive) m.target = enemy;
    }
  }

  triggerGateBrace(front = null, { dur = 0.72, power = 1 } = {}) {
    const anchor = front?.clone?.() || this.gateLineAnchor || this.palaceStandAnchor || this.anchor;
    this.gateBraceT = Math.max(this.gateBraceT || 0, dur);
    this.gateBraceDur = Math.max(this.gateBraceDur || 0, dur);
    this.gateBracePower = Math.max(this.gateBracePower || 0, power);
    const fighters = this.members
      .filter((m) => m.alive && m.fearT <= 0)
      .sort((a, b) => a.group.position.distanceTo(anchor) - b.group.position.distanceTo(anchor));
    for (const m of fighters.slice(0, Math.min(6, fighters.length))) {
      m.braceT = Math.max(m.braceT || 0, dur);
      m.braceDur = Math.max(m.braceDur || 0, dur);
      m.bracePower = Math.max(m.bracePower || 0, power);
      m.gateReadT = Math.max(m.gateReadT || 0, dur + 0.2);
    }
  }

  markPalaceRally(point, { dur = 14, gateDur = 5.5, radius = 7.5, mult = 1.18, dir = null } = {}) {
    this.rallyArrivalAnchor = point.clone();
    this.rallyArrivalT = dur;
    this.rallyArrivalDone = false;
    this._rallyGateDur = gateDur;
    this._rallyGateRadius = radius;
    this._rallyGateMult = mult;
    this._rallyGateDir = dir?.clone?.() || this.palaceStandDir?.clone?.() || null;
  }

  clearRally() {
    this.rallyOverride = null;
    this.anchor = this.homeAnchor.clone();
    this.palaceStandAnchor = null;
    this.palaceStandDir = null;
    this.palaceStandDepth = 0;
    this.palaceStandSpread = 1;
    this.palaceSurgeT = 0;
    this.palaceSurgeDur = 0;
    this.palaceSurgePower = 0;
    this.palaceEngageT = 0;
    this.palaceEngageDur = 0;
    this.palaceEngagePower = 0;
    this.palaceEngagePoint = null;
    this.gateBraceT = 0;
    this.gateBraceDur = 0;
    this.gateBracePower = 0;
    this.members.forEach((m) => m._updatePalaceStandModelVisibility?.());
  }

  slotFor(soldier) {
    const idx = this.members.indexOf(soldier);
    const n = Math.max(1, this.members.length);
    if (this.palaceStandAnchor) {
      const dir = this.palaceStandDir?.clone?.() || new THREE.Vector3(0, 0, -1);
      if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); else dir.normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const rank = this.palaceStandRank || 0;
      const spread = this.palaceStandSpread || 1;
      const width = this.palaceStandWidth || Math.max(9, (this.palaceStandRadius || PALACE_APPROACH_RADIUS) * 0.62);
      const holdingGate = this.gateLineT > 0.05 && this.gateLineAnchor;
      const holdK = holdingGate
        ? Math.max(0, Math.min(1, (this.gateLineT || 0) / Math.max(0.001, this.gateLineDur || this.gateLineT || 1)))
        : 0;
      const rankLane = ((rank % 3) - 1) * 2.55 * spread;
      const rankRow = Math.floor(rank / 3) * 1.15;
      const laneStep = (this.def.mounted ? 1.95 : 1.42) * spread * (1 + holdK * 0.16);
      const memberLane = (idx - (n - 1) * 0.5) * laneStep;
      const looseRow = (this.palaceStandDepth || 0) + (idx % 2) * 0.58 + Math.floor(idx / 4) * 0.78;
      const holdRow = (this.palaceStandDepth || 0) * 0.35 + Math.floor(idx / 5) * (this.def.mounted ? 0.7 : 0.48);
      const memberRow = looseRow * (1 - holdK) + holdRow * holdK;
      const surgeK = this.palaceSurgeDur > 0 ? Math.max(0, Math.min(1, this.palaceSurgeT / this.palaceSurgeDur)) : 0;
      const surge = Math.sin(surgeK * Math.PI) * Math.max(0, this.palaceSurgePower || 0) * (this.def.mounted ? 3.3 : 2.4);
      let engageLead = 0;
      let engageLane = 0;
      if (this.palaceEngagePoint && this.palaceEngageDur > 0 && this.palaceEngageT > 0) {
        const engageK = Math.max(0, Math.min(1, this.palaceEngageT / this.palaceEngageDur));
        const engageEase = Math.sin(engageK * Math.PI * 0.5) * Math.max(0, this.palaceEngagePower || 0);
        const off = this.palaceEngagePoint.clone().sub(this.palaceStandAnchor);
        const along = off.x * dir.x + off.z * dir.z;
        const lateral = off.x * side.x + off.z * side.z;
        const maxLead = this.def.mounted ? 10.5 : 7.6;
        engageLead = Math.max(0, Math.min(maxLead, along - memberRow * 0.55)) * engageEase;
        engageLane = Math.max(-width * 0.22, Math.min(width * 0.22, lateral * 0.38)) * engageEase;
      }
      const slot = this.palaceStandAnchor.clone()
        .addScaledVector(side, rankLane + memberLane + engageLane)
        .addScaledVector(dir, rankRow + memberRow + surge + engageLead);
      slot.y = this.game.map.heightAt(slot.x, slot.z);
      return slot;
    }
    const a = (idx / n) * Math.PI * 2;
    const r = n > 1 ? 1.1 : 0;
    return this.anchor.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }

  onMemberDied(s) {
    if (this.royalGateGuardT > 0) return;
    this.respawnQueue.push({ t: 8 });
  }

  gateLineMultAt(pos) {
    if (this.gateLineT <= 0 || !this.gateLineAnchor) return 1;
    return pos.distanceTo(this.gateLineAnchor) <= this.gateLineRadius ? this.gateLineMult : 1;
  }

  _gateLineIntercept(dt) {
    if (this.gateLineT <= 0 || !this.gateLineAnchor) return;
    const fighters = this.members.filter((m) => m.alive && m.def.behavior !== 'support' && m.fearT <= 0);
    const dir = this.gateLineDir?.clone?.();
    if (dir && dir.lengthSq() > 0.01) dir.normalize();
    const side = dir ? new THREE.Vector3(-dir.z, 0, dir.x) : null;
    const width = this.gateLineWidth || this.gateLineRadius;
    for (const e of this.game.enemies) {
      if (e._gateCheckCd > 0) e._gateCheckCd -= dt;
      if (!e.alive || e.flying || e.untargetableT > 0 || e._gateCheckCd > 0) continue;
      const ep = e.group.position;
      const off = ep.clone().sub(this.gateLineAnchor);
      const flatDist = Math.hypot(off.x, off.z);
      if (flatDist > this.gateLineRadius + 1.2) continue;
      if (dir && side) {
        const along = off.x * dir.x + off.z * dir.z;
        const lateral = Math.abs(off.x * side.x + off.z * side.z);
        const forwardWindow = this.palaceStandAnchor ? Math.min(7.2, this.gateLineRadius * 0.58) : 3.2;
        const backWindow = this.palaceStandAnchor ? 3.8 : 3.2;
        if (along < -backWindow || along > forwardWindow || lateral > width * 0.72) continue;
      }
      const dmg = Math.max(4, this.def.damage * this.powerMult * (e.boss ? 0.24 : 0.46) * Math.max(1, (this.gateLineMult || 1) * 0.72));
      e._gateCheckCd = e.boss ? 1.6 : 1.05;
      e.gateReadT = Math.max(e.gateReadT || 0, e.boss ? 0.7 : 0.95);
      e.reactGateLine?.(this.gateLineAnchor, dir, this.gateLineMult || 1);
      this.game.gateClashBeat?.(this.gateLineAnchor, e, this.gateLineMult || 1);
      this.triggerPalaceSurge(e, { dur: e.boss ? 1.25 : 0.92, power: e.boss ? 1.25 : 1 });
      e.applySlow(e.boss ? 0.78 : 0.58, e.boss ? 0.65 : 1.15);
      e.takeDamage(dmg, 'impact', { command: true, impact: 0.65 });
      this.game.particles.burst(ep.clone().setY(ep.y + 1.0), e.boss ? 9 : 6, { speed: 2.0, up: 1.3, life: 0.45, size: 0.36, color: FXC.gold, grav: 1.8, spread: 1.0 });
      this.game.meleeClash(ep.clone().setY(ep.y + 1.0), e.boss);
      if (!e.alive) continue;
      if (!fighters.length) continue;
      fighters
        .sort((a, b) => a.group.position.distanceTo(ep) - b.group.position.distanceTo(ep))
        .slice(0, Math.min(this.palaceStandAnchor ? 5 : 3, fighters.length))
        .forEach((m) => {
          m.gateReadT = Math.max(m.gateReadT || 0, m.model?.mounted ? 0.82 : 0.95);
          if (m.target && m.target.alive && m.target.group.position.distanceTo(m.group.position) < ep.distanceTo(m.group.position)) return;
          m.target = e;
          if (!e.blockedBy && m.def.behavior !== 'skirmish' && m.group.position.distanceTo(ep) < 2.6) e.blockedBy = m;
        });
    }
  }

  _palaceRallyArrival(dt, time = 0) {
    if (this.rallyArrivalT <= 0 || this.rallyArrivalDone || !this.rallyArrivalAnchor) return;
    this.rallyArrivalT = Math.max(0, this.rallyArrivalT - dt);
    const arrived = this.members.some((m) => m.alive && m.group.position.distanceTo(this.rallyArrivalAnchor) < 2.7);
    if (!arrived && this.rallyArrivalT > 0) return;
    this.rallyArrivalDone = true;
    this.gateLineT = Math.max(this.gateLineT, this._rallyGateDur || 5.5);
    this.gateLineDur = Math.max(this.gateLineDur || 0, this.gateLineT);
    this.gateLineAnchor = this.rallyArrivalAnchor.clone();
    this.gateLineDir = this._rallyGateDir?.clone?.() || this.palaceStandDir?.clone?.() || null;
    if (this.gateLineDir && this.gateLineDir.lengthSq() > 0.01) this.gateLineDir.normalize();
    this.gateLineRadius = Math.max(this.gateLineRadius || 0, this._rallyGateRadius || 7.5);
    this.gateLineWidth = Math.max(this.gateLineWidth || 0, Math.max(5.5, Math.min(9, this.gateLineRadius * 1.12)));
    this.gateLineMult = Math.max(this.gateLineMult || 1, this._rallyGateMult || 1.18);
    this.game.particles.burst(this.rallyArrivalAnchor.clone().setY(this.rallyArrivalAnchor.y + 1.0), 18, { speed: 2.1, up: 1.4, life: 0.75, size: 0.45, color: FXC.gold, grav: 0.6, spread: 2.2 });
    if (time - (this.game._lastRallyArrivalHorn || -99) > 0.75) {
      this.game._lastRallyArrivalHorn = time;
      this.game.audio.hornCall();
    }
  }

  _maintainPalaceStand(dt, time = 0) {
    if (!this.palaceStandAnchor) return;
    this._palaceStandPulseT = Math.max(0, (this._palaceStandPulseT || 0) - dt);
    const radius = Math.max(PALACE_APPROACH_RADIUS, this.palaceStandRadius || 0);
    const dir = this.palaceStandDir?.clone?.() || new THREE.Vector3(0, 0, -1);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); else dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const width = this.palaceStandWidth || Math.max(9, radius * 0.62);
    const threats = this.game.enemies
      .filter((e) => e.alive && !e.flying && e.untargetableT <= 0 && e.group.position.distanceTo(this.palaceStandAnchor) <= radius + 5)
      .map((e) => {
        const off = e.group.position.clone().sub(this.palaceStandAnchor);
        return {
          e,
          along: off.x * dir.x + off.z * dir.z,
          lateral: off.x * side.x + off.z * side.z,
          d: Math.hypot(off.x, off.z),
        };
      })
      .filter((t) => t.along >= -8.5 && t.along <= radius + 7 && Math.abs(t.lateral) <= width + 1.5)
      .sort((a, b) => (b.e.boss ? 1 : 0) - (a.e.boss ? 1 : 0) || (b.e.dist || 0) - (a.e.dist || 0) || a.d - b.d);
    const focus = threats[0]?.e;
    if (!focus) return;
    this.game.palaceThreatCue?.(this.palaceStandAnchor, threats.map((t) => t.e));
    this.gateLineT = Math.max(this.gateLineT || 0, focus.boss ? 1.85 : 1.45);
    this.gateLineDur = Math.max(this.gateLineDur || 0, focus.boss ? 1.85 : 1.45);
    this.gateLineAnchor = this.palaceStandAnchor.clone();
    this.gateLineDir = dir.clone();
    if (this.gateLineDir && this.gateLineDir.lengthSq() > 0.01) this.gateLineDir.normalize();
    this.gateLineRadius = Math.max(this.gateLineRadius || 0, Math.min(this.def.mounted ? 16 : 14, radius * 0.55));
    this.gateLineWidth = Math.max(this.gateLineWidth || 0, Math.max(9.5, (this.palaceStandWidth || 9) * 1.05));
    this.gateLineMult = Math.max(this.gateLineMult || 1, this.def.mounted ? 1.5 : 1.36);
    this.palaceEngageT = Math.max(this.palaceEngageT || 0, focus.boss ? 1.15 : 0.88);
    this.palaceEngageDur = Math.max(this.palaceEngageDur || 0, this.palaceEngageT);
    this.palaceEngagePower = Math.max(this.palaceEngagePower || 0, focus.boss ? 1.0 : 0.86);
    this.palaceEngagePoint = focus.group.position.clone();
    const fighters = this.members
      .filter((m) => m.alive && m.def.behavior !== 'support' && m.fearT <= 0)
      .sort((a, b) => this.members.indexOf(a) - this.members.indexOf(b));
    fighters.slice(0, Math.min(5, fighters.length)).forEach((m) => {
      const idx = Math.max(0, this.members.indexOf(m));
      const preferredLane = (idx - (fighters.length - 1) * 0.5) * (width / Math.max(3, fighters.length + 1));
      const assigned = threats
        .filter((t) => !t.e.blockedBy || t.e.blockedBy === m || m.def.behavior === 'skirmish')
        .sort((a, b) => Math.abs(a.lateral - preferredLane) - Math.abs(b.lateral - preferredLane) || (b.e.dist || 0) - (a.e.dist || 0))[0]?.e || focus;
      m.gateReadT = Math.max(m.gateReadT || 0, m.model?.mounted ? 0.82 : 0.95);
      if (!m.target || !m.target.alive || m.target.group.position.distanceTo(m.group.position) > assigned.group.position.distanceTo(m.group.position) + 3) {
        m.target = assigned;
        m.sortieT = Math.max(m.sortieT || 0, m.model?.mounted ? 1.4 : 0.95);
      }
      if (!assigned.blockedBy && m.def.behavior !== 'skirmish' && m.group.position.distanceTo(assigned.group.position) < 3.2) assigned.blockedBy = m;
    });
    if (this._palaceStandPulseT <= 0) {
      this._palaceStandPulseT = focus.boss ? 0.38 : 0.46;
      this.triggerPalaceSurge(focus, { dur: focus.boss ? 1.1 : 0.82, power: focus.boss ? 1.12 : 0.82 });
      this.game.particles.burst(this.palaceStandAnchor.clone().setY(this.palaceStandAnchor.y + 0.55), 8, {
        speed: 1.4,
        up: 0.8,
        life: 0.55,
        size: 0.34,
        color: FXC.gold,
        grav: 0.6,
        spread: Math.max(1.6, this.gateLineRadius * 0.38),
      });
      if (time - (this.game._lastGateStandClash || -99) > 0.5) {
        this.game._lastGateStandClash = time;
        this.game.defenderLineFlash?.(this.palaceStandAnchor, focus, this.gateLineMult || 1);
        this.game.meleeClash(focus.group.position.clone().setY(focus.group.position.y + 0.9), focus.boss);
      }
    }
  }

  update(dt, time) {
    this._palaceRallyArrival(dt, time);
    this._maintainPalaceStand(dt, time);
    if (this.palaceSurgeT > 0) {
      this.palaceSurgeT = Math.max(0, this.palaceSurgeT - dt);
      if (this.palaceSurgeT <= 0) this.palaceSurgePower = 0;
    }
    if (this.palaceEngageT > 0) {
      this.palaceEngageT = Math.max(0, this.palaceEngageT - dt);
      if (this.palaceEngageT <= 0) {
        this.palaceEngagePower = 0;
        this.palaceEngagePoint = null;
      }
    }
    if (this.gateBraceT > 0) {
      this.gateBraceT = Math.max(0, this.gateBraceT - dt);
      if (this.gateBraceT <= 0) this.gateBracePower = 0;
    }
    if (this.gateLineT > 0) {
      this.gateLineT = Math.max(0, this.gateLineT - dt);
      this._gateLineIntercept(dt);
      this._gateLinePulseT -= dt;
      if (this.gateLineAnchor && this._gateLinePulseT <= 0) {
        this._gateLinePulseT = 0.18;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * Math.max(1, this.gateLineRadius);
        this.game.particles.spawn(
          this.gateLineAnchor.x + Math.cos(a) * r,
          this.gateLineAnchor.y + 0.25,
          this.gateLineAnchor.z + Math.sin(a) * r,
          0, 0.55 + Math.random() * 0.35, 0,
          0.6, 0.32, FXC.gold[0], FXC.gold[1], FXC.gold[2],
          -0.4, 0.2,
        );
      }
    }
    // patrol drift along road
    if (!this.rallyOverride && (this.def.behavior === 'patrol' || this.def.behavior === 'skirmish')) {
      this.patrolT += dt * this.patrolDir * (this.def.behavior === 'patrol' ? 0.9 : 0.6) * this.speedMult;
      if (Math.abs(this.patrolT) > 7) this.patrolDir *= -1;
      const road = this.game.map._nearRoad(this.homeAnchor.x, this.homeAnchor.z, 12);
      if (road) {
        const t = road.tangent;
        this.anchor.copy(this.homeAnchor).add(new THREE.Vector3(t.x * this.patrolT, 0, t.z * this.patrolT));
      }
    }
    // respawns at the tower
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      this.respawnQueue[i].t -= dt * (this.tower?.alive ? 1 : 0);
      if (this.respawnQueue[i].t <= 0) {
        this.respawnQueue.splice(i, 1);
        const s = new Soldier(this.game, this, this.def);
        s.group.position.copy(this.tower.pos);
        this.members.push(s);
      }
    }
    for (let i = this.members.length - 1; i >= 0; i--) {
      const keep = this.members[i].update(dt, time);
      if (!keep) { this.members[i].destroy(); this.members.splice(i, 1); }
    }
  }

  destroy() {
    for (const m of this.members) {
      if (m.target && m.target.blockedBy === m) m.target.blockedBy = null;
      m.destroy();
    }
    this.members.length = 0;
    this.respawnQueue.length = 0;
  }
}
