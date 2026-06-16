// Procedural animated fire — a single shared ShaderMaterial used by every flame in the game
// (sacred citadel flames, torches, fire towers, camp + prop flames). Replaces the old crossed
// flat-orange quads. The flame silhouette, turbulence and flicker are generated in the fragment
// shader from layered value-noise scrolling upward; each flame flickers UNIQUELY because the noise
// is seeded by world position, so one shared material + one per-frame time bump animates them all.
// Additive blending + a white-hot core feed the bloom pass so fire reads as holy Atar light.
import * as THREE from 'three';

const VERT = `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = `
  precision highp float;
  uniform float time;
  varying vec2 vUv;
  varying vec3 vWorld;

  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main() {
    // per-flame seed from world position → neighbouring flames never flicker in sync
    vec2 seed = floor(vWorld.xz * 2.3) * 9.17;
    float x = vUv.x - 0.5;     // -0.5 .. 0.5 across
    float y = vUv.y;           // 0 base .. 1 tip
    float t = time * 1.7;

    // rising turbulence (scroll noise upward) + a finer detail layer
    float n  = fbm(vec2(x * 3.5 + seed.x, y * 3.0 - t) + seed * 0.1);
    float n2 = fbm(vec2(x * 7.5 - seed.y, y * 5.5 - t * 1.5) + seed * 0.2);

    // flame body: wide, soft base tapering to a point, edges nibbled by noise
    float width = mix(0.46, 0.05, pow(y, 0.8)) * (0.78 + n * 0.55);
    float edge  = abs(x) + (n2 - 0.5) * 0.22 * (0.3 + y);
    float body  = smoothstep(width, width * 0.35, edge);
    float vert  = smoothstep(0.0, 0.10, y) * smoothstep(1.0, 0.52, y); // fade base + tip
    float flick = 0.72 + 0.28 * fbm(vec2(seed.x * 0.7, t * 1.3));      // whole-flame breath
    float alpha = body * vert * flick;
    if (alpha < 0.02) discard;

    // gradient: white-hot gold core → amber → deep ember red toward the tip (Atar light)
    float h = clamp(y + (n - 0.5) * 0.22, 0.0, 1.0);
    vec3 hot  = vec3(1.0, 0.97, 0.78);
    vec3 mid  = vec3(1.0, 0.58, 0.12);
    vec3 cool = vec3(0.86, 0.14, 0.03);
    vec3 col = mix(hot, mid, smoothstep(0.0, 0.42, h));
    col = mix(col, cool, smoothstep(0.40, 0.92, h));
    // a hint of blue at the very base (hottest part of a real flame)
    col = mix(col, vec3(0.55, 0.7, 1.0), smoothstep(0.12, 0.0, y) * smoothstep(0.22, 0.0, abs(x)) * 0.5);
    // white-hot core drives the bloom glow
    float core = smoothstep(0.3, 0.0, abs(x)) * smoothstep(0.55, 0.0, y);
    col += core * vec3(0.7, 0.55, 0.32);

    gl_FragColor = vec4(col, alpha);
  }
`;

let _mat = null;
export function fireMaterial() {
  if (_mat) return _mat;
  _mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, fog: false,
  });
  _mat.toneMapped = false; // keep the fire's bright HDR-ish values for the bloom pass
  return _mat;
}

// Advance every flame by one frame (single global time bump — call once per frame).
export function updateFire(dt) { if (_mat) _mat.uniforms.time.value += dt; }
