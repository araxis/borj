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
  // Static Persian weapon props (CC-BY) — cloned onto hand bones, replacing procedural makeWeapon per kind
  a_wpn_sword: 'assets/weapons/Shamshir.glb',
  a_wpn_mace: 'assets/weapons/Gorz.glb',
  a_wpn_spear: 'assets/weapons/Neyzeh.glb',
  a_wpn_bow: 'assets/weapons/Kaman.glb',
  a_wpn_axe: 'assets/weapons/Tabarzin.glb',
  a_wpn_staff: 'assets/weapons/Staff.glb',
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

function findClip(animations, prefs) {
  for (const re of prefs) {
    const c = animations.find((a) => re.test(a.name));
    if (c) return c;
  }
  return null;
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
    const clip = findClip(c.animations, prefs);
    if (clip) actions[name] = mixer.clipAction(clip);
  }
  // single-clip models (the three.js horse): use it for everything locomotive
  if (!actions.walk && c.animations.length) {
    actions.walk = mixer.clipAction(c.animations[0]);
    actions.run = actions.walk;
    actions.idle = actions.idle || actions.walk;
  }
  if (actions.death) {
    actions.death.setLoop(THREE.LoopOnce);
    actions.death.clampWhenFinished = true;
  }
  if (actions.attack) actions.attack.setLoop(THREE.LoopOnce);
  return {
    group, mixer, actions,
    current: null,
    headH: height,
    isAsset: true,
    // optional foot-plant calibration for IN-PLACE GLB walks (e.g. the lion):
    // enemy.js sets the walk timeScale so stride*timeScale/duration == world speed,
    // killing the foot-skate that a fixed timeScale causes. null => use legacy formula.
    walkStride,
    walkDuration: actions.walk ? actions.walk.getClip().duration : 1,
    play(name, { fade = 0.18, timeScale = 1 } = {}) {
      const a = this.actions[name];
      if (!a) return;
      a.timeScale = timeScale;
      if (this.current === a) return;
      a.reset().fadeIn(fade).play();
      if (this.current) this.current.fadeOut(fade);
      this.current = a;
    },
    strike() { // one-shot attack over whatever is playing
      const a = this.actions.attack;
      if (!a) return;
      a.reset().setEffectiveWeight(1).play();
    },
  };
}
