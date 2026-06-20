// Mid-battle snapshot — persists the live state of a stage to localStorage so leaving, reloading,
// or closing the tab and coming back resumes the exact moment (towers, economy, wave + spawn queue,
// live enemies, palace cooldowns) instead of restarting. ONE active battle is kept (single key).
// Transient VFX (projectiles, particles, debris) are intentionally dropped — they respawn cleanly.
// Never-break: any parse/quota error → treated as "no save" (graceful New Game).
import { TOWERS_BY_ID } from '../data/towers.js';
import { ENEMIES_BY_ID } from '../data/enemies.js';
import { HEROES } from '../data/heroes.js';

const KEY = 'std.battle.v1';
const VER = 3; // bump when the snapshot shape changes so stale saves are ignored, not mis-read

// Build a plain-data snapshot of the battle. Returns null for states that should NOT be saved
// (sandbox, already won/lost) — the caller clears the slot in that case.
export function serializeBattle(game) {
  if (!game || game.sandbox || game.phase === 'won' || game.phase === 'lost') return null;
  const pads = game.map.pads;
  const cit = game.map.citadel;
  return {
    ver: VER,
    mapId: game.mapDef.id,
    endless: !!game.endlessMode,
    savedAt: Date.now(),
    gold: game.gold,
    lives: game.lives,
    waveIdx: game.waveIdx,
    phase: game.phase,
    waveActive: !!game.waveActive,
    waveCountdown: game.waveCountdown || 0,
    waveT: game.waveT || 0,
    waveHpMult: game.waveHpMult || 1,
    waveMod: game.waveMod || null,
    waveStartLives: game._waveStartLives ?? game.lives,
    farr: game.farr || 0,
    oathT: game.oathT || 0,
    bossChallenge: game.bossChallenge ? {
      defId: game.bossChallenge.defId,
      t: game.bossChallenge.t,
      dur: game.bossChallenge.dur,
      startHp: game.bossChallenge.startHp,
      targetHp: game.bossChallenge.targetHp,
      hpFrac: game.bossChallenge.hpFrac,
      rewardFarr: game.bossChallenge.rewardFarr,
      rewardGold: game.bossChallenge.rewardGold,
      failSpeed: game.bossChallenge.failSpeed,
      failDamage: game.bossChallenge.failDamage,
      failType: game.bossChallenge.failType,
      successType: game.bossChallenge.successType,
    } : null,
    spawnQueue: (game.spawnQueue || []).map((e) => ({ ...e })),
    palace: (cit && cit.isPalace) ? { musterCd: cit.musterCd || 0, boonCd: cit.boonCd || 0, gateCommandCd: cit.gateCommandCd || 0 } : null,
    towers: game.towers.filter((t) => t.alive).map((t) => ({
      defId: t.def.id,
      padIndex: pads.indexOf(t.pad),
      ageIdx: t.ageIdx,
      hp: Math.round(t.hp),
      invested: t.invested,
      heroId: t.hero?.id || null,
      heroActiveCd: t.heroActiveCd || 0,
      palaceDamageT: t.palaceDamageT || 0,
      palaceDamageBonus: t.palaceDamageBonus || 0,
      palaceRangeT: t.palaceRangeT || 0,
      palaceRangeBonus: t.palaceRangeBonus || 0,
    })),
    enemies: game.enemies.filter((e) => e.alive && !e.reachedEnd).map((e) => ({
      defId: e.def.id,
      pathIndex: e.pathIndex,
      dist: e.dist,
      hp: Math.round(e.hp),
      isLarva: !!e.isLarva,
      boss: !!e.boss,
      slows: (e.slows || []).map((s) => ({ ...s })),
      burns: (e.burns || []).map((b) => ({ ...b })),
      stunT: e.stunT || 0, bindT: e.bindT || 0, markT: e.markT || 0, markBonus: e.markBonus || 0,
      fogBrokenT: e.fogBrokenT || 0,
      siegeSilencedT: e.siegeSilencedT || 0,
      broodSilencedT: e.broodSilencedT || 0,
      counselBrokenT: e.counselBrokenT || 0,
      feudBrokenT: e.feudBrokenT || 0,
      guardBrokenT: e.guardBrokenT || 0,
    })),
  };
}

export function saveBattle(game) {
  const snap = serializeBattle(game);
  if (!snap || !snap.towers.length && snap.waveIdx === 0 && snap.spawnQueue.length === 0) {
    // nothing meaningful yet (fresh build phase, no towers) → don't create a save
    if (!snap) clearBattle();
    return;
  }
  try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch { /* quota/blocked → skip */ }
}

export function loadBattle(mapId) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.ver !== VER) return null;
    if (mapId && s.mapId !== mapId) return null;
    return s;
  } catch { return null; }
}

export function hasBattle(mapId) { return !!loadBattle(mapId); }
export function clearBattle() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

// Rebuild a freshly-constructed Game's state from a snapshot (called right after `new Game`, before
// the first update). The map/terrain/pads/paths are deterministic per mapDef, so only the placed
// towers + live enemies + economy + wave state need restoring. Reuses the same entity constructors
// the game uses at runtime, then overwrites their fields. Imports live here (not in game.js) to keep
// the dependency one-way.
export function applyBattleSnapshot(game, s) {
  if (!game || !s) return;
  game.endlessMode = !!s.endless;
  game.gold = s.gold;
  game.lives = s.lives;
  game.waveIdx = s.waveIdx || 0;
  game.phase = s.phase || 'build';
  game.waveActive = !!s.waveActive;
  game.waveCountdown = s.waveCountdown || 0;
  game.waveT = s.waveT || 0;
  game.waveHpMult = s.waveHpMult || 1;
  game.waveMod = s.waveMod || null;
  game._waveStartLives = s.waveStartLives ?? game.lives;
  game.farr = Math.max(0, Math.min(game.farrMax || 100, s.farr ?? game.farr ?? 0));
  game.oathT = s.oathT || 0;
  game.spawnQueue = (s.spawnQueue || []).map((e) => ({ ...e }));

  for (const ts of s.towers || []) {
    const def = TOWERS_BY_ID[ts.defId];
    const pad = game.map.pads[ts.padIndex];
    if (!def || !pad || pad.tower) continue;
    const tower = game._restoreTower(def, pad, ts, HEROES);
    if (tower) { pad.tower = tower; game.towers.push(tower); }
  }

  for (const es of s.enemies || []) {
    const def = ENEMIES_BY_ID[es.defId];
    if (!def) continue;
    game._restoreEnemy(def, es);
  }
  game._restoreBossChallenge?.(s.bossChallenge);

  const cit = game.map.citadel;
  if (cit && cit.isPalace && s.palace) { cit.musterCd = s.palace.musterCd || 0; cit.boonCd = s.palace.boonCd || 0; cit.gateCommandCd = s.palace.gateCommandCd || 0; }

  // push the restored numbers to the HUD
  game.emit('goldChanged', game.gold);
  game.emit('livesChanged', game.lives);
  game.emit('farrChanged', { farr: game.farr, max: game.farrMax || 100, ready: game.farr >= (game.farrMax || 100), reason: 'restore' });
  game.emit('towersChanged');
  game.emit('countdownTick', { remaining: Math.max(0, game.waveCountdown), bonus: game.earlyBonus() });
}
