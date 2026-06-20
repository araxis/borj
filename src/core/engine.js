// Renderer + scene + lighting + post-processing + main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { settings } from './settings.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Final cinematic grade — runs on the display-referred image after tone-mapping:
// edge chromatic aberration, a soft vignette, and per-biome contrast / saturation / shadow-lift.
// Subtle by design; the point is film polish, not an Instagram filter.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.34 },
    aberration: { value: 0.5 },
    contrast: { value: 1.06 },
    saturation: { value: 1.08 },
    lift: { value: new THREE.Color(0, 0, 0) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignette; uniform float aberration; uniform float contrast; uniform float saturation; uniform vec3 lift;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float d = dot(c, c);                       // 0 centre → ~0.5 corner
      vec2 off = c * aberration * d * 0.012;      // channels split outward toward the edges (subtle, a few px)
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col = (col - 0.5) * contrast + 0.5;         // contrast around mid-grey
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);        // saturation
      col += lift * (1.0 - l);                     // gentle shadow tint
      col *= 1.0 - vignette * smoothstep(0.15, 0.55, d); // darken the corners
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Dynamic shadow maps and screen-space AO both misread the scene's dense instanced
    // alpha foliage as hard rectangular slabs. Keep depth from lighting, bloom, and grade.
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 600);

    // image-based environment light — makes gold/bronze gleam and lifts shadow
    // sides of large architecture out of blackness
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose(); // free the generator's internal render targets (we keep only the result texture)
    this.scene.environmentIntensity = 0.55;

    // gradient skydome with a real sun disc + halo (follows the camera; fog-immune)
    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x3f74c4) },
      horizonColor: { value: new THREE.Color(0xcfe0ee) },
      sunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3).normalize() },
      sunColor: { value: new THREE.Color(0xfff2cc) },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 topColor; uniform vec3 horizonColor;
        uniform vec3 sunDir; uniform vec3 sunColor;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 24.0) * 0.35);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // lighting rig — warm sun + cool sky fill; per-map mood tints these
    this.hemi = new THREE.HemisphereLight(0xbdd1e8, 0x8a7a64, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe3b3, 2.2);
    this.sun.position.set(45, 70, 25);
    this.sun.castShadow = false;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -85; this.sun.shadow.camera.right = 85;
    this.sun.shadow.camera.top = 85; this.sun.shadow.camera.bottom = -85;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    // Ground-contact ambient occlusion is constructed but disabled: GTAO's depth/normal prepass
    // treats stylized alpha foliage as solid cards, producing camera-aligned black rectangles.
    this.gtao = new GTAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 2.0, distanceExponent: 1.0, thickness: 1.0, scale: 1.0, samples: 16, screenSpaceRadius: false });
    this.gtao.enabled = false;
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // edge-smoothing on the composited image (the renderer's MSAA doesn't reach composer targets)
    this.smaa = new SMAAPass(window.innerWidth, window.innerHeight);
    this.composer.addPass(this.smaa);
    // cinematic grade is the very last thing the eye sees
    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);

    this.speed = 1;          // 0 paused, selected battle speed multiplier
    this.timeScaleUI = 1;    // unaffected by pause (camera, UI anims)
    this._updates = new Set();
    this._clock = new THREE.Clock();
    this._running = false;
    this.elapsed = 0;
    this.shake = 0;

    this.applyQuality();
    settings.onChange((k) => {
      if (k === 'quality' || k === 'shadows' || k === 'bloom') this.applyQuality();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applyQuality() {
    const q = settings.get('quality');
    const pr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1);
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = false;
    const sz = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== sz) {
      this.sun.shadow.mapSize.set(sz, sz);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.bloom.enabled = settings.get('bloom') && q !== 'low';
    if (this.smaa) this.smaa.enabled = q !== 'low';   // skip AA pass on the low tier
    if (this.gtao) this.gtao.enabled = false;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onUpdate(fn) { this._updates.add(fn); return () => this._updates.delete(fn); }

  addShake(amount) {
    if (!settings.get('screenShake') || settings.get('reducedMotion')) return;
    this.shake = Math.min(3.0, this.shake + amount);
  }

  // brief game-time freeze on impact ("hit-stop") — the single biggest source of combat weight
  hitStop(d = 0.05) { if (!settings.get('reducedMotion')) this._hitStop = Math.max(this._hitStop || 0, d); }

  // flash the bloom on a big hit; the loop eases it back to the per-biome baseline
  bloomPulse(strength = 1.2) { if (this.bloom) this.bloom.strength = Math.max(this.bloom.strength, strength); }

  // cinematic slow-motion — drop the sim to `scale` speed then ease it back to normal over `dur`
  // seconds. The headline of an "epic moment" (boss arrival, the killing blow, victory/defeat).
  slowMo(scale = 0.35, dur = 1.1) { if (!settings.get('reducedMotion')) this._slowMo = { scale, t: dur, dur }; }

  start() {
    if (this._running) return;
    this._running = true;
    this._clock.start();
    const loop = () => {
      if (!this._running) return;
      requestAnimationFrame(loop);
      this._ticks = (this._ticks || 0) + 1;
      const raw = Math.min(this._clock.getDelta(), 0.05);
      let timeScale = this.speed;
      // slow-motion ramp: eases from `scale` back up to full speed across its duration
      if (this._slowMo) {
        this._slowMo.t -= raw;
        if (this._slowMo.t <= 0) this._slowMo = null;
        else { const k = this._slowMo.t / this._slowMo.dur; timeScale *= this._slowMo.scale + (1 - this._slowMo.scale) * (1 - k * k); }
      }
      let dt = raw * timeScale;
      if (this._hitStop > 0) { this._hitStop -= raw; dt = 0; } // freeze the sim, keep rendering + shake
      this.elapsed += dt;
      for (const fn of this._updates) fn(dt, raw);
      // bloom eases back to the per-biome baseline after a pulse
      if (this.bloom && this._bloomBase != null && this.bloom.strength > this._bloomBase) {
        this.bloom.strength = Math.max(this._bloomBase, this.bloom.strength - raw * 5);
      }
      this.sky.position.copy(this.camera.position); // skydome rides with the camera
      // camera shake decay (uses raw time — works during pause/hit-stop); punchier + slower falloff
      if (this.shake > 0.001) {
        const s = this.shake * 0.6;
        this.camera.position.x += (Math.random() - 0.5) * s;
        this.camera.position.z += (Math.random() - 0.5) * s;
        this.camera.position.y += (Math.random() - 0.5) * s * 0.5;
        this.shake *= Math.pow(0.02, raw); // ~0.3s half-life (was instant)
      } else this.shake = 0;
      this.composer.render();
    };
    requestAnimationFrame(loop);
  }

  stop() { this._running = false; }

  setMood({ fogColor = 0x9fb4c8, fogNear = 90, fogFar = 260, sunColor = 0xffe3b3, sunIntensity = 2.0, hemiSky = 0xbdd1e8, hemiGround = 0x8a7a64, hemiIntensity = 1.3, background = 0x87a6c4, exposure = 1.12, skyTop = null, bloom = null, grade = null } = {}) {
    // per-biome bloom — a dreamier glow in moody biomes (fireflies, fae mushrooms, palace glow);
    // reset to the default each map so non-moody stages aren't over-bloomed.
    this.bloom.strength = clamp(bloom?.strength ?? 0.35, 0.18, 0.58);
    this.bloom.threshold = clamp(bloom?.threshold ?? 0.85, 0.54, 0.94);
    this.bloom.radius = clamp(bloom?.radius ?? 0.6, 0.34, 0.74);
    this._bloomBase = this.bloom.strength; // pulses (bloomPulse) ease back to this
    const safeFogNear = clamp(fogNear, 52, 135);
    const safeFogFar = Math.max(safeFogNear + 96, clamp(fogFar, 170, 330));
    this.scene.fog = new THREE.Fog(fogColor, safeFogNear, safeFogFar);
    this.scene.background = new THREE.Color(background);
    this.sun.color.set(sunColor);
    this.sun.intensity = clamp(sunIntensity, 1.45, 2.65);
    this.hemi.color.set(hemiSky);
    this.hemi.groundColor.set(hemiGround);
    this.hemi.intensity = clamp(hemiIntensity, 0.9, 1.58);
    this.renderer.toneMappingExposure = clamp(exposure, 0.96, 1.16);
    // skydome: deep zenith derived from the background, horizon from the fog
    const top = new THREE.Color(skyTop ?? background);
    if (skyTop == null) {
      const hsl = {};
      top.getHSL(hsl);
      top.setHSL(hsl.h, Math.min(1, hsl.s * 1.6 + 0.12), Math.max(0.22, hsl.l * 0.62));
    }
    this.skyUniforms.topColor.value.copy(top);
    this.skyUniforms.horizonColor.value.set(fogColor);
    this.skyUniforms.sunColor.value.set(sunColor);
    this.skyUniforms.sunDir.value.copy(this.sun.position).normalize();
    // per-biome cinematic grade — moody stages run richer contrast / a cooler or warmer lift;
    // defaults give every map a light, neutral film polish.
    if (this.gradePass) {
      const u = this.gradePass.uniforms;
      u.vignette.value = clamp(grade?.vignette ?? 0.34, 0.22, 0.4);
      u.aberration.value = clamp(grade?.aberration ?? 0.5, 0, 0.56);
      u.contrast.value = clamp(grade?.contrast ?? 1.06, 1.0, 1.1);
      u.saturation.value = clamp(grade?.saturation ?? 1.08, 1.0, 1.14);
      u.lift.value.set(grade?.lift ?? 0x000000);
    }
  }
}
