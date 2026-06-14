#!/usr/bin/env python3
"""Downscale + copy the user-supplied nature/n2 (stylized) and the 10 curated Poly Haven
realistic hero props into public/assets/. Raw drop is ~1.3 GB of 4K textures; this brings
the added deploy to ~30 MB. See memory/progress.md.

Rules:
- n2: copy each gltf + its .bin verbatim; copy only REFERENCED textures (auto-drops the
  unreferenced PalmTree/PineTree/Rocks/Leaves_BW). Bark normals -> 512 PNG (lossless, no
  gltf uri edit). Bark diffuse -> 1024 JPG. Leaf/flower/grass alpha PNGs kept (alpha is
  load-bearing) at <=1024 / 512.
- Poly Haven: copy the model folder (gltf + bin + textures/) then resize the textures IN
  PLACE at the same filename (no gltf edit). diff/nor 1024 (rocks/deadwood) or 512 (small
  dry), arm 512. Only the 10 keepers; the huge leafy trees (t1/t2/t3/t12) and n3 are skipped.
"""
import json, shutil
from pathlib import Path
from PIL import Image, ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'atlases'
DST = ROOT / 'public' / 'assets'


def fit(im, cap):
    w, h = im.size
    if max(w, h) > cap:
        s = cap / max(w, h)
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    return im


def save_jpg(im, path, q=88):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.convert('RGB').save(path, 'JPEG', quality=q, optimize=True)


def save_png(im, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, 'PNG', optimize=True)


def folder_mb(p):
    return sum(f.stat().st_size for f in Path(p).rglob('*') if f.is_file()) / 1e6


# ---------------- n2 (stylized Quaternius) ----------------
n2s, n2d = SRC / 'nature' / 'n2', DST / 'nature' / 'n2'
n2d.mkdir(parents=True, exist_ok=True)
ref_imgs, ref_bins = {}, set()
gltfs = sorted(n2s.glob('*.gltf'))
for g in gltfs:
    shutil.copy2(g, n2d / g.name)
    d = json.loads(g.read_text(encoding='utf-8'))
    for im in d.get('images', []):
        u = im.get('uri')
        if u and not u.startswith('data:'):
            ref_imgs[u] = n2s / u
    for b in d.get('buffers', []):
        u = b.get('uri')
        if u and not u.startswith('data:'):
            ref_bins.add(u)
for u in ref_bins:
    shutil.copy2(n2s / u, n2d / u)
for u, sp in sorted(ref_imgs.items()):
    low = u.lower()
    dp = n2d / u
    im = Image.open(sp)
    if low.endswith('_bark_normal.png'):
        save_png(fit(im, 512), dp)            # lossless normal, no uri change
    elif low.endswith('_bark.jpg'):
        save_jpg(fit(im, 1024), dp)
    elif low == 'grass.png':
        save_png(fit(im, 512), dp)
    elif low.endswith('.png'):                # leaves / flowers / masks: preserve alpha
        save_png(fit(im, 1024), dp)
    else:
        save_jpg(fit(im, 1024), dp)
print(f'n2: {len(gltfs)} gltf, {len(ref_bins)} bin, {len(ref_imgs)} textures -> {folder_mb(n2d):.1f} MB')

# ---------------- Poly Haven realistic keepers ----------------
# rel -> diff/nor cap (rocks & deadwood get 1024; small dry props 512; arm always 512)
POLY = {
    'rocks/r1': 1024, 'rocks/r2': 1024,
    'trees/t8': 1024, 'trees/t9': 1024, 'trees/t10': 1024, 'trees/t11': 1024,
    'trees/t4': 512, 'trees/t5': 512, 'trees/t6': 512, 'trees/t7': 512,
}
for rel, cap in POLY.items():
    s, d = SRC / rel, DST / rel
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(s, d)
    tex = d / 'textures'
    if tex.exists():
        for jpg in sorted(tex.glob('*.jpg')):
            c = 512 if '_arm' in jpg.name.lower() else cap
            save_jpg(fit(Image.open(jpg), c), jpg)
    print(f'  {rel}: {folder_mb(d):.1f} MB')

print(f'TOTAL added: n2 {folder_mb(n2d):.1f} MB + rocks {folder_mb(DST/"rocks"):.1f} MB + trees {folder_mb(DST/"trees"):.1f} MB')
