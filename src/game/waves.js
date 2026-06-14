// Wave director — data-driven composition from each map's themed enemy roster.
// Budget grows per wave; bosses arrive on their authored wave with escorts.
// Endless mode keeps scaling hp/budget beyond the campaign waves.
import { ENEMIES_BY_ID } from '../data/enemies.js';
import { makeRng } from '../world/noise.js';
import { pickWaveMod } from './wavemods.js';

function enemyCost(def) { return def.hp * 0.035 + def.bounty * 1.1 + (def.boss ? 400 : 0); }

export function makeWave(mapDef, waveIdx, endless = false) {
  const rng = makeRng(`wave:${mapDef.id}:${waveIdx}`);
  const order = mapDef.order;
  const isBossWave = mapDef.boss && (waveIdx === mapDef.bossWave || (endless && waveIdx % 10 === 0));
  // random wave modifier (never on boss waves) — tweaks count + hp here; speed/armor/bounty downstream
  const modifier = isBossWave ? null : pickWaveMod(mapDef.id, waveIdx);
  const budget = 110 * Math.pow(1.22, waveIdx - 1) * (1 + order * 0.05) * (modifier?.countMult || 1);
  const hpMult = (endless ? Math.pow(1.09, waveIdx - mapDef.waves) : 1) * (1 + Math.max(0, waveIdx - 6) * 0.04) * (modifier?.hpFactor || 1);
  const roster = mapDef.themes.map((id) => ENEMIES_BY_ID[id]).filter((d) => d && !d.boss);
  const entries = [];
  let spent = 0;
  let t = 0.5;

  // grouped squads: pick a type, spawn 3-6 of it in a tight column, repeat
  let guard = 60;
  while (spent < budget && guard-- > 0) {
    // later waves favor heavier enemies
    const sorted = [...roster].sort((a, b) => enemyCost(a) - enemyCost(b));
    // early waves heavily favor the cheapest enemies; later waves go uniform/heavy
    const exp = Math.max(1.0, 2.6 - waveIdx * 0.18);
    const pick = sorted[Math.min(sorted.length - 1, Math.floor(rng() ** exp * sorted.length))];
    const cost = enemyCost(pick);
    const groupSize = Math.max(1, Math.min(6, Math.round((budget * 0.22) / cost) + (rng() < 0.4 ? 1 : 0)));
    const pathIndex = Math.floor(rng() * mapDef.paths.length);
    for (let i = 0; i < groupSize && spent < budget; i++) {
      entries.push({ defId: pick.id, pathIndex, delay: t });
      t += 0.55 + rng() * 0.5;
      spent += cost;
    }
    t += 1.6 + rng() * 1.6; // gap between squads
  }

  if (isBossWave) {
    t += 2.5;
    entries.push({ defId: mapDef.boss, pathIndex: 0, delay: t, boss: true });
    if (mapDef.twinBoss) entries.push({ defId: mapDef.twinBoss, pathIndex: Math.min(1, mapDef.paths.length - 1), delay: t + 1.5, boss: true });
    // escorts behind the boss
    for (let i = 0; i < 4; i++) {
      const pick = roster[Math.floor(rng() * roster.length)];
      entries.push({ defId: pick.id, pathIndex: 0, delay: t + 2.5 + i * 0.8 });
    }
  }

  return { entries, hpMult, isBossWave, modifier };
}
