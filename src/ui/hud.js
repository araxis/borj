// Battle HUD — top bar, left card grid (towers/heroes tabs), right detail panel,
// wave controls, toasts, boss banner, interaction modes (build/assign/rally/fuse).
import * as THREE from 'three';
import { el, $, clear, wireAction } from './dom.js';
import { t, tf, tName, tNameAlt, tNum, tOpt, onLangChange, toggleLang } from '../core/i18n.js';
import { applyAtlasCell } from '../core/atlas.js';
import { TOWERS, AGES } from '../data/towers.js';
import { HEROES, HERO_RANKS } from '../data/heroes.js';
import { PLACES_BY_ID, PLACE_ATLAS } from '../data/places.js';
import { HERO_ATLAS } from '../data/heroes.js';
import { ENEMY_ATLAS } from '../data/enemies.js';
import { SOLDIERS_BY_ID } from '../data/soldiers.js';
import { palaceDef } from '../data/palaces.js';
import { bossChallengeDef } from '../data/bosschallenges.js';
import { FUSIONS } from '../data/fusions.js';
import { heroBond } from '../entities/tower.js';
import { audio } from '../core/audio.js';

// null-safe append: native DOM append() stringifies null into the text "null"
function put(parent, ...kids) {
  for (const k of kids.flat()) if (k != null) parent.append(k);
}

const ROLE_ICONS = {
  archer: '🏹', siege: '🪨', fire: '🔥', magic: '📜', support: '🪶',
  aura: '🚩', economy: '🪙', barracks: '🛡️', trap: '🕳️',
};
const HERO_ICONS = {
  champion: '⚔️', sage: '🪶', guardian: '🕊️', forgemaster: '🔨', king: '👑',
  strategist: '📜', defender: '🛡️', protector: '🏮', matriarch: '👸', ancestor: '🗿',
  monsterSlayer: '🗡️', stateswoman: '🏛️', companion: '🐎', counselor: '💬', marshal: '🎺',
  archer: '🏹', gatekeeper: '🚪', rider: '🏇', martyr: '🕯️', prince: '🤴', striker: '🥊',
};
// Both card tabs filter by combat role; the role lists are derived from the data
// at render time so they are always complete. TOWER_ROLE_ORDER only curates order.
const TOWER_ROLE_ORDER = ['archer', 'siege', 'fire', 'magic', 'support', 'aura', 'economy', 'barracks', 'trap'];

const HERO_TONES = {
  heal: new Set(['featherCall', 'simurghAegis', 'secretProvision', 'simurghBirthright', 'steadfastPrayer', 'royalContinuity', 'courtGrace']),
  fire: new Set(['sadehFlame', 'fireJudgment']),
  vision: new Set(['worldCup', 'longSearch', 'borderArrow', 'twinArrow', 'keepsakeToken', 'heirsVolley']),
  bind: new Set(['oxheadJudgment', 'divBind', 'dragonbane', 'boarHunt', 'gateWard', 'pahlavanChallenge', 'maceShockwave', 'ancestralBlow', 'brazenBody', 'counterCharge']),
};

function heroTone(key) {
  for (const [tone, keys] of Object.entries(HERO_TONES)) if (keys.has(key)) return tone;
  return 'rally';
}

function palaceTone(type) {
  if (type === 'heal') return 'heal';
  if (type === 'burnRing') return 'fire';
  if (type === 'rangeVision') return 'vision';
  if (type === 'bindChains') return 'bind';
  if (type === 'stunPulse') return 'impact';
  if (type === 'goldProvision') return 'gold';
  if (type === 'repairFortifications') return 'repair';
  return 'rally';
}

function palaceSigil(type) {
  if (type === 'heal') return '✚';
  if (type === 'burnRing') return '🔥';
  if (type === 'rangeVision') return '↗';
  if (type === 'bindChains') return '⛓';
  if (type === 'stunPulse') return '◆';
  if (type === 'goldProvision') return '🪙';
  if (type === 'repairFortifications') return '▰';
  return '⚑';
}

export class HUD {
  constructor(game, callbacks) {
    this.game = game;
    this.cb = callbacks; // { onExit, onRetry, onContinueEndless }
    this.mode = { kind: 'none' }; // none | build(def) | assign(hero) | rally(tower) | fuse(tower)
    this.selectedEntity = null;
    this.root = $('#ui');
    this._heroCommandTimer = null;
    this._gateOmenAcc = 0;
    this._bossArrivalUntil = 0;
    this._pendingBossChallenge = null;
    this._challengeRevealTimer = null;
    this._build();
    this._autoCollapsedPanel = false;
    if (window.matchMedia?.('(max-width: 700px)').matches && !document.body.classList.contains('panel-hidden')) {
      document.body.classList.add('panel-hidden');
      this._autoCollapsedPanel = true;
    }
    this._wire();
    this._initHeroMarkers();
    this._gateOmenOff = this.game.engine.onUpdate((dt) => {
      this._gateOmenAcc += dt;
      if (this._gateOmenAcc < 0.2) return;
      this._gateOmenAcc = 0;
      this.updateGateOmen();
    });
    if (!game.waveActive) this._updateWaveBtn(game.waveCountdown, game.earlyBonus());
    this._langOff = onLangChange(() => {
      if (!this.root?.isConnected || !$('#tabTowers')) return;
      this.refreshAll();
      this._syncToggle();
    });
  }

  // ---- floating hero medallions: a portrait badge above every hero-assigned tower, click → tower command panel ----
  _initHeroMarkers() {
    this._heroMarkers = new Map(); // tower -> medallion element
    this._mkVec = new THREE.Vector3();
    // a non-blocking overlay above the WebGL canvas but below the HUD panels. Anchored to <body>
    // (NOT #ui) so it survives the HUD's refreshAll() DOM rebuild on language change.
    this.heroMarkerLayer = el('div', { class: 'hero-marker-layer' });
    document.body.appendChild(this.heroMarkerLayer);
    this._markerOff = this.game.engine.onUpdate(() => this.updateHeroMarkers());
  }

  _makeHeroMarker(tower) {
    const portrait = el('span', { class: 'hero-marker-portrait' });
    const m = el('button', { class: 'hero-marker', type: 'button', title: tower.hero ? tName(tower.hero) : '' },
      el('span', { class: 'hero-marker-ring', 'aria-hidden': 'true' }),
      portrait,
      el('span', { class: 'hero-marker-rank', 'aria-hidden': 'true' }),
      el('span', { class: 'hero-marker-cd', 'aria-hidden': 'true' }, '✦'),
    );
    m._portrait = portrait;
    m.onclick = (ev) => {
      ev.stopPropagation();
      audio.ui();
      if (m._tower?.alive) this.showTower(m._tower);
      else if (m._hero) this.showHero(m._hero, true);
    };
    this.heroMarkerLayer.append(m);
    return m;
  }

  updateHeroMarkers() {
    if (!this._heroMarkers) return;
    const game = this.game, cam = game.engine.camera;
    if (!cam) return;
    const W = window.innerWidth, H = window.innerHeight;
    const seen = new Set();
    for (const t of game.towers) {
      if (!t.alive || !t.hero) continue;
      seen.add(t);
      let m = this._heroMarkers.get(t);
      if (!m) { m = this._makeHeroMarker(t); this._heroMarkers.set(t, m); }
      const key = t.hero.special?.key || 'default';
      const tone = heroTone(key);
      m.classList.remove('tone-heal', 'tone-fire', 'tone-vision', 'tone-bind', 'tone-rally');
      m.classList.add(`tone-${tone}`);
      m._tower = t;
      if (m._heroId !== t.hero.id) {
        applyAtlasCell(m._portrait, HERO_ATLAS, t.hero.atlas);
        m._heroId = t.hero.id; m._hero = t.hero; m.title = tName(t.hero);
      }
      const rank = this.game.heroRank(t.hero.id);
      const cd = Math.max(0, t.heroActiveCd || 0);
      const ready = cd <= 0.05;
      const cdMax = this._heroCommandMaxCd(t.hero);
      const pct = ready ? 100 : Math.max(0, Math.min(100, ((cdMax - cd) / cdMax) * 100));
      m.classList.toggle('ready', ready);
      m.classList.toggle('cooldown', !ready);
      m.style.setProperty('--hero-cd', `${pct}%`);
      m.querySelector('.hero-marker-rank').textContent = '★'.repeat(Math.max(1, rank + 1));
      m.querySelector('.hero-marker-cd').textContent = ready ? '✦' : tNum(Math.ceil(cd));
      m.title = `${tName(t.hero)} — ${tName(t.def)}`;
      m.setAttribute('aria-label', `${tName(t.hero)} — ${tName(t.def)}`);
      const v = this._mkVec.set(t.pos.x, t.pos.y + 6.5, t.pos.z).project(cam);
      if (v.z > 1 || v.x < -1.15 || v.x > 1.15 || v.y < -1.15 || v.y > 1.15) { m.style.display = 'none'; continue; }
      m.style.display = '';
      m.style.left = ((v.x * 0.5 + 0.5) * W).toFixed(1) + 'px';
      m.style.top = ((-v.y * 0.5 + 0.5) * H).toFixed(1) + 'px';
    }
    for (const [t, m] of this._heroMarkers) { if (!seen.has(t)) { m.remove(); this._heroMarkers.delete(t); } }
  }

  _build() {
    this.root.append(
      el('div', { id: 'topbar', class: 'frame' },
        el('span', { class: 'statchip' }, el('span', { class: 'ico' }, '🪙'), el('b', { id: 'goldVal' }, '0'), el('span', { id: 'goldLbl' }, t('hud.gold'))),
        el('div', { class: 'sep' }),
        el('span', { class: 'statchip' }, el('span', { class: 'ico' }, '🏛️'), el('b', { id: 'livesVal' }, '0'), el('span', { id: 'livesLbl' }, t('hud.lives'))),
        el('div', { class: 'sep' }),
        el('span', { class: 'statchip' }, el('span', { class: 'ico' }, '🌊'), el('b', { id: 'waveVal' }, '0'), el('span', { id: 'waveLbl' }, t('hud.wave'))),
        el('span', { class: 'statchip wavemod', id: 'waveMod', style: { display: 'none' } }),
        el('div', { id: 'sandboxTools', class: 'sandbox-tools', style: { display: this.game.sandbox ? '' : 'none' }, 'aria-label': tOpt('hud.sandboxTools', 'Sandbox tools') },
          el('button', { class: 'iconbtn sandbox-btn', id: 'sandboxFxBtn', title: tOpt('hud.sandboxFxTip', 'Preview command FX'), 'aria-label': tOpt('hud.sandboxFxTip', 'Preview command FX') },
            el('span', { class: 'sandbox-icon' }, '✦'),
            el('span', { class: 'sandbox-key' }, tOpt('hud.sandboxKeyF', 'F')),
          ),
          el('button', { class: 'iconbtn sandbox-btn', id: 'sandboxAssaultBtn', title: tOpt('hud.sandboxAssaultTip', 'Cycle gate assault'), 'aria-label': tOpt('hud.sandboxAssaultTip', 'Cycle gate assault') },
            el('span', { class: 'sandbox-icon' }, '⚔'),
            el('span', { class: 'sandbox-key' }, tOpt('hud.sandboxKeyH', 'H')),
          ),
          el('button', { class: 'iconbtn sandbox-btn royal', id: 'sandboxRoyalBtn', title: tOpt('hud.sandboxRoyalTip', 'Royal gate assault'), 'aria-label': tOpt('hud.sandboxRoyalTip', 'Royal gate assault') },
            el('span', { class: 'sandbox-icon' }, '♛'),
            el('span', { class: 'sandbox-key' }, tOpt('hud.sandboxKeyShiftH', 'Shift H')),
          ),
          el('button', { class: 'iconbtn sandbox-btn inspect', id: 'sandboxInspectBtn', title: tOpt('hud.sandboxInspectTip', 'Inspect gate sequence'), 'aria-label': tOpt('hud.sandboxInspectTip', 'Inspect gate sequence') },
            el('span', { class: 'sandbox-icon' }, '◉'),
            el('span', { class: 'sandbox-key' }, tOpt('hud.sandboxKeyG', 'G')),
          ),
        ),
        el('button', { class: 'statchip farrchip', id: 'farrChip', title: t('hud.farrTip'), 'aria-label': t('hud.farrOpen') },
          el('span', { class: 'ico' }, '✦'),
          el('b', { id: 'farrVal' }, '0'),
          el('span', { id: 'farrLbl' }, t('hud.farr')),
          el('span', { class: 'farrbar' }, el('i', { id: 'farrFill' })),
        ),
        el('button', { class: 'statchip gate-omen', id: 'gateOmen', style: { display: 'none' }, title: tOpt('hud.gateDangerTip', 'Open palace commands'), 'aria-label': tOpt('hud.gateDangerTip', 'Open palace commands') },
          el('span', { class: 'ico' }, '◉'),
          el('b', { id: 'gateOmenState' }, ''),
          el('span', { id: 'gateOmenDetail', class: 'gate-omen-detail' }, ''),
          el('span', { class: 'gate-omen-bar' }, el('i', { id: 'gateOmenFill' })),
        ),
        el('div', { class: 'sep' }),
        el('button', { class: 'iconbtn', id: 'pauseBtn', title: t('hud.pause'), 'aria-label': t('hud.pause') }, '⏸'),
        el('div', { id: 'speedBtns' },
          el('button', { class: 'iconbtn active', 'data-speed': '1', 'aria-label': t('hud.speed') + ' 1', 'aria-pressed': 'true' }, '1×'),
          el('button', { class: 'iconbtn', 'data-speed': '2', 'aria-label': t('hud.speed') + ' 2', 'aria-pressed': 'false' }, '2×'),
          el('button', { class: 'iconbtn', 'data-speed': '3', 'aria-label': t('hud.speed') + ' 3', 'aria-pressed': 'false' }, '3×'),
          el('button', { class: 'iconbtn', 'data-speed': '4', 'aria-label': t('hud.speed') + ' 4', 'aria-pressed': 'false' }, '4×'),
        ),
        el('div', { class: 'sep' }),
        el('button', { class: 'iconbtn', id: 'codexBtn', title: t('hud.codex'), 'aria-label': t('hud.codex') }, '📖'),
        el('button', { class: 'iconbtn', id: 'settingsBtn', title: t('menu.settings'), 'aria-label': t('menu.settings') }, '⚙️'),
        el('button', { class: 'iconbtn', id: 'langBtn', 'aria-label': t('settings.language') }, t('lore.toggle')),
        el('button', { class: 'iconbtn', id: 'menuBtn', title: t('hud.menu'), 'aria-label': t('hud.menu') }, '⌂'),
      ),
      el('div', { id: 'challengeChip', class: 'challenge-chip', 'aria-live': 'polite', style: { display: 'none' } }),
      el('div', { id: 'leftPanel', class: 'frame' },
        el('div', { id: 'leftTabs' },
          el('button', { class: 'tabbtn active', id: 'tabTowers' }, t('hud.towers')),
          el('button', { class: 'tabbtn', id: 'tabHeroes' }, t('hud.heroes')),
        ),
        el('div', { id: 'cardFilter' }),
        el('div', { id: 'cardGrid' }),
      ),
      el('button', { class: 'panel-toggle', id: 'leftToggle', title: t('hud.togglePanel'), 'aria-label': t('hud.togglePanel') }, '‹'),
      el('div', { id: 'rightPanel', class: 'frame' },
        el('button', { id: 'rpClose', 'aria-label': t('settings.back') }, '✕'),
        el('div', { id: 'rpContent' }),
      ),
      el('div', { id: 'bottomBar', class: 'frame' },
        el('button', { class: 'gbtn primary', id: 'waveBtn' }, t('hud.nextWave')),
      ),
      el('div', { id: 'toasts' }),
      el('div', { id: 'bossBanner', 'aria-live': 'polite' }),
      el('div', { id: 'oathBanner', 'aria-live': 'polite' }),
      el('div', { id: 'commandBanner', 'aria-live': 'polite' }),
      el('div', { id: 'modeHint' }),
    );
    this.activeTab = 'towers';
    this.filter = { towers: null, heroes: null }; // active group filter per tab (null = All)
    this.renderCards();
    this.updateTop();
    this.updateFarr();
  }

  _wire() {
    const g = this.game;
    $('#tabTowers').onclick = () => { this.activeTab = 'towers'; this._tabSync(); };
    $('#tabHeroes').onclick = () => { this.activeTab = 'heroes'; this._tabSync(); };
    $('#waveBtn').onclick = () => { audio.unlock(); audio.ui(); g.startWave(true); };
    $('#pauseBtn').onclick = () => this.cb.onTogglePause();
    $('#langBtn').onclick = () => { toggleLang(); };
    $('#menuBtn').onclick = () => this.cb.onExit();
    $('#codexBtn').onclick = () => { audio.codex(); this.cb.onCodex(); };
    $('#settingsBtn').onclick = () => this.cb.onSettings();
    $('#rpClose').onclick = () => this.closePanel();
    $('#leftToggle').onclick = () => { document.body.classList.toggle('panel-hidden'); this._syncToggle(); };
    $('#sandboxFxBtn').onclick = () => {
      audio.ui();
      if (g.previewCommandFx?.()) this.toast(t('hud.fxPreview'));
    };
    $('#sandboxAssaultBtn').onclick = () => this._runSandboxAssault({});
    $('#sandboxRoyalBtn').onclick = () => this._runSandboxAssault({ mode: 'royal', fullFx: true });
    $('#sandboxInspectBtn').onclick = () => this._runSandboxInspect();
    $('#farrChip').onclick = () => {
      const palace = this.game.map?.citadel;
      if (!palace?.isPalace) return;
      audio.ui();
      this.showPalace(palace);
    };
    $('#gateOmen').onclick = () => {
      const palace = this.game.map?.citadel;
      if (!palace?.isPalace) return;
      audio.ui();
      this.showPalace(palace);
    };
    this._syncToggle();
    for (const b of document.querySelectorAll('#speedBtns .iconbtn')) {
      b.onclick = () => this.cb.onSpeed(parseFloat(b.dataset.speed), b);
    }
    g.on('goldChanged', () => { this.updateTop(); this.refreshAffordability(); });
    g.on('livesChanged', () => this.updateTop());
    g.on('waveStarted', ({ wave, boss, mod }) => {
      this.updateTop();
      this.toast(t('hud.waveIncoming', { n: tNum(wave) }));
      this._setWaveMod(mod);
      if (mod) this.toast(mod.icon + ' ' + t('wavemod.' + mod.id));
      const btn = $('#waveBtn');
      btn.disabled = true;
      btn.classList.remove('urgent');
      btn.textContent = t('hud.waveInProgress');
    });
    g.on('waveEnded', () => {
      this.updateTop();
      this._setWaveMod(null);
      $('#waveBtn').disabled = false;
      if (this.selectedEntity?.def && this.selectedEntity.alive) this.showTower(this.selectedEntity);
    });
    g.on('countdownTick', ({ remaining, bonus }) => this._updateWaveBtn(remaining, bonus));
    g.on('earlyBonus', (gold) => this.toast(t('hud.earlyBonus', { gold: tNum(gold) })));
    g.on('bossSpawned', (def) => this.bossBanner(tName(def), null, bossChallengeDef(def.id).saga));
    g.on('bossChallengeStarted', (ch) => {
      this.updateBossChallenge(ch);
    });
    g.on('bossChallengeUpdated', (ch) => this.updateBossChallenge(ch));
    g.on('bossChallengeCompleted', (ch) => {
      this.challengeResult(ch, true);
      this.updateBossChallenge(null);
    });
    g.on('bossChallengeFailed', (ch) => {
      this.challengeResult(ch, false);
      this.updateBossChallenge(null);
    });
    g.on('bossChallengeCleared', () => this.updateBossChallenge(null));
    g.on('battleStarted', () => this.battleStartBanner());
    g.on('farrChanged', () => this.updateFarr());
    g.on('heroCommand', (payload) => this.heroCommandBanner(payload));
    g.on('palaceCommand', (payload) => this.palaceCommandBanner(payload));
    g.on('oathTriggered', ({ placeId }) => this.oathBanner(placeId));
    g.on('toast', (key) => this.toast(t(key)));
    g.on('towersChanged', () => {
      this.refreshAffordability();
      if (this.selectedEntity && !this.selectedEntity.alive) this.closePanel();
    });
    this.updateBossChallenge(g._bossChallengeView?.());
  }

  _tabSync() {
    $('#tabTowers').classList.toggle('active', this.activeTab === 'towers');
    $('#tabHeroes').classList.toggle('active', this.activeTab === 'heroes');
    this.renderCards();
  }

  // Collapse toggle for the left card panel. The chevron points in the direction
  // the panel will travel on the next click (left when open in LTR, etc.).
  _syncToggle() {
    const btn = $('#leftToggle');
    if (!btn) return;
    const hidden = document.body.classList.contains('panel-hidden');
    const rtl = document.body.classList.contains('rtl');
    btn.textContent = hidden ? (rtl ? '‹' : '›') : (rtl ? '›' : '‹');
    btn.title = hidden ? tOpt('hud.showPanel', 'Show panel') : tOpt('hud.hidePanel', 'Hide panel');
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
  }

  setMode(mode) {
    this.mode = mode;
    const hint = $('#modeHint');
    if (mode.kind === 'build') { hint.textContent = `${tName(mode.def)} — ${t('hud.cost')}: ${tNum(mode.def.cost)}`; hint.classList.add('visible'); }
    else if (mode.kind === 'assign') { hint.textContent = `${tName(mode.hero)} → ${t('hud.assignHero')}`; hint.classList.add('visible'); }
    else if (mode.kind === 'rally') { hint.textContent = t('hud.rallyHint'); hint.classList.add('visible'); }
    else if (mode.kind === 'fuse') { hint.textContent = t('hud.fuseHint'); hint.classList.add('visible'); }
    else hint.classList.remove('visible');
    for (const c of document.querySelectorAll('#cardGrid .card')) {
      c.classList.toggle('selected',
        (mode.kind === 'build' && c.dataset.id === mode.def?.id) ||
        (mode.kind === 'assign' && c.dataset.id === mode.hero?.id));
    }
  }

  updateTop() {
    $('#goldVal').textContent = tNum(this.game.gold);
    $('#livesVal').textContent = tNum(Math.max(0, this.game.lives));
    const w = this.game.endlessMode ? `${tNum(this.game.waveIdx)}∞` : `${tNum(this.game.waveIdx)}/${tNum(this.game.mapDef.waves)}`;
    $('#waveVal').textContent = w;
    $('#goldLbl').textContent = t('hud.gold');
    $('#livesLbl').textContent = t('hud.lives');
    $('#waveLbl').textContent = t('hud.wave');
    const tools = $('#sandboxTools');
    if (tools) tools.style.display = this.game.sandbox ? '' : 'none';
  }

  _runSandboxAssault(options = {}) {
    audio.ui();
    document.body.classList.add('panel-hidden');
    this._syncToggle?.();
    const callOptions = { ...options };
    if (!callOptions.label) callOptions.label = options.mode === 'royal'
      ? tOpt('palace.command.gateLineRoyal', 'Royal Gate Line')
      : tOpt('palace.command.gateLine', 'Gate Line');
    if (!callOptions.subLabel) callOptions.subLabel = tOpt('palace.command.gateLineSub', 'Palace defenders holding');
    const result = this.game.sandboxPalaceAssault?.(callOptions);
    if (result) {
      this.toast(t('hud.gateTestResultToast', {
        defenders: tNum(result.defenders || 0),
        attackers: tNum(result.staggered || result.count || 0),
      }));
      this.gateTestResultBanner(result);
    }
  }

  _runSandboxInspect() {
    audio.ui();
    const result = this.game.sandboxPalaceAssault?.({
      mode: 'royal',
      fullFx: true,
      label: tOpt('palace.command.gateLineRoyal', 'Royal Gate Line'),
      subLabel: tOpt('palace.command.gateLineSub', 'Palace defenders holding'),
    });
    this.game.previewCommandFx?.({ mode: 'royal' });
    const palace = this.game.map?.citadel;
    if (palace?.isPalace) this.showPalace(palace);
    if (result) {
      this.toast(t('hud.gateTestResultToast', {
        defenders: tNum(result.defenders || 0),
        attackers: tNum(result.staggered || result.count || 0),
      }));
      this.gateTestResultBanner(result);
    }
  }

  updateFarr() {
    const max = this.game.farrMax || 100;
    const val = Math.max(0, Math.min(max, this.game.farr || 0));
    const ready = val >= max;
    const chip = $('#farrChip');
    if (!chip) return;
    chip.classList.toggle('ready', ready);
    chip.title = ready ? t('hud.farrReady') : t('hud.farrTip');
    chip.setAttribute('aria-label', ready ? t('hud.farrReady') : t('hud.farrOpen'));
    $('#farrVal').textContent = `${tNum(val)}/${tNum(max)}`;
    $('#farrLbl').textContent = t('hud.farr');
    const fill = $('#farrFill');
    if (fill) fill.style.width = `${Math.round((val / max) * 100)}%`;
  }

  updateGateOmen() {
    const chip = $('#gateOmen');
    if (!chip) return;
    const palace = this.game.map?.citadel;
    if (!palace?.isPalace || this.game.phase === 'won' || this.game.phase === 'lost') {
      chip.style.display = 'none';
      return;
    }
    const info = this.game.palaceGateCommandPressure?.(palace) || { pressure: 0, count: 0, near: 0, peak: false, ready: false };
    const pressure = Math.max(0, Math.min(1, info.pressure || 0));
    const watch = info.count > 0 || pressure >= 0.18;
    if (!watch) {
      chip.style.display = 'none';
      return;
    }
    const state = info.peak ? 'peak' : info.ready ? 'ready' : 'watch';
    const label = tOpt(`hud.gateDanger.${state}`, state);
    const detail = t('hud.gateDangerDetail', {
      near: tNum(info.near || 0),
      p: tNum(Math.round(pressure * 100)),
    });
    chip.classList.remove('watch', 'ready', 'peak');
    chip.classList.add(state);
    chip.style.display = '';
    chip.title = t('hud.gateDangerTip');
    chip.setAttribute('aria-label', t('hud.gateDangerAria', { state: label, near: tNum(info.near || 0), p: tNum(Math.round(pressure * 100)) }));
    $('#gateOmenState').textContent = label;
    $('#gateOmenDetail').textContent = detail;
    const fill = $('#gateOmenFill');
    if (fill) fill.style.width = `${Math.max(5, Math.round(pressure * 100))}%`;
  }

  // wave button during the build-phase countdown: shows the timer + the early-call bonus
  _updateWaveBtn(remaining, bonus) {
    const btn = $('#waveBtn');
    if (!btn || this.game.waveActive) return;
    btn.disabled = false;
    const secs = Math.ceil(remaining);
    const bonusTxt = bonus > 0 ? ` · +${tNum(bonus)} 🪙` : '';
    btn.textContent = `⏳ ${tNum(secs)}s — ${t('hud.sendNow')}${bonusTxt}`;
    btn.classList.toggle('urgent', remaining <= 4);
  }

  refreshAll() {
    if (!$('#tabTowers') || !$('#waveBtn')) return;
    $('#tabTowers').textContent = t('hud.towers');
    $('#tabHeroes').textContent = t('hud.heroes');
    if (this.game.waveActive) $('#waveBtn').textContent = t('hud.waveInProgress');
    else this._updateWaveBtn(this.game.waveCountdown, this.game.earlyBonus());
    $('#langBtn').textContent = t('lore.toggle');
    this.updateTop();
    this.updateFarr();
    this.updateGateOmen();
    this.updateBossChallenge(this.game._bossChallengeView?.());
    this.renderCards();
    if (this.selectedEntity?.def) this.showTower(this.selectedEntity);
    else if (this.selectedEntity?.isPalace) this.showPalace(this.selectedEntity);
  }

  refreshAffordability() {
    for (const c of document.querySelectorAll('#cardGrid .card[data-cost]')) {
      c.classList.toggle('unaffordable', this.game.gold < parseInt(c.dataset.cost, 10));
    }
  }

  // ---------- left cards ----------
  // Group filter chips above the grid: towers by role, heroes by era (ageTier).
  _renderFilterBar() {
    const bar = clear($('#cardFilter'));
    const tab = this.activeTab;
    const active = this.filter[tab];
    // Derive the COMPLETE role set straight from the data so no role is ever
    // missing; TOWER_ROLE_ORDER only curates order, with any extras appended.
    const source = tab === 'towers' ? TOWERS : HEROES;
    const icons = tab === 'towers' ? ROLE_ICONS : HERO_ICONS;
    const present = [...new Set(source.map((x) => x.role))];
    const curated = tab === 'towers' ? TOWER_ROLE_ORDER : [];
    const roles = [...curated.filter((r) => present.includes(r)), ...present.filter((r) => !curated.includes(r))];
    const groups = roles.map((r) => ({ key: r, icon: icons[r] || '•', label: tOpt('role.' + r, r) }));
    const chip = (key, kids, title) => {
      const c = el('button', { class: 'filterchip' + (active === key ? ' active' : ''), title: title || '' }, ...kids);
      c.onclick = () => {
        this.filter[tab] = this.filter[tab] === key ? null : key; // re-click clears
        audio.ui();
        this.renderCards();
      };
      return c;
    };
    const items = [chip(null, [el('span', { class: 'fl' }, tOpt('hud.filterAll', 'All'))], tOpt('hud.filterAll', 'All'))];
    for (const g of groups) items.push(chip(g.key, [el('span', { class: 'fi' }, g.icon)], g.label));
    // Uniform grid, balanced rows, columns capped so cells stay tappable
    // (10 tower chips → 5+5; ~21 hero chips → 7+7+7).
    const maxCols = 7;
    const rows = Math.ceil(items.length / maxCols);
    const perRow = Math.ceil(items.length / rows);
    bar.style.gridTemplateColumns = `repeat(${perRow}, 1fr)`;
    bar.append(...items);
  }

  renderCards() {
    this._renderFilterBar();
    const grid = clear($('#cardGrid'));
    const f = this.filter[this.activeTab];
    if (this.activeTab === 'towers') {
      for (const def of (f ? TOWERS.filter((d) => d.role === f) : TOWERS)) {
        const card = el('div', { class: 'card', 'data-id': def.id, 'data-cost': def.cost, 'aria-label': `${tName(def)} ${t('hud.cost')} ${tNum(def.cost)}` });
        const portrait = el('div', { class: 'portrait' });
        const place = def.placeRef ? PLACES_BY_ID[def.placeRef] : null;
        if (place) applyAtlasCell(portrait, PLACE_ATLAS, place.atlas);
        else portrait.append(el('div', { class: 'emblem' }, ROLE_ICONS[def.role] || '🏛️'));
        portrait.append(
          el('span', { class: 'roleico', title: t('role.' + def.role) }, ROLE_ICONS[def.role] || ''),
          el('span', { class: 'cost' }, tNum(def.cost)),
        );
        card.append(
          portrait,
          el('div', { class: 'cardname' }, tName(def)),
          el('div', { class: 'cardfa' }, tNameAlt(def)),
          el('div', { class: 'cardhint' }, t('role.' + def.role)),
        );
        wireAction(card, () => {
          audio.unlock(); audio.ui();
          this.closePanel();
          this.showTowerDef(def);
          this.setMode({ kind: 'build', def });
        });
        grid.append(card);
      }
    } else {
      for (const hero of (f ? HEROES.filter((h) => h.role === f) : HEROES)) {
        const unlocked = this.game.heroRoster.includes(hero);
        const assignedTower = this.game.assignedHeroes.get(hero.id);
        const card = el('div', { class: 'card' + (unlocked ? '' : ' locked'), 'data-id': hero.id, 'aria-label': tName(hero) });
        const portrait = el('div', { class: 'portrait' });
        applyAtlasCell(portrait, HERO_ATLAS, hero.atlas);
        portrait.append(el('span', { class: 'roleico' }, HERO_ICONS[hero.role] || '⚔️'));
        if (!unlocked) portrait.append(el('div', { class: 'lockico' }, '🔒'));
        if (assignedTower) portrait.append(el('span', { class: 'assigned-chip' }, '⚑'));
        const rank = this.game.heroRank(hero.id);
        // Rank shown as a portrait badge (not a flow row) so every card has the
        // same fixed content height — avoids squishing the name on promoted heroes.
        if (rank > 0) portrait.append(el('span', { class: 'rankbadge' }, '★'.repeat(rank)));
        card.append(
          portrait,
          el('div', { class: 'cardname' }, tName(hero)),
          el('div', { class: 'cardfa' }, tNameAlt(hero)),
          el('div', { class: 'cardhint' }, tf(hero, 'short')),
        );
        wireAction(card, () => {
          audio.unlock(); audio.ui();
          this.showHero(hero, unlocked);
          if (unlocked) this.setMode({ kind: 'assign', hero });
        });
        grid.append(card);
      }
    }
    this.refreshAffordability();
  }

  // ---------- right panel ----------
  openPanel() {
    if (window.matchMedia?.('(max-width: 700px)').matches) {
      document.body.classList.add('panel-hidden');
      this._syncToggle();
    }
    $('#rightPanel').classList.add('visible');
  }
  closePanel() {
    this._clearHeroCommandTimer();
    this.game.clearHeroCommandPreview?.();
    this.game.clearPalaceCommandPreview?.();
    $('#rightPanel').classList.remove('visible');
    this.selectedEntity = null;
    this.cb.onSelectionCleared?.();
  }

  _clearHeroCommandTimer() {
    if (!this._heroCommandTimer) return;
    clearInterval(this._heroCommandTimer);
    this._heroCommandTimer = null;
  }

  _heroCommandMaxCd(hero) {
    return Math.max(24, 42 - this.game.heroRank(hero.id) * 4);
  }

  _palaceStateLabel({ cd = 0, cost = 0, ready = true } = {}) {
    if (cd > 0) return tOpt('palace.command.recovering', 'Recovering');
    if (cost > 0 && (this.game.gold || 0) < cost) return tOpt('palace.command.needGold', 'Need gold');
    if (!ready) return tOpt('palace.command.awaitingFarr', 'Awaiting Farr');
    return tOpt('palace.command.ready', 'Ready');
  }

  _palaceSeconds(value) {
    return t('palace.command.seconds', { s: tNum(value) });
  }

  _palaceMusterSurge() {
    let t = 0;
    let dur = 0;
    let defenders = 0;
    let active = 0;
    for (const sq of this.game.palaceSquads || []) {
      const alive = (sq.members || []).reduce((count, member) => count + (member?.alive ? 1 : 0), 0);
      defenders += alive;
      const gateT = Math.max(0, sq.gateLineT || 0);
      const surgeT = Math.max(0, sq.palaceSurgeT || 0);
      const bestT = Math.max(gateT, surgeT);
      if (bestT > 0.05) active += alive;
      if (bestT <= t) continue;
      t = bestT;
      dur = Math.max(bestT, surgeT > gateT ? (sq.palaceSurgeDur || surgeT) : (sq.gateLineDur || gateT));
    }
    const assault = this.game.palaceAssaultStatus || null;
    return {
      t,
      dur: Math.max(1, dur),
      defenders,
      active,
      assaultMode: assault?.mode || '',
      assaultCount: Math.max(0, assault?.count || 0),
      assaultPressure: Math.max(0, Math.min(1, assault?.pressure || 0)),
      assaultT: Math.max(0, assault?.t || 0),
      assaultDur: Math.max(1, assault?.dur || 1),
    };
  }

  _palaceGateStatusText(status) {
    if (status.assaultT > 0.05) {
      return t('palace.command.gatePressure', {
        mode: tOpt('hud.gateAssault.' + status.assaultMode, status.assaultMode),
        n: tNum(status.assaultCount),
      });
    }
    if (!status.defenders) return tOpt('palace.command.noDefenders', 'No palace defenders mustered');
    if (status.t > 0.05) return t('palace.command.defendersSurging', { time: this._palaceSeconds(Math.ceil(status.t)) });
    return t('palace.command.defendersReady', { n: tNum(status.defenders) });
  }

  _palaceGateTiming(palace) {
    const info = this.game.palaceGateCommandPressure?.(palace) || { pressure: 0, count: 0, near: 0, peak: false, ready: false };
    const state = info.peak ? 'peak' : info.ready ? 'ready' : 'wait';
    return {
      ...info,
      state,
      label: tOpt(`palace.command.gateTiming.${state}`, state),
      detail: t('palace.command.gateTimingDetail', {
        n: tNum(info.count || 0),
        p: tNum(Math.round((info.pressure || 0) * 100)),
      }),
    };
  }

  _heroCommandPanel(tower, activeLabel) {
    const cdMax = this._heroCommandMaxCd(tower.hero);
    const key = tower.hero.special?.key || 'default';
    const tone = heroTone(key);
    const rank = this.game.heroRank(tower.hero.id);
    const rankDef = HERO_RANKS[rank] || HERO_RANKS[0];
    const bond = Math.max(0, Math.min(100, Math.round((tower.getStats()?.bond || 0) * 100)));
    const tip = tOpt('heroActive.tip.' + key, tOpt('heroActive.tip.default', 'Trigger this commander command.'));
    const fill = el('i');
    const state = el('span', { class: 'hcc-state' });
    const time = el('span', { class: 'hcc-time', 'aria-live': 'polite' });
    const card = el('div', { class: `hero-command-card tone-${tone}`, 'aria-label': `${t('heroActive.command')}: ${activeLabel}` },
      el('div', { class: 'hcc-top' },
        el('span', { class: 'hcc-mark', 'aria-hidden': 'true' }, tone === 'fire' ? '🔥' : tone === 'heal' ? '🪶' : tone === 'vision' ? '🏹' : tone === 'bind' ? '⛓' : '⚑'),
        el('div', { class: 'hcc-head' },
          el('span', { class: 'hcc-kicker' }, t('heroActive.command')),
          el('b', {}, activeLabel),
        ),
      ),
      el('p', { class: 'hcc-desc' }, tip),
      el('div', { class: 'hcc-meta' },
        el('span', {}, `★ ${t('rank.' + rankDef.id)}`),
        el('span', {}, `${t('panel.bond')} ${tNum(bond)}%`),
      ),
      el('div', { class: 'hcc-meter', 'aria-hidden': 'true' }, fill),
      el('div', { class: 'hcc-foot' }, state, time),
    );
    return { card, fill, state, time, cdMax, label: activeLabel, tone };
  }

  _bindHeroCommandRefresh(tower, parts) {
    this._clearHeroCommandTimer();
    const sync = () => {
      if (this.selectedEntity !== tower || !tower.alive || !tower.hero || !parts.card.isConnected) {
        this._clearHeroCommandTimer();
        return;
      }
      const cd = Math.max(0, tower.heroActiveCd || 0);
      const ready = cd <= 0.05;
      const pct = ready ? 100 : Math.max(0, Math.min(100, ((parts.cdMax - cd) / parts.cdMax) * 100));
      parts.card.classList.toggle('ready', ready);
      parts.card.classList.toggle('cooldown', !ready);
      parts.fill.style.width = `${pct}%`;
      parts.state.textContent = ready ? t('heroActive.ready') : t('heroActive.recovering');
      parts.time.textContent = ready ? t('heroActive.readyNow') : t('heroActive.cooldownLeft', { s: tNum(Math.ceil(cd)) });
      if (parts.button) {
        parts.button.disabled = !ready;
        parts.button.setAttribute('aria-disabled', ready ? 'false' : 'true');
        parts.button.classList.toggle('primed', ready);
        parts.button.classList.toggle('recovering', !ready);
        parts.button.textContent = ready
          ? `✦ ${parts.label}`
          : `⏳ ${t('heroActive.cooldownButton', { s: tNum(Math.ceil(cd)) })}`;
      }
      if (ready) this._clearHeroCommandTimer();
    };
    sync();
    if (Math.max(0, tower.heroActiveCd || 0) > 0.05) {
      this._heroCommandTimer = setInterval(sync, 300);
    }
  }

  _bindHeroCommandPreview(tower, nodes) {
    const show = () => {
      if (this.selectedEntity === tower && tower?.alive && tower.hero) this.game.previewHeroCommand?.(tower);
    };
    const clear = () => this.game.clearHeroCommandPreview?.();
    for (const node of nodes.filter(Boolean)) {
      node.addEventListener('pointerenter', show);
      node.addEventListener('focusin', show);
      node.addEventListener('pointerleave', clear);
      node.addEventListener('focusout', clear);
    }
  }

  _bindPalaceCommandRefresh(palace) {
    this._clearHeroCommandTimer();
    const syncGateStatus = (surge) => {
      const gate = document.querySelector('[data-palace-gate-status]');
      if (!gate) return;
      const state = gate.querySelector('.pgs-state');
      const fill = gate.querySelector('.pgs-meter i');
      const pct = surge.t > 0.05
        ? Math.round(Math.max(0, Math.min(1, surge.t / Math.max(1, surge.dur))) * 100)
        : surge.defenders ? 100 : 0;
      const pressure = gate.querySelector('.pgs-pressure');
      const pressureFill = gate.querySelector('.pgs-pressure i');
      const pressureText = gate.querySelector('.pgs-pressure-label');
      gate.classList.toggle('active', surge.t > 0.05);
      gate.classList.toggle('pressured', surge.assaultT > 0.05);
      gate.classList.toggle('empty', !surge.defenders);
      gate.setAttribute('aria-label', `${tOpt('palace.command.gateStatus', 'Gate line')}: ${this._palaceGateStatusText(surge)}`);
      if (state) state.textContent = this._palaceGateStatusText(surge);
      if (fill) fill.style.width = `${pct}%`;
      if (pressure) pressure.hidden = surge.assaultT <= 0.05;
      if (pressureFill) pressureFill.style.width = `${Math.round(surge.assaultPressure * 100)}%`;
      if (pressureText) pressureText.textContent = t('palace.command.pressureHold', { time: this._palaceSeconds(Math.ceil(surge.assaultT)) });
    };
    const syncCard = (id, cd) => {
      const card = document.querySelector(`.palace-command-card[data-command="${id}"]`);
      if (!card) return false;
      const max = Number(card.dataset.cdMax || 1);
      const cost = Number(card.dataset.cost || 0);
      const title = card.dataset.title || '';
      const surge = id === 'muster' ? this._palaceMusterSurge() : { t: 0, dur: 1 };
      const active = surge.t > 0.05;
      const recovering = cd > 0.05;
      const disabled = recovering || (cost > 0 && (this.game.gold || 0) < cost);
      const ready = !disabled;
      const state = this._palaceStateLabel({ cd, cost });
      const stateText = active
        ? t('palace.command.gateSurge', { time: this._palaceSeconds(Math.ceil(surge.t)) })
        : recovering ? `${state} ${this._palaceSeconds(Math.ceil(cd))}` : state;
      const fill = active
        ? Math.round(Math.max(0, Math.min(1, surge.t / Math.max(1, surge.dur))) * 100)
        : recovering
        ? Math.round((1 - Math.max(0, Math.min(1, cd / Math.max(1, max)))) * 100)
        : 100;
      card.disabled = disabled;
      card.classList.toggle('active', active);
      card.classList.toggle('cooldown', recovering && !active);
      card.classList.toggle('locked', disabled && !recovering && !active);
      card.classList.toggle('ready', ready);
      card.setAttribute('aria-label', `${title}: ${stateText}`);
      const stateEl = card.querySelector('.pcc-state');
      const fillEl = card.querySelector('.pcc-meter i');
      if (stateEl) stateEl.textContent = stateText;
      if (fillEl) fillEl.style.width = `${fill}%`;
      return recovering || active;
    };
    const syncGateCommandCard = () => {
      const card = document.querySelector('.palace-command-card[data-command="gateCommand"]');
      if (!card) return false;
      const status = this.game.palaceAssaultStatus || null;
      const active = (status?.t || 0) > 0.05;
      const cd = this.game.sandbox ? 0 : Math.max(0, palace.gateCommandCd || 0);
      const max = Number(card.dataset.cdMax || 1);
      const cost = Number(card.dataset.cost || 0);
      const recovering = cd > 0.05;
      const disabled = recovering || (cost > 0 && (this.game.gold || 0) < cost);
      const fill = active
        ? Math.round(Math.max(0, Math.min(1, status.t / Math.max(1, status.dur || 1))) * 100)
        : recovering
        ? Math.round((1 - Math.max(0, Math.min(1, cd / Math.max(1, max)))) * 100)
        : 100;
      const stateText = active
        ? t('palace.command.gateTestActive', {
          mode: tOpt('hud.gateAssault.' + status.mode, status.mode),
          time: this._palaceSeconds(Math.ceil(status.t)),
        })
        : recovering
        ? `${this._palaceStateLabel({ cd, cost })} ${this._palaceSeconds(Math.ceil(cd))}`
        : this._palaceStateLabel({ cd, cost });
      card.disabled = disabled;
      card.classList.toggle('active', active);
      card.classList.toggle('cooldown', recovering && !active);
      card.classList.toggle('locked', disabled && !recovering && !active);
      card.classList.toggle('ready', !disabled && !active);
      card.setAttribute('aria-label', `${card.dataset.title || ''}: ${stateText}`);
      const stateEl = card.querySelector('.pcc-state');
      const fillEl = card.querySelector('.pcc-meter i');
      if (stateEl) stateEl.textContent = stateText;
      if (fillEl) fillEl.style.width = `${fill}%`;
      const timingEl = card.querySelector('.gate-timing-chip');
      if (timingEl) {
        const timing = this._palaceGateTiming(palace);
        timingEl.className = `gate-timing-chip ${timing.state}`;
        timingEl.textContent = `${timing.label} · ${timing.detail}`;
      }
      return active || recovering;
    };
    const sync = () => {
      if (this.selectedEntity !== palace || !palace?.isPalace || !document.querySelector('.palace-commands')) {
        this._clearHeroCommandTimer();
        return;
      }
      const hasMusterCd = syncCard('muster', Math.max(0, palace.musterCd || 0));
      const hasBoonCd = syncCard('boon', Math.max(0, palace.boonCd || 0));
      const hasGateCommand = syncGateCommandCard();
      const surge = this._palaceMusterSurge();
      syncGateStatus(surge);
      if (!hasMusterCd && !hasBoonCd && !hasGateCommand && surge.t <= 0.05 && surge.assaultT <= 0.05) this._clearHeroCommandTimer();
    };
    sync();
    const surge = this._palaceMusterSurge();
    if (Math.max(0, palace.musterCd || 0) > 0.05 || Math.max(0, palace.boonCd || 0) > 0.05 || Math.max(0, palace.gateCommandCd || 0) > 0.05 || surge.t > 0.05 || surge.assaultT > 0.05 || document.querySelector('.palace-command-card[data-command="gateCommand"]')) {
      this._heroCommandTimer = setInterval(sync, 300);
    }
  }

  _portrait(kind, ref) {
    const p = el('div', { class: 'rp-portrait' });
    if (kind === 'hero') applyAtlasCell(p, HERO_ATLAS, ref.atlas);
    else if (kind === 'enemy') applyAtlasCell(p, ENEMY_ATLAS, ref.atlas);
    else if (kind === 'place') applyAtlasCell(p, PLACE_ATLAS, ref.atlas);
    else if (kind === 'tower') {
      const place = ref.placeRef ? PLACES_BY_ID[ref.placeRef] : null;
      if (place) applyAtlasCell(p, PLACE_ATLAS, place.atlas);
      else p.append(el('div', { class: 'emblem' }, ROLE_ICONS[ref.role] || '🏛️'));
    }
    return p;
  }

  // visual age tree for a tower line: 5 nodes + fusion branches off the current age
  _ageTree(def, tower) {
    const tree = el('div', { class: 'utree' });
    const curAge = tower ? tower.ageIdx : -1;
    AGES.forEach((a, i) => {
      const state = i < curAge ? 'done' : i === curAge ? 'current' : i === curAge + 1 ? '' : 'locked';
      const cost = i === 0 ? def.cost : Math.round(def.cost * a.costMult);
      const node = el('div', { class: 'unode ' + state },
        el('div', { class: 'ucard2' },
          el('div', { class: 'utitle' },
            el('b', {}, t('age.' + a.id)),
            el('span', { class: 'umult' }, '×' + a.mult + (i > 0 ? ` · ${tNum(cost)} 🪙` : '')),
          ),
          el('div', { class: 'udesc' }, t('agefx.' + a.id)),
        ),
      );
      // the next age is buyable on a built tower
      if (tower && i === curAge + 1 && tower.canUpgrade()) {
        const buy = el('button', { class: 'gbtn primary ubuy' }, `${t('hud.upgrade')} — ${tNum(tower.upgradeCost())} 🪙`);
        buy.disabled = this.game.gold < tower.upgradeCost();
        buy.onclick = () => { if (this.game.upgradeTower(tower)) this.showTower(tower); };
        node.querySelector('.ucard2').append(buy);
      }
      tree.append(node);
      // fusion branches sprout from the current (or first, for unbuilt) node
      if (i === Math.max(curAge, 0)) {
        for (const f of FUSIONS.filter((x) => x.a === def.id || x.b === def.id)) {
          const otherId = f.a === def.id ? f.b : f.a;
          const other = TOWERS.find((tw) => tw.id === otherId);
          tree.append(el('div', { class: 'ubranch' },
            el('b', {}, '⚭ ' + tName(f)), ` ← ${other ? tName(other) : otherId} · ${tNum(f.cost)} 🪙`));
        }
      }
    });
    return tree;
  }

  // visual rank tree for a hero: 4 persistent ranks with a promote button
  _rankTree(hero, unlocked) {
    const tree = el('div', { class: 'utree' });
    const cur = this.game.heroRank(hero.id);
    HERO_RANKS.forEach((r, i) => {
      const state = i < cur ? 'done' : i === cur ? 'current' : i === cur + 1 ? '' : 'locked';
      const node = el('div', { class: 'unode ' + state },
        el('div', { class: 'ucard2' },
          el('div', { class: 'utitle' },
            el('b', {}, t('rank.' + r.id)),
            el('span', { class: 'umult' }, t('panel.rankEffect', { m: r.mult }) + (i > 0 ? ` · ${tNum(r.cost)} 🪙` : '')),
          ),
        ),
      );
      if (unlocked && i === cur + 1) {
        const buy = el('button', { class: 'gbtn primary ubuy' }, t('hud.rankUp', { cost: tNum(r.cost) }));
        buy.disabled = this.game.gold < r.cost;
        buy.onclick = () => {
          if (this.game.upgradeHeroRank(hero)) {
            this.toast(t('hud.rankUpDone', { name: tName(hero), rank: t('rank.' + r.id) }));
            this.showHero(hero, unlocked);
            this.renderCards();
          }
        };
        node.querySelector('.ucard2').append(buy);
      }
      tree.append(node);
    });
    return tree;
  }

  _loreSections(def) {
    const note = def.ledgerNote ? tOpt('ledgernote.' + def.id, def.ledgerNote) : null;
    const out = [
      el('div', { class: 'rp-section' },
        el('h4', {}, t('panel.storyRef')),
        el('p', { class: 'storyref' }, tOpt('storyref.' + def.id, def.sourceRef)),
      ),
      el('div', { class: 'rp-section' },
        el('h4', {}, t('panel.lore')),
        el('p', {}, tf(def, 'detail') || tf(def, 'lore')),
        note ? el('p', { class: 'ledgernote' }, `${t('panel.ledgerNote')}: ${note}`) : null,
      ),
    ];
    return out;
  }

  showTowerDef(def) {
    this._clearHeroCommandTimer();
    this.selectedEntity = null;
    const c = clear($('#rpContent'));
    const stats = [
      [t('panel.role'), t('role.' + def.role)],
      def.damage ? [t('panel.damage'), tNum(Math.round(def.damage))] : null,
      def.range ? [t('panel.range'), tNum(def.range)] : null,
      def.rate ? [t('panel.dps'), tNum(Math.round(def.damage * def.rate * 10) / 10)] : null,
      def.income ? [t('panel.income'), tNum(def.income)] : null,
      def.garrison ? [t('panel.garrison'), tName(SOLDIERS_BY_ID[def.garrison.soldier])] : null,
      [t('hud.cost'), tNum(def.cost)],
    ].filter(Boolean);
    put(c, 
      this._portrait('tower', def),
      el('div', { class: 'rp-name' }, tName(def)),
      el('div', { class: 'rp-faname' }, tNameAlt(def)),
      el('div', { class: 'rp-tags' },
        el('span', { class: 'tag' }, t('role.' + def.role)),
        ...def.affinity.slice(0, 4).map((a) => el('span', { class: 'tag' }, tOpt('tag.' + a, a))),
      ),
      el('div', { class: 'rp-section' }, ...stats.map(([k, v]) => el('div', { class: 'statrow' }, el('span', {}, k), el('b', {}, v)))),
      el('div', { class: 'rp-section' },
        el('h4', {}, t('panel.upgrades')),
        this._ageTree(def, null),
        el('p', { class: 'ledgernote' }, t('age.masteryNote')),
      ),
      el('div', { class: 'rp-section' },
        el('h4', {}, t('panel.compatHeroes')),
        el('p', {}, (def.compatHeroes || []).map((id) => tName(HEROES.find((h) => h.id === id))).join('، ')),
      ),
      el('div', { class: 'rp-section' },
        el('h4', {}, t('panel.fusions')),
        ...FUSIONS.filter((f) => f.a === def.id || f.b === def.id).map((f) =>
          el('p', {}, `⚭ ${tName(f)} — ${tf(f, 'loreReason')}`)),
      ),
      ...this._loreSections({ id: def.id, sourceRef: def.sourceRef, detail: def.lore, detailFa: def.loreFa }),
    );
    this.openPanel();
  }

  showTower(tower) {
    this._clearHeroCommandTimer();
    this.game.clearHeroCommandPreview?.();
    this.selectedEntity = tower;
    const def = tower.def;
    const stats = tower.getStats();
    const c = clear($('#rpContent'));
    const hpFrac = Math.max(0, tower.hp / tower.maxHp);
    const rows = [
      [t('panel.age'), t('age.' + AGES[tower.ageIdx].id)],
      stats.damage ? [t('panel.damage'), tNum(Math.round(stats.damage))] : null,
      stats.range ? [t('panel.range'), tNum(Math.round(stats.range * 10) / 10)] : null,
      stats.rate ? [t('panel.dps'), tNum(Math.round(stats.damage * stats.rate))] : null,
      stats.income ? [t('panel.income'), tNum(Math.round(stats.income))] : null,
      tower.palaceSynergyT > 0 ? [
        tOpt('palace.synergy', 'Palace-Commander Synergy'),
        tOpt('palace.synergyPanel', 'Answered the palace for {s}s').replace('{s}', tNum(Math.ceil(tower.palaceSynergyT))),
      ] : null,
      [t('panel.health'), `${tNum(Math.round(tower.hp))} / ${tNum(tower.maxHp)}`],
    ].filter(Boolean);

    const actions = el('div', { class: 'rp-actions' });
    let heroCommand = null;
    // upgrade
    const upBtn = el('button', { class: 'gbtn primary' },
      tower.canUpgrade() ? `${t('hud.upgrade')} — ${tNum(tower.upgradeCost())} 🪙` : t('hud.maxAge'));
    upBtn.disabled = !tower.canUpgrade() || this.game.gold < tower.upgradeCost();
    upBtn.onclick = () => { if (this.game.upgradeTower(tower)) this.showTower(tower); };
    actions.append(upBtn);
    // hero assign / recall + PROMOTE the commander's rank directly from the tower
    if (tower.hero) {
      const rankCost = this.game.heroRankUpCost(tower.hero.id);
      if (rankCost != null) {
        const nextRank = HERO_RANKS[this.game.heroRank(tower.hero.id) + 1];
        const promo = el('button', { class: 'gbtn primary' },
          `★ ${tOpt('hud.promote', 'Promote')} — ${tOpt('rank.' + nextRank.id, nextRank.id)} (${tNum(rankCost)} 🪙)`);
        promo.disabled = this.game.gold < rankCost;
        promo.onclick = () => { if (this.game.upgradeHeroRank(tower.hero)) { this.showTower(tower); this.renderCards(); } };
        actions.append(promo);
      } else {
        actions.append(el('div', { class: 'rp-note' }, `★ ${tName(tower.hero)} — ${tOpt('hud.maxRank', 'max rank')}`));
      }
      const hKey = tower.hero.special?.key || 'default';
      const activeLabel = tOpt('heroActive.' + hKey, tOpt('heroActive.default', 'Hero Command'));
      heroCommand = this._heroCommandPanel(tower, activeLabel);
      const active = el('button', {
        class: 'gbtn fuse hero-command-btn',
        title: tOpt('heroActive.tip.' + hKey, tOpt('heroActive.tip.default', 'Trigger this commander command.')),
      });
      active.onclick = () => {
        this.game.clearHeroCommandPreview?.();
        if (this.game.heroActive(tower)) {
          this.toast(t('heroActive.used', { name: tName(tower.hero) }));
          this.showTower(tower);
        }
      };
      actions.append(active);
      const recall = el('button', { class: 'gbtn' }, `${t('hud.unassignHero')} (${tName(tower.hero)})`);
      recall.onclick = () => { this.game.unassignHero(tower); this.showTower(tower); this.renderCards(); };
      actions.append(recall);
    }
    // rally
    if (tower.squads.length) {
      const rally = el('button', { class: 'gbtn' }, `⚑ ${t('hud.rally')}`);
      rally.onclick = () => this.setMode({ kind: 'rally', tower });
      actions.append(rally);
    }
    // fusion — ALWAYS list every recipe this tower can do, with a live status so it's discoverable:
    // an active Merge button when a partner tower is already built within range, else guidance.
    const recipes = FUSIONS.filter((f) => f.a === def.id || f.b === def.id);
    if (recipes.length) {
      actions.append(el('div', { class: 'rp-subhead' }, `⚭ ${t('panel.fusions')}`));
      for (const f of recipes) {
        const otherId = f.a === def.id ? f.b : f.a;
        const otherDef = TOWERS.find((td) => td.id === otherId);
        const other = this.game.towers.find((tw) => tw !== tower && tw.alive && tw.def.id === otherId && tw.pos.distanceTo(tower.pos) <= f.maxDist);
        if (other) {
          const fuseBtn = el('button', { class: 'gbtn fuse' }, `⚭ ${tOpt('hud.mergeInto', 'Merge into')} ${tName(f)} — ${tNum(f.cost)} 🪙`);
          fuseBtn.disabled = this.game.gold < f.cost;
          fuseBtn.onclick = () => { if (this.game.fuseTowers(tower, other)) this.showTower(tower.pad.tower); };
          actions.append(fuseBtn);
        } else {
          actions.append(el('div', { class: 'rp-note' },
            `⚭ ${tName(f)}: ${tOpt('hud.mergeNeed', 'build')} ${otherDef ? tName(otherDef) : otherId} ${tOpt('hud.mergeWithin', 'within')} ${tNum(Math.round(f.maxDist))}`));
        }
      }
    }
    // sell
    const sell = el('button', { class: 'gbtn danger' }, t('hud.sellRefund', { gold: tNum(tower.sellRefund()) }));
    sell.onclick = () => { this.game.sellTower(tower); this.closePanel(); };
    actions.append(sell);

    // hero suggestion list (with bond preview)
    const heroList = el('div', { class: 'heroassignlist' });
    const candidates = this.game.heroRoster
      .map((h) => ({ h, bond: heroBond(h, def, tower.ageIdx) }))
      .sort((a, b) => b.bond - a.bond)
      .slice(0, 6);
    for (const { h, bond } of candidates) {
      const assignedTower = this.game.assignedHeroes.get(h.id);
      const busy = assignedTower && assignedTower !== tower;
      const assignedHere = assignedTower === tower;
      const hKey = h.special?.key || 'default';
      const hTone = heroTone(hKey);
      const rank = this.game.heroRank(h.id);
      const rankDef = HERO_RANKS[rank] || HERO_RANKS[0];
      const mini = el('div', { class: 'mini' });
      applyAtlasCell(mini, HERO_ATLAS, h.atlas);
      const row = el('button', {
        class: `heroassignrow tone-${hTone}${busy ? ' busy' : ''}${assignedHere ? ' assigned' : ''}`,
        type: 'button',
        'aria-label': `${t('hud.assignHero')}: ${tName(h)}`,
        title: tOpt('heroActive.tip.' + hKey, tOpt('heroActive.tip.default', 'Trigger this commander command.')),
      },
        mini,
        el('div', { class: 'hname' },
          el('span', { class: 'heroassign-title' }, tName(h)),
          el('span', { class: 'heroassign-command' }, tOpt('heroActive.' + hKey, tOpt('heroActive.default', 'Hero Command'))),
          el('div', { class: 'bondbar' }, el('i', { style: { width: `${Math.min(100, bond * 100)}%` } })),
        ),
        el('span', { class: 'bond' }, `${t('panel.bond')} ${tNum(Math.round(bond * 100))}%`),
        el('span', { class: 'heroassign-rank', title: t('rank.' + rankDef.id) }, '★'.repeat(Math.max(1, rank + 1))),
      );
      row.onclick = () => {
        this.game.assignHero(h, tower);
        this.showTower(tower);
        this.renderCards();
        const content = $('#rpContent');
        const commandCard = content?.querySelector('.hero-command-card');
        if (content && commandCard) {
          content.scrollTop = Math.max(0, commandCard.offsetTop - 8);
        }
      };
      heroList.append(row);
    }

    put(c, 
      this._portrait('tower', def),
      el('div', { class: 'rp-name' }, tName(def)),
      el('div', { class: 'rp-faname' }, tNameAlt(def)),
      el('div', { class: 'rp-tags' },
        el('span', { class: 'tag' }, t('role.' + def.role)),
        el('span', { class: 'tag' }, t('age.' + AGES[tower.ageIdx].id)),
        tower.hero ? el('span', { class: 'tag story' }, `⚑ ${tName(tower.hero)}`) : null,
      ),
      el('div', { class: 'bondbar', style: { height: '8px', marginBottom: '8px' } },
        el('i', { style: { width: `${hpFrac * 100}%`, background: hpFrac > 0.45 ? undefined : 'linear-gradient(90deg,#8e3a2a,#c23b2a)' } })),
      el('div', { class: 'rp-section' }, ...rows.map(([k, v]) => el('div', { class: 'statrow' }, el('span', {}, k), el('b', {}, v)))),
      tower.hero ? el('div', { class: 'rp-section' },
        el('h4', {}, t('panel.towerMods')),
        el('p', {}, `${t('panel.bond')}: ${Math.round(stats.bond * 100)}% — ${tOpt('special.' + tower.hero.id, tower.hero.special?.desc)}`),
        el('p', { class: 'ledgernote' }, t('panel.bondFormula')),
      ) : null,
      heroCommand?.card,
      actions,
      el('div', { class: 'rp-section', style: { marginTop: '10px' } },
        el('h4', {}, t('panel.upgrades')),
        this._ageTree(def, tower),
      ),
      el('div', { class: 'rp-section' },
        el('h4', {}, t('panel.compatHeroes')),
        heroList,
      ),
      ...this._loreSections({ id: def.id, sourceRef: def.sourceRef, detail: def.lore, detailFa: def.loreFa }),
    );
    this.openPanel();
    if (heroCommand) {
      const commandButton = actions.querySelector('.hero-command-btn');
      this._bindHeroCommandPreview(tower, [heroCommand.card, commandButton]);
      this._bindHeroCommandRefresh(tower, { ...heroCommand, button: commandButton });
    }
  }

  // The central palace: stage lore, Farr state, and royal command choices.
  showPalace(palace) {
    this._clearHeroCommandTimer();
    this.game.clearHeroCommandPreview?.();
    this.game.clearPalaceCommandPreview?.();
    this.selectedEntity = palace;
    const placeId = palace.placeId || this.game.mapDef.id;
    const place = PLACES_BY_ID[placeId] || {};
    const c = clear($('#rpContent'));
    const d = palace.defense || {};
    const rows = [
      d.range ? [t('panel.range'), tNum(Math.round(d.range))] : null,
      d.damage ? [t('panel.damage'), tNum(Math.round(d.damage))] : null,
    ].filter(Boolean);

    const cfg = palaceDef(placeId);
    const musterDef = SOLDIERS_BY_ID[cfg.muster.unit];
    const boonName = tOpt('palace.boonType.' + cfg.boon.type, tOpt('palace.boon', "King's Boon"));
    const boonLore = tOpt(cfg.loreKey, '');
    const commandStack = el('div', { class: 'rp-section palace-commands' },
      el('h4', {}, tOpt('palace.commands', 'Royal Commands')),
    );
    const maxFarr = this.game.farrMax || 100;
    const farr = Math.max(0, Math.min(maxFarr, this.game.farr || 0));
    const oathReady = this.game.canUseOath?.();
    const muCd = Math.max(0, palace.musterCd || 0);
    const boCd = Math.max(0, palace.boonCd || 0);
    const gateCommandCost = this.game.sandbox ? 0 : 135;
    const gateCommandCdMax = this.game.sandbox ? 1 : 52;
    const gateCommandCd = this.game.sandbox ? 0 : Math.max(0, palace.gateCommandCd || 0);
    const muSurge = this._palaceMusterSurge();
    const gold = this.game.gold || 0;
    const pct = (value, max) => `${Math.round(Math.max(0, Math.min(1, value / Math.max(1, max))) * 100)}%`;
    const cdPct = (remaining, max) => `${Math.round((1 - Math.max(0, Math.min(1, remaining / Math.max(1, max)))) * 100)}%`;
    const seconds = (value) => this._palaceSeconds(value);
    const meta = (...parts) => parts.filter(Boolean).map((part) => el('span', {}, part));
    const gateStatus = (status) => {
      const active = status.t > 0.05;
      const meter = active ? pct(status.t, status.dur) : status.defenders ? '100%' : '0%';
      const pressured = status.assaultT > 0.05;
      return el('div', {
        class: `palace-gate-status${active ? ' active' : ''}${pressured ? ' pressured' : ''}${status.defenders ? '' : ' empty'}`,
        'data-palace-gate-status': 'true',
        'aria-live': 'polite',
        'aria-label': `${tOpt('palace.command.gateStatus', 'Gate line')}: ${this._palaceGateStatusText(status)}`,
      },
        el('span', { class: 'pgs-kicker' }, tOpt('palace.command.gateStatus', 'Gate line')),
        el('b', { class: 'pgs-state' }, this._palaceGateStatusText(status)),
        el('span', { class: 'pgs-meter', 'aria-hidden': 'true' }, el('i', { style: { width: meter } })),
        el('span', { class: 'pgs-pressure', hidden: !pressured },
          el('span', { class: 'pgs-pressure-label' }, t('palace.command.pressureHold', { time: this._palaceSeconds(Math.ceil(status.assaultT)) })),
          el('span', { class: 'pgs-pressure-meter', 'aria-hidden': 'true' }, el('i', { style: { width: `${Math.round(status.assaultPressure * 100)}%` } })),
        ),
      );
    };
    const commandCard = ({
      tone = 'rally', icon = '✦', title, desc, state, meter = '100%', cd = 0,
      disabled = false, active = false, commandId = '', previewId = '', cdMax = 0, cost = 0, metaItems = [], onUse,
    }) => {
      const locked = disabled && cd <= 0;
      const attrs = {
        class: `palace-command-card tone-${tone}${active ? ' active' : cd > 0 ? ' cooldown' : ''}${locked && !active ? ' locked' : ''}${!disabled ? ' ready' : ''}`,
        type: 'button',
        title: desc,
        'aria-label': `${title}: ${state}`,
        'data-title': title,
      };
      if (commandId) {
        attrs['data-command'] = commandId;
        attrs['data-cd-max'] = String(cdMax || 1);
        attrs['data-cost'] = String(cost || 0);
      }
      const card = el('button', attrs,
        el('span', { class: 'pcc-mark', 'aria-hidden': 'true' }, icon),
        el('span', { class: 'pcc-main' },
          el('span', { class: 'pcc-head' },
            el('b', {}, title),
            el('span', { class: 'pcc-state' }, state),
          ),
          el('span', { class: 'pcc-desc' }, desc),
          el('span', { class: 'pcc-meter' }, el('i', { style: { width: meter } })),
          el('span', { class: 'pcc-meta' }, ...metaItems),
        ),
      );
      card.disabled = disabled;
      if (previewId) {
        const showPreview = () => {
          if (this.selectedEntity === palace && !card.disabled) this.game.previewPalaceCommand?.(palace, previewId);
        };
        const clearPreview = () => this.game.clearPalaceCommandPreview?.();
        card.addEventListener('pointerenter', showPreview);
        card.addEventListener('focusin', showPreview);
        card.addEventListener('pointerleave', clearPreview);
        card.addEventListener('focusout', clearPreview);
      }
      card.onclick = () => {
        this.game.clearPalaceCommandPreview?.();
        if (!onUse?.()) return;
        this.showPalace(palace);
      };
      return card;
    };

    const gateCommandStatus = this.game.palaceAssaultStatus || null;
    const gateCommandActive = (gateCommandStatus?.t || 0) > 0.05;
    const gateTiming = this._palaceGateTiming(palace);
    const gateTimingChip = el('span', { class: `gate-timing-chip ${gateTiming.state}` },
      `${gateTiming.label} · ${gateTiming.detail}`);
    const gateCommandCard = commandCard({
      tone: 'impact',
      icon: '◉',
      title: tOpt('palace.command.gateTest', 'Royal Gate Command'),
      desc: tOpt('palace.command.gateTestEffect', 'Calls a royal gate clash so the palace guard visibly holds the line against attackers.'),
      state: gateCommandActive
        ? t('palace.command.gateTestActive', {
          mode: tOpt('hud.gateAssault.' + gateCommandStatus.mode, gateCommandStatus.mode),
          time: this._palaceSeconds(Math.ceil(gateCommandStatus.t)),
        })
        : this._palaceStateLabel({ cd: gateCommandCd, cost: gateCommandCost }),
      meter: gateCommandActive
        ? `${Math.round(Math.max(0, Math.min(1, gateCommandStatus.t / Math.max(1, gateCommandStatus.dur || 1))) * 100)}%`
        : gateCommandCd > 0 ? cdPct(gateCommandCd, gateCommandCdMax)
        : '100%',
      cd: gateCommandCd,
      active: gateCommandActive,
      commandId: 'gateCommand',
      cdMax: gateCommandCdMax,
      cost: gateCommandCost,
      disabled: gateCommandCd > 0 || gateCommandCost > 0 && gold < gateCommandCost,
      metaItems: meta(
        gateCommandCost > 0 ? `${t('hud.cost')} ${tNum(gateCommandCost)} 🪙` : tOpt('palace.command.sandboxOnly', 'Sandbox only'),
        gateCommandCost > 0 ? `${tOpt('palace.cooldown', 'Cooldown')} ${seconds(gateCommandCdMax)}` : tOpt('hud.sandboxKeyG', 'G'),
        tOpt('palace.command.gateCommandMeta', 'Braces defenders and staggers attackers near the gate'),
        tOpt('palace.command.gateCommandGuardMeta', 'If the gate is empty, calls temporary no-respawn palace guards'),
        tOpt('palace.command.gateTimingMeta', 'Peak timing hits harder, briefly quickens nearby towers, then fades faster'),
        gateTimingChip,
      ),
      onUse: () => {
        const result = this.game.sandbox
          ? this.game.sandboxPalaceAssault?.({
            mode: 'royal',
            fullFx: true,
            label: tOpt('palace.command.gateLineRoyal', 'Royal Gate Command'),
            subLabel: tOpt('palace.command.gateLineSub', 'Palace defenders hold the threshold'),
          })
          : this.game.palaceGateCommand?.(palace, {
            forceFx: true,
            label: tOpt('palace.command.gateLineRoyal', 'Royal Gate Command'),
            subLabel: tOpt('palace.command.gateLineSub', 'Palace defenders hold the threshold'),
          });
        if (this.game.sandbox) this.game.previewCommandFx?.({ mode: 'royal' });
        if (result) {
          const toastKey = (result.gateGuard || 0) > 0 ? 'hud.gateTestResultToastGuard' : 'hud.gateTestResultToast';
          this.toast(t(toastKey, {
            defenders: tNum(result.defenders || 0),
            guards: tNum(result.gateGuard || 0),
            attackers: tNum(result.staggered || result.count || 0),
          }));
          this.gateTestResultBanner(result);
        }
        return true;
      },
    });

    commandStack.append(
      gateStatus(muSurge),
      commandCard({
        tone: 'rally',
        icon: '✦',
        title: t('oath.title'),
        desc: t('oath.effect'),
        state: this._palaceStateLabel({ ready: oathReady }),
        meter: pct(farr, maxFarr),
        disabled: !oathReady,
        metaItems: meta(
          tOpt('palace.command.farrMeter', 'Farr') + ` ${tNum(farr)}/${tNum(maxFarr)}`,
          t('oath.spend'),
        ),
        onUse: () => this.game.triggerOath(palace),
      }),
      commandCard({
        tone: 'rally',
        icon: '⚔',
        title: `${tOpt('palace.muster', 'Muster')} ${musterDef ? tName(musterDef) : ''}`,
        desc: t('palace.command.musterEffect', { count: tNum(cfg.muster.count), unit: musterDef ? tName(musterDef) : tOpt('palace.muster', 'Muster') }),
        state: muSurge.t > 0.05
          ? t('palace.command.gateSurge', { time: seconds(Math.ceil(muSurge.t)) })
          : this._palaceStateLabel({ cd: muCd, cost: cfg.muster.cost }),
        meter: muSurge.t > 0.05 ? pct(muSurge.t, muSurge.dur) : muCd > 0 ? cdPct(muCd, cfg.muster.cd) : '100%',
        cd: muCd,
        active: muSurge.t > 0.05,
        commandId: 'muster',
        previewId: 'muster',
        cdMax: cfg.muster.cd,
        cost: cfg.muster.cost,
        disabled: muCd > 0 || gold < cfg.muster.cost,
        metaItems: meta(
          `${t('hud.cost')} ${tNum(cfg.muster.cost)} 🪙`,
          `${tOpt('palace.cooldown', 'Cooldown')} ${seconds(cfg.muster.cd)}`,
          t('palace.command.musterCount', { count: tNum(cfg.muster.count) }),
        ),
        onUse: () => this.game.palaceMuster(palace),
      }),
      commandCard({
        tone: palaceTone(cfg.boon.type),
        icon: palaceSigil(cfg.boon.type),
        title: boonName,
        desc: tOpt('palace.boonEffect.' + cfg.boon.type, boonLore || tOpt('palace.boon', "King's Boon")),
        state: this._palaceStateLabel({ cd: boCd, cost: cfg.boon.cost }),
        meter: boCd > 0 ? cdPct(boCd, cfg.boon.cd) : '100%',
        cd: boCd,
        commandId: 'boon',
        previewId: 'boon',
        cdMax: cfg.boon.cd,
        cost: cfg.boon.cost,
        disabled: boCd > 0 || gold < cfg.boon.cost,
        metaItems: meta(
          `${t('hud.cost')} ${tNum(cfg.boon.cost)} 🪙`,
          `${tOpt('palace.cooldown', 'Cooldown')} ${seconds(cfg.boon.cd)}`,
          cfg.boon.radius ? `${tOpt('palace.command.reach', 'Reach')} ${tNum(cfg.boon.radius)}` : null,
          cfg.boon.dur ? `${tOpt('palace.command.duration', 'Duration')} ${seconds(cfg.boon.dur)}` : null,
        ),
        onUse: () => this.game.palaceBoon(palace),
      }),
      commandCard({
        tone: 'rally',
        icon: '⚑',
        title: tOpt('palace.rally', 'Rally to the Keep'),
        desc: tOpt('palace.command.rallyEffect', 'Pulls ready tower garrisons back to the royal seat.'),
        state: tOpt('palace.command.ready', 'Ready'),
        meter: '100%',
        previewId: 'rally',
        metaItems: meta(tOpt('palace.command.noCost', 'No cost')),
        onUse: () => {
          this.game.palaceRally(palace);
          this.toast(tOpt('palace.rallied', 'The host rallies to the keep!'));
          return true;
        },
      }),
      gateCommandCard,
    );

    put(c,
      this._portrait('place', place),
      el('div', { class: 'rp-name' }, tName(place)),
      el('div', { class: 'rp-faname' }, tNameAlt(place)),
      el('div', { class: 'rp-tags' },
        el('span', { class: 'tag' }, tOpt('palace.tag', 'Royal Seat')),
        el('span', { class: 'tag story' }, `🏛 ${tOpt('palace.keep', 'Command Keep')}`),
      ),
      el('div', { class: 'rp-section' }, ...rows.map(([k, v]) => el('div', { class: 'statrow' }, el('span', {}, k), el('b', {}, v)))),
      el('div', { class: 'rp-section' },
        el('h4', {}, tOpt('palace.boon', "King's Boon")),
        el('p', {}, boonName),
        boonLore ? el('p', { class: 'ledgernote' }, boonLore) : null,
        el('div', { class: 'statrow' }, el('span', {}, t('hud.cost')), el('b', {}, `${tNum(cfg.boon.cost)} 🪙`)),
        el('div', { class: 'statrow' }, el('span', {}, tOpt('palace.cooldown', 'Cooldown')), el('b', {}, seconds(cfg.boon.cd))),
      ),
      commandStack,
      ...this._loreSections(place),
    );
    this.openPanel();
    this._bindPalaceCommandRefresh(palace);
  }

  showHero(hero, unlocked = true) {
    this._clearHeroCommandTimer();
    this.selectedEntity = null;
    const c = clear($('#rpContent'));
    const assignedTower = this.game.assignedHeroes.get(hero.id);
    const modRows = Object.entries(hero.mods).filter(([, v]) => v !== 0).map(([k, v]) =>
      el('div', { class: 'statrow' }, el('span', {}, tOpt('mod.' + k, k)), el('b', {}, (v > 0 ? '+' : '') + tNum(Math.round(v * 100)) + '%')));
    put(c, 
      this._portrait('hero', hero),
      el('div', { class: 'rp-name' }, tName(hero)),
      el('div', { class: 'rp-faname' }, tNameAlt(hero)),
      el('div', { class: 'rp-tags' },
        el('span', { class: 'tag' }, t('role.' + hero.role) !== 'role.' + hero.role ? t('role.' + hero.role) : hero.role),
        el('span', { class: 'tag' }, t('age.' + hero.ageTier)),
        ...hero.affinity.slice(0, 3).map((a) => el('span', { class: 'tag' }, tOpt('tag.' + a, a))),
        assignedTower ? el('span', { class: 'tag story' }, `⚑ ${tName(assignedTower.def)}`) : null,
        !unlocked ? el('span', { class: 'tag boss' }, t('hud.locked')) : null,
      ),
      el('div', { class: 'rp-section' },
        el('h4', {}, t('panel.special')),
        el('p', {}, tOpt('special.' + hero.id, hero.special.desc)),
      ),
      el('div', { class: 'rp-section' },
        el('h4', {}, t('panel.rankTree')),
        this._rankTree(hero, unlocked),
      ),
      el('div', { class: 'rp-section' },
        el('h4', {}, t('panel.towerMods')),
        ...modRows,
        el('p', { class: 'ledgernote' }, t('panel.bondFormula')),
      ),
      ...this._loreSections(hero),
    );
    this.openPanel();
  }

  showEnemy(enemy) {
    this._clearHeroCommandTimer();
    const def = enemy.def || enemy;
    this.selectedEntity = enemy.def ? enemy : null;
    const c = clear($('#rpContent'));
    put(c, 
      this._portrait('enemy', def),
      el('div', { class: 'rp-name' }, tName(def)),
      el('div', { class: 'rp-faname' }, tNameAlt(def)),
      el('div', { class: 'rp-tags' },
        el('span', { class: 'tag' }, t('class.' + def.class)),
        def.boss ? el('span', { class: 'tag boss' }, t('panel.bossTag')) : null,
        def.flying ? el('span', { class: 'tag' }, t('panel.flyingTag')) : null,
      ),
      enemy.alive !== undefined && enemy.alive ? el('div', { class: 'bondbar', style: { height: '8px', marginBottom: '8px' } },
        el('i', { style: { width: `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%`, background: 'linear-gradient(90deg,#8e3a2a,#c23b2a)' } })) : null,
      el('div', { class: 'rp-section' },
        enemy.alive !== undefined && enemy.alive
          ? el('div', { class: 'statrow' }, el('span', {}, t('panel.health')), el('b', {}, `${tNum(Math.round(enemy.hp))} / ${tNum(Math.round(enemy.maxHp))}`))
          : el('div', { class: 'statrow' }, el('span', {}, t('panel.health')), el('b', {}, tNum(def.hp))),
        el('div', { class: 'statrow' }, el('span', {}, t('panel.armor')), el('b', {}, Math.round(def.armor * 100) + '%')),
        el('div', { class: 'statrow' }, el('span', {}, t('panel.resist')), el('b', {}, Math.round(def.resist * 100) + '%')),
        el('div', { class: 'statrow' }, el('span', {}, t('panel.speedStat')), el('b', {}, tNum(def.speed))),
        el('div', { class: 'statrow' }, el('span', {}, t('panel.bounty')), el('b', {}, tNum(def.bounty))),
        el('div', { class: 'statrow' }, el('span', {}, t('panel.weakness')), el('b', {}, def.armor > 0.45 ? t('role.siege') : def.resist > 0.45 ? t('role.archer') : t('role.fire'))),
      ),
      el('div', { class: 'rp-section' },
        el('h4', {}, t('panel.abilities')),
        el('p', {}, def.abilityDesc ? tOpt('ability.' + def.id, def.abilityDesc) : '—'),
      ),
      ...this._loreSections(def),
    );
    this.openPanel();
  }

  // wave-modifier badge in the top bar (shows the active wave's twist; cleared on wave end)
  _setWaveMod(mod) {
    const box = $('#waveMod');
    if (!box) return;
    if (mod) { box.textContent = mod.icon + ' ' + t('wavemod.' + mod.id); box.style.display = ''; }
    else { box.textContent = ''; box.style.display = 'none'; }
  }

  _bossArrivalDelay(extra = 100) {
    return Math.max(0, (this._bossArrivalUntil || 0) - performance.now() + extra);
  }

  updateBossChallenge(ch) {
    const box = $('#challengeChip');
    if (!box) return;
    if (!ch) {
      clearTimeout(this._challengeRevealTimer);
      this._challengeRevealTimer = null;
      this._pendingBossChallenge = null;
      document.body.classList.remove('boss-challenge-active');
      clear(box);
      box.style.display = 'none';
      box.classList.remove('urgent');
      return;
    }
    const delay = this._bossArrivalDelay(120);
    if (delay > 0) {
      this._pendingBossChallenge = ch;
      document.body.classList.remove('boss-challenge-active');
      box.style.display = 'none';
      clearTimeout(this._challengeRevealTimer);
      this._challengeRevealTimer = setTimeout(() => {
        const pending = this._pendingBossChallenge;
        this._pendingBossChallenge = null;
        this._challengeRevealTimer = null;
        if (pending) this.updateBossChallenge(pending);
      }, delay);
      return;
    }
    this._pendingBossChallenge = null;
    document.body.classList.add('boss-challenge-active');
    const banner = $('#bossBanner');
    if (banner?.classList.contains('stage')) {
      clearTimeout(this._bossBannerTimer);
      clear(banner);
      banner.classList.remove('show', 'stage');
    }
    const title = tOpt(ch.titleKey, t('bossChallenge.default.title'));
    const name = tName(ch.def);
    const saga = ch.saga || {};
    const pct = tNum(Math.round((ch.hpFrac || 0.25) * 100));
    const time = tNum(Math.ceil(ch.t || 0));
    const progress = Math.round((ch.progress || 0) * 100);
    const timePct = ch.dur ? Math.max(0, Math.min(100, Math.round((ch.t / ch.dur) * 100))) : 0;
    const lore = tOpt(ch.loreKey, '');
    const trial = tOpt(saga.trialKey, t('bossChallenge.goal', { name, pct, time }));
    const fail = tOpt('bossChallenge.fail.' + (ch.failType || 'surge'), t('bossChallenge.fail.surge'));
    clear(box);
    box.title = lore;
    box.className = `challenge-chip saga-trial tone-${saga.tone || 'banner'}`;
    box.append(
      el('div', { class: 'challenge-head saga-head' },
        el('span', { class: `boss-saga-seal tone-${saga.tone || 'banner'}`, 'aria-hidden': 'true' }, saga.sealIcon || '◆'),
        el('span', { class: 'challenge-title' },
          el('small', {}, t('bossSaga.trialLabel')),
          el('b', {}, title),
        ),
        el('span', { class: 'challenge-time-label' }, t('bossChallenge.time', { time })),
      ),
      el('div', { class: 'challenge-trial' }, trial),
      el('div', { class: 'challenge-goal' }, t('bossChallenge.goal', { name, pct, time })),
      lore ? el('div', { class: 'challenge-lore' }, lore) : null,
      el('div', { class: 'challenge-meta' },
        el('span', { class: 'challenge-reward' }, t('bossChallenge.reward', { gold: tNum(ch.rewardGold || 0), farr: tNum(ch.rewardFarr || 0) })),
        el('span', { class: 'challenge-risk' }, t('bossChallenge.risk', { effect: fail })),
      ),
      el('div', { class: 'challenge-bars' },
        el('div', { class: 'challenge-bar challenge-progress', title: t('bossChallenge.progress', { pct: tNum(progress) }) },
          el('i', { style: { width: `${progress}%` } })),
        el('div', { class: 'challenge-bar challenge-time' }, el('i', { style: { width: `${timePct}%` } })),
      ),
    );
    box.style.display = '';
    box.classList.toggle('urgent', (ch.t || 0) <= 6);
  }

  challengeResult(ch, won) {
    if (!ch) return;
    const effect = won
      ? tOpt('bossChallenge.success.' + (ch.successType || 'mark'), t('bossChallenge.success.mark'))
      : tOpt('bossChallenge.fail.' + (ch.failType || 'surge'), t('bossChallenge.fail.surge'));
    this.bossResultBanner(ch, won, effect);
  }

  toast(msg) {
    const tEl = el('div', { class: 'toast' }, msg);
    $('#toasts').append(tEl);
    setTimeout(() => tEl.remove(), 3300);
  }

  bossBanner(name, ch = null, arrivalSaga = null) {
    const b = $('#bossBanner');
    if (!b) return;
    const delay = ch ? this._bossArrivalDelay(100) : 0;
    if (delay > 0) {
      clearTimeout(this._bossChallengeBannerTimer);
      this._bossChallengeBannerTimer = setTimeout(() => this.bossBanner(name, ch, arrivalSaga), delay);
      return;
    }
    clearTimeout(this._bossBannerTimer);
    b.classList.remove('show', 'challenge', 'arrival', 'victory', 'defeat', 'stage');
    document.body.classList.toggle('boss-arrival-active', !ch);
    clear(b);
    if (ch) {
      const saga = ch.saga || {};
      b.classList.add('challenge');
      b.append(
        el('div', { class: 'boss-kicker' }, t('bossSaga.kicker')),
        el('div', { class: 'boss-title' }, `${saga.sealIcon || '◆'} ${tOpt(ch.titleKey, t('bossChallenge.default.title'))}`),
        el('div', { class: 'boss-subtitle' }, tOpt(saga.trialKey, name)),
        el('div', { class: 'boss-lore' }, tOpt(ch.loreKey, '')),
      );
    } else {
      const saga = arrivalSaga || {};
      this._bossArrivalUntil = performance.now() + 3600;
      b.classList.add('arrival');
      b.append(
        el('div', { class: 'boss-kicker' }, tOpt('bossSaga.arrival', tOpt('bossArrival.kicker', 'Enemy Champion'))),
        el('div', { class: 'boss-title' }, `${saga.sealIcon || '⚔'} ${name} ${saga.sealIcon || '⚔'}`),
        el('div', { class: 'boss-subtitle' }, tOpt(saga.arrivalKey, tOpt('bossArrival.subtitle', 'The road answers with a royal challenge'))),
      );
    }
    void b.offsetWidth;
    b.classList.add('show');
    this._bossBannerTimer = setTimeout(() => {
      b.classList.remove('show');
      if (!ch) document.body.classList.remove('boss-arrival-active');
    }, ch ? 2600 : 3600);
  }

  bossResultBanner(ch, won, effect) {
    const b = $('#bossBanner');
    if (!b || !ch) return;
    clearTimeout(this._bossBannerTimer);
    clearTimeout(this._bossChallengeBannerTimer);
    document.body.classList.remove('boss-arrival-active');
    b.classList.remove('show', 'challenge', 'arrival', 'victory', 'defeat', 'stage');
    b.classList.add(won ? 'victory' : 'defeat');
    const title = tOpt(ch.titleKey, t('bossChallenge.default.title'));
    const saga = ch.saga || {};
    const sagaLine = won ? tOpt(saga.successKey, '') : tOpt(saga.failKey, '');
    clear(b);
    b.append(
      el('div', { class: 'boss-kicker' }, won ? t('bossChallenge.resultWon') : t('bossChallenge.resultLost')),
      el('div', { class: 'boss-title' }, `${saga.sealIcon || '◆'} ${title}`),
      el('div', { class: 'boss-subtitle' }, effect),
      sagaLine ? el('div', { class: 'boss-lore' }, sagaLine) : null,
    );
    void b.offsetWidth;
    b.classList.add('show');
    this._bossBannerTimer = setTimeout(() => b.classList.remove('show'), 3400);
  }

  battleStartBanner() {
    const b = $('#bossBanner');
    if (!b) return;
    const place = PLACES_BY_ID[this.game.mapDef.id] || this.game.mapDef;
    const palace = palaceDef(this.game.mapDef.id);
    const boonType = palace?.boon?.type || 'heal';
    const boon = tOpt('palace.boonType.' + boonType, tOpt('palace.boon', 'Royal Boon'));
    clearTimeout(this._bossBannerTimer);
    document.body.classList.remove('boss-arrival-active');
    b.classList.remove('show', 'challenge', 'arrival', 'victory', 'defeat');
    b.classList.add('stage');
    clear(b);
    b.append(
      el('div', { class: 'boss-kicker' }, t('battle.kicker')),
      el('div', { class: 'boss-title' }, tName(place)),
      el('div', { class: 'boss-subtitle' }, t('battle.stageLine', { boon })),
      el('div', { class: 'boss-lore' }, tOpt(palace?.loreKey, place.short || '')),
    );
    audio.hornCall();
    void b.offsetWidth;
    b.classList.add('show');
    this._bossBannerTimer = setTimeout(() => b.classList.remove('show'), 5400);
  }

  oathBanner(placeId) {
    const b = $('#oathBanner');
    if (!b) return;
    const place = PLACES_BY_ID[placeId] || this.game.mapDef;
    clear(b);
    b.append(
      el('div', { class: 'oath-kicker' }, t('oath.subtitle')),
      el('div', { class: 'oath-title' }, t('oath.used', { place: tName(place) })),
    );
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this._oathBannerTimer);
    this._oathBannerTimer = setTimeout(() => b.classList.remove('show'), 4600);
  }

  heroCommandBanner({ hero, tower, key = 'default', kind = 'rally', targetCount = 0 } = {}) {
    const b = $('#commandBanner');
    if (!b || !hero || !tower) return;
    const label = tOpt('heroActive.' + key, tOpt('heroActive.default', 'Hero Command'));
    const line = t('heroActive.bannerLine', { name: tName(hero), tower: tName(tower.def) });
    const targets = targetCount > 0
      ? t('heroActive.bannerTargets', { n: tNum(targetCount) })
      : t('heroActive.bannerNoTargets');
    clearTimeout(this._commandBannerTimer);
    b.className = `command-banner ${kind || 'rally'}`;
    clear(b);
    b.append(
      el('div', { class: 'command-sigil' }, '✦'),
      el('div', { class: 'command-copy' },
        el('div', { class: 'command-kicker' }, t('heroActive.bannerKicker')),
        el('div', { class: 'command-title' }, label),
        el('div', { class: 'command-line' }, line),
      ),
      el('div', { class: 'command-count' }, targets),
    );
    void b.offsetWidth;
    b.classList.add('show');
    this._commandBannerTimer = setTimeout(() => b.classList.remove('show'), 3300);
  }

  palaceCommandBanner({ kind = 'boon', palace, type = 'default', unit = null, count = 0, targetCount = 0, synergyCount = 0 } = {}) {
    const b = $('#commandBanner');
    if (!b || !palace) return;
    const placeId = palace.placeId || this.game.mapDef.id;
    const place = PLACES_BY_ID[placeId] || this.game.mapDef;
    let title = tOpt('palace.boonType.' + type, tOpt('palace.boon', "King's Boon"));
    let detail = targetCount > 0
      ? t('palace.bannerTargets', { n: tNum(targetCount) })
      : t('palace.bannerNoTargets');
    if (kind === 'muster') {
      title = t('palace.bannerMuster', { unit: unit ? tName(unit) : tOpt('palace.muster', 'Muster') });
      detail = `${t('palace.bannerMusterCount', { n: tNum(count || 0) })} · ${tOpt('palace.bannerGuardLine', 'Royal guard deployed')}`;
    } else if (kind === 'rally') {
      title = tOpt('palace.rally', 'Rally to the Keep');
      detail = `${t('palace.bannerRallyCount', { n: tNum(count || 0) })} · ${tOpt('palace.bannerGuardLine', 'Royal guard deployed')}`;
    }
    if (synergyCount > 0) {
      detail = `${detail} · ${tOpt('palace.bannerSynergy', '{n} commanders answered').replace('{n}', tNum(synergyCount))}`;
    }
    clearTimeout(this._commandBannerTimer);
    b.className = `command-banner palace ${kind} ${type || 'default'}`;
    clear(b);
    b.append(
      el('div', { class: 'command-sigil' }, kind === 'muster' ? '⚔' : kind === 'rally' ? '⚑' : '✶'),
      el('div', { class: 'command-copy' },
        el('div', { class: 'command-kicker' }, t('palace.bannerKicker')),
        el('div', { class: 'command-title' }, title),
        el('div', { class: 'command-line' }, t('palace.bannerLine', { place: tName(place) })),
      ),
      el('div', { class: 'command-count' }, detail),
    );
    void b.offsetWidth;
    b.classList.add('show');
    this._commandBannerTimer = setTimeout(() => b.classList.remove('show'), 3400);
  }

  gateTestResultBanner(result = {}) {
    const b = $('#commandBanner');
    if (!b) return;
    const mode = tOpt('hud.gateAssault.' + result.mode, result.mode || '');
    const defenders = tNum(result.defenders || 0);
    const attackers = tNum(result.staggered || result.count || 0);
    const guards = tNum(result.gateGuard || 0);
    const countercharge = tNum(result.countercharge || 0);
    const timing = result.timing || (result.peak ? 'peak' : '');
    const replay = el('button', {
      class: 'command-count replay',
      type: 'button',
      title: tOpt('hud.gateTestReplayTip', 'Replay Gate Test'),
      'aria-label': tOpt('hud.gateTestReplayTip', 'Replay Gate Test'),
    }, tOpt('hud.gateTestReplay', 'Replay'));
    replay.onclick = (ev) => {
      ev.stopPropagation();
      audio.ui();
      const next = this.game.sandboxPalaceAssault?.({
        mode: 'royal',
        fullFx: true,
        label: tOpt('palace.command.gateLineRoyal', 'Royal Gate Line'),
        subLabel: tOpt('palace.command.gateLineSub', 'Palace defenders holding'),
      });
      if (next) {
        const toastKey = (next.gateGuard || 0) > 0 ? 'hud.gateTestResultToastGuard' : 'hud.gateTestResultToast';
        this.toast(t(toastKey, {
          defenders: tNum(next.defenders || 0),
          guards: tNum(next.gateGuard || 0),
          attackers: tNum(next.staggered || next.count || 0),
        }));
        this.gateTestResultBanner(next);
      }
    };
    clearTimeout(this._commandBannerTimer);
    b.className = 'command-banner palace gate-test stunPulse';
    clear(b);
    b.append(
      el('div', { class: 'command-sigil' }, '◉'),
      el('div', { class: 'command-copy' },
        el('div', { class: 'command-kicker' }, tOpt('hud.gateCommandKicker', 'Palace Gate')),
        el('div', { class: 'command-title' }, t('hud.gateTestResultTitle', { mode })),
        el('div', { class: 'command-line' }, t('hud.gateTestResultLine', { defenders, attackers })),
      ),
      el('div', { class: 'command-result-stack' },
        el('span', { class: 'command-count metric' }, t('hud.gateTestResultCount', { braced: tNum(result.braced || 0) })),
        (result.gateGuard || 0) > 0
          ? el('span', { class: 'command-count metric guard' }, t('hud.gateTestGuardCount', { guards }))
          : null,
        timing
          ? el('span', { class: `command-count metric timing ${timing}` }, tOpt(`palace.command.gateTiming.${timing}`, timing))
          : null,
        (result.countercharge || 0) > 0
          ? el('span', { class: 'command-count metric countercharge' }, t('hud.gateTestCounterchargeCount', { n: countercharge }))
          : null,
        el('span', { class: 'command-count metric threat' }, t('hud.gateTestAttackersCount', { attackers })),
        replay,
      ),
    );
    void b.offsetWidth;
    b.classList.add('show');
    this._commandBannerTimer = setTimeout(() => b.classList.remove('show'), 3600);
  }

  destroy() {
    clearTimeout(this._oathBannerTimer);
    clearTimeout(this._bossBannerTimer);
    clearTimeout(this._bossChallengeBannerTimer);
    clearTimeout(this._challengeRevealTimer);
    clearTimeout(this._commandBannerTimer);
    this._clearHeroCommandTimer();
    this.game.clearHeroCommandPreview?.();
    this.game.clearPalaceCommandPreview?.();
    if (this._langOff) { this._langOff(); this._langOff = null; }
    if (this._markerOff) { this._markerOff(); this._markerOff = null; }
    if (this._gateOmenOff) { this._gateOmenOff(); this._gateOmenOff = null; }
    if (this.heroMarkerLayer) { this.heroMarkerLayer.remove(); this.heroMarkerLayer = null; }
    this._heroMarkers = null;
    if (this._autoCollapsedPanel) document.body.classList.remove('panel-hidden');
    document.body.classList.remove('boss-challenge-active', 'boss-arrival-active');
    clear(this.root);
  }
}
