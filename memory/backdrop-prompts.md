# Borj — Per-Stage Horizon Backdrops (plan + image spec)

> **STATUS (updated 2026-06-20):** the image-backed backdrop layer is LIVE again, but not as the old
> unsafe flat/cylindrical plane. It is now a manifest-backed `DistantBackdrop` system:
> `src/data/backdrops.js` declares all 20 campaign maps; `src/world/backdrop.js` builds inward-facing
> curved quadrant bands for `far` and `mid` image layers plus procedural haze; files live under
> `public/assets/backdrops/<placeId>/far_n.webp`, `far_e.webp`, `far_s.webp`, `far_w.webp`,
> `mid_n.webp`, `mid_e.webp`, `mid_s.webp`, `mid_w.webp`. The procedural world apron and 3D range
> ring remain as fallback/foreground depth.

Runtime rules now in force:
- All backdrop meshes are no-shadow (`castShadow=false`, `receiveShadow=false`), `depthWrite=false`,
  low-opacity, and tagged `userData.visualLayer = "backdrop"`.
- Missing manifest entries must never request missing files or create 404 noise.
- Backdrops are scenery only: no clickable-looking foreground objects, no European fantasy castles,
  no monsters, no gameplay objects, and no intersection with roads/pads/palace gates.
- Contrast stays below gameplay contrast so towers, enemies, paths, pads, palace gates, and saga chips
  remain readable.
- `window.__dbg.visualQa.state('backdropSweep', { mapId })` plus `metrics()/overflow()/backdrops()`
  is the live QA path.

Goal: kill the "board floating in white" by surrounding each level with its own distinctive DISTANT
scenery. The procedural **world apron** (rolling hills → fog horizon) is already shipped and fixes the
floating; this backdrop layer adds the rich, level-specific far environment on top.

## How it renders (built, validated as a single cylinder; 4-arc upgrade pending real images)
- A large inward-facing **cylinder** (`src/world/backdrop.js`) sits between the skydome and the apron.
  Its TOP fades into the sky; its BOTTOM is occluded by the apron hills. It stays fixed (not camera-
  locked) so panning gives gentle parallax → real depth. Lazy-loaded per stage; never-break (no image
  → just the apron).
- A single image wrapped 360° stretches ~6× — unusable. So the ring is **4 quadrants** (N/E/S/W), each
  an ultra-wide image on a 90° arc → no stretch. (This is your 4-images idea, and it's the right call.)

## The image spec (every backdrop image)
- **4 images per stage**, named `<id>_n / _e / _s / _w` (the four 90° directions of a 360° surround).
- **Ultra-wide** each, ~**16:5** aspect (e.g. 2560×800). Export webp/jpg → `public/assets/backdrops/`.
- Content = **DISTANT scenery ONLY**: far mountains / the broader landscape / sky. **No foreground, no
  close buildings, no people, no ground detail** — the game board is the foreground.
- **Sky in the top third** (it fades into the game sky). **Distant land/mountains in the lower portion**
  (sits just above the apron hills). Keep a **consistent horizon line height** across all 4.
- **Hazy, atmospheric distance** — soft, desaturated toward the horizon. This both reads as "far away"
  AND forgives the seams where the 4 images meet.
- **Same palette + lighting + time-of-day across the 4** so they connect into one continuous 360°.
- Style to match the game: **stylized realism, faceted, warm Persian / Shahnameh palette, NOT photoreal,
  NOT European fantasy**, no text, no border/frame.

## Per-stage distant environment (the 4 images each show this, rotated around)
1. Zabulistan — dry Sistani highland ranges, layered ochre mountains, dusty haze
2. Sistan — vast flat reed-marsh plain, shimmering water channels to the horizon, low dunes
3. Kabul — green river valley, terraced foothills, distant white-blue Hindu Kush peaks
4. Samangan — open warm steppe, soft rolling grass hills, distant low ranges at dusk
5. Dez-e Sepid — pale rocky highland, white-grey crags, bright thin air
6. Mazandaran — dark misty forest hills, fog banks, dense Caspian woodland silhouettes
7. Alborz — colossal snow-capped Alborz peaks towering all around, above the clouds
8. Damavand — the single great snow cone of Mt Damavand dominating, black volcanic ridges, snow
9. Siyavash Gate — twilight ritual plain, distant fire-glow on the horizon, dim valleys
10. Turan — wide foreign steppe, distant Turanian cavalry-country, dust and lapis dusk sky
11. Balkh — old caravan plain, distant domed city skyline, dry warm haze
12. Dez-e Roein — hard iron-grey mountains, metallic overcast, stark ridges
13. Manijeh Garden — lush green river-garden country, willows + water, soft moonlit-blue distance
14. Makran — harsh sun-baked desert, dunes + barren rock mesas, heat shimmer
15. Estakhr — ancient stone plateau, distant carved cliffs (Naqsh-e Rostam feel), gold dusk
16. Gordafarid Fort — rugged frontier highland, sharp defensive ridges, banners-of-war sky
17. Madayen / Ctesiphon — flat Mesopotamian river plain, the Tigris, distant great-arch city, golden
18. Arash Watch — vast mountain-border panorama, immense valley between two ranges (Iran↔Turan)
19. Dez-e Bahman — cold Kayanian highland, frost-blue ranges, stiff banners, pale winter sky
20. Gang-Dez — mythic far-Turan, layered impossible mountains + a distant wondrous golden citadel

## Sample full prompts (validate ONE of these first)

### Mazandaran (one of the 4; repeat rotated for n/e/s/w)
```
Stylized realism, faceted, NOT photoreal, NOT European fantasy: an ultra-wide panoramic view (16:5) of DISTANT scenery only — layered dark misty Caspian forest hills receding into fog banks, dense woodland silhouettes, an uncanny green-grey haze, brooding overcast Persian sky in the upper third. No foreground, no buildings, no people, no ground detail — only far hills and sky. Soft, desaturated, atmospheric distance; consistent low horizon line. Warm-cool Shahnameh palette of moss green, slate, fog white, faint sickly green light. No text, no frame.
```

### Damavand (one of the 4)
```
Stylized realism, faceted, NOT photoreal, NOT European fantasy: an ultra-wide panoramic view (16:5) of DISTANT scenery only — the single colossal snow-capped cone of Mount Damavand dominating the skyline among black volcanic ridges and snowfields, cold clear high-altitude Persian sky in the upper third. No foreground, no buildings, no people — only far mountains and sky. Crisp but atmospheric distance, consistent horizon line. Palette of black basalt, white snow, ice-blue, pale gold light. No text, no frame.
```

## Full paste-ready prompts (generate 4 per stage — n/e/s/w = 4 rotated views, same palette/light/horizon)
Mazandaran VALIDATED 2026-06-15 (4 × ~230 KB jpg; integrates perfectly). Each line below is the SUBJECT;
prepend the preamble. Save `<id>_n/_e/_s/_w.jpg` → `public/assets/backdrops/`.

**Preamble (every image):** `Stylized realism, faceted, NOT photoreal, NOT European fantasy: an ultra-wide panoramic view (16:5) of DISTANT scenery only — no foreground, no near buildings, no people, no ground detail. Sky in the top third, far land/mountains lower, consistent horizon line, soft hazy atmospheric distance, no text, no frame. SUBJECT:`

1. **zabulistan** — dry Sistani highland: layered ochre and sand-gold mountain ranges receding into dusty haze under a pale daytime blue sky; olive scrub on far slopes.
2. **sistan** — a vast flat reedland plain: shimmering water channels and low dunes stretching to the horizon, reed-gold and teal, hot pale shimmering sky.
3. **kabul** — a green river valley walled by terraced foothills, distant white-blue Hindu Kush snow-peaks on the horizon, clear bright sky.
4. **samangan** — open warm steppe: soft rolling grass hills fading to low distant ranges at golden dusk, amber light.
5. **dez-sepid** — pale rocky highland: white-grey crags and bright bare ridges in thin clear high air, cool blue sky.
6. **mazandaran** — DONE: dark misty Caspian forest hills receding into fog banks, dense woodland silhouettes, sickly green-grey haze, brooding overcast sky.
7. **alborz** — colossal snow-capped Alborz peaks towering all around above a sea of clouds, granite and ice-blue, cold clear sky with golden light.
8. **damavand** — the single great snow cone of Mount Damavand dominating the skyline among black volcanic ridges and snowfields, cold clear high-altitude sky.
9. **siyavash-gate** — a twilight ritual plain: dim violet valleys with a distant orange fire-glow low on the horizon, dusk sky deepening to indigo.
10. **turan** — a wide foreign steppe of distant cavalry-country, dust and low ranges under a lapis-blue and dark-crimson dusk sky.
11. **balkh** — an old dry caravan plain with a distant domed city skyline (turquoise domes) faint on the horizon, warm sandy haze.
12. **dez-roein** — hard iron-grey mountains and stark metallic ridges under a cold overcast sky, gunmetal and slate.
13. **manijeh-garden** — lush green river-garden country: willows, water and soft meadows fading to a moonlit-blue distance, turquoise water glints.
14. **makran** — harsh sun-baked desert: rolling dunes and barren rock mesas in heat shimmer to the horizon, sun-bleached ochre under a white-hot pale sky.
15. **estakhr** — an ancient stone plateau with distant carved cliff-faces (Naqsh-e Rostam feel) and tablelands under warm gold dusk light.
16. **gordafarid-fort** — rugged frontier highland with sharp defensive ridges and crags, dramatic windswept war-clouds, grey-gold stone.
17. **madayen** — a flat Mesopotamian river plain: the broad Tigris winding past a distant great-arch brick city skyline on the horizon, golden warm light.
18. **arash-watch** — an immense mountain-border panorama: a vast valley between two great snow ranges receding forever, cool bronze haze, deep blue sky.
19. **dez-bahman** — cold Kayanian highland: frost-blue mountain ranges and snow-dusted ridges under a pale flat winter sky.
20. **gang-dez** — mythic far-Turan: layered impossible jagged mountains with a distant wondrous golden many-domed citadel faint on the far horizon, lapis sky, dreamlike.

## Integration (per stage, fast)
Drop the 4 jpgs in `public/assets/backdrops/` → add one line to `BACKDROP_FILES` in `src/world/backdrop.js`
(`<id>: ['assets/backdrops/<id>_n.jpg', ...]`). Never-break: a stage with no entry just shows the apron. See [[palace-system]].
