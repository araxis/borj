// Atlas cell helpers. Cells are 1-based {col,row} matching the Markdown ledgers exactly.
//
// IMPORTANT: the painted atlases do NOT have uniform grids — cell widths/heights vary
// by tens of pixels. Each atlas descriptor therefore carries measured separator-line
// positions (`grid.xs` / `grid.ys`, in pixels, detected via low-variance line scans).
// Cell rect = the span between
// adjacent separators, inset slightly to hide the separator line itself.
//
// CSS math for an arbitrary fractional rect (fx, fy, fw, fh of the source image):
//   background-size:     (100/fw)% (100/fh)%
//   background-position: fx/(1-fw)*100% fy/(1-fh)*100%

const INSET = 4; // px inside each separator line

function cellRect(atlas, cell) {
  const { grid } = atlas;
  if (grid) {
    const x0 = grid.xs[cell.col - 1] + INSET;
    const x1 = grid.xs[cell.col] - INSET;
    const y0 = grid.ys[cell.row - 1] + INSET;
    const y1 = grid.ys[cell.row] - INSET;
    return { fx: x0 / grid.w, fy: y0 / grid.h, fw: (x1 - x0) / grid.w, fh: (y1 - y0) / grid.h };
  }
  // uniform fallback
  return {
    fx: (cell.col - 1) / atlas.cols, fy: (cell.row - 1) / atlas.rows,
    fw: 1 / atlas.cols, fh: 1 / atlas.rows,
  };
}

export function atlasCellCSS(atlas, cell) {
  const { fx, fy, fw, fh } = cellRect(atlas, cell);
  const posX = fw < 1 ? (fx / (1 - fw)) * 100 : 0;
  const posY = fh < 1 ? (fy / (1 - fh)) * 100 : 0;
  return {
    backgroundImage: `url(${atlas.url})`,
    backgroundSize: `${100 / fw}% ${100 / fh}%`,
    backgroundPosition: `${posX}% ${posY}%`,
  };
}

// One shared HTMLImageElement per atlas URL — the browser already has the file
// cached (atlases double as CSS backgrounds), so this load resolves instantly.
const _atlasImg = new Map();
function atlasImage(url) {
  let img = _atlasImg.get(url);
  if (!img) { img = new Image(); img.src = url; _atlasImg.set(url, img); }
  return img;
}

// Paint a single atlas cell into the host element with a UNIFORM cover-crop
// (no stretching). The cell is drawn at its native resolution onto a <canvas>
// child, and `object-fit: cover` (set in CSS via .cellimg) scales it to cover
// the host box — cropping overflow instead of distorting aspect. This is
// element-size independent, so it stays correct as the responsive grid reflows.
// The canvas is inserted as the FIRST child; every badge (.roleico/.cost/…) is
// position:absolute and appended after, so it paints on top automatically.
export function applyAtlasCell(el, atlas, cell) {
  const { fx, fy, fw, fh } = cellRect(atlas, cell);

  let cv = el.querySelector(':scope > canvas.cellimg');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.className = 'cellimg';
    el.insertBefore(cv, el.firstChild);
  }
  // Clear any legacy background-image so it can't show through behind the canvas.
  el.style.backgroundImage = 'none';

  const img = atlasImage(atlas.url);
  const draw = () => {
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H) return;
    const sw = Math.max(1, Math.round(fw * W)), sh = Math.max(1, Math.round(fh * H));
    cv.width = sw; cv.height = sh;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, sw, sh);
    ctx.drawImage(img, fx * W, fy * H, fw * W, fh * H, 0, 0, sw, sh);
  };
  if (img.complete && img.naturalWidth) draw();
  else img.addEventListener('load', draw, { once: true });
}
