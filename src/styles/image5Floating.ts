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
  getCachedFloatingPastelBackdrop,
} from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeOutBack,
  getEffectiveTimeline,
  getImagePositionBox,
  getTypingConfigForCustomization,
  lerp,
  progress,
  resolveBackgroundMode,
} from '../utils/math';
import {
  applyStudioCanvasTextProps,
  drawBidiWord,
} from '../utils/textLayout';
import {
  computeImageBottomCaptionLayout,
  computeImageCaptionKeywordTimes,
  computeImagePushInScale,
  drawImageBottomCaptionOverlay,
  fitImageSlotInBox,
  resolveImageContentParams,
} from './image1Polaroid';

export const IMG_FLOATING_CONFIG = {
  id: 'img_floating' as const,
  mode: 'image' as const,
  nameAr: 'بطاقة عائمة عصرية',
  nameEn: 'Modern Floating Card',
  descriptionAr:
    'بطاقة صورة بحواف دائرية وإطار أبيض رفيع وحركة طفو ناعمة، مع كبسولة تعليق متداخلة عند الحافة السفلية',
  defaultAccent: '#4F46E5',
  defaultKeywordColor: '#FDE047',
  defaultQuoteFont: 'Readex Pro' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Inter' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  defaultImageFit: 'cover' as ImageFitMode,
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
    cardBg: '#0F172A',
    whiteBorder: '#FFFFFF',
    pillText: '#FFFFFF',
    sourceBadgeBg: '#1E293B',
    sourceBadgeText: '#E2E8F0',
    hardShadow: '#0F172A',
  },
  fonts: {
    captionAr: 'Readex Pro' as ArabicFontFamily,
    captionEn: 'Plus Jakarta Sans' as EnglishFontFamily,
  },
  sizes: {
    cornerRadius: 24,
    borderWidth: 4,
    floatAmplitudePx: 6,
  },
  timings: {
    enterDuration: 0.8,
    holdDuration: 3.0,
    exitDuration: 0.6,
  },
};

export function getImgFloatingEventTimes(
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
    IMG_FLOATING_CONFIG.defaultImageFit
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
      ? IMG_FLOATING_CONFIG.fonts.captionEn
      : IMG_FLOATING_CONFIG.fonts.captionAr);

  const fitted = fitImageSlotInBox(
    resolved.source,
    Math.max(120, posBox.boxWidth - 12),
    Math.max(110, posBox.boxHeight - 12)
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
    keywordTimes = computeImageCaptionKeywordTimes(layout, enter * 0.42);
  }

  return {
    enterStart: 0.04,
    keywordTimes,
    annotationTimes: keywordTimes,
  };
}

export const renderImgFloating: PureStyleRenderer = (
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
    IMG_FLOATING_CONFIG.defaultImageFit
  );
  const posBox = getImagePositionBox(
    custom.position || 'center',
    custom.format,
    W,
    H,
    custom.imageScale ?? 1.0
  );

  const accentColor = custom.accentColor || IMG_FLOATING_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || IMG_FLOATING_CONFIG.defaultKeywordColor;

  // 1. Background
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bg = getCachedFloatingPastelBackdrop(W, H, accentColor, custom.seed);
    ctx.drawImage(bg, 0, 0, W, H);
  }

  // 2. Enter: slide + scale (easeOutBack); Hold: sinusoidal y ±6 px; Exit: quick scale + fade
  const enterP = progress(t, 0, enter);
  const exitP = easeInCubic(progress(t, exitStart, total));
  const enterBack = easeOutBack(enterP);

  const alpha = isGreen ? (exitP > 0.85 ? 0 : 1) : clamp(enterP * 1.4 * (1 - exitP), 0, 1);
  if (alpha <= 0.01) {
    ctx.restore();
    return;
  }

  const floatY =
    Math.sin(t * 2.4) * IMG_FLOATING_CONFIG.sizes.floatAmplitudePx * clamp(enterP, 0, 1);
  const slideY = lerp(42, 0, enterBack) + lerp(0, 28, exitP);
  const scale = lerp(0.82, 1.0, enterBack) * lerp(1.0, 0.86, exitP);

  const fitted = fitImageSlotInBox(
    resolved.source,
    Math.max(120, posBox.boxWidth - 12),
    Math.max(110, posBox.boxHeight - 12)
  );
  const cardW = fitted.photoW;
  const cardH = fitted.photoH;
  const centerX = posBox.boxX + posBox.boxWidth * 0.5;
  const centerY = posBox.boxY + posBox.boxHeight * 0.5;

  ctx.translate(centerX, centerY + slideY + floatY);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

  const halfW = cardW * 0.5;
  const halfH = cardH * 0.5;
  const radius = clamp(Math.round(Math.min(cardW, cardH) * 0.055), 14, 28);

  // 3. Card Shadow
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = IMG_FLOATING_CONFIG.colors.hardShadow;
    ctx.beginPath();
    ctx.roundRect(-halfW + 12, -halfH + 14, cardW, cardH, radius);
    ctx.fill();
  } else {
    ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 20;
    ctx.fillStyle = IMG_FLOATING_CONFIG.colors.cardBg;
    ctx.beginPath();
    ctx.roundRect(-halfW, -halfH, cardW, cardH, radius);
    ctx.fill();
  }
  ctx.restore();

  // 4. Rounded-corner image card
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-halfW, -halfH, cardW, cardH, radius);
  ctx.clip();

  ctx.fillStyle = IMG_FLOATING_CONFIG.colors.cardBg;
  ctx.fillRect(-halfW, -halfH, cardW, cardH);

  const pushScale = computeImagePushInScale(t, total, custom.imagePushIn);
  drawFittedImage(
    ctx,
    resolved.source,
    resolved.crop,
    resolved.fitMode,
    -halfW,
    -halfH,
    cardW,
    cardH,
    pushScale
  );

  // Optional small source badge in top-right corner of card
  if (resolved.hasSourceLine) {
    const srcSize = clamp(Math.round(cardH * 0.032), 11, 16);
    applyStudioCanvasTextProps(ctx, 'Cairo', 600, srcSize, resolved.direction);
    const srcW = ctx.measureText(resolved.sourceLine).width;
    const badgeW = Math.min(cardW - 24, srcW + 24);
    const badgeH = srcSize + 12;
    const badgeX = halfW - badgeW - 14;
    const badgeY = -halfH + 14;

    ctx.fillStyle = IMG_FLOATING_CONFIG.colors.sourceBadgeBg;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH * 0.5);
    ctx.fill();

    ctx.fillStyle = IMG_FLOATING_CONFIG.colors.sourceBadgeText;
    drawBidiWord(
      ctx,
      resolved.sourceLine,
      badgeX + badgeW - 12,
      badgeY + badgeH * 0.5 + srcSize * 0.34,
      resolved.direction
    );
  }

  // Soft translucent caption overlay inside the bottom edge of the floating card
  const font =
    custom.quoteFontOverride ||
    (resolved.direction === 'ltr'
      ? IMG_FLOATING_CONFIG.fonts.captionEn
      : IMG_FLOATING_CONFIG.fonts.captionAr);

  drawImageBottomCaptionOverlay({
    ctx,
    photoX: -halfW,
    photoY: -halfH,
    photoW: cardW,
    photoH: cardH,
    caption: resolved.caption,
    hasCaption: resolved.hasCaption,
    hasSourceLine: false, // Source line stays cleanly in the top-right corner pill
    fontFamily: font,
    fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
    direction: resolved.direction,
    textColor: IMG_FLOATING_CONFIG.colors.pillText,
    keywordColor,
    keywordStyle: 'underline',
    accentLineColor: accentColor,
    scrimTheme: 'dark',
    isGreen,
    t,
    captionStartSec: enter * 0.32,
    revealAlpha: 1.0,
    seed: custom.seed,
  });

  ctx.restore();

  // Thin white border around card
  ctx.strokeStyle = IMG_FLOATING_CONFIG.colors.whiteBorder;
  ctx.lineWidth = IMG_FLOATING_CONFIG.sizes.borderWidth;
  ctx.beginPath();
  ctx.roundRect(-halfW, -halfH, cardW, cardH, radius);
  ctx.stroke();

  ctx.restore();
};
