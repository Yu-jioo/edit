import {
  ArabicFontFamily,
  BackgroundMode,
  EnglishFontFamily,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  SceneEventTimes,
  StyleCustomization,
  StyleLightPalette,
  TimelineConfig,
} from '../types';
import { getCachedKraftPaperCanvas, getOrGenerateCachedCanvas } from '../utils/assetCache';
import {
  clamp,
  getEffectiveTimeline,
  getPhrasePositionBox,
  lerp,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  getFontCalibration,
  layoutArabicQuote,
} from '../utils/textLayout';

export const TORN_PAPER_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#181614',
  textSecondary: '#3A3A3A',
  accent: '#FFE45C',
  keyword: '#FFE45C',
  surfaceBg: '#F5F0E6',
};

export const TORN_PAPER_CONFIG = {
  id: 'torn-paper' as const,
  mode: 'phrase' as const,
  nameAr: 'ورق ممزق وستوب موشن',
  nameEn: 'Torn Paper Stop-Motion',
  descriptionAr: 'قصاصات كولاج متعددة الطبقات بظلال عميقة وأشرطة لاصقة ودبابيس معدنية وحركة ستوب موشن',
  defaultAccent: '#FFE45C',
  defaultKeywordColor: '#FFE45C',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Special Elite' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Special Elite' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green'] as BackgroundMode[],
  recommendedBackground: 'style' as BackgroundMode,
  lightPalette: TORN_PAPER_LIGHT_PALETTE,
  allowedFonts: [
    'Cairo',
    'Readex Pro',
    'Aref Ruqaa',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
    'KOMission Black',
    'Zain Rounded instance mob',
    '29LT Azahar Display AL TN Trial Bold',
  ] as ArabicFontFamily[],
  allowedEnglishFonts: [
    'Special Elite',
    'Share Tech Mono',
    'Outfit',
    'Plus Jakarta Sans',
  ] as EnglishFontFamily[],
  colors: {
    kraftBg: '#C9A878',
    stripCream: '#F5F0E6',
    stripFiber: '#FFFFFF',
    backingDark: '#26211C',
    backingWarm: '#8C6239',
    ink: '#181614',
    highlighterYellow: '#FFE45C',
    tapeColor: '#E8D9A8',
    pinRed: '#C83226',
    pinBrass: '#D4A838',
  },
  lineHeightRatio: 1.85,
};

function drawSerratedTapePiece(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number,
  isStriped: boolean,
  isGreen: boolean
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Subtle shadow under tape
  if (!isGreen) {
    ctx.fillStyle = 'rgba(20, 14, 6, 0.16)';
    ctx.fillRect(-w / 2 + 1.5, -h / 2 + 2, w, h);
  }

  ctx.globalAlpha = isGreen ? 1 : 0.86;
  ctx.fillStyle = isStriped ? '#DFC98E' : TORN_PAPER_CONFIG.colors.tapeColor;

  // Serrated tape polygon
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  for (let sy = -h / 2; sy <= h / 2; sy += 4) {
    ctx.lineTo(w / 2 - (Math.abs(sy) % 8 === 0 ? 2.5 : 0), sy);
  }
  ctx.lineTo(-w / 2, h / 2);
  for (let sy = h / 2; sy >= -h / 2; sy -= 4) {
    ctx.lineTo(-w / 2 + (Math.abs(sy) % 8 === 0 ? 2.5 : 0), sy);
  }
  ctx.closePath();
  ctx.fill();

  if (isStriped) {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(145, 95, 42, 0.32)';
    ctx.lineWidth = 2.5;
    for (let sx = -w; sx < w; sx += 8) {
      ctx.beginPath();
      ctx.moveTo(sx, -h);
      ctx.lineTo(sx + h * 1.2, h);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.strokeStyle = 'rgba(170, 148, 98, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawMetallicThumbtack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  headColor: string,
  isGreen: boolean
) {
  ctx.save();
  ctx.translate(x, y);

  // Cast shadow on paper
  ctx.fillStyle = isGreen ? '#141414' : 'rgba(18, 12, 6, 0.42)';
  ctx.beginPath();
  ctx.arc(3.5, 4.5, 9.5, 0, Math.PI * 2);
  ctx.fill();

  // Outer metallic base rim
  ctx.fillStyle = headColor;
  ctx.beginPath();
  ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Inner raised cap
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.beginPath();
  ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = headColor;
  ctx.beginPath();
  ctx.arc(-0.5, -0.5, 5.4, 0, Math.PI * 2);
  ctx.fill();

  // Specular highlight dot
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.beginPath();
  ctx.arc(-2.5, -2.5, 2.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMetallicStaple(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Staple shadow
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-11, 1.5);
  ctx.lineTo(11, 1.5);
  ctx.stroke();

  // Pierced paper holes at staple ends
  ctx.fillStyle = '#2A241E';
  ctx.beginPath();
  ctx.arc(-11, 0, 2.2, 0, Math.PI * 2);
  ctx.arc(11, 0, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Metallic wire bar
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.lineTo(11, 0);
  ctx.stroke();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-9, -0.6);
  ctx.lineTo(9, -0.6);
  ctx.stroke();

  ctx.restore();
}

/**
 * Generates and caches a multi-layered torn paper strip sprite with:
 * - Offset secondary backing paper scrap for collage depth
 * - Multi-layered drop shadow (or hard offset shadow on Green Screen)
 * - Fibrous white deckle edge + inner cream ruled paper body
 * - Varied tape pieces, crossed washi tape, 3D thumbtacks, and staples
 */
function getCachedTornStripSprite(
  width: number,
  height: number,
  seed: number,
  lineIdx: number,
  isGreen: boolean
): HTMLCanvasElement {
  const w = Math.max(140, Math.round(width));
  const h = Math.max(64, Math.round(height));
  const key = `torn-strip-v2|${w}x${h}|${seed}|${lineIdx}|${isGreen ? 'g' : 's'}`;

  return getOrGenerateCachedCanvas(key, w, h, (ctx) => {
    const rng = mulberry32(combineSeed(seed, 2200 + lineIdx * 97));
    const pad = 26;
    const left = pad;
    const right = w - pad;
    const top = pad;
    const bottom = h - pad;

    // Build seeded jagged polygon (3-8px teeth)
    const topPts: [number, number][] = [];
    const bottomPts: [number, number][] = [];
    const rightPts: [number, number][] = [];
    const leftPts: [number, number][] = [];

    const stepX = 13;
    for (let x = left; x <= right; x += stepX) {
      const jagT = (rng() - 0.5) * 2 * (3 + rng() * 5.2);
      topPts.push([x, top + jagT]);
    }
    topPts.push([right, top]);

    const stepY = 10;
    for (let y = top; y <= bottom; y += stepY) {
      const jagR = (rng() - 0.5) * 2 * (3 + rng() * 5.2);
      rightPts.push([right + jagR, y]);
    }

    for (let x = right; x >= left; x -= stepX) {
      const jagB = (rng() - 0.5) * 2 * (3 + rng() * 5.2);
      bottomPts.push([x, bottom + jagB]);
    }

    for (let y = bottom; y >= top; y -= stepY) {
      const jagL = (rng() - 0.5) * 2 * (3 + rng() * 5.2);
      leftPts.push([left + jagL, y]);
    }

    const tracePath = () => {
      ctx.beginPath();
      ctx.moveTo(topPts[0][0], topPts[0][1]);
      for (const [px, py] of topPts) ctx.lineTo(px, py);
      for (const [px, py] of rightPts) ctx.lineTo(px, py);
      for (const [px, py] of bottomPts) ctx.lineTo(px, py);
      for (const [px, py] of leftPts) ctx.lineTo(px, py);
      ctx.closePath();
    };

    // 1. Offset Secondary Backing Collage Scrap behind the main strip
    const backingAngle = (lineIdx % 2 === 0 ? 1 : -1) * (0.018 + rng() * 0.015);
    const backingOffsetX = lineIdx % 2 === 0 ? -6 : 6;
    const backingOffsetY = 7;

    ctx.save();
    ctx.translate(w / 2 + backingOffsetX, h / 2 + backingOffsetY);
    ctx.rotate(backingAngle);
    ctx.translate(-w / 2, -h / 2);

    // Shadow under backing scrap
    if (isGreen) {
      ctx.save();
      ctx.translate(5, 7);
      tracePath();
      ctx.fillStyle = '#121212';
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.shadowColor = 'rgba(18, 10, 3, 0.42)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 10;
      tracePath();
      ctx.fillStyle =
        lineIdx % 2 === 0
          ? TORN_PAPER_CONFIG.colors.backingDark
          : TORN_PAPER_CONFIG.colors.backingWarm;
      ctx.fill();
      ctx.restore();
    }

    tracePath();
    ctx.fillStyle =
      lineIdx % 2 === 0
        ? TORN_PAPER_CONFIG.colors.backingDark
        : TORN_PAPER_CONFIG.colors.backingWarm;
    ctx.fill();
    ctx.restore();

    // 2. Contact shadow directly under primary cream strip
    ctx.save();
    ctx.translate(3, 5);
    tracePath();
    ctx.fillStyle = isGreen ? '#1A1A1A' : 'rgba(24, 15, 6, 0.28)';
    ctx.fill();
    ctx.restore();

    // 3. Outer fibrous white deckle edge band
    ctx.save();
    tracePath();
    ctx.fillStyle = '#FCF9F2';
    ctx.fill();
    ctx.strokeStyle = 'rgba(205, 192, 170, 0.88)';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.restore();

    // 4. Inner cream paper body (#F5F0E6) inset to expose the fibrous torn edge + faint notebook lines
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale((w - 7) / w, (h - 6) / h);
    ctx.translate(-w / 2, -h / 2);
    tracePath();
    ctx.fillStyle = TORN_PAPER_CONFIG.colors.stripCream;
    ctx.fill();

    // Subtle ruled notebook lines inside the paper strip
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(110, 145, 185, 0.16)';
    ctx.lineWidth = 1;
    for (let ry = top + 14; ry < bottom - 6; ry += 12) {
      ctx.beginPath();
      ctx.moveTo(left, ry);
      ctx.lineTo(right, ry);
      ctx.stroke();
    }
    // Faint vertical red notebook margin line
    ctx.strokeStyle = 'rgba(200, 65, 55, 0.18)';
    ctx.beginPath();
    ctx.moveTo(right - 28, top);
    ctx.lineTo(right - 28, bottom);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // 5. Varied Fasteners (Tape, Striped Tape, Metallic Thumbtacks, and Staples)
    const fastenerMode = lineIdx % 3;
    if (fastenerMode === 0) {
      // Masking tape on one side + 3D Crimson Thumbtack on the other
      drawSerratedTapePiece(
        ctx,
        left + 32 + rng() * 14,
        top - 2,
        50,
        21,
        -0.24 + (rng() - 0.5) * 0.12,
        false,
        isGreen
      );
      drawMetallicThumbtack(
        ctx,
        right - 28 - rng() * 10,
        top + 8,
        TORN_PAPER_CONFIG.colors.pinRed,
        isGreen
      );
    } else if (fastenerMode === 1) {
      // Striped washi tape on right + crossed masking tape on left + staple
      drawSerratedTapePiece(
        ctx,
        right - 34 - rng() * 14,
        top - 2,
        52,
        21,
        0.22 + (rng() - 0.5) * 0.12,
        true,
        isGreen
      );
      drawSerratedTapePiece(
        ctx,
        left + 30 + rng() * 12,
        top - 2,
        46,
        19,
        -0.18,
        false,
        isGreen
      );
      drawMetallicStaple(ctx, left + 22, bottom - 12, 0.35);
    } else {
      // Brass Thumbtack top-center/left + angled striped tape on right
      drawMetallicThumbtack(
        ctx,
        left + 30 + rng() * 14,
        top + 8,
        TORN_PAPER_CONFIG.colors.pinBrass,
        isGreen
      );
      drawSerratedTapePiece(
        ctx,
        right - 32 - rng() * 14,
        top - 2,
        50,
        20,
        0.25,
        true,
        isGreen
      );
    }
  });
}

export function getTornPaperEventTimes(
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
  const { enter, hold } = getEffectiveTimeline(timeline, content.quoteText, 'phrase', 0.4);
  const defaultFont =
    direction === 'ltr'
      ? TORN_PAPER_CONFIG.defaultEnglishQuoteFont
      : TORN_PAPER_CONFIG.defaultQuoteFont;
  const font = custom.quoteFontOverride || defaultFont;

  const isFullscreen = pos === 'fullscreen';
  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: font,
    fontWeight: 700,
    minFontSize: isFullscreen ? (isHorizontal ? 54 : 46) : isHorizontal ? 36 : 32,
    maxFontSize: isFullscreen ? (isHorizontal ? 108 : 90) : isHorizontal ? 76 : 64,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: TORN_PAPER_CONFIG.lineHeightRatio,
    boxX: posBox.boxX,
    boxY: posBox.boxY,
    boxWidth: posBox.boxWidth,
    boxHeight: posBox.boxHeight,
    align: posBox.align,
    direction,
  });

  const numLines = Math.max(1, layout.lines.length);
  const maxRevealSpan = Math.min(enter + 0.35 * hold, enter * 0.9);
  const stripFourFramesDur = 4 / 12; // 4 stepped frames at 12fps

  const seenGroups = new Set<number>();
  const keywordTimes: number[] = [];
  for (const rect of layout.keywordLineRects) {
    if (!seenGroups.has(rect.groupId)) {
      seenGroups.add(rect.groupId);
      const lStart = lerp(
        0.04,
        Math.max(0.06, maxRevealSpan - stripFourFramesDur),
        numLines > 1 ? rect.lineIndex / (numLines - 1) : 0
      );
      keywordTimes.push(Number((lStart + stripFourFramesDur + 0.08).toFixed(3)));
    }
  }

  return { enterStart: 0.04, keywordTimes };
}

export const renderTornPaper: PureStyleRenderer = (
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
  const direction = resolveTextDirection(custom, content.quoteText);
  const isLtr = direction === 'ltr';

  const { enter, hold, exitStart, total } = getEffectiveTimeline(
    timeline,
    content.quoteText,
    'phrase',
    0.4
  );

  // Quantize ALL motion to 12 fps: t_q = floor(t * 12) / 12
  const frameIndex12 = Math.floor(t * 12);
  const t_q = frameIndex12 / 12;

  const highlighterColor =
    custom.keywordColor || custom.accentColor || TORN_PAPER_CONFIG.colors.highlighterYellow;
  const defaultFont = isLtr
    ? TORN_PAPER_CONFIG.defaultEnglishQuoteFont
    : TORN_PAPER_CONFIG.defaultQuoteFont;
  const font = custom.quoteFontOverride || defaultFont;

  ctx.save();

  // 1. Background: Kraft Board #C9A878 or Pure Chroma Green #00FF00
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = TORN_PAPER_CONFIG.colors.kraftBg;
    ctx.fillRect(0, 0, W, H);
    const kraftCanvas = getCachedKraftPaperCanvas(W, H, custom.seed);
    ctx.drawImage(kraftCanvas, 0, 0, W, H);
  }

  // 2. Layout inside position box
  const posBox = getPhrasePositionBox(pos, custom.format, W, H, direction);
  const isFullscreen = pos === 'fullscreen';

  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: font,
    fontWeight: 700,
    minFontSize: isFullscreen ? (isHorizontal ? 54 : 46) : isHorizontal ? 36 : 32,
    maxFontSize: isFullscreen ? (isHorizontal ? 108 : 90) : isHorizontal ? 76 : 64,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: TORN_PAPER_CONFIG.lineHeightRatio,
    boxX: posBox.boxX,
    boxY: posBox.boxY,
    boxWidth: posBox.boxWidth,
    boxHeight: posBox.boxHeight,
    align: posBox.align,
    direction,
  });

  if (layout.lines.length === 0) {
    ctx.restore();
    return;
  }

  const numLines = Math.max(1, layout.lines.length);
  const stripEnterDur = 4 / 12; // 4 stepped frames at 12fps (~0.333s)
  const maxRevealSpan = Math.min(enter + 0.35 * hold, enter * 0.9);

  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];
    const lStart = lerp(
      0.04,
      Math.max(0.06, maxRevealSpan - stripEnterDur),
      numLines > 1 ? i / (numLines - 1) : 0
    );

    // 4 stepped frames on enter (slide + scale 0.9 -> 1.0)
    const enterStepFloat = (t_q - lStart) * 12;
    if (enterStepFloat < 0) continue;
    const enterStep = clamp(Math.floor(enterStepFloat) + 1, 0, 4);
    const enterStepNorm = enterStep / 4;

    // Stepped exit over 4 frames at 12fps
    const exitDur = Math.max(4 / 12, total - exitStart);
    const lExitStart = exitStart + (i / numLines) * (exitDur * 0.35);
    const exitStepFloat = progress(t_q, lExitStart, total) * 4;
    const exitStep = clamp(Math.floor(exitStepFloat), 0, 4);
    if (exitStep >= 4) continue;
    const exitStepNorm = exitStep / 4;

    // Seeded base strip tilt (1° to 3°, alternating sign)
    const baseRng = mulberry32(combineSeed(custom.seed, 2300 + i * 41));
    const baseTiltDeg = (1.1 + baseRng() * 1.8) * (i % 2 === 0 ? -1 : 1);

    // Seeded stop-motion jitter per 12fps frame (±2px, ±0.4°)
    const frameRng = mulberry32(combineSeed(custom.seed, 2500 + i * 131 + frameIndex12 * 17));
    const jitterX = (frameRng() - 0.5) * 4.0; // ±2px
    const jitterY = (frameRng() - 0.5) * 4.0; // ±2px
    const jitterDeg = (frameRng() - 0.5) * 0.8; // ±0.4°

    const fontCal = getFontCalibration(font);
    const stripPadX = Math.round(layout.fontSize * 0.85);
    const stripPadY = Math.round(layout.fontSize * (0.48 + fontCal.lineHeightBonus * 0.65));
    const stripW = Math.round(line.width + stripPadX * 2 + 52);
    const stripH = Math.round(
      layout.fontSize * (1.38 + fontCal.lineHeightBonus * 1.4) + stripPadY * 2 + 52
    );

    const centerX = (line.leftX + line.rightX) / 2;
    const centerY = line.y - layout.fontSize * (0.32 + fontCal.baselineOffsetRatio * 0.45);

    const slideOffsetX = (1 - enterStepNorm) * (i % 2 === 0 ? 64 : -64) + exitStepNorm * 72;
    const slideOffsetY = (1 - enterStepNorm) * 28 + exitStepNorm * 36;
    const stepScale = lerp(0.9, 1.0, enterStepNorm) * lerp(1.0, 0.88, exitStepNorm);

    const stripSprite = getCachedTornStripSprite(stripW, stripH, custom.seed, i, isGreen);

    ctx.save();
    ctx.translate(centerX + slideOffsetX + jitterX, centerY + slideOffsetY + jitterY);
    ctx.rotate(((baseTiltDeg + jitterDeg) * Math.PI) / 180);
    ctx.scale(stepScale, stepScale);

    // Draw multi-layered torn strip sprite
    ctx.drawImage(stripSprite, -stripW / 2, -stripH / 2);

    // Draw double-pass marker highlighter (#FFE45C, multiply) on keyword rects on this line
    const lineKwRects = layout.keywordLineRects.filter((r) => r.lineIndex === i);
    for (const rect of lineKwRects) {
      const hlStart = lStart + stripEnterDur + 0.04;
      const hlSteps = clamp(Math.floor((t_q - hlStart) * 12 + 1), 0, 4);
      if (hlSteps <= 0) continue;
      const hlProg = hlSteps / 4;

      const fullHlW = rect.width + 22;
      const curHlW = fullHlW * hlProg;
      const localLeftEdge = rect.leftX - centerX - 11;
      const localRight = isLtr ? localLeftEdge + curHlW : rect.rightX - centerX + 11;
      const localLeft = isLtr ? localLeftEdge : localRight - curHlW;
      const hlTop = -layout.fontSize * 0.56;
      const hlHeight = layout.fontSize * 1.06;

      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = highlighterColor;

      // First marker swipe
      ctx.beginPath();
      ctx.moveTo(localRight, hlTop + 2);
      ctx.lineTo(localLeft + 4, hlTop);
      ctx.lineTo(localLeft, hlTop + hlHeight * 0.35);
      ctx.lineTo(localLeft + 5, hlTop + hlHeight * 0.72);
      ctx.lineTo(localLeft + 1, hlTop + hlHeight);
      ctx.lineTo(localRight - 3, hlTop + hlHeight - 2);
      ctx.lineTo(localRight + 3, hlTop + hlHeight * 0.5);
      ctx.closePath();
      ctx.fill();

      // Second angled chisel-tip marker pass for richer pigment
      ctx.globalAlpha = 0.55;
      ctx.fillRect(
        localLeft + 3,
        hlTop + hlHeight * 0.18,
        Math.max(0, curHlW - 6),
        hlHeight * 0.68
      );
      ctx.restore();

      // Hand-drawn red/dark editor ink underline beneath the highlighted keyword
      ctx.save();
      ctx.strokeStyle = TORN_PAPER_CONFIG.colors.pinRed;
      ctx.lineWidth = Math.max(2.2, layout.fontSize * 0.048);
      ctx.lineCap = 'round';
      const uY = hlTop + hlHeight + 3;
      ctx.beginPath();
      ctx.moveTo(localRight - 2, uY);
      ctx.quadraticCurveTo(
        (localLeft + localRight) * 0.5,
        uY + 2.5,
        localLeft + 2,
        uY - 1
      );
      ctx.stroke();
      ctx.restore();
    }

    // Draw ink text on the strip with subtle letterpress ink density
    applyStudioCanvasTextProps(ctx, font, 700, layout.fontSize, direction);
    ctx.textAlign = 'right';
    ctx.fillStyle = TORN_PAPER_CONFIG.colors.ink;
    const localLineRightX = line.rightX - centerX;
    const localBaselineY = line.y - centerY;
    ctx.fillText(line.text, localLineRightX, localBaselineY);

    ctx.restore();
  }

  ctx.restore();
};

