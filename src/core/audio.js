// Procedural audio engine — WebAudio only, zero external files (offline-capable).
// Music: layered Persian-inspired ambient — drone, ney-like breath melody on a Shur-like
// scale (neutral-second intervals approximate dastgah quarter-tones), daf/drum rhythm whose
// density follows battle intensity, santur-like plucks for UI/codex moments.
// SFX: synthesized arrow, mace, stone break, fire, gallop, roar, hiss, shimmer, hammer, flap.

import { settings } from './settings.js';

let ctx = null;
let master, musicBus, sfxBus, musicLp;
let started = false;
let intensity = 0; // 0 calm .. 1 boss
let schedTimer = null;
let noiseBuf = null;

// ---- real music tracks (Kevin MacLeod, CC-BY 4.0 — see CREDITS.md) ----
// Crossfaded by scene + battle intensity. If files fail to load (or until they
// do), the procedural Shur-scale director below keeps playing — never silence.
const MUSIC_FILES = {
  menu: 'assets/audio/music/menu.mp3',
  calm: 'assets/audio/music/calm.mp3',
  battle: 'assets/audio/music/battle.mp3',
};
let tracks = null;        // { name: { el, gain } } when file playback is active
let scene = 'menu';       // 'menu' | 'battle'

function tryStartTracks() {
  if (tracks !== null) return; // already attempted
  tracks = {};
  let okCount = 0;
  for (const [name, url] of Object.entries(MUSIC_FILES)) {
    try {
      const el = new Audio(url);
      el.loop = true;
      el.preload = 'auto';
      const src = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(musicBus);
      el.play().then(() => { okCount++; applyMusicMix(0.1); }).catch(() => { /* blocked/missing */ });
      tracks[name] = { el, gain };
    } catch { /* element/source failure → synth fallback remains */ }
  }
}

function tracksAlive() {
  return tracks && Object.values(tracks).some((t) => t.el && !t.el.paused && t.el.readyState >= 2);
}

function applyMusicMix(smooth = 0.8) {
  if (!tracks || !ctx) return;
  const now = ctx.currentTime;
  const want = {
    menu: scene === 'menu' ? 0.85 : 0,
    calm: scene === 'battle' ? Math.max(0, 0.8 - intensity * 1.1) : 0,
    battle: scene === 'battle' ? Math.min(1, 0.15 + intensity * 0.95) : 0,
  };
  for (const [name, tr] of Object.entries(tracks)) {
    if (tr.gain) tr.gain.gain.setTargetAtTime(want[name] ?? 0, now, smooth);
  }
}

// Shur-like scale on D: semitone offsets with neutral seconds (1.5) for Persian color.
const SHUR = [0, 1.5, 3, 5, 7, 8, 10, 12, 13.5, 15];
const ROOT = 146.83; // D3
const freq = (deg, oct = 0) => ROOT * Math.pow(2, (SHUR[((deg % SHUR.length) + SHUR.length) % SHUR.length] + 12 * oct) / 12);

function ensureCtx() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  musicLp = ctx.createBiquadFilter();
  musicLp.type = 'lowpass'; musicLp.frequency.value = 4000;
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus.connect(musicLp); musicLp.connect(master);
  sfxBus.connect(master);
  master.connect(ctx.destination);
  applyVolumes();
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  settings.onChange(applyVolumes);
  return ctx;
}

function applyVolumes() {
  if (!master) return;
  const m = settings.get('muted') ? 0 : settings.get('masterVolume');
  const reduce = settings.get('reducedAudio') ? 0.55 : 1;
  master.gain.value = m * reduce;
  musicBus.gain.value = settings.get('musicVolume');
  sfxBus.gain.value = settings.get('sfxVolume');
  if (musicLp) musicLp.frequency.value = settings.get('reducedAudio') ? 2200 : 4000;
}

function noise(dur, bus, { hp = 0, lp = 8000, gain = 0.3, attack = 0.005, decay = dur } = {}) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  let node = src;
  if (hp > 0) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  if (lp < 12000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  node.connect(g); g.connect(bus);
  src.start(t); src.stop(t + attack + decay + 0.05);
}

function tone(f0, dur, bus, { type = 'sine', gain = 0.2, attack = 0.01, glide = 0, f1 = f0, vibrato = 0, lp = 0 } = {}) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (glide > 0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + glide);
  let node = o;
  if (vibrato > 0) {
    const lfo = ctx.createOscillator(); const lg = ctx.createGain();
    lfo.frequency.value = 5.4; lg.gain.value = vibrato;
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.1);
  }
  if (lp > 0) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  node.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.05);
}

// ---------- Music director ----------
let bar = 0;
let droneNodes = null;

function startDrone() {
  if (droneNodes) return;
  const t = ctx.currentTime;
  const g = ctx.createGain(); g.gain.value = 0.0;
  g.gain.linearRampToValueAtTime(0.10, t + 4);
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = ROOT / 2;
  const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = (ROOT / 2) * 1.005;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.8;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(musicBus);
  o1.start(); o2.start();
  droneNodes = { o1, o2, g, f };
}

function neyPhrase() {
  // breathy melody: filtered noise + sine, descending Shur figures
  const degrees = [4, 5, 4, 3, 2, 1, 0];
  const start = Math.floor(Math.random() * 3);
  const len = 3 + Math.floor(Math.random() * 4);
  let dt = 0;
  for (let i = 0; i < len; i++) {
    const deg = degrees[(start + i) % degrees.length];
    const f0 = freq(deg, 2);
    const dur = 0.5 + Math.random() * 0.7;
    setTimeout(() => {
      if (!started) return;
      tone(f0, dur, musicBus, { type: 'sine', gain: 0.05, attack: 0.12, vibrato: 3.5 });
      noise(dur * 0.8, musicBus, { hp: f0 * 1.8, lp: f0 * 4, gain: 0.012, attack: 0.1 });
    }, dt * 1000);
    dt += dur * 0.85;
  }
}

function santurPluck(deg, oct = 2, gain = 0.07) {
  if (!ctx || !started) return;
  // bright doubled strings, fast decay
  tone(freq(deg, oct), 0.9, musicBus, { type: 'triangle', gain, attack: 0.004 });
  tone(freq(deg, oct) * 2.003, 0.6, musicBus, { type: 'triangle', gain: gain * 0.5, attack: 0.004 });
}

function dafHit(strong) {
  // low membrane thump + jingle ring
  tone(strong ? 78 : 95, 0.22, musicBus, { type: 'sine', gain: strong ? 0.22 : 0.12, attack: 0.004, glide: 0.18, f1: 52 });
  noise(0.06, musicBus, { hp: 5000, gain: strong ? 0.05 : 0.02, attack: 0.002 });
}

function scheduleBar() {
  if (!started) return;
  // real tracks playing → keep the synth orchestra silent, but keep polling so we
  // can take over if file playback ever stops (e.g., element error)
  if (tracksAlive()) {
    if (droneNodes) { try { droneNodes.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); } catch { /* */ } }
    schedTimer = setTimeout(scheduleBar, 2000);
    return;
  }
  if (!droneNodes) startDrone();
  else { try { droneNodes.g.gain.setTargetAtTime(0.10, ctx.currentTime, 0.6); } catch { /* */ } }
  const bpm = 84 + intensity * 36;
  const beat = 60 / bpm;
  // 6/8-flavored daf pattern, denser with intensity
  const pattern = intensity > 0.66
    ? [1, 0.4, 0.6, 1, 0.5, 0.7]
    : intensity > 0.33
      ? [1, 0, 0.5, 0.8, 0, 0.5]
      : [1, 0, 0, 0.6, 0, 0];
  pattern.forEach((v, i) => {
    if (v > 0 && Math.random() < 0.92) setTimeout(() => started && dafHit(v >= 0.8), i * beat * 1000);
  });
  if (bar % 4 === 0 && Math.random() < 0.8) neyPhrase();
  if (bar % 8 === 4 && intensity < 0.5 && Math.random() < 0.5) {
    [0, 2, 4].forEach((d, i) => setTimeout(() => santurPluck(d, 3, 0.04), i * 180));
  }
  bar++;
  schedTimer = setTimeout(scheduleBar, beat * 6 * 1000);
}

// ---------- public API ----------
export const audio = {
  // must be called from a user gesture (browser autoplay policy)
  unlock() {
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    tryStartTracks();
    if (!started) {
      started = true;
      // synth director only carries the music when file tracks aren't running
      if (!tracksAlive()) { startDrone(); scheduleBar(); }
      else { schedTimer = setTimeout(scheduleBar, 500); } // re-checked inside scheduleBar
    }
  },
  setScene(s) { scene = s; applyMusicMix(); },
  setIntensity(v) {
    intensity = Math.max(0, Math.min(1, v));
    applyMusicMix();
  },
  ui() { ensureCtx(); if (started) santurPluck(Math.floor(Math.random() * 5), 3, 0.06); },
  codex() { ensureCtx(); if (started) { santurPluck(0, 3, 0.06); setTimeout(() => santurPluck(4, 3, 0.05), 140); } },

  arrow() { if (!started) return; noise(0.12, sfxBus, { hp: 2500, lp: 9000, gain: 0.1, attack: 0.002 }); },
  longArrow() { if (!started) return; noise(0.3, sfxBus, { hp: 1800, lp: 8000, gain: 0.16, attack: 0.002 }); tone(900, 0.3, sfxBus, { type: 'sine', gain: 0.05, glide: 0.3, f1: 300 }); },
  mace() {
    if (!started) return;
    tone(120, 0.35, sfxBus, { type: 'sine', gain: 0.35, attack: 0.003, glide: 0.3, f1: 45 });
    noise(0.18, sfxBus, { lp: 900, gain: 0.25, attack: 0.002 });
  },
  stoneBreak() {
    if (!started) return;
    noise(0.4, sfxBus, { lp: 1400, gain: 0.3, attack: 0.002 });
    tone(180, 0.25, sfxBus, { type: 'square', gain: 0.08, glide: 0.2, f1: 60, lp: 600 });
    for (let i = 0; i < 3; i++) setTimeout(() => noise(0.08, sfxBus, { hp: 800, lp: 3000, gain: 0.08 }), 60 + i * 70);
  },
  bigCollapse() {
    if (!started) return;
    tone(70, 0.9, sfxBus, { type: 'sine', gain: 0.4, glide: 0.8, f1: 30 });
    noise(1.1, sfxBus, { lp: 1000, gain: 0.35, attack: 0.01 });
    for (let i = 0; i < 6; i++) setTimeout(() => noise(0.1, sfxBus, { hp: 500, lp: 2800, gain: 0.1 }), 120 + i * 110);
  },
  fire() { if (!started) return; noise(0.5, sfxBus, { hp: 300, lp: 2200, gain: 0.05, attack: 0.05 }); },
  forgeHammer() {
    if (!started) return;
    tone(1400, 0.12, sfxBus, { type: 'square', gain: 0.06, glide: 0.1, f1: 700 });
    noise(0.1, sfxBus, { hp: 3000, gain: 0.1, attack: 0.001 });
    tone(220, 0.18, sfxBus, { type: 'sine', gain: 0.15, glide: 0.15, f1: 90 });
  },
  gallop() {
    if (!started) return;
    [0, 110, 220, 380].forEach((d) => setTimeout(() => tone(90, 0.08, sfxBus, { type: 'sine', gain: 0.1, glide: 0.07, f1: 55 }), d));
  },
  roar() {
    if (!started) return;
    tone(95, 0.9, sfxBus, { type: 'sawtooth', gain: 0.18, glide: 0.8, f1: 60, vibrato: 9, lp: 600 });
    noise(0.8, sfxBus, { hp: 150, lp: 900, gain: 0.12, attack: 0.05 });
  },
  hiss() { if (!started) return; noise(0.6, sfxBus, { hp: 4000, lp: 10000, gain: 0.07, attack: 0.04 }); },
  shimmer() {
    if (!started) return;
    [7, 9, 11].forEach((d, i) => setTimeout(() => tone(freq(d % SHUR.length, 3), 0.5, sfxBus, { type: 'sine', gain: 0.04, attack: 0.02 }), i * 70));
  },
  bannerFlap() { if (!started) return; noise(0.15, sfxBus, { hp: 600, lp: 2500, gain: 0.05, attack: 0.01 }); },
  clank() {
    if (!started) return;
    // metal-on-metal: bright ping + short scrape
    tone(1900 + Math.random() * 900, 0.09, sfxBus, { type: 'square', gain: 0.045, lp: 5200 });
    noise(0.07, sfxBus, { hp: 2600, lp: 9000, gain: 0.07, attack: 0.001 });
    tone(300, 0.06, sfxBus, { type: 'triangle', gain: 0.05, glide: 0.05, f1: 160 });
  },
  chain() {
    if (!started) return;
    for (let i = 0; i < 4; i++) setTimeout(() => tone(2200 + Math.random() * 800, 0.06, sfxBus, { type: 'square', gain: 0.03, lp: 4000 }), i * 50);
  },
  coin() { if (!started) return; tone(2100, 0.1, sfxBus, { type: 'triangle', gain: 0.06 }); setTimeout(() => tone(2600, 0.12, sfxBus, { type: 'triangle', gain: 0.05 }), 60); },
  hornCall() {
    if (!started) return;
    tone(freq(0, 1), 0.8, sfxBus, { type: 'sawtooth', gain: 0.12, attack: 0.08, lp: 1200 });
    setTimeout(() => tone(freq(4, 1), 1.0, sfxBus, { type: 'sawtooth', gain: 0.12, attack: 0.06, lp: 1200 }), 350);
  },
  bossCue() {
    if (!started) return;
    tone(ROOT / 2, 1.6, sfxBus, { type: 'sawtooth', gain: 0.2, attack: 0.02, lp: 500 });
    dafHit(true); setTimeout(() => dafHit(true), 300); setTimeout(() => dafHit(true), 600);
  },
  victory() {
    if (!started) return;
    [0, 2, 4, 7].forEach((d, i) => setTimeout(() => santurPluck(d, 3, 0.09), i * 160));
  },
  defeat() {
    if (!started) return;
    tone(freq(1, 1), 1.8, sfxBus, { type: 'sine', gain: 0.12, attack: 0.05, glide: 1.6, f1: freq(0, 0) });
  },
  stop() {
    started = false;
    if (schedTimer) clearTimeout(schedTimer);
    if (droneNodes) { try { droneNodes.g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5); } catch { /* */ } }
  },
};
