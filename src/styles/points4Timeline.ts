import {
  ArabicFontFamily,
  BackgroundMode,
  CalmStyleTheme,
  EnglishFontFamily,
  PointsItem,
  PointsMarkerType,
  PointsTimingConfig,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  StyleLightPalette,
  TimelineConfig,
  TimelineOrientation,
  TimelinePathShape,
  TimelineVerticalSide,
} from '../types';
import { getCachedPtsTimelineBackdrop } from '../utils/assetCache';
import {
  clamp,
  computePointsSchedule,
  DEFAULT_POINTS_ITEMS,
  DEFAULT_POINTS_TIMING,
  DEFAULT_POINTS_TITLE,
  detectTextDirection,
  easeInCubic,
  easeInOutCubic,
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
  getFontCalibration,
  layoutArabicQuote,
} from '../utils/textLayout';
import {
  buildAutoFitPointsLayout,
  drawPointTextWithWipeAndKeywords,
  getPointHighlightAlpha,
} from './points1Clean';

export const PTS_TIMELINE_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#F2F5FA',
  textSecondary: '#CBD5E1',
  accent: '#4DD8FF',
  keyword: '#FFD166',
  border: '#7C5CFF',
};

export const PTS_TIMELINE_CONFIG = {
  id: 'pts_timeline' as const,
  mode: 'points' as const,
  nameAr: 'خط زمني',
  nameEn: 'Timeline',
  descriptionAr:
    'خط زمني فاخر بعُقد متعددة الطبقات ورأس مسار متحرك و5 أشكال (مستقيم، موجي، متعرج، دائري، مدرج) أفقي أو رأسي مع تحكم كامل بالحجم والموضع',
  defaultAccent: '#4DD8FF',
  defaultKeywordColor: '#FFD166',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  lightPalette: PTS_TIMELINE_LIGHT_PALETTE,
  allowedFonts: [
    'Cairo',
    'Readex Pro',
    'Tajawal',
    'IBM Plex Sans Arabic',
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
    bgDark: '#070B14',
    gradStart: '#4DD8FF',
    gradEnd: '#7C5CFF',
    textPrimary: '#F2F5FA',
    keyword: '#FFD166',
    chromaOutline: '#05070D',
  },
  fonts: {
    arabic: 'Cairo' as ArabicFontFamily,
    english: 'Plus Jakarta Sans' as EnglishFontFamily,
    weight: 700,
    titleWeight: 800,
  },
  sizes: {
    minFontSize: 18,
    maxFontSize: 38,
    lineHeightRatio: 1.54,
  },
  timings: {
    introDuration: 0.6,
    exitDuration: 0.6,
    defaultInterval: 1.2,
    nodePopSec: 0.38,
    textSlideSec: 0.42,
  },
};

interface PathPoint {
  x: number;
  y: number;
}

interface PositionedTimelineNode {
  sched: ScheduledPointItem;
  direction: ResolvedTextDirection;
  markerText: string;
  layout: ArabicQuoteLayout;
  nodeX: number;
  nodeY: number;
  nodeRadius: number;
  stemPoints: PathPoint[];
  textX: number;
  textY: number;
  cardW: number;
  slideDirX: number;
  slideDirY: number;
  accentSide: 'right' | 'left' | 'top' | 'bottom';
  keywordTimes: number[];
}

interface UnifiedTimelineScene {
  schedule: ReturnType<typeof computePointsSchedule>;
  posBox: ReturnType<typeof getPointsPositionBox>;
  shape: TimelinePathShape;
  orientation: 'horizontal' | 'vertical' | 'circle';
  baseDir: ResolvedTextDirection;
  fontFamily: string;
  fontSize: number;
  nodeRadius: number;
  titleText: string;
  titleDirection: ResolvedTextDirection;
  titleLayout: ArabicQuoteLayout | null;
  titleX: number;
  titleY: number;
  nodes: PositionedTimelineNode[];
  segments: PathPoint[][];
  circleCenter?: { x: number; y: number; r: number };
  allKeywordTimes: number[];
}

export interface TimelineInteractiveTarget {
  index: number;
  id: string;
  nodeX: number;
  nodeY: number;
  nodeRadius: number;
  textBoxX: number;
  textBoxY: number;
  textBoxW: number;
  textBoxH: number;
}

export function resolveTimelineShape(custom: StyleCustomization): TimelinePathShape {
  const s = custom.timelineShape;
  if (
    s === 'straight' ||
    s === 'wave' ||
    s === 'zigzag' ||
    s === 'circle' ||
    s === 'stepped'
  ) {
    return s;
  }
  return 'straight';
}

export function resolveTimelineTheme(custom: StyleCustomization): CalmStyleTheme {
  const t = custom.timelineTheme ?? custom.styleTheme;
  return t === 'light' ? 'light' : 'dark';
}

export function isHorizontalSpan(custom: StyleCustomization, W: number, H: number): boolean {
  if (custom.format !== '16:9') return false;
  const posBox = getPointsPositionBox(custom.position || 'center', custom.format, W, H);
  return posBox.effectivePosition === 'fullscreen' || posBox.effectivePosition === 'center';
}

export function resolveEffectiveTimelineOrientation(
  custom: StyleCustomization,
  W: number,
  H: number
): 'horizontal' | 'vertical' {
  const pref: TimelineOrientation = custom.timelineOrientation || 'auto';
  if (pref === 'horizontal') return 'horizontal';
  if (pref === 'vertical') return 'vertical';
  return isHorizontalSpan(custom, W, H) ? 'horizontal' : 'vertical';
}

export function resolveEffectiveVerticalSide(
  custom: StyleCustomization,
  W: number,
  H: number,
  baseDir: ResolvedTextDirection
): 'alternating' | 'left' | 'right' {
  const pref: TimelineVerticalSide = custom.timelineVerticalSide || 'auto';
  if (pref === 'alternating' || pref === 'left' || pref === 'right') {
    return pref;
  }
  if (isHorizontalSpan(custom, W, H)) {
    return 'alternating';
  }
  return baseDir === 'ltr' ? 'right' : 'left';
}

/**
 * Generates a sampled polyline between p0 and p1 for the requested timeline shape.
 */
function buildSegmentPolyline(
  p0: PathPoint,
  p1: PathPoint,
  shape: TimelinePathShape,
  segIndex: number,
  orientation: 'horizontal' | 'vertical',
  waveMargin: number
): PathPoint[] {
  const steps = 40;
  const pts: PathPoint[] = [];

  if (shape === 'straight') {
    for (let s = 0; s <= 12; s++) {
      const u = s / 12;
      pts.push({
        x: lerp(p0.x, p1.x, u),
        y: lerp(p0.y, p1.y, u),
      });
    }
    return pts;
  }

  if (shape === 'wave') {
    const sign = segIndex % 2 === 0 ? 1 : -1;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const smoothU = u * u * (3 - 2 * u);
      const arch = Math.sin(u * Math.PI) * waveMargin * 0.38 * sign;
      if (orientation === 'horizontal') {
        pts.push({
          x: lerp(p0.x, p1.x, u),
          y: lerp(p0.y, p1.y, smoothU) + arch,
        });
      } else {
        pts.push({
          x: lerp(p0.x, p1.x, smoothU) + arch,
          y: lerp(p0.y, p1.y, u),
        });
      }
    }
    return pts;
  }

  if (shape === 'zigzag') {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const sign = segIndex % 2 === 0 ? 1 : -1;
    let vertices: PathPoint[];

    if (orientation === 'horizontal') {
      if (Math.abs(dy) < 6) {
        vertices = [
          p0,
          { x: lerp(p0.x, p1.x, 0.33), y: p0.y - waveMargin * sign },
          { x: lerp(p0.x, p1.x, 0.67), y: p0.y + waveMargin * sign },
          p1,
        ];
      } else {
        vertices = [
          p0,
          { x: lerp(p0.x, p1.x, 0.5), y: lerp(p0.y, p1.y, 0.5) + waveMargin * 0.28 * sign },
          p1,
        ];
      }
    } else {
      if (Math.abs(dx) < 6) {
        vertices = [
          p0,
          { x: p0.x - waveMargin * sign, y: lerp(p0.y, p1.y, 0.33) },
          { x: p0.x + waveMargin * sign, y: lerp(p0.y, p1.y, 0.67) },
          p1,
        ];
      } else {
        vertices = [
          p0,
          { x: lerp(p0.x, p1.x, 0.5) + waveMargin * 0.28 * sign, y: lerp(p0.y, p1.y, 0.5) },
          p1,
        ];
      }
    }

    return subdivideVertices(vertices, 14);
  }

  if (shape === 'stepped') {
    let vertices: PathPoint[];
    if (orientation === 'horizontal') {
      const midX = lerp(p0.x, p1.x, 0.5);
      if (Math.abs(p1.y - p0.y) < 8) {
        const stepOff = (segIndex % 2 === 0 ? -1 : 1) * Math.max(18, waveMargin * 0.75);
        vertices = [
          p0,
          { x: lerp(p0.x, p1.x, 0.25), y: p0.y },
          { x: lerp(p0.x, p1.x, 0.25), y: p0.y + stepOff },
          { x: lerp(p0.x, p1.x, 0.75), y: p0.y + stepOff },
          { x: lerp(p0.x, p1.x, 0.75), y: p1.y },
          p1,
        ];
      } else {
        vertices = [p0, { x: midX, y: p0.y }, { x: midX, y: p1.y }, p1];
      }
    } else {
      const midY = lerp(p0.y, p1.y, 0.5);
      if (Math.abs(p1.x - p0.x) < 8) {
        const stepOff = (segIndex % 2 === 0 ? -1 : 1) * Math.max(16, waveMargin * 0.75);
        vertices = [
          p0,
          { x: p0.x, y: lerp(p0.y, p1.y, 0.25) },
          { x: p0.x + stepOff, y: lerp(p0.y, p1.y, 0.25) },
          { x: p0.x + stepOff, y: lerp(p0.y, p1.y, 0.75) },
          { x: p1.x, y: lerp(p0.y, p1.y, 0.75) },
          p1,
        ];
      } else {
        vertices = [p0, { x: p0.x, y: midY }, { x: p1.x, y: midY }, p1];
      }
    }
    return subdivideVertices(vertices, 10);
  }

  return [p0, p1];
}

function subdivideVertices(vertices: PathPoint[], perLeg: number): PathPoint[] {
  const out: PathPoint[] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const startS = i === 0 ? 0 : 1;
    for (let s = startS; s <= perLeg; s++) {
      const u = s / perLeg;
      out.push({
        x: lerp(a.x, b.x, u),
        y: lerp(a.y, b.y, u),
      });
    }
  }
  return out;
}

/**
 * Builds the Orbital Circle ('circle') layout.
 */
function buildCircleTimelineScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  custom: StyleCustomization,
  size: RenderSize,
  effectiveOrientation: 'horizontal' | 'vertical'
): UnifiedTimelineScene {
  const { baseWidth: W, baseHeight: H } = size;
  const posBox = getPointsPositionBox(custom.position || 'center', custom.format, W, H);

  const rawTitle = (content.pointsTitle ?? custom.pointsTitle ?? DEFAULT_POINTS_TITLE).trim();
  const rawItems: PointsItem[] =
    content.pointsItems || custom.pointsItems || DEFAULT_POINTS_ITEMS;
  const timing: PointsTimingConfig = custom.pointsTiming || DEFAULT_POINTS_TIMING;
  const schedule = computePointsSchedule(rawTitle, rawItems, timing, 'pts_timeline');
  const itemsCount = schedule.items.length;

  let markerType: PointsMarkerType =
    custom.pointsMarkerType || PTS_TIMELINE_CONFIG.defaultMarkerType;
  if (!PTS_TIMELINE_CONFIG.supportedMarkerTypes.includes(markerType)) {
    markerType = PTS_TIMELINE_CONFIG.defaultMarkerType;
  }

  const combinedText = [rawTitle, ...schedule.items.map((it) => it.item.text)].join(' ');
  const baseDir: ResolvedTextDirection =
    custom.textDirection && custom.textDirection !== 'auto'
      ? custom.textDirection
      : detectTextDirection(combinedText, 'auto');

  const defaultFont =
    baseDir === 'ltr'
      ? PTS_TIMELINE_CONFIG.defaultEnglishQuoteFont
      : PTS_TIMELINE_CONFIG.defaultQuoteFont;
  let fontFamily: string = custom.quoteFontOverride || defaultFont;
  if (
    baseDir === 'rtl' &&
    custom.quoteFontOverride &&
    !PTS_TIMELINE_CONFIG.allowedFonts.includes(custom.quoteFontOverride as ArabicFontFamily)
  ) {
    fontFamily = defaultFont;
  }

  const padX = Math.round(posBox.boxWidth * 0.035);
  const padY = Math.round(posBox.boxHeight * 0.04);
  const innerX = posBox.boxX + padX;
  const innerY = posBox.boxY + padY;
  const innerW = Math.max(260, posBox.boxWidth - padX * 2);
  const innerH = Math.max(240, posBox.boxHeight - padY * 2);

  const primaryCount = Math.ceil(itemsCount / 2);
  const secondaryCount = itemsCount - primaryCount;
  const maxSideRows = Math.max(1, primaryCount);

  const isCompactWidth = innerW < 820;
  const ringRatioW = isCompactWidth ? 0.135 : 0.165;
  const baseRingR = clamp(
    Math.round(Math.min(innerW * ringRatioW, innerH * 0.25)),
    52,
    185
  );
  const baseStemGapX = Math.max(22, Math.round(innerW * 0.035));
  const sideCardW = Math.max(
    115,
    Math.floor((innerW - baseRingR * 2 - baseStemGapX * 2) * 0.5)
  );

  const fontCal = getFontCalibration(fontFamily);

  const measureAtSize = (candidateSize: number) => {
    let titleLayout: ArabicQuoteLayout | null = null;
    let titleBlockH = 0;

    if (rawTitle.length > 0) {
      const tSize = Math.round(candidateSize * 1.18);
      titleLayout = layoutArabicQuote(ctx, {
        text: rawTitle,
        quotationMarks: 'none',
        fontFamily,
        fontWeight: 800,
        minFontSize: tSize,
        maxFontSize: tSize,
        fontSizeMultiplier: 1.0,
        keywordScaleMultiplier: 1.0,
        lineHeightRatio: 1.42,
        boxX: 0,
        boxY: 0,
        boxWidth: innerW,
        boxHeight: 1000,
        align: 'center',
        direction: baseDir,
        verticalAlign: 'top',
      });
      titleBlockH = Math.ceil(titleLayout.totalHeight) + Math.round(candidateSize * 0.72);
    }

    const stageH = Math.max(160, innerH - titleBlockH);
    const circleDensity = itemsCount <= 8 ? 1 : clamp(1 - (itemsCount - 8) * 0.11, 0.5, 1);
    const slotGapY = Math.max(
      4,
      Math.round(candidateSize * (0.45 + fontCal.lineHeightBonus * 0.35) * circleDensity)
    );
    const maxSlotH = Math.max(
      28,
      Math.floor((stageH - Math.max(0, maxSideRows - 1) * slotGapY) / maxSideRows)
    );

    const itemLayouts: { layout: ArabicQuoteLayout; dir: ResolvedTextDirection }[] = [];
    let fitsAll = titleLayout ? titleLayout.maxLineWidth <= innerW * 1.02 : true;

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
        fontWeight: PTS_TIMELINE_CONFIG.fonts.weight,
        minFontSize: candidateSize,
        maxFontSize: candidateSize,
        fontSizeMultiplier: 1.0,
        keywordScaleMultiplier: 1.0,
        lineHeightRatio: PTS_TIMELINE_CONFIG.sizes.lineHeightRatio,
        boxX: 0,
        boxY: 0,
        boxWidth: sideCardW,
        boxHeight: 2000,
        align: itemDir === 'ltr' ? 'left' : 'right',
        direction: itemDir,
        verticalAlign: 'top',
      });

      if (l.maxLineWidth > sideCardW * 1.03 || l.totalHeight > maxSlotH) {
        fitsAll = false;
      }
      itemLayouts.push({ layout: l, dir: itemDir });
    }

    return {
      titleLayout,
      titleBlockH,
      stageH,
      slotGapY,
      maxSlotH,
      itemLayouts,
      fits: fitsAll,
    };
  };

  const circleAbsMin = itemsCount > 8 ? 12 : 14;
  let low = circleAbsMin;
  let high = PTS_TIMELINE_CONFIG.sizes.maxFontSize;
  let bestSize = low;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (measureAtSize(mid).fits) {
      bestSize = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  let finalFontSize = clamp(
    Math.round(bestSize * clamp(custom.fontSizeMultiplier ?? 1.0, 0.7, 1.3)),
    circleAbsMin,
    Math.round(PTS_TIMELINE_CONFIG.sizes.maxFontSize * 1.2)
  );
  let measured = measureAtSize(finalFontSize);
  while (finalFontSize > circleAbsMin && !measured.fits) {
    finalFontSize = Math.max(circleAbsMin, finalFontSize - 1);
    measured = measureAtSize(finalFontSize);
  }

  const stageTopY = innerY + measured.titleBlockH;
  const centerX = Math.round(innerX + innerW * 0.5);
  const centerY = Math.round(stageTopY + measured.stageH * 0.5);
  const nodeRadius = clamp(Math.round(finalFontSize * 0.66), itemsCount > 8 ? 11 : 14, 26);

  const spreadMult = clamp(custom.timelineSpread ?? 1.0, 0.6, 1.35);
  const stemMult = clamp(custom.timelineStemScale ?? 1.0, 0.5, 1.8);
  const ringR = Math.round(baseRingR * spreadMult);
  const stemGapX = Math.round(baseStemGapX * stemMult);

  const allKeywordTimes: number[] = [];
  if (measured.titleLayout && measured.titleLayout.keywordGroups.length > 0) {
    for (let g = 0; g < measured.titleLayout.keywordGroups.length; g++) {
      allKeywordTimes.push(0.32);
    }
  }

  const isReverseSweep = effectiveOrientation === 'vertical';
  const angles: number[] = [];
  const deg = Math.PI / 180;

  for (let i = 0; i < itemsCount; i++) {
    const isPrimary = i < primaryCount;
    if (baseDir === 'rtl') {
      if (!isReverseSweep) {
        if (isPrimary) {
          const frac = primaryCount <= 1 ? 0.5 : i / (primaryCount - 1);
          angles.push(lerp(-62 * deg, 62 * deg, frac));
        } else {
          const secIdx = i - primaryCount;
          const frac = secondaryCount <= 1 ? 0.5 : secIdx / (secondaryCount - 1);
          angles.push(lerp(118 * deg, 242 * deg, frac));
        }
      } else {
        if (isPrimary) {
          const frac = primaryCount <= 1 ? 0.5 : i / (primaryCount - 1);
          angles.push(lerp(62 * deg, -62 * deg, frac));
        } else {
          const secIdx = i - primaryCount;
          const frac = secondaryCount <= 1 ? 0.5 : secIdx / (secondaryCount - 1);
          angles.push(lerp(-118 * deg, -242 * deg, frac));
        }
      }
    } else {
      if (!isReverseSweep) {
        if (isPrimary) {
          const frac = primaryCount <= 1 ? 0.5 : i / (primaryCount - 1);
          angles.push(lerp(-118 * deg, -242 * deg, frac));
        } else {
          const secIdx = i - primaryCount;
          const frac = secondaryCount <= 1 ? 0.5 : secIdx / (secondaryCount - 1);
          angles.push(lerp(-62 * deg, 62 * deg, 1 - frac));
        }
      } else {
        if (isPrimary) {
          const frac = primaryCount <= 1 ? 0.5 : i / (primaryCount - 1);
          angles.push(lerp(-242 * deg, -118 * deg, frac));
        } else {
          const secIdx = i - primaryCount;
          const frac = secondaryCount <= 1 ? 0.5 : secIdx / (secondaryCount - 1);
          angles.push(lerp(-62 * deg, 62 * deg, frac));
        }
      }
    }
  }

  const nodes: PositionedTimelineNode[] = [];
  for (let i = 0; i < itemsCount; i++) {
    const schedItem = schedule.items[i];
    const itemData = measured.itemLayouts[i];
    const theta = angles[i];
    const nodeX = Math.round(centerX + Math.cos(theta) * ringR);
    const nodeY = Math.round(centerY + Math.sin(theta) * ringR);

    const isRightHalf = Math.cos(theta) >= 0;
    const isPrimary = i < primaryCount;
    const sideCount = isPrimary ? primaryCount : secondaryCount;
    const rawSideIdx = isPrimary ? i : secondaryCount - 1 - (i - primaryCount);
    const sideIndex = isReverseSweep ? sideCount - 1 - rawSideIdx : rawSideIdx;

    const bandSpanH = Math.min(
      measured.stageH * (itemsCount > 8 ? 0.94 : 0.88),
      Math.max(ringR * 2.1, sideCount * (measured.maxSlotH * 0.84))
    );
    const bandTopY = centerY - bandSpanH * 0.5;
    const targetAnchorY =
      sideCount <= 1
        ? centerY
        : Math.round(
            lerp(
              bandTopY + measured.maxSlotH * 0.35,
              bandTopY + bandSpanH - measured.maxSlotH * 0.35,
              sideIndex / (sideCount - 1)
            )
          );

    const radialOutX = Math.round(centerX + Math.cos(theta) * (ringR + nodeRadius + 14));
    const radialOutY = targetAnchorY;
    const stemEndX = isRightHalf
      ? Math.round(centerX + ringR + stemGapX)
      : Math.round(centerX - ringR - stemGapX);

    const textX = isRightHalf ? stemEndX + 12 : stemEndX - 12 - sideCardW;
    const textY = Math.round(targetAnchorY - itemData.layout.totalHeight * 0.5);

    const kwTimes: number[] = [];
    for (let r = 0; r < itemData.layout.keywordLineRects.length; r++) {
      const kwT = Number((schedItem.startTime + 0.16 + r * 0.06).toFixed(3));
      kwTimes.push(kwT);
      allKeywordTimes.push(kwT);
    }

    nodes.push({
      sched: schedItem,
      direction: itemData.dir,
      markerText: formatPointMarker(i, markerType, itemsCount, false),
      layout: itemData.layout,
      nodeX,
      nodeY,
      nodeRadius,
      stemPoints: [
        { x: nodeX, y: nodeY },
        { x: radialOutX, y: radialOutY },
        { x: stemEndX, y: radialOutY },
      ],
      textX,
      textY,
      cardW: sideCardW,
      slideDirX: isRightHalf ? 20 : -20,
      slideDirY: 0,
      accentSide: isRightHalf ? 'left' : 'right',
      keywordTimes: kwTimes,
    });
  }

  return {
    schedule,
    posBox,
    shape: 'circle',
    orientation: 'circle',
    baseDir,
    fontFamily,
    fontSize: finalFontSize,
    nodeRadius,
    titleText: rawTitle,
    titleDirection: baseDir,
    titleLayout: measured.titleLayout,
    titleX: innerX,
    titleY: innerY,
    nodes,
    segments: [],
    circleCenter: { x: centerX, y: centerY, r: ringR },
    allKeywordTimes,
  };
}

/**
 * Builds the Horizontal Timeline Scene for straight, wave, zigzag, or stepped shapes.
 */
function buildHorizontalTimelineScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  custom: StyleCustomization,
  size: RenderSize,
  shape: TimelinePathShape
): UnifiedTimelineScene {
  const { baseWidth: W, baseHeight: H } = size;
  const posBox = getPointsPositionBox(custom.position || 'center', custom.format, W, H);

  const rawTitle = (content.pointsTitle ?? custom.pointsTitle ?? DEFAULT_POINTS_TITLE).trim();
  const rawItems: PointsItem[] =
    content.pointsItems || custom.pointsItems || DEFAULT_POINTS_ITEMS;
  const timing: PointsTimingConfig = custom.pointsTiming || DEFAULT_POINTS_TIMING;
  const schedule = computePointsSchedule(rawTitle, rawItems, timing, 'pts_timeline');
  const itemsCount = schedule.items.length;

  let markerType: PointsMarkerType =
    custom.pointsMarkerType || PTS_TIMELINE_CONFIG.defaultMarkerType;
  if (!PTS_TIMELINE_CONFIG.supportedMarkerTypes.includes(markerType)) {
    markerType = PTS_TIMELINE_CONFIG.defaultMarkerType;
  }

  const combinedText = [rawTitle, ...schedule.items.map((it) => it.item.text)].join(' ');
  const baseDir: ResolvedTextDirection =
    custom.textDirection && custom.textDirection !== 'auto'
      ? custom.textDirection
      : detectTextDirection(combinedText, 'auto');

  const defaultFont =
    baseDir === 'ltr'
      ? PTS_TIMELINE_CONFIG.defaultEnglishQuoteFont
      : PTS_TIMELINE_CONFIG.defaultQuoteFont;
  let fontFamily: string = custom.quoteFontOverride || defaultFont;
  if (
    baseDir === 'rtl' &&
    custom.quoteFontOverride &&
    !PTS_TIMELINE_CONFIG.allowedFonts.includes(custom.quoteFontOverride as ArabicFontFamily)
  ) {
    fontFamily = defaultFont;
  }

  const padX = Math.round(posBox.boxWidth * 0.04);
  const padY = Math.round(posBox.boxHeight * 0.045);
  const innerX = posBox.boxX + padX;
  const innerY = posBox.boxY + padY;
  const innerW = Math.max(240, posBox.boxWidth - padX * 2);
  const innerH = Math.max(220, posBox.boxHeight - padY * 2);

  const stepSpanX = itemsCount > 1 ? innerW / itemsCount : innerW * 0.6;
  const maxCardW = Math.max(
    108,
    Math.min(
      Math.round(innerW * 0.45),
      Math.round(stepSpanX * (itemsCount <= 3 ? 1.1 : itemsCount > 8 ? 1.72 : 1.62))
    )
  );

  const hasVerticalWave = shape === 'wave' || shape === 'zigzag' || shape === 'stepped';

  const measureAtSize = (candidateSize: number) => {
    let titleLayout: ArabicQuoteLayout | null = null;
    let titleBlockH = 0;

    if (rawTitle.length > 0) {
      const tSize = Math.round(candidateSize * 1.2);
      titleLayout = layoutArabicQuote(ctx, {
        text: rawTitle,
        quotationMarks: 'none',
        fontFamily,
        fontWeight: 800,
        minFontSize: tSize,
        maxFontSize: tSize,
        fontSizeMultiplier: 1.0,
        keywordScaleMultiplier: 1.0,
        lineHeightRatio: 1.42,
        boxX: 0,
        boxY: 0,
        boxWidth: innerW,
        boxHeight: 1000,
        align: 'center',
        direction: baseDir,
        verticalAlign: 'top',
      });
      titleBlockH = Math.ceil(titleLayout.totalHeight) + Math.round(candidateSize * 0.8);
    }

    const stageH = Math.max(120, innerH - titleBlockH);
    const halfStageH = stageH * 0.5;
    const nodeRadius = Math.max(itemsCount > 8 ? 11 : 15, Math.round(candidateSize * 0.66));
    const waveAmpY = hasVerticalWave ? Math.min(34, Math.round(halfStageH * 0.16)) : 0;
    const stemLen = Math.max(
      itemsCount > 8 ? 14 : 20,
      Math.round(candidateSize * (itemsCount > 8 ? 0.64 : 0.78))
    );
    const availableHalfTextH = Math.max(
      40,
      halfStageH - waveAmpY - nodeRadius - stemLen - 12
    );

    const itemLayouts: { layout: ArabicQuoteLayout; dir: ResolvedTextDirection }[] = [];
    let fitsAll = titleLayout ? titleLayout.maxLineWidth <= innerW * 1.02 : true;

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
        fontWeight: PTS_TIMELINE_CONFIG.fonts.weight,
        minFontSize: candidateSize,
        maxFontSize: candidateSize,
        fontSizeMultiplier: 1.0,
        keywordScaleMultiplier: 1.0,
        lineHeightRatio: PTS_TIMELINE_CONFIG.sizes.lineHeightRatio,
        boxX: 0,
        boxY: 0,
        boxWidth: maxCardW,
        boxHeight: 2000,
        align: 'center',
        direction: itemDir,
        verticalAlign: 'top',
      });

      if (l.maxLineWidth > maxCardW * 1.02 || l.totalHeight > availableHalfTextH) {
        fitsAll = false;
      }
      itemLayouts.push({ layout: l, dir: itemDir });
    }

    return {
      titleLayout,
      titleBlockH,
      stageH,
      nodeRadius,
      waveAmpY,
      stemLen,
      itemLayouts,
      fits: fitsAll,
    };
  };

  const horizAbsMin = itemsCount > 8 ? 12 : 14;
  let low = horizAbsMin;
  let high = PTS_TIMELINE_CONFIG.sizes.maxFontSize;
  let bestSize = low;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (measureAtSize(mid).fits) {
      bestSize = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  let finalFontSize = clamp(
    Math.round(bestSize * clamp(custom.fontSizeMultiplier ?? 1.0, 0.7, 1.3)),
    horizAbsMin,
    Math.round(PTS_TIMELINE_CONFIG.sizes.maxFontSize * 1.2)
  );
  let measured = measureAtSize(finalFontSize);
  while (finalFontSize > horizAbsMin && !measured.fits) {
    finalFontSize = Math.max(horizAbsMin, finalFontSize - 1);
    measured = measureAtSize(finalFontSize);
  }

  const titleY = innerY;
  const stageTopY = innerY + measured.titleBlockH;
  const axisY = Math.round(stageTopY + measured.stageH * 0.5);

  const spreadMult = clamp(custom.timelineSpread ?? 1.0, 0.6, 1.35);
  const stemMult = clamp(custom.timelineStemScale ?? 1.0, 0.5, 1.8);
  const baseUsableSpanW = Math.max(110, innerW - maxCardW * (itemsCount > 8 ? 1.02 : 0.85));
  const usableSpanW = Math.round(baseUsableSpanW * spreadMult);
  const axisLeftX = innerX + Math.round((innerW - usableSpanW) * 0.5);
  const axisRightX = axisLeftX + usableSpanW;
  const effectiveStemLen = Math.round(measured.stemLen * stemMult);

  const nodes: PositionedTimelineNode[] = [];
  const allKeywordTimes: number[] = [];

  if (measured.titleLayout && measured.titleLayout.keywordGroups.length > 0) {
    for (let g = 0; g < measured.titleLayout.keywordGroups.length; g++) {
      allKeywordTimes.push(0.32);
    }
  }

  for (let i = 0; i < itemsCount; i++) {
    const schedItem = schedule.items[i];
    const itemData = measured.itemLayouts[i];
    const frac = itemsCount <= 1 ? 0.5 : i / (itemsCount - 1);
    const nodeX = Math.round(
      baseDir === 'ltr'
        ? lerp(axisLeftX, axisRightX, frac)
        : lerp(axisRightX, axisLeftX, frac)
    );
    const isAbove = i % 2 === 0;
    const nodeYOffset = hasVerticalWave
      ? isAbove
        ? -Math.round(measured.waveAmpY * spreadMult)
        : Math.round(measured.waveAmpY * spreadMult)
      : 0;
    const nodeY = axisY + nodeYOffset;

    const stemEndY = isAbove
      ? nodeY - measured.nodeRadius - effectiveStemLen
      : nodeY + measured.nodeRadius + effectiveStemLen;

    const textX = Math.round(nodeX - maxCardW * 0.5);
    const textY = isAbove
      ? Math.round(stemEndY - itemData.layout.totalHeight - 10)
      : Math.round(stemEndY + 10);

    const kwTimes: number[] = [];
    for (let r = 0; r < itemData.layout.keywordLineRects.length; r++) {
      const kwT = Number((schedItem.startTime + 0.16 + r * 0.06).toFixed(3));
      kwTimes.push(kwT);
      allKeywordTimes.push(kwT);
    }

    nodes.push({
      sched: schedItem,
      direction: itemData.dir,
      markerText: formatPointMarker(i, markerType, itemsCount, false),
      layout: itemData.layout,
      nodeX,
      nodeY,
      nodeRadius: measured.nodeRadius,
      stemPoints: [
        { x: nodeX, y: nodeY },
        { x: nodeX, y: stemEndY },
      ],
      textX,
      textY,
      cardW: maxCardW,
      slideDirX: 0,
      slideDirY: isAbove ? -18 : 18,
      accentSide: isAbove ? 'bottom' : 'top',
      keywordTimes: kwTimes,
    });
  }

  return {
    schedule,
    posBox,
    shape,
    orientation: 'horizontal',
    baseDir,
    fontFamily,
    fontSize: finalFontSize,
    nodeRadius: measured.nodeRadius,
    titleText: rawTitle,
    titleDirection: baseDir,
    titleLayout: measured.titleLayout,
    titleX: innerX,
    titleY,
    nodes,
    segments: [],
    allKeywordTimes,
  };
}

/**
 * Builds the Alternating Central-Spine Vertical Timeline Scene.
 */
function buildAlternatingVerticalTimelineScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  custom: StyleCustomization,
  size: RenderSize,
  shape: TimelinePathShape
): UnifiedTimelineScene {
  const { baseWidth: W, baseHeight: H } = size;
  const posBox = getPointsPositionBox(custom.position || 'center', custom.format, W, H);

  const rawTitle = (content.pointsTitle ?? custom.pointsTitle ?? DEFAULT_POINTS_TITLE).trim();
  const rawItems: PointsItem[] =
    content.pointsItems || custom.pointsItems || DEFAULT_POINTS_ITEMS;
  const timing: PointsTimingConfig = custom.pointsTiming || DEFAULT_POINTS_TIMING;
  const schedule = computePointsSchedule(rawTitle, rawItems, timing, 'pts_timeline');
  const itemsCount = schedule.items.length;

  let markerType: PointsMarkerType =
    custom.pointsMarkerType || PTS_TIMELINE_CONFIG.defaultMarkerType;
  if (!PTS_TIMELINE_CONFIG.supportedMarkerTypes.includes(markerType)) {
    markerType = PTS_TIMELINE_CONFIG.defaultMarkerType;
  }

  const combinedText = [rawTitle, ...schedule.items.map((it) => it.item.text)].join(' ');
  const baseDir: ResolvedTextDirection =
    custom.textDirection && custom.textDirection !== 'auto'
      ? custom.textDirection
      : detectTextDirection(combinedText, 'auto');

  const defaultFont =
    baseDir === 'ltr'
      ? PTS_TIMELINE_CONFIG.defaultEnglishQuoteFont
      : PTS_TIMELINE_CONFIG.defaultQuoteFont;
  let fontFamily: string = custom.quoteFontOverride || defaultFont;
  if (
    baseDir === 'rtl' &&
    custom.quoteFontOverride &&
    !PTS_TIMELINE_CONFIG.allowedFonts.includes(custom.quoteFontOverride as ArabicFontFamily)
  ) {
    fontFamily = defaultFont;
  }

  const padX = Math.round(posBox.boxWidth * 0.04);
  const padY = Math.round(posBox.boxHeight * 0.045);
  const innerX = posBox.boxX + padX;
  const innerY = posBox.boxY + padY;
  const innerW = Math.max(240, posBox.boxWidth - padX * 2);
  const innerH = Math.max(220, posBox.boxHeight - padY * 2);

  const hasLateralShape = shape === 'wave' || shape === 'zigzag' || shape === 'stepped';
  const fontCal = getFontCalibration(fontFamily);

  const measureAtSize = (candidateSize: number) => {
    let titleLayout: ArabicQuoteLayout | null = null;
    let titleBlockH = 0;

    if (rawTitle.length > 0) {
      const tSize = Math.round(candidateSize * 1.18);
      titleLayout = layoutArabicQuote(ctx, {
        text: rawTitle,
        quotationMarks: 'none',
        fontFamily,
        fontWeight: 800,
        minFontSize: tSize,
        maxFontSize: tSize,
        fontSizeMultiplier: 1.0,
        keywordScaleMultiplier: 1.0,
        lineHeightRatio: 1.42,
        boxX: 0,
        boxY: 0,
        boxWidth: innerW,
        boxHeight: 1000,
        align: 'center',
        direction: baseDir,
        verticalAlign: 'top',
      });
      titleBlockH = Math.ceil(titleLayout.totalHeight) + Math.round(candidateSize * 0.72);
    }

    const altDensity = itemsCount <= 8 ? 1 : clamp(1 - (itemsCount - 8) * 0.12, 0.48, 1);
    const stageH = Math.max(150, innerH - titleBlockH);
    const nodeRadius = Math.max(itemsCount > 8 ? 11 : 15, Math.round(candidateSize * 0.64));
    const lateralAmpX = hasLateralShape ? Math.max(14, Math.round(candidateSize * 0.48)) : 0;
    const stemLenX = Math.max(20, Math.round(candidateSize * 0.82));
    const centerCorridorHalfW = lateralAmpX + nodeRadius + stemLenX + 14;
    const sideCardW = Math.max(105, Math.floor(innerW * 0.5 - centerCorridorHalfW));

    const itemGapY = Math.max(
      4,
      Math.round(candidateSize * (0.38 + fontCal.lineHeightBonus * 0.3) * altDensity)
    );
    const itemLayouts: {
      layout: ArabicQuoteLayout;
      dir: ResolvedTextDirection;
      isRightSide: boolean;
      rowH: number;
    }[] = [];

    let fitsAll = titleLayout ? titleLayout.maxLineWidth <= innerW * 1.02 : true;

    for (let i = 0; i < itemsCount; i++) {
      const schedItem = schedule.items[i];
      const itemDir: ResolvedTextDirection =
        custom.textDirection && custom.textDirection !== 'auto'
          ? custom.textDirection
          : detectTextDirection(schedItem.item.text, 'auto');

      const isRightSide = baseDir === 'rtl' ? i % 2 === 0 : i % 2 === 1;

      const l = layoutArabicQuote(ctx, {
        text: schedItem.item.text,
        quotationMarks: 'none',
        fontFamily,
        fontWeight: PTS_TIMELINE_CONFIG.fonts.weight,
        minFontSize: candidateSize,
        maxFontSize: candidateSize,
        fontSizeMultiplier: 1.0,
        keywordScaleMultiplier: 1.0,
        lineHeightRatio: PTS_TIMELINE_CONFIG.sizes.lineHeightRatio,
        boxX: 0,
        boxY: 0,
        boxWidth: sideCardW,
        boxHeight: 2000,
        align: isRightSide ? 'right' : 'left',
        direction: itemDir,
        verticalAlign: 'top',
      });

      if (l.maxLineWidth > sideCardW * 1.03) {
        fitsAll = false;
      }

      const rowH = Math.max(
        nodeRadius * (itemsCount > 8 ? 2.0 : 2.2),
        Math.ceil(l.totalHeight) + (itemsCount > 8 ? 4 : 8)
      );
      itemLayouts.push({ layout: l, dir: itemDir, isRightSide, rowH });
    }

    const totalItemsH =
      itemLayouts.reduce((acc, it) => acc + it.rowH, 0) +
      Math.max(0, itemsCount - 1) * itemGapY;

    if (totalItemsH > stageH) {
      fitsAll = false;
    }

    return {
      titleLayout,
      titleBlockH,
      stageH,
      nodeRadius,
      lateralAmpX,
      stemLenX,
      sideCardW,
      itemGapY,
      totalItemsH,
      itemLayouts,
      fits: fitsAll,
    };
  };

  const altAbsMin = itemsCount > 8 ? 12 : 14;
  let low = altAbsMin;
  let high = PTS_TIMELINE_CONFIG.sizes.maxFontSize;
  let bestSize = low;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (measureAtSize(mid).fits) {
      bestSize = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  let finalFontSize = clamp(
    Math.round(bestSize * clamp(custom.fontSizeMultiplier ?? 1.0, 0.7, 1.3)),
    altAbsMin,
    Math.round(PTS_TIMELINE_CONFIG.sizes.maxFontSize * 1.2)
  );
  let measured = measureAtSize(finalFontSize);
  while (finalFontSize > altAbsMin && !measured.fits) {
    finalFontSize = Math.max(altAbsMin, finalFontSize - 1);
    measured = measureAtSize(finalFontSize);
  }

  const spreadMult = clamp(custom.timelineSpread ?? 1.0, 0.6, 1.35);
  const stemMult = clamp(custom.timelineStemScale ?? 1.0, 0.5, 1.8);
  const effectiveGapY = Math.round(measured.itemGapY * spreadMult);
  const effectiveTotalH =
    measured.itemLayouts.reduce((acc, it) => acc + it.rowH, 0) +
    Math.max(0, itemsCount - 1) * effectiveGapY;

  const stageTopY =
    innerY +
    measured.titleBlockH +
    Math.round((measured.stageH - effectiveTotalH) * 0.5);
  const spineCenterX = Math.round(innerX + innerW * 0.5);
  const effectiveStemLenX = Math.round(measured.stemLenX * stemMult);

  const allKeywordTimes: number[] = [];
  if (measured.titleLayout && measured.titleLayout.keywordGroups.length > 0) {
    for (let g = 0; g < measured.titleLayout.keywordGroups.length; g++) {
      allKeywordTimes.push(0.32);
    }
  }

  const nodes: PositionedTimelineNode[] = [];
  let curY = stageTopY;

  for (let i = 0; i < itemsCount; i++) {
    const schedItem = schedule.items[i];
    const itemData = measured.itemLayouts[i];
    const isRightSide = itemData.isRightSide;
    const nodeY = Math.round(curY + itemData.rowH * 0.5);
    const xSign = isRightSide ? 1 : -1;
    const nodeX = Math.round(spineCenterX + xSign * measured.lateralAmpX * spreadMult);

    const stemEndX = isRightSide
      ? nodeX + measured.nodeRadius + effectiveStemLenX
      : nodeX - measured.nodeRadius - effectiveStemLenX;

    const textX = isRightSide
      ? stemEndX + 12
      : stemEndX - 12 - measured.sideCardW;
    const textY = Math.round(nodeY - itemData.layout.totalHeight * 0.5);

    const kwTimes: number[] = [];
    for (let r = 0; r < itemData.layout.keywordLineRects.length; r++) {
      const kwT = Number((schedItem.startTime + 0.16 + r * 0.06).toFixed(3));
      kwTimes.push(kwT);
      allKeywordTimes.push(kwT);
    }

    nodes.push({
      sched: schedItem,
      direction: itemData.dir,
      markerText: formatPointMarker(i, markerType, itemsCount, false),
      layout: itemData.layout,
      nodeX,
      nodeY,
      nodeRadius: measured.nodeRadius,
      stemPoints: [
        { x: nodeX, y: nodeY },
        { x: stemEndX, y: nodeY },
      ],
      textX,
      textY,
      cardW: measured.sideCardW,
      slideDirX: isRightSide ? 22 : -22,
      slideDirY: 0,
      accentSide: isRightSide ? 'left' : 'right',
      keywordTimes: kwTimes,
    });

    curY += itemData.rowH + effectiveGapY;
  }

  return {
    schedule,
    posBox,
    shape,
    orientation: 'vertical',
    baseDir,
    fontFamily,
    fontSize: finalFontSize,
    nodeRadius: measured.nodeRadius,
    titleText: rawTitle,
    titleDirection: baseDir,
    titleLayout: measured.titleLayout,
    titleX: innerX,
    titleY: innerY,
    nodes,
    segments: [],
    allKeywordTimes,
  };
}

/**
 * Builds the Single-Side Vertical Timeline Scene.
 */
function buildSingleSideVerticalTimelineScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  custom: StyleCustomization,
  size: RenderSize,
  shape: TimelinePathShape,
  textSide: 'left' | 'right'
): UnifiedTimelineScene {
  const hasLateralShape = shape === 'wave' || shape === 'zigzag' || shape === 'stepped';
  const spreadMult = clamp(custom.timelineSpread ?? 1.0, 0.6, 1.35);
  const stemMult = clamp(custom.timelineStemScale ?? 1.0, 0.5, 1.8);

  const { schedule, layout } = buildAutoFitPointsLayout({
    ctx,
    content,
    custom,
    size,
    styleId: 'pts_timeline',
    allowedArabicFonts: PTS_TIMELINE_CONFIG.allowedFonts,
    defaultArabicFont: PTS_TIMELINE_CONFIG.defaultQuoteFont,
    defaultEnglishFont: PTS_TIMELINE_CONFIG.defaultEnglishQuoteFont,
    fontWeight: PTS_TIMELINE_CONFIG.fonts.weight,
    minFontSize: PTS_TIMELINE_CONFIG.sizes.minFontSize,
    maxFontSize: PTS_TIMELINE_CONFIG.sizes.maxFontSize,
    lineHeightRatio: PTS_TIMELINE_CONFIG.sizes.lineHeightRatio,
    supportedMarkerTypes: PTS_TIMELINE_CONFIG.supportedMarkerTypes,
    defaultMarkerType: PTS_TIMELINE_CONFIG.defaultMarkerType,
    markerReserveFactor: (hasLateralShape ? 2.55 : 2.25) * clamp(stemMult, 0.75, 1.35),
    itemPadYFactor: 0.42,
    itemGapYFactor: 0.5 * spreadMult,
  });

  const posBox = getPointsPositionBox(
    custom.position || 'center',
    custom.format,
    size.baseWidth,
    size.baseHeight
  );
  const nodeRadius = Math.max(
    layout.items.length > 8 ? 11 : 15,
    Math.round(layout.fontSize * 0.64)
  );
  const lateralAmpX = hasLateralShape
    ? Math.max(12, Math.round(layout.fontSize * 0.42 * spreadMult))
    : 0;

  const isTextOnRight = textSide === 'right';
  const itemPadX = Math.round(layout.fontSize * 0.55);
  const markerReserveW = Math.round(
    layout.fontSize * (hasLateralShape ? 2.55 : 2.25) * clamp(stemMult, 0.75, 1.35)
  );
  const extraStemPush = Math.round((stemMult - 1.0) * 28);

  const isTitleLtr = layout.titleDirection === 'ltr';
  const titleOriginX = layout.titleLayout
    ? isTitleLtr
      ? layout.boxX + Math.round(layout.boxW * 0.04)
      : layout.boxX +
        layout.boxW -
        Math.round(layout.boxW * 0.04) -
        layout.titleLayout.boxWidth
    : layout.boxX;

  const nodes: PositionedTimelineNode[] = [];
  for (let i = 0; i < layout.items.length; i++) {
    const slot = layout.items[i];
    const xSign = i % 2 === 0 ? -1 : 1;

    const spineBaseX = isTextOnRight
      ? slot.slotX + itemPadX + markerReserveW * 0.42
      : slot.slotX + slot.slotW - itemPadX - markerReserveW * 0.42;
    const nodeX = Math.round(spineBaseX + xSign * lateralAmpX);
    const nodeY = Math.round(slot.markerCenterY);

    const textX = isTextOnRight
      ? slot.slotX + itemPadX + markerReserveW + extraStemPush
      : slot.slotX + itemPadX - extraStemPush;
    const stemEndX = isTextOnRight
      ? Math.round(textX - 10)
      : Math.round(textX + slot.textW + 10);

    nodes.push({
      sched: slot.sched,
      direction: slot.direction,
      markerText: slot.markerText,
      layout: slot.layout,
      nodeX,
      nodeY,
      nodeRadius,
      stemPoints: [
        { x: nodeX, y: nodeY },
        { x: stemEndX, y: nodeY },
      ],
      textX,
      textY: slot.textY,
      cardW: slot.textW,
      slideDirX: isTextOnRight ? 24 : -24,
      slideDirY: 0,
      accentSide: isTextOnRight ? 'left' : 'right',
      keywordTimes: slot.keywordTimes,
    });
  }

  return {
    schedule,
    posBox,
    shape,
    orientation: 'vertical',
    baseDir: layout.titleDirection,
    fontFamily: layout.fontFamily,
    fontSize: layout.fontSize,
    nodeRadius,
    titleText: layout.titleText,
    titleDirection: layout.titleDirection,
    titleLayout: layout.titleLayout,
    titleX: titleOriginX,
    titleY: layout.titleY,
    nodes,
    segments: [],
    allKeywordTimes: layout.allKeywordTimes,
  };
}

/**
 * Applies global and per-point size/position adjustments and reconstructs all connector stems
 * and inter-node timeline segments so the path flows smoothly through moved nodes.
 */
function applyTimelineUserAdjustments(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  scene: UnifiedTimelineScene,
  custom: StyleCustomization,
  size: RenderSize
): UnifiedTimelineScene {
  const { baseWidth: W, baseHeight: H } = size;
  const globalNodeScale = clamp(custom.timelineNodeScale ?? 1.0, 0.6, 1.6);
  const globalDx = Math.round(clamp(custom.timelineOffsetX ?? 0, -0.35, 0.35) * W);
  const globalDy = Math.round(clamp(custom.timelineOffsetY ?? 0, -0.35, 0.35) * H);

  scene.titleX += globalDx;
  scene.titleY += globalDy;
  if (scene.circleCenter) {
    scene.circleCenter = {
      x: scene.circleCenter.x + globalDx,
      y: scene.circleCenter.y + globalDy,
      r: scene.circleCenter.r,
    };
  }

  for (let i = 0; i < scene.nodes.length; i++) {
    const nd = scene.nodes[i];
    const item = nd.sched.item;
    const itemScale = clamp(item.itemScale ?? 1.0, 0.7, 1.4);
    const nodeDx = Math.round(item.nodeOffsetX ?? 0);
    const nodeDy = Math.round(item.nodeOffsetY ?? 0);
    const textDx = Math.round(item.textOffsetX ?? 0);
    const textDy = Math.round(item.textOffsetY ?? 0);

    nd.nodeRadius = clamp(
      Math.round(scene.nodeRadius * globalNodeScale * itemScale),
      10,
      54
    );

    if (Math.abs(itemScale - 1.0) > 0.02) {
      const scaledFont = clamp(Math.round(scene.fontSize * itemScale), 12, 58);
      nd.layout = layoutArabicQuote(ctx, {
        text: item.text,
        quotationMarks: 'none',
        fontFamily: scene.fontFamily,
        fontWeight: PTS_TIMELINE_CONFIG.fonts.weight,
        minFontSize: scaledFont,
        maxFontSize: scaledFont,
        fontSizeMultiplier: 1.0,
        keywordScaleMultiplier: 1.0,
        lineHeightRatio: PTS_TIMELINE_CONFIG.sizes.lineHeightRatio,
        boxX: 0,
        boxY: 0,
        boxWidth: nd.cardW,
        boxHeight: 2000,
        align: nd.layout.align,
        direction: nd.direction,
        verticalAlign: 'top',
      });
    }

    nd.nodeX += globalDx + nodeDx;
    nd.nodeY += globalDy + nodeDy;
    nd.textX += globalDx + nodeDx + textDx;
    nd.textY += globalDy + nodeDy + textDy;

    // Recompute articulated connector stem between final (nodeX, nodeY) and final text callout box
    const textCenterX = Math.round(nd.textX + nd.cardW * 0.5);
    const textCenterY = Math.round(nd.textY + nd.layout.totalHeight * 0.5);

    if (nd.accentSide === 'top' || nd.accentSide === 'bottom') {
      const targetY =
        nd.accentSide === 'top'
          ? Math.round(nd.textY - 10)
          : Math.round(nd.textY + nd.layout.totalHeight + 10);
      if (Math.abs(textCenterX - nd.nodeX) <= 6) {
        nd.stemPoints = [
          { x: nd.nodeX, y: nd.nodeY },
          { x: textCenterX, y: targetY },
        ];
      } else {
        const midY = Math.round(lerp(nd.nodeY, targetY, 0.55));
        nd.stemPoints = [
          { x: nd.nodeX, y: nd.nodeY },
          { x: nd.nodeX, y: midY },
          { x: textCenterX, y: midY },
          { x: textCenterX, y: targetY },
        ];
      }
    } else {
      const targetX =
        nd.accentSide === 'left'
          ? Math.round(nd.textX - 10)
          : Math.round(nd.textX + nd.cardW + 10);
      if (Math.abs(textCenterY - nd.nodeY) <= 6) {
        nd.stemPoints = [
          { x: nd.nodeX, y: nd.nodeY },
          { x: targetX, y: textCenterY },
        ];
      } else {
        const midX = Math.round(lerp(nd.nodeX, targetX, 0.45));
        nd.stemPoints = [
          { x: nd.nodeX, y: nd.nodeY },
          { x: midX, y: textCenterY },
          { x: targetX, y: textCenterY },
        ];
      }
    }
  }

  // Rebuild inter-node timeline segments through the final node positions
  const segments: PathPoint[][] = [];
  if (scene.shape === 'circle' && scene.circleCenter) {
    const { x: cx, y: cy } = scene.circleCenter;
    for (let i = 0; i < scene.nodes.length - 1; i++) {
      const n0 = scene.nodes[i];
      const n1 = scene.nodes[i + 1];
      const r0 = Math.max(16, Math.hypot(n0.nodeX - cx, n0.nodeY - cy));
      const r1 = Math.max(16, Math.hypot(n1.nodeX - cx, n1.nodeY - cy));
      const a0 = Math.atan2(n0.nodeY - cy, n0.nodeX - cx);
      let a1 = Math.atan2(n1.nodeY - cy, n1.nodeX - cx);
      let delta = a1 - a0;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      a1 = a0 + delta;

      const segPts: PathPoint[] = [];
      const arcSteps = 36;
      for (let s = 0; s <= arcSteps; s++) {
        const u = s / arcSteps;
        const ang = lerp(a0, a1, u);
        const rad = lerp(r0, r1, u);
        segPts.push({
          x: cx + Math.cos(ang) * rad,
          y: cy + Math.sin(ang) * rad,
        });
      }
      segments.push(segPts);
    }
  } else {
    const orient: 'horizontal' | 'vertical' =
      scene.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    const waveMargin = orient === 'horizontal' ? 26 : 20;
    for (let i = 0; i < scene.nodes.length - 1; i++) {
      segments.push(
        buildSegmentPolyline(
          { x: scene.nodes[i].nodeX, y: scene.nodes[i].nodeY },
          { x: scene.nodes[i + 1].nodeX, y: scene.nodes[i + 1].nodeY },
          scene.shape,
          i,
          orient,
          waveMargin
        )
      );
    }
  }

  scene.segments = segments;
  return scene;
}

function buildUnifiedTimelineScene(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  custom: StyleCustomization,
  size: RenderSize
): UnifiedTimelineScene {
  const shape = resolveTimelineShape(custom);
  const effectiveOrientation = resolveEffectiveTimelineOrientation(
    custom,
    size.baseWidth,
    size.baseHeight
  );

  let baseScene: UnifiedTimelineScene;

  if (shape === 'circle') {
    baseScene = buildCircleTimelineScene(ctx, content, custom, size, effectiveOrientation);
  } else if (effectiveOrientation === 'horizontal') {
    baseScene = buildHorizontalTimelineScene(ctx, content, custom, size, shape);
  } else {
    const rawTitle = (content.pointsTitle ?? custom.pointsTitle ?? DEFAULT_POINTS_TITLE).trim();
    const rawItems: PointsItem[] =
      content.pointsItems || custom.pointsItems || DEFAULT_POINTS_ITEMS;
    const combinedText = [rawTitle, ...rawItems.map((it) => it.text)].join(' ');
    const baseDir: ResolvedTextDirection =
      custom.textDirection && custom.textDirection !== 'auto'
        ? custom.textDirection
        : detectTextDirection(combinedText, 'auto');

    const verticalSide = resolveEffectiveVerticalSide(
      custom,
      size.baseWidth,
      size.baseHeight,
      baseDir
    );

    if (verticalSide === 'alternating') {
      baseScene = buildAlternatingVerticalTimelineScene(ctx, content, custom, size, shape);
    } else {
      baseScene = buildSingleSideVerticalTimelineScene(
        ctx,
        content,
        custom,
        size,
        shape,
        verticalSide
      );
    }
  }

  return applyTimelineUserAdjustments(ctx, baseScene, custom, size);
}

/**
 * Returns the interactive hit-test bounding boxes for all nodes and text callout cards
 * in base canvas coordinates (1920x1080 or 1080x1920) for direct mouse/touch dragging.
 */
export function getPtsTimelineInteractiveTargets(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  custom: StyleCustomization,
  size: RenderSize
): TimelineInteractiveTarget[] {
  const scene = buildUnifiedTimelineScene(ctx, content, custom, size);
  return scene.nodes.map((nd, index) => {
    const padBx = 14;
    const padBy = 10;
    const boxW = Math.min(
      nd.cardW + padBx * 2,
      Math.ceil(nd.layout.maxLineWidth) + padBx * 2 + 12
    );
    const boxX =
      nd.layout.align === 'center'
        ? nd.textX + (nd.cardW - boxW) * 0.5
        : nd.layout.align === 'left'
          ? nd.textX - padBx
          : nd.textX + nd.cardW - boxW + padBx;
    const boxY = nd.textY - padBy;
    const boxH = Math.ceil(nd.layout.totalHeight) + padBy * 2;

    return {
      index,
      id: nd.sched.item.id,
      nodeX: nd.nodeX,
      nodeY: nd.nodeY,
      nodeRadius: Math.round(nd.nodeRadius * 1.45),
      textBoxX: boxX,
      textBoxY: boxY,
      textBoxW: boxW,
      textBoxH: boxH,
    };
  });
}

function slicePolylineAtProgress(
  points: PathPoint[],
  p: number
): { sliced: PathPoint[]; head: PathPoint } {
  if (points.length === 0) {
    return { sliced: [], head: { x: 0, y: 0 } };
  }
  if (points.length === 1 || p <= 0) {
    return { sliced: [points[0]], head: points[0] };
  }
  if (p >= 1) {
    return { sliced: points, head: points[points.length - 1] };
  }

  const lengths: number[] = [0];
  let totalLen = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    totalLen += Math.hypot(dx, dy);
    lengths.push(totalLen);
  }

  if (totalLen <= 0.001) {
    return { sliced: [points[0]], head: points[0] };
  }

  const targetLen = totalLen * clamp(p, 0, 1);
  const sliced: PathPoint[] = [points[0]];
  let head = points[0];

  for (let i = 1; i < points.length; i++) {
    const prevL = lengths[i - 1];
    const curL = lengths[i];
    if (targetLen >= curL) {
      sliced.push(points[i]);
      head = points[i];
    } else {
      const segLen = Math.max(0.0001, curL - prevL);
      const localU = clamp((targetLen - prevL) / segLen, 0, 1);
      head = {
        x: lerp(points[i - 1].x, points[i].x, localU),
        y: lerp(points[i - 1].y, points[i].y, localU),
      };
      sliced.push(head);
      break;
    }
  }

  return { sliced, head };
}

function tracePolylinePath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pts: PathPoint[]
) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
}

function drawLuxuryTimelineNode(params: {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  nodeX: number;
  nodeY: number;
  radius: number;
  scale: number;
  ringColor: string;
  secondaryColor: string;
  textColor: string;
  markerText: string;
  fontFamily: string;
  direction: ResolvedTextDirection;
  isCurrentActive: boolean;
  isGreen: boolean;
  isBlack: boolean;
  isLight?: boolean;
  t: number;
}) {
  const {
    ctx,
    nodeX,
    nodeY,
    radius,
    scale,
    ringColor,
    secondaryColor,
    textColor,
    markerText,
    fontFamily,
    direction,
    isCurrentActive,
    isGreen,
    isBlack,
    isLight = false,
    t,
  } = params;

  if (scale <= 0.01) return;

  ctx.save();
  ctx.translate(nodeX, nodeY);
  ctx.scale(scale, scale);

  const outerHaloR = Math.round(radius * 1.34);
  const innerCoreR = Math.round(radius * 0.74);

  if (isGreen) {
    ctx.fillStyle = PTS_TIMELINE_CONFIG.colors.chromaOutline;
    ctx.beginPath();
    ctx.arc(4, 4, outerHaloR + 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, outerHaloR + 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Layer 1: Outer orbital halo ring + 4 cardinal micro-ticks
  ctx.save();
  const rotAngle = isCurrentActive ? t * 0.55 : 0.35;
  ctx.rotate(rotAngle);
  ctx.strokeStyle = isGreen
    ? ringColor
    : hexToRgba(ringColor, isCurrentActive ? (isLight ? 0.72 : 0.65) : (isLight ? 0.36 : 0.28));
  ctx.lineWidth = isGreen ? 2 : 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, outerHaloR, 0, Math.PI * 2);
  ctx.stroke();

  const tickLen = Math.max(3, Math.round(radius * 0.18));
  ctx.strokeStyle = isCurrentActive ? ringColor : secondaryColor;
  ctx.lineWidth = 2;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const tx0 = Math.cos(a) * (outerHaloR - tickLen * 0.5);
    const ty0 = Math.sin(a) * (outerHaloR - tickLen * 0.5);
    const tx1 = Math.cos(a) * (outerHaloR + tickLen * 0.5);
    const ty1 = Math.sin(a) * (outerHaloR + tickLen * 0.5);
    ctx.beginPath();
    ctx.moveTo(tx0, ty0);
    ctx.lineTo(tx1, ty1);
    ctx.stroke();
  }
  ctx.restore();

  // Layer 2: Main bezel disc + glow
  ctx.save();
  if (!isGreen) {
    ctx.shadowColor = isLight ? hexToRgba(ringColor, 0.38) : ringColor;
    ctx.shadowBlur = isCurrentActive ? (isLight ? 14 : 18) : (isLight ? 8 : 10);
  }
  ctx.fillStyle = isBlack
    ? '#05070E'
    : isLight
      ? '#FFFFFF'
      : PTS_TIMELINE_CONFIG.colors.bgDark;
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Layer 3: Inner accent ring
  ctx.strokeStyle = hexToRgba(secondaryColor, isGreen ? 0.85 : 0.55);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, innerCoreR, 0, Math.PI * 2);
  ctx.stroke();

  // Layer 4: Marker numeral / icon
  if (markerText) {
    const nodeTextScale = markerText.length >= 2 ? 0.74 : 0.92;
    applyStudioCanvasTextProps(
      ctx,
      fontFamily,
      800,
      Math.round(radius * nodeTextScale),
      direction
    );
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    ctx.fillText(markerText, 0, 1);
  } else {
    ctx.fillStyle = ringColor;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(4, radius * 0.32), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawTimelineProgressHead(params: {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  head: PathPoint;
  accentColor: string;
  secondaryColor: string;
  isGreen: boolean;
  t: number;
}) {
  const { ctx, head, accentColor, secondaryColor, isGreen, t } = params;
  const pulse = 1 + 0.14 * Math.sin(t * 7.5);
  const outerR = 11 * pulse;
  const innerR = 5.2;

  ctx.save();
  ctx.translate(head.x, head.y);

  if (isGreen) {
    ctx.fillStyle = PTS_TIMELINE_CONFIG.colors.chromaOutline;
    ctx.beginPath();
    ctx.arc(2.5, 2.5, outerR + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, outerR + 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 16;
  }

  ctx.save();
  ctx.rotate(t * 2.2);
  ctx.strokeStyle = secondaryColor;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, innerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

export function getPtsTimelineEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  void timeline;
  const scene = buildUnifiedTimelineScene(ctx, content, custom, size);
  return {
    enterStart: scene.schedule.introDuration,
    itemTimes: scene.schedule.itemTimes,
    keywordTimes: scene.allKeywordTimes,
  };
}

export const renderPtsTimeline: PureStyleRenderer = (
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
  const theme = resolveTimelineTheme(custom);
  const isLight = !isGreen && !isBlack && theme === 'light';

  const accentStart =
    custom.accentColor && custom.accentColor !== '#6FA8FF'
      ? custom.accentColor
      : PTS_TIMELINE_CONFIG.colors.gradStart;
  const accentEnd = PTS_TIMELINE_CONFIG.colors.gradEnd;
  const hasCustomKeyword =
    Boolean(custom.keywordColor) && custom.keywordColor!.toUpperCase() !== '#FFD166';
  const keywordColor = hasCustomKeyword
    ? custom.keywordColor!
    : isLight
      ? '#D97706'
      : PTS_TIMELINE_CONFIG.colors.keyword;
  const textColor = isLight ? '#0F172A' : PTS_TIMELINE_CONFIG.colors.textPrimary;
  const highlightCurrent = custom.pointsHighlightCurrent ?? true;
  const chromaOutline = PTS_TIMELINE_CONFIG.colors.chromaOutline;

  // 1. Background — In Green mode, 100% pure #00FF00 with NO full-box dark container panel
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (isBlack) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bgCanvas = getCachedPtsTimelineBackdrop(W, H, accentStart, theme);
    ctx.drawImage(bgCanvas, 0, 0, W, H);
  }

  const scene = buildUnifiedTimelineScene(ctx, content, custom, size);
  const { schedule, nodes, segments } = scene;

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
  if (scene.titleLayout && scene.titleText.length > 0) {
    const titleP = easeOutCubic(progress(t, 0.1, 0.5));
    drawPointTextWithWipeAndKeywords({
      ctx,
      layout: scene.titleLayout,
      originX: scene.titleX,
      originY: scene.titleY,
      wipeProgress: titleP,
      textColor,
      keywordColor,
      underlineKeywords: true,
      outlineColor: isGreen ? chromaOutline : undefined,
      outlineWidth: isGreen ? 3.2 : undefined,
      hardShadowOffset: isGreen ? 4 : 0,
    });
  }

  if (nodes.length === 0) {
    ctx.restore();
    return;
  }

  // 3. Decorative Orbital Compass Rings when shape === 'circle'
  if (scene.circleCenter) {
    const { x: cx, y: cy, r: cr } = scene.circleCenter;
    ctx.save();
    if (isGreen) {
      ctx.strokeStyle = chromaOutline;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.save();
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = hexToRgba(accentStart, isBlack ? 0.24 : isLight ? 0.28 : 0.16);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(18, cr * 0.62), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = hexToRgba(accentEnd, isLight ? 0.34 : 0.25);
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 4. Base Track + Active Progressive Path along all segments
  const firstNode = nodes[0];
  const lastNode = nodes[nodes.length - 1];
  const pathGrad = ctx.createLinearGradient(
    firstNode.nodeX,
    firstNode.nodeY,
    lastNode.nodeX,
    lastNode.nodeY
  );
  pathGrad.addColorStop(0, accentStart);
  pathGrad.addColorStop(1, accentEnd);

  if (segments.length > 0) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isGreen) {
      for (const seg of segments) {
        ctx.save();
        ctx.translate(3, 3);
        ctx.strokeStyle = chromaOutline;
        ctx.lineWidth = 11;
        tracePolylinePath(ctx, seg);
        ctx.stroke();
        ctx.restore();

        ctx.strokeStyle = chromaOutline;
        ctx.lineWidth = 11;
        tracePolylinePath(ctx, seg);
        ctx.stroke();

        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 4;
        tracePolylinePath(ctx, seg);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = hexToRgba(accentStart, isBlack ? 0.26 : isLight ? 0.28 : 0.18);
      ctx.lineWidth = 3.2;
      for (const seg of segments) {
        tracePolylinePath(ctx, seg);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  let leadingHead: PathPoint = { x: firstNode.nodeX, y: firstNode.nodeY };
  const hasStartedFirst = t >= firstNode.sched.startTime - 0.1;

  if (hasStartedFirst && segments.length > 0) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < nodes.length; i++) {
      const nd = nodes[i];
      const seg = segments[i - 1];
      const segP = easeInOutCubic(
        progress(t, nd.sched.startTime - 0.18, nd.sched.startTime + 0.24)
      );
      if (segP <= 0.001) break;

      const { sliced, head } = slicePolylineAtProgress(seg, segP);
      leadingHead = head;

      if (sliced.length >= 2) {
        if (isGreen) {
          ctx.strokeStyle = chromaOutline;
          ctx.lineWidth = 12;
          tracePolylinePath(ctx, sliced);
          ctx.stroke();
        } else {
          ctx.shadowColor = isLight ? hexToRgba(accentStart, 0.45) : accentStart;
          ctx.shadowBlur = isLight ? 10 : 14;
        }

        ctx.strokeStyle = pathGrad;
        ctx.lineWidth = 5.5;
        tracePolylinePath(ctx, sliced);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 5. Render Revealed Nodes, Connector Stems, Floating Callouts, and Text
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    if (t < nd.sched.startTime) continue;

    const itemAlpha = getPointHighlightAlpha(
      t,
      i,
      schedule.items,
      highlightCurrent,
      0.45
    );
    const isCurrentActive =
      i === nodes.length - 1 || t < nodes[i + 1].sched.startTime;

    const popP = progress(
      t,
      nd.sched.startTime,
      nd.sched.startTime + PTS_TIMELINE_CONFIG.timings.nodePopSec
    );
    const nodeScale = easeOutBack(popP, 1.85);
    const slideP = easeOutCubic(
      progress(
        t,
        nd.sched.startTime + 0.05,
        nd.sched.startTime + PTS_TIMELINE_CONFIG.timings.textSlideSec
      )
    );

    const nodeColor = i % 2 === 0 ? accentStart : accentEnd;
    const altColor = i % 2 === 0 ? accentEnd : accentStart;

    ctx.save();
    ctx.globalAlpha = masterAlpha * itemAlpha;

    // 5a. Articulated Connector Stem from Node to Callout
    const { sliced: activeStem, head: stemTip } = slicePolylineAtProgress(
      nd.stemPoints,
      slideP
    );
    if (activeStem.length >= 2) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (isGreen) {
        ctx.strokeStyle = chromaOutline;
        ctx.lineWidth = 8;
        tracePolylinePath(ctx, activeStem);
        ctx.stroke();
      }
      ctx.strokeStyle = nodeColor;
      ctx.lineWidth = 2.6;
      tracePolylinePath(ctx, activeStem);
      ctx.stroke();

      if (slideP > 0.25) {
        if (isGreen) {
          ctx.fillStyle = chromaOutline;
          ctx.beginPath();
          ctx.arc(stemTip.x, stemTip.y, 7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = nodeColor;
        ctx.beginPath();
        ctx.arc(stemTip.x, stemTip.y, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 5b. Multi-Layered Luxury Node
    drawLuxuryTimelineNode({
      ctx,
      nodeX: nd.nodeX,
      nodeY: nd.nodeY,
      radius: nd.nodeRadius,
      scale: nodeScale,
      ringColor: nodeColor,
      secondaryColor: altColor,
      textColor,
      markerText: nd.markerText,
      fontFamily: scene.fontFamily,
      direction: nd.direction,
      isCurrentActive,
      isGreen,
      isBlack,
      isLight,
      t,
    });

    // 5c. Floating Callout Card Backplate + Accent Bar + Text Block
    const offsetX = nd.slideDirX * (1 - slideP);
    const offsetY = nd.slideDirY * (1 - slideP);
    const drawX = nd.textX + offsetX;
    const drawY = nd.textY + offsetY;

    ctx.save();
    ctx.globalAlpha *= slideP;

    // Subtle floating backplate behind each point's text in both Style mode and Green Screen mode
    // with comfortable automatic transparency (never full-frame container box)
    if (!isBlack) {
      const padBx = 14;
      const padBy = 10;
      const boxW = Math.min(
        nd.cardW + padBx * 2,
        Math.ceil(nd.layout.maxLineWidth) + padBx * 2 + 12
      );
      const boxX =
        nd.layout.align === 'center'
          ? drawX + (nd.cardW - boxW) * 0.5
          : nd.layout.align === 'left'
            ? drawX - padBx
            : drawX + nd.cardW - boxW + padBx;
      const boxY = drawY - padBy;
      const boxH = Math.ceil(nd.layout.totalHeight) + padBy * 2;

      ctx.save();
      if (isLight) {
        ctx.shadowColor = 'rgba(15, 23, 42, 0.06)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      } else {
        ctx.fillStyle = isGreen
          ? 'rgba(10, 15, 29, 0.65)'
          : 'rgba(10, 15, 29, 0.58)';
      }
      ctx.strokeStyle = hexToRgba(
        nodeColor,
        isCurrentActive ? (isLight ? 0.55 : 0.48) : (isLight ? 0.28 : 0.24)
      );
      ctx.lineWidth = isGreen ? 1.5 : 1.2;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 12);
      ctx.fill();
      ctx.restore();
      ctx.stroke();
    }

    ctx.save();
    ctx.lineCap = 'round';
    if (nd.accentSide === 'top' || nd.accentSide === 'bottom') {
      const barW = Math.min(72, Math.max(32, nd.layout.maxLineWidth * 0.38)) * slideP;
      const barCx = drawX + nd.cardW * 0.5;
      const barY =
        nd.accentSide === 'top'
          ? drawY - 6
          : drawY + nd.layout.totalHeight + 6;
      if (isGreen) {
        ctx.strokeStyle = chromaOutline;
        ctx.lineWidth = 8.5;
        ctx.beginPath();
        ctx.moveTo(barCx - barW * 0.5, barY);
        ctx.lineTo(barCx + barW * 0.5, barY);
        ctx.stroke();
      }
      ctx.strokeStyle = nodeColor;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(barCx - barW * 0.5, barY);
      ctx.lineTo(barCx + barW * 0.5, barY);
      ctx.stroke();
    } else {
      const barH = Math.max(18, nd.layout.totalHeight * 0.78) * slideP;
      const barCy = drawY + nd.layout.totalHeight * 0.5;
      const barX =
        nd.accentSide === 'left'
          ? drawX - 8
          : drawX + nd.cardW + 8;
      if (isGreen) {
        ctx.strokeStyle = chromaOutline;
        ctx.lineWidth = 8.5;
        ctx.beginPath();
        ctx.moveTo(barX, barCy - barH * 0.5);
        ctx.lineTo(barX, barCy + barH * 0.5);
        ctx.stroke();
      }
      ctx.strokeStyle = nodeColor;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(barX, barCy - barH * 0.5);
      ctx.lineTo(barX, barCy + barH * 0.5);
      ctx.stroke();
    }
    ctx.restore();

    drawPointTextWithWipeAndKeywords({
      ctx,
      layout: nd.layout,
      originX: drawX,
      originY: drawY,
      wipeProgress: 1.0,
      textColor,
      keywordColor,
      underlineKeywords: true,
      outlineColor: isGreen ? chromaOutline : undefined,
      outlineWidth: isGreen ? 2.6 : undefined,
      hardShadowOffset: isGreen ? 3 : 0,
    });

    ctx.restore();
    ctx.restore();
  }

  // 6. Animated Progress Head (Leading Beacon) on top of the active path
  if (hasStartedFirst) {
    drawTimelineProgressHead({
      ctx,
      head: leadingHead,
      accentColor: accentStart,
      secondaryColor: accentEnd,
      isGreen,
      t,
    });
  }

  ctx.restore();
};
