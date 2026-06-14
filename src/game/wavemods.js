// Random wave modifiers — a deterministic per-wave twist that adds run-to-run texture without
// rebalancing. Each is a TRADEOFF (a downside for the player paired with an upside, usually more
// bounty on the tougher ones). Applied across: waves.js (count + hp), enemy.js (speed + armor),
// game.js (bounty). 30% chance on a non-boss wave; deterministic per (map, wave) like makeWave.
import { makeRng } from '../world/noise.js';

export const WAVE_MODS = [
  { id: 'haste',      icon: '⚡', speedMult: 1.35, hpFactor: 0.85 },                   // fast but flimsy
  { id: 'fortified',  icon: '🛡', armorAdd: 0.25, speedMult: 0.88 },                   // armored but slow
  { id: 'swarm',      icon: '👥', countMult: 1.45, hpFactor: 0.62 },                   // many but weak
  { id: 'dread',      icon: '💀', hpFactor: 1.2, speedMult: 1.1, bountyMult: 1.3 },    // tough + fast, pays more
  { id: 'reinforced', icon: '🏰', hpFactor: 1.3, armorAdd: 0.15, bountyMult: 1.5 },    // tankiest, best reward
];

export function pickWaveMod(mapId, waveIdx) {
  const rng = makeRng(`wavemod:${mapId}:${waveIdx}`);
  if (rng() >= 0.3) return null;
  return WAVE_MODS[Math.floor(rng() * WAVE_MODS.length)];
}
