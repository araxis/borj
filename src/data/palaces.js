// Per-stage palace command config. Each palace can Muster a defensive squad (summon soldiers) and
// invoke a stage-themed King's Boon. Rally (pull tower garrisons to the keep) needs no config.
// muster.unit → a SOLDIERS id; boon.type → 'heal' for now (more types as palaces are themed).
export const DEFAULT_PALACE = {
  muster: { unit: 'spear-levy', count: 4, cost: 70, cd: 18 },
  boon: { type: 'heal', amount: 0.45, cost: 90, cd: 30 },
};

export const PALACE_DEFS = {
  // Alborz — Simurgh's eyrie: the boon is the Simurgh's healing mercy.
  alborz: {
    muster: { unit: 'spear-levy', count: 4, cost: 70, cd: 18 },
    boon: { type: 'heal', amount: 0.5, cost: 90, cd: 28 },
  },
};

export const palaceDef = (placeId) => PALACE_DEFS[placeId] || DEFAULT_PALACE;
