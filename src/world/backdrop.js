// Per-stage horizon backdrop — distant level-specific scenery surrounding the board so it never reads
// as a slab floating in sky. Four ultra-wide quadrant panoramas (N/E/S/W) are mapped onto four
// overlapping 90° arcs of a large inward-facing cylinder, between the skydome and the world apron.
// Each arc fades to transparent at the TOP (melts into the sky), is occluded at the BOTTOM by the
// apron hills, and cross-fades at its left/right edges so the four seams disappear. Stays fixed (not
// camera-locked) so panning gives gentle parallax → real depth. Lazy-loaded; never-break.
import * as THREE from 'three';
import { getProp, propBase, loadRanges, rangesReady } from '../core/props3d.js';

// per-stage: [N, E, S, W] ultra-wide (~16:5) panorama files. A stage with no entry shows just the
// procedural apron + skydome. Flip TEST_BACKDROP to preview the rig with the splash vista on all arcs.
// Every campaign stage now ships a four-quadrant panorama set: assets/backdrops/<placeId>_{n,e,s,w}.jpg.
// Paths are derived from the placeId, so any stage missing its files simply 404s and that arc stays
// empty (apron + sky show through) — never-break.
const BACKDROP_DIR = 'assets/backdrops/';
const TEST_BACKDROP = false;

const _cache = new Map();   // url -> THREE.Texture | 'loading' | 'failed'
const _waiters = new Map(); // url -> [cb...]
const _loader = new THREE.TextureLoader();

function filesFor(placeId) {
  if (TEST_BACKDROP) { const s = 'assets/ui/splash-bg.webp'; return [s, s, s, s]; }
  if (!placeId) return null;
  return ['n', 'e', 's', 'w'].map((q) => `${BACKDROP_DIR}${placeId}_${q}.jpg`);
}

function loadTexture(url, onReady) {
  const c = _cache.get(url);
  if (c && c !== 'loading' && c !== 'failed') { onReady(c); return; }
  if (c === 'failed') return;
  _waiters.set(url, [...(_waiters.get(url) || []), onReady]);
  if (c === 'loading') return;
  _cache.set(url, 'loading');
  _loader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    _cache.set(url, tex);
    (_waiters.get(url) || []).forEach((fn) => fn(tex));
    _waiters.delete(url);
  }, undefined, () => { _cache.set(url, 'failed'); _waiters.delete(url); });
}

const ARC = Math.PI / 2;   // 90° per quadrant
const OVER = 0.42;         // overlap (rad) so adjacent arcs cross-fade — kills the seams
const FRAG = `
  uniform sampler2D map; uniform float hasMap; varying vec2 vUv;
  void main() {
    if (hasMap < 0.5) discard;
    vec4 c = texture2D(map, vUv);
    float vfade = smoothstep(1.0, 0.70, vUv.y) * smoothstep(0.0, 0.05, vUv.y); // top→sky, feather bottom
    float hfade = smoothstep(0.0, 0.13, vUv.x) * smoothstep(1.0, 0.87, vUv.x); // edges cross-blend
    gl_FragColor = vec4(c.rgb, c.a * vfade * hfade);
  }`;
const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export function buildBackdrop(group, biome, placeId) {
  const files = filesFor(placeId);
  if (!files) return null;
  const R = 360, H = 150;
  const root = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const len = ARC + OVER;
    const start = i * ARC - len / 2;   // centre each quadrant on its cardinal, overlapping neighbours
    const geo = new THREE.CylinderGeometry(R, R, H, 56, 1, true, start, len);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      uniforms: { map: { value: null }, hasMap: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = H * 0.5 - 36;    // drop the horizon band onto the scene horizon
    mesh.renderOrder = -7;             // skydome (-10) < backdrop (-7) < apron (-4) < board
    mesh.frustumCulled = false;
    root.add(mesh);
    loadTexture(files[i], (tex) => { mat.uniforms.map.value = tex; mat.uniforms.hasMap.value = 1; });
  }
  group.add(root);
  return root;
}

// --- distant 3D mountain ring: real-parallax horizon from flat Meshy relief tiles ringed around the
// board and caught grazing by the camera (the validated technique). Each biome family gets its tile;
// scene fog hazes them into the atmosphere. Tiny + lazy + never-break (no tile for a biome → no ring).
const SNOW_BIOMES = new Set(['snowpeak', 'mountain']);
const FOREST_BIOMES = new Set(['forest', 'valley', 'river', 'wetland', 'highland', 'plains']);
// Per tile-family config. R (ring radius) sets how much scene fog the ridge gets: a DARK forest tile
// reads beautifully fully-hazed far out (R big → soft, the crinkly relief melts into a clean
// silhouette); a LIGHT snow tile must sit closer (R small → partial fog) or it washes into a light
// sky. darken nudges it a touch below the horizon so it always silhouettes.
function rangeFor(biomeKey) {
  if (SNOW_BIOMES.has(biomeKey)) return { name: 'range_snow', R: 170, darken: 0.78 };
  if (FOREST_BIOMES.has(biomeKey)) return { name: 'range_forest', R: 240, darken: 1.0 };
  return null; // desert / steppe — no matching tile generated yet
}

const RING = { N: 12, tileW: 215, baseY: -9, peakBoost: 1.25 };

function fillRing(ringGroup, biomeKey) {
  const cfg = rangeFor(biomeKey);
  const base = cfg && propBase(cfg.name);
  if (!base) return;
  const s = RING.tileW / base.baseW;
  let mat = null; // share one (optionally darkened) material across the tiles
  for (let i = 0; i < RING.N; i++) {
    const tile = getProp(cfg.name, { unit: 1, tint: null });
    if (!tile) continue;
    tile.scale.set(s, s * RING.peakBoost, s);
    const ang = (i / RING.N) * Math.PI * 2;
    tile.position.set(Math.cos(ang) * cfg.R, RING.baseY, Math.sin(ang) * cfg.R);
    tile.rotation.y = ang * 2.7 + i; // flat heightfield → any yaw reads; vary it so the tile never repeats identically
    tile.traverse((o) => {
      if (!o.isMesh) return;
      if (cfg.darken < 1) { // light tiles only: pre-darken so the partial-fog silhouette stays visible
        if (!mat) { mat = o.material.clone(); mat.color = (mat.color || new THREE.Color(0xffffff)).clone().multiplyScalar(cfg.darken); }
        o.material = mat;
      }
      o.castShadow = false; o.receiveShadow = false; o.renderOrder = -6;
    });
    ringGroup.add(tile);
  }
}

export function buildMountainRing(group, biome, biomeKey, isDisposed) {
  if (!rangeFor(biomeKey)) return null; // no tile for this biome family yet → just apron + sky
  const ringGroup = new THREE.Group();
  group.add(ringGroup);
  const build = () => { if (!(isDisposed && isDisposed())) fillRing(ringGroup, biomeKey); };
  if (rangesReady()) build(); else loadRanges(build);
  return ringGroup;
}
