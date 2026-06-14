// Difficulty presets — a global, persisted player choice applied at MAP START
// (start gold + lives) and to ENEMY spawn HP. 'normal' is the tuned baseline
// (×1 everywhere), so existing balance is unchanged unless the player opts in.
import { settings } from './settings.js';

export const DIFFICULTIES = {
  easy:   { gold: 1.4,  hp: 0.8,  lives: 1.5 },
  normal: { gold: 1.0,  hp: 1.0,  lives: 1.0 },
  hard:   { gold: 0.85, hp: 1.25, lives: 0.7 },
};
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];

export function currentDifficulty() {
  const d = settings.get('difficulty');
  return DIFFICULTIES[d] ? d : 'normal';
}
export function diffMods() { return DIFFICULTIES[currentDifficulty()]; }
export function setDifficulty(d) { if (DIFFICULTIES[d]) settings.set('difficulty', d); }
