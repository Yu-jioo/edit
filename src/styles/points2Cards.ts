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
import { getCachedPtsCardsBackdrop } from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  hexToRgba,
  lerp,
  progress,
  resolveBackgroundMode,
} from '../utils/math';
import { applyStudioCanvasTextProps } from '../utils/textLayout';
import {
  buildAutoFitPointsLayout,
  drawPointTextWithWipeAndKeywords,
  getPointHighlightAlpha,
} from './points1Clean';

export const PTS_CARDS_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#F2F5FA',
  textSecondary: '#A8B3C7',
  accent: '#3B82F6',
  keyword: '#FFD166',
  border: '#60A5FA',
};

export const PTS_CARDS_CONFIG = {
  id: 'pts_cards' as const,
  mode: 'points' as const,
  nameAr: 'بطاقات',
  nameEn: 'Cards',
  descriptionAr:
    'بطاقات بيضاء مستديرة بشريط جانبي ملون وشارة رقم، تسقط بنابض مرن مع شبكة 2×2 في الشاشة الكاملة',
  defaultAccent: '#2563EB',
  defaultKeywordColor: '#E11D48',
  defaultQuoteFont: 'Readex Pro' as ArabicFontFamily,
  defaultAuthorFont: 'Readex Pro' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  lightPalette: PTS_CARDS_LIGHT_PALETTE,
  allowedFonts: [
    'Readex Pro',
    'Cairo',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
    'KOMission Black',
    'Zain Rounded instance mob',
    '29LT Azahar Display AL TN Trial Bold',
  ] as ArabicFontFamily[],
  allowedEnglishFonts: ['Plus Jakarta Sans', 'Outfit', 'Manrope'] as EnglishFontFamily[],
  supportedMarkerTypes: [
    'arabic-indic',
    'western',
    'bullets',
    'checks',
    'none',
  ] as PointsMarkerType[],
  defaultMarkerType: 'arabic-indic' as PointsMarkerType,
  colors: {
    bgLight: '#EEF1F7',
    cardFill: '#FFFFFF',
    cardBorder: '#D8DFEC',
    textDark: '#141824',
    titleDark: '#0F172A',
    accent: '#2563EB',
    keyword: '#E11D48',
    hardShadowGreen: '#1E293B',
  },
  fonts: {
    arabic: 'Readex Pro' as ArabicFontFamily,
    english: 'Plus Jakarta Sans' as EnglishFontFamily,
    weight: 700,
    titleWeight: 800,
  },
  sizes: {
    minFontSize: 20,
    maxFontSize: 40,
    lineHeightRatio: 1.56,
    cardRadius: 18,
    sideBarWidth: 8,
  },
  timings: {
    introDuration: 0.6,
    exitDuration: 0.6,
    defaultInterval: 1.2,
    cardDropDuration: 0.42,
  },
};

export function getPtsCardsEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  void timeline;
  const { schedule, layout } = buildAutoFitPointsLayout({
    ctx,
    content,
    custom,
    size,
    styleId: 'pts_cards',
    allowedArabicFonts: PTS_CARDS_CONFIG.allowedFonts,
    defaultArabicFont: PTS_CARDS_CONFIG.defaultQuoteFont,
    defaultEnglishFont: PTS_CARDS_CONFIG.defaultEnglishQuoteFont,
    fontWeight: PTS_CARDS_CONFIG.fonts.weight,
    minFontSize: PTS_CARDS_CONFIG.sizes.minFontSize,
    maxFontSize: PTS_CARDS_CONFIG.sizes.maxFontSize,
    lineHeightRatio: PTS_CARDS_CONFIG.sizes.lineHeightRatio,
    supportedMarkerTypes: PTS_CARDS_CONFIG.supportedMarkerTypes,
    defaultMarkerType: PTS_CARDS_CONFIG.defaultMarkerType,
    allowTwoByTwoGrid: true,
    innerPadXRatio: 0.03,
    innerPadYRatio: 0.03,
    markerReserveFactor: 2.1,
    itemPadYFactor: 0.46,
    itemGapYFactor: 0.48,
  });

  return {
    enterStart: schedule.introDuration,
    itemTimes: schedule.itemTimes,
    keywordTimes: layout.allKeywordTimes,
  };
}

export const renderPtsCards: PureStyleRenderer = (
  ctx,
  t,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
) => {
  void timeline;
  const { baseWidth: W, baseHeight: H } = size;
  const bgMode = resolveBackgroundMode(custom);
  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';

  const { schedule, layout } = buildAutoFitPointsLayout({
    ctx,
    content,
    custom,
    size,
    styleId: 'pts_cards',
    allowedArabicFonts: PTS_CARDS_CONFIG.allowedFonts,
    defaultArabicFont: PTS_CARDS_CONFIG.defaultQuoteFont,
    defaultEnglishFont: PTS_CARDS_CONFIG.defaultEnglishQuoteFont,
    fontWeight: PTS_CARDS_CONFIG.fonts.weight,
    minFontSize: PTS_CARDS_CONFIG.sizes.minFontSize,
    maxFontSize: PTS_CARDS_CONFIG.sizes.maxFontSize,
    lineHeightRatio: PTS_CARDS_CONFIG.sizes.lineHeightRatio,
    supportedMarkerTypes: PTS_CARDS_CONFIG.supportedMarkerTypes,
    defaultMarkerType: PTS_CARDS_CONFIG.defaultMarkerType,
    allowTwoByTwoGrid: true,
    innerPadXRatio: 0.03,
    innerPadYRatio: 0.03,
    markerReserveFactor: 2.1,
    itemPadYFactor: 0.46,
    itemGapYFactor: 0.48,
  });

  const accentColor =
    custom.accentColor && custom.accentColor !== '#6FA8FF'
      ? custom.accentColor
      : isBlack
        ? PTS_CARDS_LIGHT_PALETTE.accent
        : PTS_CARDS_CONFIG.colors.accent;
  const keywordColor =
    custom.keywordColor && custom.keywordColor !== '#FFD166'
      ? custom.keywordColor
      : isBlack
        ? PTS_CARDS_LIGHT_PALETTE.keyword
        : PTS_CARDS_CONFIG.colors.keyword;
  const textColor = isBlack
    ? PTS_CARDS_LIGHT_PALETTE.textPrimary
    : PTS_CARDS_CONFIG.colors.textDark;
  const titleColor = isBlack
    ? PTS_CARDS_LIGHT_PALETTE.textPrimary
    : PTS_CARDS_CONFIG.colors.titleDark;

  // 1. Background
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (isBlack) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bgCanvas = getCachedPtsCardsBackdrop(W, H);
    ctx.drawImage(bgCanvas, 0, 0, W, H);
  }

  const introP = easeOutCubic(progress(t, 0.04, schedule.introDuration * 0.85));
  const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
  const exitFactor = 1 - easeInCubic(exitP);
  const masterAlpha = clamp(introP * exitFactor, 0, 1);

  if (masterAlpha <= 0.005) {
    ctx.restore();
    return;
  }

  ctx.globalAlpha = masterAlpha;

  // 2. Optional Title
  if (layout.titleLayout && layout.titleText.length > 0) {
    const titleEnterP = easeOutBack(progress(t, 0.08, 0.5), 1.4);
    const isTitleLtr = layout.titleDirection === 'ltr';
    const titleOriginX = isTitleLtr
      ? layout.boxX + Math.round(layout.boxW * 0.03)
      : layout.boxX +
        layout.boxW -
        Math.round(layout.boxW * 0.03) -
        layout.titleLayout.boxWidth;

    ctx.save();
    // In Green mode, put a crisp white pill/card behind the dark title so it stands out with hard shadow
    if (isGreen) {
      const tPadX = 20;
      const tPadY = 10;
      const tCardW = Math.min(layout.boxW, layout.titleLayout.maxLineWidth + tPadX * 2);
      const tCardH = layout.titleLayout.totalHeight + tPadY * 2;
      const tCardX = isTitleLtr
        ? titleOriginX - tPadX
        : titleOriginX + layout.titleLayout.boxWidth - tCardW + tPadX;
      const tCardY = layout.titleY - tPadY;

      ctx.fillStyle = PTS_CARDS_CONFIG.colors.hardShadowGreen;
      ctx.beginPath();
      ctx.roundRect(tCardX + 5, tCardY + 5, tCardW, tCardH, 12);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(tCardX, tCardY, tCardW, tCardH, 12);
      ctx.fill();
      ctx.stroke();
    }

    drawPointTextWithWipeAndKeywords({
      ctx,
      layout: layout.titleLayout,
      originX: titleOriginX,
      originY: layout.titleY + lerp(-14, 0, clamp(titleEnterP, 0, 1)),
      wipeProgress: clamp(titleEnterP, 0, 1),
      textColor: titleColor,
      keywordColor,
      underlineKeywords: true,
    });
    ctx.restore();
  }

  // 3. Staggered Cards with Spring Drop-in (easeOutBack)
  const highlightCurrent = custom.pointsHighlightCurrent ?? true;
  const radius = PTS_CARDS_CONFIG.sizes.cardRadius;
  const sideBarW = PTS_CARDS_CONFIG.sizes.sideBarWidth;

  for (let i = 0; i < layout.items.length; i++) {
    const slot = layout.items[i];
    const sched = slot.sched;
    if (t < sched.startTime) continue;

    const dropP = progress(
      t,
      sched.startTime,
      sched.startTime + PTS_CARDS_CONFIG.timings.cardDropDuration
    );
    const springVal = easeOutBack(dropP, 1.65);
    const cardScale = lerp(0.86, 1.0, springVal);
    const dropOffsetY = lerp(-34, 0, springVal);
    const enterOpacity = clamp(dropP * 2.4, 0, 1);
    const itemAlpha = getPointHighlightAlpha(t, i, schedule.items, highlightCurrent, 0.45);

    const cx = slot.slotX + slot.slotW * 0.5;
    const cy = slot.slotY + slot.slotH * 0.5 + dropOffsetY;

    ctx.save();
    ctx.globalAlpha = masterAlpha * enterOpacity * itemAlpha;
    ctx.translate(cx, cy);
    ctx.scale(cardScale, cardScale);
    ctx.translate(-cx, -slot.slotY - slot.slotH * 0.5);

    // Card Background & Shadow/Outline according to Background Mode
    if (isBlack) {
      // Black mode: outlined bright cards, no dark fills
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(slot.slotX, slot.slotY, slot.slotW, slot.slotH, radius);
      ctx.stroke();
    } else if (isGreen) {
      // Green mode: hard offset shadow, no blur
      ctx.fillStyle = PTS_CARDS_CONFIG.colors.hardShadowGreen;
      ctx.beginPath();
      ctx.roundRect(slot.slotX + 6, slot.slotY + 6, slot.slotW, slot.slotH, radius);
      ctx.fill();

      ctx.fillStyle = PTS_CARDS_CONFIG.colors.cardFill;
      ctx.strokeStyle = PTS_CARDS_CONFIG.colors.cardBorder;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(slot.slotX, slot.slotY, slot.slotW, slot.slotH, radius);
      ctx.fill();
      ctx.stroke();
    } else {
      // Style mode: soft shadow + rounded white card
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.10)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = PTS_CARDS_CONFIG.colors.cardFill;
      ctx.beginPath();
      ctx.roundRect(slot.slotX, slot.slotY, slot.slotW, slot.slotH, radius);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = PTS_CARDS_CONFIG.colors.cardBorder;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(slot.slotX, slot.slotY, slot.slotW, slot.slotH, radius);
      ctx.stroke();
    }

    // Accent Side Bar (on the right in RTL, left in LTR)
    const isItemLtr = slot.direction === 'ltr';
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(slot.slotX, slot.slotY, slot.slotW, slot.slotH, radius);
    ctx.clip();

    ctx.fillStyle = accentColor;
    if (isItemLtr) {
      ctx.fillRect(slot.slotX, slot.slotY, sideBarW, slot.slotH);
    } else {
      ctx.fillRect(slot.slotX + slot.slotW - sideBarW, slot.slotY, sideBarW, slot.slotH);
    }
    ctx.restore();

    // Number / Marker Badge
    if (slot.markerText) {
      const badgeSize = Math.round(layout.fontSize * 1.36);
      const badgeX = slot.markerCenterX - badgeSize * 0.5;
      const badgeY = slot.markerCenterY - badgeSize * 0.5;

      if (isBlack) {
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, 12);
        ctx.stroke();
      } else {
        ctx.fillStyle = isGreen ? accentColor : hexToRgba(accentColor, 0.14);
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, 12);
        ctx.fill();
      }

      const markerScale = slot.markerText.length >= 2 ? 0.76 : 0.92;
      applyStudioCanvasTextProps(
        ctx,
        layout.fontFamily,
        800,
        Math.round(layout.fontSize * markerScale),
        slot.direction
      );
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isGreen ? '#FFFFFF' : accentColor;
      ctx.fillText(slot.markerText, slot.markerCenterX, slot.markerCenterY + 1);
    }

    // Card Item Text + Keywords
    drawPointTextWithWipeAndKeywords({
      ctx,
      layout: slot.layout,
      originX: slot.textX,
      originY: slot.textY,
      wipeProgress: 1.0,
      textColor,
      keywordColor,
      underlineKeywords: true,
    });

    ctx.restore();
  }

  ctx.restore();
};
