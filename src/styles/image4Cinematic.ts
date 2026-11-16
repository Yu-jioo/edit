import {
  ArabicFontFamily,
  BackgroundMode,
  EnglishFontFamily,
  ImageFitMode,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  SceneEventTimes,
  StyleCustomization,
  TimelineConfig,
} from '../types';
import {
  drawFittedImage,
  getCachedFilmGrainTile,
  getCachedFittedGradedImageCanvas,
} from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeOutCubic,
  getEffectiveTimeline,
  getImagePositionBox,
  getTypingConfigForCustomization,
  lerp,
  progress,
  resolveBackgroundMode,
} from '../utils/math';
import {
  computeImageBottomCaptionLayout,
  computeImageCaptionKeywordTimes,
  computeImagePushInScale,
  drawImageBottomCaptionOverlay,
  fitImageSlotInBox,
  resolveImageContentParams,
} from './image1Polaroid';

export const IMG_CINEMATIC_CONFIG = {
  id: 'img_cinematic' as const,
  mode: 'image' as const,
  nameAr: 'كادر سينمائي',
  nameEn: 'Cinematic Frame',
  descriptionAr:
    'كادر سينمائي يطابق أبعاد الصورة بتدريج لوني Teal & Orange اختياري، حبيبات فيلم، خط تمييز رفيع وتعليق سفلي ناعم',
  defaultAccent: '#F59E0B',
  defaultKeywordColor: '#38BDF8',
  defaultQuoteFont: 'Reem Kufi' as ArabicFontFamily,
  defaultAuthorFont: 'Readex Pro' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Cinzel' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'style' as BackgroundMode,
  defaultImageFit: 'cover' as ImageFitMode,
  allowedFonts: [
    'Reem Kufi',
    'Readex Pro',
    'Cairo',
    'Amiri',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
    'KOMission Black',
    'Zain Rounded instance mob',
    '29LT Azahar Display AL TN Trial Bold',
  ] as ArabicFontFamily[],
  allowedEnglishFonts: ['Cinzel', 'Plus Jakarta Sans', 'Playfair Display'] as EnglishFontFamily[],
  colors: {
    backdropBlack: '#06080C',
    letterboxBar: '#040507',
    frameBorder: 'rgba(245, 158, 11, 0.55)',
    captionText: '#F8FAFC',
    sourceText: '#CBD5E1',
    lowerThirdBg: 'rgba(8, 12, 18, 0.86)',
    hardShadow: '#05070B',
  },
  fonts: {
    captionAr: 'Reem Kufi' as ArabicFontFamily,
    captionAltAr: 'Readex Pro' as ArabicFontFamily,
    captionEn: 'Cinzel' as EnglishFontFamily,
  },
  sizes: {
    aspectRatio: 2.39,
    borderWidth: 2,
  },
  timings: {
    enterDuration: 0.8,
    holdDuration: 3.0,
    exitDuration: 0.6,
  },
};

export function getImgCinematicEventTimes(
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
    IMG_CINEMATIC_CONFIG.defaultImageFit
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
      ? IMG_CINEMATIC_CONFIG.fonts.captionEn
      : IMG_CINEMATIC_CONFIG.fonts.captionAr);

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
    keywordTimes = computeImageCaptionKeywordTimes(layout, enter * 0.45);
  }

  return {
    enterStart: 0.04,
    keywordTimes,
    annotationTimes: keywordTimes,
  };
}

export const renderImgCinematic: PureStyleRenderer = (
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
    IMG_CINEMATIC_CONFIG.defaultImageFit
  );
  const posBox = getImagePositionBox(
    custom.position || 'center',
    custom.format,
    W,
    H,
    custom.imageScale ?? 1.0
  );

  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = IMG_CINEMATIC_CONFIG.colors.backdropBlack;
    ctx.fillRect(0, 0, W, H);
  }

  // Enter: bars slide in, image fades up from black.
  // Exit: caption fades, then image fades to black.
  const enterP = easeOutCubic(progress(t, 0, enter));
  const exitP = easeInCubic(progress(t, exitStart, total));
  const imageFadeP = clamp(enterP * (1 - progress(exitP, 0.25, 1.0)), 0, 1);

  if (imageFadeP <= 0.01 && isGreen) {
    ctx.restore();
    return;
  }

  const accentColor = custom.accentColor || IMG_CINEMATIC_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || IMG_CINEMATIC_CONFIG.defaultKeywordColor;
  const useGrade = custom.cinematicGrade !== false;
  const pushScale = computeImagePushInScale(t, total, custom.imagePushIn ?? true);

  // Match frame dimensions strictly to uploaded image natural aspect ratio inside posBox
  const fitted = fitImageSlotInBox(resolved.source, posBox.boxWidth, posBox.boxHeight);
  const frameW = fitted.photoW;
  const frameH = fitted.photoH;
  const frameX = posBox.boxX + (posBox.boxWidth - frameW) * 0.5;
  const frameY = posBox.boxY + (posBox.boxHeight - frameH) * 0.5;

  // In green mode: only the image rectangle with a thin border and caption; no full-frame overlays
  if (isGreen) {
    ctx.fillStyle = IMG_CINEMATIC_CONFIG.colors.hardShadow;
    ctx.fillRect(frameX + 10, frameY + 10, frameW, frameH);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(frameX, frameY, frameW, frameH);
  ctx.clip();

  ctx.fillStyle = '#05070A';
  ctx.fillRect(frameX, frameY, frameW, frameH);

  ctx.save();
  if (!isGreen) {
    ctx.globalAlpha = imageFadeP;
  }
  if (useGrade) {
    const graded = getCachedFittedGradedImageCanvas(
      resolved.source,
      resolved.imageId,
      resolved.crop,
      resolved.fitMode,
      Math.max(80, Math.round(frameW)),
      Math.max(80, Math.round(frameH)),
      true
    );
    const sw = frameW * pushScale;
    const sh = frameH * pushScale;
    ctx.drawImage(
      graded,
      frameX + (frameW - sw) * 0.5,
      frameY + (frameH - sh) * 0.5,
      sw,
      sh
    );
  } else {
    drawFittedImage(
      ctx,
      resolved.source,
      resolved.crop,
      resolved.fitMode,
      frameX,
      frameY,
      frameW,
      frameH,
      pushScale
    );
  }
  ctx.restore();

  // Soft translucent lower-third caption + thin accent line anchored to the bottom edge inside image
  const font =
    custom.quoteFontOverride ||
    (resolved.direction === 'ltr'
      ? IMG_CINEMATIC_CONFIG.fonts.captionEn
      : IMG_CINEMATIC_CONFIG.fonts.captionAr);

  drawImageBottomCaptionOverlay({
    ctx,
    photoX: frameX,
    photoY: frameY,
    photoW: frameW,
    photoH: frameH,
    caption: resolved.caption,
    hasCaption: resolved.hasCaption,
    sourceLine: resolved.sourceLine,
    hasSourceLine: resolved.hasSourceLine,
    fontFamily: font,
    fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
    direction: resolved.direction,
    textColor: IMG_CINEMATIC_CONFIG.colors.captionText,
    keywordColor,
    keywordStyle: 'underline',
    accentLineColor: accentColor,
    scrimTheme: 'dark',
    isGreen,
    t,
    captionStartSec: enter * 0.35,
    revealAlpha: clamp(1 - progress(exitP, 0, 0.55), 0, 1),
    seed: custom.seed,
  });

  ctx.restore(); // end frame clip

  // Thin border around image rectangle
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = IMG_CINEMATIC_CONFIG.sizes.borderWidth;
  ctx.strokeRect(frameX, frameY, frameW, frameH);

  // Full-frame cinematic letterbox bars, vignette, and film grain ONLY in style mode (never in green mode)
  if (!isGreen) {
    const barTargetH = Math.max(0, frameY);
    const barCurrentH = lerp(0, barTargetH, enterP);

    ctx.fillStyle = IMG_CINEMATIC_CONFIG.colors.letterboxBar;
    if (barCurrentH > 1) {
      ctx.fillRect(0, 0, W, barCurrentH);
      ctx.fillRect(0, H - barCurrentH, W, barCurrentH);
    }

    // Vignette
    const vig = ctx.createRadialGradient(
      W * 0.5,
      H * 0.5,
      Math.min(W, H) * 0.28,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.72
    );
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.58)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Subtle deterministic film grain tile
    const grainBucket = Math.floor(t * 12);
    const grainTile = getCachedFilmGrainTile(custom.seed, grainBucket);
    ctx.save();
    ctx.globalAlpha = 0.25;
    const pat = ctx.createPattern(grainTile, 'repeat');
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  ctx.restore();
};
