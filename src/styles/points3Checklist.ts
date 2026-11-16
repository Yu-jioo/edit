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
  getCachedChecklistPaperSheet,
  getCachedWoodDeskBackdrop,
} from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  lerp,
  progress,
  resolveBackgroundMode,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  ArabicQuoteLayout,
  drawBidiWord,
  KeywordLineRect,
} from '../utils/textLayout';
import {
  buildAutoFitPointsLayout,
  getPointHighlightAlpha,
} from './points1Clean';

export const PTS_CHECKLIST_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#1F3A93',
  textSecondary: '#475569',
  accent: '#1F3A93',
  keyword: '#FFE45C',
};

export const PTS_CHECKLIST_CONFIG = {
  id: 'pts_checklist' as const,
  mode: 'points' as const,
  nameAr: 'قائمة مهام بخط اليد',
  nameEn: 'Handwritten Checklist',
  descriptionAr:
    'ورقة دفتر مسطرة بهوامش حمراء وخط يدوي بالحبر الأزرق مع مربع اختيار وعلامة صح مرسومة وتظليل أصفر',
  defaultAccent: '#1F3A93',
  defaultKeywordColor: '#FFE45C',
  defaultQuoteFont: 'Aref Ruqaa' as ArabicFontFamily,
  defaultAuthorFont: 'Aref Ruqaa' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Lora' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Lora' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  lightPalette: PTS_CHECKLIST_LIGHT_PALETTE,
  allowedFonts: [
    'Aref Ruqaa',
    'Katibeh',
    'Noto Naskh Arabic',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
    'KOMission Black',
    'Zain Rounded instance mob',
    '29LT Azahar Display AL TN Trial Bold',
  ] as ArabicFontFamily[],
  allowedEnglishFonts: ['Lora', 'Playfair Display', 'Special Elite'] as EnglishFontFamily[],
  supportedMarkerTypes: ['checks'] as PointsMarkerType[],
  defaultMarkerType: 'checks' as PointsMarkerType,
  colors: {
    paperCream: '#F6F0E0',
    inkBlue: '#1F3A93',
    marginRed: '#D64045',
    highlighterYellow: '#FFE45C',
    tickCrimson: '#B91C1C',
    hardShadowGreen: '#1E242B',
  },
  fonts: {
    arabic: 'Aref Ruqaa' as ArabicFontFamily,
    english: 'Lora' as EnglishFontFamily,
    weight: 700,
    titleWeight: 700,
  },
  sizes: {
    minFontSize: 24,
    maxFontSize: 48,
    lineHeightRatio: 1.62,
    sheetTiltDeg: -1.15,
  },
  timings: {
    introDuration: 0.6,
    exitDuration: 0.6,
    defaultInterval: 1.2,
    textWipeSec: 0.34,
    checkboxDrawSec: 0.24,
  },
};

interface Point2D {
  x: number;
  y: number;
}

/**
 * Draws a trimmed polyline [0..trimP] with double-pass hand-drawn jitter.
 */
function drawTrimmedJitterPolyline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pts: Point2D[],
  trimP: number,
  strokeColor: string,
  lineWidth: number,
  seed: number
) {
  const p = clamp(trimP, 0, 1);
  if (p <= 0.001 || pts.length < 2) return;

  // Compute cumulative lengths
  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const d = Math.hypot(dx, dy);
    segLengths.push(d);
    totalLen += d;
  }
  if (totalLen <= 0.01) return;

  const targetLen = totalLen * p;

  for (let pass = 0; pass < 2; pass++) {
    const rng = mulberry32(combineSeed(seed, 300 + pass * 71));
    const jitterAmp = pass === 0 ? 0.8 : 1.5;

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = pass === 0 ? lineWidth : Math.max(1, lineWidth * 0.68);
    ctx.globalAlpha *= pass === 0 ? 1.0 : 0.62;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(
      pts[0].x + (rng() - 0.5) * jitterAmp,
      pts[0].y + (rng() - 0.5) * jitterAmp
    );

    let walked = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = segLengths[i];
      if (walked + seg <= targetLen) {
        ctx.lineTo(
          pts[i + 1].x + (rng() - 0.5) * jitterAmp,
          pts[i + 1].y + (rng() - 0.5) * jitterAmp
        );
        walked += seg;
      } else {
        const rem = targetLen - walked;
        const frac = clamp(rem / Math.max(0.001, seg), 0, 1);
        const ix = lerp(pts[i].x, pts[i + 1].x, frac);
        const iy = lerp(pts[i].y, pts[i + 1].y, frac);
        ctx.lineTo(
          ix + (rng() - 0.5) * jitterAmp,
          iy + (rng() - 0.5) * jitterAmp
        );
        break;
      }
    }
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draws a yellow highlighter band (`multiply`) with rough organic ends behind keyword rects.
 */
function drawRoughHighlighterBand(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  rect: KeywordLineRect,
  originX: number,
  originY: number,
  wipeP: number,
  highlightColor: string,
  seed: number,
  isLtr: boolean
) {
  const p = clamp(wipeP, 0, 1);
  if (p <= 0.01) return;

  const rng = mulberry32(combineSeed(seed, 501 + rect.groupId * 37 + rect.lineIndex * 13));
  const padX = 8;
  const fullW = rect.width + padX * 2;
  const curW = fullW * p;
  const bandTop = originY + rect.topY + (rect.bottomY - rect.topY) * 0.14;
  const bandH = (rect.bottomY - rect.topY) * 0.78;

  const leftX = isLtr
    ? originX + rect.leftX - padX
    : originX + rect.rightX + padX - curW;
  const rightX = leftX + curW;

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = highlightColor;

  ctx.beginPath();
  // Top edge with slight hand-drawn wave
  ctx.moveTo(leftX + (rng() - 0.5) * 3, bandTop + (rng() - 0.5) * 2);
  ctx.quadraticCurveTo(
    (leftX + rightX) * 0.5,
    bandTop - 1.5 + (rng() - 0.5) * 2,
    rightX + (rng() - 0.5) * 3,
    bandTop + (rng() - 0.5) * 2
  );
  // Rough right end (3 jagged nib points)
  ctx.lineTo(rightX + 3 + rng() * 3, bandTop + bandH * 0.32);
  ctx.lineTo(rightX - 1 + rng() * 2, bandTop + bandH * 0.66);
  ctx.lineTo(rightX + (rng() - 0.5) * 3, bandTop + bandH);
  // Bottom edge
  ctx.quadraticCurveTo(
    (leftX + rightX) * 0.5,
    bandTop + bandH + 1.5,
    leftX + (rng() - 0.5) * 3,
    bandTop + bandH
  );
  // Rough left end
  ctx.lineTo(leftX - 3 - rng() * 3, bandTop + bandH * 0.65);
  ctx.lineTo(leftX + 1 - rng() * 2, bandTop + bandH * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draws notebook text with right-to-left clip wipe and multiply yellow highlighter on keywords.
 */
function drawNotebookTextWithHighlighter(params: {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  layout: ArabicQuoteLayout;
  originX: number;
  originY: number;
  wipeP: number;
  inkColor: string;
  highlighterColor: string;
  seed: number;
}) {
  const { ctx, layout, originX, originY, wipeP, inkColor, highlighterColor, seed } = params;
  const p = clamp(wipeP, 0, 1);
  if (p <= 0.001) return;

  const isLtr = layout.direction === 'ltr';
  const pad = Math.ceil(layout.fontSize * 0.45);
  const fullW = layout.boxWidth + pad * 2;
  const fullH = layout.totalHeight + pad * 2;

  // 1. Draw yellow highlighter with rough ends behind keywords
  for (const rect of layout.keywordLineRects) {
    const kwP = clamp((p - 0.15) / 0.75, 0, 1);
    drawRoughHighlighterBand(
      ctx,
      rect,
      originX,
      originY,
      easeOutCubic(kwP),
      highlighterColor,
      seed,
      isLtr
    );
  }

  // 2. Draw ink text clipped by wipe
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
  ctx.fillStyle = inkColor;

  for (const w of layout.words) {
    drawBidiWord(ctx, w.text, originX + w.x, originY + w.y, layout.direction);
  }

  ctx.restore();
}

export function getPtsChecklistEventTimes(
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
    styleId: 'pts_checklist',
    allowedArabicFonts: PTS_CHECKLIST_CONFIG.allowedFonts,
    defaultArabicFont: PTS_CHECKLIST_CONFIG.defaultQuoteFont,
    defaultEnglishFont: PTS_CHECKLIST_CONFIG.defaultEnglishQuoteFont,
    fontWeight: PTS_CHECKLIST_CONFIG.fonts.weight,
    minFontSize: PTS_CHECKLIST_CONFIG.sizes.minFontSize,
    maxFontSize: PTS_CHECKLIST_CONFIG.sizes.maxFontSize,
    lineHeightRatio: PTS_CHECKLIST_CONFIG.sizes.lineHeightRatio,
    supportedMarkerTypes: PTS_CHECKLIST_CONFIG.supportedMarkerTypes,
    defaultMarkerType: PTS_CHECKLIST_CONFIG.defaultMarkerType,
    forceMarkerType: 'checks',
    innerPadXRatio: 0.08,
    innerPadYRatio: 0.07,
    markerReserveFactor: 2.0,
    itemPadYFactor: 0.32,
    itemGapYFactor: 0.34,
  });

  return {
    enterStart: schedule.introDuration,
    itemTimes: schedule.itemTimes,
    keywordTimes: layout.allKeywordTimes,
  };
}

export const renderPtsChecklist: PureStyleRenderer = (
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
  // Black is disabled for pts_checklist; treat non-style as green
  const isGreen = bgMode === 'green' || bgMode === 'black';

  const { schedule, layout } = buildAutoFitPointsLayout({
    ctx,
    content,
    custom,
    size,
    styleId: 'pts_checklist',
    allowedArabicFonts: PTS_CHECKLIST_CONFIG.allowedFonts,
    defaultArabicFont: PTS_CHECKLIST_CONFIG.defaultQuoteFont,
    defaultEnglishFont: PTS_CHECKLIST_CONFIG.defaultEnglishQuoteFont,
    fontWeight: PTS_CHECKLIST_CONFIG.fonts.weight,
    minFontSize: PTS_CHECKLIST_CONFIG.sizes.minFontSize,
    maxFontSize: PTS_CHECKLIST_CONFIG.sizes.maxFontSize,
    lineHeightRatio: PTS_CHECKLIST_CONFIG.sizes.lineHeightRatio,
    supportedMarkerTypes: PTS_CHECKLIST_CONFIG.supportedMarkerTypes,
    defaultMarkerType: PTS_CHECKLIST_CONFIG.defaultMarkerType,
    forceMarkerType: 'checks',
    innerPadXRatio: 0.08,
    innerPadYRatio: 0.07,
    markerReserveFactor: 2.0,
    itemPadYFactor: 0.32,
    itemGapYFactor: 0.34,
  });

  const inkColor =
    custom.accentColor && custom.accentColor !== '#6FA8FF'
      ? custom.accentColor
      : PTS_CHECKLIST_CONFIG.colors.inkBlue;
  const highlighterColor =
    custom.keywordColor && custom.keywordColor !== '#FFD166'
      ? custom.keywordColor
      : PTS_CHECKLIST_CONFIG.colors.highlighterYellow;

  // 1. Backdrop
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else {
    const deskBg = getCachedWoodDeskBackdrop(W, H, custom.seed);
    ctx.drawImage(deskBg, 0, 0, W, H);
  }

  const introP = easeOutBack(progress(t, 0.02, schedule.introDuration * 0.9), 1.25);
  const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
  const exitFactor = 1 - easeInCubic(exitP);
  const masterAlpha = clamp(progress(t, 0.02, 0.28) * exitFactor, 0, 1);

  if (masterAlpha <= 0.005) {
    ctx.restore();
    return;
  }

  // 2. Tilted Cream Lined Notebook Paper Sheet (#F6F0E0)
  const sheetX = layout.boxX;
  const sheetY = layout.boxY;
  const sheetW = layout.boxW;
  const sheetH = layout.boxH;
  const centerX = sheetX + sheetW * 0.5;
  const centerY = sheetY + sheetH * 0.5;
  const tiltRad = (PTS_CHECKLIST_CONFIG.sizes.sheetTiltDeg * Math.PI) / 180;
  const scaleSheet = lerp(0.92, 1.0, clamp(introP, 0, 1.08));

  ctx.save();
  ctx.globalAlpha = masterAlpha;
  ctx.translate(centerX, centerY);
  ctx.rotate(tiltRad);
  ctx.scale(scaleSheet, scaleSheet);
  ctx.translate(-centerX, -centerY);

  if (isGreen) {
    // Green mode: opaque hard-edged sheet with a hard offset shadow (no blur)
    ctx.fillStyle = PTS_CHECKLIST_CONFIG.colors.hardShadowGreen;
    ctx.fillRect(sheetX + 10, sheetY + 10, sheetW, sheetH);
  } else {
    // Style mode: soft drop shadow under notebook sheet
    ctx.save();
    ctx.shadowColor = 'rgba(10, 6, 3, 0.42)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetX = 6;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = PTS_CHECKLIST_CONFIG.colors.paperCream;
    ctx.fillRect(sheetX, sheetY, sheetW, sheetH);
    ctx.restore();
  }

  const isSheetLtr = layout.titleDirection === 'ltr';
  const paperCanvas = getCachedChecklistPaperSheet(
    sheetW,
    sheetH,
    custom.seed,
    isSheetLtr
  );
  ctx.drawImage(paperCanvas, sheetX, sheetY, sheetW, sheetH);

  // 3. Optional Title on Notebook Header
  if (layout.titleLayout && layout.titleText.length > 0) {
    const titleWipe = easeOutCubic(progress(t, 0.14, 0.54));
    const titleOriginX = isSheetLtr
      ? layout.boxX + Math.round(layout.boxW * 0.1)
      : layout.boxX +
        layout.boxW -
        Math.round(layout.boxW * 0.1) -
        layout.titleLayout.boxWidth;

    drawNotebookTextWithHighlighter({
      ctx,
      layout: layout.titleLayout,
      originX: titleOriginX,
      originY: layout.titleY,
      wipeP: titleWipe,
      inkColor,
      highlighterColor,
      seed: combineSeed(custom.seed, 101),
    });

    // Double hand-drawn underline beneath title
    const titleLineW = Math.min(layout.titleLayout.maxLineWidth, layout.boxW * 0.75);
    const uStartX = isSheetLtr
      ? titleOriginX
      : titleOriginX + layout.titleLayout.boxWidth;
    const uEndX = isSheetLtr ? uStartX + titleLineW : uStartX - titleLineW;
    const uY = layout.titleY + layout.titleLayout.totalHeight + 6;

    drawTrimmedJitterPolyline(
      ctx,
      [
        { x: uStartX, y: uY },
        { x: (uStartX + uEndX) * 0.5, y: uY + 2 },
        { x: uEndX, y: uY - 1 },
      ],
      titleWipe,
      PTS_CHECKLIST_CONFIG.colors.marginRed,
      2.6,
      combineSeed(custom.seed, 199)
    );
  }

  // 4. Checklist Items: Text Wipe Right-to-Left -> Hand-Drawn Checkbox & Tick (Stroke Trimming)
  const highlightCurrent = custom.pointsHighlightCurrent ?? true;

  for (let i = 0; i < layout.items.length; i++) {
    const slot = layout.items[i];
    const sched = slot.sched;
    if (t < sched.startTime) continue;

    const itemAlpha = getPointHighlightAlpha(t, i, schedule.items, highlightCurrent, 0.45);
    const wipeDur = PTS_CHECKLIST_CONFIG.timings.textWipeSec;
    const checkDur = PTS_CHECKLIST_CONFIG.timings.checkboxDrawSec;

    const textWipeP = easeOutCubic(
      progress(t, sched.startTime, sched.startTime + wipeDur)
    );
    const boxTrimP = easeOutCubic(
      progress(t, sched.startTime + wipeDur * 0.55, sched.startTime + wipeDur + checkDur * 0.45)
    );
    const tickTrimP = easeOutCubic(
      progress(
        t,
        sched.startTime + wipeDur * 0.85,
        sched.startTime + wipeDur + checkDur
      )
    );

    ctx.save();
    ctx.globalAlpha = masterAlpha * itemAlpha;

    // 4a. Item text with right-to-left wipe + yellow highlighter on keywords
    drawNotebookTextWithHighlighter({
      ctx,
      layout: slot.layout,
      originX: slot.textX,
      originY: slot.textY,
      wipeP: textWipeP,
      inkColor,
      highlighterColor,
      seed: combineSeed(custom.seed, 400 + i * 29),
    });

    // 4b. Hand-drawn Checkbox (stroke-trimmed square with seeded jitter, double pass)
    const boxSize = Math.round(layout.fontSize * 0.82);
    const bx = slot.markerCenterX - boxSize * 0.5;
    const by = slot.markerCenterY - boxSize * 0.5;

    const boxPts: Point2D[] = [
      { x: bx, y: by },
      { x: bx + boxSize, y: by - 1 },
      { x: bx + boxSize + 1, y: by + boxSize },
      { x: bx - 1, y: by + boxSize + 1 },
      { x: bx, y: by - 1 },
    ];
    drawTrimmedJitterPolyline(
      ctx,
      boxPts,
      boxTrimP,
      inkColor,
      Math.max(2.2, layout.fontSize * 0.075),
      combineSeed(custom.seed, 600 + i * 41)
    );

    // 4c. Hand-drawn Checkmark Tick inside box (stroke-trimmed with seeded jitter, double pass)
    if (tickTrimP > 0.01) {
      const tickPts: Point2D[] = [
        { x: bx + boxSize * 0.18, y: by + boxSize * 0.54 },
        { x: bx + boxSize * 0.44, y: by + boxSize * 0.82 },
        { x: bx + boxSize * 1.16, y: by - boxSize * 0.14 },
      ];
      drawTrimmedJitterPolyline(
        ctx,
        tickPts,
        tickTrimP,
        PTS_CHECKLIST_CONFIG.colors.marginRed,
        Math.max(3, layout.fontSize * 0.1),
        combineSeed(custom.seed, 700 + i * 53)
      );
    }

    ctx.restore();
  }

  ctx.restore();
  ctx.restore();
};
