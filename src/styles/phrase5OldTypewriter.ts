import {
  ArabicFontFamily,
  BackgroundMode,
  EnglishFontFamily,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StudioFontFamily,
  StyleCustomization,
  StyleLightPalette,
  TimelineConfig,
} from '../types';
import {
  getCachedTypewriterPaperSheet,
  getCachedWoodDeskBackdrop,
  getOrGenerateCachedCanvas,
} from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeOutCubic,
  easeOutQuart,
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
  computeTypingScheduleForLayout,
  evaluateLineTypingAtTime,
  layoutArabicQuote,
  PositionedLine,
} from '../utils/textLayout';

export const OLD_TYPEWRITER_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#191714',
  textSecondary: '#4A433B',
  accent: '#191714',
  keyword: '#B3261E',
  surfaceBg: '#F1E8D2',
};

export const OLD_TYPEWRITER_CONFIG = {
  id: 'old_typewriter' as const,
  mode: 'phrase' as const,
  nameAr: 'آلة كتابة قديمة',
  nameEn: 'Old Typewriter',
  descriptionAr:
    'ورقة أرشيفية بترويسة كلاسيكية ومسطرة معدنية وإضاءة مكتب دافئة مع حبر كربوني ومؤشر معدني',
  defaultAccent: '#191714',
  defaultKeywordColor: '#B3261E',
  defaultQuoteFont: 'Noto Naskh Arabic' as ArabicFontFamily,
  defaultAuthorFont: 'Noto Naskh Arabic' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Special Elite' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Special Elite' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  lightPalette: OLD_TYPEWRITER_LIGHT_PALETTE,
  allowedFonts: [
    'Noto Naskh Arabic',
    'Amiri',
    'Noto Kufi Arabic',
    'Cairo',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
  ] as ArabicFontFamily[],
  allowedEnglishFonts: [
    'Special Elite',
    'Share Tech Mono',
    'Lora',
    'Playfair Display',
  ] as EnglishFontFamily[],
  colors: {
    woodDesk: '#241912',
    paperCream: '#F1E8D2',
    inkDark: '#191714',
    ribbonRed: '#B3261E',
  },
  timings: {
    typingStartSec: 0.32,
    carriageReturnGapSec: 0.16,
    underlineDurSec: 0.26,
  },
  lineHeightRatio: 1.78,
};

function getTypewriterSheetGeometry(
  pos: StyleCustomization['position'],
  format: StyleCustomization['format'],
  W: number,
  H: number,
  direction: ResolvedTextDirection = 'rtl'
) {
  const posBox = getPhrasePositionBox(pos || 'center', format, W, H, direction);
  const isFullscreen = (pos || 'center') === 'fullscreen';

  const sheetX = posBox.boxX;
  const sheetY = posBox.boxY;
  const sheetW = posBox.boxWidth;
  const sheetH = posBox.boxHeight;

  const padX = Math.max(28, Math.round(sheetW * 0.08));
  const basePadY = Math.max(20, Math.round(sheetH * 0.08));
  // Reserve top header + metallic ruler space proportionally so text never collides
  const headerBandH = clamp(Math.round(sheetH * 0.16), 34, 68);

  const textBoxX = sheetX + padX;
  const textBoxY = sheetY + headerBandH + Math.round(basePadY * 0.55);
  const textBoxW = Math.max(120, sheetW - padX * 2);
  const textBoxH = Math.max(72, sheetH - headerBandH - Math.round(basePadY * 1.35));

  return {
    posBox,
    isFullscreen,
    sheetX,
    sheetY,
    sheetW,
    sheetH,
    headerBandH,
    textBoxX,
    textBoxY,
    textBoxW,
    textBoxH,
    align: posBox.align,
  };
}

/**
 * Draws the classic archival document header & metallic typewriter paper-bail ruler bar
 * across the top of the sheet.
 */
function drawArchivalHeaderAndMetallicRuler(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sheetX: number,
  sheetY: number,
  sheetW: number,
  headerBandH: number,
  seed: number,
  isGreen: boolean
) {
  ctx.save();

  const rulerY = sheetY + Math.round(headerBandH * 0.18);
  const rulerH = clamp(Math.round(headerBandH * 0.34), 12, 22);
  const archLineY = rulerY + rulerH + Math.max(8, Math.round(headerBandH * 0.28));
  const innerMarginX = Math.max(22, Math.round(sheetW * 0.06));

  // 1. Archival Document Metadata Header below the metallic bar
  ctx.strokeStyle = 'rgba(70, 56, 38, 0.38)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(sheetX + innerMarginX, archLineY);
  ctx.lineTo(sheetX + sheetW - innerMarginX, archLineY);
  ctx.moveTo(sheetX + innerMarginX, archLineY + 3.5);
  ctx.lineTo(sheetX + sheetW - innerMarginX, archLineY + 3.5);
  ctx.stroke();

  if (headerBandH >= 42) {
    const docNum = 1940 + (Math.abs(seed) % 58);
    const fontSize = clamp(Math.round(headerBandH * 0.2), 10, 14);
    ctx.font = `700 ${fontSize}px "JetBrains Mono", "Share Tech Mono", monospace`;
    ctx.fillStyle = 'rgba(65, 52, 36, 0.62)';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(`ARCHIVE // REF-${docNum}`, sheetX + innerMarginX + 2, archLineY - 3);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(179, 38, 30, 0.68)';
    ctx.fillText('RECORD // ORIGINAL', sheetX + sheetW - innerMarginX - 2, archLineY - 3);
  }

  // 2. Metallic Typewriter Paper-Bail Scale Bar (extends 6px past left/right sheet edges)
  const barX = sheetX - 6;
  const barW = sheetW + 12;

  // Cast shadow of the metallic ruler bar onto the paper sheet
  ctx.fillStyle = isGreen ? '#141210' : 'rgba(15, 10, 5, 0.34)';
  ctx.fillRect(sheetX, rulerY + rulerH, sheetW, Math.max(3, Math.round(rulerH * 0.28)));

  // Brushed steel/chrome cylinder gradient
  const metalGrad = ctx.createLinearGradient(0, rulerY, 0, rulerY + rulerH);
  metalGrad.addColorStop(0, '#1E232A');
  metalGrad.addColorStop(0.25, '#64748B');
  metalGrad.addColorStop(0.45, '#CBD5E1');
  metalGrad.addColorStop(0.7, '#334155');
  metalGrad.addColorStop(1, '#14181F');
  ctx.fillStyle = metalGrad;
  ctx.beginPath();
  ctx.roundRect(barX, rulerY, barW, rulerH, 3);
  ctx.fill();

  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 1;
  ctx.stroke();

  // White engraved typewriter scale tick marks along the bottom half of the bar
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.78)';
  ctx.lineWidth = 1;
  const tickStart = sheetX + innerMarginX;
  const tickEnd = sheetX + sheetW - innerMarginX;
  const tickStep = 8;
  ctx.beginPath();
  for (let tx = tickStart, idx = 0; tx <= tickEnd; tx += tickStep, idx++) {
    const isMajor = idx % 5 === 0;
    const tickTop = isMajor ? rulerY + rulerH * 0.32 : rulerY + rulerH * 0.58;
    ctx.moveTo(tx, tickTop);
    ctx.lineTo(tx, rulerY + rulerH - 1);
  }
  ctx.stroke();

  // Sliding metallic margin stoppers with crimson pointers
  const stopPositions = [tickStart + 16, tickEnd - 16];
  for (const sx of stopPositions) {
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(sx - 5, rulerY - 2, 10, rulerH + 4);
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - 5, rulerY - 2, 10, rulerH + 4);

    // Red margin pointer triangle
    ctx.fillStyle = OLD_TYPEWRITER_CONFIG.colors.ribbonRed;
    ctx.beginPath();
    ctx.moveTo(sx - 3.5, rulerY + rulerH + 2);
    ctx.lineTo(sx + 3.5, rulerY + rulerH + 2);
    ctx.lineTo(sx, rulerY + rulerH + 7);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draws the realistic metallic V-notch typewriter type-guide & ribbon carrier cursor
 * at the active typing edge, plus an instant hammer-strike imprint ring on keystrokes.
 */
function drawTypewriterTypeGuideCursor(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cursorX: number,
  cursorTopY: number,
  cursorH: number,
  strikePulse: number,
  isLtr: boolean
) {
  const cx = isLtr ? Math.round(cursorX + 3) : Math.round(cursorX - 3);
  const baselineY = Math.round(cursorTopY + cursorH * 0.88);
  const topY = Math.round(cursorTopY);

  ctx.save();

  // 1. Instant mechanical typebar impact ring & ribbon flash when a key is struck
  if (strikePulse > 0.02) {
    const impactX = isLtr ? cx - 6 : cx + 6;
    const impactY = Math.round(cursorTopY + cursorH * 0.52);
    const ringR = cursorH * (0.28 + (1 - strikePulse) * 0.16);

    ctx.save();
    ctx.globalAlpha = strikePulse * 0.45;
    ctx.strokeStyle = OLD_TYPEWRITER_CONFIG.colors.inkDark;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(impactX, impactY, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Vertical dark steel alignment bar
  ctx.fillStyle = '#1E242B';
  ctx.fillRect(cx - 1.5, topY + 2, 3, cursorH - 4);

  // Specular metallic highlight down the center of the bar
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(cx - 0.5, topY + 3, 1, cursorH - 6);

  // 3. Classic V-Notch Type-Guide Fork below the baseline
  const forkY = baselineY + 4;
  const forkW = Math.max(12, Math.round(cursorH * 0.34));
  const forkH = Math.max(10, Math.round(cursorH * 0.28));

  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - forkW * 0.5, forkY + forkH);
  ctx.lineTo(cx - forkW * 0.22, forkY);
  ctx.lineTo(cx, forkY + forkH * 0.42);
  ctx.lineTo(cx + forkW * 0.22, forkY);
  ctx.lineTo(cx + forkW * 0.5, forkY + forkH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 4. Red calibration pointer tick at the top of the cursor
  ctx.fillStyle = OLD_TYPEWRITER_CONFIG.colors.ribbonRed;
  ctx.beginPath();
  ctx.moveTo(cx - 4, topY - 2);
  ctx.lineTo(cx + 4, topY - 2);
  ctx.lineTo(cx, topY + 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Builds or retrieves a cached line sprite for Old Typewriter:
 * - Draws each word intact (letters stay 100% connected)
 * - Applies seeded per-word irregularity (alpha 0.88-1.0, baseline ±1px, rotation ±0.3°, word-level only)
 * - Includes an embossed paper highlight, a slightly blurred ink-bleed pass, and a double-density carbon ribbon pass
 */
function getCachedTypewriterLineSprite(
  line: PositionedLine,
  fontFamily: StudioFontFamily,
  fontSize: number,
  inkColor: string,
  keywordColor: string,
  seed: number,
  direction: ResolvedTextDirection = 'rtl'
): {
  canvas: HTMLCanvasElement;
  padX: number;
  padY: number;
  spriteW: number;
  spriteH: number;
} {
  const padX = Math.ceil(fontSize * 0.65);
  const padY = Math.ceil(fontSize * 0.55);
  const lineSpanW = Math.max(16, Math.ceil(line.rightX - line.leftX));
  const lineSpanH = Math.max(16, Math.ceil(line.bottomY - line.topY));
  const spriteW = lineSpanW + padX * 2;
  const spriteH = lineSpanH + padY * 2;

  const key = `tw-line-v2|${fontFamily}|${fontSize}|${inkColor}|${keywordColor}|${direction}|${seed}|${line.words
    .map((w) => `${w.globalWordIndex}:${w.text}:${w.isKeyword ? 1 : 0}:${Math.round(w.x - line.leftX)}`)
    .join('_')}`;

  const canvas = getOrGenerateCachedCanvas(key, spriteW, spriteH, (sCtx) => {
    const baseY = padY + (line.y - line.topY);

    for (const w of line.words) {
      const rng = mulberry32(combineSeed(seed, 7500 + w.globalWordIndex * 53));
      const wordAlpha = 0.88 + rng() * 0.12; // 0.88 - 1.0
      const baselineShift = (rng() * 2 - 1) * 1.0; // ±1px
      const rotRad = ((rng() * 2 - 1) * 0.3 * Math.PI) / 180; // ±0.3°

      const localRightX = padX + (w.x - line.leftX);
      const wordCenterX = localRightX - w.width * 0.5;
      const wordY = baseY + baselineShift;
      const color = w.isKeyword ? keywordColor : inkColor;

      // 1. Subtle embossed paper indentation highlight beneath keystroke
      sCtx.save();
      sCtx.translate(wordCenterX, wordY + 1.0);
      sCtx.rotate(rotRad);
      applyStudioCanvasTextProps(sCtx, fontFamily, 700, fontSize, direction);
      sCtx.textAlign = 'right';
      sCtx.globalAlpha = 0.42;
      sCtx.fillStyle = '#FFFDF7';
      sCtx.fillText(w.text, w.width * 0.5, 0);
      sCtx.restore();

      // 2. Slightly blurred carbon ribbon ink-bleed halo at low alpha
      sCtx.save();
      sCtx.translate(wordCenterX, wordY);
      sCtx.rotate(rotRad);
      try {
        sCtx.filter = 'blur(1.4px)';
      } catch {
        // Ignore if filter unsupported
      }
      applyStudioCanvasTextProps(sCtx, fontFamily, 700, fontSize, direction);
      sCtx.textAlign = 'right';
      sCtx.globalAlpha = wordAlpha * 0.28;
      sCtx.fillStyle = color;
      sCtx.fillText(w.text, w.width * 0.5, 0);
      sCtx.restore();

      // 3. Crisp primary carbon ribbon impression pass + micro-offset fabric texture pass
      sCtx.save();
      sCtx.translate(wordCenterX, wordY);
      sCtx.rotate(rotRad);
      applyStudioCanvasTextProps(sCtx, fontFamily, 700, fontSize, direction);
      sCtx.textAlign = 'right';
      sCtx.globalAlpha = wordAlpha;
      sCtx.fillStyle = color;
      sCtx.fillText(w.text, w.width * 0.5, 0);

      // Secondary micro-offset carbon strike for heavy ribbon richness
      sCtx.globalAlpha = wordAlpha * 0.32;
      sCtx.fillText(w.text, w.width * 0.5 + 0.45, -0.35);
      sCtx.restore();
    }
  });

  return { canvas, padX, padY, spriteW, spriteH };
}

export function getOldTypewriterEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const { baseWidth: W, baseHeight: H } = size;
  const isHorizontal = custom.format === '16:9';
  const typingSpeed = clamp(custom.typingSpeed ?? 18, 8, 30);
  const typingStartSec = OLD_TYPEWRITER_CONFIG.timings.typingStartSec;

  const direction = resolveTextDirection(custom, content.quoteText);
  const geom = getTypewriterSheetGeometry(custom.position, custom.format, W, H, direction);
  const defaultFont =
    direction === 'ltr'
      ? OLD_TYPEWRITER_CONFIG.defaultEnglishQuoteFont
      : OLD_TYPEWRITER_CONFIG.defaultQuoteFont;
  const font = custom.quoteFontOverride || defaultFont;

  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: font,
    fontWeight: 700,
    minFontSize: geom.isFullscreen ? (isHorizontal ? 48 : 40) : isHorizontal ? 32 : 28,
    maxFontSize: geom.isFullscreen ? (isHorizontal ? 104 : 86) : isHorizontal ? 68 : 56,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: OLD_TYPEWRITER_CONFIG.lineHeightRatio,
    boxX: geom.textBoxX,
    boxY: geom.textBoxY,
    boxWidth: geom.textBoxW,
    boxHeight: geom.textBoxH,
    align: geom.align,
    direction,
  });

  const schedule = computeTypingScheduleForLayout(
    ctx,
    layout,
    typingStartSec,
    typingSpeed,
    OLD_TYPEWRITER_CONFIG.timings.carriageReturnGapSec
  );

  void timeline;

  return {
    enterStart: typingStartSec,
    keywordTimes: schedule.keywordTimes,
    keystrokeTimes: schedule.keystrokeTimes,
    lineEndTimes: schedule.lineEndTimes,
    isMechanicalTypewriter: true,
  };
}

export const renderOldTypewriter: PureStyleRenderer = (
  ctx,
  t,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
) => {
  const { baseWidth: W, baseHeight: H } = size;
  const isHorizontal = custom.format === '16:9';
  const bgMode = resolveBackgroundMode(custom);
  // Black mode is disabled for old_typewriter; treat green or any solid mode as green screen
  const isGreen = bgMode === 'green' || bgMode === 'black';

  const typingSpeed = clamp(custom.typingSpeed ?? 18, 8, 30);
  const typingStartSec = OLD_TYPEWRITER_CONFIG.timings.typingStartSec;

  const direction = resolveTextDirection(custom, content.quoteText);
  const isLtr = direction === 'ltr';
  const geom = getTypewriterSheetGeometry(custom.position, custom.format, W, H, direction);
  const defaultFont = isLtr
    ? OLD_TYPEWRITER_CONFIG.defaultEnglishQuoteFont
    : OLD_TYPEWRITER_CONFIG.defaultQuoteFont;
  const font = custom.quoteFontOverride || defaultFont;

  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: font,
    fontWeight: 700,
    minFontSize: geom.isFullscreen ? (isHorizontal ? 48 : 40) : isHorizontal ? 32 : 28,
    maxFontSize: geom.isFullscreen ? (isHorizontal ? 104 : 86) : isHorizontal ? 68 : 56,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: OLD_TYPEWRITER_CONFIG.lineHeightRatio,
    boxX: geom.textBoxX,
    boxY: geom.textBoxY,
    boxWidth: geom.textBoxW,
    boxHeight: geom.textBoxH,
    align: geom.align,
    direction,
  });

  const { exitStart, total } = getEffectiveTimeline(
    timeline,
    content.quoteText,
    'phrase',
    OLD_TYPEWRITER_CONFIG.timings.underlineDurSec + 0.1,
    {
      isTypingStyle: true,
      typingSpeed,
      typingStartSec,
      lineBreakGapSec: OLD_TYPEWRITER_CONFIG.timings.carriageReturnGapSec,
      estimatedLineBreaks: Math.max(0, layout.lines.length - 1),
    }
  );

  const schedule = computeTypingScheduleForLayout(
    ctx,
    layout,
    typingStartSec,
    typingSpeed,
    OLD_TYPEWRITER_CONFIG.timings.carriageReturnGapSec
  );

  const inkColor =
    custom.accentColor && custom.accentColor !== '#6FA8FF'
      ? custom.accentColor
      : OLD_TYPEWRITER_CONFIG.colors.inkDark;
  const keywordColor = custom.keywordColor || OLD_TYPEWRITER_CONFIG.colors.ribbonRed;

  // 1. Background: Dark wood/desk #241912 with warm lamp pool OR Chroma Key Green #00FF00
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else {
    const deskBg = getCachedWoodDeskBackdrop(W, H, custom.seed);
    ctx.drawImage(deskBg, 0, 0, W, H);
  }

  // 2. Paper sheet enter/exit motion + 1-2° seeded tilt + keystroke shake + carriage-return nudge
  const enterP = easeOutQuart(progress(t, 0, typingStartSec));
  const exitP = easeInCubic(progress(t, exitStart, total));
  const sheetAlpha = isGreen ? (exitP < 0.92 ? 1 : 0) : 1 - exitP;

  if (sheetAlpha <= 0.005) {
    ctx.restore();
    return;
  }

  const sheetRng = mulberry32(combineSeed(custom.seed, 7301));
  const tiltSign = sheetRng() > 0.5 ? 1 : -1;
  const tiltDeg = tiltSign * (1.0 + sheetRng() * 0.85); // 1° to 1.85° tilt
  const tiltRad = (tiltDeg * Math.PI) / 180;

  // Tiny seeded paper shake (~1.3px, fast decay) + strike pulse on each keystroke
  let shakeX = 0;
  let shakeY = 0;
  let strikePulse = 0;
  for (let sIdx = schedule.allSteps.length - 1; sIdx >= 0; sIdx--) {
    const st = schedule.allSteps[sIdx];
    if (t >= st.time) {
      const dt = t - st.time;
      if (dt >= 0 && dt < 0.055) {
        const decay = 1 - dt / 0.055;
        strikePulse = decay;
        const kRng = mulberry32(combineSeed(custom.seed, 7800 + sIdx * 19));
        shakeX = (kRng() * 2 - 1) * 1.35 * decay;
        shakeY = (kRng() * 2 - 1) * 1.25 * decay;
      }
      break;
    }
  }

  // Quick carriage-return nudge at each line end
  let carriageNudgeX = 0;
  for (let lIdx = 0; lIdx < schedule.lineEndTimes.length - 1; lIdx++) {
    const endT = schedule.lineEndTimes[lIdx];
    const dt = t - endT;
    if (dt >= 0 && dt < OLD_TYPEWRITER_CONFIG.timings.carriageReturnGapSec) {
      const p = dt / OLD_TYPEWRITER_CONFIG.timings.carriageReturnGapSec;
      carriageNudgeX = (isLtr ? -1 : 1) * Math.sin(p * Math.PI) * 6.5;
      break;
    }
  }

  const slideInOffsetY = (1 - enterP) * (H * 0.22);
  const slideOutOffsetY = -exitP * (H * 0.26);

  const sheetCenterX = geom.sheetX + geom.sheetW * 0.5;
  const sheetCenterY = geom.sheetY + geom.sheetH * 0.5;

  ctx.save();
  ctx.globalAlpha = sheetAlpha;
  ctx.translate(
    sheetCenterX + shakeX + carriageNudgeX,
    sheetCenterY + slideInOffsetY + slideOutOffsetY + shakeY
  );
  ctx.rotate(tiltRad);
  ctx.translate(-sheetCenterX, -sheetCenterY);

  // Draw paper sheet shadow (hard offset shadow in green mode, deep layered shadow in style mode)
  if (isGreen) {
    ctx.fillStyle = '#141210';
    ctx.fillRect(geom.sheetX + 12, geom.sheetY + 12, geom.sheetW, geom.sheetH);
  } else {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 5, 3, 0.52)';
    try {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.62)';
      ctx.shadowBlur = 32;
      ctx.shadowOffsetX = 8;
      ctx.shadowOffsetY = 18;
    } catch {
      // Ignore if shadow unsupported
    }
    ctx.fillRect(geom.sheetX, geom.sheetY, geom.sheetW, geom.sheetH);
    ctx.restore();
  }

  // Draw cached archival cream paper sheet (#F1E8D2 with cotton laid lines & fibers)
  const paperCanvas = getCachedTypewriterPaperSheet(geom.sheetW, geom.sheetH, custom.seed);
  ctx.drawImage(paperCanvas, geom.sheetX, geom.sheetY, geom.sheetW, geom.sheetH);

  // Draw Archival Header & Metallic Typewriter Paper-Bail Scale Bar
  drawArchivalHeaderAndMetallicRuler(
    ctx,
    geom.sheetX,
    geom.sheetY,
    geom.sheetW,
    geom.headerBandH,
    custom.seed,
    isGreen
  );

  // 3. Stepped Directional Cached Line Reveal + Metallic Type-Guide Cursor
  let cursorX: number | null = null;
  let cursorTopY: number = 0;
  let cursorH: number = layout.fontSize * 0.94;

  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];
    const lineSched = schedule.lines[i];
    if (!lineSched) continue;

    const evalState = evaluateLineTypingAtTime(line, lineSched, t, direction);
    if (!evalState.hasStarted) {
      if (i === 0 && t >= typingStartSec * 0.7 && cursorX === null) {
        cursorX = isLtr ? line.leftX : line.rightX;
        cursorTopY = line.y - layout.fontSize * 0.8;
        cursorH = layout.fontSize * 0.92;
      }
      continue;
    }

    const sprite = getCachedTypewriterLineSprite(
      line,
      font,
      layout.fontSize,
      inkColor,
      keywordColor,
      custom.seed,
      direction
    );

    const spriteDrawX = line.leftX - sprite.padX;
    const spriteDrawY = line.topY - sprite.padY;

    let clipLeftX: number;
    let clipRightX: number;

    if (isLtr) {
      clipLeftX = spriteDrawX;
      clipRightX = evalState.isFinished
        ? line.rightX + sprite.padX
        : Math.ceil(evalState.revealedRightX);
    } else {
      clipLeftX = evalState.isFinished
        ? spriteDrawX
        : Math.floor(evalState.revealedLeftX);
      clipRightX = line.rightX + sprite.padX;
    }

    const clipW = Math.max(0, clipRightX - clipLeftX);

    if (clipW > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(clipLeftX, spriteDrawY, clipW, sprite.spriteH);
      ctx.clip();
      ctx.drawImage(sprite.canvas, spriteDrawX, spriteDrawY);
      ctx.restore();
    }

    // Track cursor at leading edge of the revealed area
    const nextLineSched = i + 1 < schedule.lines.length ? schedule.lines[i + 1] : null;
    const nextLineStarted = nextLineSched ? t >= nextLineSched.startTime : false;
    if (!evalState.isFinished || !nextLineStarted) {
      cursorX = isLtr ? evalState.revealedRightX : evalState.revealedLeftX;
      cursorTopY = line.y - layout.fontSize * 0.8;
      cursorH = layout.fontSize * 0.92;
    }
  }

  // 4. Hand-typed red ribbon underline drawn after each keyword is typed (LTR or RTL)
  for (let rIdx = 0; rIdx < layout.keywordLineRects.length; rIdx++) {
    const rect = layout.keywordLineRects[rIdx];
    const finishT = schedule.rectFinishTimes[rIdx] ?? typingStartSec;
    if (t <= finishT) continue;

    const uProg = easeOutCubic(
      progress(t, finishT + 0.02, finishT + 0.02 + OLD_TYPEWRITER_CONFIG.timings.underlineDurSec)
    );
    if (uProg <= 0.01) continue;

    // Stepped keystroke-like underline progress (8-12 discrete typewriter underscore strikes)
    const strikeSteps = Math.max(6, Math.round(rect.width / 18));
    const steppedProg = Math.ceil(uProg * strikeSteps) / strikeSteps;
    const curW = rect.width * clamp(steppedProg, 0, 1);
    const uY = rect.baselineY + layout.fontSize * 0.16;
    const thickness = Math.max(3, Math.round(layout.fontSize * 0.065));
    const uX = isLtr ? rect.leftX : rect.rightX - curW;

    ctx.save();
    ctx.fillStyle = keywordColor;
    ctx.globalAlpha *= 0.92;
    ctx.fillRect(uX, uY, curW, thickness);
    // Second faint double-strike ribbon offset
    ctx.globalAlpha *= 0.58;
    ctx.fillRect(uX, uY + thickness + 1.5, curW, Math.max(1.5, thickness * 0.5));
    ctx.restore();
  }

  // 5. Metallic V-Notch Typewriter Type-Guide Cursor & Strike Imprint at leading edge
  if (cursorX !== null && exitP < 0.4) {
    drawTypewriterTypeGuideCursor(ctx, cursorX, cursorTopY, cursorH, strikePulse, isLtr);
  }

  ctx.restore();
  ctx.restore();
};

