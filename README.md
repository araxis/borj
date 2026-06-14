# Borj — Shahnameh Tower Defense

A browser-based 3D tower-defense game rooted in ancient Persian/Iranian epic culture and
Ferdowsi's *Shahnameh*. Defend mythic cities, fortresses, and caravan roads with 32 tower
lines, 36 hero-commanders, 30 ledger-faithful adversaries, soldier squads, tower fusion,
destructible architecture, procedural Persian-inspired audio, random wave modifiers,
difficulty modes, and a bilingual **EN / فارسی** (RTL) interface — fully offline after load,
no plugins.

Built with [Three.js](https://threejs.org) and [Vite](https://vitejs.dev). Vanilla JS, no
framework. *Borj* (برج) means "tower".

## Run locally

```bash
npm install
npm run dev      # http://localhost:5180
```

## Build

```bash
npm run build    # static output in dist/ (all paths relative — works on any static host)
npm run preview  # serve the production build locally
```

## Deploy (GitHub Pages)

Pushing to `main` triggers the workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds with Vite and publishes `dist/` to GitHub Pages automatically. Enable Pages once
under **Settings → Pages → Source: GitHub Actions**.

## Content

The lore ledgers in the project root — [`heroes-atlas.md`](heroes-atlas.md),
[`enemies-atlas.md`](enemies-atlas.md), [`places-atlas.md`](places-atlas.md) — are the
authoritative source for every hero, enemy, and place.

## Credits & licenses

All third-party assets are free-licensed and bundled locally (no runtime downloads). See
[`CREDITS.md`](CREDITS.md) for full attribution (KayKit, Quaternius, Poly Haven, ambientCG,
Kevin MacLeod, Meshy.ai, and others).
