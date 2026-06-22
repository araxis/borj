from pathlib import Path
import math

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path("public/assets/backdrops/sistan")
DIRECTIONS = ["n", "e", "s", "w"]
PANORAMA_W = 8192


def load_layer(layer):
    imgs = []
    for direction in DIRECTIONS:
        path = ROOT / f"{layer}_{direction}.webp"
        imgs.append(Image.open(path).convert("RGBA"))
    return imgs


def stitch_loop(images, height):
    panel_w = PANORAMA_W // len(images)
    out = Image.new("RGBA", (PANORAMA_W, height), (0, 0, 0, 0))
    for idx, img in enumerate(images):
        resized = img.resize((panel_w, height), Image.Resampling.LANCZOS)
        out.alpha_composite(resized, (idx * panel_w, 0))
    return soften_seams(out, panel_w)


def soften_seams(img, panel_w, width=96):
    arr = np.asarray(img).astype(np.float32)
    original = arr.copy()
    h, w, _ = arr.shape
    half = width // 2
    for boundary in [panel_w, panel_w * 2, panel_w * 3, 0]:
        for i in range(width):
            x = (boundary - half + i) % w
            t = i / max(1, width - 1)
            left = original[:, (boundary - half - 1) % w, :]
            right = original[:, (boundary + half) % w, :]
            arr[:, x, :] = left * (1 - t) + right * t
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def adjust(img, color=1.0, contrast=1.0, brightness=1.0, blur=0.0):
    rgb = img.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(color)
    rgb = ImageEnhance.Contrast(rgb).enhance(contrast)
    rgb = ImageEnhance.Brightness(rgb).enhance(brightness)
    if blur:
        rgb = rgb.filter(ImageFilter.GaussianBlur(blur))
    alpha = img.getchannel("A")
    return Image.merge("RGBA", (*rgb.split(), alpha))


def vertical_alpha(img, bottom_start=0.03, bottom_end=0.22, top_start=0.72, top_end=1.0, max_alpha=210):
    arr = np.asarray(img).astype(np.float32)
    h = arr.shape[0]
    y = np.linspace(0, 1, h, dtype=np.float32)
    bottom = np.clip((y - bottom_start) / max(0.001, bottom_end - bottom_start), 0, 1)
    top = 1 - np.clip((y - top_start) / max(0.001, top_end - top_start), 0, 1)
    fade = np.power(bottom * top, 0.9) * max_alpha
    arr[..., 3] = np.minimum(arr[..., 3], fade[:, None])
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def color_mix(rgb, a, b, t):
    return tuple(int(rgb[i] * (1 - t) + a[i] * t * 0.5 + b[i] * t * 0.5) for i in range(3))


def make_marsh_band(width=PANORAMA_W, height=320, seed=11, close=False):
    rng = np.random.default_rng(seed)
    top = np.array([174, 193, 153], dtype=np.float32)
    bottom = np.array([114, 143, 101], dtype=np.float32) if close else np.array([126, 153, 118], dtype=np.float32)
    water = np.array([86, 133, 126], dtype=np.float32)
    reed = np.array([149, 137, 81], dtype=np.float32)
    arr = np.zeros((height, width, 4), dtype=np.uint8)
    for y in range(height):
        t = y / max(1, height - 1)
        rgb = top * (1 - t) + bottom * t
        alpha = int(178 * (1 - min(1, max(0, (t - 0.78) / 0.22))) * min(1, t / 0.22))
        arr[y, :, :3] = np.clip(rgb, 0, 255)
        arr[y, :, 3] = alpha
    img = Image.fromarray(arr, "RGBA")
    draw = ImageDraw.Draw(img, "RGBA")
    horizon_y = int(height * (0.52 if close else 0.58))

    for k in range(24 if close else 16):
        y = int(horizon_y + rng.integers(-18, 34))
        amp = rng.uniform(7, 19)
        phase = rng.uniform(0, math.tau)
        pts = []
        for x in range(0, width + 96, 96):
            yy = y + math.sin(x * 0.004 + phase) * amp + math.sin(x * 0.0017 + phase * 0.7) * amp * 0.5
            pts.append((x, yy))
        col = tuple(water.astype(int)) + (58 if close else 46,)
        draw.line(pts, fill=col, width=int(rng.integers(5, 12)))

    reed_count = 1200 if close else 760
    for _ in range(reed_count):
        x = int(rng.integers(0, width))
        base = int(rng.integers(int(height * 0.48), int(height * 0.96)))
        stem_h = int(rng.integers(14, 76 if close else 58))
        lean = int(rng.integers(-12, 13))
        c = color_mix(tuple(reed.astype(int)), tuple(bottom.astype(int)), tuple(water.astype(int)), rng.uniform(0, 0.42))
        a = int(rng.integers(42, 112 if close else 88))
        draw.line((x, base, x + lean, max(0, base - stem_h)), fill=(*c, a), width=int(rng.integers(1, 3)))
        if rng.random() < (0.45 if close else 0.3):
            draw.ellipse((x + lean - 4, base - stem_h - 5, x + lean + 4, base - stem_h + 7), fill=(*c, int(a * 0.72)))

    img = img.filter(ImageFilter.GaussianBlur(0.18 if close else 0.35))
    return vertical_alpha(
        img,
        bottom_start=0.02,
        bottom_end=0.18,
        top_start=0.56 if close else 0.62,
        top_end=1.0,
        max_alpha=205 if close else 176,
    )


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    far = adjust(stitch_loop(load_layer("far"), 640), color=0.92, contrast=0.98, brightness=1.03, blur=0.12)
    far.save(ROOT / "panorama_360.webp", "WEBP", quality=84, method=6)

    reedline = adjust(stitch_loop(load_layer("mid"), 384), color=0.74, contrast=0.92, brightness=1.16, blur=0.18)
    reedline = vertical_alpha(reedline, bottom_start=0.05, bottom_end=0.18, top_start=0.62, top_end=1.0, max_alpha=168)
    reedline.save(ROOT / "reedline_360.webp", "WEBP", quality=82, method=6)

    water = make_marsh_band(height=300, seed=23, close=False)
    water.save(ROOT / "water_360.webp", "WEBP", quality=82, method=6)

    apron = make_marsh_band(height=228, seed=37, close=True)
    apron.save(ROOT / "apron_360.webp", "WEBP", quality=82, method=6)

    for name in ["panorama_360.webp", "reedline_360.webp", "water_360.webp", "apron_360.webp"]:
        p = ROOT / name
        img = Image.open(p)
        print(f"{p}: {img.size[0]}x{img.size[1]} {p.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
