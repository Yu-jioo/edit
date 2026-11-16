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
  getCachedBrowserBackdrop,
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

export const IMG_BROWSER_CONFIG = {
  id: 'img_browser' as const,
  mode: 'image' as const,
  nameAr: 'نافذة متصفح',
  nameEn: 'Browser Window',
  descriptionAr:
    'نافذة تطبيق أو متصفح أنيقة بشريط عنوان وعنوان مصدر، مع ميلان ثلاثي الأبعاد يستقر وشريحة تعليق سفلية',
  defaultAccent: '#6366F1',
  defaultKeywordColor: '#38BDF8',
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
    bgGradientStart: '#1B2340',
    bgGradientEnd: '#3A2A6B',
    windowBg: '#0F172A',
    windowBorder: '#334155',
    titleBarBg: '#1E293B',
    addressBarBg: '#0F172A',
    addressBarText: '#94A3B8',
    dotRed: '#EF4444',
    dotYellow: '#F59E0B',
    dotGreen: '#10B981',
    viewportBg: '#0B1120',
    chipBg: '#1E293B',
    chipBorder: '#475569',
    chipText: '#F8FAFC',
    hardShadow: '#090D16',
  },
  fonts: {
    captionAr: 'Readex Pro' as ArabicFontFamily,
    captionAltAr: 'Cairo' as ArabicFontFamily,
    captionEn: 'Plus Jakarta Sans' as EnglishFontFamily,
  },
  sizes: {
    cornerRadius: 16,
    titleBarHeight: 44,
    captionChipGap: 14,
  },
  timings: {
    enterDuration: 0.8,
    holdDuration: 3.0,
    exitDuration: 0.6,
  },
};

export function getImgBrowserEventTimes(
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
    IMG_BROWSER_CONFIG.defaultImageFit
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
      ? IMG_BROWSER_CONFIG.fonts.captionEn
      : IMG_BROWSER_CONFIG.fonts.captionAr);

  const titleBarH = clamp(Math.round(posBox.boxHeight * 0.068), 28, 44);
  const fitted = fitImageSlotInBox(
    resolved.source,
    Math.max(140, posBox.boxWidth),
    Math.max(90, posBox.boxHeight - titleBarH)
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

export const renderImgBrowser: PureStyleRenderer = (
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
    IMG_BROWSER_CONFIG.defaultImageFit
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
    const bg = getCachedBrowserBackdrop(
      W,
      H,
      custom.accentColor || IMG_BROWSER_CONFIG.defaultAccent
    );
    ctx.drawImage(bg, 0, 0, W, H);
  }

  // Fit browser viewport strictly to uploaded image aspect ratio inside posBox
  const font =
    custom.quoteFontOverride ||
    (resolved.direction === 'ltr'
      ? IMG_BROWSER_CONFIG.fonts.captionEn
      : IMG_BROWSER_CONFIG.fonts.captionAr);
  const accentColor = custom.accentColor || IMG_BROWSER_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || IMG_BROWSER_CONFIG.defaultKeywordColor;

  const titleBarH = clamp(Math.round(posBox.boxHeight * 0.068), 28, 44);
  const fitted = fitImageSlotInBox(
    resolved.source,
    Math.max(140, posBox.boxWidth),
    Math.max(90, posBox.boxHeight - titleBarH)
  );
  const winW = fitted.photoW;
  const winH = fitted.photoH + titleBarH;

  const centerX = posBox.boxX + posBox.boxWidth * 0.5;
  const centerY = posBox.boxY + posBox.boxHeight * 0.5;

  // Enter: scale + fade with faux-3D tilt (perspective via transform matrix) settling flat
  const enterP = easeOutCubic(progress(t, 0, enter));
  const exitP = easeInCubic(progress(t, exitStart, total));
  const visP = clamp(enterP * (1 - exitP), 0, 1);

  if (visP <= 0.01) {
    ctx.restore();
    return;
  }

  const tiltAmount = (1 - enterP) * 0.14 - exitP * 0.09;
  const scaleAmount = lerp(0.84, 1.0, enterP) * lerp(1.0, 0.9, exitP);

  ctx.translate(centerX, centerY);
  // Faux-3D perspective transform matrix settling flat as enterP -> 1
  ctx.transform(
    scaleAmount,
    tiltAmount * 0.42,
    -tiltAmount * 0.65,
    scaleAmount * (1 - Math.abs(tiltAmount) * 0.35),
    0,
    (1 - enterP) * 28
  );
  if (!isGreen) {
    ctx.globalAlpha = visP;
  }

  const winX = -winW * 0.5;
  const winY = -winH * 0.5;
  const radius = clamp(Math.round(Math.min(winW, winH) * 0.024), 10, 18);

  // Window shadow
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = IMG_BROWSER_CONFIG.colors.hardShadow;
    ctx.beginPath();
    ctx.roundRect(winX + 12, winY + 12, winW, winH, radius);
    ctx.fill();
  } else {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 20;
    ctx.fillStyle = IMG_BROWSER_CONFIG.colors.windowBg;
    ctx.beginPath();
    ctx.roundRect(winX, winY, winW, winH, radius);
    ctx.fill();
  }
  ctx.restore();

  // Window body
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(winX, winY, winW, winH, radius);
  ctx.clip();

  ctx.fillStyle = IMG_BROWSER_CONFIG.colors.viewportBg;
  ctx.fillRect(winX, winY, winW, winH);

  // Title bar
  ctx.fillStyle = IMG_BROWSER_CONFIG.colors.titleBarBg;
  ctx.fillRect(winX, winY, winW, titleBarH);

  // Three window dots on left of title bar
  const dotRadius = clamp(Math.round(titleBarH * 0.14), 4, 7);
  const dotY = winY + titleBarH * 0.5;
  const dotStartX = winX + 18;
  const dotStep = dotRadius * 3.1;
  const dotColors = [
    IMG_BROWSER_CONFIG.colors.dotRed,
    IMG_BROWSER_CONFIG.colors.dotYellow,
    IMG_BROWSER_CONFIG.colors.dotGreen,
  ];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = dotColors[i];
    ctx.beginPath();
    ctx.arc(dotStartX + i * dotStep, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Address bar in center of title bar (showing source line if provided)
  const addrX = dotStartX + dotStep * 3 + 12;
  const addrW = Math.max(80, winW - (addrX - winX) - 20);
  const addrH = Math.max(20, Math.round(titleBarH * 0.62));
  const addrY = winY + (titleBarH - addrH) * 0.5;

  ctx.fillStyle = IMG_BROWSER_CONFIG.colors.addressBarBg;
  ctx.strokeStyle = IMG_BROWSER_CONFIG.colors.windowBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(addrX, addrY, addrW, addrH, addrH * 0.35);
  ctx.fill();
  ctx.stroke();

  if (resolved.hasSourceLine) {
    const addrFontSize = clamp(Math.round(addrH * 0.52), 11, 15);
    applyStudioCanvasTextProps(ctx, 'Cairo', 600, addrFontSize, resolved.direction);
    ctx.fillStyle = IMG_BROWSER_CONFIG.colors.addressBarText;
    const textW = ctx.measureText(resolved.sourceLine).width;
    const textRightX = Math.min(
      addrX + addrW - 12,
      addrX + (addrW + textW) * 0.5
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(addrX + 8, addrY, addrW - 16, addrH);
    ctx.clip();
    drawBidiWord(
      ctx,
      resolved.sourceLine,
      textRightX,
      addrY + addrH * 0.5 + addrFontSize * 0.34,
      resolved.direction
    );
    ctx.restore();
  }

  // Viewport content area
  const viewX = winX;
  const viewY = winY + titleBarH;
  const viewW = winW;
  const viewH = Math.max(60, winH - titleBarH);

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewX, viewY, viewW, viewH);
  ctx.clip();

  const pushScale = computeImagePushInScale(t, total, custom.imagePushIn);
  drawFittedImage(
    ctx,
    resolved.source,
    resolved.crop,
    resolved.fitMode,
    viewX,
    viewY,
    viewW,
    viewH,
    pushScale
  );

  // Soft translucent caption overlay on bottom edge inside browser viewport
  drawImageBottomCaptionOverlay({
    ctx,
    photoX: viewX,
    photoY: viewY,
    photoW: viewW,
    photoH: viewH,
    caption: resolved.caption,
    hasCaption: resolved.hasCaption,
    hasSourceLine: false, // Source line stays cleanly in the browser address bar
    fontFamily: font,
    fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
    direction: resolved.direction,
    textColor: IMG_BROWSER_CONFIG.colors.chipText,
    keywordColor,
    keywordStyle: 'underline',
    accentLineColor: accentColor,
    scrimTheme: 'dark',
    isGreen,
    t,
    captionStartSec: enter * 0.35,
    revealAlpha: 1.0,
    seed: custom.seed,
  });

  ctx.restore();

  // Divider below title bar
  ctx.strokeStyle = IMG_BROWSER_CONFIG.colors.windowBorder;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(winX, winY + titleBarH);
  ctx.lineTo(winX + winW, winY + titleBarH);
  ctx.stroke();

  ctx.restore(); // end window clip

  // Outer window border
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(winX, winY, winW, winH, radius);
  ctx.stroke();

  ctx.restore();
};
