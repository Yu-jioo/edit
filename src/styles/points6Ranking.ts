import {
  ArabicFontFamily,
  BackgroundMode,
  EnglishFontFamily,
  PointsMarkerType,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  SceneEventTimes,
  StyleCustomization,
  StyleLightPalette,
  TimelineConfig,
} from '../types';
import {
  clamp,
  computePointsSchedule,
  DEFAULT_POINTS_ITEMS,
  DEFAULT_POINTS_TIMING,
  DEFAULT_POINTS_TITLE,
  easeInCubic,
  easeOutBack,
  easeOutQuart,
  getPointsPositionBox,
  hexToRgba,
  lerp,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
  toArabicIndicDigits,
} from '../utils/math';
import { combineSeed, deterministicWave } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  drawBidiWord,
  layoutArabicQuote,
} from '../utils/textLayout';

export const PTS_RANKING_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#FFFFFF',
  textSecondary: '#D5DCE8',
  accent: '#FF4D2E',
  keyword: '#FFD400',
  border: '#FFFFFF',
};

export const PTS_RANKING_CONFIG = {
  id: 'pts_ranking' as const,
  mode: 'points' as const,
  nameAr: 'ترتيب تنازلي',
  nameEn: 'Countdown Ranking',
  descriptionAr:
    'عرض تنازلي درامي نقطة واحدة في كل مرة من N إلى ١ مع رقم ضخم يهبط بقوة وشريط تقدم جانبي',
  defaultAccent: '#FF4D2E',
  defaultKeywordColor: '#FFD400',
  defaultQuoteFont: 'Lalezar' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Bebas Neue' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  lightPalette: PTS_RANKING_LIGHT_PALETTE,
  supportedMarkerTypes: ['arabic-indic', 'western'] as PointsMarkerType[],
  defaultMarkerType: 'arabic-indic' as PointsMarkerType,
  allowedFonts: [
    'Lalezar',
    'Changa',
    'Cairo',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
    'KOMission Black',
    'Zain Rounded instance mob',
    '29LT Azahar Display AL TN Trial Bold',
  ] as ArabicFontFamily[],
  allowedEnglishFonts: ['Bebas Neue', 'Oswald', 'Plus Jakarta Sans'] as EnglishFontFamily[],
  colors: {
    bgCharcoal: '#101114',
    bgGlow: '#1C1E26',
    textPrimary: '#FFFFFF',
    titleText: '#E2E8F0',
    accentRed: '#FF4D2E',
    keywordRectFill: '#FFD400',
    keywordDarkText: '#101114',
    railInactive: 'rgba(255, 255, 255, 0.25)',
  },
  fonts: {
    arabic: 'Lalezar' as ArabicFontFamily,
    english: 'Bebas Neue' as EnglishFontFamily,
    weight: 800,
    titleWeight: 800,
  },
  sizes: {
    fullscreenHorizMin: 40,
    fullscreenHorizMax: 78,
    fullscreenVertMin: 36,
    fullscreenVertMax: 68,
    colHorizMin: 30,
    colHorizMax: 56,
    colVertMin: 28,
    colVertMax: 48,
  },
  timings: {
    introSec: 0.6,
    exitSec: 0.6,
    defaultInterval: 2.5,
    numberSlamSec: 0.38,
    shakeDurationSec: 0.2,
    textPunchDelaySec: 0.1,
    textPunchSec: 0.36,
    prevSlideOutSec: 0.28,
  },
};

export function getPtsRankingEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  void ctx;
  void timeline;
  void size;

  const rawTitle = content.pointsTitle ?? custom.pointsTitle ?? DEFAULT_POINTS_TITLE;
  const rawItems = content.pointsItems || custom.pointsItems || DEFAULT_POINTS_ITEMS;
  const timing = content.pointsTiming || custom.pointsTiming || DEFAULT_POINTS_TIMING;
  const schedule = computePointsSchedule(rawTitle, rawItems, timing, 'pts_ranking');

  const keywordTimes: number[] = [];
  if (rawTitle && /\*[^*]+\*/.test(rawTitle)) {
    keywordTimes.push(Number((schedule.introDuration + 0.16).toFixed(3)));
  }
  for (const item of schedule.items) {
    if (/\*[^*]+\*/.test(item.item.text)) {
      keywordTimes.push(Number((item.startTime + 0.28).toFixed(3)));
    }
  }

  return {
    enterStart: schedule.introDuration,
    itemTimes: schedule.itemTimes,
    keywordTimes,
  };
}

export const renderPtsRanking: PureStyleRenderer = (
  ctx,
  t,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
) => {
  void timeline;
  const { baseWidth: W, baseHeight: H } = size;
  const isHorizontal = custom.format === '16:9';
  const bgMode = resolveBackgroundMode(custom);
  const isGreenMode = bgMode === 'green';
  const isBlackMode = bgMode === 'black';

  const rawTitle = (content.pointsTitle ?? custom.pointsTitle ?? DEFAULT_POINTS_TITLE).trim();
  const rawItems = content.pointsItems || custom.pointsItems || DEFAULT_POINTS_ITEMS;
  const timing = content.pointsTiming || custom.pointsTiming || DEFAULT_POINTS_TIMING;
  const schedule = computePointsSchedule(rawTitle, rawItems, timing, 'pts_ranking');
  const itemCount = schedule.items.length;

  const firstText = schedule.items[0]?.item.text || rawTitle || '';
  const direction = resolveTextDirection(custom, firstText);
  const posBox = getPointsPositionBox(custom.position || 'center', custom.format, W, H);
  const isFullscreen = posBox.effectivePosition === 'fullscreen';

  const accentColor =
    custom.accentColor && custom.accentColor !== '#6FA8FF'
      ? custom.accentColor
      : PTS_RANKING_CONFIG.defaultAccent;
  const keywordRectFill =
    custom.keywordColor && custom.keywordColor !== '#FFD166'
      ? custom.keywordColor
      : PTS_RANKING_CONFIG.defaultKeywordColor;
  const textColor = PTS_RANKING_CONFIG.colors.textPrimary;

  const markerType: PointsMarkerType =
    custom.pointsMarkerType &&
    PTS_RANKING_CONFIG.supportedMarkerTypes.includes(custom.pointsMarkerType)
      ? custom.pointsMarkerType
      : PTS_RANKING_CONFIG.defaultMarkerType;

  const defaultFont =
    direction === 'ltr'
      ? PTS_RANKING_CONFIG.defaultEnglishQuoteFont
      : PTS_RANKING_CONFIG.defaultQuoteFont;
  const fontFamily = custom.quoteFontOverride || defaultFont;

  const globalExitP = easeInCubic(progress(t, schedule.exitStart, schedule.totalDuration));
  const globalAlpha = clamp(1 - globalExitP, 0, 1);

  ctx.save();

  // 1. Background Layer
  if (isGreenMode) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (isBlackMode) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = PTS_RANKING_CONFIG.colors.bgCharcoal;
    ctx.fillRect(0, 0, W, H);

    // Subtle radial dramatic spotlight in Style mode
    const rad = ctx.createRadialGradient(
      posBox.boxX + posBox.boxWidth * 0.5,
      posBox.boxY + posBox.boxHeight * 0.5,
      20,
      posBox.boxX + posBox.boxWidth * 0.5,
      posBox.boxY + posBox.boxHeight * 0.5,
      Math.max(posBox.boxWidth, posBox.boxHeight) * 0.72
    );
    rad.addColorStop(0, hexToRgba(accentColor, 0.16 * globalAlpha));
    rad.addColorStop(1, 'rgba(16, 17, 20, 0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, W, H);
  }

  if (globalAlpha <= 0.005) {
    ctx.restore();
    return;
  }

  ctx.globalAlpha = globalAlpha;

  // Reserve side space for the N-dot progress rail
  const railSideMargin = Math.max(36, Math.round(posBox.boxWidth * 0.07));
  const railX =
    direction === 'rtl'
      ? posBox.boxX + railSideMargin * 0.5
      : posBox.boxX + posBox.boxWidth - railSideMargin * 0.5;

  const stageBoxX = direction === 'rtl' ? posBox.boxX + railSideMargin : posBox.boxX;
  const stageBoxW = Math.max(140, posBox.boxWidth - railSideMargin);
  const stageCenterX = stageBoxX + stageBoxW * 0.5;

  // 2. Optional Title at top of stage
  let titleBottomY = posBox.boxY + 12;

  if (rawTitle.length > 0) {
    const titleP = easeOutQuart(progress(t, 0.08, schedule.introDuration));
    const titleFontSize = Math.round(
      clamp(isFullscreen ? (isHorizontal ? 38 : 34) : 28, 22, 48) *
        (custom.fontSizeMultiplier || 1)
    );
    const titleLayout = layoutArabicQuote(ctx, {
      text: rawTitle,
      quotationMarks: 'none',
      fontFamily,
      fontWeight: 800,
      minFontSize: Math.max(18, Math.round(titleFontSize * 0.75)),
      maxFontSize: titleFontSize,
      fontSizeMultiplier: 1,
      lineHeightRatio: 1.3,
      boxX: 0,
      boxY: 0,
      boxWidth: stageBoxW,
      boxHeight: Math.round(posBox.boxHeight * 0.18),
      align: 'center',
      direction,
      verticalAlign: 'top',
    });

    titleBottomY = posBox.boxY + titleLayout.totalHeight + 28;

    ctx.save();
    ctx.globalAlpha *= titleP;
    if (isGreenMode) {
      const padX = 24;
      const padY = 10;
      const pillW = Math.min(stageBoxW, titleLayout.maxLineWidth + padX * 2);
      const pillH = titleLayout.totalHeight + padY * 2;
      const pillX = stageCenterX - pillW * 0.5;
      const pillY = posBox.boxY + 4;
      ctx.fillStyle = '#0B0E17';
      ctx.fillRect(pillX + 6, pillY + 6, pillW, pillH);
      ctx.fillStyle = '#181B24';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 12);
      ctx.fill();
    }

    applyStudioCanvasTextProps(ctx, fontFamily, 800, titleLayout.fontSize, direction);
    for (const w of titleLayout.words) {
      ctx.fillStyle = w.isKeyword ? keywordRectFill : PTS_RANKING_CONFIG.colors.titleText;
      drawBidiWord(ctx, w.text, stageBoxX + w.x, posBox.boxY + 8 + w.y, direction);
    }
    ctx.restore();
  }

  // 3. Determine active item index
  let activeIndex = 0;
  for (let i = 0; i < itemCount; i++) {
    if (t >= schedule.items[i].startTime) {
      activeIndex = i;
    }
  }

  // 4. Draw Progress Rail with N dots on the side
  const railSpanH = Math.min(posBox.boxHeight * 0.56, Math.max(80, itemCount * 24));
  const railStartY = posBox.boxY + (posBox.boxHeight - railSpanH) * 0.5;
  const dotSpacing = itemCount > 1 ? railSpanH / (itemCount - 1) : 0;

  ctx.save();
  for (let i = 0; i < itemCount; i++) {
    const dotY =
      itemCount > 1 ? railStartY + i * dotSpacing : posBox.boxY + posBox.boxHeight * 0.5;
    const isCurrent = i === activeIndex && t >= (schedule.items[0]?.startTime ?? 0.6);
    const isPast = i < activeIndex && t >= (schedule.items[0]?.startTime ?? 0.6);
    const r = isCurrent ? 8 : 5;

    if (isGreenMode) {
      ctx.fillStyle = '#090C12';
      ctx.beginPath();
      ctx.arc(railX + 3, dotY + 3, r + 1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = isCurrent
      ? accentColor
      : isPast
        ? hexToRgba(accentColor, isGreenMode ? 0.85 : 0.55)
        : isGreenMode
          ? '#1E2433'
          : PTS_RANKING_CONFIG.colors.railInactive;
    ctx.beginPath();
    ctx.arc(railX, dotY, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 5. Helper to render a single countdown item on stage (either active entering or previous exiting)
  const stageTopY = titleBottomY + 12;
  const stageAvailH = Math.max(140, posBox.boxY + posBox.boxHeight - stageTopY - 12);

  const minFont = isFullscreen
    ? isHorizontal
      ? PTS_RANKING_CONFIG.sizes.fullscreenHorizMin
      : PTS_RANKING_CONFIG.sizes.fullscreenVertMin
    : isHorizontal
      ? PTS_RANKING_CONFIG.sizes.colHorizMin
      : PTS_RANKING_CONFIG.sizes.colVertMin;

  const maxFont = isFullscreen
    ? isHorizontal
      ? PTS_RANKING_CONFIG.sizes.fullscreenHorizMax
      : PTS_RANKING_CONFIG.sizes.fullscreenVertMax
    : isHorizontal
      ? PTS_RANKING_CONFIG.sizes.colHorizMax
      : PTS_RANKING_CONFIG.sizes.colVertMax;

  const renderStageItem = (idx: number, isExitingPrev: boolean, transitionTime: number) => {
    const item = schedule.items[idx];
    if (!item) return;

    // Countdown number: first item gets N, last item gets 1
    const countdownNum = item.displayNumber;
    const numStr =
      markerType === 'western' ? String(countdownNum) : toArabicIndicDigits(countdownNum);

    let stageAlpha = 1;
    let slideOffsetX = 0;
    let slideOffsetY = 0;
    let numScale = 1;
    let shakeX = 0;
    let shakeY = 0;
    let textPunchP = 1;
    let kwScaleP = 1;

    if (isExitingPrev) {
      const outP = easeInCubic(
        progress(
          t,
          transitionTime,
          transitionTime + PTS_RANKING_CONFIG.timings.prevSlideOutSec
        )
      );
      if (outP >= 1) return;
      stageAlpha = 1 - outP;
      slideOffsetX = (direction === 'rtl' ? 1 : -1) * 95 * outP;
    } else {
      const slamRaw = progress(
        t,
        item.startTime,
        item.startTime + PTS_RANKING_CONFIG.timings.numberSlamSec
      );
      if (slamRaw <= 0) return;

      const slamEased = easeOutBack(slamRaw, 1.85);
      numScale = lerp(1.4, 1.0, slamEased);
      stageAlpha = clamp(slamRaw * 2.5, 0, 1);

      // Tiny seeded camera/number shake (~4 px) right as the giant number slams in
      const elapsedSinceStart = t - item.startTime;
      if (
        elapsedSinceStart >= 0 &&
        elapsedSinceStart <= PTS_RANKING_CONFIG.timings.shakeDurationSec
      ) {
        const decay =
          1 - elapsedSinceStart / PTS_RANKING_CONFIG.timings.shakeDurationSec;
        shakeX =
          deterministicWave(t, combineSeed(custom.seed, 9600 + idx * 17), 48) *
          4.0 *
          decay;
        shakeY =
          deterministicWave(t, combineSeed(custom.seed, 9650 + idx * 17), 44) *
          4.0 *
          decay;
      }

      const punchStart = item.startTime + PTS_RANKING_CONFIG.timings.textPunchDelaySec;
      const punchRaw = progress(
        t,
        punchStart,
        punchStart + PTS_RANKING_CONFIG.timings.textPunchSec
      );
      textPunchP = easeOutBack(punchRaw, 1.55);
      slideOffsetY = (1 - textPunchP) * 28;

      kwScaleP = easeOutBack(
        progress(t, punchStart + 0.08, punchStart + 0.42),
        1.75
      );
    }

    const numFontSize = Math.round(
      clamp(stageAvailH * 0.34, 68, isFullscreen ? 180 : 130)
    );
    const numCenterY = stageTopY + stageAvailH * 0.28;

    const textBoxY = stageTopY + stageAvailH * 0.48;
    const textBoxH = Math.max(80, stageAvailH * 0.5);
    const textPadX = Math.round(stageBoxW * 0.05);
    const textOriginX = stageBoxX + textPadX;
    const textBoxW = Math.max(100, stageBoxW - textPadX * 2);

    const itemLayout = layoutArabicQuote(ctx, {
      text: item.item.text,
      quotationMarks: 'none',
      fontFamily,
      fontWeight: 800,
      minFontSize: Math.max(18, Math.round(minFont * (custom.fontSizeMultiplier || 1))),
      maxFontSize: Math.max(24, Math.round(maxFont * (custom.fontSizeMultiplier || 1))),
      fontSizeMultiplier: 1,
      lineHeightRatio: 1.38,
      boxX: 0,
      boxY: 0,
      boxWidth: textBoxW,
      boxHeight: textBoxH,
      align: 'center',
      direction,
      verticalAlign: 'top',
    });

    ctx.save();
    ctx.globalAlpha *= stageAlpha;
    ctx.translate(slideOffsetX + shakeX, shakeY);

    // Optional solid backing card in Green mode so chroma key is 100% hard-edged
    if (isGreenMode) {
      const cardW = Math.min(stageBoxW, Math.max(260, itemLayout.maxLineWidth + 80));
      const cardH = stageAvailH * 0.88;
      const cardX = stageCenterX - cardW * 0.5;
      const cardY = stageTopY + stageAvailH * 0.05;

      ctx.fillStyle = '#090B10';
      ctx.beginPath();
      ctx.roundRect(cardX + 8, cardY + 8, cardW, cardH, 20);
      ctx.fill();

      ctx.fillStyle = PTS_RANKING_CONFIG.colors.bgCharcoal;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 20);
      ctx.fill();
      ctx.stroke();
    }

    // 5a. Giant countdown number slamming in above/behind text
    ctx.save();
    ctx.translate(stageCenterX, numCenterY);
    ctx.scale(numScale, numScale);

    applyStudioCanvasTextProps(ctx, fontFamily, 900, numFontSize, direction);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Hard offset shadow behind giant number
    ctx.fillStyle = isBlackMode ? hexToRgba(accentColor, 0.35) : '#050608';
    ctx.fillText(numStr, 5, 6);

    ctx.fillStyle = accentColor;
    ctx.fillText(numStr, 0, 0);
    ctx.restore();

    // 5b. Item Text punching in below giant number
    if (isExitingPrev || textPunchP > 0.01) {
      ctx.save();
      ctx.globalAlpha *= clamp(isExitingPrev ? 1 : textPunchP, 0, 1);
      ctx.translate(0, slideOffsetY);

      // Rounded accent rectangle behind keywords (#FFD400, dark text) scaling in with overshoot
      if (itemLayout.keywordLineRects.length > 0 && kwScaleP > 0.01) {
        for (const rect of itemLayout.keywordLineRects) {
          const padX = Math.max(8, Math.round(itemLayout.fontSize * 0.16));
          const padY = Math.max(4, Math.round(itemLayout.fontSize * 0.08));
          const rx = textOriginX + rect.leftX - padX;
          const ry = textBoxY + rect.topY - padY;
          const rw = rect.width + padX * 2;
          const rh = Math.max(24, rect.bottomY - rect.topY) + padY * 2;
          const rcx = rx + rw * 0.5;
          const rcy = ry + rh * 0.5;

          ctx.save();
          ctx.translate(rcx, rcy);
          ctx.scale(kwScaleP, kwScaleP);
          ctx.translate(-rcx, -rcy);

          if (isGreenMode) {
            ctx.fillStyle = '#090B10';
            ctx.beginPath();
            ctx.roundRect(rx + 4, ry + 4, rw, rh, 10);
            ctx.fill();
          }

          ctx.fillStyle = keywordRectFill;
          ctx.beginPath();
          ctx.roundRect(rx, ry, rw, rh, 10);
          ctx.fill();
          ctx.restore();
        }
      }

      // Draw words (no glyph width change; keywords drawn in dark text over #FFD400 rect)
      applyStudioCanvasTextProps(ctx, fontFamily, 800, itemLayout.fontSize, direction);

      for (const w of itemLayout.words) {
        if (!w.isKeyword && !isGreenMode) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          drawBidiWord(ctx, w.text, textOriginX + w.x + 2, textBoxY + w.y + 3, direction);
        }
        ctx.fillStyle = w.isKeyword
          ? PTS_RANKING_CONFIG.colors.keywordDarkText
          : textColor;
        drawBidiWord(ctx, w.text, textOriginX + w.x, textBoxY + w.y, direction);
      }

      ctx.restore();
    }

    ctx.restore();
  };

  // Render previous item sliding out if we just transitioned to activeIndex > 0
  if (activeIndex > 0) {
    const activeStartT = schedule.items[activeIndex].startTime;
    if (
      t >= activeStartT &&
      t <= activeStartT + PTS_RANKING_CONFIG.timings.prevSlideOutSec
    ) {
      renderStageItem(activeIndex - 1, true, activeStartT);
    }
  }

  // Render current active item
  if (schedule.items.length > 0 && t >= schedule.items[0].startTime) {
    renderStageItem(activeIndex, false, schedule.items[activeIndex].startTime);
  }

  ctx.restore();
};
