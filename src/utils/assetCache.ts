import { CropState, ImageFitMode } from '../types';
import { clamp, hexToRgba, isRgbPixelGreenHue, lerp } from './math';
import { combineSeed, mulberry32 } from './random';

/**
 * Creates a standard HTMLCanvasElement for offscreen caching so it works seamlessly
 * with both CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D drawImage().
 */
export function createBufferCanvas(width: number, height: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof document === 'undefined') {
    const noop = () => {};
    const grad = { addColorStop: noop };
    const fallbackCtx = {
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      lineCap: 'round',
      lineJoin: 'round',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      font: '16px sans-serif',
      direction: 'rtl',
      textAlign: 'right',
      textBaseline: 'middle',
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      quadraticCurveTo: noop,
      bezierCurveTo: noop,
      arc: noop,
      rect: noop,
      roundRect: noop,
      clip: noop,
      fill: noop,
      stroke: noop,
      fillRect: noop,
      strokeRect: noop,
      clearRect: noop,
      fillText: noop,
      strokeText: noop,
      drawImage: noop,
      translate: noop,
      scale: noop,
      rotate: noop,
      setLineDash: noop,
      createLinearGradient: () => grad,
      createRadialGradient: () => grad,
      createImageData: (iw: number, ih: number) => ({
        data: new Uint8ClampedArray(iw * ih * 4),
        width: iw,
        height: ih,
      }),
      getImageData: (_x: number, _y: number, iw: number, ih: number) => ({
        data: new Uint8ClampedArray(iw * ih * 4),
        width: iw,
        height: ih,
      }),
      putImageData: noop,
      measureText: (s: string) => ({ width: s.length * 10 }),
    };
    return {
      width: w,
      height: h,
      getContext: () => fallbackCtx,
    } as unknown as HTMLCanvasElement;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

const cacheStore = new Map<string, HTMLCanvasElement>();

export function getOrGenerateCachedCanvas(
  key: string,
  width: number,
  height: number,
  generator: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): HTMLCanvasElement {
  const existing = cacheStore.get(key);
  if (existing && existing.width === width && existing.height === height) {
    return existing;
  }
  const canvas = createBufferCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    generator(ctx, canvas.width, canvas.height);
  }
  if (cacheStore.size > 90) {
    const oldest = cacheStore.keys().next().value;
    if (oldest) cacheStore.delete(oldest);
  }
  cacheStore.set(key, canvas);
  return canvas;
}

/**
 * Generates a refined, artistic default portrait silhouette on canvas so the studio
 * looks rich and complete out of the box with zero external URL dependencies.
 */
export function getDefaultPortraitCanvas(): HTMLCanvasElement {
  return getOrGenerateCachedCanvas('default-portrait-v2', 800, 800, (ctx, w, h) => {
    // 1. Rich warm-cool chiaroscuro studio backdrop
    const bgGrad = ctx.createRadialGradient(w * 0.42, h * 0.32, w * 0.04, w * 0.5, h * 0.5, w * 0.78);
    bgGrad.addColorStop(0, '#36495e');
    bgGrad.addColorStop(0.5, '#1b2636');
    bgGrad.addColorStop(1, '#0a0f18');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle classical archway shadow in background
    ctx.fillStyle = 'rgba(8, 12, 20, 0.45)';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.42, w * 0.38, Math.PI, 0, false);
    ctx.lineTo(w * 0.88, h);
    ctx.lineTo(w * 0.12, h);
    ctx.closePath();
    ctx.fill();

    // Warm golden Rembrandt rim light glow behind subject's right shoulder & temple
    const rimGrad = ctx.createRadialGradient(w * 0.35, h * 0.34, 10, w * 0.38, h * 0.38, w * 0.44);
    rimGrad.addColorStop(0, 'rgba(242, 204, 143, 0.38)');
    rimGrad.addColorStop(0.5, 'rgba(140, 175, 220, 0.12)');
    rimGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rimGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Classical scholar / philosopher bust with sculpted drapery and warm key light
    ctx.save();
    // Outer cloak & shoulders
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h);
    ctx.quadraticCurveTo(w * 0.14, h * 0.7, w * 0.35, h * 0.64);
    ctx.lineTo(w * 0.65, h * 0.64);
    ctx.quadraticCurveTo(w * 0.86, h * 0.7, w * 0.92, h);
    ctx.closePath();
    const cloakGrad = ctx.createLinearGradient(w * 0.15, h * 0.62, w * 0.82, h);
    cloakGrad.addColorStop(0, '#4a5d73');
    cloakGrad.addColorStop(0.35, '#283648');
    cloakGrad.addColorStop(1, '#0e1520');
    ctx.fillStyle = cloakGrad;
    ctx.fill();

    // Warm collar / inner robe lapel folds
    ctx.strokeStyle = 'rgba(242, 210, 165, 0.22)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w * 0.37, h * 0.64);
    ctx.quadraticCurveTo(w * 0.46, h * 0.82, w * 0.5, h * 0.96);
    ctx.moveTo(w * 0.63, h * 0.64);
    ctx.quadraticCurveTo(w * 0.54, h * 0.82, w * 0.5, h * 0.96);
    ctx.stroke();

    // Neck column with key-light shading
    const neckGrad = ctx.createLinearGradient(w * 0.42, h * 0.52, w * 0.58, h * 0.66);
    neckGrad.addColorStop(0, '#5a6e85');
    neckGrad.addColorStop(1, '#1e2a3a');
    ctx.fillStyle = neckGrad;
    ctx.beginPath();
    ctx.roundRect(w * 0.42, h * 0.51, w * 0.16, h * 0.17, 24);
    ctx.fill();

    // Sculpted head & classic beard silhouette
    const headGrad = ctx.createRadialGradient(w * 0.41, h * 0.33, w * 0.02, w * 0.5, h * 0.38, w * 0.23);
    headGrad.addColorStop(0, '#6c829c');
    headGrad.addColorStop(0.45, '#37495e');
    headGrad.addColorStop(1, '#151f2c');
    ctx.fillStyle = headGrad;

    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.36, w * 0.142, h * 0.185, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle brow & nose bridge chiaroscuro planes
    ctx.fillStyle = 'rgba(245, 222, 188, 0.14)';
    ctx.beginPath();
    ctx.ellipse(w * 0.45, h * 0.33, w * 0.055, h * 0.022, -0.15, 0, Math.PI * 2);
    ctx.fill();

    // Golden rim highlight along left temple, cheekbone, and shoulder
    ctx.strokeStyle = 'rgba(248, 224, 182, 0.35)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.36, w * 0.141, h * 0.183, 0, Math.PI * 0.72, Math.PI * 1.44);
    ctx.stroke();
    ctx.restore();
  });
}

/**
 * Draws a source image/canvas into a target rectangle using cover logic + user crop (zoom, offsetX, offsetY).
 * Never stretches or distorts the source aspect ratio.
 */
export function drawCroppedImage(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement | null,
  crop: CropState,
  destX: number,
  destY: number,
  destW: number,
  destH: number
): void {
  const img = source || getDefaultPortraitCanvas();
  const srcW = 'naturalWidth' in img && img.naturalWidth > 0 ? img.naturalWidth : img.width;
  const srcH = 'naturalHeight' in img && img.naturalHeight > 0 ? img.naturalHeight : img.height;
  if (srcW <= 0 || srcH <= 0 || destW <= 0 || destH <= 0) return;

  const zoom = clamp(crop.zoom || 1, 1, 3);
  const destAspect = destW / destH;
  const srcAspect = srcW / srcH;

  let baseCropW = srcW;
  let baseCropH = srcH;

  if (srcAspect > destAspect) {
    baseCropW = srcH * destAspect;
  } else {
    baseCropH = srcW / destAspect;
  }

  const finalCropW = baseCropW / zoom;
  const finalCropH = baseCropH / zoom;

  const maxPanX = (srcW - finalCropW) / 2;
  const maxPanY = (srcH - finalCropH) / 2;

  const centerX = srcW / 2 - clamp(crop.offsetX || 0, -1, 1) * maxPanX;
  const centerY = srcH / 2 - clamp(crop.offsetY || 0, -1, 1) * maxPanY;

  const sx = clamp(centerX - finalCropW / 2, 0, srcW - finalCropW);
  const sy = clamp(centerY - finalCropH / 2, 0, srcH - finalCropH);

  ctx.drawImage(img, sx, sy, finalCropW, finalCropH, destX, destY, destW, destH);
}

/**
 * Returns a pre-cropped offscreen canvas of the portrait at (width, height),
 * optionally with a visual grade ('normal' | 'sepia' | 'bw' | 'teal-orange').
 * Cached by photoId + crop parameters + grade + dimensions.
 */
export function getCachedGradedPortrait(
  source: HTMLImageElement | HTMLCanvasElement | null,
  photoId: string,
  crop: CropState,
  width: number,
  height: number,
  grade: 'normal' | 'sepia' | 'bw' | 'teal-orange'
): HTMLCanvasElement {
  const w = Math.max(16, Math.round(width));
  const h = Math.max(16, Math.round(height));
  const key = `portrait|${photoId}|${crop.zoom.toFixed(2)}|${crop.offsetX.toFixed(2)}|${crop.offsetY.toFixed(2)}|${w}x${h}|${grade}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    drawCroppedImage(ctx, source, crop, 0, 0, w, h);

    if (grade === 'normal') return;

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    if (grade === 'sepia') {
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        data[i] = clamp(lum * 1.08 + 28, 0, 255);
        data[i + 1] = clamp(lum * 0.92 + 12, 0, 255);
        data[i + 2] = clamp(lum * 0.72 - 6, 0, 255);
      }
    } else if (grade === 'bw') {
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const norm = lum / 255;
        const curved = clamp((norm - 0.5) * 1.28 + 0.5, 0, 1) * 255;
        data[i] = curved;
        data[i + 1] = curved;
        data[i + 2] = curved;
      }
    } else if (grade === 'teal-orange') {
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const desatR = lerp(r, lum * 255, 0.35);
        const desatG = lerp(g, lum * 255, 0.35);
        const desatB = lerp(b, lum * 255, 0.35);

        const shadowWeight = Math.pow(1 - lum, 1.5);
        const highlightWeight = Math.pow(lum, 1.4);

        const finalR = desatR - shadowWeight * 24 + highlightWeight * 34;
        const finalG = desatG + shadowWeight * 8 + highlightWeight * 10;
        const finalB = desatB + shadowWeight * 32 - highlightWeight * 26;

        data[i] = clamp(finalR, 0, 255);
        data[i + 1] = clamp(finalG, 0, 255);
        data[i + 2] = clamp(finalB, 0, 255);
      }
    }

    ctx.putImageData(imgData, 0, 0);
  });
}

/**
 * Generates and caches a deeply blurred, darkened copy of the photo for Style 4 (Glassmorphism).
 */
export function getCachedBlurredBackdrop(
  source: HTMLImageElement | HTMLCanvasElement | null,
  photoId: string,
  crop: CropState,
  baseWidth: number,
  baseHeight: number
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.25);
  const h = Math.round(baseHeight * 0.25);
  const key = `blur-bg|${photoId}|${crop.zoom.toFixed(2)}|${crop.offsetX.toFixed(2)}|${crop.offsetY.toFixed(2)}|${w}x${h}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const temp = createBufferCanvas(w, h);
    const tCtx = temp.getContext('2d')!;
    drawCroppedImage(tCtx, source, crop, 0, 0, w, h);

    ctx.save();
    if ('filter' in ctx) {
      ctx.filter = 'blur(12px) saturate(135%) brightness(65%)';
    }
    ctx.drawImage(temp, -20, -20, w + 40, h + 40);
    ctx.restore();

    ctx.fillStyle = 'rgba(6, 10, 22, 0.42)';
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * Generates and caches a cinematic blurred copy of the photo for Style 6 (Cinematic).
 */
export function getCachedCinematicBlurredPhoto(
  source: HTMLImageElement | HTMLCanvasElement | null,
  photoId: string,
  crop: CropState,
  baseWidth: number,
  baseHeight: number,
  blurPx: number = 6
): HTMLCanvasElement {
  const roundedBlur = Math.max(0, Math.round(blurPx));
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `cinematic-blur-photo|${photoId}|${crop.zoom.toFixed(2)}|${crop.offsetX.toFixed(2)}|${crop.offsetY.toFixed(2)}|${w}x${h}|blur=${roundedBlur}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    if (roundedBlur <= 0) {
      drawCroppedImage(ctx, source, crop, 0, 0, w, h);
      return;
    }

    const temp = createBufferCanvas(w, h);
    const tCtx = temp.getContext('2d')!;
    drawCroppedImage(tCtx, source, crop, 0, 0, w, h);

    ctx.save();
    if ('filter' in ctx) {
      const scaledFilterBlur = Math.max(1, Math.round(roundedBlur * 0.7));
      ctx.filter = `blur(${scaledFilterBlur}px) contrast(101%) brightness(98%)`;
    }
    const padding = Math.max(10, Math.round(roundedBlur * 2));
    ctx.drawImage(temp, -padding, -padding, w + padding * 2, h + padding * 2);
    ctx.restore();
  });
}

/**
 * Generates and caches the procedural Aged Parchment texture with warm candlelight chiaroscuro vignette for Style 2 (Manuscript).
 */
export function getCachedParchmentCanvas(
  baseWidth: number,
  baseHeight: number,
  seed: number
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `parchment-v2|${w}x${h}|${seed}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const isHoriz = w >= h;
    const lightX = isHoriz ? w * 0.56 : w * 0.5;
    const lightY = isHoriz ? h * 0.46 : h * 0.48;

    const rad = ctx.createRadialGradient(
      lightX,
      lightY,
      w * 0.05,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.76
    );
    rad.addColorStop(0, '#f7ebd2');
    rad.addColorStop(0.45, '#e8d2a4');
    rad.addColorStop(0.78, '#c59e65');
    rad.addColorStop(1, '#6e4920');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const rng = mulberry32(combineSeed(seed, 202));

    for (let i = 0; i < data.length; i += 4) {
      const n = (rng() - 0.5) * 19;
      data[i] = clamp(data[i] + n, 0, 255);
      data[i + 1] = clamp(data[i + 1] + n * 0.88, 0, 255);
      data[i + 2] = clamp(data[i + 2] + n * 0.68, 0, 255);
    }
    ctx.putImageData(imgData, 0, 0);

    // Subtle organic parchment fibers & water stains
    for (let i = 0; i < 22; i++) {
      const sx = rng() * w;
      const sy = rng() * h;
      const sr = (0.06 + rng() * 0.19) * Math.min(w, h);
      const stain = ctx.createRadialGradient(sx, sy, sr * 0.08, sx, sy, sr);
      const isDark = rng() > 0.35;
      stain.addColorStop(0, isDark ? 'rgba(95, 58, 22, 0.09)' : 'rgba(255, 246, 225, 0.09)');
      stain.addColorStop(1, 'rgba(95, 58, 22, 0)');
      ctx.fillStyle = stain;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine horizontal and vertical woven linen threads
    ctx.save();
    ctx.strokeStyle = 'rgba(72, 42, 14, 0.035)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    // Cinematic warm chiaroscuro edge burn (candlelit library feel)
    const burn = ctx.createRadialGradient(
      lightX,
      lightY,
      Math.min(w, h) * 0.32,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.71
    );
    burn.addColorStop(0, 'rgba(42, 22, 6, 0)');
    burn.addColorStop(0.68, 'rgba(38, 19, 5, 0.24)');
    burn.addColorStop(0.9, 'rgba(24, 11, 2, 0.58)');
    burn.addColorStop(1, 'rgba(14, 6, 1, 0.82)');
    ctx.fillStyle = burn;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * Pre-generates 6 deterministic film grain tile canvases.
 */
export function getCachedFilmGrainTile(frameIndex: number, seed: number): HTMLCanvasElement {
  const tileIdx = Math.abs(frameIndex) % 6;
  const w = 320;
  const h = 180;
  const key = `grain-tile|${seed}|${tileIdx}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;
    const rng = mulberry32(combineSeed(seed, 700 + tileIdx * 37));

    for (let i = 0; i < data.length; i += 4) {
      const v = rng() * 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 28;
    }
    ctx.putImageData(imgData, 0, 0);
  });
}

/**
 * Pre-generates and caches the Midnight Blue radial sky gradient + volumetric light beam + cinematic vignette.
 */
export function getCachedMidnightBackdrop(baseWidth: number, baseHeight: number): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `midnight-bg-v2|${w}x${h}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const isHorizontal = w >= h;
    const cx = isHorizontal ? w * 0.34 : w * 0.5;
    const cy = isHorizontal ? h * 0.46 : h * 0.32;
    const bgGrad = ctx.createRadialGradient(cx, cy, w * 0.04, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
    bgGrad.addColorStop(0, '#163B73');
    bgGrad.addColorStop(0.38, '#0D2347');
    bgGrad.addColorStop(0.74, '#061126');
    bgGrad.addColorStop(1, '#020610');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle diagonal volumetric moonlight shaft from top-left toward center
    ctx.save();
    const beamGrad = ctx.createLinearGradient(0, 0, w * 0.85, h * 0.85);
    beamGrad.addColorStop(0, 'rgba(130, 190, 255, 0.12)');
    beamGrad.addColorStop(0.45, 'rgba(85, 145, 230, 0.05)');
    beamGrad.addColorStop(1, 'rgba(10, 25, 50, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.65, 0);
    ctx.lineTo(w, h * 0.85);
    ctx.lineTo(0, h * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Deep cinematic edge vignette
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.32, w * 0.5, h * 0.5, Math.max(w, h) * 0.74);
    vig.addColorStop(0, 'rgba(3, 7, 18, 0)');
    vig.addColorStop(0.7, 'rgba(2, 5, 14, 0.36)');
    vig.addColorStop(1, 'rgba(1, 3, 9, 0.78)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * Pre-generates and caches a multi-cloud cinematic atmospheric fog texture.
 */
export function getCachedCinematicFogLayer(
  baseWidth: number,
  baseHeight: number,
  seed: number,
  layerIdx: number
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.45);
  const h = Math.round(baseHeight * 0.45);
  const key = `cinematic-fog|${w}x${h}|${seed}|${layerIdx}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const rng = mulberry32(combineSeed(seed, 910 + layerIdx * 131));
    ctx.clearRect(0, 0, w, h);

    const puffCount = 22;
    for (let i = 0; i < puffCount; i++) {
      const px = rng() * w;
      const py = (0.18 + rng() * 0.76) * h;
      const rx = (0.16 + rng() * 0.28) * w;
      const ry = (0.08 + rng() * 0.16) * h;

      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, ry / Math.max(1, rx));
      const grad = ctx.createRadialGradient(0, 0, rx * 0.05, 0, 0, rx);
      const isWarm = rng() > 0.32;
      if (isWarm) {
        grad.addColorStop(0, 'rgba(245, 176, 65, 0.11)');
        grad.addColorStop(0.5, 'rgba(180, 115, 40, 0.05)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        grad.addColorStop(0, 'rgba(38, 72, 96, 0.12)');
        grad.addColorStop(0.55, 'rgba(16, 34, 52, 0.06)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

// ============================================================================
// PHRASE MODE CACHED ASSETS (P1 - P6)
// ============================================================================

/**
 * P1 (Calligraphy Ink): Rice paper #EFE7D6 with cached fibers and subtle ink-wash clouds.
 */
export function getCachedRicePaperCanvas(
  baseWidth: number,
  baseHeight: number,
  seed: number
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `rice-paper|${w}x${h}|${seed}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    ctx.fillStyle = '#EFE7D6';
    ctx.fillRect(0, 0, w, h);

    const rng = mulberry32(combineSeed(seed, 1101));

    // Subtle ink-wash clouds
    for (let i = 0; i < 14; i++) {
      const cx = rng() * w;
      const cy = rng() * h;
      const r = (0.12 + rng() * 0.25) * Math.min(w, h);
      const grad = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r);
      const isDarkWash = rng() > 0.35;
      grad.addColorStop(0, isDarkWash ? 'rgba(30, 26, 22, 0.045)' : 'rgba(255, 252, 245, 0.25)');
      grad.addColorStop(0.6, isDarkWash ? 'rgba(30, 26, 22, 0.018)' : 'rgba(255, 252, 245, 0.08)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine organic rice paper fibers
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 220; i++) {
      const fx = rng() * w;
      const fy = rng() * h;
      const len = 8 + rng() * 24;
      const ang = rng() * Math.PI * 2;
      ctx.strokeStyle = rng() > 0.5 ? 'rgba(90, 76, 58, 0.09)' : 'rgba(255, 253, 248, 0.28)';
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(
        fx + Math.cos(ang + 0.3) * len * 0.5,
        fy + Math.sin(ang + 0.3) * len * 0.5,
        fx + Math.cos(ang) * len,
        fy + Math.sin(ang) * len
      );
      ctx.stroke();
    }

    // Gentle warm paper edge vignette
    const vig = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.36,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.72
    );
    vig.addColorStop(0, 'rgba(120, 102, 76, 0)');
    vig.addColorStop(1, 'rgba(110, 90, 64, 0.24)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * P1 (Calligraphy Ink): Irregular bristle brush-stroke mask sprite (drawn right-to-left via destination-in).
 * Left side of the mask has irregular dry bristle tips.
 */
export function getCachedBrushMaskSprite(
  width: number,
  height: number,
  seed: number,
  lineIdx: number
): HTMLCanvasElement {
  const w = Math.max(64, Math.round(width));
  const h = Math.max(32, Math.round(height));
  const key = `brush-mask|${w}x${h}|${seed}|${lineIdx}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const rng = mulberry32(combineSeed(seed, 1200 + lineIdx * 53));
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#FFFFFF';

    // Solid body on the right 82% of the mask
    const bristleZoneW = Math.min(110, Math.round(w * 0.22));
    ctx.fillRect(bristleZoneW, 0, w - bristleZoneW, h);

    // Irregular horizontal bristle fingers extending from bristleZoneW towards 0 on the left
    const bristleCount = Math.max(18, Math.round(h / 4));
    const sliceH = h / bristleCount;
    for (let b = 0; b < bristleCount; b++) {
      const reach = (0.15 + rng() * 0.85) * bristleZoneW;
      const tipX = bristleZoneW - reach;
      const y = b * sliceH;
      ctx.beginPath();
      ctx.moveTo(bristleZoneW + 4, y - 0.8);
      ctx.lineTo(tipX, y + sliceH * (0.2 + rng() * 0.6));
      ctx.lineTo(bristleZoneW + 4, y + sliceH + 0.8);
      ctx.closePath();
      ctx.fill();
    }
  });
}

/**
 * P2 (Torn Paper Stop-Motion): Kraft board background #C9A878 with warm spotlight, cutting-mat markings, and organic fibers.
 */
export function getCachedKraftPaperCanvas(
  baseWidth: number,
  baseHeight: number,
  seed: number
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `kraft-bg-v2|${w}x${h}|${seed}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const rad = ctx.createRadialGradient(
      w * 0.5,
      h * 0.45,
      w * 0.05,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.75
    );
    rad.addColorStop(0, '#D7B98B');
    rad.addColorStop(0.55, '#C4A170');
    rad.addColorStop(1, '#9A7848');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const rng = mulberry32(combineSeed(seed, 2101));

    for (let i = 0; i < data.length; i += 4) {
      const n = (rng() - 0.5) * 22;
      data[i] = clamp(data[i] + n, 0, 255);
      data[i + 1] = clamp(data[i + 1] + n * 0.88, 0, 255);
      data[i + 2] = clamp(data[i + 2] + n * 0.72, 0, 255);
    }
    ctx.putImageData(imgData, 0, 0);

    // Subtle horizontal kraft ribbing lines
    ctx.strokeStyle = 'rgba(75, 52, 24, 0.065)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 5) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Subtle studio cutting-mat / collage board grid crosshairs
    ctx.strokeStyle = 'rgba(62, 42, 18, 0.09)';
    ctx.lineWidth = 1;
    const step = 48;
    for (let x = step; x < w; x += step) {
      for (let y = step; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(x - 4, y);
        ctx.lineTo(x + 4, y);
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x, y + 4);
        ctx.stroke();
      }
    }

    // Deep warm corner vignette
    const vig = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.32,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.74
    );
    vig.addColorStop(0, 'rgba(65, 45, 22, 0)');
    vig.addColorStop(0.7, 'rgba(55, 36, 15, 0.22)');
    vig.addColorStop(1, 'rgba(32, 19, 6, 0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * P3 (Punch Words): Charcoal #101114 with faint radial glow and halftone dots.
 */
export function getCachedPunchBackdropCanvas(
  baseWidth: number,
  baseHeight: number,
  accentHex: string
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `punch-bg|${w}x${h}|${accentHex}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    ctx.fillStyle = '#101114';
    ctx.fillRect(0, 0, w, h);

    // Faint radial glow in center
    const glow = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      w * 0.04,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.58
    );
    glow.addColorStop(0, hexToRgba(accentHex, 0.16));
    glow.addColorStop(0.55, hexToRgba(accentHex, 0.05));
    glow.addColorStop(1, 'rgba(16, 17, 20, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Halftone dot pattern
    const spacing = 18;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    for (let y = spacing / 2; y < h; y += spacing) {
      for (let x = spacing / 2; x < w; x += spacing) {
        const dx = (x - w * 0.5) / (w * 0.5);
        const dy = (y - h * 0.5) / (h * 0.5);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const r = clamp((1 - dist * 0.65) * 2.2, 0.6, 2.2);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

/**
 * P4 (Cinematic Title): Dark blue-black gradient with light vignette.
 */
export function getCachedCinematicTitleBackdrop(
  baseWidth: number,
  baseHeight: number
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `cin-title-bg|${w}x${h}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#050811');
    grad.addColorStop(0.5, '#0B1324');
    grad.addColorStop(1, '#04060C');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const vig = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.28,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.72
    );
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.68)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * P5 (Neon Sign): Near-black brick wall #07080C with subtle procedural bricks and vignette.
 */
export function getCachedNeonWallBackdrop(
  baseWidth: number,
  baseHeight: number,
  seed: number,
  mainColor: string
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `neon-wall|${w}x${h}|${seed}|${mainColor}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    ctx.fillStyle = '#07080C';
    ctx.fillRect(0, 0, w, h);

    const rng = mulberry32(combineSeed(seed, 5101));
    const brickW = 64;
    const brickH = 26;

    for (let row = 0; row * brickH < h * 0.78; row++) {
      const y = row * brickH;
      const offsetX = row % 2 === 1 ? -brickW / 2 : 0;
      for (let col = 0; col * brickW + offsetX < w; col++) {
        const x = col * brickW + offsetX;
        const shade = 10 + Math.floor(rng() * 10);
        ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 7})`;
        ctx.fillRect(x + 1.5, y + 1.5, brickW - 3, brickH - 3);
      }
    }

    // Ambient wall spill from neon
    const wallGlow = ctx.createRadialGradient(
      w * 0.5,
      h * 0.44,
      w * 0.04,
      w * 0.5,
      h * 0.44,
      Math.max(w, h) * 0.52
    );
    wallGlow.addColorStop(0, hexToRgba(mainColor, 0.16));
    wallGlow.addColorStop(0.55, hexToRgba(mainColor, 0.05));
    wallGlow.addColorStop(1, 'rgba(7, 8, 12, 0)');
    ctx.fillStyle = wallGlow;
    ctx.fillRect(0, 0, w, h);

    // Dark floor horizon line at 78% height
    const floorGrad = ctx.createLinearGradient(0, h * 0.75, 0, h);
    floorGrad.addColorStop(0, '#050609');
    floorGrad.addColorStop(1, '#090B12');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, h * 0.76, w, h * 0.24);

    // Vignette
    const vig = ctx.createRadialGradient(
      w * 0.5,
      h * 0.48,
      Math.min(w, h) * 0.3,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.74
    );
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.76)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * P6 (Annotate): Dark slate #0F1115 with faint notebook grid.
 */
export function getCachedAnnotateBackdropCanvas(
  baseWidth: number,
  baseHeight: number
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `annotate-bg|${w}x${h}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    ctx.fillStyle = '#0F1115';
    ctx.fillRect(0, 0, w, h);

    const gridStep = 28;
    ctx.strokeStyle = 'rgba(245, 247, 250, 0.042)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = gridStep; x < w; x += gridStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = gridStep; y < h; y += gridStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Subtle major grid lines every 4 cells
    ctx.strokeStyle = 'rgba(245, 247, 250, 0.075)';
    ctx.beginPath();
    for (let x = gridStep * 4; x < w; x += gridStep * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = gridStep * 4; y < h; y += gridStep * 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  });
}

/**
 * Style 4 (pixel_terminal): Near-black blue #05070D with soft monitor light-spill and radial vignette.
 */
export function getCachedPixelTerminalBackdrop(
  baseWidth: number,
  baseHeight: number,
  accentHex: string
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `pixel-term-bg|${w}x${h}|${accentHex}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    ctx.fillStyle = '#05070D';
    ctx.fillRect(0, 0, w, h);

    // Soft monitor light-spill in center
    const spill = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      w * 0.04,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.58
    );
    spill.addColorStop(0, hexToRgba(accentHex, 0.16));
    spill.addColorStop(0.45, hexToRgba(accentHex, 0.06));
    spill.addColorStop(1, 'rgba(5, 7, 13, 0)');
    ctx.fillStyle = spill;
    ctx.fillRect(0, 0, w, h);

    // CRT vignette
    const vig = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.25,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.72
    );
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.74)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * Style 4 (pixel_terminal): Cached pixel-grid/LCD mask and soft horizontal scanlines.
 */
export function getCachedLcdScanlineOverlay(
  baseWidth: number,
  baseHeight: number,
  pixelDensity: number
): HTMLCanvasElement {
  const w = Math.round(baseWidth);
  const h = Math.round(baseHeight);
  const step = Math.max(2, pixelDensity * 2);
  const key = `pixel-term-lcd|${w}x${h}|${step}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h);

    // Soft horizontal scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1.5);
    }

    // Subtle vertical LCD pixel-grid mesh
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let x = 0; x < w; x += step) {
      ctx.fillRect(x, 0, 1, h);
    }
  });
}

/**
 * Style 5 (old_typewriter): Dark walnut/mahogany desk #2A1F18 with wood grain, warm brass desk-lamp pool, and deep vignette.
 */
export function getCachedWoodDeskBackdrop(
  baseWidth: number,
  baseHeight: number,
  seed: number
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `wood-desk-bg-v2|${w}x${h}|${seed}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    ctx.fillStyle = '#241912';
    ctx.fillRect(0, 0, w, h);

    const rng = mulberry32(combineSeed(seed, 7101));
    // Rich wood-grain planks & streaks
    for (let i = 0; i < 85; i++) {
      const y = rng() * h;
      const bandH = 1.5 + rng() * 10;
      ctx.fillStyle =
        rng() > 0.48 ? 'rgba(14, 8, 4, 0.22)' : 'rgba(82, 54, 36, 0.14)';
      ctx.fillRect(0, y, w, bandH);
    }

    // Subtle horizontal plank join lines
    ctx.strokeStyle = 'rgba(10, 5, 2, 0.38)';
    ctx.lineWidth = 1.2;
    for (let py = h * 0.25; py < h; py += h * 0.25) {
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }

    // Warm tungsten desk-lamp light pool from top-center
    const lamp = ctx.createRadialGradient(
      w * 0.5,
      h * 0.24,
      w * 0.04,
      w * 0.5,
      h * 0.45,
      Math.max(w, h) * 0.68
    );
    lamp.addColorStop(0, 'rgba(255, 198, 120, 0.28)');
    lamp.addColorStop(0.45, 'rgba(210, 140, 68, 0.10)');
    lamp.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, w, h);

    // Deep warm desk vignette
    const vig = ctx.createRadialGradient(
      w * 0.5,
      h * 0.48,
      Math.min(w, h) * 0.22,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.74
    );
    vig.addColorStop(0, 'rgba(58, 42, 31, 0)');
    vig.addColorStop(0.62, 'rgba(12, 7, 4, 0.35)');
    vig.addColorStop(1, 'rgba(4, 2, 1, 0.84)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * Style 5 (old_typewriter): Archival cream paper sheet #F1E8D2 with cotton laid lines, warm lamp falloff, and fibers.
 */
export function getCachedTypewriterPaperSheet(
  sheetWidth: number,
  sheetHeight: number,
  seed: number
): HTMLCanvasElement {
  const w = Math.max(64, Math.round(sheetWidth));
  const h = Math.max(64, Math.round(sheetHeight));
  const key = `typewriter-sheet-v2|${w}x${h}|${seed}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    // Base warm archival cotton paper gradient (lit from top-center)
    const paperGrad = ctx.createRadialGradient(
      w * 0.5,
      h * 0.22,
      w * 0.05,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.85
    );
    paperGrad.addColorStop(0, '#FBF4E3');
    paperGrad.addColorStop(0.55, '#F1E8D2');
    paperGrad.addColorStop(1, '#DFCFAF');
    ctx.fillStyle = paperGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle horizontal laid-paper watermark lines
    ctx.strokeStyle = 'rgba(165, 145, 112, 0.11)';
    ctx.lineWidth = 1;
    for (let y = 8; y < h; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Vertical archival margin rules on left and right edges
    const marginOffset = Math.max(18, Math.round(w * 0.045));
    ctx.strokeStyle = 'rgba(179, 38, 30, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginOffset, 0);
    ctx.lineTo(marginOffset, h);
    ctx.moveTo(w - marginOffset, 0);
    ctx.lineTo(w - marginOffset, h);
    ctx.stroke();

    // Seeded fine paper fibers & flecks
    const rng = mulberry32(combineSeed(seed, 7205));
    const fiberCount = Math.min(320, Math.round((w * h) / 2500));
    ctx.lineWidth = 1;
    for (let i = 0; i < fiberCount; i++) {
      const fx = rng() * w;
      const fy = rng() * h;
      const len = 4 + rng() * 12;
      const ang = rng() * Math.PI * 2;
      ctx.strokeStyle =
        rng() > 0.42 ? 'rgba(125, 106, 78, 0.15)' : 'rgba(255, 252, 244, 0.36)';
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(ang) * len, fy + Math.sin(ang) * len);
      ctx.stroke();
    }

    // Subtle vintage warm edge toning and double border crease
    ctx.strokeStyle = 'rgba(140, 122, 92, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    ctx.strokeStyle = 'rgba(160, 142, 112, 0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(5, 5, w - 10, h - 10);
  });
}

// ============================================================================
// MULTI POINTS ("نقاط") CACHED BACKDROPS & TEXTURES
// ============================================================================

/**
 * pts_clean: Deep navy gradient #0B0F1A -> #141B2D with a faint grid.
 */
export function getCachedPtsCleanBackdrop(
  baseWidth: number,
  baseHeight: number,
  accentHex: string = '#4C8DFF'
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `pts-clean-bg|${w}x${h}|${accentHex}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0B0F1A');
    grad.addColorStop(1, '#141B2D');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle radial ambient glow
    const glow = ctx.createRadialGradient(
      w * 0.5,
      h * 0.45,
      w * 0.05,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.65
    );
    glow.addColorStop(0, hexToRgba(accentHex, 0.1));
    glow.addColorStop(1, 'rgba(11, 15, 26, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Faint grid
    const step = 32;
    ctx.strokeStyle = 'rgba(242, 245, 250, 0.038)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = step; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = step; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  });
}

/**
 * pts_cards: Soft light gradient #EEF1F7 -> #E2E7F2.
 */
export function getCachedPtsCardsBackdrop(
  baseWidth: number,
  baseHeight: number
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `pts-cards-bg|${w}x${h}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#F5F7FB');
    grad.addColorStop(0.55, '#EEF1F7');
    grad.addColorStop(1, '#E2E7F2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * pts_checklist: Cream lined notebook paper #F6F0E0 (cached texture) with a red margin line on the right (RTL).
 */
export function getCachedChecklistPaperSheet(
  sheetWidth: number,
  sheetHeight: number,
  seed: number,
  isLtr: boolean = false
): HTMLCanvasElement {
  const w = Math.max(64, Math.round(sheetWidth));
  const h = Math.max(64, Math.round(sheetHeight));
  const key = `pts-checklist-sheet|${w}x${h}|${seed}|${isLtr ? 'ltr' : 'rtl'}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    ctx.fillStyle = '#F6F0E0';
    ctx.fillRect(0, 0, w, h);

    const rng = mulberry32(combineSeed(seed, 8301));

    // Subtle organic paper grain & fibers
    ctx.lineWidth = 1;
    const fiberCount = Math.min(260, Math.round((w * h) / 2800));
    for (let i = 0; i < fiberCount; i++) {
      const fx = rng() * w;
      const fy = rng() * h;
      const len = 5 + rng() * 14;
      const ang = rng() * Math.PI * 2;
      ctx.strokeStyle =
        rng() > 0.45 ? 'rgba(140, 122, 92, 0.12)' : 'rgba(255, 253, 246, 0.35)';
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(ang) * len, fy + Math.sin(ang) * len);
      ctx.stroke();
    }

    // Horizontal blue notebook ruling lines
    const ruleStep = 38;
    const headerPad = 56;
    ctx.strokeStyle = 'rgba(65, 115, 185, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = headerPad; y < h - 18; y += ruleStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Vertical double red margin line on the right (RTL) or left (LTR)
    const marginDist = Math.max(44, Math.round(w * 0.085));
    const marginX = isLtr ? marginDist : w - marginDist;
    ctx.strokeStyle = 'rgba(214, 64, 69, 0.48)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(marginX, 0);
    ctx.lineTo(marginX, h);
    ctx.moveTo(marginX + (isLtr ? 4 : -4), 0);
    ctx.lineTo(marginX + (isLtr ? 4 : -4), h);
    ctx.stroke();

    // Subtle notebook sheet border
    ctx.strokeStyle = 'rgba(155, 138, 108, 0.38)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  });
}

/**
 * pts_timeline:
 * - 'dark': Luxury dark #070B14 -> #0E1526 with dual ambient glows and subtle architectural micro-grid.
 * - 'light': Calm snow-white gradient (#FFFFFF -> #F8FAFC -> #F1F5F9) with soft pastel accent halo and delicate micro-grid.
 */
export function getCachedPtsTimelineBackdrop(
  baseWidth: number,
  baseHeight: number,
  accentHex: string = '#4DD8FF',
  theme: 'dark' | 'light' = 'dark'
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `pts-timeline-bg-v3|${w}x${h}|${accentHex}|${theme}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    if (theme === 'light') {
      const baseGrad = ctx.createLinearGradient(0, 0, w, h);
      baseGrad.addColorStop(0, '#FFFFFF');
      baseGrad.addColorStop(0.52, '#F8FAFC');
      baseGrad.addColorStop(1, '#F1F5F9');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, w, h);

      const glow1 = ctx.createRadialGradient(
        w * 0.32,
        h * 0.36,
        w * 0.03,
        w * 0.32,
        h * 0.36,
        Math.max(w, h) * 0.62
      );
      glow1.addColorStop(0, hexToRgba(accentHex, 0.16));
      glow1.addColorStop(0.55, hexToRgba(accentHex, 0.06));
      glow1.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glow1;
      ctx.fillRect(0, 0, w, h);

      const glow2 = ctx.createRadialGradient(
        w * 0.72,
        h * 0.64,
        w * 0.03,
        w * 0.72,
        h * 0.64,
        Math.max(w, h) * 0.58
      );
      glow2.addColorStop(0, 'rgba(124, 92, 255, 0.10)');
      glow2.addColorStop(0.55, 'rgba(124, 92, 255, 0.035)');
      glow2.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, w, h);

      // Subtle architectural micro-grid + intersection dots for calm white theme
      const step = 36;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.032)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = step; x < w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = step; y < h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      ctx.fillStyle = hexToRgba(accentHex, 0.16);
      for (let x = step; x < w; x += step * 2) {
        for (let y = step; y < h; y += step * 2) {
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      }
      return;
    }

    const baseGrad = ctx.createLinearGradient(0, 0, w, h);
    baseGrad.addColorStop(0, '#070B14');
    baseGrad.addColorStop(0.5, '#0A0F1D');
    baseGrad.addColorStop(1, '#0D1324');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, w, h);

    const glow1 = ctx.createRadialGradient(
      w * 0.32,
      h * 0.38,
      w * 0.03,
      w * 0.32,
      h * 0.38,
      Math.max(w, h) * 0.58
    );
    glow1.addColorStop(0, hexToRgba(accentHex, 0.19));
    glow1.addColorStop(0.55, hexToRgba(accentHex, 0.06));
    glow1.addColorStop(1, 'rgba(7, 11, 20, 0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, w, h);

    const glow2 = ctx.createRadialGradient(
      w * 0.7,
      h * 0.62,
      w * 0.03,
      w * 0.7,
      h * 0.62,
      Math.max(w, h) * 0.58
    );
    glow2.addColorStop(0, 'rgba(124, 92, 255, 0.18)');
    glow2.addColorStop(0.55, 'rgba(124, 92, 255, 0.05)');
    glow2.addColorStop(1, 'rgba(7, 11, 20, 0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, w, h);

    // Subtle luxury architectural grid + intersection dots
    const step = 36;
    ctx.strokeStyle = 'rgba(242, 245, 250, 0.026)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = step; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = step; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    ctx.fillStyle = hexToRgba(accentHex, 0.08);
    for (let x = step; x < w; x += step * 2) {
      for (let y = step; y < h; y += step * 2) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  });
}

// ============================================================================
// IMAGE INSERT ("صورة") MODE PLACEHOLDER, FITTER, GREEN CHECK & CACHED ASSETS
// ============================================================================

/**
 * Generates a rich, crisp default placeholder image on canvas (1200x800) with zero external URLs.
 * Combines a scenic architectural/landscape dusk view with an overlaid analytics card so both
 * photographic styles (Polaroid, Cinematic, Newspaper) and screenshot styles (Browser, Spotlight) look great.
 */
export function getDefaultInsertImageCanvas(): HTMLCanvasElement {
  return getOrGenerateCachedCanvas('default-insert-image-v1', 1200, 800, (ctx, w, h) => {
    // 1. Deep twilight sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#0f172a');
    skyGrad.addColorStop(0.45, '#1e3a5f');
    skyGrad.addColorStop(0.78, '#b45309');
    skyGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Warm glowing sun / horizon light
    const sunGrad = ctx.createRadialGradient(w * 0.62, h * 0.56, 12, w * 0.62, h * 0.56, w * 0.35);
    sunGrad.addColorStop(0, 'rgba(253, 224, 71, 0.92)');
    sunGrad.addColorStop(0.35, 'rgba(251, 146, 60, 0.45)');
    sunGrad.addColorStop(1, 'rgba(251, 146, 60, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, w, h);

    // 3. Layered mountain & skyline silhouettes
    ctx.fillStyle = '#172554';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.68);
    ctx.lineTo(w * 0.22, h * 0.48);
    ctx.lineTo(w * 0.44, h * 0.61);
    ctx.lineTo(w * 0.72, h * 0.44);
    ctx.lineTo(w, h * 0.58);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.76);
    ctx.lineTo(w * 0.18, h * 0.64);
    ctx.lineTo(w * 0.38, h * 0.72);
    ctx.lineTo(w * 0.58, h * 0.6);
    ctx.lineTo(w * 0.84, h * 0.7);
    ctx.lineTo(w, h * 0.63);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // 4. Crisp UI / Analytics Card in the center (matches default 40% spotlight region [0.3..0.7])
    const cardX = w * 0.31;
    const cardY = h * 0.28;
    const cardW = w * 0.38;
    const cardH = h * 0.42;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.38)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 20);
    ctx.fill();
    ctx.stroke();

    // Header dots & bar inside card
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(cardX + 30, cardY + 30, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(226, 232, 240, 0.75)';
    ctx.beginPath();
    ctx.roundRect(cardX + 52, cardY + 23, cardW * 0.45, 14, 7);
    ctx.fill();

    // Rising chart bars inside the card
    const bars = [0.32, 0.48, 0.42, 0.68, 0.84, 0.96];
    const barAreaX = cardX + 36;
    const barAreaY = cardY + 72;
    const barAreaW = cardW - 72;
    const barAreaH = cardH - 104;
    const barGap = 16;
    const barW = (barAreaW - barGap * (bars.length - 1)) / bars.length;

    bars.forEach((bVal, idx) => {
      const bh = barAreaH * bVal;
      const bx = barAreaX + idx * (barW + barGap);
      const by = barAreaY + barAreaH - bh;
      ctx.fillStyle = idx === bars.length - 1 ? '#fbbf24' : '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(bx, by, barW, bh, 8);
      ctx.fill();
    });
    ctx.restore();
  });
}

export interface DrawnImageBounds {
  drawnX: number;
  drawnY: number;
  drawnW: number;
  drawnH: number;
}

/**
 * Draws an image into (destX, destY, destW, destH) using either 'cover' or 'contain' fit,
 * user crop (zoom, offsetX, offsetY), and optional pushInScale (1.0 -> 1.08),
 * never stretching the aspect ratio and preserving PNG transparency.
 */
export function drawFittedImage(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement | null | undefined,
  crop: CropState | undefined,
  fitMode: ImageFitMode,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  pushInScale: number = 1.0
): DrawnImageBounds {
  const img = source || getDefaultInsertImageCanvas();
  const srcW = 'naturalWidth' in img && img.naturalWidth > 0 ? img.naturalWidth : img.width;
  const srcH = 'naturalHeight' in img && img.naturalHeight > 0 ? img.naturalHeight : img.height;
  if (srcW <= 0 || srcH <= 0 || destW <= 0 || destH <= 0) {
    return { drawnX: destX, drawnY: destY, drawnW: destW, drawnH: destH };
  }

  const zoom = clamp((crop?.zoom || 1) * clamp(pushInScale, 0.9, 1.5), 1, 3.5);
  const offsetX = clamp(crop?.offsetX || 0, -1, 1);
  const offsetY = clamp(crop?.offsetY || 0, -1, 1);

  const destAspect = destW / destH;
  const srcAspect = srcW / srcH;

  if (fitMode === 'contain' && zoom <= 1.001) {
    let drawnW = destW;
    let drawnH = destH;
    if (srcAspect > destAspect) {
      drawnW = destW;
      drawnH = destW / srcAspect;
    } else {
      drawnH = destH;
      drawnW = destH * srcAspect;
    }
    const drawnX = destX + (destW - drawnW) * 0.5;
    const drawnY = destY + (destH - drawnH) * 0.5;
    ctx.drawImage(img, 0, 0, srcW, srcH, drawnX, drawnY, drawnW, drawnH);
    return { drawnX, drawnY, drawnW, drawnH };
  }

  if (fitMode === 'contain') {
    // Contain with user zoom/pan: compute fitted bounds, then zoom/pan inside those bounds
    let fitW = destW;
    let fitH = destH;
    if (srcAspect > destAspect) {
      fitW = destW;
      fitH = destW / srcAspect;
    } else {
      fitH = destH;
      fitW = destH * srcAspect;
    }
    const fitX = destX + (destW - fitW) * 0.5;
    const fitY = destY + (destH - fitH) * 0.5;

    const finalCropW = srcW / zoom;
    const finalCropH = srcH / zoom;
    const maxPanX = (srcW - finalCropW) / 2;
    const maxPanY = (srcH - finalCropH) / 2;
    const centerX = srcW / 2 - offsetX * maxPanX;
    const centerY = srcH / 2 - offsetY * maxPanY;
    const sx = clamp(centerX - finalCropW / 2, 0, srcW - finalCropW);
    const sy = clamp(centerY - finalCropH / 2, 0, srcH - finalCropH);

    ctx.drawImage(img, sx, sy, finalCropW, finalCropH, fitX, fitY, fitW, fitH);
    return { drawnX: fitX, drawnY: fitY, drawnW: fitW, drawnH: fitH };
  }

  // Cover mode
  let baseCropW = srcW;
  let baseCropH = srcH;
  if (srcAspect > destAspect) {
    baseCropW = srcH * destAspect;
  } else {
    baseCropH = srcW / destAspect;
  }

  const finalCropW = baseCropW / zoom;
  const finalCropH = baseCropH / zoom;
  const maxPanX = (srcW - finalCropW) / 2;
  const maxPanY = (srcH - finalCropH) / 2;
  const centerX = srcW / 2 - offsetX * maxPanX;
  const centerY = srcH / 2 - offsetY * maxPanY;
  const sx = clamp(centerX - finalCropW / 2, 0, srcW - finalCropW);
  const sy = clamp(centerY - finalCropH / 2, 0, srcH - finalCropH);

  ctx.drawImage(img, sx, sy, finalCropW, finalCropH, destX, destY, destW, destH);
  return { drawnX: destX, drawnY: destY, drawnW: destW, drawnH: destH };
}

const greenRatioCache = new Map<string, number>();

/**
 * Measures on a cached downscaled copy (64x64) the fraction of pixels in the green hue range.
 * Used to warn the user if > ~8% of the image's pixels are green-hued when Chroma Key Green is selected.
 */
export function getImageGreenPixelRatio(
  source: HTMLImageElement | HTMLCanvasElement | null | undefined,
  imageId: string = 'default-insert-image'
): number {
  const key = `green-ratio|${imageId}`;
  if (greenRatioCache.has(key)) {
    return greenRatioCache.get(key)!;
  }

  const img = source || getDefaultInsertImageCanvas();
  const sampleW = 64;
  const sampleH = 64;
  const canvas = createBufferCanvas(sampleW, sampleH);
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  ctx.clearRect(0, 0, sampleW, sampleH);
  ctx.drawImage(img, 0, 0, sampleW, sampleH);

  try {
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
    let totalOpaque = 0;
    let greenPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a >= 32) {
        totalOpaque++;
        if (isRgbPixelGreenHue(r, g, b, a)) {
          greenPixels++;
        }
      }
    }
    const ratio = totalOpaque > 0 ? greenPixels / totalOpaque : 0;
    if (greenRatioCache.size > 60) {
      const firstKey = greenRatioCache.keys().next().value;
      if (firstKey) greenRatioCache.delete(firstKey);
    }
    greenRatioCache.set(key, ratio);
    return ratio;
  } catch {
    return 0;
  }
}

/**
 * img_polaroid: Dark warm wall #2A1F18 with soft vignette.
 */
export function getCachedPolaroidWallBackdrop(
  baseWidth: number,
  baseHeight: number,
  seed: number = 1042
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `img-polaroid-wall|${w}x${h}|${seed}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    ctx.fillStyle = '#2A1F18';
    ctx.fillRect(0, 0, w, h);

    // Warm spotlight pool
    const pool = ctx.createRadialGradient(
      w * 0.5,
      h * 0.45,
      w * 0.04,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.72
    );
    pool.addColorStop(0, 'rgba(255, 214, 165, 0.14)');
    pool.addColorStop(0.55, 'rgba(42, 31, 24, 0)');
    pool.addColorStop(1, 'rgba(8, 5, 3, 0.74)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * img_browser: Gradient #1B2340 -> #3A2A6B with soft ambient glow.
 */
export function getCachedBrowserBackdrop(
  baseWidth: number,
  baseHeight: number,
  accentHex: string = '#4C8DFF'
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `img-browser-bg|${w}x${h}|${accentHex}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1B2340');
    grad.addColorStop(1, '#3A2A6B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(
      w * 0.5,
      h * 0.45,
      w * 0.05,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.65
    );
    glow.addColorStop(0, hexToRgba(accentHex, 0.18));
    glow.addColorStop(1, 'rgba(27, 35, 64, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  });
}

/**
 * img_newspaper: Aged newsprint paper texture (#EAE0C8 with fibers and column rules).
 */
export function getCachedNewsprintPaperCanvas(
  width: number,
  height: number,
  seed: number
): HTMLCanvasElement {
  const w = Math.max(64, Math.round(width));
  const h = Math.max(64, Math.round(height));
  const key = `img-newsprint-sheet|${w}x${h}|${seed}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const grad = ctx.createRadialGradient(
      w * 0.5,
      h * 0.45,
      w * 0.06,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.78
    );
    grad.addColorStop(0, '#F3EBD7');
    grad.addColorStop(0.65, '#E7DCC2');
    grad.addColorStop(1, '#D3C3A3');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const rng = mulberry32(combineSeed(seed, 9103));
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (rng() - 0.5) * 18;
      data[i] = clamp(data[i] + n, 0, 255);
      data[i + 1] = clamp(data[i + 1] + n * 0.92, 0, 255);
      data[i + 2] = clamp(data[i + 2] + n * 0.78, 0, 255);
    }
    ctx.putImageData(imgData, 0, 0);

    // Subtle newsprint fibers
    ctx.lineWidth = 1;
    const fiberCount = Math.min(220, Math.round((w * h) / 2600));
    for (let i = 0; i < fiberCount; i++) {
      const fx = rng() * w;
      const fy = rng() * h;
      const len = 4 + rng() * 12;
      const ang = rng() * Math.PI * 2;
      ctx.strokeStyle =
        rng() > 0.45 ? 'rgba(95, 80, 58, 0.14)' : 'rgba(255, 252, 242, 0.32)';
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(ang) * len, fy + Math.sin(ang) * len);
      ctx.stroke();
    }
  });
}

/**
 * img_newspaper: Cached black-and-white halftone (grayscale + dot pattern) or color copy of the image.
 * Preserves PNG alpha transparency.
 */
export function getCachedHalftoneImageCanvas(
  source: HTMLImageElement | HTMLCanvasElement | null | undefined,
  imageId: string,
  crop: CropState,
  fitMode: ImageFitMode,
  width: number,
  height: number,
  keepColor: boolean = false
): HTMLCanvasElement {
  const w = Math.max(24, Math.round(width));
  const h = Math.max(24, Math.round(height));
  const key = `img-halftone|${imageId}|${crop.zoom.toFixed(2)}|${crop.offsetX.toFixed(2)}|${crop.offsetY.toFixed(2)}|${fitMode}|${w}x${h}|color=${keepColor ? 1 : 0}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h);
    drawFittedImage(ctx, source, crop, fitMode, 0, 0, w, h, 1.0);

    if (keepColor) return;

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // 1. Convert to warm newsprint grayscale contrast
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 8) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const contrasted = clamp((lum - 0.5) * 1.25 + 0.52, 0.08, 0.95);
      // Mix between dark newsprint ink (#1E1B18) and warm paper (#EFE5CE)
      data[i] = Math.round(lerp(30, 239, contrasted));
      data[i + 1] = Math.round(lerp(27, 229, contrasted));
      data[i + 2] = Math.round(lerp(24, 206, contrasted));
    }
    ctx.putImageData(imgData, 0, 0);

    // 2. Overlay halftone dot pattern where pixels are opaque
    const step = 6;
    ctx.save();
    for (let y = 3; y < h; y += step) {
      for (let x = 3; x < w; x += step) {
        const idx = (y * w + x) * 4;
        const a = data[idx + 3];
        if (a < 40) continue;
        const lum = data[idx] / 255;
        const darkness = clamp(1 - lum, 0, 1);
        if (darkness > 0.12) {
          const radius = darkness * (step * 0.42);
          ctx.fillStyle = 'rgba(24, 20, 16, 0.34)';
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  });
}

/**
 * img_cinematic: Cached fitted & graded (normal or teal-and-orange) copy of the image.
 */
export function getCachedFittedGradedImageCanvas(
  source: HTMLImageElement | HTMLCanvasElement | null | undefined,
  imageId: string,
  crop: CropState,
  fitMode: ImageFitMode,
  width: number,
  height: number,
  tealOrangeGrade: boolean = true
): HTMLCanvasElement {
  const w = Math.max(24, Math.round(width));
  const h = Math.max(24, Math.round(height));
  const key = `img-cin-grade|${imageId}|${crop.zoom.toFixed(2)}|${crop.offsetX.toFixed(2)}|${crop.offsetY.toFixed(2)}|${fitMode}|${w}x${h}|grade=${tealOrangeGrade ? 1 : 0}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h);
    drawFittedImage(ctx, source, crop, fitMode, 0, 0, w, h, 1.0);

    if (!tealOrangeGrade) return;

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const desatR = lerp(r, lum * 255, 0.28);
      const desatG = lerp(g, lum * 255, 0.28);
      const desatB = lerp(b, lum * 255, 0.28);

      const shadowWeight = Math.pow(1 - lum, 1.45);
      const highlightWeight = Math.pow(lum, 1.35);

      data[i] = clamp(desatR - shadowWeight * 22 + highlightWeight * 32, 0, 255);
      data[i + 1] = clamp(desatG + shadowWeight * 8 + highlightWeight * 10, 0, 255);
      data[i + 2] = clamp(desatB + shadowWeight * 30 - highlightWeight * 24, 0, 255);
    }
    ctx.putImageData(imgData, 0, 0);
  });
}

/**
 * img_floating: Soft pastel gradient with faint blobs.
 */
export function getCachedFloatingPastelBackdrop(
  baseWidth: number,
  baseHeight: number,
  accentHex: string = '#6366F1',
  seed: number = 1042
): HTMLCanvasElement {
  const w = Math.round(baseWidth * 0.5);
  const h = Math.round(baseHeight * 0.5);
  const key = `img-floating-bg|${w}x${h}|${accentHex}|${seed}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#F5F3FF');
    grad.addColorStop(0.5, '#EEF2FF');
    grad.addColorStop(1, '#FCE7F3');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const rng = mulberry32(combineSeed(seed, 9401));
    const blobColors = [
      hexToRgba(accentHex, 0.16),
      'rgba(236, 72, 153, 0.13)',
      'rgba(56, 189, 248, 0.14)',
      'rgba(168, 85, 247, 0.12)',
    ];
    for (let i = 0; i < 5; i++) {
      const bx = (0.15 + rng() * 0.7) * w;
      const by = (0.15 + rng() * 0.7) * h;
      const br = (0.22 + rng() * 0.25) * Math.min(w, h);
      const bGrad = ctx.createRadialGradient(bx, by, br * 0.05, bx, by, br);
      bGrad.addColorStop(0, blobColors[i % blobColors.length]);
      bGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}


