import {
  ArabicFontFamily,
  BackgroundMode,
  CropState,
  EnglishFontFamily,
  ImageFitMode,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  TimelineConfig,
} from '../types';
import {
  drawFittedImage,
  getCachedPolaroidWallBackdrop,
  getDefaultInsertImageCanvas,
} from '../utils/assetCache';
import {
  clamp,
  DEFAULT_IMAGE_CAPTION,
  DEFAULT_IMAGE_SOURCE_LINE,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  getEffectiveTimeline,
  getImagePositionBox,
   getTypingConfigForCustomization,
  lerp,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
  stripKeywordMarkers,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  ArabicQuoteLayout,
  drawBidiWord,
  KeywordLineRect,
  layoutArabicQuote,
} from '../utils/textLayout';

export interface ImagePoint2D {
  x: number;
  y: number;
}

export function sampleImageCatmullRom(
  controlPoints: ImagePoint2D[],
  samplesPerSegment: number = 12
): ImagePoint2D[] {
  if (controlPoints.length < 2) return controlPoints;
  const result: ImagePoint2D[] = [];
  const n = controlPoints.length;

  for (let i = 0; i < n - 1; i++) {
    const p0 = controlPoints[Math.max(0, i - 1)];
    const p1 = controlPoints[i];
    const p2 = controlPoints[i + 1];
    const p3 = controlPoints[Math.min(n - 1, i + 2)];

    for (let s = 0; s < samplesPerSegment; s++) {
      const u = s / samplesPerSegment;
      const u2 = u * u;
      const u3 = u2 * u;

      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * u +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * u +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);

      result.push({ x, y });
    }
  }
  result.push(controlPoints[n - 1]);
  return result;
}

export function drawImageTrimmedPolyline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  polyline: ImagePoint2D[],
  trimProgress: number,
  strokeWidth: number,
  color: string,
  doubleStroke: boolean,
  seed: number
): void {
  const p = clamp(trimProgress, 0, 1);
  if (p <= 0.005 || polyline.length < 2) return;

  const maxIdxFloat = p * (polyline.length - 1);
  const maxIdx = Math.floor(maxIdxFloat);
  const frac = maxIdxFloat - maxIdx;

  const drawPass = (offsetX: number, offsetY: number, width: number, alphaMult: number) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha *= alphaMult;

    ctx.beginPath();
    ctx.moveTo(polyline[0].x + offsetX, polyline[0].y + offsetY);
    for (let i = 1; i <= maxIdx; i++) {
      ctx.lineTo(polyline[i].x + offsetX, polyline[i].y + offsetY);
    }
    if (maxIdx < polyline.length - 1 && frac > 0) {
      const cur = polyline[maxIdx];
      const next = polyline[maxIdx + 1];
      ctx.lineTo(lerp(cur.x, next.x, frac) + offsetX, lerp(cur.y, next.y, frac) + offsetY);
    }
    ctx.stroke();
    ctx.restore();
  };

  drawPass(0, 0, strokeWidth, 1.0);

  if (doubleStroke) {
    const rng = mulberry32(combineSeed(seed, 7301));
    const ox = (rng() - 0.5) * 3.2;
    const oy = 1.4 + rng() * 2.2;
    drawPass(ox, oy, strokeWidth * 0.65, 0.8);
  }
}

export function resolveImageContentParams(
  content: QuoteContent,
  custom: StyleCustomization,
  defaultFit: ImageFitMode = 'cover'
): {
  source: HTMLImageElement | HTMLCanvasElement;
  imageId: string;
  crop: CropState;
  fitMode: ImageFitMode;
  caption: string;
  hasCaption: boolean;
  sourceLine: string;
  hasSourceLine: boolean;
  direction: ResolvedTextDirection;
} {
  const source =
    content.imageSource || content.photoSource || getDefaultInsertImageCanvas();
  const imageId = content.imageId || content.photoId || 'default-insert-image';
  const crop = content.imageCrop || content.crop || { zoom: 1, offsetX: 0, offsetY: 0 };
  const fitMode: ImageFitMode = custom.imageFit || defaultFit;

  const rawCaption =
    custom.imageCaption !== undefined
      ? custom.imageCaption
      : content.imageCaption !== undefined
        ? content.imageCaption
        : DEFAULT_IMAGE_CAPTION;

  const rawSourceLine =
    custom.imageSourceLine !== undefined
      ? custom.imageSourceLine
      : content.imageSourceLine !== undefined
        ? content.imageSourceLine
        : DEFAULT_IMAGE_SOURCE_LINE;

  const cleanCaption = stripKeywordMarkers(rawCaption || '').trim();
  const hasCaption = cleanCaption.length > 0;
  const sourceLine = (rawSourceLine || '').trim();
  const hasSourceLine = sourceLine.length > 0;
  const direction = resolveTextDirection(custom, rawCaption || sourceLine || DEFAULT_IMAGE_CAPTION);

  return {
    source,
    imageId,
    crop,
    fitMode,
    caption: rawCaption || '',
    hasCaption,
    sourceLine,
    hasSourceLine,
    direction,
  };
}

export interface FittedImageSlot {
  photoW: number;
  photoH: number;
  srcW: number;
  srcH: number;
  imgAspect: number;
}

export function getImageSourceDimensions(
  source: HTMLImageElement | HTMLCanvasElement
): { srcW: number; srcH: number; imgAspect: number } {
  const srcW =
    'naturalWidth' in source && source.naturalWidth > 0
      ? source.naturalWidth
      : source.width || 800;
  const srcH =
    'naturalHeight' in source && source.naturalHeight > 0
      ? source.naturalHeight
      : source.height || 600;
  const imgAspect = clamp(srcW / Math.max(1, srcH), 0.28, 3.6);
  return { srcW, srcH, imgAspect };
}

/**
 * Fits a photo viewport inside (maxPhotoW, maxPhotoH) while matching the source image's
 * natural aspect ratio cleanly (zero cropping and zero blank bars at zoom=1).
 */
export function fitImageSlotInBox(
  source: HTMLImageElement | HTMLCanvasElement,
  maxPhotoW: number,
  maxPhotoH: number,
  minFloor: number = 48
): FittedImageSlot {
  const { srcW, srcH, imgAspect } = getImageSourceDimensions(source);
  const availW = Math.max(minFloor, maxPhotoW);
  const availH = Math.max(minFloor, maxPhotoH);

  let photoW = availW;
  let photoH = photoW / imgAspect;
  if (photoH > availH) {
    photoH = availH;
    photoW = photoH * imgAspect;
  }

  return {
    photoW: Math.max(minFloor, Math.round(photoW)),
    photoH: Math.max(minFloor, Math.round(photoH)),
    srcW,
    srcH,
    imgAspect,
  };
}

export function computeImagePushInScale(
  t: number,
  totalDuration: number,
  enabled?: boolean
): number {
  if (!enabled) return 1.0;
  const p = progress(t, 0, Math.max(0.5, totalDuration));
  return lerp(1.0, 1.08, p);
}

export function computeImageCaptionKeywordTimes(
  layout: ArabicQuoteLayout | null,
  captionStartSec: number,
  captionRevealDur: number = 0.45
): number[] {
  if (!layout || layout.words.length === 0) return [];
  const totalWords = Math.max(1, layout.words.length);
  const seenGroups = new Set<number>();
  const keywordTimes: number[] = [];

  for (const w of layout.words) {
    if (w.isKeyword && w.groupId !== null && !seenGroups.has(w.groupId)) {
      seenGroups.add(w.groupId);
      const frac = totalWords > 1 ? w.globalWordIndex / totalWords : 0;
      keywordTimes.push(Number((captionStartSec + frac * captionRevealDur * 0.75).toFixed(3)));
    }
  }
  return keywordTimes;
}

export function drawImageCaptionBlock(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: ArabicQuoteLayout,
  t: number,
  captionStartSec: number,
  textColor: string,
  keywordColor: string,
  keywordStyle: 'underline' | 'hand-underline' | 'red-circle',
  seed: number,
  alpha: number = 1
): void {
  if (!layout || layout.lines.length === 0 || alpha <= 0.005) return;
  const revealP = easeOutCubic(progress(t, captionStartSec, captionStartSec + 0.42));
  if (revealP <= 0.005) return;

  ctx.save();
  ctx.globalAlpha *= alpha * revealP;

  for (const w of layout.words) {
    applyStudioCanvasTextProps(
      ctx,
      layout.fontFamily,
      layout.fontWeight,
      w.fontSize,
      layout.direction
    );
    ctx.fillStyle = w.isKeyword ? keywordColor : textColor;
    drawBidiWord(ctx, w.text, w.x, w.y, layout.direction);
  }

  // Keyword decorations (thin underline, hand-drawn underline, or red marker circle)
  for (let rIdx = 0; rIdx < layout.keywordLineRects.length; rIdx++) {
    const rect: KeywordLineRect = layout.keywordLineRects[rIdx];
    const kwStart = captionStartSec + 0.14 + rIdx * 0.08;
    const kwProg = easeInOutCubic(progress(t, kwStart, kwStart + 0.38));
    if (kwProg <= 0.01) continue;

    if (keywordStyle === 'underline') {
      const lineY = rect.baselineY + Math.max(4, layout.fontSize * 0.14);
      const fullW = rect.width;
      const curW = fullW * kwProg;
      const startX = layout.direction === 'ltr' ? rect.leftX : rect.rightX;
      const endX = layout.direction === 'ltr' ? rect.leftX + curW : rect.rightX - curW;

      ctx.save();
      ctx.strokeStyle = keywordColor;
      ctx.lineWidth = Math.max(2, layout.fontSize * 0.075);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, lineY);
      ctx.lineTo(endX, lineY);
      ctx.stroke();
      ctx.restore();
    } else if (keywordStyle === 'hand-underline') {
      const rng = mulberry32(combineSeed(seed, 8100 + rIdx * 43));
      const yBase = rect.baselineY + Math.max(5, layout.fontSize * 0.18);
      const fromX = layout.direction === 'ltr' ? rect.leftX - 4 : rect.rightX + 4;
      const toX = layout.direction === 'ltr' ? rect.rightX + 4 : rect.leftX - 4;
      const ctrl: ImagePoint2D[] = [];
      for (let s = 0; s <= 5; s++) {
        const f = s / 5;
        ctrl.push({
          x: lerp(fromX, toX, f),
          y: yBase + Math.sin(f * Math.PI * 2.5) * 2.5 + (rng() - 0.5) * 2.2,
        });
      }
      const poly = sampleImageCatmullRom(ctrl, 10);
      drawImageTrimmedPolyline(
        ctx,
        poly,
        kwProg,
        clamp(layout.fontSize * 0.09, 2.5, 5),
        keywordColor,
        true,
        seed + rIdx
      );
    } else if (keywordStyle === 'red-circle') {
      const rng = mulberry32(combineSeed(seed, 8200 + rIdx * 59));
      const cx = (rect.leftX + rect.rightX) * 0.5;
      const cy = (rect.topY + rect.bottomY) * 0.52;
      const rx = rect.width * 0.56 + 12;
      const ry = (rect.bottomY - rect.topY) * 0.58 + 8;
      const ctrl: ImagePoint2D[] = [];
      const steps = 10;
      for (let s = 0; s <= steps; s++) {
        const ang = -0.3 + (s / steps) * Math.PI * 2.14;
        const jr = 1 + (rng() - 0.5) * 0.08;
        ctrl.push({
          x: cx + Math.cos(ang) * rx * jr,
          y: cy + Math.sin(ang) * ry * jr,
        });
      }
      const poly = sampleImageCatmullRom(ctrl, 10);
      drawImageTrimmedPolyline(
        ctx,
        poly,
        kwProg,
        clamp(layout.fontSize * 0.1, 3, 6),
        keywordColor,
        true,
        seed + rIdx
      );
    }
  }

  ctx.restore();
}

export type ImageBottomScrimTheme = 'dark' | 'light-paper' | 'newsprint';

export interface ImageBottomOverlayParams {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  photoX: number;
  photoY: number;
  photoW: number;
  photoH: number;
  caption: string;
  hasCaption: boolean;
  sourceLine?: string;
  hasSourceLine?: boolean;
  fontFamily: string;
  fontSizeMultiplier: number;
  direction: ResolvedTextDirection;
  textColor: string;
  keywordColor: string;
  keywordStyle: 'underline' | 'hand-underline' | 'red-circle';
  accentLineColor?: string;
  scrimTheme: ImageBottomScrimTheme;
  isGreen: boolean;
  t: number;
  captionStartSec: number;
  revealAlpha?: number;
  seed: number;
}

export function computeImageBottomCaptionLayout(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  photoW: number,
  photoH: number,
  caption: string,
  fontFamily: string,
  fontSizeMultiplier: number,
  direction: ResolvedTextDirection
): ArabicQuoteLayout {
  const padX = clamp(Math.round(photoW * 0.055), 10, 26);
  const maxOverlayH = Math.max(46, Math.round(photoH * 0.44));
  const maxFont = clamp(Math.round(Math.min(photoW * 0.068, photoH * 0.088)), 14, 34);
  return layoutArabicQuote(ctx, {
    text: caption,
    quotationMarks: 'none',
    fontFamily,
    fontWeight: 700,
    minFontSize: 11,
    maxFontSize: maxFont,
    fontSizeMultiplier: fontSizeMultiplier || 1.0,
    lineHeightRatio: 1.34,
    boxX: padX,
    boxY: 0,
    boxWidth: Math.max(64, photoW - padX * 2),
    boxHeight: Math.max(30, maxOverlayH - 22),
    align: 'center',
    direction,
  });
}

/**
 * Draws the caption (and optional source line) in a soft translucent overlay anchored
 * along the bottom edge strictly inside the photo bounds (or solid plate in green mode).
 */
export function drawImageBottomCaptionOverlay(params: ImageBottomOverlayParams): void {
  const {
    ctx,
    photoX,
    photoY,
    photoW,
    photoH,
    caption,
    hasCaption,
    sourceLine = '',
    hasSourceLine = false,
    fontFamily,
    fontSizeMultiplier,
    direction,
    textColor,
    keywordColor,
    keywordStyle,
    accentLineColor,
    scrimTheme,
    isGreen,
    t,
    captionStartSec,
    revealAlpha = 1.0,
    seed,
  } = params;

  if (!hasCaption && !hasSourceLine) return;
  const appearP = easeOutCubic(progress(t, captionStartSec, captionStartSec + 0.38));
  const effectiveAlpha = isGreen ? (appearP > 0.2 ? 1 : 0) : clamp(appearP * revealAlpha, 0, 1);
  if (effectiveAlpha <= 0.01) return;

  const padX = clamp(Math.round(photoW * 0.055), 10, 26);
  const padTop = clamp(Math.round(photoH * 0.028), 8, 16);
  const padBottom = clamp(Math.round(photoH * 0.032), 8, 18);
  const maxOverlayH = Math.max(46, Math.round(photoH * 0.48));
  const srcSize = hasSourceLine ? clamp(Math.round(Math.min(photoW, photoH) * 0.032), 10, 15) : 0;
  const srcReserve = hasSourceLine ? srcSize + 8 : 0;

  let measureLayout: ArabicQuoteLayout | null = null;
  if (hasCaption) {
    const maxFont = clamp(Math.round(Math.min(photoW * 0.068, photoH * 0.088)), 14, 34);
    measureLayout = layoutArabicQuote(ctx, {
      text: caption,
      quotationMarks: 'none',
      fontFamily,
      fontWeight: 700,
      minFontSize: 11,
      maxFontSize: maxFont,
      fontSizeMultiplier: fontSizeMultiplier || 1.0,
      lineHeightRatio: 1.34,
      boxX: photoX + padX,
      boxY: photoY,
      boxWidth: Math.max(64, photoW - padX * 2),
      boxHeight: Math.max(28, maxOverlayH - padTop - padBottom - srcReserve),
      align: 'center',
      direction,
    });
  }

  const contentH =
    (measureLayout ? measureLayout.totalHeight : 0) + srcReserve + padTop + padBottom;
  const overlayH = clamp(Math.round(contentH), 34, maxOverlayH);
  const overlayY = photoY + photoH - overlayH;

  ctx.save();
  // Clip strictly inside photo rectangle
  ctx.beginPath();
  ctx.rect(photoX, photoY, photoW, photoH);
  ctx.clip();

  if (isGreen) {
    // GREEN mode: opaque hard-edged plate inside image bounds (zero alpha feathering)
    ctx.globalAlpha *= effectiveAlpha;
    if (scrimTheme === 'light-paper') {
      ctx.fillStyle = '#FAF7F0';
    } else if (scrimTheme === 'newsprint') {
      ctx.fillStyle = '#EFE7D6';
    } else {
      ctx.fillStyle = '#0B0F17';
    }
    ctx.fillRect(photoX, overlayY, photoW, overlayH);

    if (accentLineColor) {
      ctx.fillStyle = accentLineColor;
      ctx.fillRect(photoX, overlayY, photoW, 2.5);
    }
  } else {
    // STYLE / BLACK mode: soft translucent feathered gradient rising from the bottom edge
    const fadeLead = Math.min(34, Math.round(photoH * 0.14));
    const gradTop = Math.max(photoY, overlayY - fadeLead);
    const scrimGrad = ctx.createLinearGradient(0, gradTop, 0, photoY + photoH);

    if (scrimTheme === 'light-paper') {
      scrimGrad.addColorStop(0, 'rgba(250, 247, 240, 0)');
      scrimGrad.addColorStop(0.28, `rgba(250, 247, 240, ${(0.62 * effectiveAlpha).toFixed(3)})`);
      scrimGrad.addColorStop(0.65, `rgba(250, 247, 240, ${(0.86 * effectiveAlpha).toFixed(3)})`);
      scrimGrad.addColorStop(1, `rgba(250, 247, 240, ${(0.94 * effectiveAlpha).toFixed(3)})`);
    } else if (scrimTheme === 'newsprint') {
      scrimGrad.addColorStop(0, 'rgba(239, 231, 214, 0)');
      scrimGrad.addColorStop(0.28, `rgba(239, 231, 214, ${(0.65 * effectiveAlpha).toFixed(3)})`);
      scrimGrad.addColorStop(0.65, `rgba(239, 231, 214, ${(0.88 * effectiveAlpha).toFixed(3)})`);
      scrimGrad.addColorStop(1, `rgba(239, 231, 214, ${(0.95 * effectiveAlpha).toFixed(3)})`);
    } else {
      scrimGrad.addColorStop(0, 'rgba(6, 10, 18, 0)');
      scrimGrad.addColorStop(0.26, `rgba(6, 10, 18, ${(0.56 * effectiveAlpha).toFixed(3)})`);
      scrimGrad.addColorStop(0.64, `rgba(6, 10, 18, ${(0.82 * effectiveAlpha).toFixed(3)})`);
      scrimGrad.addColorStop(1, `rgba(6, 10, 18, ${(0.92 * effectiveAlpha).toFixed(3)})`);
    }

    ctx.fillStyle = scrimGrad;
    ctx.fillRect(photoX, gradTop, photoW, photoY + photoH - gradTop);

    if (accentLineColor) {
      ctx.save();
      ctx.globalAlpha *= effectiveAlpha * 0.78;
      ctx.strokeStyle = accentLineColor;
      ctx.lineWidth = 1.6;
      const ruleW = photoW * 0.62 * appearP;
      ctx.beginPath();
      ctx.moveTo(photoX + (photoW - ruleW) * 0.5, overlayY);
      ctx.lineTo(photoX + (photoW + ruleW) * 0.5, overlayY);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (hasCaption) {
    const maxFont = clamp(Math.round(Math.min(photoW * 0.068, photoH * 0.088)), 14, 34);
    const finalLayout = layoutArabicQuote(ctx, {
      text: caption,
      quotationMarks: 'none',
      fontFamily,
      fontWeight: 700,
      minFontSize: 11,
      maxFontSize: maxFont,
      fontSizeMultiplier: fontSizeMultiplier || 1.0,
      lineHeightRatio: 1.34,
      boxX: photoX + padX,
      boxY: overlayY + padTop,
      boxWidth: Math.max(64, photoW - padX * 2),
      boxHeight: Math.max(26, overlayH - padTop - padBottom - srcReserve),
      align: 'center',
      direction,
    });

    drawImageCaptionBlock(
      ctx,
      finalLayout,
      t,
      captionStartSec,
      textColor,
      keywordColor,
      keywordStyle,
      seed,
      effectiveAlpha
    );
  }

  if (hasSourceLine && srcSize > 0) {
    ctx.save();
    ctx.globalAlpha *= effectiveAlpha * (scrimTheme === 'dark' ? 0.84 : 0.78);
    applyStudioCanvasTextProps(ctx, 'Cairo', 600, srcSize, direction);
    ctx.fillStyle =
      scrimTheme === 'dark'
        ? '#CBD5E1'
        : scrimTheme === 'newsprint'
          ? '#4A4035'
          : '#6E5D4F';
    const srcW = ctx.measureText(sourceLine).width;
    const srcY = photoY + photoH - Math.max(6, Math.round(padBottom * 0.55));
    drawBidiWord(ctx, sourceLine, photoX + photoW * 0.5 + srcW * 0.5, srcY, direction);
    ctx.restore();
  }

  ctx.restore();
}

export const IMG_POLAROID_CONFIG = {
  id: 'img_polaroid' as const,
  mode: 'image' as const,
  nameAr: 'بولارويد معلّقة',
  nameEn: 'Hanging Polaroid',
  descriptionAr:
    'إطار بولارويد أبيض كلاسيكي مائل بشريط لاصق وظل ناعم وشريط تعليق بخط اليد مع تأرجح فيزيائي عند الدخول',
  defaultAccent: '#D97706',
  defaultKeywordColor: '#B3261E',
  defaultQuoteFont: 'Aref Ruqaa' as ArabicFontFamily,
  defaultAuthorFont: 'Katibeh' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Playfair Display' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Lora' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  defaultImageFit: 'cover' as ImageFitMode,
  allowedFonts: [
    'Aref Ruqaa',
    'Katibeh',
    'Amiri',
    'Cairo',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
    'KOMission Black',
    'Zain Rounded instance mob',
    '29LT Azahar Display AL TN Trial Bold',
  ] as ArabicFontFamily[],
  allowedEnglishFonts: ['Playfair Display', 'Lora', 'Cormorant Garamond'] as EnglishFontFamily[],
  colors: {
    wallBg: '#2A1F18',
    frameWhite: '#FAF7F0',
    photoSlotBg: '#181411',
    inkText: '#231B15',
    sourceText: '#6E5D4F',
    tapeTranslucent: 'rgba(244, 232, 198, 0.68)',
    tapeOpaque: '#EBD9A8',
    hardShadow: '#120D0A',
  },
  fonts: {
    captionAr: 'Aref Ruqaa' as ArabicFontFamily,
    captionAltAr: 'Katibeh' as ArabicFontFamily,
    captionEn: 'Playfair Display' as EnglishFontFamily,
  },
  sizes: {
    borderSideRatio: 0.048,
    borderTopRatio: 0.048,
    borderBottomWithCaptionRatio: 0.24,
    borderBottomNoCaptionRatio: 0.11,
    tapeWidthRatio: 0.24,
    tapeHeightPx: 30,
  },
  timings: {
    enterDuration: 0.8,
    holdDuration: 3.0,
    exitDuration: 0.6,
  },
};

export function getImgPolaroidEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const { baseWidth: W, baseHeight: H } = size;
  const { enter } = getEffectiveTimeline(
    timeline,
    content.quoteText,
    'image',
    0.35,
    getTypingConfigForCustomization(custom)
  );
  const resolved = resolveImageContentParams(
    content,
    custom,
    IMG_POLAROID_CONFIG.defaultImageFit
  );
  const posBox = getImagePositionBox(
    custom.position || 'center',
    custom.format,
    W,
    H,
    custom.imageScale ?? 1.0
  );

  const font =
    custom.quoteFontOverride ||
    (resolved.direction === 'ltr'
      ? IMG_POLAROID_CONFIG.fonts.captionEn
      : IMG_POLAROID_CONFIG.fonts.captionAr);

  const padForTilt = Math.round(Math.min(posBox.boxWidth, posBox.boxHeight) * 0.085);
  const availOuterW = Math.max(140, posBox.boxWidth - padForTilt * 2);
  const availOuterH = Math.max(130, posBox.boxHeight - padForTilt * 2);
  const estSide = Math.max(10, Math.round(availOuterW * 0.045));
  const estTop = Math.max(10, Math.round(availOuterH * 0.045));
  const estBottom = Math.max(14, Math.round(availOuterH * 0.075));
  const fitted = fitImageSlotInBox(
    resolved.source,
    availOuterW - estSide * 2,
    availOuterH - estTop - estBottom
  );

  let keywordTimes: number[] = [];
  if (resolved.hasCaption) {
    const layout = computeImageBottomCaptionLayout(
      ctx,
      fitted.photoW,
      fitted.photoH,
      resolved.caption,
      font,
      custom.fontSizeMultiplier || 1.0,
      resolved.direction
    );
    keywordTimes = computeImageCaptionKeywordTimes(layout, enter * 0.45);
  }

  return {
    enterStart: 0.04,
    keywordTimes,
    annotationTimes: keywordTimes,
  };
}

export const renderImgPolaroid: PureStyleRenderer = (
  ctx,
  t,
  content,
  timeline,
  custom,
  size
) => {
  const { baseWidth: W, baseHeight: H } = size;
  const bgMode = resolveBackgroundMode(custom);
  const isGreen = bgMode === 'green';

  const { enter, exitStart, total } = getEffectiveTimeline(
    timeline,
    content.quoteText,
    'image',
    0.35,
    getTypingConfigForCustomization(custom)
  );

  const resolved = resolveImageContentParams(
    content,
    custom,
    IMG_POLAROID_CONFIG.defaultImageFit
  );
  const posBox = getImagePositionBox(
    custom.position || 'center',
    custom.format,
    W,
    H,
    custom.imageScale ?? 1.0
  );

  // 1. Background
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    const wall = getCachedPolaroidWallBackdrop(W, H, custom.seed);
    ctx.drawImage(wall, 0, 0, W, H);
  }

  // 2. Compute Polaroid frame dimensions matched strictly to uploaded image aspect ratio inside posBox
  const rng = mulberry32(combineSeed(custom.seed, 9011));
  const baseTiltDeg = (rng() > 0.5 ? 1 : -1) * (2.2 + rng() * 1.6); // 2-4° tilt
  const baseTiltRad = (baseTiltDeg * Math.PI) / 180;

  const padForTilt = Math.round(Math.min(posBox.boxWidth, posBox.boxHeight) * 0.085);
  const availOuterW = Math.max(140, posBox.boxWidth - padForTilt * 2);
  const availOuterH = Math.max(130, posBox.boxHeight - padForTilt * 2);

  const estSidePad = Math.max(10, Math.round(availOuterW * 0.045));
  const estTopPad = Math.max(10, Math.round(availOuterH * 0.045));
  const estBottomPad = Math.max(14, Math.round(availOuterH * 0.075));
  const fitted = fitImageSlotInBox(
    resolved.source,
    availOuterW - estSidePad * 2,
    availOuterH - estTopPad - estBottomPad
  );

  const photoW = fitted.photoW;
  const photoH = fitted.photoH;
  const sidePad = Math.min(estSidePad, clamp(Math.round(photoW * 0.048), 10, 28));
  const topPad = Math.min(estTopPad, clamp(Math.round(photoH * 0.048), 10, 28));
  const bottomRimH = Math.min(estBottomPad, clamp(Math.round(photoH * 0.08), 14, 42));

  const frameW = photoW + sidePad * 2;
  const frameH = photoH + topPad + bottomRimH;
  const centerX = posBox.boxX + posBox.boxWidth * 0.5;
  const centerY = posBox.boxY + posBox.boxHeight * 0.52;

  // Enter: drops from above with a damped swing (deterministic damped-sine rotation)
  // Exit: flies out
  const enterP = progress(t, 0, enter);
  const exitP = progress(t, exitStart, total);

  const dropEase = easeOutCubic(clamp(enterP / 0.65, 0, 1));
  const flyOutEase = easeInCubic(exitP);

  const offsetY =
    lerp(-H * 0.55, 0, dropEase) + lerp(0, H * 0.55, flyOutEase);
  const swingDecay = Math.exp(-t * 3.4);
  const swingAngle = Math.sin(t * 9.5) * 0.16 * swingDecay * (1 - flyOutEase);
  const totalRotation = baseTiltRad + swingAngle + flyOutEase * 0.18;

  const alpha = isGreen ? (exitP > 0.85 ? 0 : 1) : 1 - flyOutEase;
  if (alpha <= 0.01) {
    ctx.restore();
    return;
  }

  ctx.translate(centerX, centerY + offsetY);
  ctx.rotate(totalRotation);
  ctx.globalAlpha = alpha;

  const halfW = frameW * 0.5;
  const halfH = frameH * 0.5;

  // 3. Shadow (hard offset shadow in green mode, soft shadow in style mode)
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = IMG_POLAROID_CONFIG.colors.hardShadow;
    ctx.beginPath();
    ctx.roundRect(-halfW + 12, -halfH + 14, frameW, frameH, 6);
    ctx.fill();
  } else {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.52)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetX = 8;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = IMG_POLAROID_CONFIG.colors.frameWhite;
    ctx.beginPath();
    ctx.roundRect(-halfW, -halfH, frameW, frameH, 6);
    ctx.fill();
  }
  ctx.restore();

  // 4. White Polaroid Frame
  ctx.fillStyle = IMG_POLAROID_CONFIG.colors.frameWhite;
  ctx.strokeStyle = 'rgba(180, 168, 148, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-halfW, -halfH, frameW, frameH, 6);
  ctx.fill();
  ctx.stroke();

  // 5. Inner Photo Area (exact natural aspect ratio of uploaded image)
  const photoX = -halfW + sidePad;
  const photoY = -halfH + topPad;

  ctx.save();
  ctx.beginPath();
  ctx.rect(photoX, photoY, photoW, photoH);
  ctx.clip();

  ctx.fillStyle = IMG_POLAROID_CONFIG.colors.photoSlotBg;
  ctx.fillRect(photoX, photoY, photoW, photoH);

  const pushScale = computeImagePushInScale(t, total, custom.imagePushIn);
  drawFittedImage(
    ctx,
    resolved.source,
    resolved.crop,
    resolved.fitMode,
    photoX,
    photoY,
    photoW,
    photoH,
    pushScale
  );

  // 6. Soft Translucent Warm-Paper Bottom Overlay inside Photo (preserves exact photo aspect ratio)
  const font =
    custom.quoteFontOverride ||
    (resolved.direction === 'ltr'
      ? IMG_POLAROID_CONFIG.fonts.captionEn
      : IMG_POLAROID_CONFIG.fonts.captionAr);
  const keywordColor =
    custom.keywordColor || custom.accentColor || IMG_POLAROID_CONFIG.defaultKeywordColor;

  drawImageBottomCaptionOverlay({
    ctx,
    photoX,
    photoY,
    photoW,
    photoH,
    caption: resolved.caption,
    hasCaption: resolved.hasCaption,
    sourceLine: resolved.sourceLine,
    hasSourceLine: resolved.hasSourceLine,
    fontFamily: font,
    fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
    direction: resolved.direction,
    textColor: IMG_POLAROID_CONFIG.colors.inkText,
    keywordColor,
    keywordStyle: 'hand-underline',
    scrimTheme: 'light-paper',
    isGreen,
    t,
    captionStartSec: enter * 0.35,
    revealAlpha: 1.0,
    seed: custom.seed,
  });

  // Subtle inner frame border
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(photoX, photoY, photoW, photoH);
  ctx.restore();

  // 7. Top Tape Piece (opaque in green mode, semi-transparent in style mode)
  const tapeW = Math.max(64, Math.round(frameW * IMG_POLAROID_CONFIG.sizes.tapeWidthRatio));
  const tapeH = clamp(Math.round(frameH * 0.065), 18, 34);
  const tapeTilt = (rng() - 0.5) * 0.12;

  ctx.save();
  ctx.translate(0, -halfH + 2);
  ctx.rotate(tapeTilt);
  ctx.fillStyle = isGreen
    ? IMG_POLAROID_CONFIG.colors.tapeOpaque
    : IMG_POLAROID_CONFIG.colors.tapeTranslucent;
  ctx.strokeStyle = isGreen ? '#C7B27E' : 'rgba(210, 192, 148, 0.55)';
  ctx.lineWidth = 1.5;

  // Jagged tape ends on left & right
  ctx.beginPath();
  ctx.moveTo(-tapeW * 0.5, -tapeH * 0.5);
  ctx.lineTo(tapeW * 0.5, -tapeH * 0.5);
  for (let s = 1; s <= 4; s++) {
    const fy = lerp(-tapeH * 0.5, tapeH * 0.5, s / 4);
    const jx = s % 2 === 1 ? -3 : 2;
    ctx.lineTo(tapeW * 0.5 + jx, fy);
  }
  ctx.lineTo(-tapeW * 0.5, tapeH * 0.5);
  for (let s = 3; s >= 1; s--) {
    const fy = lerp(-tapeH * 0.5, tapeH * 0.5, s / 4);
    const jx = s % 2 === 1 ? 3 : -2;
    ctx.lineTo(-tapeW * 0.5 + jx, fy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
};
