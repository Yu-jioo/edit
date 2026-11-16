import {
  ArabicFontFamily,
  BackgroundMode,
  EnglishFontFamily,
  ImageFitMode,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  SceneEventTimes,
  SpotlightRegion,
  SpotlightShape,
  StyleCustomization,
  TimelineConfig,
} from '../types';
import {
  drawFittedImage,
  getCachedBrowserBackdrop,
} from '../utils/assetCache';
import {
  clamp,
  DEFAULT_SPOTLIGHT_REGION,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  getEffectiveTimeline,
  getImagePositionBox,
  getTypingConfigForCustomization,
  lerp,
  progress,
  resolveBackgroundMode,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  drawBidiWord,
} from '../utils/textLayout';
import {
  computeImageBottomCaptionLayout,
  computeImageCaptionKeywordTimes,
  drawImageBottomCaptionOverlay,
  drawImageTrimmedPolyline,
  fitImageSlotInBox,
  ImagePoint2D,
  resolveImageContentParams,
  sampleImageCatmullRom,
} from './image1Polaroid';

export const IMG_SPOTLIGHT_CONFIG = {
  id: 'img_spotlight' as const,
  mode: 'image' as const,
  nameAr: 'تحديد وتكبير',
  nameEn: 'Spotlight & Zoom',
  descriptionAr:
    'إظهار الصورة ثم تعتيم المحيط والتقريب نحو منطقة التحديد مع رسم يدوي (دائرة / مستطيل / سهم) وكبسولة تعليق',
  defaultAccent: '#FFD400',
  defaultKeywordColor: '#FF4D6D',
  defaultQuoteFont: 'Readex Pro' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Inter' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  defaultImageFit: 'contain' as ImageFitMode,
  allowedFonts: [
    'Readex Pro',
    'Cairo',
    'Tajawal',
    'IBM Plex Sans Arabic',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
    'KOMission Black',
    'Zain Rounded instance mob',
    '29LT Azahar Display AL TN Trial Bold',
  ] as ArabicFontFamily[],
  allowedEnglishFonts: ['Plus Jakarta Sans', 'Inter', 'Syne'] as EnglishFontFamily[],
  colors: {
    defaultAnnotation: '#FFD400',
    defaultArrow: '#FF4D6D',
    cardBg: '#0B101B',
    cardBorder: '#334155',
    dimOverlay: 'rgba(6, 9, 16, 0.64)',
    pillBg: '#0F172A',
    pillText: '#F8FAFC',
    hardShadow: '#070A12',
  },
  fonts: {
    captionAr: 'Readex Pro' as ArabicFontFamily,
    captionEn: 'Plus Jakarta Sans' as EnglishFontFamily,
  },
  sizes: {
    strokeWidthMin: 6,
    strokeWidthMax: 8,
    cameraZoomDuration: 0.8,
    annotationDrawDuration: 0.5,
  },
  timings: {
    enterDuration: 0.8,
    holdDuration: 3.0,
    exitDuration: 0.6,
  },
};

function resolveSpotlightRegion(custom: StyleCustomization): SpotlightRegion {
  const r = custom.spotlightRegion || DEFAULT_SPOTLIGHT_REGION;
  const w = clamp(r.w || 0.4, 0.1, 0.95);
  const h = clamp(r.h || 0.4, 0.1, 0.95);
  const x = clamp(r.x ?? 0.3, 0, 1 - w);
  const y = clamp(r.y ?? 0.3, 0, 1 - h);
  return { x, y, w, h };
}

export function getImgSpotlightEventTimes(
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
    IMG_SPOTLIGHT_CONFIG.defaultImageFit
  );
  const posBox = getImagePositionBox(
    custom.position || 'center',
    custom.format,
    W,
    H,
    custom.imageScale ?? 1.0
  );

  const annotationStartSec = Number((enter * 0.55 + 0.35).toFixed(3));
  const captionStartSec = Number((annotationStartSec + 0.25).toFixed(3));

  const font =
    custom.quoteFontOverride ||
    (resolved.direction === 'ltr'
      ? IMG_SPOTLIGHT_CONFIG.fonts.captionEn
      : IMG_SPOTLIGHT_CONFIG.fonts.captionAr);

  const fitted = fitImageSlotInBox(resolved.source, posBox.boxWidth, posBox.boxHeight);

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
    keywordTimes = computeImageCaptionKeywordTimes(layout, captionStartSec);
  }

  return {
    enterStart: 0.04,
    keywordTimes,
    annotationTimes: [annotationStartSec, ...keywordTimes],
  };
}

function drawHandDrawnSpotlightAnnotation(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: SpotlightShape,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  drawProgress: number,
  strokeWidth: number,
  color: string,
  seed: number
): void {
  if (drawProgress <= 0.01) return;
  const rng = mulberry32(combineSeed(seed, 9601));

  if (shape === 'circle') {
    const cx = rx + rw * 0.5;
    const cy = ry + rh * 0.5;
    const radX = rw * 0.56 + 8;
    const radY = rh * 0.56 + 8;
    const ctrl: ImagePoint2D[] = [];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const ang = -0.35 + (i / steps) * Math.PI * 2.15;
      const j = 1 + (rng() - 0.5) * 0.07;
      ctrl.push({
        x: cx + Math.cos(ang) * radX * j,
        y: cy + Math.sin(ang) * radY * j,
      });
    }
    const poly = sampleImageCatmullRom(ctrl, 10);
    drawImageTrimmedPolyline(ctx, poly, drawProgress, strokeWidth, color, true, seed);
  } else if (shape === 'rectangle') {
    const pad = 6;
    const x0 = rx - pad;
    const y0 = ry - pad;
    const x1 = rx + rw + pad;
    const y1 = ry + rh + pad;
    const jit = () => (rng() - 0.5) * 4.5;
    const ctrl: ImagePoint2D[] = [
      { x: x0 + jit(), y: y0 + jit() },
      { x: lerp(x0, x1, 0.5) + jit(), y: y0 + jit() },
      { x: x1 + jit(), y: y0 + jit() },
      { x: x1 + jit(), y: lerp(y0, y1, 0.5) + jit() },
      { x: x1 + jit(), y: y1 + jit() },
      { x: lerp(x1, x0, 0.5) + jit(), y: y1 + jit() },
      { x: x0 + jit(), y: y1 + jit() },
      { x: x0 + jit(), y: lerp(y1, y0, 0.5) + jit() },
      { x: x0 + jit(), y: y0 + jit() },
    ];
    const poly = sampleImageCatmullRom(ctrl, 8);
    drawImageTrimmedPolyline(ctx, poly, drawProgress, strokeWidth, color, true, seed);
  } else {
    // Hand-drawn curved arrow pointing at the spotlight region edge/center
    const targetX = rx + rw * 0.5;
    const targetY = ry + rh * 0.22;
    const startX = targetX + Math.max(54, rw * 0.65);
    const startY = targetY - Math.max(54, rh * 0.65);
    const midX = lerp(startX, targetX, 0.45) + 18;
    const midY = lerp(startY, targetY, 0.55) - 18;

    const shaftCtrl: ImagePoint2D[] = [
      { x: startX, y: startY },
      { x: midX, y: midY },
      { x: targetX, y: targetY },
    ];
    const shaftPoly = sampleImageCatmullRom(shaftCtrl, 12);
    const shaftP = clamp(drawProgress / 0.72, 0, 1);
    drawImageTrimmedPolyline(ctx, shaftPoly, shaftP, strokeWidth, color, true, seed);

    const headP = clamp((drawProgress - 0.68) / 0.32, 0, 1);
    if (headP > 0.01) {
      const wingLen = strokeWidth * 3.4;
      const headCtrl: ImagePoint2D[] = [
        { x: targetX + wingLen * 0.95, y: targetY - wingLen * 0.2 },
        { x: targetX, y: targetY },
        { x: targetX + wingLen * 0.25, y: targetY - wingLen * 0.95 },
      ];
      const headPoly = sampleImageCatmullRom(headCtrl, 8);
      drawImageTrimmedPolyline(ctx, headPoly, headP, strokeWidth, color, true, seed + 19);
    }
  }
}

export const renderImgSpotlight: PureStyleRenderer = (
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
    IMG_SPOTLIGHT_CONFIG.defaultImageFit
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
    const bg = getCachedBrowserBackdrop(
      W,
      H,
      custom.accentColor || IMG_SPOTLIGHT_CONFIG.defaultAccent
    );
    ctx.drawImage(bg, 0, 0, W, H);
  }

  // Timings:
  // 0 .. enter*0.55: image card appears
  // enter*0.55 .. enter*0.55 + 0.8s: camera moves to spotlight region & surround dims
  // annotationStart .. +0.5s: hand-drawn annotation stroke trims in
  // captionStart ..: caption pill appears
  const enterP = easeOutCubic(progress(t, 0, enter * 0.6));
  const exitP = easeInCubic(progress(t, exitStart, total));
  const visP = isGreen ? (exitP > 0.85 ? 0 : 1) : clamp(enterP * (1 - exitP), 0, 1);

  if (visP <= 0.01) {
    ctx.restore();
    return;
  }

  const camStart = enter * 0.5;
  const camP = easeInOutCubic(
    progress(t, camStart, camStart + IMG_SPOTLIGHT_CONFIG.sizes.cameraZoomDuration)
  );
  const annotationStart = camStart + 0.35;
  const annotationP = easeInOutCubic(
    progress(
      t,
      annotationStart,
      annotationStart + IMG_SPOTLIGHT_CONFIG.sizes.annotationDrawDuration
    )
  );
  const captionStart = annotationStart + 0.25;

  const fitted = fitImageSlotInBox(resolved.source, posBox.boxWidth, posBox.boxHeight);
  const cardW = fitted.photoW;
  const cardH = fitted.photoH;
  const cardX = posBox.boxX + (posBox.boxWidth - cardW) * 0.5;
  const cardY = posBox.boxY + (posBox.boxHeight - cardH) * 0.5;
  const radius = clamp(Math.round(Math.min(cardW, cardH) * 0.032), 12, 18);

  ctx.globalAlpha = visP;

  // 2. Shadow
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = IMG_SPOTLIGHT_CONFIG.colors.hardShadow;
    ctx.beginPath();
    ctx.roundRect(cardX + 12, cardY + 12, cardW, cardH, radius);
    ctx.fill();
  } else {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.52)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = IMG_SPOTLIGHT_CONFIG.colors.cardBg;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, radius);
    ctx.fill();
  }
  ctx.restore();

  // 3. Image Viewport with Camera Zoom toward Selected Region
  const region = resolveSpotlightRegion(custom);
  const shape: SpotlightShape = custom.spotlightShape || 'circle';
  const strokeColor =
    shape === 'arrow'
      ? custom.keywordColor || IMG_SPOTLIGHT_CONFIG.colors.defaultArrow
      : custom.accentColor || IMG_SPOTLIGHT_CONFIG.colors.defaultAnnotation;
  const keywordColor =
    custom.keywordColor || IMG_SPOTLIGHT_CONFIG.colors.defaultArrow;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, radius);
  ctx.clip();

  ctx.fillStyle = IMG_SPOTLIGHT_CONFIG.colors.cardBg;
  ctx.fillRect(cardX, cardY, cardW, cardH);

  // Compute where the image will land at zoom=1 inside card
  const srcW =
    'naturalWidth' in resolved.source
      ? resolved.source.naturalWidth || resolved.source.width || 800
      : resolved.source.width || 800;
  const srcH =
    'naturalHeight' in resolved.source
      ? resolved.source.naturalHeight || resolved.source.height || 600
      : resolved.source.height || 600;
  const imgAspect = srcW / Math.max(1, srcH);
  const boxAspect = cardW / Math.max(1, cardH);

  let baseDrawnW = cardW;
  let baseDrawnH = cardH;
  if (resolved.fitMode === 'contain') {
    if (imgAspect > boxAspect) {
      baseDrawnW = cardW;
      baseDrawnH = cardW / imgAspect;
    } else {
      baseDrawnH = cardH;
      baseDrawnW = cardH * imgAspect;
    }
  }
  const baseDrawnX = cardX + (cardW - baseDrawnW) * 0.5;
  const baseDrawnY = cardY + (cardH - baseDrawnH) * 0.5;

  // Selected region in card coordinates
  const selX = baseDrawnX + region.x * baseDrawnW;
  const selY = baseDrawnY + region.y * baseDrawnH;
  const selW = region.w * baseDrawnW;
  const selH = region.h * baseDrawnH;
  const selCX = selX + selW * 0.5;
  const selCY = selY + selH * 0.5;

  // Target camera zoom (clamped 1.18 .. 1.65 so context stays readable)
  const desiredZoom = clamp(
    Math.min(cardW / Math.max(40, selW * 1.45), cardH / Math.max(40, selH * 1.45)),
    1.18,
    1.65
  );
  const extraPush = custom.imagePushIn ? lerp(1.0, 1.05, progress(t, 0, total)) : 1.0;
  const camZoom = lerp(1.0, desiredZoom, camP) * extraPush;

  const cardCX = cardX + cardW * 0.5;
  const cardCY = cardY + cardH * 0.5;
  const focusX = lerp(cardCX, selCX, camP);
  const focusY = lerp(cardCY, selCY, camP);

  ctx.save();
  ctx.translate(cardCX, cardCY);
  ctx.scale(camZoom, camZoom);
  ctx.translate(-focusX, -focusY);

  drawFittedImage(
    ctx,
    resolved.source,
    resolved.crop,
    resolved.fitMode,
    cardX,
    cardY,
    cardW,
    cardH,
    1.0
  );

  // Dim outside spotlight region ONLY in style mode (in green mode no dimming, just the outline)
  if (!isGreen && camP > 0.01) {
    ctx.save();
    ctx.fillStyle = IMG_SPOTLIGHT_CONFIG.colors.dimOverlay;
    ctx.globalAlpha = camP;
    ctx.beginPath();
    // Outer full rect
    ctx.rect(cardX - cardW, cardY - cardH, cardW * 3, cardH * 3);
    // Inner spotlight hole (counter-clockwise via evenodd)
    if (shape === 'circle') {
      ctx.moveTo(selCX + (selW * 0.56 + 8), selCY);
      ctx.ellipse(
        selCX,
        selCY,
        selW * 0.56 + 8,
        selH * 0.56 + 8,
        0,
        0,
        Math.PI * 2,
        true
      );
    } else {
      ctx.rect(selX - 6, selY - 6, selW + 12, selH + 12);
    }
    ctx.fill('evenodd');
    ctx.restore();
  }

  // Hand-drawn annotation (circle / rectangle / arrow, 6-8px double stroke, round caps)
  const strokeW = clamp(Math.round(Math.min(cardW, cardH) * 0.014), 6, 8) / camZoom;
  drawHandDrawnSpotlightAnnotation(
    ctx,
    shape,
    selX,
    selY,
    selW,
    selH,
    annotationP,
    strokeW,
    strokeColor,
    custom.seed
  );

  ctx.restore(); // end camera transform

  // Optional source line in top-left of card
  if (resolved.hasSourceLine) {
    const srcSize = clamp(Math.round(cardH * 0.03), 11, 15);
    applyStudioCanvasTextProps(ctx, 'Cairo', 600, srcSize, resolved.direction);
    const srcW = ctx.measureText(resolved.sourceLine).width;
    const bw = srcW + 20;
    const bh = srcSize + 10;
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(cardX + 12, cardY + 12, bw, bh, 8);
    ctx.fill();
    ctx.fillStyle = '#CBD5E1';
    drawBidiWord(
      ctx,
      resolved.sourceLine,
      cardX + 12 + bw - 10,
      cardY + 12 + bh * 0.5 + srcSize * 0.34,
      resolved.direction
    );
  }

  // 4. Soft translucent bottom caption overlay inside card (after camera transform so text stays crisp & un-zoomed)
  const font =
    custom.quoteFontOverride ||
    (resolved.direction === 'ltr'
      ? IMG_SPOTLIGHT_CONFIG.fonts.captionEn
      : IMG_SPOTLIGHT_CONFIG.fonts.captionAr);

  drawImageBottomCaptionOverlay({
    ctx,
    photoX: cardX,
    photoY: cardY,
    photoW: cardW,
    photoH: cardH,
    caption: resolved.caption,
    hasCaption: resolved.hasCaption,
    hasSourceLine: false, // Source line stays cleanly in the top-left corner pill
    fontFamily: font,
    fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
    direction: resolved.direction,
    textColor: IMG_SPOTLIGHT_CONFIG.colors.pillText,
    keywordColor,
    keywordStyle: 'underline',
    accentLineColor: strokeColor,
    scrimTheme: 'dark',
    isGreen,
    t,
    captionStartSec: captionStart,
    revealAlpha: 1.0,
    seed: custom.seed,
  });

  ctx.restore(); // end card clip

  // Card border
  ctx.strokeStyle = IMG_SPOTLIGHT_CONFIG.colors.cardBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, radius);
  ctx.stroke();

  ctx.restore();
};
