// Main menu, campaign selection, map intro, and victory/defeat screens.
import { el, $, clear, backMedallion, wireAction } from './dom.js';
import { t, tf, tName, tNameAlt, tNum, tOpt, toggleLang, onLangChange } from '../core/i18n.js';
import { applyAtlasCell } from '../core/atlas.js';
import { MAPS } from '../data/campaign.js';
import { PLACES_BY_ID, PLACE_ATLAS } from '../data/places.js';
import { HEROES, HERO_ATLAS } from '../data/heroes.js';
import { ENEMIES_BY_ID } from '../data/enemies.js';
import { bossChallengeDef } from '../data/bosschallenges.js';
import { loadProfile } from '../core/save.js';
import { audio } from '../core/audio.js';
import { loadPalace } from '../core/assets.js';
import { loadForestTrees, loadForestEnrich } from '../core/props3d.js';
import { loadBattle, clearBattle } from '../core/battlesave.js';
import { currentDifficulty, setDifficulty, DIFFICULTY_ORDER } from '../core/difficulty.js';

export class Menus {
  constructor(callbacks) {
    this.cb = callbacks; // { onStartMap(mapDef, endless), onCodex, onSettings }
    this._build();
    onLangChange(() => this._retext());
  }

  _build() {
    this.mainMenu = el('div', { class: 'overlay', id: 'mainMenu' },
      el('div', { class: 'dialog frame', style: { textAlign: 'center', minWidth: 'min(480px, 90vw)' } },
        el('div', { class: 'title-illum', id: 'mmTitle' }, t('app.title')),
        el('div', { class: 'title-rule' }),
        el('div', { class: 'subtitle', id: 'mmSub' }, t('app.subtitle')),
        el('div', { class: 'menu-actions' },
          el('button', { class: 'gbtn primary', id: 'mmCampaign' }, t('menu.newCampaign')),
          el('button', { class: 'gbtn', id: 'mmEndless' }, t('menu.endless')),
          el('button', { class: 'gbtn', id: 'mmCodex' }, t('menu.codex')),
          el('button', { class: 'gbtn', id: 'mmSettings' }, t('menu.settings')),
          el('button', { class: 'gbtn', id: 'mmLang' }, t('menu.language')),
        ),
        el('div', { class: 'credit', id: 'mmCredit' }, t('menu.credit')),
      ),
    );
    this.campaignMenu = el('div', { class: 'overlay', id: 'campaignMenu' },
      el('div', { class: 'dialog frame' },
        backMedallion({ id: 'cmBack', 'aria-label': t('settings.back') }),
        el('h2', { class: 'ornament-title', id: 'cmTitle' }, t('campaign.title')),
        el('p', { class: 'subtitle', id: 'cmHint' }, t('campaign.endlessHint')),
        el('div', { id: 'campaignGrid' }),
      ),
    );
    this.mapIntro = el('div', { class: 'overlay', id: 'mapIntro' },
      el('div', { class: 'dialog frame mapintro', style: { textAlign: 'center', maxWidth: '640px' } },
        backMedallion({ id: 'miBack', 'aria-label': t('settings.back') }),
        el('div', { class: 'rp-portrait', id: 'miImg', style: { maxWidth: '420px', margin: '0 auto' } }),
        el('div', { class: 'rp-name', id: 'miName' }),
        el('div', { class: 'rp-faname', id: 'miFa' }),
        el('p', { class: 'storyref', id: 'miRef', style: { color: '#a8c4c0', fontStyle: 'italic', margin: '6px 0' } }),
        el('div', { class: 'introtext', id: 'miText' }),
        el('div', { class: 'introtext', id: 'miText2', style: { fontSize: '0.9rem', color: '#bfae88', fontStyle: 'italic' } }),
        el('div', { class: 'boss-saga-intro', id: 'miBossSaga', hidden: true }),
        el('div', { class: 'intro-flourish', 'aria-hidden': 'true' }),
        el('div', { class: 'diffpick', id: 'miDiff' }),
        el('div', { class: 'intro-launch' },
          el('button', { class: 'gbtn primary launch', id: 'miStart' }, t('campaign.start')),
        ),
      ),
    );
    this.endScreen = el('div', { class: 'overlay', id: 'endScreen' },
      el('div', { class: 'dialog frame', style: { textAlign: 'center', minWidth: 'min(560px, 90vw)' } },
        el('div', { class: 'endtitle', id: 'endTitle' }),
        el('p', { class: 'subtitle', id: 'endSub' }),
        el('div', { class: 'unlocks', id: 'endUnlocks' }),
        el('div', { class: 'end-actions', id: 'endActions' }),
      ),
    );
    document.body.append(this.mainMenu, this.campaignMenu, this.mapIntro, this.endScreen);

    $('#mmCampaign').onclick = () => { audio.unlock(); audio.ui(); this.showCampaign(false); };
    $('#mmEndless').onclick = () => { audio.unlock(); audio.ui(); this.showCampaign(true); };
    $('#mmCodex').onclick = () => { audio.unlock(); this.cb.onCodex(); };
    $('#mmSettings').onclick = () => { audio.unlock(); this.cb.onSettings(); };
    $('#mmLang').onclick = () => { toggleLang(); };
    $('#cmBack').onclick = () => { this.hideAll(); this.showMain(); };
  }

  _retext() {
    $('#mmTitle').textContent = t('app.title');
    $('#mmSub').textContent = t('app.subtitle');
    $('#mmCampaign').textContent = t('menu.newCampaign');
    $('#mmEndless').textContent = t('menu.endless');
    $('#mmCodex').textContent = t('menu.codex');
    $('#mmSettings').textContent = t('menu.settings');
    $('#mmLang').textContent = t('menu.language');
    $('#mmCredit').textContent = t('menu.credit');
    $('#cmTitle').textContent = t('campaign.title');
    $('#cmHint').textContent = t('campaign.endlessHint');
    if (this.campaignMenu.classList.contains('visible')) this.showCampaign(this._endlessPick);
  }

  showMain() { this.hideAll(); this.mainMenu.classList.add('visible'); }

  showCampaign(endlessPick) {
    this.hideAll();
    this._endlessPick = endlessPick;
    this.campaignMenu.classList.add('visible');
    const grid = clear($('#campaignGrid'));
    const profile = loadProfile();
    const sorted = [...MAPS].sort((a, b) => a.order - b.order);
    const sandboxPick = location.hash.toLowerCase().includes('sandbox');
    for (const m of sorted) {
      const place = PLACES_BY_ID[m.id];
      const prev = sorted.find((x) => x.order === m.order - 1);
      const unlocked = m.order === 1 || (prev && profile.completedMaps.includes(prev.id));
      const done = profile.completedMaps.includes(m.id);
      const available = sandboxPick || (endlessPick ? done : unlocked);
      const img = el('div', { class: 'mapimg' });
      applyAtlasCell(img, PLACE_ATLAS, place.atlas);
      const bossSaga = this._renderCampaignBossSaga(m, profile);
      const card = el('div', {
        class: 'mapcard' + (available ? '' : ' locked'),
        'aria-label': `${tName(place)}. ${t('campaign.waves')}: ${tNum(m.waves)}`,
      },
        img,
        el('div', { class: 'mapname' }, tName(place)),
        el('div', { class: 'mapsub' },
          `${t('campaign.waves')}: ${tNum(m.waves)}` + (endlessPick && profile.bestEndless[m.id] ? ` · ∞ ${tNum(profile.bestEndless[m.id])}` : '')),
        bossSaga,
        el('div', { class: 'ordern' }, tNum(m.order)),
        done ? el('div', { class: 'done' }, '✓ ' + t('campaign.completed')) : null,
      );
      wireAction(card, () => { audio.ui(); this.showMapIntro(m, endlessPick); }, { disabled: !available });
      grid.append(card);
    }
  }

  showMapIntro(mapDef, endless) {
    this.hideAll();
    this.mapIntro.classList.add('visible');
    loadPalace(mapDef.id); // warm the giant palace GLB while the player reads the intro
    const place = PLACES_BY_ID[mapDef.id];
    if (place?.biome === 'forest') { loadForestTrees(); loadForestEnrich(); } // warm forest trees + floor enrichment
    applyAtlasCell($('#miImg'), PLACE_ATLAS, place.atlas);
    $('#miName').textContent = tName(place);
    $('#miFa').textContent = tNameAlt(place);
    $('#miRef').textContent = tOpt('storyref.' + place.id, place.sourceRef);
    $('#miText').textContent = t(mapDef.introKey);
    const deep = t('intro2.' + mapDef.id);
    $('#miText2').textContent = deep !== 'intro2.' + mapDef.id ? deep : '';
    this._renderIntroBossSaga(mapDef);
    const unlockHeroes = HEROES.filter((h) => h.unlock.type === 'campaign' && h.unlock.map === mapDef.id);
    // resume a saved mid-battle for this stage, if one exists (else a normal fresh start)
    const startBtn = $('#miStart');
    const prevResume = document.getElementById('miResume'); if (prevResume) prevResume.remove();
    const snap = loadBattle(mapDef.id);
    if (snap) {
      const resume = el('button', {}, t('mapintro.resume', { wave: tNum(snap.waveIdx || 0) }));
      resume.id = 'miResume'; resume.className = startBtn.className;
      resume.onclick = () => { audio.unlock(); audio.hornCall(); this.hideAll(); this.cb.onStartMap(mapDef, endless, snap); };
      startBtn.parentNode.insertBefore(resume, startBtn);
      startBtn.textContent = t('mapintro.newGame') + (endless ? ' ∞' : '');
      startBtn.onclick = () => { audio.unlock(); audio.hornCall(); clearBattle(); this.hideAll(); this.cb.onStartMap(mapDef, endless, null); };
    } else {
      startBtn.textContent = t('campaign.start') + (endless ? ' ∞' : '');
      startBtn.onclick = () => { audio.unlock(); audio.hornCall(); this.hideAll(); this.cb.onStartMap(mapDef, endless); };
    }
    $('#miBack').onclick = () => this.showCampaign(endless);
    this._renderDiff();
  }

  // pre-map difficulty picker (Easy/Normal/Hard) — global, persisted via settings
  _renderDiff() {
    const box = $('#miDiff');
    if (!box) return;
    clear(box);
    box.append(el('div', { class: 'diff-cap' }, t('difficulty.label')));
    const seg = el('div', { class: 'diff-seg' });
    const cur = currentDifficulty();
    for (const d of DIFFICULTY_ORDER) {
      const b = el('button', { class: 'diff-opt' + (d === cur ? ' active' : '') }, t('difficulty.' + d));
      b.onclick = () => { audio.ui(); setDifficulty(d); this._renderDiff(); };
      seg.append(b);
    }
    box.append(seg);
  }

  _bossSagaState(profile, bossId) {
    const rec = profile?.bossSagas?.[bossId] || null;
    if (!rec) return { rec, label: t('bossSaga.unclaimed'), cls: 'unclaimed' };
    if (rec.defeated) return { rec, label: t('bossSaga.defeated'), cls: 'defeated' };
    if (rec.best === 'broken') return { rec, label: t('bossSaga.broken'), cls: 'broken' };
    return { rec, label: t('bossSaga.hardened'), cls: 'hardened' };
  }

  _renderCampaignBossSaga(mapDef, profile = loadProfile()) {
    if (!mapDef.boss) return null;
    const boss = ENEMIES_BY_ID[mapDef.boss];
    const ch = bossChallengeDef(mapDef.boss);
    const saga = ch.saga || {};
    const state = this._bossSagaState(profile, mapDef.boss);
    const twin = mapDef.twinBoss ? bossChallengeDef(mapDef.twinBoss) : null;
    return el('div', { class: `mapboss-saga ${state.cls}` },
      el('span', { class: `boss-saga-seal tone-${saga.tone || 'banner'}`, 'aria-hidden': 'true' }, saga.sealIcon || '◆'),
      el('span', { class: 'mapboss-copy' },
        el('b', {}, t('bossSaga.campaign')),
        el('small', {}, `${tOpt(ch.titleKey, t('bossChallenge.default.title'))}${twin ? ` · ${tOpt(twin.titleKey, '')}` : ''}`),
      ),
      el('span', { class: 'mapboss-state' }, `${state.rec?.best === 'broken' || state.rec?.defeated ? '✓ ' : ''}${state.label}`),
      boss ? el('span', { class: 'sr-only' }, tName(boss)) : null,
    );
  }

  _renderIntroBossSaga(mapDef) {
    const box = clear($('#miBossSaga'));
    if (!box || !mapDef.boss) {
      if (box) box.hidden = true;
      return;
    }
    const profile = loadProfile();
    const ch = bossChallengeDef(mapDef.boss);
    const saga = ch.saga || {};
    const boss = ENEMIES_BY_ID[mapDef.boss];
    const state = this._bossSagaState(profile, mapDef.boss);
    const twin = mapDef.twinBoss ? bossChallengeDef(mapDef.twinBoss) : null;
    box.hidden = false;
    box.className = `boss-saga-intro ${state.cls}`;
    box.append(
      el('div', { class: `boss-saga-seal big tone-${saga.tone || 'banner'}`, 'aria-hidden': 'true' }, saga.sealIcon || '◆'),
      el('div', { class: 'boss-saga-intro-copy' },
        el('div', { class: 'boss-saga-kicker' }, t('bossSaga.kicker')),
        el('b', {}, tOpt(ch.titleKey, t('bossChallenge.default.title'))),
        el('p', {}, tOpt(saga.arrivalKey, tOpt(ch.loreKey, ''))),
        twin ? el('p', { class: 'boss-saga-twin' }, t('bossSaga.twin', { name: tOpt(twin.titleKey, '') })) : null,
      ),
      el('div', { class: 'boss-saga-intro-state' },
        el('span', {}, boss ? tName(boss) : t('bossSaga.enemy')),
        el('strong', {}, state.label),
      ),
    );
  }

  showEnd({ victory, unlockedHeroes = [], wave, endless, mapDef, onRetry, onContinueEndless, onExit }) {
    this.hideAll();
    this.endScreen.classList.add('visible');
    $('#endTitle').textContent = victory ? t('hud.victory') : t('hud.defeat');
    $('#endTitle').className = 'endtitle ' + (victory ? 'win' : 'lose');
    $('#endSub').textContent = endless ? t('hud.endlessWave', { n: tNum(wave) }) : '';
    const unl = clear($('#endUnlocks'));
    for (const h of unlockedHeroes) {
      const img = el('div', { class: 'uimg' });
      applyAtlasCell(img, HERO_ATLAS, h.atlas);
      unl.append(el('div', { class: 'ucard' }, img, el('div', { class: 'uname' }, tName(h))));
      audio.victory();
    }
    const actions = clear($('#endActions'));
    if (victory && !endless && onContinueEndless) {
      const b = el('button', { class: 'gbtn' }, t('hud.continueEndless'));
      b.onclick = () => { this.hideAll(); onContinueEndless(); };
      actions.append(b);
    }
    if (!victory && onRetry) {
      const b = el('button', { class: 'gbtn primary' }, t('hud.retry'));
      b.onclick = () => { this.hideAll(); onRetry(); };
      actions.append(b);
    }
    const exit = el('button', { class: 'gbtn' }, t('hud.returnCampaign'));
    exit.onclick = () => { this.hideAll(); onExit(); };
    actions.append(exit);
  }

  hideAll() {
    for (const o of [this.mainMenu, this.campaignMenu, this.mapIntro, this.endScreen]) o.classList.remove('visible');
  }
}
