// Stage-intro cinematic: a scripted, skippable camera sequence played at battle start.
// Every stage gets a unique "intro video" for free — its own palace, board, backdrop and
// story lines are the footage. Beats: letterbox in → slow reveal orbit on the citadel with
// the stage's illuminated title → sweep out to the enemy gate with the story line → the
// classic gate→citadel fly-in lands in gameplay framing. Click/Esc skips; reducedMotion
// (and battle resumes) fall back to the plain fly-in.
import * as THREE from 'three';
import { t, tOpt, tName, tNameAlt } from '../core/i18n.js';
import { settings } from '../core/settings.js';
import { PLACES_BY_ID } from '../data/places.js';
import { ENEMIES_BY_ID } from '../data/enemies.js';
import { audio } from '../core/audio.js';

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
}

let active = null; // { root, off } — one cinematic at a time

export function stopStageCinematic() {
  if (!active) return;
  const { root, off } = active;
  active = null;
  off();
  document.body.classList.remove('cinema');
  root.classList.remove('cine-in');
  setTimeout(() => root.remove(), 650);
}

export function playStageCinematic({ rts, game, mapDef, onDone = null }) {
  const map = game?.map;
  const s0 = map?.paths?.[0]?.samples?.[0]?.pos;
  const gate = s0 ? new THREE.Vector3(s0.x, s0.y, s0.z) : null;
  const finish = (skipped) => {
    stopStageCinematic();
    if (gate) rts.flyIn(gate, skipped ? 2.2 : 4.2);
    onDone?.(skipped);
  };
  if (!map || !gate || settings.get('reducedMotion')) { finish(false); return; }
  stopStageCinematic();

  const place = PLACES_BY_ID[mapDef.id] || {};
  const cit = map.citadel?.group?.position || map.exitPos;
  const citadel = new THREE.Vector3(cit.x, cit.y + 6, cit.z);

  // ---- overlay: letterbox bars + illuminated title + story line + skip hint ----
  const boss = mapDef.boss ? ENEMIES_BY_ID[mapDef.boss] : null;
  const title = el('div', { class: 'cine-title' },
    el('div', { class: 'cine-fa' }, tName(place) || mapDef.id),
    el('div', { class: 'cine-en' }, tNameAlt(place) || ''),
    el('div', { class: 'cine-ref' }, tOpt('storyref.' + place.id, place.sourceRef || '')),
  );
  const story = el('div', { class: 'cine-story' }, mapDef.introKey ? t(mapDef.introKey) : '');
  const bossCard = boss ? el('div', { class: 'cine-boss' },
    el('div', { class: 'cine-boss-name' }, tName(boss)),
    el('div', { class: 'cine-boss-line' }, t('cinematic.bossAwaits')),
  ) : null;
  const root = el('div', { class: 'cine' + (boss ? ' boss' : ''), 'aria-hidden': 'true' },
    el('div', { class: 'cine-bar top' }),
    el('div', { class: 'cine-bar bottom' }),
    title, story, bossCard,
    el('div', { class: 'cine-skip' }, t('cinematic.skip')),
  );
  document.body.append(root);
  document.body.classList.add('cinema'); // fades HUD chrome out under the letterbox
  // rAF can be throttled in embedded/background tabs — a timeout is the reliable trigger
  setTimeout(() => root.classList.add('cine-in'), 30);

  const skip = (ev) => {
    if (ev.type === 'keydown' && ev.key !== 'Escape' && ev.key !== ' ' && ev.key !== 'Enter') return;
    rts.skipCinematic(); // fires the player's onDone(true) → finish(true)
  };
  window.addEventListener('pointerdown', skip, true);
  window.addEventListener('keydown', skip, true);
  const off = () => {
    window.removeEventListener('pointerdown', skip, true);
    window.removeEventListener('keydown', skip, true);
  };
  active = { root, off };

  // ---- shots: reveal orbit on the citadel, then sweep out to the enemy gate ----
  const baseYaw = rts.home.yaw;
  const shots = [
    {
      from: { target: citadel, yaw: baseYaw + 2.35, pitch: 0.32, dist: 36 },
      to: { target: citadel, yaw: baseYaw + 1.05, pitch: 0.42, dist: 27 },
      dur: 3.6, ease: 'inout',
    },
    {
      to: { target: gate, yaw: baseYaw + 0.45, pitch: 0.52, dist: 34 },
      dur: 3.1, ease: 'inout',
    },
  ];
  // boss stages: a menacing push-in on the enemy gate under the boss's name
  if (boss) shots.push({ to: { target: gate, yaw: baseYaw + 0.2, pitch: 0.3, dist: 16 }, dur: 2.5, ease: 'inout' });
  const played = rts.playCinematic(shots, {
    onShot: (i) => {
      root.classList.toggle('beat-title', i === 0);
      root.classList.toggle('beat-story', i === 1);
      root.classList.toggle('beat-boss', i === 2);
      if (i === 1) audio.bannerFlap?.();
      if (i === 2) { audio.stoneBreak?.(); game.engine?.addShake?.(0.25); }
    },
    onDone: (skipped) => finish(skipped),
  });
  if (!played) return; // reducedMotion inside the player already finished
  audio.bannerFlap?.();
}
