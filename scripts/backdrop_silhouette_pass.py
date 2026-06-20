from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path("public/assets/backdrops")
DIRS = ["n", "e", "s", "w"]
SIZE_FAR = (2048, 640)
SIZE_MID = (2048, 512)
FULL_REBUILD = "--full" in sys.argv
REQUESTED_MAPS = [arg for arg in sys.argv[1:] if not arg.startswith("--")]

MAP_ART = {
    "zabulistan": {"motif": "champion_keep", "color": (58, 49, 39), "strength": 0.46},
    "sistan": {"motif": "reedland", "color": (45, 65, 54), "strength": 0.44},
    "kabul": {"motif": "palace_garden", "color": (71, 55, 44), "strength": 0.4},
    "samangan": {"motif": "night_palace", "color": (56, 44, 50), "strength": 0.42},
    "dez-sepid": {"motif": "white_gate", "color": (74, 75, 70), "strength": 0.42},
    "mazandaran": {"motif": "forest_fog", "color": (38, 63, 51), "strength": 0.36},
    "alborz": {"motif": "simurgh_height", "color": (56, 69, 77), "strength": 0.42},
    "damavand": {"motif": "chains_mountain", "color": (55, 64, 76), "strength": 0.45},
    "siyavash-gate": {"motif": "fire_trial", "color": (84, 48, 32), "strength": 0.48},
    "turan": {"motif": "war_court", "color": (63, 45, 35), "strength": 0.45},
    "balkh": {"motif": "royal_city", "color": (72, 52, 40), "strength": 0.5},
    "dez-roein": {"motif": "iron_fort", "color": (48, 52, 58), "strength": 0.48},
    "manijeh-garden": {"motif": "hidden_garden", "color": (40, 62, 45), "strength": 0.38},
    "makran": {"motif": "frontier_caravan", "color": (75, 51, 34), "strength": 0.5},
    "estakhr": {"motif": "stone_terraces", "color": (74, 55, 43), "strength": 0.48},
    "gordafarid-fort": {"motif": "spear_fort", "color": (61, 54, 45), "strength": 0.46},
    "madayen": {"motif": "great_arch", "color": (70, 53, 41), "strength": 0.44},
    "arash-watch": {"motif": "border_watch", "color": (52, 58, 62), "strength": 0.48},
    "dez-bahman": {"motif": "cold_fort", "color": (58, 66, 78), "strength": 0.44},
    "gang-dez": {"motif": "gang_dez", "color": (62, 43, 35), "strength": 0.48},
}


def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))


def alpha_for(strength, mult=1.0):
    return clamp(115 * strength * mult)


def draw_wall(draw, x, y, w, h, color, a):
    draw.rectangle([x, y, x + w, y + h], fill=(*color, a))
    for k in range(0, int(w), 48):
        draw.rectangle([x + k, y - 10, x + k + 22, y], fill=(*color, int(a * 0.9)))


def draw_tower(draw, x, y, w, h, color, a, dome=False):
    draw.rectangle([x, y - h, x + w, y], fill=(*color, a))
    if dome:
        draw.pieslice([x - w * 0.18, y - h - w * 0.55, x + w * 1.18, y - h + w * 0.55], 180, 360, fill=(*color, a))
    else:
        draw.polygon([(x, y - h), (x + w * 0.5, y - h - w * 0.45), (x + w, y - h)], fill=(*color, a))


def draw_flag(draw, x, y, color, a, scale=1.0):
    h = 78 * scale
    draw.line([x, y, x, y - h], fill=(*color, a), width=max(2, int(4 * scale)))
    draw.polygon([(x, y - h), (x + 48 * scale, y - h + 12 * scale), (x, y - h + 24 * scale)], fill=(*color, int(a * 0.82)))


def draw_citadel(draw, cx, base, color, strength, width=360, domes=False, flags=True):
    a = alpha_for(strength)
    x = cx - width / 2
    draw_wall(draw, x, base - 34, width, 34, color, a)
    draw_tower(draw, x + 30, base - 34, 56, 104, color, a, dome=domes)
    draw_tower(draw, x + width - 88, base - 34, 58, 116, color, a, dome=domes)
    draw_tower(draw, cx - 38, base - 34, 76, 138, color, int(a * 1.05), dome=domes)
    draw.rectangle([cx - 22, base - 62, cx + 22, base], fill=(*color, int(a * 0.74)))
    if flags:
        draw_flag(draw, x + 92, base - 122, color, int(a * 0.9), 0.65)
        draw_flag(draw, x + width - 98, base - 132, color, int(a * 0.9), 0.65)


def draw_reeds(draw, color, strength, offset):
    a = alpha_for(strength, 0.9)
    base = 424
    for i in range(95):
        x = int((i * 73 + offset * 19) % 2048)
        h = 34 + ((i * 17 + offset * 5) % 64)
        lean = ((i % 7) - 3) * 3
        draw.line([x, base, x + lean, base - h], fill=(*color, a), width=3)
        if i % 3 == 0:
            draw.ellipse([x + lean - 7, base - h - 5, x + lean + 7, base - h + 8], fill=(*color, int(a * 0.8)))


def draw_forest(draw, color, strength, offset, dense=True):
    a = alpha_for(strength, 0.9)
    base = 414
    count = 48 if dense else 30
    for i in range(count):
        x = int((i * 91 + 31 * offset) % 2048)
        h = 70 + ((i * 23) % 76)
        w = 36 + ((i * 11) % 28)
        draw.rectangle([x - 4, base - h * 0.42, x + 4, base], fill=(*color, int(a * 0.72)))
        draw.polygon([(x - w, base - h * 0.24), (x, base - h), (x + w, base - h * 0.24)], fill=(*color, a))
        draw.polygon([(x - w * 0.75, base - h * 0.52), (x, base - h * 1.12), (x + w * 0.75, base - h * 0.52)], fill=(*color, int(a * 0.8)))


def draw_chain(draw, x0, y0, x1, y1, color, strength):
    a = alpha_for(strength, 0.95)
    steps = 13
    for i in range(steps):
        t = i / max(1, steps - 1)
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t + 14 * ((i % 2) * 2 - 1)
        draw.ellipse([x - 22, y - 10, x + 22, y + 10], outline=(*color, a), width=5)


def draw_arch(draw, cx, base, color, strength, scale=1.0):
    a = alpha_for(strength)
    w = 300 * scale
    h = 190 * scale
    x0, x1 = cx - w / 2, cx + w / 2
    draw.rectangle([x0, base - h * 0.72, x0 + 44 * scale, base], fill=(*color, a))
    draw.rectangle([x1 - 44 * scale, base - h * 0.72, x1, base], fill=(*color, a))
    draw.arc([x0, base - h, x1, base + h * 0.45], 180, 360, fill=(*color, a), width=int(38 * scale))
    draw.rectangle([x0 - 44 * scale, base - h * 0.72, x0 + 88 * scale, base - h * 0.58], fill=(*color, int(a * 0.92)))
    draw.rectangle([x1 - 88 * scale, base - h * 0.72, x1 + 44 * scale, base - h * 0.58], fill=(*color, int(a * 0.92)))


def draw_fire(draw, x, base, color, strength, scale=1.0):
    a = alpha_for(strength, 0.8)
    for i in range(5):
        dx = (i - 2) * 28 * scale
        h = (72 + i * 10) * scale
        draw.polygon(
            [(x + dx - 20 * scale, base), (x + dx, base - h), (x + dx + 20 * scale, base)],
            fill=(*color, a),
        )


def draw_bow_watch(draw, cx, base, color, strength):
    a = alpha_for(strength)
    draw.arc([cx - 82, base - 210, cx + 82, base - 18], -92, 92, fill=(*color, a), width=8)
    draw.line([cx, base - 204, cx, base - 22], fill=(*color, int(a * 0.72)), width=3)
    draw.line([cx - 110, base - 18, cx + 110, base - 18], fill=(*color, int(a * 0.82)), width=10)
    draw_tower(draw, cx - 34, base - 18, 68, 112, color, int(a * 0.92), dome=False)


def draw_caravan(draw, color, strength, offset):
    a = alpha_for(strength, 0.86)
    base = 416
    for i in range(7):
        x = 390 + i * 132 + offset * 28
        y = base - (i % 2) * 8
        draw.ellipse([x - 36, y - 30, x + 36, y + 18], fill=(*color, a))
        draw.rectangle([x - 18, y - 55, x + 18, y - 16], fill=(*color, int(a * 0.86)))
        draw.line([x + 28, y - 18, x + 58, y - 34], fill=(*color, int(a * 0.78)), width=4)


def draw_terraces(draw, color, strength, offset):
    a = alpha_for(strength)
    base = 426
    for i in range(5):
        x0 = 260 + i * 230 + offset * 18
        y = base - i * 24
        draw.polygon([(x0, y), (x0 + 230, y - 14), (x0 + 310, y + 8), (x0 + 42, y + 30)], fill=(*color, int(a * (0.92 - i * 0.08))))
        for k in range(4):
            x = x0 + 48 + k * 42
            draw.rectangle([x, y - 58, x + 12, y], fill=(*color, int(a * 0.74)))


def paint_motif(mid, motif, color, strength, dir_name):
    offset = DIRS.index(dir_name)
    overlay = Image.new("RGBA", SIZE_MID, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    base = 412
    cx = 1024 + (offset - 1.5) * 120

    if motif in {"champion_keep", "palace_garden", "night_palace", "royal_city", "war_court", "gang_dez"}:
        draw_citadel(draw, cx, base, color, strength, width=420 if motif in {"royal_city", "gang_dez"} else 350, domes=motif in {"palace_garden", "night_palace", "royal_city"}, flags=motif != "palace_garden")
        if motif == "war_court":
            for k in range(4):
                draw_flag(draw, 560 + k * 270 + offset * 17, base - 8, color, alpha_for(strength, 0.8), 0.55)
        if motif == "gang_dez":
            draw_citadel(draw, 590 + offset * 40, base + 8, color, strength * 0.72, width=260, domes=True, flags=True)
            draw_citadel(draw, 1440 - offset * 34, base + 8, color, strength * 0.72, width=260, domes=True, flags=True)
    elif motif == "reedland":
        draw_reeds(draw, color, strength, offset)
        draw_citadel(draw, 1190, base + 6, color, strength * 0.55, width=230, domes=False, flags=True)
    elif motif in {"forest_fog", "hidden_garden"}:
        draw_forest(draw, color, strength, offset, dense=True)
        if motif == "hidden_garden":
            draw_arch(draw, 1140, base + 4, color, strength * 0.55, scale=0.55)
    elif motif == "simurgh_height":
        draw.polygon([(620, base), (1000, 158), (1370, base)], fill=(*color, alpha_for(strength, 0.5)))
        draw.ellipse([950, 206, 1080, 270], outline=(*color, alpha_for(strength, 0.92)), width=8)
        for k in range(5):
            draw.line([1015, 238, 900 + k * 52, 188 + abs(k - 2) * 18], fill=(*color, alpha_for(strength, 0.6)), width=5)
    elif motif == "chains_mountain":
        draw_chain(draw, 500, 320, 1000, 245, color, strength)
        draw_chain(draw, 1030, 252, 1540, 330, color, strength)
        draw.polygon([(760, base), (1060, 178), (1370, base)], fill=(*color, alpha_for(strength, 0.38)))
    elif motif == "fire_trial":
        draw_arch(draw, 1024, base + 10, color, strength, scale=0.72)
        draw_fire(draw, 820, base + 4, color, strength, 0.72)
        draw_fire(draw, 1220, base + 4, color, strength, 0.72)
    elif motif == "white_gate":
        draw_citadel(draw, cx, base, color, strength, width=400, domes=False, flags=True)
        for k in range(7):
            x = 650 + k * 112
            draw.line([x, base, x + 26, base - 112], fill=(*color, alpha_for(strength, 0.72)), width=5)
    elif motif == "iron_fort":
        draw_citadel(draw, cx, base, color, strength, width=460, domes=False, flags=False)
        draw_chain(draw, 650, 330, 1400, 330, color, strength * 0.74)
    elif motif == "frontier_caravan":
        draw_caravan(draw, color, strength, offset)
        draw_flag(draw, 1450, base - 12, color, alpha_for(strength, 0.75), 0.72)
    elif motif == "stone_terraces":
        draw_terraces(draw, color, strength, offset)
    elif motif == "spear_fort":
        draw_citadel(draw, cx, base, color, strength, width=390, domes=False, flags=True)
        for k in range(9):
            x = 540 + k * 118
            draw.line([x, base, x - 22, base - 130], fill=(*color, alpha_for(strength, 0.68)), width=4)
    elif motif == "great_arch":
        draw_arch(draw, cx, base, color, strength, scale=1.06)
        draw_citadel(draw, 590, base + 10, color, strength * 0.56, width=220, domes=True, flags=False)
        draw_citadel(draw, 1480, base + 12, color, strength * 0.56, width=220, domes=True, flags=False)
    elif motif == "border_watch":
        draw_bow_watch(draw, cx, base, color, strength)
        draw_flag(draw, 610, base - 10, color, alpha_for(strength, 0.65), 0.62)
        draw_flag(draw, 1440, base - 10, color, alpha_for(strength, 0.65), 0.62)
    elif motif == "cold_fort":
        draw_citadel(draw, cx, base, color, strength, width=450, domes=False, flags=True)
        draw.polygon([(760, base), (1040, 230), (1320, base)], fill=(*color, alpha_for(strength, 0.28)))

    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=0.45))
    return Image.alpha_composite(mid, overlay)


def make_mid(source, map_id, dir_name):
    cfg = MAP_ART[map_id]
    mid_rgb = ImageOps.fit(source, SIZE_MID, method=Image.Resampling.LANCZOS, centering=(0.5, 0.72))
    mid_rgb = ImageEnhance.Color(mid_rgb).enhance(0.55)
    mid_rgb = ImageEnhance.Contrast(mid_rgb).enhance(1.16)
    mid_rgb = ImageEnhance.Brightness(mid_rgb).enhance(0.72)
    mid_rgb = mid_rgb.filter(ImageFilter.GaussianBlur(radius=0.35))
    arr = np.asarray(mid_rgb, dtype=np.float32)
    luma = (arr[..., 0] * 0.2126 + arr[..., 1] * 0.7152 + arr[..., 2] * 0.0722)[..., None]
    rgb = np.empty_like(arr)
    rgb[..., 0] = (arr[..., 0] * 0.50 + luma[..., 0] * 0.25) * 0.82
    rgb[..., 1] = (arr[..., 1] * 0.50 + luma[..., 0] * 0.25) * 0.82
    rgb[..., 2] = (arr[..., 2] * 0.54 + luma[..., 0] * 0.30) * 0.86
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    yy = np.linspace(0.0, 1.0, SIZE_MID[1], dtype=np.float32)
    top = np.clip((yy - 0.08) / 0.34, 0, 1)
    bottom = np.clip((0.98 - yy) / 0.18, 0, 1)
    alpha = (170 * np.power(top * bottom, 0.9)).astype(np.uint8)
    alpha = np.repeat(alpha[:, None], SIZE_MID[0], axis=1)
    rgba = np.dstack([rgb, alpha])
    mid = Image.fromarray(rgba, "RGBA")
    return paint_motif(mid, cfg["motif"], cfg["color"], cfg["strength"], dir_name)


def build_map(map_id):
    out_dir = ROOT / map_id
    out_dir.mkdir(parents=True, exist_ok=True)
    for dir_name in DIRS:
        src = ROOT / f"{map_id}_{dir_name}.jpg"
        if not src.exists():
            raise FileNotFoundError(src)
        source = Image.open(src).convert("RGB")
        far_path = out_dir / f"far_{dir_name}.webp"
        if FULL_REBUILD or not far_path.exists():
            far = ImageOps.fit(source, SIZE_FAR, method=Image.Resampling.LANCZOS, centering=(0.5, 0.48))
            far.save(far_path, "WEBP", quality=82, method=6)
        mid = make_mid(source, map_id, dir_name)
        mid.save(out_dir / f"mid_{dir_name}.webp", "WEBP", quality=80, method=6)


def main():
    map_ids = REQUESTED_MAPS or list(MAP_ART)
    for map_id in map_ids:
        if map_id not in MAP_ART:
            raise SystemExit(f"Unknown backdrop map id: {map_id}")
        build_map(map_id)
        print(f"{map_id}: silhouette pass", flush=True)


if __name__ == "__main__":
    main()
