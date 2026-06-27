// Asset pipeline — GLTF models with skeletal animations + PBR texture sets.
// DESIGN RULE: every asset is a progressive enhancement over the procedural
// builders. If a file is missing or fails to load (or hasn't finished yet),
// callers fall back to the procedural model — the game can never break.
//
// Sources (see CREDITS.md): KayKit Character Pack Adventures (CC0),
// Khronos glTF sample Fox (CC0, PixelMannen), three.js Horse (ro.me, MIT),
// ambientCG textures (CC0), Kevin MacLeod music (CC-BY 4.0).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { sanitizeVisualArtifacts } from './visualguards.js';
import { zabulistanVisualProfile } from '../data/zabulistanVisualProfile.js';

const MODEL_FILES = {
  // KayKit (CC0) — chibi proportions; kept as deep fallbacks only
  kk_knight: 'assets/models/knight.glb',
  kk_barbarian: 'assets/models/barbarian.glb',
  // Quaternius (CC0) — realistic proportions, full animation sets
  q_knight: 'assets/models/q_knight.glb',
  q_snake: 'assets/models/q_snake.glb',
  q_snake_angry: 'assets/models/q_snake_angry.glb',
  q_wolf: 'assets/models/q_wolf.glb',
  q_stag: 'assets/models/q_stag.glb',
  q_deer: 'assets/models/q_deer.glb',
  q_horse: 'assets/models/q_horse.glb',
  q_horse_white: 'assets/models/q_horse_white.glb',
  q_bull: 'assets/models/q_bull.glb',
  fox: 'assets/models/fox.glb',
  horse: 'assets/models/horse.glb',
  // Quaternius Animals pack (CC0) — high-quality, richly animated (user-supplied,
  // served from assets/animals/ with PascalCase filenames). These supersede the q_*
  // animals above for ambient life; q_* kept only as deep fallbacks.
  a_alpaca: 'assets/animals/Alpaca.gltf',
  a_bull: 'assets/animals/Bull.gltf',
  a_cow: 'assets/animals/Cow.gltf',
  a_deer: 'assets/animals/Deer.gltf',
  a_donkey: 'assets/animals/Donkey.gltf',
  a_fox: 'assets/animals/Fox.gltf',
  a_horse: 'assets/animals/Horse.gltf',
  a_horse_white: 'assets/animals/Horse_White.gltf',
  a_zabul_warhorse: 'assets/animals/ZabulWarHorse.glb',
  a_husky: 'assets/animals/Husky.gltf',
  a_shiba: 'assets/animals/ShibaInu.gltf',
  a_stag: 'assets/animals/Stag.gltf',
  a_wolf: 'assets/animals/Wolf.gltf',
  // Rigged + walk-animated Shahnameh creatures (CC-BY 4.0, see CREDITS.md);
  // textures resized to 1024 webp (~30 MB → <1 MB). Used for the like-named enemies.
  a_lion: 'assets/animals/Lion.glb',
  a_elephant: 'assets/animals/Elephant.glb', // پیل سپید (White War Elephant)
  // Humanoid soldier archetypes (CC-BY, biped Mixamo-style rig, multi-clip) — re-skin q_knight soldiers
  a_soldier_heavy: 'assets/models/Soldier_Heavy.glb',
  a_soldier_light: 'assets/models/Soldier_Light.glb',   // scout-archer (Archery_* clips)
  a_soldier_female: 'assets/models/Soldier_Female.glb', // woman warrior (Gordāfarid)
  a_soldier_robed: 'assets/models/Soldier_Robed.glb',   // robed mobed / fire-keeper
  // Boss-tier humanoid antagonists (rigged + animated) — replace procedural buildEnemyModel branches
  a_zahhak: 'assets/models/Zahhak.glb',         // serpent-shouldered tyrant (serpents baked into mesh)
  a_afrasiab: 'assets/models/Afrasiab.glb',     // King of Turān → turanianKing branch
  a_arjasp: 'assets/models/Arjasp.glb',         // invading war-king → warKing branch
  a_kamus: 'assets/models/Kamus.glb',           // Kushani warlord → warlord branch
  // Batch B divs (rigged + animated) — replace procedural buildDiv/sorceress branches
  a_divsepid: 'assets/animals/DivSepid.glb',      // White Div → divSepid
  a_arzhang: 'assets/animals/ArzhangDiv.glb',     // div-commander → divCommander
  a_akvan: 'assets/animals/AkvanDiv.glb',         // wind-demon → akvan (flying)
  a_kharvazan: 'assets/animals/KharvazanDiv.glb', // road-brute → divBrute
  a_olad: 'assets/animals/OladDiv.glb',           // captive scout → divScout
  a_sorceress: 'assets/models/Sorceress.glb',     // Māzandarān witch → sorceress
  // Batch C crawlers — source/reference GLBs until rigged. Runtime refuses to use them as
  // primary enemies unless real animation clips are present; no static-asset fake crawling.
  a_dragon: 'assets/animals/Azhdaha.glb',         // Azhdahā dragon → dragon
  a_worm: 'assets/animals/Worm.glb',              // Kerm-e Haftvād → worm
  // Heroes — rigged commanders that stand on the tower they lead (key Hero_<id>, hyphens → underscores)
  Hero_rostam: 'assets/models/Hero_Rostam.glb',
  Hero_zal: 'assets/models/Hero_Zal.glb',
  Hero_kaveh: 'assets/models/Hero_Kaveh.glb',
  Hero_kay_khosrow: 'assets/models/Hero_KayKhosrow.glb',
  Hero_tahmineh: 'assets/models/Hero_Tahmineh.glb',
  Hero_gordafarid: 'assets/models/Hero_Gordafarid.glb',
  Hero_sohrab: 'assets/models/Hero_Sohrab.glb',
  Hero_esfandiyar: 'assets/models/Hero_Esfandiyar.glb',
  Hero_fereydun: 'assets/models/Hero_Fereydun.glb',
  Hero_simurgh: 'assets/models/Hero_Simurgh.glb',   // BIRD, static (no clips) — perches on the tower
  // Towers (static GLB bodies; engine attaches flame/banner/age-turrets) — key a_twr_<def.model>
  a_twr_watchtower: 'assets/towers/Watchtower.glb',
  a_twr_palaceBalcony: 'assets/towers/PalaceBalcony.glb',
  a_twr_horizonWatch: 'assets/towers/HorizonWatch.glb',
  a_twr_maceHall: 'assets/towers/MaceHall.glb',
  a_twr_catapult: 'assets/towers/Catapult.glb',
  a_twr_fireAltar: 'assets/towers/FireAltar.glb',
  a_twr_sealTower: 'assets/towers/SealTower.glb',
  a_twr_nestTower: 'assets/towers/NestTower.glb',
  a_twr_standardHall: 'assets/towers/StandardHall.glb',
  a_twr_radianceCourt: 'assets/towers/RadianceCourt.glb',
  a_twr_grandArch: 'assets/towers/GrandArch.glb',
  a_twr_reedOutpost: 'assets/towers/ReedOutpost.glb',
  a_twr_brazenBastion: 'assets/towers/BrazenBastion.glb',
  a_twr_aerie: 'assets/towers/Aerie.glb',
  a_twr_ironKeep: 'assets/towers/IronKeep.glb',
  a_twr_stoneTerrace: 'assets/towers/StoneTerrace.glb',
  a_twr_trialGate: 'assets/towers/TrialGate.glb',
  a_twr_chainBastion: 'assets/towers/ChainBastion.glb',
  a_twr_coldKeep: 'assets/towers/ColdKeep.glb',
  a_twr_commandHall: 'assets/towers/CommandHall.glb',
  a_twr_caravanserai: 'assets/towers/MakranCaravanserai.glb',
  a_twr_rebellionForge: 'assets/towers/RebellionForge.glb',
  a_twr_spearFort: 'assets/towers/SpearFort.glb',
  a_twr_nightGarden: 'assets/towers/NightGarden.glb',
  a_twr_courtHall: 'assets/towers/CourtHall.glb',
  a_twr_pitWard: 'assets/towers/PitWard.glb',
  a_twr_armorWard: 'assets/towers/ArmorWard.glb',
  a_twr_whiteFortress: 'assets/towers/WhiteFortress.glb',
  a_twr_royalGate: 'assets/towers/RoyalGate.glb',
  a_twr_stableFort: 'assets/towers/StableFort.glb',
  a_twr_barracksHall: 'assets/towers/BarracksHall.glb',
  a_twr_warCamp: 'assets/towers/WarCamp.glb',
  // (Per-stage main palaces are NOT here — they are large (~12 MB) and lazy-loaded per map; see PALACE_FILES below.)
  // Static Persian weapon props (CC-BY) — cloned onto hand bones, replacing procedural makeWeapon per kind
  a_wpn_sword: 'assets/weapons/Shamshir.glb',
  a_wpn_mace: 'assets/weapons/Gorz.glb',
  a_wpn_spear: 'assets/weapons/Neyzeh.glb',
  a_wpn_bow: 'assets/weapons/Kaman.glb',
  a_wpn_axe: 'assets/weapons/Tabarzin.glb',
  a_wpn_staff: 'assets/weapons/Staff.glb',
  a_wpn_lance: 'assets/weapons/Lance.glb',       // cavalry lance — vertical, tip-up
  a_wpn_halberd: 'assets/weapons/Halberd.glb',   // crescent pole-axe — vertical, tip-up
  a_wpn_hammer: 'assets/weapons/Hammer.glb',     // forge war-hammer — head up/forward
  a_wpn_dagger: 'assets/weapons/Khanjar.glb',    // khanjar — hangs tip-down like the sword
  a_wpn_banner: 'assets/weapons/Drafsh.glb',     // drafsh war-standard — dead vertical, tip-up
  a_wpn_lantern: 'assets/weapons/Fanus.glb',     // fanus lantern — carried forward, hanging
  // NOTE: the Quaternius Modular Characters (people/p1) are NOT registered — investigated and
  // rejected (see memory/progress.md). Blockers: the free pack's PEASANT outfits are HEADLESS
  // (no head mesh/part), the bound T-pose needs reposing (solved: rotateOnWorldAxis(X,-90°) on
  // the shared upperarm bones), and the textures are ~5 MB each (2048²) — ~60 MB for 4 figures,
  // ~doubling the offline deploy for a few background NPCs. The world's "life" comes instead
  // from the existing animated q_knight guards/soldiers + ambient wildlife.
};

// facing correction per asset (our convention: models face +Z)
const ROT_FIX = {
  kk_knight: Math.PI, kk_barbarian: Math.PI,
  fox: -Math.PI / 2,
  a_dragon: Math.PI / 2, // Azhdahā head faces -X natively → +Z so it crawls head-first (worm already faces +Z)
};
export function rotFix(key) { return ROT_FIX[key] ?? 0; }

// preferred clip names per logical action, first regex that matches wins
const CLIP_PREFS = {
  idle: [/\|Idle$/i, /^Idle$/i, /idle(?!_sword)/i, /survey/i],
  walk: [/\|Walking$/i, /^Walking_A$/i, /\|Walk$/i, /Snake_Walk/i, /walking/i, /walk/i],
  run: [/\|Run$/i, /^Running_A$/i, /gallop(?!_jump)/i, /running/i, /run/i],
  attack: [/Run_swordAttack/i, /Snake_Attack/i, /Attack_Headbutt/i, /\|Attack$/i, /^Attack$/i, /1H_Melee_Attack_Slice/i, /Melee_Attack/i, /attack/i, /Archery_Shot/i, /archery/i], // archer uses Archery_Shot
  death: [/\|Death$/i, /^Death$/i, /^Death_A$/i, /death/i, /dead/i, /^die/i], // some rigs use "Dead"/"Die"
  hit: [/Idle_HitReact1/i, /HitReact/i, /Hit_A/i, /hit/i],
  // Quaternius Animals: a real grazing clip for ambient wildlife (the headline win)
  eat: [/^Eating$/i, /eat/i, /graze/i],
};

const loader = new GLTFLoader();
const cache = new Map();   // key -> { scene, animations, normScale } | 'failed'
let preloadStarted = false;

function findClips(animations, prefs) {
  for (const re of prefs) {
    const clips = animations.filter((a) => re.test(a.name));
    if (clips.length) return clips;
  }
  return [];
}

function actionGroup(entry) {
  if (!entry) return [];
  return Array.isArray(entry) ? entry : [entry];
}

function firstAction(entry) {
  return actionGroup(entry)[0] || null;
}

function forEachAction(entry, fn) {
  for (const action of actionGroup(entry)) fn(action);
}

export function preloadAssets() {
  if (preloadStarted) return;
  preloadStarted = true;
  for (const [key, url] of Object.entries(MODEL_FILES)) {
    loader.load(
      url,
      (gltf) => {
        // normalize so spawn() can scale to a requested height.
        // CAUTION: skinned geometry can have near-zero bind-space bounds with the
        // real size carried by bone transforms (Quaternius exports) — so measure
        // the skeleton's world-space bone span, not just mesh bounding boxes.
        gltf.scene.updateMatrixWorld(true);
        const box = new THREE.Box3();
        const v = new THREE.Vector3();
        let any = false;
        gltf.scene.traverse((o) => {
          if (o.isBone) { box.expandByPoint(o.getWorldPosition(v)); any = true; }
        });
        const meshBox = new THREE.Box3().setFromObject(gltf.scene);
        if (!any) box.copy(meshBox);
        else box.union(new THREE.Box3()); // keep bone box as-is
        const boneH = box.max.y - box.min.y;
        const meshH = meshBox.max.y - meshBox.min.y;
        // bones underestimate by ~head/feet margins; prefer the larger plausible span
        const rawHeight = Math.max(0.001, any ? Math.max(boneH * 1.15, Math.min(meshH, boneH * 3)) : meshH);
        cache.set(key, { scene: gltf.scene, animations: gltf.animations, rawHeight });
      },
      undefined,
      () => cache.set(key, 'failed'), // offline / missing file → procedural fallback
    );
  }
}

export function assetReady(key) {
  const c = cache.get(key);
  return c && c !== 'failed';
}

// Static prop: deep-clone a loaded asset's scene (no skeleton/mixer). Used for weapon GLBs
// attached to hand bones. Returns null if the asset isn't loaded → caller falls back to procedural.
export function cloneAssetScene(key) {
  const c = cache.get(key);
  if (!c || c === 'failed') return null;
  const s = c.scene.clone(true);
  s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return s;
}

// ---- per-stage main palaces: large (~12 MB) GLBs, lazy-loaded on map entry (NOT boot-preloaded) ----
const PALACE_FILES = {
  alborz: 'assets/palaces/AlborzSimurghEyrie.glb',
  zabulistan: 'assets/palaces/ZabulistanKeepPolished.glb',
  sistan: 'assets/palaces/SistanReedland.glb',
  samangan: 'assets/palaces/SamanganPalace.glb',
  'dez-sepid': 'assets/palaces/DezSepid.glb',
  mazandaran: 'assets/palaces/MazandaranHold.glb',
  damavand: 'assets/palaces/DamavandPrison.glb',
  'siyavash-gate': 'assets/palaces/SiyavashGate.glb',
  turan: 'assets/palaces/TuranCourt.glb',
  balkh: 'assets/palaces/BalkhRoyalCity.glb',
  'dez-roein': 'assets/palaces/DezRoein.glb',
  'manijeh-garden': 'assets/palaces/ManijehGarden.glb',
  estakhr: 'assets/palaces/EstakhrTerraces.glb',
  madayen: 'assets/palaces/MadayenArch.glb',
  'arash-watch': 'assets/palaces/ArashHorizonWatch.glb',
  'dez-bahman': 'assets/palaces/DezBahman.glb',
  'gang-dez': 'assets/palaces/GangDez.glb',
  'gordafarid-fort': 'assets/palaces/GordafaridFort.glb',
  kabul: 'assets/palaces/KabulPalace.glb',
  makran: 'assets/palaces/MakranFort.glb',
};
const palaceCache = new Map();   // placeId -> 'loading' | 'failed' | { scene }
const palaceWaiters = new Map(); // placeId -> [onReady...]
const palaceErrors = new Map();

export function hasPalace(placeId) { return !!PALACE_FILES[placeId]; }
export function palaceReady(placeId) {
  const c = palaceCache.get(placeId);
  return !!c && c !== 'loading' && c !== 'failed';
}
export function palaceStatus(placeId) {
  const c = palaceCache.get(placeId);
  return {
    available: !!PALACE_FILES[placeId],
    status: !PALACE_FILES[placeId] ? 'missing' : !c ? 'idle' : c === 'loading' ? 'loading' : c === 'failed' ? 'failed' : 'ready',
    error: palaceErrors.get(placeId) || null,
  };
}

export function sanitizePalaceShadows(root) {
  if (!root) return root;
  root.castShadow = false;
  root.receiveShadow = false;
  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) {
      // Custom palace GLBs can include very large helper planes or deep roof slabs.
      // Keep them lit by scene lights, but remove them from the shadow pass entirely.
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
  });
  sanitizeVisualArtifacts(root, { scope: 'palace', hide: true });
  return root;
}

function palaceMaterialProfile(root, placeId) {
  if (placeId !== 'zabulistan' || !root?.traverse) return root;
  const profile = zabulistanVisualProfile(placeId)?.palace?.material || {};
  const toned = new Map();
  const colorMul = new THREE.Color(profile.colorMul ?? 0xe2c28d);
  const lightStone = new THREE.Color(profile.lightStone ?? 0xc6a36f);
  const midStone = new THREE.Color(profile.midStone ?? 0xa0774d);
  const darkStone = new THREE.Color(profile.darkStone ?? 0x604431);
  const toneMaterial = (mat) => {
    if (!mat?.isMaterial) return mat;
    if (toned.has(mat)) return toned.get(mat);
    const m = mat.clone();
    if (m.color?.isColor) {
      const luminance = m.color.r * 0.2126 + m.color.g * 0.7152 + m.color.b * 0.0722;
      if (luminance > 0.66) {
        m.color.lerp(lightStone, 0.52);
      } else if (luminance < 0.14) {
        m.color.lerp(darkStone, 0.68);
      } else {
        m.color.multiply(colorMul).lerp(midStone, 0.16);
      }
    }
    if (m.emissive?.isColor) m.emissive.setHex(0x000000);
    if ('emissiveIntensity' in m) m.emissiveIntensity = 0;
    if ('metalness' in m) m.metalness = Math.min(Number.isFinite(m.metalness) ? m.metalness : 0, 0.06);
    if ('roughness' in m) m.roughness = Math.max(Number.isFinite(m.roughness) ? m.roughness : 0.78, 0.84);
    if ('envMapIntensity' in m) m.envMapIntensity = Math.min(Number.isFinite(m.envMapIntensity) ? m.envMapIntensity : 1, 0.35);
    m.needsUpdate = true;
    toned.set(mat, m);
    return m;
  };
  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) {
      o.material = Array.isArray(o.material)
        ? o.material.map(toneMaterial)
        : toneMaterial(o.material);
    }
  });
  return root;
}

// kick a lazy load (idempotent); onReady fires once the GLB is parsed (or immediately if already ready).
export function loadPalace(placeId, onReady) {
  if (!PALACE_FILES[placeId]) return;
  if (palaceCache.get(placeId) === 'failed') {
    palaceCache.delete(placeId);
    palaceErrors.delete(placeId);
  }
  if (palaceReady(placeId)) { onReady && onReady(); return; }
  if (onReady) palaceWaiters.set(placeId, [...(palaceWaiters.get(placeId) || []), onReady]);
  if (palaceCache.has(placeId)) return; // already loading / failed
  palaceCache.set(placeId, 'loading');
  loader.load(
    PALACE_FILES[placeId],
    (gltf) => {
      sanitizePalaceShadows(gltf.scene);
      palaceCache.set(placeId, { scene: gltf.scene });
      palaceErrors.delete(placeId);
      (palaceWaiters.get(placeId) || []).forEach((fn) => fn());
      palaceWaiters.delete(placeId);
    },
    undefined,
    (err) => {
      const message = err?.message || err?.target?.src || String(err || 'unknown palace asset load error');
      palaceErrors.set(placeId, message);
      console.warn('Palace asset failed to load', placeId, message);
      palaceCache.set(placeId, 'failed');
      palaceWaiters.delete(placeId);
    }, // missing → procedural citadel
  );
}
export function clonePalaceScene(placeId) {
  const c = palaceCache.get(placeId);
  if (!c || c === 'loading' || c === 'failed') return null;
  const s = c.scene.clone(true);
  palaceMaterialProfile(s, placeId);
  return sanitizePalaceShadows(s);
}

// Spawn an animated instance. Returns null if not (yet) available → caller falls back.
// opts: { height: desired world height, tint: 0xrrggbb color multiplier }
export function spawnAsset(key, { height = 1.7, tint = null, walkStride = null } = {}) {
  const c = cache.get(key);
  if (!c || c === 'failed') return null;
  const group = skeletonClone(c.scene);
  const s = height / c.rawHeight;
  group.scale.setScalar(s);
  group.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned bounds are unreliable; avoid pop-out
      if (tint != null) {
        // MULTIPLY the tint so armor/cloth/skin part-colors keep their contrast
        // (a flat replacement turns multi-part characters into clay statues)
        o.material = o.material.clone();
        o.material.color = o.material.color.clone().lerp(new THREE.Color(tint), 0.45);
      }
    }
  });
  const mixer = new THREE.AnimationMixer(group);
  const actions = {};
  for (const [name, prefs] of Object.entries(CLIP_PREFS)) {
    const clips = findClips(c.animations, prefs);
    if (clips.length) actions[name] = clips.map((clip) => mixer.clipAction(clip));
  }
  // single-clip models (the three.js horse): use it for everything locomotive
  if (!actions.walk && c.animations.length) {
    actions.walk = [mixer.clipAction(c.animations[0])];
    actions.run = actions.walk;
    actions.idle = actions.idle || actions.walk;
  }
  forEachAction(actions.death, (action) => {
    action.setLoop(THREE.LoopOnce);
    action.clampWhenFinished = true;
  });
  forEachAction(actions.attack, (action) => action.setLoop(THREE.LoopOnce));
  const walkAction = firstAction(actions.walk);
  return {
    group, mixer, actions,
    current: null,
    currentGroup: null,
    headH: height,
    isAsset: true,
    // optional foot-plant calibration for IN-PLACE GLB walks (e.g. the lion):
    // enemy.js sets the walk timeScale so stride*timeScale/duration == world speed,
    // killing the foot-skate that a fixed timeScale causes. null => use legacy formula.
    walkStride,
    walkDuration: walkAction ? walkAction.getClip().duration : 1,
    play(name, { fade = 0.18, timeScale = 1 } = {}) {
      const next = actionGroup(this.actions[name]);
      if (!next.length) return;
      next.forEach((action) => { action.timeScale = timeScale; });
      if (this.currentGroup === next) return;
      next.forEach((action) => action.reset().fadeIn(fade).play());
      if (this.currentGroup) {
        this.currentGroup.forEach((action) => {
          if (!next.includes(action)) action.fadeOut(fade);
        });
      }
      this.currentGroup = next;
      this.current = next[0];
    },
    strike() { // one-shot attack over whatever is playing
      const attack = actionGroup(this.actions.attack);
      if (!attack.length) return;
      attack.forEach((action) => action.reset().setEffectiveWeight(1).play());
    },
  };
}
