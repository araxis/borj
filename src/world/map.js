// Map assembly: terrain + authored roads + auto-placed tower pads + citadel + spawn
// gates + scattered props + per-biome lighting mood. Returns the GameMap used by all
// gameplay systems (paths for enemies, pads for building, heightAt for placement).
import * as THREE from 'three';
import { PLACES_BY_ID } from '../data/places.js';
import { BIOMES, makeHeightField, buildTerrain, WORLD_SIZE } from './terrain.js';
import { samplePath, buildRoadMesh, ROAD_WIDTH } from './road.js';
import { scatterProps, scatterHorizonBand, buildSpawnGate, buildPad, makeBanner, swapForestTrees, swapForestEnrich } from './props.js';
import { buildLandCitadel, citadelFootprint } from './citadels.js';
import { planRiver, buildRiverMesh, buildRiverDressing, buildBridge, buildWorldApron, RIVER_WIDTH } from './ambient.js';
import { buildBackdrop, buildMountainRing, updateBackdropForCamera } from './backdrop.js';
import { getProp, instanceProp, propReady, propBase, propRotFix, placeM4, KIT_UNIT, KIT_TINT, THINGS_UNIT, REALISTIC_UNIT, loadForestTrees, loadForestEnrich, loadZabulistanProps } from '../core/props3d.js';
import { makeFlame } from '../models/towerkit.js';
import { buildStoryLandmarks } from './landmarks.js';
import { makeRng } from './noise.js';
import { buildZabulistanVisualKit, rebuildZabulistanVisualKit } from './zabulistanVisualKit.js';
import { mergeStaticGroup } from './mergekit.js';
import { zabulistanVisualProfile } from '../data/zabulistanVisualProfile.js';

export class GameMap {
  constructor(mapDef, scene) {
    this.def = mapDef;
    this.place = PLACES_BY_ID[mapDef.id];
    const baseBiome = BIOMES[this.place?.biome || 'plains'];
    const visualProfile = zabulistanVisualProfile(mapDef.id);
    const visualBiome = visualProfile?.biome;
    this.biome = visualBiome
      ? {
        ...baseBiome,
        ...visualBiome,
        mood: { ...baseBiome.mood, ...(visualBiome.mood || {}) },
        props: { ...baseBiome.props, ...(visualBiome.props || {}) },
      }
      : baseBiome;
    // per-map prop overrides win over the biome defaults (e.g. Mazandaran zeroes cypress while
    // Manijeh Garden — same forest biome — keeps the garden sarv).
    this.effectiveProps = { ...this.biome.props, ...this.place?.props };
    // Every map gets an expanded CIRCULAR visual board (round 2 "grand board"): gameplay
    // paths/pads stay inside the old ±75 square, but the terrain now extends to r≈112 as a
    // middle-distance dressing band, and the circular path activates the sculpted
    // board-edge blend + apron mirror that only Zabulistan's authored profile used to get.
    this.visualBoard = visualProfile?.board
      ? { ...visualProfile.board }
      : { shape: 'circle', radius: 112, edgeStart: 84, apronFar: 300 };
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    const seedNum = [...mapDef.id].reduce((a, c) => a + c.charCodeAt(0), 7);
    const rng = makeRng('map:' + mapDef.id);
    const baseHeight = makeHeightField(seedNum, this.biome, {
      rimRadius: this.visualBoard?.shape === 'circle' ? this.visualBoard.radius : null,
    });

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
    this.terrain = buildTerrain(baseHeight, this.biome, flatten, this.visualBoard
      ? {
        shape: 'circle',
        radius: this.visualBoard.radius,
        edgeStart: this.visualBoard.edgeStart,
        edgeEnd: this.visualBoard.radius,
        edgeTintFogMix: this.visualBoard.edgeTintFogMix,
        edgeTintStrength: this.visualBoard.edgeTintStrength,
      }
      : {});
    this.group.add(this.terrain);

    // roads
    const roadStyle = mapDef.id === 'zabulistan'
      ? 'zabulistan'
      : ['desert', 'steppe', 'wetland'].includes(this.place?.biome) ? 'earth' : 'stone';
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
      this.waterMats.push(...buildRiverMesh(this.river, this.group));
      // round-2 river dressing: scrolling foam edges (pushed into waterMats for flow),
      // wet bank strips, stones and reed tufts along the shoreline
      this.waterMats.push(...buildRiverDressing(this.river, this.group, (x, z) => this.heightAt(x, z), {
        reeds: (this.effectiveProps?.reeds ?? 0) > 0 || ['river', 'valley', 'wetland', 'forest'].includes(this.place?.biome),
        rng,
      }));
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
    buildWorldApron(this.group, this.biome, (x, z) => this.heightAt(x, z), this.visualBoard
      ? {
        shape: 'circle',
        boardRadius: this.visualBoard.radius,
        farRadius: this.visualBoard.apronFar,
        apronGroundColor: this.visualBoard.apronGroundColor,
        apronGroundFogMix: this.visualBoard.apronGroundFogMix,
        apronNearColor: this.visualBoard.apronNearColor,
        apronNearFogMix: this.visualBoard.apronNearFogMix,
        apronFarColor: this.visualBoard.apronFarColor,
        apronFarFogMix: this.visualBoard.apronFarFogMix,
        apronFogStart: this.visualBoard.apronFogStart,
        apronFogEnd: this.visualBoard.apronFogEnd,
        apronFogMax: this.visualBoard.apronFogMax,
        apronFogLinear: this.visualBoard.apronFogLinear,
        veilInnerRadius: this.visualBoard.veilInner,
        veilOuterRadius: this.visualBoard.veilOuter,
        veilOpacity: this.visualBoard.veilOpacity,
        veilGroundColor: this.visualBoard.veilGroundColor,
        veilGroundFogMix: this.visualBoard.veilGroundFogMix,
        edgeBlendInnerRadius: this.visualBoard.edgeBlendInner,
        edgeBlendOuterRadius: this.visualBoard.edgeBlendOuter,
        edgeBlendOpacity: this.visualBoard.edgeBlendOpacity,
        edgeBlendGroundColor: this.visualBoard.edgeBlendGroundColor,
        edgeBlendMidColor: this.visualBoard.edgeBlendMidColor,
        edgeBlendOuterColor: this.visualBoard.edgeBlendOuterColor,
        edgeBlendFogMix: this.visualBoard.edgeBlendFogMix,
        edgeBlendFogStart: this.visualBoard.edgeBlendFogStart,
        edgeBlendFogEnd: this.visualBoard.edgeBlendFogEnd,
        edgeBlendGroundMix: this.visualBoard.edgeBlendGroundMix,
        edgeBlendGroundMixRange: this.visualBoard.edgeBlendGroundMixRange,
      }
      : {}); // surrounding landscape, mirrors the board surface
    this.backdrop = buildBackdrop(this.group, this.biome, mapDef.id); // manifest-backed distant scenery panorama on the horizon
    if (!this.visualBoard?.skipMountainRing) {
      buildMountainRing(this.group, this.biome, this.place?.biome || 'plains', () => this._disposed); // 3D distant range ring (real parallax)
    }

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
      if (this.visualBoard?.shape === 'circle' && Math.hypot(x, z) > this.visualBoard.radius - r) return false;
      if (Math.hypot(x - this.exitPos.x, z - this.exitPos.z) < footprint + 2 + r) return false;
      if (this._nearRoad(x, z, ROAD_WIDTH * 0.5 + r)) return false;
      if (nearRiver(x, z, RIVER_WIDTH * 0.7 + r)) return false;
      for (const pad of this.pads) if (Math.hypot(x - pad.pos.x, z - pad.pos.z) < 3 + r) return false;
      return true;
    };
    this.propsGroup = new THREE.Group();
    const propsAnim = scatterProps(rng, (x, z) => this.heightAt(x, z), isClear, this.effectiveProps, this.propsGroup, this.place?.biome || 'plains');
    if (mapDef.id === 'zabulistan') suppressZabulistanGenericScenery(this.propsGroup);
    // middle-distance dressing band on the expanded circular board (outside gameplay, inside the rim)
    if (this.visualBoard?.shape === 'circle' && this.visualBoard.radius > 88) {
      scatterHorizonBand(rng, (x, z) => this.heightAt(x, z), this.propsGroup, this.place?.biome || 'plains', this.biome, {
        rLo: 78,
        rHi: this.visualBoard.radius - 8,
        isClear,
      });
    }
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

    // signature Shahnameh story landmark + Derafsh-e Kaviani + faction war-banners
    // (after propBanners/propFlames exist: the standards push cloths/flames into them
    // so the game loop waves and pulses them like every other prop)
    buildStoryLandmarks(this, rng);

    // ---- KayKit Medieval Builder kit: the fortified Persian town fabric AROUND the
    // custom citadel (each generator is gated on the asset; null => procedural-only) ----
    this.kitGroup = new THREE.Group();
    this.group.add(this.kitGroup);
    this.villagerSpots = []; // ground points where idle civilian NPCs stand (filled by village/bazaar generators)
    this.refugePoints = []; // compound/temple doorsteps that panicking villagers run INSIDE
    this.spinners = []; // round 4: rotating set-piece parts { mesh, axis, rate } spun by the game loop
    this.movers = []; // round 4: back-and-forth walkers { group, legs, a, b, t, dir, speed } (the plough ox)
    this.chimneys = []; // round 4: rooftop smoke emitter points [x, y, z] (cook-fires of a lived-in town)
    const biome = this.place?.biome || 'plains';
    buildCurtainWall(this, rng);
    if (['plains', 'steppe', 'valley', 'river', 'desert'].includes(biome)) buildVillage(this, rng);
    if (['plains', 'steppe', 'valley', 'river', 'desert'].includes(biome)) dressMarket(this, rng);
    // round 4 A1: the living city quarter near the citadel (zabulistan has its authored kit)
    if (mapDef.id !== 'zabulistan' && ['plains', 'steppe', 'valley', 'river', 'desert', 'highland'].includes(biome)) {
      buildCityQuarter(this, rng);
    }
    if (this.river) buildDocks(this, rng);
    if (this.river && mapDef.id !== 'zabulistan') buildWaterMill(this, rng); // round 4 C1
    if (mapDef.id !== 'zabulistan' && ['plains', 'valley', 'river'].includes(biome)) buildFarmstead(this, rng); // round 4 C2
    if (mapDef.id !== 'zabulistan' && ['highland', 'mountain', 'snowpeak', 'steppe'].includes(biome)) buildOrchard(this, rng); // round 4 C5

    if (mapDef.id !== 'zabulistan' && ['desert', 'steppe', 'highland', 'plains', 'river'].includes(biome)) buildRuinedColumns(this, rng);
    if (mapDef.id !== 'zabulistan') scatterHeroProps(this, rng); // realistic weathered rock/deadwood/dry props (biome-routed, capped)
    this.zabulistanVisualKit = buildZabulistanVisualKit(this, makeRng('map:' + mapDef.id + ':visual-kit'));
    if (mapDef.id === 'zabulistan') {
      loadZabulistanProps(() => {
        if (!this._disposed) rebuildZabulistanVisualKit(this, makeRng('map:' + mapDef.id + ':visual-kit'));
      });
    }
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

  updateCameraVisuals(cameraState) {
    if (this.backdrop) updateBackdropForCamera(this.backdrop, cameraState);
  }
}

// ---------------- building-kit generators (module scope; all gated + never-break) ----------------

// A fortified curtain wall arcing in front of the citadel, with a gate where the road
// enters and stone towers at the ends — the "you defend a fortress" silhouette.
function buildCurtainWall(map, rng) {
  if (map.def?.id === 'zabulistan') return;
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
  // trees must not grow through walls: reject spots where a scattered trunk sits
  // inside the footprint (the Kabul cypress-through-the-ChaharTaq bug). Callers
  // with fallback offsets get to try the next spot.
  const keep = targetW * 0.5 + 0.8;
  if ((map._foliageSpots || []).some(([fx, fz]) => Math.hypot(x - fx, z - fz) < keep)) return false;
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
  // one chahar-taq fire-temple pavilion landmark per map (sparse), tended by mobed priests
  if (placed.length) {
    const c = placed[placed.length - 1];
    for (const [ox, oz] of [[0, -19], [19, 0], [-19, 0], [0, 19], [14, 14], [-14, 14], [14, -14], [-14, -14]]) {
      const tx = c.x + ox, tz = c.z + oz;
      if (!map._isClear(tx, tz, 6)) continue;
      if (!placeBuilding(map, 'ChaharTaq', tx, tz, rng() * 6.28318, 7)) continue; // foliage in the footprint — try the next flank
      map.refugePoints.push([tx, tz]); // the mobeds shelter inside their own temple
      // two white-robed mobeds stand watch at the sacred fire, facing the pavilion
      for (let k = 0; k < 2; k++) {
        const a = rng() * 6.28318;
        const vx = tx + Math.cos(a) * 4.3, vz = tz + Math.sin(a) * 4.3;
        if (map._isClear(vx, vz, 0.8)) {
          map.villagerSpots.push([vx, map.heightAt(vx, vz), vz, Math.atan2(tx - vx, tz - vz), 'mobed']);
        }
      }
      break;
    }
  }

  // Nowruz garlands — festival pennant strings on friendly compounds
  buildNowruzGarlands(map, rng, placed);

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
    map.refugePoints.push([c.x, c.z]); // panicking villagers bolt for the compound door
    for (let k = 0; k < 2; k++) {
      const a = rng() * 6.28318, rr = 2.2 + rng() * 2.6;
      const vx = c.x + Math.cos(a) * rr, vz = c.z + Math.sin(a) * rr;
      if (map._isClear(vx, vz, 1.0)) map.villagerSpots.push([vx, map.heightAt(vx, vz), vz, rng() * 6.28318]);
    }
  }
}

// Nowruz garlands: a sagging string of festival pennants between two poles at each
// friendly compound — the villages are celebrating, not just enduring the war.
const NOWRUZ_COL = [0xb03a2e, 0x2e7d4f, 0xd4a017, 0x5b3f8a, 0xe8e2d2];
function buildNowruzGarlands(map, rng, placed) {
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x6a5238 });
  const stringMat = new THREE.MeshLambertMaterial({ color: 0x3a3228 });
  const penGeo = new THREE.BufferGeometry();
  penGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.34, 0], 3));
  penGeo.computeVertexNormals();
  for (const c of placed) {
    if (rng() < 0.15) continue; // not every hamlet celebrates
    // find two clear pole points ~4.5u apart on the compound edge
    let p1 = null, p2 = null;
    for (let t = 0; t < 14 && !p2; t++) {
      const a = rng() * 6.28318, rr = 4.5 + rng() * 1.5;
      const x1 = c.x + Math.cos(a) * rr, z1 = c.z + Math.sin(a) * rr;
      const x2 = c.x + Math.cos(a + 0.9) * rr, z2 = c.z + Math.sin(a + 0.9) * rr;
      if (map._isClear(x1, z1, 0.5) && map._isClear(x2, z2, 0.5)) {
        p1 = new THREE.Vector3(x1, map.heightAt(x1, z1), z1);
        p2 = new THREE.Vector3(x2, map.heightAt(x2, z2), z2);
      }
    }
    if (!p2) continue;
    const g = new THREE.Group();
    const H = 3.8; // tall enough that the pennant line floats above compound walls
    for (const p of [p1, p2]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, H, 6), poleMat);
      pole.position.set(p.x, p.y + H / 2, p.z);
      g.add(pole);
    }
    const a1 = p1.clone(); a1.y += H - 0.08;
    const a2 = p2.clone(); a2.y += H - 0.08;
    const mid = a1.clone().lerp(a2, 0.5); mid.y -= 0.55; // sag
    const curve = new THREE.QuadraticBezierCurve3(a1, mid, a2);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.012, 5), stringMat));
    for (let i = 1; i <= 8; i++) {
      const pt = curve.getPoint(i / 9);
      const pen = new THREE.Mesh(penGeo, new THREE.MeshLambertMaterial({
        color: NOWRUZ_COL[(rng() * NOWRUZ_COL.length) | 0], side: THREE.DoubleSide,
      }));
      pen.position.copy(pt); pen.position.y -= 0.02;
      pen.rotation.y = Math.atan2(a2.x - a1.x, a2.z - a1.z) + Math.PI / 2;
      g.add(pen);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    map.kitGroup.add(g);
  }
}

// Round 4 A1 — the City Quarter: a real town block near the citadel approach with a
// bazaar lane, two side alleys, and a well square; buildings packed to FACE the
// streets. The board anchors on a living city instead of scattered compounds.
function buildCityQuarter(map, rng) {
  if (!propReady('MudbrickHouse')) return; // town fabric GLBs not ready → skip (never-break)
  const path = map.paths?.[0];
  if (!path) return;
  const CELL = 5.2, COLS = 6, ROWS = 5;
  const halfW = (COLS * CELL) / 2;
  // site: walk the final approach and score each flank by how clear its footprint is;
  // take the LEAST-blocked site rather than demanding a perfectly empty one (these
  // dense boards never have a fully-clear 23x20u pocket) — blocked cells just skip
  // their building later, so a mostly-clear site still yields a convincing quarter.
  let site = null, bestFree = -1;
  for (const back of [24, 30, 36, 42, 48]) {
    const s = path.samples[Math.max(0, path.samples.length - back)];
    for (const side of [1, -1]) {
      const cx = s.pos.x - s.tangent.z * side * (halfW + 8);
      const cz = s.pos.z + s.tangent.x * side * (halfW + 8);
      if (Math.hypot(cx, cz) > 66) continue;
      let free = 0;
      for (let gx = -2; gx <= 2; gx++) {
        for (let gz = -2; gz <= 2; gz++) {
          if (map._isClear(cx + gx * halfW * 0.42, cz + gz * halfW * 0.42, 2.6)) free++;
        }
      }
      if (free > bestFree) { bestFree = free; site = { cx, cz, yaw: Math.atan2(s.tangent.x, s.tangent.z) }; }
    }
  }
  if (!site || bestFree < 8) return; // even the best flank is too crowded — skip the quarter
  const { cx, cz, yaw } = site;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const toWorld = (u, v) => {
    const lx = (u - (COLS - 1) / 2) * CELL, lz = (v - (ROWS - 1) / 2) * CELL;
    return [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
  };
  // street plan: bazaar lane = middle row; alleys = columns 1 and 4; plaza = the two
  // cells north of the lane between the alleys, with the town well at their heart
  const LANE_V = 2;
  const isStreet = (u, v) => v === LANE_V || u === 1 || u === 4;
  const isPlaza = (u, v) => v === 1 && (u === 2 || u === 3);
  let housesPlaced = 0;
  for (let u = 0; u < COLS; u++) {
    for (let v = 0; v < ROWS; v++) {
      if (isStreet(u, v) || isPlaza(u, v)) continue;
      if (rng() < 0.12) continue; // the odd courtyard garden gap
      const [wx, wz] = toWorld(u, v);
      if (!map._isClear(wx, wz, 2.2)) continue; // this cell is taken (road/prop) — skip it
      // face the nearest street: the lane row first, else the nearer alley column
      const [sx, sz] = Math.abs(v - LANE_V) <= Math.min(Math.abs(u - 1), Math.abs(u - 4))
        ? toWorld(u, LANE_V) : toWorld(u < 2.5 ? 1 : 4, v);
      const ry = Math.atan2(sx - wx, sz - wz);
      if (placeBuilding(map, rng() < 0.62 ? 'MudbrickHouse' : 'BadgirHouse', wx, wz, ry, 4.6)) {
        housesPlaced++;
        if (housesPlaced === 2 || housesPlaced === 9) map.refugePoints.push([wx, wz]);
        if (rng() < 0.5) map.chimneys.push([wx, map.heightAt(wx, wz) + 4.4, wz]); // cook-fire smoke
      }
    }
  }
  if (housesPlaced < 4) return; // too few fit to read as a quarter — leave it be
  // market stalls hugging the bazaar lane's edges
  for (const [u, sideV] of [[0, 0.52], [2, -0.52], [3, 0.52], [5, -0.52]]) {
    const [wx, wz] = toWorld(u, LANE_V + sideV);
    if (!map._isClear(wx, wz, 1.6)) continue;
    const [lx, lz] = toWorld(u, LANE_V);
    placeBuilding(map, 'MarketStall', wx, wz, Math.atan2(lx - wx, lz - wz), 2.9);
  }
  // the town well at the plaza's heart (nudge to a clear spot if the center is taken)
  let [px, pz] = toWorld(2.5, 1);
  if (!map._isClear(px, pz, 1.4)) { const alt = toWorld(2.5, 2); if (map._isClear(alt[0], alt[1], 1.4)) [px, pz] = alt; }
  const py = map.heightAt(px, pz);
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a8d77 });
  const woodM = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
  const well = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.7, 10), stone);
  ring.position.y = 0.35;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.06, 10), new THREE.MeshLambertMaterial({ color: 0x2e6f86 }));
  water.position.y = 0.6;
  well.add(ring, water);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.0, 6), woodM);
    post.position.set(sx * 0.9, 1.0, 0);
    well.add(post);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.7, 4), woodM);
  roof.position.y = 2.25;
  roof.rotation.y = Math.PI / 4;
  well.add(roof);
  well.position.set(px, py, pz);
  well.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  map.kitGroup.add(well);
  // lane lanterns burning at both ends of the bazaar
  for (const u of [0, 5]) {
    const [wx, wz] = toWorld(u, LANE_V);
    const wy = map.heightAt(wx, wz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6), woodM);
    pole.position.set(wx, wy + 1.2, wz);
    pole.castShadow = true;
    map.kitGroup.add(pole);
    const fl = makeFlame(0.42);
    fl.position.set(wx, wy + 2.5, wz);
    map.group.add(fl);
    map.propFlames.push(fl);
  }
  // the quarter LIVES: villagers stand in the plaza and along the lane
  for (const [u, v] of [[2.5, 0.8], [2.9, 1.2], [1.5, LANE_V], [3.6, LANE_V], [4.6, LANE_V]]) {
    const [wx, wz] = toWorld(u, v);
    if (map._isClear(wx, wz, 0.8)) {
      map.villagerSpots.push([wx, map.heightAt(wx, wz), wz, rng() * 6.28318]);
    }
  }
  map.refugePoints.push([px, pz]);

  // ---- A2: a low mudbrick town wall rings the quarter, breached by an arched city
  // gate where the bazaar lane meets the road on each flank — the "walled town" read
  const localToWorld = (lx, lz) => [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
  const wallG = new THREE.Group();
  wallG.position.set(cx, map.heightAt(cx, cz) - 0.35, cz);
  wallG.rotation.y = yaw;
  const mud = new THREE.MeshLambertMaterial({ color: 0xb0895a });
  const mudDark = new THREE.MeshLambertMaterial({ color: 0x8a6a41 });
  const xHalf = ((COLS - 1) / 2) * CELL + CELL * 0.85;
  const zHalf = ((ROWS - 1) / 2) * CELL + CELL * 0.85;
  const WH = 2.4, TH = 0.5, gateHalf = 2.9;
  const runWall = (x0, z0, x1, z1, alongX) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.0));
    for (let i = 0; i < n; i++) {
      const mx = x0 + (x1 - x0) * (i + 0.5) / n;
      const mz = z0 + (z1 - z0) * (i + 0.5) / n;
      const [wxw, wzw] = localToWorld(mx, mz);
      if (map._nearRoad(wxw, wzw, ROAD_WIDTH * 0.8)) continue; // don't wall across the road
      const w = alongX ? (len / n) : TH, d = alongX ? TH : (len / n);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, WH, d * 0.98), mud);
      b.position.set(mx, WH / 2, mz);
      wallG.add(b);
      const mer = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.55 : TH + 0.05, 0.42, alongX ? TH + 0.05 : 0.55), mudDark);
      mer.position.set(mx, WH + 0.21, mz);
      wallG.add(mer);
    }
  };
  // top & bottom edges (full runs), left & right edges (split around the lane gate)
  runWall(-xHalf, -zHalf, xHalf, -zHalf, true);
  runWall(-xHalf, zHalf, xHalf, zHalf, true);
  for (const gx of [-xHalf, xHalf]) {
    runWall(gx, -zHalf, gx, -gateHalf, false);
    runWall(gx, gateHalf, gx, zHalf, false);
    // the arched city gate: two piers + a lintel + a peaked cap
    for (const gz of [-gateHalf, gateHalf]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.0, WH + 1.2, 1.0), mudDark);
      pier.position.set(gx, (WH + 1.2) / 2, gz);
      wallG.add(pier);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, gateHalf * 2 + 1.0), mud);
    lintel.position.set(gx, WH + 1.0, 0);
    wallG.add(lintel);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, gateHalf * 2 + 0.4), mudDark);
    cap.position.set(gx, WH + 1.6, 0);
    wallG.add(cap);
  }
  wallG.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  mergeStaticGroup(wallG); // ~120 static mudbrick boxes → 2 meshes (one per material)
  map.kitGroup.add(wallG);
}

// Round 4 C1 — a working watermill on the river: a mudbrick mill house on the bank
// and a great paddle wheel that turns in the current, flinging spray.
function buildWaterMill(map, rng) {
  const samples = map.river?.samples;
  if (!samples || samples.length < 12) return;
  const rimR = map.visualBoard?.radius ? map.visualBoard.radius - 6 : 74;
  // a mill belongs AT the water, so _isClear (which rejects everything near the river)
  // can't be used — check road/pad/citadel/board-edge only, and try both banks
  const bankOk = (bx, bz) => {
    if (Math.hypot(bx, bz) > rimR) return false;
    if (map._nearRoad(bx, bz, ROAD_WIDTH * 0.7 + 2)) return false;
    if (Math.hypot(bx - map.exitPos.x, bz - map.exitPos.z) < map._footprint + 4) return false;
    for (const pad of map.pads) if (Math.hypot(bx - pad.pos.x, bz - pad.pos.z) < 4.5) return false;
    return true;
  };
  let s = null, side = null;
  for (const frac of [0.32, 0.5, 0.64, 0.42, 0.72, 0.24, 0.8]) {
    const cand = samples[Math.floor(samples.length * frac)];
    if (!cand || map._nearRoad(cand.pos.x, cand.pos.z, 11)) continue;
    const sl = Math.hypot(cand.tangent.z, cand.tangent.x) || 1;
    for (const dir of [1, -1]) {
      const nx = (-cand.tangent.z / sl) * dir, nz = (cand.tangent.x / sl) * dir;
      const bx = cand.pos.x + nx * (RIVER_WIDTH / 2 + 2.4), bz = cand.pos.z + nz * (RIVER_WIDTH / 2 + 2.4);
      if (bankOk(bx, bz)) { s = cand; side = new THREE.Vector3(nx, 0, nz); break; }
    }
    if (s) break;
  }
  if (!s) return;
  const bankX = s.pos.x + side.x * (RIVER_WIDTH / 2 + 2.4);
  const bankZ = s.pos.z + side.z * (RIVER_WIDTH / 2 + 2.4);
  const bankY = map.heightAt(bankX, bankZ);
  const mud = new THREE.MeshLambertMaterial({ color: 0xb0895a });
  const mudDark = new THREE.MeshLambertMaterial({ color: 0x8a6a41 });
  const woodM = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
  const bankYaw = Math.atan2(side.x, side.z);
  // mill house
  const house = new THREE.Group();
  house.position.set(bankX, bankY, bankZ);
  house.rotation.y = bankYaw;
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.0, 3.0), mud);
  body.position.y = 1.5;
  house.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.4, 4), mudDark);
  roof.position.y = 3.7; roof.rotation.y = Math.PI / 4;
  house.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.1), woodM);
  door.position.set(0, 0.8, 1.51);
  house.add(door);
  house.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  map.kitGroup.add(house);
  map.chimneys.push([bankX, bankY + 4.2, bankZ]); // the miller's hearth
  // the paddle wheel, hung over the water on an axle from the mill wall
  const R = 1.9;
  const wcx = s.pos.x + side.x * (RIVER_WIDTH / 2 - 0.2);
  const wcz = s.pos.z + side.z * (RIVER_WIDTH / 2 - 0.2);
  const waterY = s.pos.y - 0.32;
  const mount = new THREE.Group();
  mount.position.set(wcx, waterY + R * 0.72, wcz); // bottom of the wheel dips into the flow
  mount.rotation.y = bankYaw;
  const wheel = new THREE.Group();
  for (const zz of [-0.45, 0.45]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.09, 6, 20), woodM);
    rim.position.z = zz;
    wheel.add(rim);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 6), mudDark);
  axle.rotation.x = Math.PI / 2;
  wheel.add(axle);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, R * 2, 0.08), woodM);
    spoke.rotation.z = a; wheel.add(spoke);
    // paddle board on the rim
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 1.0), mudDark);
    pad.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    pad.rotation.z = a; wheel.add(pad);
  }
  wheel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  mount.add(wheel);
  map.group.add(mount);
  map.spinners.push({ mesh: wheel, axis: 'z', rate: -0.7 });
  // flour sacks by the door + a miller's spot
  const sackM = [];
  for (let i = 0; i < 4; i++) {
    const a = bankYaw + Math.PI, r = 2.0 + rng() * 0.6;
    const sx = bankX + Math.cos(a + (rng() - 0.5)) * r, sz = bankZ + Math.sin(a + (rng() - 0.5)) * r;
    sackM.push([sx, map.heightAt(sx, sz), sz]);
  }
  for (const [sx, sy, sz] of sackM) {
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.32, 7, 5), new THREE.MeshLambertMaterial({ color: 0xd8c8a0 }));
    sack.scale.set(1, 0.85, 1);
    sack.position.set(sx, sy + 0.25, sz);
    sack.castShadow = true;
    map.kitGroup.add(sack);
  }
  const mx = bankX + Math.cos(bankYaw + Math.PI) * 1.6, mz = bankZ + Math.sin(bankYaw + Math.PI) * 1.6;
  if (map._isClear(mx, mz, 0.8)) map.villagerSpots.push([mx, map.heightAt(mx, mz), mz, bankYaw]);
}

// Round 4 C2 — a working farmstead: plowed furrows, haystacks, a scarecrow, and an
// ox plodding the field pulling a plough (the ox is a map.mover the game loop walks).
function buildFarmstead(map, rng) {
  // a clear patch off the road for the field (~14x11)
  let cx, cz, found = false;
  for (let tries = 0; tries < 36 && !found; tries++) {
    const a = rng() * 6.28318, r = 20 + rng() * 34;
    cx = Math.cos(a) * r; cz = Math.sin(a) * r;
    if (map._isClear(cx, cz, 9) && (!map._clearOfFoliage || map._clearOfFoliage(cx, cz, 9))) found = true;
  }
  if (!found) return;
  const yaw = rng() * 6.28318, cos = Math.cos(yaw), sin = Math.sin(yaw);
  const cy = map.heightAt(cx, cz);
  const L2W = (lx, lz) => [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
  const soil = new THREE.MeshLambertMaterial({ color: 0x5a4630 });
  const soilLt = new THREE.MeshLambertMaterial({ color: 0x6e5638 });
  const straw = new THREE.MeshLambertMaterial({ color: 0xc9a24a });
  const woodM = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
  const field = new THREE.Group();
  // tilled bed + parallel furrow ridges running along local X
  const bed = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 11), soil);
  bed.position.set(cx, cy + 0.06, cz); bed.rotation.y = yaw; bed.receiveShadow = true;
  field.add(bed);
  for (let i = -4; i <= 4; i++) {
    const [rx, rz] = L2W(0, i * 1.15);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.16, 0.42), soilLt);
    ridge.position.set(rx, cy + 0.14, rz); ridge.rotation.y = yaw; ridge.receiveShadow = true;
    field.add(ridge);
  }
  // haystacks at a corner
  for (let i = 0; i < 3; i++) {
    const [hx, hz] = L2W(6.2 - i * 1.5, 6.0 + (i % 2) * 1.2);
    const hay = new THREE.Mesh(new THREE.ConeGeometry(1.0 - i * 0.12, 1.6 - i * 0.15, 8), straw);
    hay.position.set(hx, map.heightAt(hx, hz) + (0.8 - i * 0.07), hz); hay.castShadow = true;
    field.add(hay);
  }
  // scarecrow at the field's heart
  const [scx, scz] = L2W(-2, 0);
  const scy = map.heightAt(scx, scz);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 5), woodM);
  post.position.set(scx, scy + 1.1, scz);
  const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), woodM);
  arms.position.set(scx, scy + 1.7, scz); arms.rotation.z = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), straw);
  head.position.set(scx, scy + 2.2, scz);
  const smock = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.15), new THREE.MeshLambertMaterial({ color: 0x8a4a3a }));
  smock.position.set(scx, scy + 1.5, scz);
  for (const m of [post, arms, head, smock]) { m.castShadow = true; field.add(m); }
  field.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });
  map.kitGroup.add(field);
  mergeStaticGroup(field, [head]); // furrows/hay/scarecrow collapse; keep parts intact enough

  // the ox + plough, plodding along the outer furrow line
  const ox = new THREE.Group();
  const hide = new THREE.MeshLambertMaterial({ color: 0x8a7256 });
  const hideDk = new THREE.MeshLambertMaterial({ color: 0x5c4a34 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.5), hide);
  body.position.y = 0.85; ox.add(body);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.34, 7, 6), hide);
  hump.position.set(0, 1.2, 0.35); hump.scale.set(1, 0.7, 1); ox.add(hump);
  const headO = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.5), hide);
  headO.position.set(0, 0.9, 1.0); ox.add(headO);
  for (const sx of [-0.16, 0.16]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 5), hideDk);
    horn.position.set(sx, 1.15, 1.05); horn.rotation.z = sx > 0 ? -0.5 : 0.5; ox.add(horn);
  }
  const legs = [];
  for (const lx of [-0.24, 0.24]) for (const lz of [-0.5, 0.5]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.85, 5), hideDk);
    leg.position.set(lx, 0.42, lz); leg.geometry.translate(0, -0.42, 0); leg.position.y = 0.85;
    ox.add(leg); legs.push(leg);
  }
  // the plough dragged behind
  const plough = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5), woodM);
  beam.rotation.x = Math.PI / 2.4; beam.position.set(0, 0.55, -0.9); plough.add(beam);
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 4), hideDk);
  blade.rotation.x = -1.9; blade.position.set(0, 0.18, -1.5); plough.add(blade);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4), woodM);
  handle.rotation.x = 0.6; handle.position.set(0, 0.7, -1.7); plough.add(handle);
  ox.add(plough);
  ox.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  map.group.add(ox);
  const [ax, az] = L2W(-6, -3.5), [bx, bz] = L2W(6, -3.5); // a furrow line, ox faces +local-X
  map.movers.push({ group: ox, legs, a: { x: ax, z: az }, b: { x: bx, z: bz }, t: rng(), dir: 1, speed: 0.09 });
  // a farmer works the field
  const [fx, fz] = L2W(-6.6, -3.5);
  if (map._isClear(fx, fz, 0.8)) map.villagerSpots.push([fx, map.heightAt(fx, fz), fz, yaw]);
}

// Round 4 C5 — a terraced orchard/vineyard for the highland & mountain maps (which
// skip the farm/mill/dock): stepped stone terraces, rows of small fruit trees, a
// picker's spot and fruit baskets. All static → merged.
function buildOrchard(map, rng) {
  let cx, cz, found = false;
  for (let tries = 0; tries < 36 && !found; tries++) {
    const a = rng() * 6.28318, r = 22 + rng() * 32;
    cx = Math.cos(a) * r; cz = Math.sin(a) * r;
    if (map._isClear(cx, cz, 9) && (!map._clearOfFoliage || map._clearOfFoliage(cx, cz, 9))) found = true;
  }
  if (!found) return;
  const yaw = rng() * 6.28318, cos = Math.cos(yaw), sin = Math.sin(yaw);
  const L2W = (lx, lz) => [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a8d77 });
  const woodM = new THREE.MeshLambertMaterial({ color: 0x5a3f26 });
  const leaf = new THREE.MeshLambertMaterial({ color: 0x4e7038 });
  const leaf2 = new THREE.MeshLambertMaterial({ color: 0x628544 });
  const fruit = new THREE.MeshLambertMaterial({ color: 0xb43a2e });
  const orch = new THREE.Group();
  const ROWS = 3, COLS = 4, RSTEP = 3.2, CSTEP = 2.9;
  for (let r = 0; r < ROWS; r++) {
    const lz = (r - (ROWS - 1) / 2) * RSTEP;
    // low retaining wall behind each row
    const [wx, wz] = L2W(0, lz - 1.2);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(COLS * CSTEP + 1.5, 0.55, 0.4), stone);
    wall.position.set(wx, map.heightAt(wx, wz) + 0.25, wz); wall.rotation.y = yaw;
    orch.add(wall);
    for (let c = 0; c < COLS; c++) {
      const lx = (c - (COLS - 1) / 2) * CSTEP + (rng() - 0.5) * 0.4;
      const [tx, tz] = L2W(lx, lz + (rng() - 0.5) * 0.4);
      const ty = map.heightAt(tx, tz);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.0, 5), woodM);
      trunk.position.set(tx, ty + 0.5, tz);
      const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), rng() < 0.5 ? leaf : leaf2);
      canopy.position.set(tx, ty + 1.5, tz);
      orch.add(trunk, canopy);
      // a few fruit dots
      for (let f = 0; f < 3; f++) {
        const fd = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), fruit);
        fd.position.set(tx + (rng() - 0.5) * 1.2, ty + 1.2 + rng() * 0.6, tz + (rng() - 0.5) * 1.2);
        orch.add(fd);
      }
    }
  }
  // fruit baskets at the low corner
  for (let i = 0; i < 3; i++) {
    const [bx, bz] = L2W((COLS - 1) / 2 * CSTEP + 1.2, (ROWS - 1) / 2 * RSTEP + 0.5 - i * 0.9);
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.34, 8), new THREE.MeshLambertMaterial({ color: 0x9a6a38 }));
    basket.position.set(bx, map.heightAt(bx, bz) + 0.17, bz);
    const heap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 5), fruit);
    heap.position.set(bx, map.heightAt(bx, bz) + 0.36, bz); heap.scale.y = 0.6;
    orch.add(basket, heap);
  }
  orch.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  mergeStaticGroup(orch);
  map.kitGroup.add(orch);
  // a picker works the rows
  const [fx, fz] = L2W(-(COLS - 1) / 2 * CSTEP - 1.4, 0);
  if (map._isClear(fx, fz, 0.8)) map.villagerSpots.push([fx, map.heightAt(fx, fz), fz, yaw]);
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
    // round 4 C3: fishing life — a fisherman on the deck facing the water + a drying net
    if (built === 0) {
      const fx = bx + side.x * 0.7, fz = bz + side.z * 0.7; // out on the deck toward the river
      map.villagerSpots.push([fx, y + 0.4, fz, Math.atan2(s.pos.x - fx, s.pos.z - fz)]);
      const woodM = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
      const rack = new THREE.Group();
      for (const px of [-1.0, 1.0]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 5), woodM);
        post.position.set(px, 0.8, 0);
        rack.add(post);
      }
      const net = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.1, 7, 4), new THREE.MeshBasicMaterial({ color: 0x2f3a2c, wireframe: true }));
      net.position.set(0, 0.95, 0); net.rotation.x = 0.18;
      rack.add(net);
      const nx = bx + side.x * 2.6, nz = bz + side.z * 2.6; // on the bank behind the deck
      rack.position.set(nx, map.heightAt(nx, nz), nz);
      rack.rotation.y = ry;
      rack.traverse((o) => { if (o.isMesh && !o.material.wireframe) { o.castShadow = true; o.receiveShadow = true; } });
      map.kitGroup.add(rack);
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

function suppressZabulistanGenericScenery(root) {
  root.visible = false;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.visible = false;
  });
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
