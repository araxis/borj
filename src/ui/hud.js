// Battle HUD — top bar, left card grid (towers/heroes tabs), right detail panel,
// wave controls, toasts, boss banner, interaction modes (build/assign/rally/fuse).
import { el, $, clear } from './dom.js';
import { t, tf, tName, tNameAlt, tNum, tOpt, onLangChange, toggleLang } from '../core/i18n.js';
import { applyAtlasCell } from '../core/atlas.js';
import { TOWERS, AGES } from '../data/towers.js';
import { HEROES, HERO_RANKS } from '../data/heroes.js';
import { PLACES_BY_ID, PLACE_ATLAS } from '../data/places.js';
import { HERO_ATLAS } from '../data/heroes.js';
import { ENEMY_ATLAS } from '../data/enemies.js';
import { SOLDIERS_BY_ID } from '../data/soldiers.js';
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

export class HUD {
  constructor(game, callbacks) {
    this.game = game;
    this.cb = callbacks; // { onExit, onRetry, onContinueEndless }
    this.mode = { kind: 'none' }; // none | build(def) | assign(hero) | rally(tower) | fuse(tower)
    this.selectedEntity = null;
    this.root = $('#ui');
    this._build();
    this._wire();
    if (!game.waveActive) this._updateWaveBtn(game.waveCountdown, game.earlyBonus());
    onLangChange(() => { this.refreshAll(); this._syncToggle(); });
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
        el('div', { class: 'sep' }),
        el('button', { class: 'iconbtn', id: 'pauseBtn', title: t('hud.pause') }, '⏸'),
        el('div', { id: 'speedBtns' },
          el('button', { class: 'iconbtn active', 'data-speed': '1' }, '1×'),
          el('button', { class: 'iconbtn', 'data-speed': '2' }, '2×'),
        ),
        el('div', { class: 'sep' }),
        el('button', { class: 'iconbtn', id: 'codexBtn', title: t('hud.codex') }, '📖'),
        el('button', { class: 'iconbtn', id: 'settingsBtn', title: t('menu.settings') }, '⚙️'),
        el('button', { class: 'iconbtn', id: 'langBtn' }, t('lore.toggle')),
        el('button', { class: 'iconbtn', id: 'menuBtn', title: t('hud.menu') }, '⌂'),
      ),
      el('div', { id: 'leftPanel', class: 'frame' },
        el('div', { id: 'leftTabs' },
          el('button', { class: 'tabbtn active', id: 'tabTowers' }, t('hud.towers')),
          el('button', { class: 'tabbtn', id: 'tabHeroes' }, t('hud.heroes')),
        ),
        el('div', { id: 'cardFilter' }),
        el('div', { id: 'cardGrid' }),
      ),
      el('button', { class: 'panel-toggle', id: 'leftToggle', title: t('hud.togglePanel') }, '‹'),
      el('div', { id: 'rightPanel', class: 'frame' },
        el('button', { id: 'rpClose' }, '✕'),
        el('div', { id: 'rpContent' }),
      ),
      el('div', { id: 'bottomBar', class: 'frame' },
        el('button', { class: 'gbtn primary', id: 'waveBtn' }, t('hud.nextWave')),
      ),
      el('div', { id: 'toasts' }),
      el('div', { id: 'bossBanner' }),
      el('div', { id: 'modeHint' }),
    );
    this.activeTab = 'towers';
    this.filter = { towers: null, heroes: null }; // active group filter per tab (null = All)
    this.renderCards();
    this.updateTop();
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
    g.on('bossSpawned', (def) => this.bossBanner(tName(def)));
    g.on('toast', (key) => this.toast(t(key)));
    g.on('towersChanged', () => {
      this.refreshAffordability();
      if (this.selectedEntity && !this.selectedEntity.alive) this.closePanel();
    });
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
    $('#tabTowers').textContent = t('hud.towers');
    $('#tabHeroes').textContent = t('hud.heroes');
    if (this.game.waveActive) $('#waveBtn').textContent = t('hud.waveInProgress');
    else this._updateWaveBtn(this.game.waveCountdown, this.game.earlyBonus());
    $('#langBtn').textContent = t('lore.toggle');
    this.updateTop();
    this.renderCards();
    if (this.selectedEntity?.def) this.showTower(this.selectedEntity);
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
        const card = el('div', { class: 'card', 'data-id': def.id, 'data-cost': def.cost });
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
        card.onclick = () => {
          audio.unlock(); audio.ui();
          this.closePanel();
          this.showTowerDef(def);
          this.setMode({ kind: 'build', def });
        };
        grid.append(card);
      }
    } else {
      for (const hero of (f ? HEROES.filter((h) => h.role === f) : HEROES)) {
        const unlocked = this.game.heroRoster.includes(hero);
        const assignedTower = this.game.assignedHeroes.get(hero.id);
        const card = el('div', { class: 'card' + (unlocked ? '' : ' locked'), 'data-id': hero.id });
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
        card.onclick = () => {
          audio.unlock(); audio.ui();
          this.showHero(hero, unlocked);
          if (unlocked) this.setMode({ kind: 'assign', hero });
        };
        grid.append(card);
      }
    }
    this.refreshAffordability();
  }

  // ---------- right panel ----------
  openPanel() { $('#rightPanel').classList.add('visible'); }
  closePanel() {
    $('#rightPanel').classList.remove('visible');
    this.selectedEntity = null;
    this.cb.onSelectionCleared?.();
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
      [t('panel.health'), `${tNum(Math.round(tower.hp))} / ${tNum(tower.maxHp)}`],
    ].filter(Boolean);

    const actions = el('div', { class: 'rp-actions' });
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
      const busy = this.game.assignedHeroes.get(h.id) && this.game.assignedHeroes.get(h.id) !== tower;
      const mini = el('div', { class: 'mini' });
      applyAtlasCell(mini, HERO_ATLAS, h.atlas);
      const row = el('div', { class: 'heroassignrow' + (busy ? ' busy' : '') },
        mini,
        el('div', { class: 'hname' }, tName(h), el('div', { class: 'bondbar' }, el('i', { style: { width: `${Math.min(100, bond * 100)}%` } }))),
        el('span', { class: 'bond' }, `${t('panel.bond')} ${Math.round(bond * 100)}%`),
      );
      row.onclick = () => {
        this.game.assignHero(h, tower);
        this.showTower(tower);
        this.renderCards();
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
  }

  showHero(hero, unlocked = true) {
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

  toast(msg) {
    const tEl = el('div', { class: 'toast' }, msg);
    $('#toasts').append(tEl);
    setTimeout(() => tEl.remove(), 3300);
  }

  bossBanner(name) {
    const b = $('#bossBanner');
    b.textContent = `⚔ ${name} ⚔`;
    b.classList.add('show');
    setTimeout(() => b.classList.remove('show'), 4200);
  }

  destroy() {
    clear(this.root);
  }
}
