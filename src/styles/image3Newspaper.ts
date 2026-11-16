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
  getCachedHalftoneImageCanvas,
  getCachedNewsprintPaperCanvas,
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
import { combineSeed, mulberry32 } from '../utils/random';
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

export const IMG_NEWSPAPER_CONFIG = {
  id: 'img_newspaper' as const,
  mode: 'image' as const,
  nameAr: 'قصاصة جريدة',
  nameEn: 'Newspaper Clipping',
  descriptionAr:
    'ورق جرائد معتّق بحواف ممزقة وصورة بنقاط طباعة نصفية وعنوان عريض بـ Amiri مع دائرة قلم أحمر على الكلمة المفتاحية',
  defaultAccent: '#1E1A16',
  defaultKeywordColor: '#C92A2A',
  defaultQuoteFont: 'Amiri' as ArabicFontFamily,
  defaultAuthorFont: 'Noto Naskh Arabic' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Playfair Display' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Lora' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  defaultImageFit: 'cover' as ImageFitMode,
  allowedFonts: [
    'Amiri',
    'Noto Naskh Arabic',
    'Cairo',
    'Tajawal',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
    'KOMission Black',
    'Zain Rounded instance mob',
    '29LT Azahar Display AL TN Trial Bold',
  ] as ArabicFontFamily[],
  allowedEnglishFonts: ['Playfair Display', 'Lora', 'Cormorant Garamond'] as EnglishFontFamily[],
  colors: {
    deskBg: '#191410',
    paperFill: '#EFE7D6',
    inkHeadline: '#1A1612',
    bylineText: '#4A4035',
    ruleLine: '#2B241D',
    markerRed: '#C92A2A',
    hardShadow: '#0E0B08',
  },
  fonts: {
    headlineAr: 'Amiri' as ArabicFontFamily,
    bylineAr: 'Noto Naskh Arabic' as ArabicFontFamily,
    headlineEn: 'Playfair Display' as EnglishFontFamily,
  },
  sizes: {
    tornJaggedness: 6,
    outerPaddingRatio: 0.055,
  },
  timings: {
    enterDuration: 0.8,
    holdDuration: 3.0,
    exitDuration: 0.6,
  },
};

export function getImgNewspaperEventTimes(
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
    IMG_NEWSPAPER_CONFIG.defaultImageFit
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
      ? IMG_NEWSPAPER_CONFIG.fonts.headlineEn
      : IMG_NEWSPAPER_CONFIG.fonts.headlineAr);

  const pad = Math.round(Math.min(posBox.boxWidth, posBox.boxHeight) * 0.055);
  const availSheetW = Math.max(160, posBox.boxWidth - pad * 2);
  const availSheetH = Math.max(140, posBox.boxHeight - pad * 2);
  const estInnerPadX = clamp(Math.round(availSheetW * 0.045), 12, 24);
  const estInnerPadY = clamp(Math.round(availSheetH * 0.04), 12, 22);
  const bylineSize = resolved.hasSourceLine ? clamp(Math.round(availSheetH * 0.03), 11, 16) : 0;
  const topChromeH = 14 + (resolved.hasSourceLine ? bylineSize + 18 : 0);
  const fitted = fitImageSlotInBox(
    resolved.source,
    availSheetW - estInnerPadX * 2,
    availSheetH - estInnerPadY * 2 - topChromeH
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
    enterStart: 0.03,
    keywordTimes,
    annotationTimes: keywordTimes,
  };
}

function traceTornPaperPolygon(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number
): void {
  const rng = mulberry32(combineSeed(seed, 9311));
  const step = 22;
  const jag = IMG_NEWSPAPER_CONFIG.sizes.tornJaggedness;

  ctx.beginPath();
  ctx.moveTo(x, y);

  // Top edge
  for (let px = x + step; px < x + w; px += step) {
    ctx.lineTo(px, y + (rng() - 0.5) * jag);
  }
  ctx.lineTo(x + w, y);

  // Right edge
  for (let py = y + step; py < y + h; py += step) {
    ctx.lineTo(x + w + (rng() - 0.5) * jag, py);
  }
  ctx.lineTo(x + w, y + h);

  // Bottom edge
  for (let px = x + w - step; px > x; px -= step) {
    ctx.lineTo(px, y + h + (rng() - 0.5) * jag);
  }
  ctx.lineTo(x, y + h);

  // Left edge
  for (let py = y + h - step; py > y; py -= step) {
    ctx.lineTo(x + (rng() - 0.5) * jag, py);
  }
  ctx.closePath();
}

export const renderImgNewspaper: PureStyleRenderer = (
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
    IMG_NEWSPAPER_CONFIG.defaultImageFit
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
    ctx.fillStyle = IMG_NEWSPAPER_CONFIG.colors.deskBg;
    ctx.fillRect(0, 0, W, H);
    // Warm editorial desk radial glow
    const grad = ctx.createRadialGradient(W * 0.5, H * 0.5, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.65);
    grad.addColorStop(0, 'rgba(72, 56, 40, 0.55)');
    grad.addColorStop(1, 'rgba(14, 11, 8, 0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // 2. Stamp-in entrance (scale 1.15 -> 1.0 with tiny seeded shake) & exit fade
  const enterP = progress(t, 0, enter);
  const exitP = easeInCubic(progress(t, exitStart, total));
  const stampP = easeOutCubic(clamp(enterP / 0.55, 0, 1));

  const alpha = isGreen ? (exitP > 0.85 ? 0 : 1) : clamp(stampP * (1 - exitP), 0, 1);
  if (alpha <= 0.01) {
    ctx.restore();
    return;
  }

  const rng = mulberry32(combineSeed(custom.seed, 9329));
  const baseTiltDeg = (rng() > 0.5 ? 1 : -1) * (1.1 + rng() * 0.9); // 1-2° tilt
  const baseTiltRad = (baseTiltDeg * Math.PI) / 180;

  // Tiny seeded shake right after stamp contact
  const shakeDecay = enterP > 0.35 && enterP < 0.85 ? Math.exp(-(enterP - 0.35) * 9) : 0;
  const shakeX = Math.sin(t * 58) * 5 * shakeDecay;
  const shakeY = Math.cos(t * 47) * 4 * shakeDecay;
  const stampScale = lerp(1.15, 1.0, stampP);

  const pad = Math.round(Math.min(posBox.boxWidth, posBox.boxHeight) * 0.055);
  const availSheetW = Math.max(160, posBox.boxWidth - pad * 2);
  const availSheetH = Math.max(140, posBox.boxHeight - pad * 2);
  const estInnerPadX = clamp(Math.round(availSheetW * 0.045), 12, 24);
  const estInnerPadY = clamp(Math.round(availSheetH * 0.04), 12, 22);
  const bylineSize = resolved.hasSourceLine ? clamp(Math.round(availSheetH * 0.03), 11, 16) : 0;
  const topChromeH = 14 + (resolved.hasSourceLine ? bylineSize + 18 : 0);

  const fitted = fitImageSlotInBox(
    resolved.source,
    availSheetW - estInnerPadX * 2,
    availSheetH - estInnerPadY * 2 - topChromeH
  );
  const photoW = fitted.photoW;
  const photoH = fitted.photoH;
  const innerPadX = Math.min(estInnerPadX, clamp(Math.round(photoW * 0.048), 12, 24));
  const innerPadY = Math.min(estInnerPadY, clamp(Math.round(photoH * 0.042), 12, 22));

  const sheetW = photoW + innerPadX * 2;
  const sheetH = photoH + topChromeH + innerPadY * 2;
  const centerX = posBox.boxX + posBox.boxWidth * 0.5 + shakeX;
  const centerY = posBox.boxY + posBox.boxHeight * 0.5 + shakeY;

  ctx.translate(centerX, centerY);
  ctx.rotate(baseTiltRad);
  ctx.scale(stampScale, stampScale);
  ctx.globalAlpha = alpha;

  const halfW = sheetW * 0.5;
  const halfH = sheetH * 0.5;

  // 3. Torn sheet shadow
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = IMG_NEWSPAPER_CONFIG.colors.hardShadow;
    traceTornPaperPolygon(ctx, -halfW + 12, -halfH + 12, sheetW, sheetH, custom.seed);
    ctx.fill();
  } else {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.58)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetX = 6;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = IMG_NEWSPAPER_CONFIG.colors.paperFill;
    traceTornPaperPolygon(ctx, -halfW, -halfH, sheetW, sheetH, custom.seed);
    ctx.fill();
  }
  ctx.restore();

  // 4. Aged newsprint paper clipped to torn polygon
  ctx.save();
  traceTornPaperPolygon(ctx, -halfW, -halfH, sheetW, sheetH, custom.seed);
  ctx.clip();

  const paperTex = getCachedNewsprintPaperCanvas(
    Math.ceil(sheetW + 24),
    Math.ceil(sheetH + 24),
    custom.seed
  );
  ctx.drawImage(paperTex, -halfW - 12, -halfH - 12, sheetW + 24, sheetH + 24);

  const contentX = -halfW + innerPadX;
  const contentW = photoW;

  let curY = -halfH + innerPadY;

  // Top newspaper masthead rule lines & optional slim byline/source line
  ctx.strokeStyle = IMG_NEWSPAPER_CONFIG.colors.ruleLine;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(contentX, curY);
  ctx.lineTo(contentX + contentW, curY);
  ctx.stroke();

  curY += 5;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(contentX, curY);
  ctx.lineTo(contentX + contentW, curY);
  ctx.stroke();
  curY += 8;

  if (resolved.hasSourceLine) {
    applyStudioCanvasTextProps(
      ctx,
      IMG_NEWSPAPER_CONFIG.fonts.bylineAr,
      700,
      bylineSize,
      resolved.direction
    );
    ctx.fillStyle = IMG_NEWSPAPER_CONFIG.colors.bylineText;
    const byW = ctx.measureText(resolved.sourceLine).width;
    drawBidiWord(
      ctx,
      resolved.sourceLine,
      byW * 0.5,
      curY + bylineSize * 0.85,
      resolved.direction
    );
    curY += bylineSize + 10;

    ctx.strokeStyle = IMG_NEWSPAPER_CONFIG.colors.ruleLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(contentX, curY);
    ctx.lineTo(contentX + contentW, curY);
    ctx.stroke();
    curY += 8;
  }

  // Image box matched cleanly to natural aspect ratio of uploaded image
  const imgBoxY = curY;
  const imgBoxH = photoH;

  ctx.save();
  ctx.beginPath();
  ctx.rect(contentX, imgBoxY, contentW, imgBoxH);
  ctx.clip();

  const pushScale = computeImagePushInScale(t, total, custom.imagePushIn);
  const keepColor = Boolean(custom.newspaperKeepColor);

  if (keepColor) {
    drawFittedImage(
      ctx,
      resolved.source,
      resolved.crop,
      resolved.fitMode,
      contentX,
      imgBoxY,
      contentW,
      imgBoxH,
      pushScale
    );
  } else {
    const halftoneCanvas = getCachedHalftoneImageCanvas(
      resolved.source,
      resolved.imageId,
      resolved.crop,
      resolved.fitMode,
      Math.max(60, Math.round(contentW)),
      Math.max(60, Math.round(imgBoxH)),
      false
    );
    const sw = contentW * pushScale;
    const sh = imgBoxH * pushScale;
    ctx.drawImage(
      halftoneCanvas,
      contentX + (contentW - sw) * 0.5,
      imgBoxY + (imgBoxH - sh) * 0.5,
      sw,
      sh
    );
  }

  // Editorial Headline Overlay on soft warm-newsprint bottom gradient inside photo
  const font =
    custom.quoteFontOverride ||
    (resolved.direction === 'ltr'
      ? IMG_NEWSPAPER_CONFIG.fonts.headlineEn
      : IMG_NEWSPAPER_CONFIG.fonts.headlineAr);
  const keywordColor =
    custom.keywordColor || IMG_NEWSPAPER_CONFIG.defaultKeywordColor;

  drawImageBottomCaptionOverlay({
    ctx,
    photoX: contentX,
    photoY: imgBoxY,
    photoW: contentW,
    photoH: imgBoxH,
    caption: resolved.caption,
    hasCaption: resolved.hasCaption,
    hasSourceLine: false, // Byline stays in the newspaper header strip
    fontFamily: font,
    fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
    direction: resolved.direction,
    textColor: IMG_NEWSPAPER_CONFIG.colors.inkHeadline,
    keywordColor,
    keywordStyle: 'red-circle',
    scrimTheme: 'newsprint',
    isGreen,
    t,
    captionStartSec: enter * 0.3,
    revealAlpha: 1.0,
    seed: custom.seed,
  });

  ctx.strokeStyle = IMG_NEWSPAPER_CONFIG.colors.ruleLine;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(contentX, imgBoxY, contentW, imgBoxH);
  ctx.restore();

  ctx.restore(); // end torn polygon clip
  ctx.restore();
};
