import {
  AnnotationType,
  ArabicFontFamily,
  BackgroundMode,
  EnglishFontFamily,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  StyleLightPalette,
  TimelineConfig,
} from '../types';
import { getCachedAnnotateBackdropCanvas } from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  getEffectiveTimeline,
  getPhrasePositionBox,
  hexToRgba,
  lerp,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import { applyStudioCanvasTextProps, KeywordLineRect, layoutArabicQuote } from '../utils/textLayout';

export const ANNOTATE_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#F5F7FA',
  textSecondary: '#CBD5E1',
  accent: '#FFD400',
  keyword: '#FFD400',
};

export const ANNOTATE_CONFIG = {
  id: 'annotate' as const,
  mode: 'phrase' as const,
  nameAr: 'تحليل وإبراز',
  nameEn: 'Annotate',
  descriptionAr: 'شبكة دفتر داكنة مع علامات يدوية مرسومة (خط متعرج، دائرة، تظليل، سهم منحني، أو قوس) حول الكلمات المفتاحية',
  defaultAccent: '#FFD400',
  defaultKeywordColor: '#FFD400',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'style' as BackgroundMode,
  lightPalette: ANNOTATE_LIGHT_PALETTE,
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
  allowedEnglishFonts: [
    'Plus Jakarta Sans',
    'Outfit',
    'Share Tech Mono',
    'Manrope',
  ] as EnglishFontFamily[],
  colors: {
    slateBg: '#0F1115',
    textLight: '#F5F7FA',
    defaultYellow: '#FFD400',
    arrowPink: '#FF4D6D',
  },
  lineHeightRatio: 1.85,
};

interface Point2D {
  x: number;
  y: number;
}

/**
 * Evaluates a Catmull-Rom spline through control points to produce a smooth dense polyline.
 */
function sampleCatmullRomPolyline(controlPoints: Point2D[], samplesPerSegment: number = 14): Point2D[] {
  if (controlPoints.length < 2) return controlPoints;
  const result: Point2D[] = [];
  const n = controlPoints.length;

  for (let i = 0; i < n - 1; i++) {
    const p0 = controlPoints[Math.max(0, i - 1)];
    const p1 = controlPoints[i];
    const p2 = controlPoints[i + 1];
    const p3 = controlPoints[Math.min(n - 1, i + 2)];

    for (let s = 0; s < samplesPerSegment; s++) {
      const u = s / samplesPerSegment;
      const u2 = u * u;
      const u3 = u2 * u;

      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * u +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * u +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);

      result.push({ x, y });
    }
  }
  result.push(controlPoints[n - 1]);
  return result;
}

/**
 * Draws a trimmed portion [0, trimProgress] of a polyline with round caps and double hand-drawn stroke.
 */
function drawTrimmedPolyline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  polyline: Point2D[],
  trimProgress: number,
  strokeWidth: number,
  color: string,
  doubleStroke: boolean,
  seed: number
) {
  const p = clamp(trimProgress, 0, 1);
  if (p <= 0.005 || polyline.length < 2) return;

  const maxIdxFloat = p * (polyline.length - 1);
  const maxIdx = Math.floor(maxIdxFloat);
  const frac = maxIdxFloat - maxIdx;

  const drawPass = (offsetX: number, offsetY: number, width: number, alphaMult: number) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha *= alphaMult;

    ctx.beginPath();
    ctx.moveTo(polyline[0].x + offsetX, polyline[0].y + offsetY);
    for (let i = 1; i <= maxIdx; i++) {
      ctx.lineTo(polyline[i].x + offsetX, polyline[i].y + offsetY);
    }
    if (maxIdx < polyline.length - 1 && frac > 0) {
      const cur = polyline[maxIdx];
      const next = polyline[maxIdx + 1];
      ctx.lineTo(lerp(cur.x, next.x, frac) + offsetX, lerp(cur.y, next.y, frac) + offsetY);
    }
    ctx.stroke();
    ctx.restore();
  };

  drawPass(0, 0, strokeWidth, 1.0);

  if (doubleStroke) {
    const rng = mulberry32(combineSeed(seed, 6301));
    const ox = (rng() - 0.5) * 3.5;
    const oy = 1.5 + rng() * 2.5;
    drawPass(ox, oy, strokeWidth * 0.65, 0.78);
  }
}

const AUTO_CYCLE_SHAPES: Exclude<AnnotationType, 'auto'>[] = [
  'underline',
  'circle',
  'highlight',
  'arrow',
  'bracket',
];

function resolveShapeForRect(
  requestedType: AnnotationType,
  rectIndex: number
): Exclude<AnnotationType, 'auto'> {
  if (requestedType !== 'auto') return requestedType;
  return AUTO_CYCLE_SHAPES[rectIndex % AUTO_CYCLE_SHAPES.length];
}

/**
 * Renders one hand-drawn annotation shape around a KeywordLineRect over ~0.5s using easeInOutCubic.
 */
function renderAnnotationShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: Exclude<AnnotationType, 'auto'>,
  rect: KeywordLineRect,
  fontSize: number,
  rawProgress: number,
  color: string,
  isGreen: boolean,
  seed: number,
  direction: ResolvedTextDirection = 'rtl'
) {
  const prog = easeInOutCubic(clamp(rawProgress, 0, 1));
  if (prog <= 0.005) return;

  const rng = mulberry32(combineSeed(seed, 6100 + rect.groupId * 83 + rect.lineIndex * 29));
  const strokeW = clamp(fontSize * 0.11, 6, 8);
  const isLtr = direction === 'ltr';

  if (shape === 'underline') {
    // Hand-drawn underline squiggle (directional)
    const yBase = rect.baselineY + fontSize * 0.2;
    const ctrlPts: Point2D[] = [];
    const steps = 6;
    const fromX = isLtr ? rect.leftX - 8 : rect.rightX + 8;
    const toX = isLtr ? rect.rightX + 8 : rect.leftX - 8;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const x = lerp(fromX, toX, f);
      const squiggle = Math.sin(f * Math.PI * 3) * 4.5 + (rng() - 0.5) * 3.5;
      ctrlPts.push({ x, y: yBase + squiggle });
    }
    const poly = sampleCatmullRomPolyline(ctrlPts, 12);
    drawTrimmedPolyline(ctx, poly, prog, strokeW, color, true, seed);
  } else if (shape === 'circle') {
    // Hand-drawn oval loop around keyword with slight overshoot overlap
    const cx = (rect.leftX + rect.rightX) / 2;
    const cy = (rect.topY + rect.bottomY) / 2;
    const rx = rect.width * 0.58 + 18;
    const ry = (rect.bottomY - rect.topY) * 0.62 + 12;

    const ctrlPts: Point2D[] = [];
    const steps = 10;
    for (let s = 0; s <= steps; s++) {
      // Loop 1.08 turns so ends overlap organically like a marker circle
      const angle = -0.35 + (s / steps) * Math.PI * 2.16;
      const jr = 1 + (rng() - 0.5) * 0.09;
      ctrlPts.push({
        x: cx + Math.cos(angle) * rx * jr,
        y: cy + Math.sin(angle) * ry * jr,
      });
    }
    const poly = sampleCatmullRomPolyline(ctrlPts, 10);
    drawTrimmedPolyline(ctx, poly, prog, strokeW, color, true, seed);
  } else if (shape === 'highlight') {
    // Translucent marker sweep behind text (directional)
    const padX = 14;
    const fullW = rect.width + padX * 2;
    const curW = fullW * prog;
    const leftX = isLtr ? rect.leftX - padX : rect.rightX + padX - curW;
    const topY = rect.topY + fontSize * 0.06;
    const h = (rect.bottomY - rect.topY) * 0.92;

    ctx.save();
    ctx.fillStyle = isGreen ? color : hexToRgba(color, 0.34);
    ctx.beginPath();
    ctx.roundRect(leftX, topY, curW, h, 8);
    ctx.fill();
    ctx.restore();
  } else if (shape === 'arrow') {
    // Curved hand-drawn arrow arcing down toward keyword top-center (directional)
    const targetX = (rect.leftX + rect.rightX) / 2;
    const targetY = rect.topY - 8;
    const startX = isLtr
      ? rect.leftX - Math.min(90, fontSize * 1.3)
      : rect.rightX + Math.min(90, fontSize * 1.3);
    const startY = rect.topY - Math.min(72, fontSize * 1.05);
    const midX = lerp(startX, targetX, 0.45) + (isLtr ? -18 : 18);
    const midY = lerp(startY, targetY, 0.25) - 22;

    const shaftPoly = sampleCatmullRomPolyline(
      [
        { x: startX, y: startY },
        { x: midX, y: midY },
        { x: targetX, y: targetY },
      ],
      14
    );
    const shaftProg = clamp(prog / 0.78, 0, 1);
    drawTrimmedPolyline(ctx, shaftPoly, shaftProg, strokeW, color, true, seed);

    if (prog > 0.75) {
      const headProg = (prog - 0.75) / 0.25;
      const wing1: Point2D[] = [
        { x: isLtr ? targetX - 18 : targetX + 18, y: targetY - 16 },
        { x: targetX, y: targetY },
        { x: isLtr ? targetX - 20 : targetX + 20, y: targetY + 8 },
      ];
      drawTrimmedPolyline(ctx, wing1, headProg, strokeW, color, false, seed);
    }
  } else if (shape === 'bracket') {
    // Hand-drawn right and left brackets [ ... ] enclosing the keyword
    const padX = 14;
    const topY = rect.topY - 4;
    const botY = rect.bottomY + 6;
    const lip = 14;

    const rightBracket = sampleCatmullRomPolyline(
      [
        { x: rect.rightX + padX - lip, y: topY },
        { x: rect.rightX + padX, y: topY },
        { x: rect.rightX + padX + 2, y: (topY + botY) / 2 },
        { x: rect.rightX + padX, y: botY },
        { x: rect.rightX + padX - lip, y: botY },
      ],
      8
    );

    const leftBracket = sampleCatmullRomPolyline(
      [
        { x: rect.leftX - padX + lip, y: topY },
        { x: rect.leftX - padX, y: topY },
        { x: rect.leftX - padX - 2, y: (topY + botY) / 2 },
        { x: rect.leftX - padX, y: botY },
        { x: rect.leftX - padX + lip, y: botY },
      ],
      8
    );

    drawTrimmedPolyline(ctx, rightBracket, prog, strokeW, color, true, seed);
    drawTrimmedPolyline(ctx, leftBracket, prog, strokeW, color, true, combineSeed(seed, 77));
  }
}

export function getAnnotateEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const { baseWidth: W, baseHeight: H } = size;
  const isHorizontal = custom.format === '16:9';
  const pos = custom.position || 'center';
  const direction = resolveTextDirection(custom, content.quoteText);
  const posBox = getPhrasePositionBox(pos, custom.format, W, H, direction);
  const { enter, hold } = getEffectiveTimeline(timeline, content.quoteText, 'phrase', 0.55);
  const defaultFont =
    direction === 'ltr'
      ? ANNOTATE_CONFIG.defaultEnglishQuoteFont
      : ANNOTATE_CONFIG.defaultQuoteFont;
  const font = custom.quoteFontOverride || defaultFont;

  const isFullscreen = pos === 'fullscreen';
  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: font,
    fontWeight: 700,
    minFontSize: isFullscreen ? (isHorizontal ? 56 : 46) : isHorizontal ? 38 : 34,
    maxFontSize: isFullscreen ? (isHorizontal ? 116 : 96) : isHorizontal ? 80 : 68,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: ANNOTATE_CONFIG.lineHeightRatio,
    boxX: posBox.boxX,
    boxY: posBox.boxY,
    boxWidth: posBox.boxWidth,
    boxHeight: posBox.boxHeight,
    align: posBox.align,
    direction,
  });

  const totalWords = Math.max(1, layout.words.length);
  const wordRevealStart = 0.05;
  const wordRevealEnd = Math.min(enter + 0.35 * hold, enter * 0.85);
  const wordInterval = (wordRevealEnd - wordRevealStart) / totalWords;

  const seenGroups = new Set<number>();
  const keywordTimes: number[] = [];

  for (const w of layout.words) {
    if (w.isKeyword && w.groupId !== null && !seenGroups.has(w.groupId)) {
      seenGroups.add(w.groupId);
      const wTime = wordRevealStart + w.globalWordIndex * wordInterval;
      keywordTimes.push(Number(wTime.toFixed(3)));
    }
  }

  return { enterStart: 0.05, keywordTimes };
}

export const renderAnnotate: PureStyleRenderer = (
  ctx,
  t,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
) => {
  const { baseWidth: W, baseHeight: H } = size;
  const isHorizontal = custom.format === '16:9';
  const pos = custom.position || 'center';
  const bgMode = resolveBackgroundMode(custom);
  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';
  const direction = resolveTextDirection(custom, content.quoteText);
  const isLtr = direction === 'ltr';

  // Pass 0.55s annotationExtraSec so getEffectiveTimeline guarantees >= 0.8s hold after annotations finish
  const { enter, hold, exitStart, total } = getEffectiveTimeline(
    timeline,
    content.quoteText,
    'phrase',
    0.55
  );

  const annotationType: AnnotationType = custom.annotationType || 'auto';
  const defaultAnnotColor =
    annotationType === 'arrow'
      ? ANNOTATE_CONFIG.colors.arrowPink
      : ANNOTATE_CONFIG.colors.defaultYellow;
  const annotColor = custom.keywordColor || custom.accentColor || defaultAnnotColor;
  const defaultFont = isLtr
    ? ANNOTATE_CONFIG.defaultEnglishQuoteFont
    : ANNOTATE_CONFIG.defaultQuoteFont;
  const font = custom.quoteFontOverride || defaultFont;

  const exitProgress = progress(t, exitStart, total);
  const masterAlpha = 1 - easeInCubic(exitProgress);

  ctx.save();

  // 1. Background: Dark slate #0F1115 with faint notebook grid, Chroma Green, or Screen Black
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (isBlack) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = ANNOTATE_CONFIG.colors.slateBg;
    ctx.fillRect(0, 0, W, H);
    const gridBg = getCachedAnnotateBackdropCanvas(W, H);
    ctx.save();
    ctx.globalAlpha = masterAlpha;
    ctx.drawImage(gridBg, 0, 0, W, H);
    ctx.restore();
  }

  // 2. Layout inside position box
  const posBox = getPhrasePositionBox(pos, custom.format, W, H, direction);
  const isFullscreen = pos === 'fullscreen';

  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: font,
    fontWeight: 700,
    minFontSize: isFullscreen ? (isHorizontal ? 56 : 46) : isHorizontal ? 38 : 34,
    maxFontSize: isFullscreen ? (isHorizontal ? 116 : 96) : isHorizontal ? 80 : 68,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: ANNOTATE_CONFIG.lineHeightRatio,
    boxX: posBox.boxX,
    boxY: posBox.boxY,
    boxWidth: posBox.boxWidth,
    boxHeight: posBox.boxHeight,
    align: posBox.align,
    direction,
  });

  if (layout.lines.length === 0 || masterAlpha <= 0.005) {
    ctx.restore();
    return;
  }

  const totalWords = Math.max(1, layout.words.length);
  const wordRevealStart = 0.05;
  const wordRevealEnd = Math.min(enter + 0.35 * hold, enter * 0.85);
  const wordInterval = (wordRevealEnd - wordRevealStart) / totalWords;

  // 3. Draw background highlight annotations first (if shape === 'highlight') so text sits cleanly on top
  for (let rIdx = 0; rIdx < layout.keywordLineRects.length; rIdx++) {
    const rect = layout.keywordLineRects[rIdx];
    const shape = resolveShapeForRect(annotationType, rIdx);
    if (shape !== 'highlight') continue;

    const rectLastWord = rect.words[rect.words.length - 1];
    const rectWordsEnd = wordRevealStart + rectLastWord.globalWordIndex * wordInterval;
    const annotStart = rectWordsEnd + 0.06;
    const rawP = progress(t, annotStart, annotStart + 0.45);

    ctx.save();
    ctx.globalAlpha = isGreen ? (masterAlpha > 0.25 ? 1 : 0) : masterAlpha;
    renderAnnotationShape(ctx, shape, rect, layout.fontSize, rawP, annotColor, isGreen, custom.seed, direction);
    ctx.restore();
  }

  // 4. Typewriter Word-by-Word Sequential Reveal
  ctx.save();
  ctx.globalAlpha = isGreen ? (masterAlpha > 0.25 ? 1 : 0) : masterAlpha;
  applyStudioCanvasTextProps(ctx, font, 700, layout.fontSize, direction);
  ctx.textAlign = 'right';

  for (const w of layout.words) {
    const wTime = wordRevealStart + w.globalWordIndex * wordInterval;
    if (t < wTime) continue; // Typewriter: word has not arrived yet

    if (!isBlack) {
      ctx.fillStyle = '#050608';
      ctx.fillText(w.text, w.x + 2, w.y + 3);
    }

    ctx.fillStyle = ANNOTATE_CONFIG.colors.textLight;
    ctx.fillText(w.text, w.x, w.y);
  }
  ctx.restore();

  // 5. Foreground Hand-Drawn Annotations (underline, circle, arrow, bracket)
  if (layout.keywordLineRects.length > 0) {
    for (let rIdx = 0; rIdx < layout.keywordLineRects.length; rIdx++) {
      const rect = layout.keywordLineRects[rIdx];
      const shape = resolveShapeForRect(annotationType, rIdx);
      if (shape === 'highlight') continue;

      const rectLastWord = rect.words[rect.words.length - 1];
      const rectWordsEnd = wordRevealStart + rectLastWord.globalWordIndex * wordInterval;
      const annotStart = rectWordsEnd + 0.06;
      const rawP = progress(t, annotStart, annotStart + 0.45);
      const shapeColor =
        shape === 'arrow' && !custom.keywordColor
          ? ANNOTATE_CONFIG.colors.arrowPink
          : annotColor;

      ctx.save();
      ctx.globalAlpha = isGreen ? (masterAlpha > 0.25 ? 1 : 0) : masterAlpha;
      renderAnnotationShape(ctx, shape, rect, layout.fontSize, rawP, shapeColor, isGreen, custom.seed, direction);
      ctx.restore();
    }
  } else if (layout.lines.length > 0) {
    // Rule: "No keyword: one subtle underline under the last line."
    const lastLine = layout.lines[layout.lines.length - 1];
    const lastWord = layout.words[layout.words.length - 1];
    const lastWordTime = wordRevealStart + lastWord.globalWordIndex * wordInterval;
    const annotStart = lastWordTime + 0.06;
    const rawP = progress(t, annotStart, annotStart + 0.45);
    const fallbackRect: KeywordLineRect = {
      groupId: 0,
      lineIndex: lastLine.lineIndex,
      rightX: lastLine.rightX,
      leftX: lastLine.leftX,
      width: lastLine.width,
      topY: lastLine.topY,
      bottomY: lastLine.bottomY,
      baselineY: lastLine.y,
      words: lastLine.words,
    };

    ctx.save();
    ctx.globalAlpha = isGreen ? (masterAlpha > 0.25 ? 1 : 0) : masterAlpha * 0.85;
    renderAnnotationShape(
      ctx,
      'underline',
      fallbackRect,
      layout.fontSize,
      rawP,
      annotColor,
      isGreen,
      custom.seed,
      direction
    );
    ctx.restore();
  }

  ctx.restore();
};
