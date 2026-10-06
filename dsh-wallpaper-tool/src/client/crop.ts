/**
 * Framing maths and the canvas pass behind "crop by hand".
 *
 * The same `Framing` object drives three things, and they must agree exactly:
 *   1. the live background layer (CSS transform on the slide),
 *   2. the crop editor preview (CSS transform on the preview image),
 *   3. the baked crop written back to IndexedDB (canvas drawImage).
 * All three go through `layout()` below, so what the editor shows is what the
 * wallpaper and the saved file contain.
 */
import type { FitMode, Framing } from './types.js';
import { canvasToBlob, loadImage } from './media.js';

export interface Layout {
  /** Drawn size of the source inside the box, in box pixels. */
  drawW: number;
  drawH: number;
  /** Top-left corner of the drawn source, in box pixels. */
  left: number;
  top: number;
  /** Horizontal / vertical slack the framing can pan across, in box pixels. */
  overflowX: number;
  overflowY: number;
}

export function fitScale(fit: FitMode, iw: number, ih: number, boxW: number, boxH: number): number {
  const scaleX = boxW / iw;
  const scaleY = boxH / ih;
  if (fit === 'contain') return Math.min(scaleX, scaleY);
  if (fit === 'fill') return Math.min(scaleX, scaleY); // unused for `fill`, see layout()
  return Math.max(scaleX, scaleY);
}

/** Resolve a framing into concrete box-space geometry. */
export function layout(framing: Framing, iw: number, ih: number, boxW: number, boxH: number): Layout {
  // `fill` stretches the source to the box: no slack, so framing cannot pan.
  if (framing.fit === 'fill') {
    return { drawW: boxW, drawH: boxH, left: 0, top: 0, overflowX: 0, overflowY: 0 };
  }
  const scale = fitScale(framing.fit, iw, ih, boxW, boxH) * framing.zoom;
  const drawW = iw * scale;
  const drawH = ih * scale;
  const overflowX = Math.max(0, drawW - boxW);
  const overflowY = Math.max(0, drawH - boxH);
  return {
    drawW,
    drawH,
    left: (boxW - drawW) / 2 + (framing.x * overflowX) / 2,
    top: (boxH - drawH) / 2 + (framing.y * overflowY) / 2,
    overflowX,
    overflowY,
  };
}

/** CSS transform for the live layer / preview; the box is positioned at 0/0. */
export function framingCss(framing: Framing, iw: number, ih: number, boxW: number, boxH: number): {
  width: string;
  height: string;
  transform: string;
} {
  const geometry = layout(framing, iw, ih, boxW, boxH);
  return {
    width: `${geometry.drawW}px`,
    height: `${geometry.drawH}px`,
    transform: `translate3d(${geometry.left}px, ${geometry.top}px, 0) rotate(${framing.rotate}deg)`,
  };
}

export const ASPECTS: { id: string; label: string; ratio: number | null }[] = [
  { id: 'viewport', label: 'window', ratio: null },
  { id: '21:9', label: '21:9', ratio: 21 / 9 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: 'original', label: 'source', ratio: -1 },
];

export function aspectRatio(id: string, source: { width: number; height: number }, viewport: { width: number; height: number }): number {
  const found = ASPECTS.find((entry) => entry.id === id);
  if (!found || found.ratio === null) return viewport.width / Math.max(1, viewport.height);
  if (found.ratio === -1) return source.width / Math.max(1, source.height);
  return found.ratio;
}

/**
 * Render the visible region of `blob` under `framing` into a new image whose
 * aspect ratio equals `aspect`. Returns the baked blob plus its pixel size.
 */
export async function renderCrop(
  blob: Blob,
  framing: Framing,
  aspect: number,
  source: { width: number; height: number },
  maxEdge: number,
): Promise<{ blob: Blob; width: number; height: number } | null> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const iw = image.naturalWidth || source.width;
    const ih = image.naturalHeight || source.height;
    if (!iw || !ih) return null;

    // Work in a virtual box that already has the target aspect ratio.
    const boxH = 1000;
    const boxW = boxH * aspect;
    const geometry = layout(framing, iw, ih, boxW, boxH);

    // Output resolution: as close to native source pixels as the cap allows.
    const nativeScale = geometry.drawW / iw; // box px per source px
    let quality = nativeScale > 0 ? 1 / nativeScale : 1; // source px per box px
    const capByEdge = Math.min(maxEdge / boxW, maxEdge / boxH);
    quality = Math.min(quality, capByEdge, 3);
    quality = Math.max(quality, 0.2);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(boxW * quality));
    canvas.height = Math.max(1, Math.round(boxH * quality));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(quality, quality);
    // Same transform chain as the CSS on the live layer: move the source centre
    // to its framed position, then rotate about that centre.
    ctx.translate(geometry.left + geometry.drawW / 2, geometry.top + geometry.drawH / 2);
    ctx.rotate((framing.rotate * Math.PI) / 180);
    ctx.drawImage(image, -geometry.drawW / 2, -geometry.drawH / 2, geometry.drawW, geometry.drawH);

    const out = await canvasToBlob(canvas, 0.94);
    if (!out) return null;
    return { blob: out, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
