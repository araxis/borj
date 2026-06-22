import * as THREE from 'three';
import { BACKDROP_DIRECTIONS, getBackdropConfig, backdropManifestReport } from '../data/backdrops.js';

const _loader = new THREE.TextureLoader();

const ARC = Math.PI / 2;
const OVER = 0.42;
const SEGMENTS = 64;

const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAG = `
  uniform sampler2D map;
  uniform float hasMap;
  uniform float opacity;
  uniform float brightness;
  uniform float desaturate;
  uniform float contrast;
  uniform float wash;
  uniform float lowFogStrength;
  uniform float edgeFade;
  uniform float bottomFade;
  uniform float topFade;
  uniform vec3 tint;
  uniform vec3 fogTint;
  varying vec2 vUv;
  void main() {
    if (hasMap < 0.5) discard;
    vec4 c = texture2D(map, vUv);
    float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 rgb = mix(c.rgb, vec3(luma), desaturate);
    rgb = mix(rgb, rgb * tint, 0.26);
    float lowFog = (1.0 - smoothstep(0.14, 0.92, vUv.y)) * lowFogStrength;
    rgb = mix(rgb, fogTint, clamp(lowFog + wash, 0.0, 0.62));
    rgb = (rgb - 0.5) * contrast + 0.5;
    rgb = clamp(rgb * brightness, 0.0, 1.0);
    float edge = 1.0;
    if (edgeFade > 0.001) {
      edge = smoothstep(0.0, edgeFade, vUv.x) * (1.0 - smoothstep(1.0 - edgeFade, 1.0, vUv.x));
    }
    float bottom = smoothstep(bottomFade, bottomFade + 0.22, vUv.y);
    float top = 1.0 - smoothstep(topFade, 1.0, vUv.y);
    gl_FragColor = vec4(rgb, c.a * edge * bottom * top * opacity);
  }`;

function smoothstep(value, edge0, edge1) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const HAZE_FRAG = `
  uniform vec3 fogTint;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    float band = smoothstep(0.02, 0.36, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
    float ripple = 0.82 + 0.18 * sin(vUv.x * 37.699);
    gl_FragColor = vec4(fogTint, band * ripple * opacity);
  }`;

const HORIZON_FRAG = `
  uniform vec3 fogTint;
  uniform vec3 groundTint;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    float bottom = smoothstep(0.0, 0.18, vUv.y);
    float top = 1.0 - smoothstep(0.58, 1.0, vUv.y);
    float ripple = 0.86 + 0.14 * sin(vUv.x * 43.982 + sin(vUv.x * 12.566) * 0.65);
    vec3 rgb = mix(groundTint, fogTint, smoothstep(0.04, 0.78, vUv.y));
    gl_FragColor = vec4(rgb, bottom * top * ripple * opacity);
  }`;

function toColor(value, fallback) {
  return new THREE.Color(value ?? fallback ?? 0xffffff);
}

function prepBackdropTexture(tex, opts = {}) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = opts.repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function makeImageMaterial(layer, cfg, biome) {
  const fogTint = toColor(cfg.fogTint, biome?.mood?.fogColor ?? 0xb3c4d8);
  const tint = toColor(cfg.tint, biome?.ground?.[1] ?? biome?.ground?.[0] ?? 0xffffff);
  return new THREE.ShaderMaterial({
    name: `backdrop-${layer}`,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.BackSide,
    fog: false,
    uniforms: {
      map: { value: null },
      hasMap: { value: 0 },
      opacity: { value: cfg.opacity ?? 0.24 },
      brightness: { value: cfg.brightness ?? 0.9 },
      desaturate: { value: cfg.desaturate ?? 0.12 },
      contrast: { value: cfg.contrast ?? 0.92 },
      wash: { value: cfg.wash ?? 0.1 },
      lowFogStrength: { value: cfg.lowFog ?? 0.16 },
      edgeFade: { value: cfg.edgeFade ?? 0.14 },
      bottomFade: { value: cfg.bottomFade ?? 0.34 },
      topFade: { value: cfg.topFade ?? 0.86 },
      tint: { value: tint },
      fogTint: { value: fogTint },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

function makeHazeMaterial(cfg, biome) {
  return new THREE.ShaderMaterial({
    name: 'backdrop-haze',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.BackSide,
    fog: false,
    uniforms: {
      fogTint: { value: toColor(cfg?.fogTint, biome?.mood?.fogColor ?? 0xb3c4d8) },
      opacity: { value: cfg?.opacity ?? 0.12 },
    },
    vertexShader: VERT,
    fragmentShader: HAZE_FRAG,
  });
}

function makeHorizonMaterial(cfg, biome) {
  const fogTint = toColor(cfg?.fogTint, biome?.mood?.fogColor ?? 0xb3c4d8);
  const groundTint = toColor(biome?.ground?.[1] ?? biome?.ground?.[0], 0x9aae78).lerp(fogTint, 0.42);
  return new THREE.ShaderMaterial({
    name: 'backdrop-horizon-blend',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.BackSide,
    fog: false,
    uniforms: {
      fogTint: { value: fogTint },
      groundTint: { value: groundTint },
      opacity: { value: cfg?.opacity ?? 0.16 },
    },
    vertexShader: VERT,
    fragmentShader: HORIZON_FRAG,
  });
}

function configureBackdropMesh(mesh, renderOrder) {
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.userData.visualLayer = 'backdrop';
}

function loadLayerTexture(url, root, mesh, mat, entry, opts = {}) {
  if (!url) {
    entry.status = 'missing';
    root.userData.backdrop.missing += 1;
    return;
  }
  _loader.load(url, (tex) => {
    prepBackdropTexture(tex, opts);
    if (root.userData.disposed) {
      tex.dispose();
      entry.status = 'disposed';
      return;
    }
    entry.width = tex.image?.width || null;
    entry.height = tex.image?.height || null;
    mat.uniforms.map.value = tex;
    mat.uniforms.hasMap.value = 1;
    mesh.userData.backdropTexture = tex;
    entry.status = 'loaded';
    root.userData.backdrop.loaded += 1;
  }, undefined, () => {
    entry.status = 'failed';
    root.userData.backdrop.failed += 1;
  });
}

function addImageLayer(root, placeId, layerName, cfg, backdropCfg, biome) {
  for (let i = 0; i < BACKDROP_DIRECTIONS.length; i++) {
    const dir = BACKDROP_DIRECTIONS[i];
    const len = ARC + OVER;
    const start = i * ARC - len / 2;
    const geo = new THREE.CylinderGeometry(cfg.radius ?? 360, cfg.radius ?? 360, cfg.height ?? 140, SEGMENTS, 1, true, start, len);
    const mat = makeImageMaterial(layerName, { ...cfg, tint: backdropCfg.tint, fogTint: backdropCfg.fogTint }, biome);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `backdrop:${placeId}:${layerName}:${dir}`;
    mesh.position.y = cfg.y ?? 34;
    configureBackdropMesh(mesh, cfg.renderOrder ?? -7);
    const entry = { layer: layerName, dir, url: cfg.files?.[dir] || null, status: 'loading' };
    entry.tone = {
      opacity: cfg.opacity ?? 0.24,
      brightness: cfg.brightness ?? 0.9,
      desaturate: cfg.desaturate ?? 0.12,
      contrast: cfg.contrast ?? 0.92,
      wash: cfg.wash ?? 0.1,
      lowFog: cfg.lowFog ?? 0.16,
      y: cfg.y ?? 34,
      height: cfg.height ?? 140,
      radius: cfg.radius ?? 360,
      bottomFade: cfg.bottomFade ?? 0.34,
      topFade: cfg.topFade ?? 0.86,
    };
    mesh.userData.backdropEntry = entry;
    root.userData.backdrop.layers.push(entry);
    root.add(mesh);
    loadLayerTexture(entry.url, root, mesh, mat, entry);
  }
}

function addPanoramaLayer(root, placeId, cfg, backdropCfg, biome) {
  const layerName = cfg.layer || 'panorama360';
  const geo = new THREE.CylinderGeometry(cfg.radius ?? 360, cfg.radius ?? 360, cfg.height ?? 140, SEGMENTS * 4, 1, true);
  const mat = makeImageMaterial(layerName, { ...cfg, tint: backdropCfg.tint, fogTint: backdropCfg.fogTint }, biome);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `backdrop:${placeId}:${layerName}`;
  mesh.position.y = cfg.y ?? 74;
  configureBackdropMesh(mesh, cfg.renderOrder ?? -8);
  const entry = { layer: layerName, dir: 'ring', url: cfg.file || null, status: 'loading' };
  entry.tone = {
    opacity: cfg.opacity ?? 0.24,
    brightness: cfg.brightness ?? 0.9,
    desaturate: cfg.desaturate ?? 0.12,
    contrast: cfg.contrast ?? 0.92,
    wash: cfg.wash ?? 0.1,
    lowFog: cfg.lowFog ?? 0.16,
    y: cfg.y ?? 74,
    height: cfg.height ?? 140,
    radius: cfg.radius ?? 360,
    bottomFade: cfg.bottomFade ?? 0.34,
    topFade: cfg.topFade ?? 0.86,
    topViewFade: cfg.topViewFade || null,
  };
  mesh.userData.backdropEntry = entry;
  if (cfg.topViewFade) {
    mesh.userData.backdropTopViewFade = {
      baseOpacity: cfg.opacity ?? 0.24,
      pitchStart: cfg.topViewFade.pitchStart ?? 0.9,
      pitchEnd: cfg.topViewFade.pitchEnd ?? 1.12,
      minOpacity: cfg.topViewFade.minOpacity ?? 0.12,
    };
  }
  root.userData.backdrop.layers.push(entry);
  root.add(mesh);
  loadLayerTexture(entry.url, root, mesh, mat, entry, { repeatX: true });
}

export function updateBackdropForCamera(root, cameraState) {
  const pitch = Number(cameraState?.pitch ?? cameraState?.pitchGoal);
  if (!Number.isFinite(pitch)) return;
  root.traverse((o) => {
    const fade = o.userData?.backdropTopViewFade;
    const uniform = o.material?.uniforms?.opacity;
    if (!fade || !uniform) return;
    const t = smoothstep(pitch, fade.pitchStart, fade.pitchEnd);
    uniform.value = fade.baseOpacity * (1 - t * (1 - fade.minOpacity));
  });
}

function addHazeLayer(root, placeId, cfg, backdropCfg, biome) {
  const geo = new THREE.CylinderGeometry(cfg.radius ?? 335, cfg.radius ?? 335, cfg.height ?? 78, 96, 1, true);
  const mat = makeHazeMaterial({ ...cfg, fogTint: backdropCfg.fogTint }, biome);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `backdrop:${placeId}:haze`;
  mesh.position.y = cfg.y ?? 8;
  configureBackdropMesh(mesh, -5.8);
  root.userData.backdrop.layers.push({ layer: 'haze', dir: 'ring', url: null, status: 'procedural' });
  root.add(mesh);
}

function addHorizonBlend(root, placeId, cfg, backdropCfg, biome) {
  const geo = new THREE.CylinderGeometry(cfg.radius ?? 286, cfg.radius ?? 286, cfg.height ?? 104, 128, 1, true);
  const mat = makeHorizonMaterial({ ...cfg, fogTint: backdropCfg.fogTint }, biome);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `backdrop:${placeId}:horizon-blend`;
  mesh.position.y = cfg.y ?? 6;
  configureBackdropMesh(mesh, cfg.renderOrder ?? -5.55);
  root.userData.backdrop.layers.push({
    layer: 'horizonBlend',
    dir: 'ring',
    url: null,
    status: 'procedural',
    tone: {
      opacity: cfg.opacity ?? 0.16,
      y: cfg.y ?? 6,
      height: cfg.height ?? 104,
      radius: cfg.radius ?? 286,
    },
  });
  root.add(mesh);
}

function disposeBackdropRoot(root) {
  root.userData.disposed = true;
  root.traverse((o) => {
    if (o.userData?.visualLayer !== 'backdrop') return;
    if (o.userData.backdropTexture) o.userData.backdropTexture.dispose();
    if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.filter(Boolean).forEach((m) => m.dispose?.());
    }
  });
}

export function buildBackdrop(group, biome, placeId) {
  const cfg = getBackdropConfig(placeId);
  if (!cfg?.enabled) return null;
  const root = new THREE.Group();
  root.name = `distant-backdrop:${placeId}`;
  root.userData.backdrop = {
    placeId,
    status: cfg.status,
    artNote: cfg.artNote,
    loaded: 0,
    failed: 0,
    missing: 0,
    layers: [],
  };
  root.userData.dispose = () => disposeBackdropRoot(root);
  if (cfg.panorama360) {
    const layers = Array.isArray(cfg.panorama360) ? cfg.panorama360 : [cfg.panorama360];
    for (const layer of layers) addPanoramaLayer(root, placeId, layer, cfg, biome);
  } else {
    if (cfg.layers?.far) addImageLayer(root, placeId, 'far', cfg.layers.far, cfg, biome);
    if (cfg.layers?.mid) addImageLayer(root, placeId, 'mid', cfg.layers.mid, cfg, biome);
  }
  if (cfg.horizon) addHorizonBlend(root, placeId, cfg.horizon, cfg, biome);
  if (cfg.haze) addHazeLayer(root, placeId, cfg.haze, cfg, biome);
  group.add(root);
  return root;
}

export function backdropSceneReport(root) {
  const reports = [];
  root?.traverse?.((o) => {
    if (o.userData?.backdrop) {
      const data = o.userData.backdrop;
      reports.push({
        placeId: data.placeId,
        status: data.status,
        loaded: data.loaded,
        failed: data.failed,
        missing: data.missing,
        artNote: data.artNote,
        layers: data.layers.map((l) => ({ ...l })),
      });
    }
  });
  return reports;
}

export { backdropManifestReport };

// --- distant procedural range ring: real-parallax horizon silhouettes ringed around desert/steppe
// boards. The old GLB forest/snow relief tiles were rectangular planes with no reliable cutout alpha;
// from the tactical camera they could drift across the playable map as black slabs.
function rangeFor(biomeKey) {
  const table = {
    highland: { color: 0x7f8b6c, opacity: 0.24, peak: 15, R: 246, layers: 2 },
    valley: { color: 0x71875f, opacity: 0.22, peak: 13, R: 250, layers: 2 },
    plains: { color: 0x92946a, opacity: 0.2, peak: 10, R: 256, layers: 1 },
    forest: { color: 0x496a58, opacity: 0.22, peak: 17, R: 240, layers: 2 },
    mountain: { color: 0x7e8490, opacity: 0.28, peak: 22, R: 236, layers: 2 },
    snowpeak: { color: 0xb6c5d4, opacity: 0.28, peak: 24, R: 234, layers: 2 },
    steppe: { color: 0x938b68, opacity: 0.3, peak: 16, R: 240, layers: 2 },
    desert: { color: 0xb99661, opacity: 0.32, peak: 14, R: 228, layers: 2 },
    river: { color: 0x738966, opacity: 0.2, peak: 12, R: 252, layers: 1 },
    wetland: { color: 0x57705f, opacity: 0.18, peak: 10, R: 256, layers: 1 },
  };
  return table[biomeKey] ? { procedural: true, ...table[biomeKey] } : null;
}

// denser ring (20 narrower tiles) with per-tile jitter so the silhouette reads as a continuous,
// irregular range of layered ridges rather than 12 identical stamps spaced evenly.
const RING = { N: 20, tileW: 112, baseY: -12, peakBoost: 1.0 };

// deterministic per-tile pseudo-random in [0,1) — stable across rebuilds (no Math.random pop)
function ringRand(i, k) { const v = Math.sin((i + 1) * (12.9898 + k * 7.137)) * 43758.5453; return v - Math.floor(v); }

function makeProceduralRangeTile(i, cfg) {
  const w = RING.tileW * (0.72 + ringRand(i, 9) * 0.24);
  const peak = cfg.peak * (0.7 + ringRand(i, 10) * 0.55);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  const steps = 6;
  for (let s = 0; s <= steps; s++) {
    const x = -w / 2 + (w * s) / steps;
    const t = s / steps;
    const ridge = Math.sin(t * Math.PI) * peak * (0.75 + ringRand(i + s, 11) * 0.45);
    const shoulder = peak * 0.24 * ringRand(i + s, 12);
    shape.lineTo(x, Math.max(4, ridge + shoulder));
  }
  shape.lineTo(w / 2, 0);
  shape.lineTo(-w / 2, 0);
  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color: cfg.color, transparent: true, opacity: cfg.opacity,
    side: THREE.DoubleSide, fog: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -6;
  return mesh;
}

function fillProceduralRing(ringGroup, cfg) {
  const layers = Math.max(1, Math.min(2, cfg.layers || 1));
  for (let layer = 0; layer < layers; layer++) {
    const layerCfg = {
      ...cfg,
      R: cfg.R + layer * 16,
      peak: cfg.peak * (layer ? 0.68 : 1),
      opacity: cfg.opacity * (layer ? 0.48 : 1),
    };
    for (let i = 0; i < RING.N; i++) {
      const tile = makeProceduralRangeTile(i + layer * 31, layerCfg);
      const ang = (i / RING.N) * Math.PI * 2 + (ringRand(i, 3) - 0.5) * 0.11;
      const R = layerCfg.R * (0.88 + ringRand(i + layer * 7, 4) * 0.14);
      tile.position.set(Math.cos(ang) * R, RING.baseY - layer * 4 + (ringRand(i, 5) - 0.5) * 3, Math.sin(ang) * R);
      tile.rotation.y = -ang - Math.PI / 2;
      tile.scale.y = 0.95 + ringRand(i, 6) * 0.28;
      ringGroup.add(tile);
    }
  }
}

function fillRing(ringGroup, biomeKey) {
  const cfg = rangeFor(biomeKey);
  if (cfg?.procedural) fillProceduralRing(ringGroup, cfg);
}

export function buildMountainRing(group, biome, biomeKey, isDisposed) {
  const cfg = rangeFor(biomeKey);
  if (!cfg) return null; // no tile for this biome family yet -> just apron + sky
  const ringGroup = new THREE.Group();
  group.add(ringGroup);
  const build = () => { if (!(isDisposed && isDisposed())) fillRing(ringGroup, biomeKey); };
  build();
  return ringGroup;
}
