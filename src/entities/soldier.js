// Soldier squads — spawned by barracks towers. They hold the road, patrol,
// intercept and block enemies, rally to player-chosen points, heal/repair,
// and use squad-specific abilities. Fallen members respawn at the tower.
import * as THREE from 'three';
import { buildSoldierModel, animQuad } from '../models/creature.js';
import { animWalk, animIdle, animAttack } from '../models/humanoid.js';
import { FXC } from '../fx/particles.js';

const ENGAGE_RADIUS = 8;       // from anchor
const LEASH_RADIUS = 14;

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
    this.group = new THREE.Group();
    this.group.add(this.model.group);
    game.scene.add(this.group);
    this.group.position.copy(squad.anchor).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
    this.healCd = 0;
    this.deadT = 0;
  }

  takeDamage(amount, dmgType = 'impact') {
    if (!this.alive) return;
    let dmg = amount;
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
    if (this.stunT > 0) return true;

    const rig = this.model.rig;
    const pos = this.group.position;

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
    if (this.target && (!this.target.alive || this.target.group.position.distanceTo(this.squad.anchor) > LEASH_RADIUS)) {
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
              e.takeDamage(this.damage * (1 + (this.squad.trampleBonus || 0)), 'impact');
            }
            if (e._trampleCd > 0) e._trampleCd -= dt;
          }
        }
      } else {
        // engage: block if melee
        if (!isRanged && !this.target.blockedBy) this.target.blockedBy = this;
        this.attackCd -= dt;
        if (this.attackCd <= 0) {
          this.attackCd = 1 / (this.rate * (this.squad.rateMult || 1) * this.game.rhythmBonusAt(pos));
          this._attackAnim = 0;
          this._lunge = 1;
          this.model.anim?.strike();
          if (!isRanged) this.game.meleeClash(pos.clone().lerp(tp, 0.5).setY(pos.y + 1.0));
          const dmg = this.damage;
          // capture locally: a killing first hit nulls this.target via enemy.die()
          const target = this.target;
          if (this.def.ability?.key === 'armorBite') {
            target.takeDamage(dmg, 'arrow', { armorShred: 0.3 });
          } else if (this.def.ability?.key === 'hornCharge' && !this._charged) {
            this._charged = true;
            target.takeDamage(dmg * 2, 'impact');
          } else if (this.def.ability?.key === 'firePot') {
            target.takeDamage(dmg, 'fire');
            if (target.alive) target.applyBurn(4, 1.5);
            this.game.particles.burst(tp, 5, { speed: 1.5, life: 0.5, size: 0.4, color: FXC.ember, grav: -0.5 });
          } else if (this.def.ability?.key === 'bindCast' && Math.random() < 0.3) {
            target.takeDamage(dmg, 'impact');
            if (target.alive) target.applyBind(1.0);
            this.game.audio.chain();
          } else {
            target.takeDamage(dmg, isRanged ? 'arrow' : 'impact');
          }
          if (this.def.ability?.key === 'counterCharge' && target.alive) target.takeDamage(dmg * 0.3, 'impact');
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
    return true;
  }

  _supportTick(dt, time) {
    this.healCd -= dt;
    if (this.healCd > 0) return;
    const key = this.def.ability?.key;
    const pos = this.group.position;
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

  _moveToward(targetPos, dt, time, rig, speedMult = 1) {
    const pos = this.group.position;
    const d = pos.distanceTo(targetPos);
    if (d > 0.5) {
      const dir = targetPos.clone().sub(pos).normalize();
      pos.addScaledVector(dir, Math.min(d, this.speed * speedMult * dt));
      this.group.rotation.y = Math.atan2(dir.x, dir.z);
      this._snapToGround();
      if (this.model.anim) { this.model.anim.play('walk', { timeScale: Math.max(0.6, speedMult) }); if (this.model.mounted && Math.random() < dt * 1.2) this.game.audio.gallop(); }
      else if (this.model.animType === 'quad' && rig.mount) { animQuad(rig.mount, time + this.id, speedMult); if (Math.random() < dt * 1.2) this.game.audio.gallop(); }
      else if (rig.legL) animWalk(rig, time + this.id, speedMult);
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
    // anchor: nearest road point to the tower
    const road = game.map._nearRoad(tower.pos.x, tower.pos.z, 12);
    this.homeAnchor = road ? road.pos.clone() : tower.pos.clone();
    this.anchor = this.homeAnchor.clone();
    this.rallyOverride = null;
    this.patrolT = 0;
    this.patrolDir = 1;
    for (let i = 0; i < count; i++) this.members.push(new Soldier(game, this, soldierDef));
  }

  setRally(point) {
    this.rallyOverride = point.clone();
    this.anchor = this.rallyOverride;
    this.game.audio.hornCall();
  }

  clearRally() { this.rallyOverride = null; this.anchor = this.homeAnchor.clone(); }

  slotFor(soldier) {
    const idx = this.members.indexOf(soldier);
    const n = Math.max(1, this.members.length);
    const a = (idx / n) * Math.PI * 2;
    const r = n > 1 ? 1.1 : 0;
    return this.anchor.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }

  onMemberDied(s) {
    this.respawnQueue.push({ t: 8 });
  }

  update(dt, time) {
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
