// Palace GLB diet — QUALITY-PRESERVING, NO-DRACO safe.
//
// The per-stage palace landmarks are Meshy photogrammetry-style meshes: very dense
// (170k-360k tris) with float32 vertex attributes and per-corner UV/normal seams, so
// files run 6-21 MB each. Two things DON'T work on them and one does:
//   - simplifySloppy (scripts/sloppy.cjs): DESTROYS palaces — it collapses by spatial
//     proximity, ignoring UV seams, which crumples the silhouette and swims the textures.
//     (Fine for distant instanced forest trees; catastrophic for hero landmarks.)
//   - plain weld / seam-AWARE simplify: mostly defeated by the pervasive attribute seams
//     (weld only merges bitwise-identical verts; simplify locks seam edges).
//   - What works: seam-AWARE simplify (removes only what it safely can) + KHR_mesh_quantization
//     (float32 attrs -> ints). Quantization is decoded NATIVELY by three.js GLTFLoader — no
//     DRACOLoader/MeshoptDecoder needed, matching this project's plain `new GLTFLoader()`.
//
// Result on the 21 stage palaces: 207 MB -> ~87 MB (~58%), verified visually identical in
// Blender and confirmed loading in-engine (quantized=true, 0 failures). Textures are already
// WebP 1024² (2-5% of each file) and are left untouched.
//
// Usage (needs @gltf-transform + meshoptimizer, e.g. from an npx cache):
//   NODE_PATH=<node_modules> node scripts/palace-optimize.cjs <in.glb> <out.glb> [ratio] [error] [posBits]
//     ratio   : max fraction of tris the seam-aware simplify may keep (default 0.5)
//     error   : simplify error budget as fraction of mesh radius (default 0.02)
//     posBits : position quantization bits (default 12 — visually lossless on these palaces)
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { weld, simplify, quantize, dedup, prune } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');
const fs = require('fs');

const stat = (root) => {
  let t = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices();
    if (idx) t += idx.getCount() / 3;
  }
  return Math.round(t);
};

(async () => {
  const [, , inPath, outPath, ratioArg, errArg, posArg] = process.argv;
  if (!inPath || !outPath) { console.error('usage: palace-optimize.cjs <in.glb> <out.glb> [ratio] [error] [posBits]'); process.exit(2); }
  const ratio = parseFloat(ratioArg || '0.5');
  const error = parseFloat(errArg || '0.02');
  const posBits = parseInt(posArg || '12', 10);
  const normBits = Math.max(8, posBits - 4);
  const uvBits = Math.max(10, posBits - 2);

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(inPath);
  await MeshoptSimplifier.ready;
  const beforeTris = stat(doc.getRoot());
  const beforeBytes = fs.statSync(inPath).size;

  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: false }),
    quantize({ quantizePosition: posBits, quantizeNormal: normBits, quantizeTexcoord: uvBits, quantizeColor: 8 }),
    dedup(), prune(),
  );
  await io.write(outPath, doc);

  const afterTris = stat(doc.getRoot());
  const afterBytes = fs.statSync(outPath).size;
  const name = inPath.split(/[\\/]/).pop();
  const pct = (100 * (1 - afterBytes / beforeBytes)).toFixed(0);
  console.log(`${name.padEnd(26)} ${(beforeBytes / 1048576).toFixed(1)}MB -> ${(afterBytes / 1048576).toFixed(2)}MB (-${pct}%) | tris ${beforeTris.toLocaleString()}->${afterTris.toLocaleString()}`);
})().catch((e) => { console.error('FAIL', e.stack || e.message); process.exit(1); });
