// Renderer + scene + lighting + post-processing + main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { settings } from './settings.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = settings.get('shadows');
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
    this.sun.castShadow = true;
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
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.speed = 1;          // 0 paused, 1, 2
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
    this.renderer.shadowMap.enabled = settings.get('shadows') && q !== 'low';
    const sz = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== sz) {
      this.sun.shadow.mapSize.set(sz, sz);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.bloom.enabled = settings.get('bloom') && q !== 'low';
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
    this.shake = Math.min(1.2, this.shake + amount);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._clock.start();
    const loop = () => {
      if (!this._running) return;
      requestAnimationFrame(loop);
      this._ticks = (this._ticks || 0) + 1;
      const raw = Math.min(this._clock.getDelta(), 0.05);
      const dt = raw * this.speed;
      this.elapsed += dt;
      for (const fn of this._updates) fn(dt, raw);
      this.sky.position.copy(this.camera.position); // skydome rides with the camera
      // camera shake decay (uses raw time — works during pause)
      if (this.shake > 0.001) {
        const s = this.shake * 0.35;
        this.camera.position.x += (Math.random() - 0.5) * s;
        this.camera.position.y += (Math.random() - 0.5) * s * 0.6;
        this.shake *= Math.pow(0.0001, raw); // fast decay
      } else this.shake = 0;
      this.composer.render();
    };
    requestAnimationFrame(loop);
  }

  stop() { this._running = false; }

  setMood({ fogColor = 0x9fb4c8, fogNear = 90, fogFar = 260, sunColor = 0xffe3b3, sunIntensity = 2.0, hemiSky = 0xbdd1e8, hemiGround = 0x8a7a64, hemiIntensity = 1.3, background = 0x87a6c4, exposure = 1.12, skyTop = null } = {}) {
    this.scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
    this.scene.background = new THREE.Color(background);
    this.sun.color.set(sunColor);
    this.sun.intensity = sunIntensity;
    this.hemi.color.set(hemiSky);
    this.hemi.groundColor.set(hemiGround);
    this.hemi.intensity = hemiIntensity;
    this.renderer.toneMappingExposure = exposure;
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
  }
}
