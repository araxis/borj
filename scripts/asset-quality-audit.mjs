import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourceOnly = new Set(['a_dragon', 'a_worm']);
const staticOk = new Set(['Hero_simurgh']);

function extractModelFiles() {
  const src = readFileSync(path.join(root, 'src/core/assets.js'), 'utf8');
  const match = src.match(/const MODEL_FILES = \{([\s\S]*?)\n\};/);
  if (!match) throw new Error('MODEL_FILES block not found');
  const entries = [];
  const re = /^\s*([A-Za-z0-9_]+):\s*'([^']+)'/gm;
  let m;
  while ((m = re.exec(match[1]))) entries.push({ key: m[1], url: m[2] });
  return entries;
}

function parseGltfJson(filePath) {
  const buf = readFileSync(filePath);
  if (filePath.toLowerCase().endsWith('.gltf')) return JSON.parse(buf.toString('utf8'));
  if (!filePath.toLowerCase().endsWith('.glb')) return null;
  if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error(`Bad GLB magic: ${filePath}`);
  const jsonLength = buf.readUInt32LE(12);
  const chunkType = buf.toString('utf8', 16, 20);
  if (chunkType !== 'JSON') throw new Error(`Missing JSON chunk: ${filePath}`);
  return JSON.parse(buf.toString('utf8', 20, 20 + jsonLength).trim());
}

function isActor(entry) {
  if (entry.key.startsWith('a_twr_') || entry.key.startsWith('a_wpn_')) return false;
  if (entry.key.startsWith('Hero_')) return true;
  if (entry.key.startsWith('a_')) return /assets\/(animals|models)\//.test(entry.url);
  return ['q_knight', 'q_snake', 'q_snake_angry', 'q_wolf', 'q_stag', 'q_deer', 'q_horse', 'q_horse_white', 'q_bull', 'fox', 'horse'].includes(entry.key);
}

function qualityStatus(entry, animationCount) {
  if (!isActor(entry)) return 'static-prop';
  if (sourceOnly.has(entry.key)) return animationCount > 0 ? 'ready' : 'source-only';
  if (staticOk.has(entry.key)) return animationCount > 0 ? 'ready' : 'static-ok';
  return animationCount > 0 ? 'ready' : 'blocker';
}

const rows = extractModelFiles()
  .filter((entry) => /\.(glb|gltf)$/i.test(entry.url))
  .map((entry) => {
    const filePath = path.join(root, 'public', entry.url);
    const json = parseGltfJson(filePath);
    const animations = json?.animations || [];
    const clips = animations.map((a, i) => a.name || `clip_${i}`);
    return {
      key: entry.key,
      url: entry.url,
      status: qualityStatus(entry, clips.length),
      animations: clips.length,
      clips: clips.slice(0, 8).join(', '),
      meshes: json?.meshes?.length || 0,
      materials: json?.materials?.length || 0,
      skins: json?.skins?.length || 0,
      kb: Math.round(statSync(filePath).size / 1024),
    };
  });

const blockers = rows.filter((r) => r.status === 'blocker');
const sourceRefs = rows.filter((r) => r.status === 'source-only');
const staticAllowed = rows.filter((r) => r.status === 'static-ok');

console.log(JSON.stringify({
  audited: rows.length,
  readyActors: rows.filter((r) => r.status === 'ready' && isActor(r)).length,
  blockers,
  sourceOnly: sourceRefs,
  staticOk: staticAllowed,
}, null, 2));

if (blockers.length) process.exitCode = 1;
