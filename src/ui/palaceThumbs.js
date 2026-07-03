// 3D palace portraits for the Map of Iran (round 3): each stage's real palace GLB is
// rendered ONCE to a transparent hero-angle thumbnail and cached in localStorage, so
// the campaign map shows true miniature palaces without ever re-loading the ~10 MB
// GLBs. Generation runs progressively (one palace at a time) the first time the map
// opens; each GLB is evicted from the asset cache right after its portrait is taken.
import * as THREE from 'three';
import { hasPalace, loadPalace, clonePalaceScene, evictPalace, palaceReady } from '../core/assets.js';

const KEY = 'std.palaceThumbs.v1';
let store = null;

function loadStore() {
  if (!store) {
    try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { store = {}; }
  }
  return store;
}

export function palaceThumb(placeId) {
  return loadStore()[placeId] || null;
}

let renderer = null;
function ensureRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(256, 256);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return renderer;
}

function renderPortrait(model) {
  const r = ensureRenderer();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b5a40, 1.15));
  const sun = new THREE.DirectionalLight(0xffe8c0, 2.1);
  sun.position.set(4, 6, 5);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xd8a93e, 1.3); // gold rim from the west
  rim.position.set(-5, 3, -4);
  scene.add(rim);
  scene.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  const sph = box.getBoundingSphere(new THREE.Sphere());
  const cam = new THREE.PerspectiveCamera(34, 1, Math.max(0.01, sph.radius / 50), sph.radius * 10);
  const d = sph.radius * 2.05;
  cam.position.set(c.x + d * 0.72, c.y + d * 0.5, c.z + d * 0.72);
  cam.lookAt(c.x, c.y, c.z);
  r.render(scene, cam);
  return r.domElement.toDataURL('image/webp', 0.82);
}

let running = false;
// generate missing portraits one at a time; onOne(placeId, dataUrl) fires per portrait
export function generateThumbs(placeIds, onOne) {
  if (running) return;
  const todo = placeIds.filter((id) => hasPalace(id) && !palaceThumb(id));
  if (!todo.length) return;
  running = true;
  const next = () => {
    const id = todo.shift();
    if (!id) { running = false; return; }
    const wasLoaded = palaceReady(id); // in use by a live map — don't evict it below
    loadPalace(id, () => {
      try {
        const model = clonePalaceScene(id);
        if (model) {
          const url = renderPortrait(model);
          loadStore()[id] = url;
          try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* quota: keep in-memory */ }
          if (!wasLoaded) evictPalace(id);
          onOne && onOne(id, url);
        }
      } catch (e) {
        console.warn('[palace-thumbs] portrait failed', id, e);
      }
      setTimeout(next, 150); // let the menu breathe between ~10 MB parses
    });
  };
  next();
}
