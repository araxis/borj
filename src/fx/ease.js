// Easing + frame-rate-independent damping helpers — the backbone of smooth, natural motion.
// Procedural animation in the game was raw sin/linear; these give anticipation, follow-through,
// and exponential smoothing so nothing snaps.
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// gentle overshoot — good for "settle into pose" recoils
export const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

// Exponential smoothing toward a target, independent of frame rate. lambda = responsiveness
// (higher = snappier). Use in per-frame update loops: cur = damp(cur, target, 8, dt).
export const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

// Same, but takes the shortest path around the circle (for rotations / look-at aim).
export function dampAngle(current, target, lambda, dt) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-lambda * dt));
}
