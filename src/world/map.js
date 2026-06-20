// Map assembly: terrain + authored roads + auto-placed tower pads + citadel + spawn
// gates + scattered props + per-biome lighting mood. Returns the GameMap used by all
// gameplay systems (paths for enemies, pads for building, heightAt for placement).
import * as THREE from 'three';
import { PLACES_BY_ID } from '../data/places.js';
import { BIOMES, makeHeightField, buildTerrain, WORLD_SIZE } from './terrain.js';
import { samplePath, buildRoadMesh, ROAD_WIDTH } from './road.js';
import { scatterProps, buildSpawnGate, buildPad, makeBanner, swapForestTrees, swapForestEnrich } from './props.js';
import { buildLandCitadel, citadelFootprint } from './citadels.js';
import { planRiver, buildRiverMesh, buildBridge, buildWorldApron, RIVER_WIDTH } from './ambient.js';
import { buildBackdrop, buildMountainRing } from './backdrop.js';
import { getProp, instanceProp, propReady, propBase, propRotFix, placeM4, KIT_UNIT, KIT_TINT, THINGS_UNIT, REALISTIC_UNIT, loadForestTrees, loadForestEnrich } from '../core/props3d.js';
import { makeFlame } from '../models/towerkit.js';
import { makeRng } from './noise.js';

export class GameMap {
  constructor(mapDef, scene) {
    this.def = mapDef;
    this.place = PLACES_BY_ID[mapDef.id];
    this.biome = BIOMES[this.place?.biome || 'plains'];
    // per-map prop overrides win over the biome defaults (e.g. Mazandaran zeroes cypress while
    // Manijeh Garden — same forest biome — keeps the garden sarv).
    this.effectiveProps = { ...this.biome.props, ...this.place?.props };
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    const seedNum = [...mapDef.id].reduce((a, c) => a + c.charCodeAt(0), 7);
    const rng = makeRng('map:' + mapDef.id);
    const baseHeight = makeHeightField(seedNum, this.biome);

    // sample roads on base height
    this.paths = mapDef.paths.map((pts, i) => samplePath(pts, baseHeight, 0.8));

    // exit = end of first path (all paths share the final point by authoring convention)
    const last = this.paths[0].samples[this.paths[0].samples.length - 1];
    this.exitPos = new THREE.Vector3(last.pos.x, last.pos.y, last.pos.z);

    // build road-proximity index for flattening + pad checks
    const allSamples = [];
    this.paths.forEach((p) => p.samples.forEach((s) => allSamples.push(s)));
    this._roadGrid = new Map();
    const cell = 6;
    for (const s of allSamples) {
      const k = `${Math.floor(s.pos.x / cell)},${Math.floor(s.pos.z / cell)}`;
      if (!this._roadGrid.has(k)) this._roadGrid.set(k, []);
      this._roadGrid.get(k).push(s);
    }
    this._cell = cell;

    // pads — placed alongside roads, deterministic
    this.pads = this._placePads(rng, baseHeight);

    // river plan (before terrain so the bed can be carved)
    this.river = planRiver(this.place?.biome, baseHeight, this.paths, rng);
    this._riverGrid = null;
    if (this.river) {
      this._riverGrid = new Map();
      for (const s of this.river.samples) {
        const k = `${Math.floor(s.pos.x / 6)},${Math.floor(s.pos.z / 6)}`;
        if (!this._riverGrid.has(k)) this._riverGrid.set(k, []);
        this._riverGrid.get(k).push(s);
      }
    }
    const nearRiver = (x, z, maxDist) => {
      if (!this._riverGrid) return null;
      const cx = Math.floor(x / 6), cz = Math.floor(z / 6);
      let best = null, bestD = maxDist;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const arr = this._riverGrid.get(`${cx + dx},${cz + dz}`);
        if (!arr) continue;
        for (const s of arr) {
          const d = Math.hypot(x - s.pos.x, z - s.pos.z);
          if (d < bestD) { bestD = d; best = s; }
        }
      }
      return best;
    };

    const footprint = citadelFootprint(mapDef.id);

    // flatten fn blends terrain toward road/pad/citadel heights and carves the river bed
    const flatten = (x, z, h) => {
      let target = h, w = 0;
      const river = nearRiver(x, z, RIVER_WIDTH * 1.5);
      if (river) {
        const d = Math.hypot(x - river.pos.x, z - river.pos.z);
        const t = Math.max(0, 1 - d / (RIVER_WIDTH * 1.5));
        target = river.pos.y - 0.85; w = Math.max(w, t * t);
      }
      const near = this._nearRoad(x, z, ROAD_WIDTH * 1.9);
      if (near) {
        const d = Math.hypot(x - near.pos.x, z - near.pos.z);
        const t = Math.max(0, 1 - d / (ROAD_WIDTH * 1.9));
        target = near.pos.y - 0.05; w = Math.max(w, t * t);
      }
      for (const pad of this.pads) {
        const d = Math.hypot(x - pad.pos.x, z - pad.pos.z);
        if (d < 4.5) { const t = Math.max(0, 1 - d / 4.5); target = pad.pos.y; w = Math.max(w, t * t * 1.2); }
      }
      const dc = Math.hypot(x - this.exitPos.x, z - this.exitPos.z);
      if (dc < footprint) { const t = Math.max(0, 1 - dc / footprint); target = this.exitPos.y; w = Math.max(w, t); }
      return h * (1 - Math.min(1, w)) + target * Math.min(1, w);
    };

    this.heightAt = (x, z) => flatten(x, z, baseHeight(x, z));

    // terrain
    this.terrain = buildTerrain(baseHeight, this.biome, flatten);
    this.group.add(this.terrain);

    // roads
    const roadStyle = ['desert', 'steppe', 'wetland'].includes(this.place?.biome) ? 'earth' : 'stone';
    this.paths.forEach((p, i) => this.group.add(buildRoadMesh(p, roadStyle, mapDef.id + i)));

    // pads visuals
    this.padGroup = new THREE.Group();
    for (const pad of this.pads) {
      const mesh = buildPad();
      mesh.position.copy(pad.pos);
      mesh.rotation.y = pad.rot;
      this.padGroup.add(mesh);
      pad.mesh = mesh;
    }
    this.group.add(this.padGroup);

    // the land's famous citadel at the exit, facing the incoming road
    const cit = buildLandCitadel(mapDef.id);
    cit.group.position.copy(this.exitPos);
    const inDir = this.paths[0].samples[this.paths[0].samples.length - 8] || this.paths[0].samples[0];
    cit.group.rotation.y = Math.atan2(inDir.pos.x - this.exitPos.x, inDir.pos.z - this.exitPos.z);
    this.group.add(cit.group);
    this.citadel = cit;

    // river surface + bridges where roads cross it
    this.waterMats = [];
    if (this.river) {
      this.waterMats.push(buildRiverMesh(this.river, this.group));
      for (const path of this.paths) {
        let cluster = [];
        for (let i = 4; i < path.samples.length - 4; i++) {
          const s = path.samples[i];
          if (nearRiver(s.pos.x, s.pos.z, (ROAD_WIDTH + RIVER_WIDTH) * 0.55)) cluster.push(i);
          else if (cluster.length) {
            const mid = path.samples[cluster[Math.floor(cluster.length / 2)]];
            buildBridge(this.group, mid.pos, mid.tangent, (x, z) => this.heightAt(x, z));
            cluster = [];
          }
        }
        if (cluster.length) {
          const mid = path.samples[cluster[Math.floor(cluster.length / 2)]];
          buildBridge(this.group, mid.pos, mid.tangent, (x, z) => this.heightAt(x, z));
        }
      }
    }

    // distant mountain ranges ringing the land
    buildWorldApron(this.group, this.biome, (x, z) => this.heightAt(x, z)); // surrounding landscape, mirrors the board surface
    this.backdrop = buildBackdrop(this.group, this.biome, mapDef.id); // manifest-backed distant scenery panorama on the horizon
    buildMountainRing(this.group, this.biome, this.place?.biome || 'plains', () => this._disposed); // 3D distant range ring (real parallax)

    // spawn gates at each path start
    this.gates = this.paths.map((p) => {
      const s0 = p.samples[0], s1 = p.samples[2];
      const gate = buildSpawnGate();
      gate.position.set(s0.pos.x, s0.pos.y, s0.pos.z);
      gate.rotation.y = Math.atan2(s1.pos.x - s0.pos.x, s1.pos.z - s0.pos.z);
      this.group.add(gate);
      return gate;
    });

    // props (clear of roads/pads/citadel/river)
    const isClear = (x, z, r) => {
      if (Math.hypot(x - this.exitPos.x, z - this.exitPos.z) < footprint + 2 + r) return false;
      if (this._nearRoad(x, z, ROAD_WIDTH * 0.5 + r)) return false;
      if (nearRiver(x, z, RIVER_WIDTH * 0.7 + r)) return false;
      for (const pad of this.pads) if (Math.hypot(x - pad.pos.x, z - pad.pos.z) < 3 + r) return false;
      return true;
    };
    this.propsGroup = new THREE.Group();
    const propsAnim = scatterProps(rng, (x, z) => this.heightAt(x, z), isClear, this.effectiveProps, this.propsGroup, this.place?.biome || 'plains');
    this.group.add(this.propsGroup);
    // expose the clearance closures so the building-kit generators reuse them verbatim
    this._isClear = isClear;
    this._footprint = footprint;
    this._nearRiver = nearRiver;
    this.windmills = propsAnim.windmills;
    this.propFlames = propsAnim.flames;
    this.campfires = propsAnim.campfires;
    this._foliageSpots = propsAnim.foliageSpots || []; // cypress/tree/palm centers — hero props avoid these

    // Mazandaran forest: if the realistic tree GLBs weren't ready at build (kit trees placed as a
    // stopgap), load them on the priority path and swap them in when ready — unless the map was
    // disposed first (player left). Mirrors the palace _swapToPalace pattern.
    if (propsAnim.forestSwap && !propsAnim.forestSwap.placed) {
      loadForestTrees(() => { if (!this._disposed) swapForestTrees(propsAnim.forestSwap); });
    }
    // realistic forest-floor enrichment (flowers/mushrooms/boulders/extra trees) — same deferred swap
    if (propsAnim.forestEnrich && !propsAnim.forestEnrich.placed) {
      loadForestEnrich(() => { if (!this._disposed) swapForestEnrich(propsAnim.forestEnrich); });
    }

    // roadside derafsh banners — waypoints of a defended land
    this.propBanners = [];
    const bannerColors = ['clothRed', 'clothTeal', 'clothGold', 'clothPurple'];
    let bi = 0;
    for (const path of this.paths) {
      for (let d = 18; d < path.length - 16; d += 26) {
        const f = (d / path.length) * (path.samples.length - 1);
        const s = path.samples[Math.floor(f)];
        const side = (bi % 2 === 0 ? 1 : -1);
        const nx = -s.tangent.z * side, nz = s.tangent.x * side;
        const x = s.pos.x + nx * 3.4, z = s.pos.z + nz * 3.4;
        if (Math.hypot(x - this.exitPos.x, z - this.exitPos.z) < footprint + 2) continue;
        const banner = makeBanner(bannerColors[bi % bannerColors.length], 0.7, 1.15, 2.6);
        banner.position.set(x, this.heightAt(x, z), z);
        this.group.add(banner);
        this.propBanners.push(banner);
        bi++;
        if (this.propBanners.length >= 10) break;
      }
      if (this.propBanners.length >= 10) break;
    }

    // ---- KayKit Medieval Builder kit: the fortified Persian town fabric AROUND the
    // custom citadel (each generator is gated on the asset; null => procedural-only) ----
    this.kitGroup = new THREE.Group();
    this.group.add(this.kitGroup);
    this.villagerSpots = []; // ground points where idle civilian NPCs stand (filled by village/bazaar generators)
    const biome = this.place?.biome || 'plains';
    buildCurtainWall(this, rng);
    if (['plains', 'steppe', 'valley', 'river', 'desert'].includes(biome)) buildVillage(this, rng);
    if (['plains', 'steppe', 'valley', 'river', 'desert'].includes(biome)) dressMarket(this, rng);
    if (this.river) buildDocks(this, rng);
    if (['desert', 'steppe', 'highland', 'plains', 'river'].includes(biome)) buildRuinedColumns(this, rng);
    scatterHeroProps(this, rng); // realistic weathered rock/deadwood/dry props (biome-routed, capped)
  }

  _nearRoad(x, z, maxDist) {
    const cx = Math.floor(x / this._cell), cz = Math.floor(z / this._cell);
    let best = null, bestD = maxDist;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = this._roadGrid.get(`${cx + dx},${cz + dz}`);
        if (!arr) continue;
        for (const s of arr) {
          const d = Math.hypot(x - s.pos.x, z - s.pos.z);
          if (d < bestD) { bestD = d; best = s; }
        }
      }
    }
    return best;
  }

  // true if (x,z) is clear of every recorded stylized-foliage center by at least r — used to keep
  // realistic Poly Haven hero props from landing inside a sarv cypress / palm / kit tree.
  _clearOfFoliage(x, z, r) {
    for (const [fx, fz, fr] of this._foliageSpots) {
      const rr = r + fr;
      if ((x - fx) * (x - fx) + (z - fz) * (z - fz) < rr * rr) return false;
    }
    return true;
  }

  _placePads(rng, baseHeight) {
    const pads = [];
    const want = 16 + Math.floor(this.def.order / 4);
    let guard = 600;
    const sideOffsets = [4.2, 5.6, 7.0];
    while (pads.length < want && guard-- > 0) {
      const path = this.paths[Math.floor(rng() * this.paths.length)];
      const d = 8 + rng() * (path.length - 20);
      const f = (d / path.length) * (path.samples.length - 1);
      const i = Math.min(path.samples.length - 2, Math.floor(f));
      const s = path.samples[i];
      const side = rng() < 0.5 ? -1 : 1;
      const off = sideOffsets[Math.floor(rng() * sideOffsets.length)];
      const nx = -s.tangent.z * side, nz = s.tangent.x * side;
      const x = s.pos.x + nx * off, z = s.pos.z + nz * off;
      if (Math.abs(x) > WORLD_SIZE / 2 - 12 || Math.abs(z) > WORLD_SIZE / 2 - 12) continue;
      const road = this._nearRoad(x, z, 3.0);
      if (road) continue;
      if (Math.hypot(x - this.exitPos.x, z - this.exitPos.z) < citadelFootprint(this.def.id) + 1) continue;
      let tooClose = false;
      for (const p of pads) if (Math.hypot(x - p.pos.x, z - p.pos.z) < 6.2) { tooClose = true; break; }
      if (tooClose) continue;
      const y = s.pos.y + 0.05; // pads sit at road grade — integrated, not floating
      pads.push({ pos: new THREE.Vector3(x, y, z), rot: Math.atan2(s.tangent.x, s.tangent.z), tower: null, disabled: 0 });
    }
    return pads;
  }

  dispose() {
    this._disposed = true; // guard async swaps (forest trees) firing after the map is gone
    this.backdrop?.userData?.dispose?.();
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      // skip boot-cached shared prop geometry (props3d clones/instances reference it) — disposing
      // would force a full GPU re-upload of all building/nature/things/hero geometry next map.
      if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
    });
  }
}

// ---------------- building-kit generators (module scope; all gated + never-break) ----------------

// A fortified curtain wall arcing in front of the citadel, with a gate where the road
// enters and stone towers at the ends — the "you defend a fortress" silhouette.
function buildCurtainWall(map, rng) {
  if (!propReady('wall-fortified') || !propReady('wall-fortified-gate')) return;
  const base = propBase('wall-fortified');
  const segW = (base?.baseW || 1) * KIT_UNIT;            // exact tiled spacing
  const R = map._footprint + 6;
  const exit = map.exitPos;
  // face the wall toward the incoming road (same vector the citadel uses)
  const inDir = map.paths[0].samples[map.paths[0].samples.length - 8] || map.paths[0].samples[0];
  const approach = Math.atan2(inDir.pos.x - exit.x, inDir.pos.z - exit.z);
  const span = Math.PI * 1.05; // ~190° arc on the road-facing front
  const steps = Math.max(6, Math.round((span * R) / segW));
  const wallM = [], gates = [], towers = [];
  for (let i = 0; i <= steps; i++) {
    const a = approach - span / 2 + (span * i) / steps;
    const x = exit.x + Math.sin(a) * R;
    const z = exit.z + Math.cos(a) * R;
    if (Math.abs(x) > WORLD_SIZE / 2 - 6 || Math.abs(z) > WORLD_SIZE / 2 - 6) continue;
    // skip segments that sit on a tower pad
    let onPad = false;
    for (const p of map.pads) if (Math.hypot(x - p.pos.x, z - p.pos.z) < 4) { onPad = true; break; }
    if (onPad) continue;
    const y = map.heightAt(x, z);
    const facing = a + Math.PI; // wall face looks outward (away from citadel)
    if (map._nearRoad(x, z, ROAD_WIDTH * 1.2)) {
      gates.push({ x, y, z, ry: facing });
    } else {
      wallM.push(placeM4(x, y, z, facing));
    }
    if (i === 0 || i === steps || i === Math.round(steps / 2)) towers.push({ x, y, z });
  }
  const walls = instanceProp('wall-fortified', wallM);
  if (walls) map.kitGroup.add(walls);
  const bats = instanceProp('battlement', wallM.map((m) => {
    const m2 = m.clone(); m2.elements[13] += (base.baseH || 1) * KIT_UNIT; return m2;
  }));
  if (bats) map.kitGroup.add(bats);
  for (const g of gates.slice(0, 2)) {
    const gp = getProp('wall-fortified-gate');
    if (gp) { gp.position.set(g.x, g.y, g.z); gp.rotation.y = g.ry + propRotFix('wall-fortified-gate'); map.kitGroup.add(gp); }
  }
  for (const tw of towers) {
    for (const piece of ['tower-base', 'tower', 'tower-top']) {
      const tp = getProp(piece);
      if (!tp) continue;
      tp.position.set(tw.x, tw.y, tw.z);
      map.kitGroup.add(tp);
    }
  }
}

// A walled caravanserai-style compound or two, off-road near the citadel — gives the
// "defended town" density so the citadel never sits alone.
// Place a whole Persian building (GLB, arbitrary native scale) at a target world width, sat on
// the ground (lift by -baseY*unit), tint:null to keep its adobe/turquoise palette. Gated → never-break.
function placeBuilding(map, name, x, z, ry, targetW) {
  if (!propReady(name)) return false;
  const base = propBase(name);
  const unit = targetW / (base.baseW || 1);
  const p = getProp(name, { unit, tint: null });
  if (!p) return false;
  p.position.set(x, map.heightAt(x, z) - (base.baseY || 0) * unit, z);
  p.rotation.y = ry;
  map.kitGroup.add(p);
  return true;
}

function buildVillage(map, rng) {
  if (!propReady('wall')) return;
  const base = propBase('wall');
  const segW = (base?.baseW || 1) * KIT_UNIT;
  const want = 1 + Math.floor((map.def.order || 1) / 7); // 1–3 compounds
  const placed = [];
  let guard = 200;
  const wallM = [], fenceM = [], gates = [], props = [];
  while (placed.length < want && guard-- > 0) {
    const path = map.paths[Math.floor(rng() * map.paths.length)];
    const d = 14 + rng() * (path.length - 28);
    const f = (d / path.length) * (path.samples.length - 1);
    const s = path.samples[Math.max(0, Math.min(path.samples.length - 1, Math.floor(f)))];
    const side = rng() < 0.5 ? -1 : 1;
    const off = 12 + rng() * 6;
    const nx = -s.tangent.z * side, nz = s.tangent.x * side;
    const cx = s.pos.x + nx * off, cz = s.pos.z + nz * off;
    if (!map._isClear(cx, cz, 7)) continue;
    if (placed.some((p) => Math.hypot(cx - p.x, cz - p.z) < 16)) continue;
    placed.push({ x: cx, z: cz });
    // rectangular compound, gate on the road-facing side
    const half = segW * 2; // ~2 segments per side
    const gateYaw = Math.atan2(s.pos.x - cx, s.pos.z - cz);
    for (const [sx, sz, ry, isGateSide] of [
      [0, 1, 0, true], [0, -1, Math.PI, false], [1, 0, Math.PI / 2, false], [-1, 0, -Math.PI / 2, false],
    ]) {
      for (let t = -1; t <= 1; t++) {
        const wx = cx + sx * half + (sz !== 0 ? t * segW : 0);
        const wz = cz + sz * half + (sx !== 0 ? t * segW : 0);
        const wy = map.heightAt(wx, wz);
        if (isGateSide && t === 0) { gates.push({ x: wx, y: wy, z: wz, ry: gateYaw }); continue; }
        wallM.push(placeM4(wx, wy, wz, ry));
      }
    }
    // a back-corner tower + interior clutter
    props.push({ piece: 'tower', x: cx - half, y: map.heightAt(cx - half, cz - half), z: cz - half });
    props.push({ piece: 'detail-crate', x: cx + (rng() - 0.5) * 2, y: map.heightAt(cx, cz), z: cz + (rng() - 0.5) * 2 });
    props.push({ piece: 'barrels', x: cx + (rng() - 0.5) * 2.5, y: map.heightAt(cx, cz), z: cz + (rng() - 0.5) * 2.5 });
  }
  const walls = instanceProp('wall', wallM);
  if (walls) map.kitGroup.add(walls);
  for (const g of gates) {
    const gp = getProp('wall-gate');
    if (gp) { gp.position.set(g.x, g.y, g.z); gp.rotation.y = g.ry; map.kitGroup.add(gp); }
  }
  for (const p of props) {
    const pr = getProp(p.piece);
    if (pr) { pr.position.set(p.x, p.y, p.z); pr.rotation.y = rng() * Math.PI * 2; map.kitGroup.add(pr); }
  }

  // ---- Persian adobe buildings (CC-BY GLBs) — fill the compounds + a town anchor; gated, falls back to bare walls ----
  placed.forEach((c, ci) => {
    const nH = 2 + (rng() < 0.5 ? 1 : 0); // 2-3 dwellings scattered inside each compound
    for (let h = 0; h < nH; h++) {
      const a = rng() * 6.28318, rr = 3.5 + rng() * 3.5;
      const hx = c.x + Math.cos(a) * rr, hz = c.z + Math.sin(a) * rr;
      if (map._isClear(hx, hz, 2.5)) placeBuilding(map, rng() < 0.55 ? 'MudbrickHouse' : 'BadgirHouse', hx, hz, rng() * 6.28318, 4.4 + rng() * 1.4);
    }
    if (ci === 0) { // the "defended town" anchor — just outside the compound, gate facing back in
      for (const [ox, oz] of [[16, 0], [-16, 0], [0, 16], [0, -16]]) {
        if (map._isClear(c.x + ox, c.z + oz, 8)) { placeBuilding(map, 'Caravanserai', c.x + ox, c.z + oz, Math.atan2(-ox, -oz), 12); break; }
      }
    }
  });
  // one chahar-taq fire-temple pavilion landmark per map (sparse)
  if (placed.length) {
    const c = placed[placed.length - 1];
    for (const [ox, oz] of [[0, -19], [19, 0], [-19, 0], [0, 19]]) {
      if (map._isClear(c.x + ox, c.z + oz, 6)) { placeBuilding(map, 'ChaharTaq', c.x + ox, c.z + oz, rng() * 6.28318, 7); break; }
    }
  }

  // ---- Quaternius props: forge smith-quarter + caravanserai clutter + frozen villagers ----
  if (placed.length && propReady('Anvil')) {
    // first compound = Kaveh's smith-quarter (anvil, workbench, tools — the blacksmith motif)
    const sq = placed[0];
    const fy = map.heightAt(sq.x, sq.z);
    placeThing(map, 'Anvil', sq.x + 1.2, fy, sq.z + 0.6, rng() * 6.28);
    placeThing(map, 'Anvil_Log', sq.x + 1.3, fy, sq.z + 1.5, rng() * 6.28);
    placeThing(map, 'Workbench', sq.x - 1.5, fy, sq.z - 0.4, Math.PI * 0.5 + rng() * 0.4);
    placeThing(map, 'Whetstone', sq.x - 1.0, fy, sq.z + 1.3, rng() * 6.28);
    placeThing(map, 'WeaponStand', sq.x + 0.2, fy, sq.z - 1.7, rng() * 6.28);
    placeThing(map, 'Bucket_Metal', sq.x + 2.1, fy, sq.z - 0.2, rng() * 6.28);
    instanceThings(map, 'Sword_Bronze', [[sq.x + 0.45, fy, sq.z - 1.6, rng() * 6.28], [sq.x - 0.1, fy, sq.z - 1.8, rng() * 6.28]]);

    // caravanserai clutter across every compound (instanced — one draw-call group per name)
    const barrels = [], crates = [], vases = [], bags = [], produce = [];
    for (const c of placed) {
      const cy = map.heightAt(c.x, c.z);
      const near = () => [c.x + (rng() - 0.5) * 4.5, cy, c.z + (rng() - 0.5) * 4.5, rng() * 6.28];
      if (rng() < 0.9) barrels.push(near());
      if (rng() < 0.8) crates.push(near());
      if (rng() < 0.7) vases.push(near());
      if (rng() < 0.6) bags.push(near());
      if (rng() < 0.5) produce.push(near());
    }
    instanceThings(map, 'Barrel', barrels);
    instanceThings(map, 'Crate_Wooden', crates);
    instanceThings(map, 'Vase_4', vases);
    instanceThings(map, 'Bag', bags);
    instanceThings(map, 'FarmCrate_Apple', produce);
  }

  // mark ground spots near each compound for idle civilian villagers (spawned by Ambient)
  for (const c of placed) {
    for (let k = 0; k < 2; k++) {
      const a = rng() * 6.28318, rr = 2.2 + rng() * 2.6;
      const vx = c.x + Math.cos(a) * rr, vz = c.z + Math.sin(a) * rr;
      if (map._isClear(vx, vz, 1.0)) map.villagerSpots.push([vx, map.heightAt(vx, vz), vz, rng() * 6.28318]);
    }
  }
}

// River docks at non-bridge banks (Madayen / Sistan) with barrels & a ladder.
function buildDocks(map, rng) {
  if (!propReady('dock-side') || !map.river) return;
  const samples = map.river.samples;
  let built = 0;
  const maxDocks = map.place?.biome === 'river' ? 2 : 1;
  for (let i = 8; i < samples.length - 8 && built < maxDocks; i += 1) {
    const s = samples[i];
    if (map._nearRoad(s.pos.x, s.pos.z, ROAD_WIDTH)) continue; // skip bridge crossings
    if (Math.abs(s.pos.x) > WORLD_SIZE / 2 - 10 || Math.abs(s.pos.z) > WORLD_SIZE / 2 - 10) continue;
    const side = new THREE.Vector3(-s.tangent.z, 0, s.tangent.x).normalize();
    const bx = s.pos.x + side.x * (RIVER_WIDTH / 2);
    const bz = s.pos.z + side.z * (RIVER_WIDTH / 2);
    const y = s.pos.y - 0.3;
    const ry = Math.atan2(s.tangent.x, s.tangent.z);
    for (let k = -1; k <= 1; k++) {
      const dp = getProp('dock-side');
      if (!dp) continue;
      const dw = (propBase('dock-side')?.baseW || 1) * KIT_UNIT;
      dp.position.set(bx + s.tangent.x * k * dw, y, bz + s.tangent.z * k * dw);
      dp.rotation.y = ry;
      map.kitGroup.add(dp);
    }
    for (const piece of ['barrels', 'detail-crate-small', 'ladder']) {
      const pr = getProp(piece);
      if (pr) { pr.position.set(bx + (rng() - 0.5) * 1.5, y + 0.4, bz + (rng() - 0.5) * 1.5); pr.rotation.y = rng() * 6.28; map.kitGroup.add(pr); }
    }
    // Quaternius dock goods (crates/barrels/rope/buckets/produce) on the bank deck
    for (const tn of ['Crate_Wooden', 'Barrel', 'Rope_1', 'Bucket_Wooden_1', 'FarmCrate_Apple']) {
      if (rng() < 0.55) placeThing(map, tn, bx + (rng() - 0.5) * 2.4, y + 0.4, bz + (rng() - 0.5) * 2.4, rng() * 6.28);
    }
    built++;
    i += 14; // space docks apart
  }
}

// Real broken stone columns as Persepolis/Sasanian ruins, augmenting props.js' procedural ones.
function buildRuinedColumns(map, rng) {
  if (!propReady('column-damaged')) return;
  const colM = [], intactM = [], pts = [];
  let placed = 0, guard = 120;
  while (placed < 7 && guard-- > 0) {
    const x = (rng() - 0.5) * 130, z = (rng() - 0.5) * 130;
    if (!map._isClear(x, z, 8)) continue;
    const y = map.heightAt(x, z);
    (rng() < 0.7 ? colM : intactM).push(placeM4(x, y, z, rng() * Math.PI * 2));
    pts.push([x, y, z]);
    placed++;
  }
  const a = instanceProp('column-damaged', colM);
  if (a) map.kitGroup.add(a);
  const b = instanceProp('column', intactM);
  if (b) map.kitGroup.add(b);
  // weathered realistic detail beside the ruins — the single best home for photoreal props
  // (rock + deadwood beside fallen Persian columns; least style-sensitive pairing). Each guarded.
  for (let i = 0; i < pts.length && i < 3; i++) {
    const [x, y, z] = pts[i];
    const dx = i === 1 ? -1.6 : i === 2 ? 1.2 : 2.2, dz = i === 1 ? 1.6 : i === 2 ? -2.0 : 1.2;
    if (!map._clearOfFoliage(x + dx, z + dz, 1.5)) continue; // don't drop a photoreal prop into a cypress/tree
    if (i === 0) placeHeroProp(map, rng() < 0.5 ? 'namaqualand_boulder_02' : 'boulder_01', x + dx, y, z + dz, rng() * 6.28, 0.9 + rng() * 0.5, 0.2);
    else if (i === 1) placeHeroProp(map, 'tree_stump_01', x + dx, y, z + dz, rng() * 6.28, 0.9 + rng() * 0.4);
    else placeHeroProp(map, 'dead_tree_trunk_02', x + dx, y, z + dz, rng() * 6.28, 0.85 + rng() * 0.3, 0.25);
  }
}

// ---------------- Poly Haven realistic hero/detail props (CC0, downscaled) ----------------
// Weathered rock / deadwood / dry-stalk — the LEAST style-sensitive class. Placed as LOW-COUNT
// HIGH-POLY getProp CLONES (never instanced — at ~80-160k tris each, instancing a field would
// balloon into millions of tris) with tint:null (a tint would hit the tintFactor stone fall-
// through and crush the PBR to sandstone). Confined to gritty biomes, kept clear of stylized
// cypress/palm/trees via _clearOfFoliage. Hard cap per map. Gated on the kit; missing => no-op.
function heroYOff(name, s) { return -(propBase(name)?.baseY || 0) * REALISTIC_UNIT * s; }

function placeHeroProp(map, name, x, y, z, ry = 0, s = 1, tilt = 0) {
  const g = getProp(name, { unit: REALISTIC_UNIT * s, tint: null });
  if (!g) return false;
  g.position.set(x, y + heroYOff(name, s), z);
  g.rotation.set(tilt, ry, 0); // tilt pre-randomized by caller; small lean reads as found-detail
  map.kitGroup.add(g);
  return true;
}

function scatterHeroProps(map, rng) {
  if (!propReady('dead_tree_trunk') && !propReady('boulder_01') && !propReady('shrub_03')) return;
  const biome = map.place?.biome || 'plains';
  let n = 0; const CAP = 12;
  const spot = (minR) => {
    let guard = 40;
    while (guard-- > 0) {
      const x = (rng() - 0.5) * 134, z = (rng() - 0.5) * 134;
      if (map._isClear(x, z, minR) && map._clearOfFoliage(x, z, 2)) return [x, map.heightAt(x, z), z]; // not inside a cypress/palm/tree
    }
    return null;
  };
  const drop = (name, count, minR, sLo, sHi, tilt = 0) => {
    for (let i = 0; i < count && n < CAP; i++) {
      const p = spot(minR);
      if (p && placeHeroProp(map, name, p[0], p[1], p[2], rng() * 6.28, sLo + rng() * (sHi - sLo), (rng() - 0.5) * tilt)) n++;
    }
  };
  if (['mountain', 'snowpeak', 'desert'].includes(biome)) {
    drop('namaqualand_boulder_02', 3, 8, 0.8, 1.6, 0.25);
    drop('boulder_01', 2, 8, 0.7, 1.3, 0.25);
  }
  if (['mountain', 'snowpeak'].includes(biome)) {
    drop('pine_roots', 2, 7, 0.8, 1.2);            // heaviest keeper — hard cap 2
    drop('dead_tree_trunk', 2, 7, 0.8, 1.1);
  }
  if (biome === 'forest') {
    drop('dead_tree_trunk', 2, 6, 0.8, 1.1);       // green fog hides photoreal edges
    drop('dead_tree_trunk_02', 1, 6, 0.8, 1.1, 0.3);
    drop('tree_stump_01', 1, 5, 0.8, 1.2);
  }
  if (['steppe', 'desert'].includes(biome)) {
    drop('shrub_03', 4, 3, 0.7, 1.2);              // dry scrub reads least photoreal
    drop('weed_plant_02', 3, 3, 0.7, 1.2);
    drop('shrub_04', 2, 3, 0.7, 1.1);
    drop('boulder_01', 2, 8, 0.7, 1.2, 0.2);
  }
  if (['plains', 'highland'].includes(biome)) {
    drop('dandelion_01', 2, 3, 0.7, 1.1);          // photoreal dandelion: keep minimal
    drop('tree_stump_01', 1, 6, 0.8, 1.2);
  }
}

// ---------------- Quaternius Fantasy Props (things/t1) set-dressing ----------------
// CC0 inhabited-town clutter. THINGS_UNIT(1.0) + tint:null (keep the trim-sheet PBR).
// Every prop auto-lifts by -baseY*unit so off-pivot pieces (banners/torches) sit on the
// ground. All gated on the kit being loaded; missing => no-op (never-break).
function thingYOff(name) { return -(propBase(name)?.baseY || 0) * THINGS_UNIT; }

function placeThing(map, name, x, y, z, ry = 0) {
  const g = getProp(name, { unit: THINGS_UNIT, tint: null });
  if (!g) return false;
  g.position.set(x, y + thingYOff(name), z);
  g.rotation.y = ry;
  map.kitGroup.add(g);
  return true;
}

function instanceThings(map, name, placements) {
  if (!placements.length) return false;
  const yo = thingYOff(name);
  const mats = placements.map(([x, y, z, ry = 0]) => placeM4(x, y + yo, z, ry));
  const grp = instanceProp(name, mats, { unit: THINGS_UNIT, tint: null });
  if (grp) map.kitGroup.add(grp);
  return !!grp;
}

// Caravanserai bazaar: roadside stalls/carts, pottery, produce, treasury glint, torches
// (live flames), and STATIC heraldry — makes the defended town feel inhabited.
function dressMarket(map, rng) {
  if (!propReady('Stall_Empty')) return;
  // a roadside band of spots, clear of pads/citadel, facing the road
  const spots = [];
  let guard = 400;
  while (spots.length < 14 && guard-- > 0) {
    const path = map.paths[Math.floor(rng() * map.paths.length)];
    const s = path.samples[Math.floor(rng() * path.samples.length)];
    const side = rng() < 0.5 ? -1 : 1;
    const off = ROAD_WIDTH * 0.6 + 1.6 + rng() * 2.4;
    const x = s.pos.x + (-s.tangent.z * side) * off;
    const z = s.pos.z + (s.tangent.x * side) * off;
    if (!map._isClear(x, z, 3)) continue;
    if (spots.some((p) => Math.hypot(x - p.x, z - p.z) < 4.5)) continue;
    spots.push({ x, y: map.heightAt(x, z), z, ry: Math.atan2(s.pos.x - x, s.pos.z - z) });
  }
  if (!spots.length) return;

  const stalls = [], carts = [], barrels = [], crates = [], vases = [], produce = [], coins = [], chests = [];
  spots.forEach((p, i) => {
    if (i % 3 === 0) stalls.push([p.x, p.y, p.z, p.ry]);
    else if (i % 3 === 1) carts.push([p.x, p.y, p.z, p.ry]);
    else barrels.push([p.x, p.y, p.z, rng() * 6.28]);
    const near = (s) => [p.x + (rng() - 0.5) * s, p.y, p.z + (rng() - 0.5) * s, rng() * 6.28];
    if (rng() < 0.55) vases.push(near(1.8));
    if (rng() < 0.45) crates.push(near(2.0));
    if (rng() < 0.5) produce.push(near(1.6));
    if (rng() < 0.3) coins.push(near(1.2));
    if (rng() < 0.22) chests.push(near(1.6));
  });
  // Persian bazaar stalls upgrade the Quaternius Stall_Empty (gated → falls back if not loaded)
  if (propReady('MarketStall')) {
    for (const [sx, sy, sz, sry] of stalls) placeBuilding(map, 'MarketStall', sx, sz, sry, 3.0);
  } else {
    instanceThings(map, 'Stall_Empty', stalls);
  }
  instanceThings(map, 'Stall_Cart_Empty', carts);
  instanceThings(map, 'Barrel', barrels);
  instanceThings(map, 'Crate_Wooden', crates);
  instanceThings(map, 'Vase_4', vases);
  instanceThings(map, 'FarmCrate_Apple', produce);
  instanceThings(map, 'Coin_Pile', coins);
  instanceThings(map, 'Chest_Wood', chests);
  // scrolls on a couple of stalls
  instanceThings(map, rng() < 0.5 ? 'Scroll_1' : 'Scroll_2',
    stalls.slice(0, 2).map(([x, y, z, ry]) => [x + Math.cos(ry) * 0.4, y + 0.9, z + Math.sin(ry) * 0.4, ry]));
  // torch bodies instanced; live flames pushed into propFlames (game.js pulses them)
  const torchPts = [];
  for (let i = 0; i < spots.length && torchPts.length < 8; i += 2) torchPts.push(spots[i]);
  instanceThings(map, 'Torch_Metal', torchPts.map((p) => [p.x, p.y, p.z, p.ry]));
  for (const p of torchPts) {
    const fl = makeFlame(0.55);
    fl.position.set(p.x, p.y + 0.6 * THINGS_UNIT, p.z);
    map.kitGroup.add(fl);
    map.propFlames.push(fl);
  }
  // static heraldry at the band ends (rigid gltf — NOT pushed into propBanners)
  if (spots.length >= 2) {
    placeThing(map, 'Banner_1', spots[0].x, spots[0].y, spots[0].z, spots[0].ry);
    placeThing(map, 'Banner_2', spots[spots.length - 1].x, spots[spots.length - 1].y, spots[spots.length - 1].z, spots[spots.length - 1].ry);
  }
  // villager spots browsing the bazaar (a step off the stalls, facing them)
  for (let i = 0; i < spots.length && map.villagerSpots.length < 16; i += 3) {
    const p = spots[i];
    const vx = p.x + (rng() - 0.5) * 2.4, vz = p.z + (rng() - 0.5) * 2.4;
    if (map._isClear(vx, vz, 1.0)) map.villagerSpots.push([vx, map.heightAt(vx, vz), vz, p.ry + Math.PI]);
  }
}
