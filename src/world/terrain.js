// Terrain: heightfield with biome vertex-coloring; roads and pads flatten it.
import * as THREE from 'three';
import { fbm } from './noise.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const BIOMES = {
  highland: {
    hills: 4.5, ground: [0x6f9a44, 0x8aae52], rock: 0x8a8270, high: 0x9aa489,
    mood: { background: 0x9db7d4, fogColor: 0xa8bcd0, fogNear: 100, fogFar: 280, sunColor: 0xffe3b3, sunIntensity: 2.2 },
    props: { cypress: 14, tree: 8, rock: 16, reeds: 0, palm: 0, bush: 10, grass: 950, snow: false },
  },
  wetland: {
    hills: 1.6, ground: [0x5d8c3e, 0x4a7a36], rock: 0x7a7464, high: 0x83905c,
    mood: { background: 0xa9bfc4, fogColor: 0xa9c2bd, fogNear: 80, fogFar: 230, sunColor: 0xfff0c8, sunIntensity: 1.9 },
    props: { cypress: 4, tree: 6, rock: 6, reeds: 60, palm: 0, bush: 12, grass: 800, snow: false },
  },
  valley: {
    hills: 3.2, ground: [0x70a847, 0x8cba55], rock: 0x90876d, high: 0xa3ab88,
    mood: { background: 0xa9c4e0, fogColor: 0xb6c8da, fogNear: 110, fogFar: 300, sunColor: 0xffe8bd, sunIntensity: 2.3 },
    props: { cypress: 18, tree: 12, rock: 8, reeds: 0, palm: 0, bush: 16, grass: 1300, snow: false },
  },
  plains: {
    hills: 2.2, ground: [0x8fae4e, 0xa8b85e], rock: 0x968c70, high: 0xa8a487,
    mood: { background: 0xb4c6dd, fogColor: 0xc0ccd8, fogNear: 110, fogFar: 300, sunColor: 0xffe3a8, sunIntensity: 2.4 },
    props: { cypress: 8, tree: 14, rock: 8, reeds: 0, palm: 0, bush: 12, grass: 1300, snow: false },
  },
  forest: {
    hills: 3.8, ground: [0x39682f, 0x2f5829], rock: 0x5d5f52, high: 0x57674c,
    mood: { background: 0x6c8577, fogColor: 0x7b9486, fogNear: 45, fogFar: 160, sunColor: 0xd8e6c8, sunIntensity: 1.5, hemiIntensity: 0.95, bloom: { strength: 0.52, threshold: 0.58, radius: 0.7 } },
    props: { cypress: 16, tree: 58, rock: 14, reeds: 10, palm: 0, bush: 34, grass: 900, snow: false },
  },
  mountain: {
    hills: 6.5, ground: [0x779061, 0x6a7e58], rock: 0x7e7a6e, high: 0xd7dde2,
    mood: { background: 0x9eb6d8, fogColor: 0xb3c4d8, fogNear: 85, fogFar: 240, sunColor: 0xfff0d8, sunIntensity: 2.3 },
    props: { cypress: 8, tree: 4, rock: 28, reeds: 0, palm: 0, bush: 6, grass: 500, snow: false },
  },
  snowpeak: {
    hills: 6.0, ground: [0xc9d2d8, 0xbcc7d0], rock: 0x8e9197, high: 0xe8eef4,
    mood: { background: 0xbfd2e4, fogColor: 0xcdd9e6, fogNear: 70, fogFar: 220, sunColor: 0xe8f0ff, sunIntensity: 2.0, hemiIntensity: 1.5 },
    props: { cypress: 6, tree: 0, rock: 24, reeds: 0, palm: 0, bush: 0, grass: 0, snow: true },
  },
  steppe: {
    hills: 2.6, ground: [0xb8a850, 0xc9b75c], rock: 0x97886a, high: 0xb3a988,
    mood: { background: 0xc2c8d8, fogColor: 0xc8c8cc, fogNear: 100, fogFar: 290, sunColor: 0xffd9a0, sunIntensity: 2.3 },
    props: { cypress: 4, tree: 6, rock: 12, reeds: 0, palm: 0, bush: 8, grass: 850, dryGrass: true, snow: false },
  },
  desert: {
    hills: 2.4, ground: [0xd9ae5e, 0xe5bf70], rock: 0xa88f66, high: 0xd8bd8c,
    mood: { background: 0xd8c3a0, fogColor: 0xd9c6a4, fogNear: 90, fogFar: 260, sunColor: 0xffd9a0, sunIntensity: 2.6, exposure: 1.1 },
    props: { cypress: 0, tree: 2, rock: 14, reeds: 0, palm: 16, bush: 5, grass: 350, dryGrass: true, snow: false },
  },
  river: {
    hills: 1.8, ground: [0x7cab4c, 0x93b95a], rock: 0x968c70, high: 0xa8ab8a,
    mood: { background: 0xaac4dd, fogColor: 0xbccede, fogNear: 100, fogFar: 290, sunColor: 0xffe8c0, sunIntensity: 2.3 },
    props: { cypress: 12, tree: 10, rock: 6, reeds: 24, palm: 6, bush: 12, grass: 1100, snow: false },
  },
};

export const WORLD_SIZE = 150;

// Build a height function for a map; flattenPoints = sampled road points + pads + citadel
export function makeHeightField(seedNum, biome) {
  const amp = biome.hills;
  return (x, z) => {
    const n = fbm(x * 0.018 + 50, z * 0.018 + 50, 4, seedNum);
    let h = (n - 0.45) * 2 * amp;
    // raise outer rim into hills/mountains for a natural arena
    const edge = Math.max(Math.abs(x), Math.abs(z)) / (WORLD_SIZE / 2);
    if (edge > 0.72) h += (edge - 0.72) * (edge - 0.72) * 6 * (0.5 + amp * 0.18); // barely-there edge, no rim-ridge border
    return h;
  };
}

export function buildTerrain(heightAt, biome, flattenFn) {
  const seg = 110;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGround0 = new THREE.Color(biome.ground[0]);
  const cGround1 = new THREE.Color(biome.ground[1]);
  const cRock = new THREE.Color(biome.rock);
  const cHigh = new THREE.Color(biome.high);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = heightAt(x, z);
    h = flattenFn ? flattenFn(x, z, h) : h;
    pos.setY(i, h);
    // color by slope/height bands + soft variation
    const t = fbm(x * 0.05, z * 0.05, 2, 7) * 0.5;
    c.lerpColors(cGround0, cGround1, t + 0.25);
    if (h > biome.hills * 1.6 + 2) c.lerp(cHigh, Math.min(1, (h - biome.hills * 1.6 - 2) / 6));
    else if (h > biome.hills * 0.9) c.lerp(cRock, Math.min(1, (h - biome.hills * 0.9) / 4) * 0.6);
    const broad = fbm(x * 0.013 + 17, z * 0.013 - 11, 3, 31);
    const grit = fbm(x * 0.18 - 5, z * 0.18 + 9, 2, 19);
    const hsl = {};
    c.getHSL(hsl);
    c.setHSL(
      hsl.h + (broad - 0.5) * 0.018,
      clamp01(hsl.s * (0.96 + broad * 0.12)),
      clamp01(hsl.l + (grit - 0.5) * 0.055),
    );
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const edgeTint = new THREE.Color(biome.ground?.[1] ?? biome.ground?.[0] ?? 0x6f8050)
    .lerp(new THREE.Color(biome.mood?.fogColor ?? 0xb3c4d8), 0.55);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0,
    map: detailTexture(), // high-frequency soil detail multiplied under the vertex colors
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.edgeTint = { value: edgeTint };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vTed;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vTed = max(abs(position.x), abs(position.z));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 edgeTint;\nvarying float vTed;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  float edgeBlend = smoothstep(58.0, 75.0, vTed);\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, edgeTint, edgeBlend * 0.42);');
  };
  // progressive upgrade: real CC0 ground photo-texture replaces the canvas detail. The two
  // photos are the SAME for every map, so load them ONCE and reuse (was re-loaded per map →
  // a 2-texture/map GPU leak). vertexColors carry the base color until they finish loading.
  groundPhotos(mat, biome);
  const mesh = new THREE.Mesh(geo, mat);
  // The board is a large receiver; shadow-map edges from distant scenery read as
  // hard black rectangles. GTAO keeps ground contact while terrain stays clean.
  mesh.receiveShadow = false;
  return mesh;
}

// Shared CC0 ground normal — loaded ONCE and reused by every map's terrain material.
// The diffuse layer stays procedural/neutral so biome vertex colors do not turn into
// camera-sized dark texture rectangles at the board edge.
let _groundNormal = null;
function groundPhotos(mat, biome) {
  if (!_groundNormal) {
    const tl = new THREE.TextureLoader();
    _groundNormal = tl.load('assets/textures/ground-normal.jpg', (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(26, 26); t.needsUpdate = true; });
  }
  mat.normalMap = _groundNormal;
  const dry = !!biome.props?.dryGrass;
  const snow = !!biome.props?.snow;
  mat.map = detailTexture();
  const scale = snow ? 0.24 : dry ? 0.3 : 0.34;
  mat.normalScale = new THREE.Vector2(scale, scale);
  mat.roughness = snow ? 0.88 : dry ? 1.0 : 0.95;
  mat.needsUpdate = true;
}

let _detailTex = null;
function detailTexture() {
  if (_detailTex) return _detailTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 5200; i++) {
    const v = 218 + Math.random() * 37;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(140,140,140,0.5)' : 'rgba(255,255,255,0.6)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1 + Math.random() * 2);
  }
  _detailTex = new THREE.CanvasTexture(c);
  _detailTex.wrapS = _detailTex.wrapT = THREE.RepeatWrapping;
  _detailTex.repeat.set(46, 46);
  _detailTex.colorSpace = THREE.SRGBColorSpace;
  return _detailTex;
}
