// Per-stage horizon backdrop — distant level-specific scenery surrounding the board so it never reads
// as a slab floating in sky. Four ultra-wide quadrant panoramas (N/E/S/W) are mapped onto four
// overlapping 90° arcs of a large inward-facing cylinder, between the skydome and the world apron.
// Each arc fades to transparent at the TOP (melts into the sky), is occluded at the BOTTOM by the
// apron hills, and cross-fades at its left/right edges so the four seams disappear. Stays fixed (not
// camera-locked) so panning gives gentle parallax → real depth. Lazy-loaded; never-break.
import * as THREE from 'three';

// per-stage: [N, E, S, W] ultra-wide (~16:5) panorama files. A stage with no entry shows just the
// procedural apron + skydome. Flip TEST_BACKDROP to preview the rig with the splash vista on all arcs.
const BACKDROP_FILES = {
  // <placeId>: ['assets/backdrops/<id>_n.webp', '<id>_e.webp', '<id>_s.webp', '<id>_w.webp']
  mazandaran: ['assets/backdrops/mazandaran_n.jpg', 'assets/backdrops/mazandaran_e.jpg', 'assets/backdrops/mazandaran_s.jpg', 'assets/backdrops/mazandaran_w.jpg'],
};
const TEST_BACKDROP = false;

const _cache = new Map();   // url -> THREE.Texture | 'loading' | 'failed'
const _waiters = new Map(); // url -> [cb...]
const _loader = new THREE.TextureLoader();

function filesFor(placeId) {
  if (BACKDROP_FILES[placeId]) return BACKDROP_FILES[placeId];
  if (TEST_BACKDROP) { const s = 'assets/ui/splash-bg.webp'; return [s, s, s, s]; }
  return null;
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
