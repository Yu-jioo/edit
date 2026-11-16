import {
  ArabicFontFamily,
  BackgroundMode,
  EnglishFontFamily,
  PointsItem,
  PointsMarkerType,
  PointsStyleId,
  PointsTimingConfig,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  StyleLightPalette,
  TimelineConfig,
} from '../types';
import { getCachedPtsCleanBackdrop } from '../utils/assetCache';
import {
  clamp,
  computePointsSchedule,
  DEFAULT_POINTS_ITEMS,
  DEFAULT_POINTS_TIMING,
  DEFAULT_POINTS_TITLE,
  detectTextDirection,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  formatPointMarker,
  getPointsPositionBox,
  hexToRgba,
  lerp,
  progress,
  resolveBackgroundMode,
  ScheduledPointItem,
} from '../utils/math';
import {
  applyStudioCanvasTextProps,
  ArabicQuoteLayout,
  drawBidiWord,
  getFontCalibration,
  layoutArabicQuote,
} from '../utils/textLayout';

export const PTS_CLEAN_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#F2F5FA',
  textSecondary: '#94A3B8',
  accent: '#4C8DFF',
  keyword: '#FFD166',
  border: '#4C8DFF',
};

export const PTS_CLEAN_CONFIG = {
  id: 'pts_clean' as const,
  mode: 'points' as const,
  nameAr: 'قائمة مرقمة نظيفة',
  nameEn: 'Clean Numbered List',
  descriptionAr:
    'خلفية كحلية داكنة بشبكة خفيفة وأرقام كبيرة نابضة وخطوط فاصلة رفيعة مع مسح انسيابي للنص',
  defaultAccent: '#4C8DFF',
  defaultKeywordColor: '#FFD166',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  lightPalette: PTS_CLEAN_LIGHT_PALETTE,
  allowedFonts: [
    'Cairo',
    'Readex Pro',
    'Tajawal',
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
    bgTop: '#0B0F1A',
    bgBottom: '#141B2D',
    panelGreenFill: '#0D1322',
    textPrimary: '#F2F5FA',
    textSecondary: '#A8B3C7',
    accent: '#4C8DFF',
    keyword: '#FFD166',
    divider: 'rgba(242, 245, 250, 0.14)',
  },
  fonts: {
    arabic: 'Cairo' as ArabicFontFamily,
    english: 'Plus Jakarta Sans' as EnglishFontFamily,
    weight: 700,
    titleWeight: 800,
  },
  sizes: {
    minFontSize: 22,
    maxFontSize: 46,
    lineHeightRatio: 1.58,
    markerScale: 1.38,
  },
  timings: {
    introDuration: 0.6,
    exitDuration: 0.6,
    defaultInterval: 1.2,
    itemWipeDuration: 0.38,
    dimTransitionSec: 0.24,
  },
};

export interface PrelaidPointSlot {
  sched: ScheduledPointItem;
  direction: ResolvedTextDirection;
  markerText: string;
  layout: ArabicQuoteLayout;
  slotX: number;
  slotY: number;
  slotW: number;
  slotH: number;
  textX: number;
  textY: number;
  textW: number;
  markerCenterX: number;
  markerCenterY: number;
  keywordTimes: number[];
}

export interface AutoFitPointsLayoutResult {
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  effectivePosition: 'center' | 'right' | 'left' | 'fullscreen';
  fontFamily: string;
  fontSize: number;
  titleText: string;
  titleDirection: ResolvedTextDirection;
  titleLayout: ArabicQuoteLayout | null;
  titleY: number;
  titleKeywordTimes: number[];
  items: PrelaidPointSlot[];
  allKeywordTimes: number[];
  contentTopY: number;
  contentBottomY: number;
  gridCols: 1 | 2;
}

/**
 * Shared binary-search auto-fit layout engine for Multi Points styles.
 * Guarantees that the optional title + all 2..12 items fit inside the target position region
 * at their FINAL size from frame 0 so nothing ever overflows or jitters.
 */
export function buildAutoFitPointsLayout(params: {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  content: QuoteContent;
  custom: StyleCustomization;
  size: RenderSize;
  styleId: PointsStyleId;
  allowedArabicFonts: ArabicFontFamily[];
  defaultArabicFont: ArabicFontFamily;
  defaultEnglishFont: EnglishFontFamily;
  fontWeight: number | string;
  minFontSize: number;
  maxFontSize: number;
  lineHeightRatio: number;
  supportedMarkerTypes: PointsMarkerType[];
  defaultMarkerType: PointsMarkerType;
  forceMarkerType?: PointsMarkerType;
  allowTwoByTwoGrid?: boolean;
  innerPadXRatio?: number;
  innerPadYRatio?: number;
  markerReserveFactor?: number;
  itemPadYFactor?: number;
  itemGapYFactor?: number;
}): {
  schedule: ReturnType<typeof computePointsSchedule>;
  layout: AutoFitPointsLayoutResult;
} {
  const {
    ctx,
    content,
    custom,
    size,
    styleId,
    allowedArabicFonts,
    defaultArabicFont,
    defaultEnglishFont,
    fontWeight,
    minFontSize,
    maxFontSize,
    lineHeightRatio,
    supportedMarkerTypes,
    defaultMarkerType,
    forceMarkerType,
    allowTwoByTwoGrid = false,
    innerPadXRatio = 0.04,
    innerPadYRatio = 0.04,
    markerReserveFactor = 1.9,
    itemPadYFactor = 0.36,
    itemGapYFactor = 0.42,
  } = params;

  const { baseWidth: W, baseHeight: H } = size;
  const posBox = getPointsPositionBox(custom.position || 'center', custom.format, W, H);

  const rawTitle = (content.pointsTitle ?? custom.pointsTitle ?? DEFAULT_POINTS_TITLE).trim();
  const rawItems: PointsItem[] =
    content.pointsItems || custom.pointsItems || DEFAULT_POINTS_ITEMS;
  const timing: PointsTimingConfig = custom.pointsTiming || DEFAULT_POINTS_TIMING;

  const schedule = computePointsSchedule(rawTitle, rawItems, timing, styleId);
  const itemsCount = schedule.items.length;

  let markerType: PointsMarkerType =
    forceMarkerType || custom.pointsMarkerType || defaultMarkerType;
  if (!forceMarkerType && !supportedMarkerTypes.includes(markerType)) {
    markerType = defaultMarkerType;
  }

  const combinedText = [rawTitle, ...schedule.items.map((it) => it.item.text)].join(' ');
  const baseDir: ResolvedTextDirection =
    custom.textDirection && custom.textDirection !== 'auto'
      ? custom.textDirection
      : detectTextDirection(combinedText, 'auto');

  const defaultFont = baseDir === 'ltr' ? defaultEnglishFont : defaultArabicFont;
  let fontFamily: string = custom.quoteFontOverride || defaultFont;
  if (
    baseDir === 'rtl' &&
    custom.quoteFontOverride &&
    !allowedArabicFonts.includes(custom.quoteFontOverride as ArabicFontFamily)
  ) {
    fontFamily = defaultFont;
  }

  const densityCompression =
    itemsCount <= 6 ? 1 : clamp(1 - (itemsCount - 6) * 0.085, 0.44, 1);
  const effectiveInnerPadYRatio =
    itemsCount > 8
      ? Math.max(innerPadYRatio >= 0.1 ? 0.075 : 0.02, innerPadYRatio * 0.62)
      : innerPadYRatio;

  const padX = Math.round(posBox.boxWidth * innerPadXRatio);
  const padY = Math.round(posBox.boxHeight * effectiveInnerPadYRatio);
  const innerX = posBox.boxX + padX;
  const innerY = posBox.boxY + padY;
  const innerW = Math.max(200, posBox.boxWidth - padX * 2);
  const innerH = Math.max(180, posBox.boxHeight - padY * 2);

  const useGrid2x2 =
    allowTwoByTwoGrid &&
    custom.format === '16:9' &&
    posBox.effectivePosition === 'fullscreen' &&
    itemsCount >= 2 &&
    itemsCount <= 4;
  const gridCols: 1 | 2 = useGrid2x2 ? 2 : 1;
  const colGapX = gridCols === 2 ? Math.round(innerW * 0.035) : 0;
  const colW = gridCols === 2 ? Math.floor((innerW - colGapX) / 2) : innerW;

  const fontCal = getFontCalibration(fontFamily);
  const calibratedLineHeightRatio = Math.max(
    lineHeightRatio + fontCal.lineHeightBonus,
    fontCal.minLineHeightRatio
  );

  const measureAtFontSize = (candidateSize: number) => {
    const markerW =
      markerType === 'none'
        ? Math.round(candidateSize * 0.4)
        : Math.round(candidateSize * markerReserveFactor);
    const itemPadX = Math.round(candidateSize * 0.55);
    const itemPadY = Math.max(
      2,
      Math.round(
        candidateSize *
          (itemPadYFactor * densityCompression +
            fontCal.lineHeightBonus * 0.4 * densityCompression)
      )
    );
    const itemGapY = Math.max(
      3,
      Math.round(
        candidateSize *
          (itemGapYFactor * densityCompression +
            fontCal.lineHeightBonus * 0.3 * densityCompression)
      )
    );

    let titleLayout: ArabicQuoteLayout | null = null;
    let titleBlockH = 0;
    const titleDir =
      custom.textDirection && custom.textDirection !== 'auto'
        ? custom.textDirection
        : detectTextDirection(rawTitle || combinedText, 'auto');

    if (rawTitle.length > 0) {
      const titleFontSize = Math.round(candidateSize * (itemsCount > 8 ? 1.12 : 1.18));
      titleLayout = layoutArabicQuote(ctx, {
        text: rawTitle,
        quotationMarks: 'none',
        fontFamily,
        fontWeight: 800,
        minFontSize: titleFontSize,
        maxFontSize: titleFontSize,
        fontSizeMultiplier: 1.0,
        keywordScaleMultiplier: 1.0,
        lineHeightRatio: 1.45,
        boxX: 0,
        boxY: 0,
        boxWidth: innerW - itemPadX * 2,
        boxHeight: 2000,
        align: titleDir === 'ltr' ? 'left' : 'right',
        direction: titleDir,
        verticalAlign: 'top',
      });
      titleBlockH =
        Math.ceil(titleLayout.totalHeight) +
        Math.max(8, Math.round(candidateSize * 0.72 * Math.max(0.55, densityCompression)));
    }

    const itemTextW = Math.max(100, colW - markerW - itemPadX * 2);
    const itemLayouts: {
      layout: ArabicQuoteLayout;
      dir: ResolvedTextDirection;
      rowH: number;
    }[] = [];

    let fitsAllWidths = titleLayout ? titleLayout.maxLineWidth <= (innerW - itemPadX * 2) * 1.02 : true;

    for (let i = 0; i < itemsCount; i++) {
      const schedItem = schedule.items[i];
      const itemDir: ResolvedTextDirection =
        custom.textDirection && custom.textDirection !== 'auto'
          ? custom.textDirection
          : detectTextDirection(schedItem.item.text, 'auto');

      const l = layoutArabicQuote(ctx, {
        text: schedItem.item.text,
        quotationMarks: 'none',
        fontFamily,
        fontWeight,
        minFontSize: candidateSize,
        maxFontSize: candidateSize,
        fontSizeMultiplier: 1.0,
        keywordScaleMultiplier: 1.0,
        lineHeightRatio,
        boxX: 0,
        boxY: 0,
        boxWidth: itemTextW,
        boxHeight: 4000,
        align: itemDir === 'ltr' ? 'left' : 'right',
        direction: itemDir,
        verticalAlign: 'top',
      });

      if (l.maxLineWidth > itemTextW * 1.02) {
        fitsAllWidths = false;
      }

      const minRowH = Math.round(
        candidateSize * fontCal.sizeScale * calibratedLineHeightRatio + itemPadY * 2
      );
      const rowH = Math.max(minRowH, Math.ceil(l.totalHeight) + itemPadY * 2);
      itemLayouts.push({ layout: l, dir: itemDir, rowH });
    }

    let itemsBlockH = 0;
    if (gridCols === 2) {
      const row0H = Math.max(itemLayouts[0]?.rowH || 0, itemLayouts[1]?.rowH || 0);
      const row1H =
        itemsCount > 2
          ? Math.max(itemLayouts[2]?.rowH || 0, itemLayouts[3]?.rowH || 0)
          : 0;
      itemsBlockH = row0H + (itemsCount > 2 ? itemGapY + row1H : 0);
    } else {
      itemsBlockH =
        itemLayouts.reduce((acc, it) => acc + it.rowH, 0) +
        Math.max(0, itemsCount - 1) * itemGapY;
    }

    const totalH = titleBlockH + itemsBlockH;
    return {
      titleLayout,
      titleDir,
      titleBlockH,
      itemLayouts,
      markerW,
      itemPadX,
      itemPadY,
      itemGapY,
      itemTextW,
      totalH,
      fits: fitsAllWidths && totalH <= innerH,
    };
  };

  const absMinFont = itemsCount > 8 ? 12 : 14;
  let low = Math.max(absMinFont, Math.round(minFontSize * (itemsCount > 8 ? 0.55 : 0.65)));
  let high = Math.round(maxFontSize);
  let bestSize = low;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const res = measureAtFontSize(mid);
    if (res.fits) {
      bestSize = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  let finalFontSize = clamp(
    Math.round(bestSize * clamp(custom.fontSizeMultiplier ?? 1.0, 0.7, 1.3)),
    absMinFont,
    Math.round(maxFontSize * 1.25)
  );

  let measured = measureAtFontSize(finalFontSize);
  while (finalFontSize > absMinFont && !measured.fits) {
    finalFontSize = Math.max(absMinFont, finalFontSize - 1);
    measured = measureAtFontSize(finalFontSize);
  }

  const contentTopY = innerY + Math.max(0, Math.round((innerH - measured.totalH) * 0.5));
  const titleY = contentTopY;
  const titleKeywordTimes: number[] = [];
  if (measured.titleLayout && measured.titleLayout.keywordGroups.length > 0) {
    for (let g = 0; g < measured.titleLayout.keywordGroups.length; g++) {
      titleKeywordTimes.push(0.32);
    }
  }

  const allKeywordTimes: number[] = [...titleKeywordTimes];
  const slots: PrelaidPointSlot[] = [];

  let currentY = contentTopY + measured.titleBlockH;

  if (gridCols === 2) {
    const row0H = Math.max(
      measured.itemLayouts[0]?.rowH || 0,
      measured.itemLayouts[1]?.rowH || 0
    );
    const row1H =
      itemsCount > 2
        ? Math.max(measured.itemLayouts[2]?.rowH || 0, measured.itemLayouts[3]?.rowH || 0)
        : 0;

    for (let i = 0; i < itemsCount; i++) {
      const schedItem = schedule.items[i];
      const itemData = measured.itemLayouts[i];
      const rowIdx = Math.floor(i / 2);
      const colIdx = i % 2;
      // In RTL, column 0 is on the right, column 1 is on the left
      const visualCol = baseDir === 'ltr' ? colIdx : 1 - colIdx;
      const slotX = innerX + visualCol * (colW + colGapX);
      const slotY = rowIdx === 0 ? currentY : currentY + row0H + measured.itemGapY;
      const slotW = colW;
      const slotH = rowIdx === 0 ? row0H : row1H;

      const isItemLtr = itemData.dir === 'ltr';
      const markerCenterX = isItemLtr
        ? slotX + measured.itemPadX + measured.markerW * 0.45
        : slotX + slotW - measured.itemPadX - measured.markerW * 0.45;
      const markerCenterY = slotY + slotH * 0.5;

      const textX = isItemLtr
        ? slotX + measured.itemPadX + measured.markerW
        : slotX + measured.itemPadX;
      const textY = slotY + Math.round((slotH - itemData.layout.totalHeight) * 0.5);

      const kwTimes: number[] = [];
      for (const rect of itemData.layout.keywordLineRects) {
        const lineW = Math.max(1, slotW);
        const relPos = isItemLtr
          ? rect.leftX / lineW
          : (measured.itemTextW - rect.rightX) / lineW;
        const kwT = Number(
          (schedItem.startTime + 0.08 + clamp(relPos, 0, 1) * 0.24).toFixed(3)
        );
        kwTimes.push(kwT);
        allKeywordTimes.push(kwT);
      }

      slots.push({
        sched: schedItem,
        direction: itemData.dir,
        markerText: formatPointMarker(i, markerType, itemsCount, false),
        layout: itemData.layout,
        slotX,
        slotY,
        slotW,
        slotH,
        textX,
        textY,
        textW: measured.itemTextW,
        markerCenterX,
        markerCenterY,
        keywordTimes: kwTimes,
      });
    }
    currentY += row0H + (itemsCount > 2 ? measured.itemGapY + row1H : 0);
  } else {
    for (let i = 0; i < itemsCount; i++) {
      const schedItem = schedule.items[i];
      const itemData = measured.itemLayouts[i];
      const slotX = innerX;
      const slotY = currentY;
      const slotW = innerW;
      const slotH = itemData.rowH;

      const isItemLtr = itemData.dir === 'ltr';
      const markerCenterX = isItemLtr
        ? slotX + measured.itemPadX + measured.markerW * 0.45
        : slotX + slotW - measured.itemPadX - measured.markerW * 0.45;
      const markerCenterY = slotY + slotH * 0.5;

      const textX = isItemLtr
        ? slotX + measured.itemPadX + measured.markerW
        : slotX + measured.itemPadX;
      const textY = slotY + Math.round((slotH - itemData.layout.totalHeight) * 0.5);

      const kwTimes: number[] = [];
      for (const rect of itemData.layout.keywordLineRects) {
        const lineW = Math.max(1, measured.itemTextW);
        const relPos = isItemLtr
          ? rect.leftX / lineW
          : (measured.itemTextW - rect.rightX) / lineW;
        const kwT = Number(
          (schedItem.startTime + 0.08 + clamp(relPos, 0, 1) * 0.24).toFixed(3)
        );
        kwTimes.push(kwT);
        allKeywordTimes.push(kwT);
      }

      slots.push({
        sched: schedItem,
        direction: itemData.dir,
        markerText: formatPointMarker(i, markerType, itemsCount, false),
        layout: itemData.layout,
        slotX,
        slotY,
        slotW,
        slotH,
        textX,
        textY,
        textW: measured.itemTextW,
        markerCenterX,
        markerCenterY,
        keywordTimes: kwTimes,
      });

      currentY += slotH + measured.itemGapY;
    }
  }

  return {
    schedule,
    layout: {
      boxX: posBox.boxX,
      boxY: posBox.boxY,
      boxW: posBox.boxWidth,
      boxH: posBox.boxHeight,
      effectivePosition: posBox.effectivePosition,
      fontFamily,
      fontSize: finalFontSize,
      titleText: rawTitle,
      titleDirection: measured.titleDir,
      titleLayout: measured.titleLayout,
      titleY,
      titleKeywordTimes,
      items: slots,
      allKeywordTimes,
      contentTopY,
      contentBottomY: contentTopY + measured.totalH,
      gridCols,
    },
  };
}

/**
 * Evaluates the opacity multiplier for item `i` when "تمييز النقطة الحالية" (pointsHighlightCurrent)
 * is enabled: current item is 1.0 (bright), previous items smoothly dim to 0.45.
 */
export function getPointHighlightAlpha(
  t: number,
  index: number,
  items: ScheduledPointItem[],
  highlightCurrent: boolean = true,
  dimTarget: number = 0.45
): number {
  if (!highlightCurrent) return 1.0;
  const nextItem = items[index + 1];
  if (!nextItem || t < nextItem.startTime) return 1.0;
  const dimP = progress(t, nextItem.startTime, nextItem.startTime + 0.24);
  return lerp(1.0, dimTarget, easeOutCubic(dimP));
}

/**
  * Draws a pre-laid ArabicQuoteLayout at (originX, originY) with optional horizontal clip wipe,
  * keyword color + thin underline stroke (no glyph width change), and optional crisp outline/hard-shadow
  * for pure Chroma Key Green Screen isolation without a container box.
  */
export function drawPointTextWithWipeAndKeywords(params: {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  layout: ArabicQuoteLayout;
  originX: number;
  originY: number;
  wipeProgress: number; // 0..1
  textColor: string;
  keywordColor: string;
  underlineKeywords?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
  hardShadowOffset?: number;
}) {
  const {
    ctx,
    layout,
    originX,
    originY,
    wipeProgress,
    textColor,
    keywordColor,
    underlineKeywords = true,
    outlineColor,
    outlineWidth = 2.5,
    hardShadowOffset = 0,
  } = params;

  const p = clamp(wipeProgress, 0, 1);
  if (p <= 0.001) return;

  const isLtr = layout.direction === 'ltr';
  const pad = Math.ceil(layout.fontSize * 0.62);
  const fullW = layout.boxWidth + pad * 2;
  const fullH = layout.totalHeight + pad * 2;

  ctx.save();
  if (p < 0.999) {
    const clipW = fullW * p;
    const clipX = isLtr ? originX - pad : originX + layout.boxWidth + pad - clipW;
    ctx.beginPath();
    ctx.rect(clipX, originY - pad, clipW, fullH);
    ctx.clip();
  }

  applyStudioCanvasTextProps(
    ctx,
    layout.fontFamily,
    layout.fontWeight,
    layout.fontSize,
    layout.direction
  );

  // When outlineColor is set (e.g. pure green-screen floating text), draw a crisp multi-offset
  // solid casing + hard drop shadow using fillText so Arabic cursive ligatures stay 100% seamless
  if (outlineColor) {
    ctx.fillStyle = outlineColor;
    const r = Math.max(1.5, outlineWidth);
    const d = Math.round(r * 0.72 * 10) / 10;
    const offsets: [number, number][] = [
      [-r, 0],
      [r, 0],
      [0, -r],
      [0, r],
      [-d, -d],
      [d, -d],
      [-d, d],
      [d, d],
    ];
    if (hardShadowOffset > 0) {
      offsets.push(
        [hardShadowOffset, hardShadowOffset],
        [hardShadowOffset + 1, hardShadowOffset],
        [hardShadowOffset, hardShadowOffset + 1]
      );
    }
    for (const w of layout.words) {
      const wx = originX + w.x;
      const wy = originY + w.y;
      for (let oi = 0; oi < offsets.length; oi++) {
        drawBidiWord(
          ctx,
          w.text,
          wx + offsets[oi][0],
          wy + offsets[oi][1],
          layout.direction
        );
      }
    }
  }

  for (const w of layout.words) {
    ctx.fillStyle = w.isKeyword ? keywordColor : textColor;
    drawBidiWord(ctx, w.text, originX + w.x, originY + w.y, layout.direction);
  }

  if (underlineKeywords && layout.keywordLineRects.length > 0) {
    const baseLineW = Math.max(2, layout.fontSize * 0.065);
    ctx.lineCap = 'round';
    for (const rect of layout.keywordLineRects) {
      const ux1 = originX + rect.leftX;
      const ux2 = originX + rect.rightX;
      const uy = originY + rect.baselineY + layout.fontSize * 0.14;
      if (outlineColor) {
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = baseLineW + outlineWidth * 2;
        if (hardShadowOffset > 0) {
          ctx.beginPath();
          ctx.moveTo(ux1 + hardShadowOffset * 0.7, uy + hardShadowOffset * 0.7);
          ctx.lineTo(ux2 + hardShadowOffset * 0.7, uy + hardShadowOffset * 0.7);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(ux1, uy);
        ctx.lineTo(ux2, uy);
        ctx.stroke();
      }
      ctx.strokeStyle = keywordColor;
      ctx.lineWidth = baseLineW;
      ctx.beginPath();
      ctx.moveTo(ux1, uy);
      ctx.lineTo(ux2, uy);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function getPtsCleanEventTimes(
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
    styleId: 'pts_clean',
    allowedArabicFonts: PTS_CLEAN_CONFIG.allowedFonts,
    defaultArabicFont: PTS_CLEAN_CONFIG.defaultQuoteFont,
    defaultEnglishFont: PTS_CLEAN_CONFIG.defaultEnglishQuoteFont,
    fontWeight: PTS_CLEAN_CONFIG.fonts.weight,
    minFontSize: PTS_CLEAN_CONFIG.sizes.minFontSize,
    maxFontSize: PTS_CLEAN_CONFIG.sizes.maxFontSize,
    lineHeightRatio: PTS_CLEAN_CONFIG.sizes.lineHeightRatio,
    supportedMarkerTypes: PTS_CLEAN_CONFIG.supportedMarkerTypes,
    defaultMarkerType: PTS_CLEAN_CONFIG.defaultMarkerType,
  });

  return {
    enterStart: schedule.introDuration,
    itemTimes: schedule.itemTimes,
    keywordTimes: layout.allKeywordTimes,
  };
}

export const renderPtsClean: PureStyleRenderer = (
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
    styleId: 'pts_clean',
    allowedArabicFonts: PTS_CLEAN_CONFIG.allowedFonts,
    defaultArabicFont: PTS_CLEAN_CONFIG.defaultQuoteFont,
    defaultEnglishFont: PTS_CLEAN_CONFIG.defaultEnglishQuoteFont,
    fontWeight: PTS_CLEAN_CONFIG.fonts.weight,
    minFontSize: PTS_CLEAN_CONFIG.sizes.minFontSize,
    maxFontSize: PTS_CLEAN_CONFIG.sizes.maxFontSize,
    lineHeightRatio: PTS_CLEAN_CONFIG.sizes.lineHeightRatio,
    supportedMarkerTypes: PTS_CLEAN_CONFIG.supportedMarkerTypes,
    defaultMarkerType: PTS_CLEAN_CONFIG.defaultMarkerType,
  });

  const accentColor =
    custom.accentColor && custom.accentColor !== '#6FA8FF'
      ? custom.accentColor
      : PTS_CLEAN_CONFIG.colors.accent;
  const keywordColor =
    custom.keywordColor && custom.keywordColor !== '#FFD166'
      ? custom.keywordColor
      : PTS_CLEAN_CONFIG.colors.keyword;
  const textColor = isBlack
    ? PTS_CLEAN_LIGHT_PALETTE.textPrimary
    : PTS_CLEAN_CONFIG.colors.textPrimary;

  // 1. Background
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (isBlack) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bgCanvas = getCachedPtsCleanBackdrop(W, H, accentColor);
    ctx.drawImage(bgCanvas, 0, 0, W, H);
  }

  // Master enter & exit
  const introP = easeOutCubic(progress(t, 0.04, schedule.introDuration * 0.85));
  const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
  const exitFactor = 1 - easeInCubic(exitP);
  const masterAlpha = clamp(introP * exitFactor, 0, 1);

  if (masterAlpha <= 0.005) {
    ctx.restore();
    return;
  }

  ctx.globalAlpha = masterAlpha;

  // In Green mode, draw a crisp hard-edged dark navy panel behind the list so white text & dividers chroma-key cleanly
  if (isGreen) {
    const padPanelX = 28;
    const padPanelY = 24;
    const panelX = Math.max(12, layout.boxX - padPanelX);
    const panelY = Math.max(12, layout.contentTopY - padPanelY);
    const panelW = Math.min(W - 24, layout.boxW + padPanelX * 2);
    const panelH = Math.min(
      H - 24,
      layout.contentBottomY - layout.contentTopY + padPanelY * 2
    );

    // Hard offset shadow (no blur)
    ctx.fillStyle = '#050811';
    ctx.beginPath();
    ctx.roundRect(panelX + 8, panelY + 8, panelW, panelH, 18);
    ctx.fill();

    ctx.fillStyle = PTS_CLEAN_CONFIG.colors.panelGreenFill;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 18);
    ctx.fill();
    ctx.stroke();
  }

  // 2. Optional Title
  if (layout.titleLayout && layout.titleText.length > 0) {
    const titleWipe = easeOutCubic(progress(t, 0.1, 0.52));
    const isTitleLtr = layout.titleDirection === 'ltr';
    const titleOriginX = isTitleLtr
      ? layout.boxX + Math.round(layout.boxW * 0.04)
      : layout.boxX +
        layout.boxW -
        Math.round(layout.boxW * 0.04) -
        layout.titleLayout.boxWidth;

    drawPointTextWithWipeAndKeywords({
      ctx,
      layout: layout.titleLayout,
      originX: titleOriginX,
      originY: layout.titleY,
      wipeProgress: titleWipe,
      textColor,
      keywordColor,
      underlineKeywords: true,
    });

    // Accent bar beneath title
    const barW = Math.min(180, layout.boxW * 0.24) * titleWipe;
    if (barW > 1) {
      const barY = layout.titleY + layout.titleLayout.totalHeight + 10;
      const barX = isTitleLtr
        ? titleOriginX
        : titleOriginX + layout.titleLayout.boxWidth - barW;
      ctx.fillStyle = accentColor;
      ctx.fillRect(barX, barY, barW, 4);
    }
  }

  // 3. Items List with Popping Large Numerals + Thin Divider Lines + RTL Clip Wipe
  const highlightCurrent = custom.pointsHighlightCurrent ?? true;

  for (let i = 0; i < layout.items.length; i++) {
    const slot = layout.items[i];
    const sched = slot.sched;
    if (t < sched.startTime) continue;

    const itemAlpha = getPointHighlightAlpha(t, i, schedule.items, highlightCurrent, 0.45);
    const numPopP = progress(t, sched.startTime, sched.startTime + 0.34);
    const numScale = easeOutBack(numPopP, 1.85);
    const wipeP = easeOutCubic(
      progress(
        t,
        sched.startTime + 0.04,
        sched.startTime + PTS_CLEAN_CONFIG.timings.itemWipeDuration
      )
    );

    ctx.save();
    ctx.globalAlpha = masterAlpha * itemAlpha;

    // Large numeral / marker in accent color
    if (slot.markerText) {
      const scaleFactor =
        slot.markerText.length >= 2
          ? PTS_CLEAN_CONFIG.sizes.markerScale * 0.84
          : PTS_CLEAN_CONFIG.sizes.markerScale;
      const markerFontSize = Math.round(layout.fontSize * scaleFactor);
      ctx.save();
      ctx.translate(slot.markerCenterX, slot.markerCenterY);
      ctx.scale(numScale, numScale);
      applyStudioCanvasTextProps(
        ctx,
        layout.fontFamily,
        800,
        markerFontSize,
        slot.direction
      );
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = accentColor;
      ctx.fillText(slot.markerText, 0, 2);
      ctx.restore();
    }

    // Item text revealed by right-to-left (or LTR) clip wipe
    drawPointTextWithWipeAndKeywords({
      ctx,
      layout: slot.layout,
      originX: slot.textX,
      originY: slot.textY,
      wipeProgress: wipeP,
      textColor,
      keywordColor,
      underlineKeywords: true,
    });

    // Thin divider line below item (except after the last item)
    if (i < layout.items.length - 1) {
      const divW = slot.slotW * wipeP;
      const isItemLtr = slot.direction === 'ltr';
      const divX = isItemLtr ? slot.slotX : slot.slotX + slot.slotW - divW;
      const divY = Math.round(slot.slotY + slot.slotH + (layout.items[i + 1].slotY - (slot.slotY + slot.slotH)) * 0.5);

      ctx.strokeStyle = isBlack
        ? hexToRgba(accentColor, 0.38)
        : PTS_CLEAN_CONFIG.colors.divider;
      ctx.lineWidth = isBlack ? 1.5 : 1.2;
      ctx.beginPath();
      ctx.moveTo(divX, divY);
      ctx.lineTo(divX + divW, divY);
      ctx.stroke();
    }

    ctx.restore();
  }

  ctx.restore();
};
