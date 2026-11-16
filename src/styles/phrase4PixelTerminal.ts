import {
  ArabicFontFamily,
  BackgroundMode,
  PixelDensity,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  StyleLightPalette,
  TimelineConfig,
} from '../types';
import {
  createBufferCanvas,
  getCachedLcdScanlineOverlay,
  getCachedPixelTerminalBackdrop,
  getOrGenerateCachedCanvas,
} from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeOutCubic,
  easeOutQuart,
  getEffectiveTimeline,
  getPhrasePositionBox,
  hexToRgba,
  lerp,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
} from '../utils/math';
import { combineSeed, deterministicWave, mulberry32 } from '../utils/random';
import {
  applyArabicCanvasTextProps,
  applyStudioCanvasTextProps,
  computeTypingScheduleForLayout,
  evaluateLineTypingAtTime,
  layoutArabicQuote,
  PositionedLine,
} from '../utils/textLayout';

export const PIXEL_TERMINAL_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#D8F3FF',
  textSecondary: '#7CE4FF',
  accent: '#4DD8FF',
  keyword: '#FFB000',
  border: '#4DD8FF',
};

export const PIXEL_TERMINAL_CONFIG = {
  id: 'pixel_terminal' as const,
  mode: 'phrase' as const,
  nameAr: 'شاشة كمبيوتر سينمائية',
  nameEn: 'Pixel Terminal',
  descriptionAr:
    'نافذة طرفية سينمائية ببكسلات ريترو وتوهج CRT ومؤشر وامض مع كتابة متصلة حرفاً بحرف',
  defaultAccent: '#4DD8FF',
  defaultKeywordColor: '#FFB000',
  defaultQuoteFont: 'Noto Kufi Arabic' as ArabicFontFamily,
  defaultAuthorFont: 'Noto Kufi Arabic' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Share Tech Mono' as const,
  defaultEnglishAuthorFont: 'Share Tech Mono' as const,
  supportedBackgrounds: ['style', 'black'] as BackgroundMode[],
  recommendedBackground: 'black' as BackgroundMode,
  lightPalette: PIXEL_TERMINAL_LIGHT_PALETTE,
  allowedFonts: [
    'Noto Kufi Arabic',
    'Reem Kufi',
    'IBM Plex Sans Arabic',
    'Cairo',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
  ] as ArabicFontFamily[],
  colors: {
    bgDarkBlue: '#05070D',
    panelFill: 'rgba(7, 13, 24, 0.86)',
    titleBarFill: 'rgba(13, 25, 43, 0.94)',
    textPrimary: '#D8F3FF',
    cursorCyan: '#4DD8FF',
    keywordAmber: '#FFB000',
    dimHeader: '#5FB8D6',
  },
  timings: {
    baseTypingStart: 0.34,
    bootTypingStart: 0.56,
    lineBreakGapSec: 0.1,
    cursorBlinkMs: 530,
  },
  lineHeightRatio: 1.75,
};

function getTerminalGeometry(
  pos: StyleCustomization['position'],
  format: StyleCustomization['format'],
  W: number,
  H: number,
  showBootLine: boolean,
  direction: ResolvedTextDirection = 'rtl'
) {
  const posBox = getPhrasePositionBox(pos || 'center', format, W, H, direction);
  const isFullscreen = (pos || 'center') === 'fullscreen';
  const winX = posBox.boxX;
  const winY = posBox.boxY;
  const winW = posBox.boxWidth;
  const winH = posBox.boxHeight;

  const titleBarH = isFullscreen ? 46 : 38;
  const headerH = showBootLine ? 34 : 26;
  const padX = Math.max(24, Math.round(winW * 0.065));
  const padBottom = Math.max(18, Math.round(winH * 0.06));

  const textBoxX = winX + padX;
  const textBoxY = winY + titleBarH + headerH + 8;
  const textBoxW = Math.max(120, winW - padX * 2);
  const textBoxH = Math.max(72, winH - titleBarH - headerH - padBottom - 8);

  return {
    posBox,
    isFullscreen,
    winX,
    winY,
    winW,
    winH,
    titleBarH,
    headerH,
    textBoxX,
    textBoxY,
    textBoxW,
    textBoxH,
    align: posBox.align,
  };
}

function getPixelDensityFontBoost(density: PixelDensity): number {
  if (density === 4) return 1.18;
  if (density === 3) return 1.1;
  return 1.0;
}

/**
 * Builds or retrieves a cached crisp line sprite and a cached blurred bloom sprite for a single line.
 * Full words are drawn intact so Arabic letters remain 100% connected.
 */
function getCachedTerminalLineSprites(
  line: PositionedLine,
  fontFamily: string,
  fontSize: number,
  textColor: string,
  keywordColor: string,
  direction: ResolvedTextDirection = 'rtl'
): {
  crispCanvas: HTMLCanvasElement;
  bloomCanvas: HTMLCanvasElement;
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
  const baseKey = `term-line|${fontFamily}|${fontSize}|${textColor}|${keywordColor}|${direction}|${line.words
    .map((w) => `${w.text}:${w.isKeyword ? 1 : 0}:${Math.round(w.x - line.leftX)}`)
    .join('_')}`;

  const crispCanvas = getOrGenerateCachedCanvas(`${baseKey}|crisp`, spriteW, spriteH, (sCtx) => {
    applyStudioCanvasTextProps(sCtx, fontFamily, 700, fontSize, direction);
    sCtx.textAlign = 'right';
    const baseY = padY + (line.y - line.topY);

    for (const w of line.words) {
      const localRightX = padX + (w.x - line.leftX);
      sCtx.fillStyle = w.isKeyword ? keywordColor : textColor;
      sCtx.fillText(w.text, localRightX, baseY);
    }
  });

  const bloomCanvas = getOrGenerateCachedCanvas(`${baseKey}|bloom`, spriteW, spriteH, (sCtx) => {
    sCtx.save();
    try {
      sCtx.filter = 'blur(7px)';
    } catch {
      // Fallback if filter unsupported
    }
    applyStudioCanvasTextProps(sCtx, fontFamily, 700, fontSize, direction);
    sCtx.textAlign = 'right';
    const baseY = padY + (line.y - line.topY);

    for (const w of line.words) {
      const localRightX = padX + (w.x - line.leftX);
      sCtx.fillStyle = w.isKeyword ? keywordColor : textColor;
      sCtx.fillText(w.text, localRightX, baseY);
      if (w.isKeyword) {
        // Extra amber bloom pass on keywords
        sCtx.fillText(w.text, localRightX, baseY);
      }
    }
    sCtx.restore();
  });

  return { crispCanvas, bloomCanvas, padX, padY, spriteW, spriteH };
}

let pixelOffscreenBuffer: HTMLCanvasElement | null = null;

export function getPixelTerminalEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const { baseWidth: W, baseHeight: H } = size;
  const isHorizontal = custom.format === '16:9';
  const showBoot = Boolean(custom.terminalBootLine);
  const typingSpeed = clamp(custom.typingSpeed ?? 18, 8, 30);
  const density: PixelDensity = custom.pixelDensity ?? 2;
  const densityBoost = getPixelDensityFontBoost(density);
  const typingStartSec = showBoot
    ? PIXEL_TERMINAL_CONFIG.timings.bootTypingStart
    : PIXEL_TERMINAL_CONFIG.timings.baseTypingStart;

  const direction = resolveTextDirection(custom, content.quoteText);
  const geom = getTerminalGeometry(custom.position, custom.format, W, H, showBoot, direction);
  const defaultFont = direction === 'ltr' ? PIXEL_TERMINAL_CONFIG.defaultEnglishQuoteFont || 'Share Tech Mono' : PIXEL_TERMINAL_CONFIG.defaultQuoteFont;
  const font = custom.quoteFontOverride || defaultFont;

  const baseMinFont = geom.isFullscreen ? (isHorizontal ? 48 : 40) : isHorizontal ? 32 : 28;
  const baseMaxFont = geom.isFullscreen ? (isHorizontal ? 104 : 86) : isHorizontal ? 70 : 58;

  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: font,
    fontWeight: 700,
    minFontSize: Math.round(baseMinFont * densityBoost),
    maxFontSize: Math.round(baseMaxFont * densityBoost),
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: PIXEL_TERMINAL_CONFIG.lineHeightRatio,
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
    PIXEL_TERMINAL_CONFIG.timings.lineBreakGapSec
  );

  // Maintain unused timeline reference for consistency
  void timeline;

  return {
    enterStart: typingStartSec,
    keywordTimes: schedule.keywordTimes,
    keystrokeTimes: schedule.keystrokeTimes,
    lineEndTimes: schedule.lineEndTimes,
    isMechanicalTypewriter: false,
  };
}

export const renderPixelTerminal: PureStyleRenderer = (
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
  // Green is unsupported for pixel_terminal; treat any solid mode as black screen
  const isBlackMode = bgMode === 'black' || bgMode === 'green';

  const showBoot = Boolean(custom.terminalBootLine);
  const typingSpeed = clamp(custom.typingSpeed ?? 18, 8, 30);
  const density: PixelDensity = custom.pixelDensity ?? 2;
  const densityBoost = getPixelDensityFontBoost(density);
  const typingStartSec = showBoot
    ? PIXEL_TERMINAL_CONFIG.timings.bootTypingStart
    : PIXEL_TERMINAL_CONFIG.timings.baseTypingStart;

  const direction = resolveTextDirection(custom, content.quoteText);
  const geom = getTerminalGeometry(custom.position, custom.format, W, H, showBoot, direction);
  const defaultFont =
    direction === 'ltr'
      ? PIXEL_TERMINAL_CONFIG.defaultEnglishQuoteFont || 'Share Tech Mono'
      : PIXEL_TERMINAL_CONFIG.defaultQuoteFont;
  const font = custom.quoteFontOverride || defaultFont;

  const baseMinFont = geom.isFullscreen ? (isHorizontal ? 48 : 40) : isHorizontal ? 32 : 28;
  const baseMaxFont = geom.isFullscreen ? (isHorizontal ? 104 : 86) : isHorizontal ? 70 : 58;

  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: font,
    fontWeight: 700,
    minFontSize: Math.round(baseMinFont * densityBoost),
    maxFontSize: Math.round(baseMaxFont * densityBoost),
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: PIXEL_TERMINAL_CONFIG.lineHeightRatio,
    boxX: geom.textBoxX,
    boxY: geom.textBoxY,
    boxWidth: geom.textBoxW,
    boxHeight: geom.textBoxH,
    align: geom.align,
    direction,
  });

  const { enter, exitStart, total } = getEffectiveTimeline(
    timeline,
    content.quoteText,
    'phrase',
    0.25,
    {
      isTypingStyle: true,
      typingSpeed,
      typingStartSec,
      lineBreakGapSec: PIXEL_TERMINAL_CONFIG.timings.lineBreakGapSec,
      estimatedLineBreaks: Math.max(0, layout.lines.length - 1),
    }
  );

  const schedule = computeTypingScheduleForLayout(
    ctx,
    layout,
    typingStartSec,
    typingSpeed,
    PIXEL_TERMINAL_CONFIG.timings.lineBreakGapSec
  );

  const accentColor = custom.accentColor || PIXEL_TERMINAL_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || PIXEL_TERMINAL_CONFIG.defaultKeywordColor;
  const textColor = PIXEL_TERMINAL_CONFIG.colors.textPrimary;

  // CRT Exit Collapse calculation
  const exitP = progress(t, exitStart, total);
  const crtCollapseY =
    exitP <= 0
      ? 1
      : exitP < 0.58
        ? lerp(1, 0.014, easeInCubic(exitP / 0.58))
        : 0.014;
  const crtCollapseX =
    exitP <= 0.58
      ? lerp(1, 1.06, easeOutCubic(exitP / 0.58))
      : lerp(1.06, 0.0, easeInCubic((exitP - 0.58) / 0.42));
  const exitFade = exitP <= 0.55 ? 1 : 1 - easeInCubic((exitP - 0.55) / 0.45);

  // Subtle seeded CRT flicker
  const flickerWave = deterministicWave(t, combineSeed(custom.seed, 4401), 19.5);
  const crtFlicker = 0.97 + 0.03 * flickerWave;

  // Power-on window enter + brief flicker
  const winEnterP = easeOutQuart(progress(t, 0.04, typingStartSec * 0.92));
  let powerOnFlicker = 1;
  if (t >= 0.06 && t < 0.24) {
    const fStep = Math.floor((t - 0.06) * 45);
    powerOnFlicker = fStep % 2 === 0 ? 1 : 0.42;
  }
  const windowAlpha = clamp(winEnterP * powerOnFlicker * exitFade * crtFlicker, 0, 1);

  ctx.save();

  // 1. Background Layer
  if (isBlackMode) {
    // Black (Screen) mode: flat pure #000000, no panel fill, scanlines, vignette, dust, or letterbox bars
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    // Style background: near-black blue #05070D with slow push-in (1.0 -> 1.06), monitor spill & vignette
    const pushZoom = lerp(1.0, 1.06, clamp(t / Math.max(0.1, total), 0, 1));
    const backdrop = getCachedPixelTerminalBackdrop(W, H, accentColor);

    ctx.save();
    ctx.translate(W * 0.5, H * 0.5);
    ctx.scale(pushZoom, pushZoom);
    ctx.drawImage(backdrop, -W * 0.5, -H * 0.5, W, H);

    // Faint floating monitor dust motes
    const dustRng = mulberry32(combineSeed(custom.seed, 4420));
    ctx.fillStyle = hexToRgba(accentColor, 0.2 * exitFade);
    for (let i = 0; i < 24; i++) {
      const bx = (dustRng() - 0.5) * W * 0.88;
      const by = (dustRng() - 0.5) * H * 0.82;
      const driftX = Math.sin(t * (0.4 + dustRng() * 0.5) + i) * 18;
      const driftY = -t * (6 + dustRng() * 10);
      const r = 1 + dustRng() * 1.8;
      ctx.beginPath();
      ctx.arc(bx + driftX, ((by + driftY + H) % H) - H * 0.5, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 2. Render Terminal Window + Text (either via 1/N pixelation buffer or direct when density === 1)
  const drawTerminalScene = (
    targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    drawPass: 'crisp' | 'bloom'
  ) => {
    if (windowAlpha <= 0.005) return;

    const winCenterX = geom.winX + geom.winW * 0.5;
    const winCenterY = geom.winY + geom.winH * 0.5;
    const enterScale = lerp(0.93, 1.0, winEnterP);

    targetCtx.save();
    targetCtx.globalAlpha = windowAlpha;
    targetCtx.translate(winCenterX, winCenterY);
    targetCtx.scale(enterScale * crtCollapseX, enterScale * crtCollapseY);
    targetCtx.translate(-winCenterX, -winCenterY);

    if (drawPass === 'crisp') {
      // Window frame & title bar
      if (!isBlackMode) {
        targetCtx.fillStyle = PIXEL_TERMINAL_CONFIG.colors.panelFill;
        targetCtx.beginPath();
        targetCtx.roundRect(geom.winX, geom.winY, geom.winW, geom.winH, 10);
        targetCtx.fill();

        // Title bar fill
        targetCtx.fillStyle = PIXEL_TERMINAL_CONFIG.colors.titleBarFill;
        targetCtx.beginPath();
        targetCtx.roundRect(geom.winX, geom.winY, geom.winW, geom.titleBarH, [10, 10, 0, 0]);
        targetCtx.fill();
      }

      // Thin cyan border (bright in both style and black mode)
      targetCtx.strokeStyle = accentColor;
      targetCtx.lineWidth = isBlackMode ? 2.5 : 2;
      targetCtx.beginPath();
      targetCtx.roundRect(geom.winX, geom.winY, geom.winW, geom.winH, 10);
      targetCtx.stroke();

      // Divider line under title bar
      targetCtx.beginPath();
      targetCtx.moveTo(geom.winX, geom.winY + geom.titleBarH);
      targetCtx.lineTo(geom.winX + geom.winW, geom.winY + geom.titleBarH);
      targetCtx.stroke();

      // Three terminal window dots on the left of the title bar
      const dotY = geom.winY + geom.titleBarH * 0.5;
      const dotColors = isBlackMode
        ? [accentColor, keywordColor, textColor]
        : ['#FF5F56', '#FFBD2E', '#27C93F'];
      for (let d = 0; d < 3; d++) {
        targetCtx.fillStyle = dotColors[d];
        targetCtx.beginPath();
        targetCtx.arc(geom.winX + 22 + d * 20, dotY, 5.5, 0, Math.PI * 2);
        targetCtx.fill();
      }

      // Small dim LTR Latin header "> input" (and optional boot line) — isolated so RTL layout is untouched
      targetCtx.save();
      targetCtx.direction = 'ltr';
      targetCtx.textAlign = 'left';
      targetCtx.textBaseline = 'alphabetic';
      const headerFontPx = geom.isFullscreen ? 18 : 15;
      targetCtx.font = `600 ${headerFontPx}px monospace`;
      targetCtx.fillStyle = isBlackMode ? accentColor : PIXEL_TERMINAL_CONFIG.colors.dimHeader;

      const headerLeftX = geom.winX + 20;
      const headerBaseY = geom.winY + geom.titleBarH + headerFontPx + 6;
      if (showBoot) {
        const bootProg = progress(t, 0.12, typingStartSec - 0.04);
        const fullBootStr = '> SYS.BOOT_RTL_ENGINE [OK]   > input';
        const bootChars = Math.max(1, Math.floor(fullBootStr.length * bootProg));
        targetCtx.fillText(fullBootStr.slice(0, bootChars), headerLeftX, headerBaseY);
      } else {
        targetCtx.fillText('> input', headerLeftX, headerBaseY);
      }
      targetCtx.restore();
    } else {
      // Bloom pass for window border
      targetCtx.strokeStyle = hexToRgba(accentColor, 0.35);
      targetCtx.lineWidth = 6;
      targetCtx.beginPath();
      targetCtx.roundRect(geom.winX, geom.winY, geom.winW, geom.winH, 10);
      targetCtx.stroke();
    }

    // 3. Stepped Line Reveal + Cursor at Leading Edge
    let cursorX: number | null = null;
    let cursorTopY: number = 0;
    let cursorH: number = layout.fontSize;
    let isActivelyTypingNow = false;
    const isLtr = layout.direction === 'ltr';

    for (let i = 0; i < layout.lines.length; i++) {
      const line = layout.lines[i];
      const lineSched = schedule.lines[i];
      if (!lineSched) continue;

      const evalState = evaluateLineTypingAtTime(line, lineSched, t, layout.direction);
      if (!evalState.hasStarted) {
        // If this is the very first line and we're waiting for typing to start, place blinking cursor at start
        if (i === 0 && t >= 0.14 && cursorX === null) {
          cursorX = isLtr ? line.leftX : line.rightX;
          cursorTopY = line.y - layout.fontSize * 0.82;
          cursorH = layout.fontSize * 0.96;
        }
        continue;
      }

      const sprites = getCachedTerminalLineSprites(
        line,
        font,
        layout.fontSize,
        textColor,
        keywordColor,
        layout.direction
      );

      const spriteDrawX = line.leftX - sprites.padX;
      const spriteDrawY = line.topY - sprites.padY;

      // Stepped clip rect: expands towards the right in LTR, towards the left in RTL
      let clipLeftX: number;
      let clipW: number;

      if (isLtr) {
        clipLeftX = spriteDrawX;
        const edgeX = evalState.isFinished
          ? line.rightX + sprites.padX
          : Math.ceil(evalState.revealedRightX);
        clipW = Math.max(0, edgeX - clipLeftX);
      } else {
        clipLeftX = evalState.isFinished
          ? spriteDrawX
          : Math.floor(evalState.revealedLeftX);
        const clipRightX = line.rightX + sprites.padX;
        clipW = Math.max(0, clipRightX - clipLeftX);
      }

      if (clipW > 0) {
        targetCtx.save();
        targetCtx.beginPath();
        targetCtx.rect(clipLeftX, spriteDrawY, clipW, sprites.spriteH);
        targetCtx.clip();

        if (drawPass === 'crisp') {
          targetCtx.drawImage(sprites.crispCanvas, spriteDrawX, spriteDrawY);
        } else {
          targetCtx.drawImage(sprites.bloomCanvas, spriteDrawX, spriteDrawY);
        }
        targetCtx.restore();
      }

      // Extra keyword bloom highlight once a keyword rect finishes typing
      if (drawPass === 'bloom') {
        for (let rIdx = 0; rIdx < layout.keywordLineRects.length; rIdx++) {
          const rect = layout.keywordLineRects[rIdx];
          if (rect.lineIndex !== i) continue;
          const finishT = schedule.rectFinishTimes[rIdx] ?? typingStartSec;
          if (t >= finishT) {
            const pulse = 1 - 0.35 * progress(t, finishT, finishT + 0.45);
            targetCtx.save();
            targetCtx.globalAlpha *= 0.42 * pulse;
            targetCtx.fillStyle = keywordColor;
            targetCtx.fillRect(
              rect.leftX - 4,
              rect.baselineY + layout.fontSize * 0.12,
              rect.width + 8,
              Math.max(3, layout.fontSize * 0.08)
            );
            targetCtx.restore();
          }
        }
      }

      // Track leading-edge cursor position on the active or final line
      const nextLineSched = i + 1 < schedule.lines.length ? schedule.lines[i + 1] : null;
      const nextLineStarted = nextLineSched ? t >= nextLineSched.startTime : false;
      if (!evalState.isFinished || !nextLineStarted) {
        cursorX = isLtr ? evalState.revealedRightX : evalState.revealedLeftX;
        cursorTopY = line.y - layout.fontSize * 0.82;
        cursorH = layout.fontSize * 0.96;
        isActivelyTypingNow = !evalState.isFinished && t <= lineSched.endTime + 0.06;
      }
    }

    // Draw solid block cursor (#4DD8FF, blinks 530ms when idle, solid during keystrokes)
    if (cursorX !== null && exitP < 0.25) {
      const blinkOn =
        isActivelyTypingNow ||
        Math.floor((t * 1000) / PIXEL_TERMINAL_CONFIG.timings.cursorBlinkMs) % 2 === 0;
      if (blinkOn) {
        const cursorW = Math.max(10, Math.round(layout.fontSize * 0.42));
        const cx = Math.round(cursorX - cursorW - 4);
        const cy = Math.round(cursorTopY);
        targetCtx.save();
        targetCtx.fillStyle = accentColor;
        if (drawPass === 'bloom') {
          targetCtx.globalAlpha *= 0.55;
          targetCtx.fillRect(cx - 3, cy - 3, cursorW + 6, cursorH + 6);
        } else {
          targetCtx.fillRect(cx, cy, cursorW, cursorH);
        }
        targetCtx.restore();
      }
    }

    // Bright phosphor horizontal flash line during CRT exit collapse
    if (exitP > 0.2 && exitP < 0.92 && drawPass === 'crisp') {
      const flashAlpha = Math.sin(progress(exitP, 0.2, 0.92) * Math.PI);
      targetCtx.save();
      targetCtx.fillStyle = '#FFFFFF';
      targetCtx.globalAlpha = flashAlpha * 0.9;
      targetCtx.fillRect(geom.winX, winCenterY - 2, geom.winW, 4);
      targetCtx.restore();
    }

    targetCtx.restore();
  };

  if (density > 1) {
    // Render crisp pass to 1/N resolution offscreen canvas, then upscale with imageSmoothingEnabled = false
    const lowW = Math.max(64, Math.ceil(W / density));
    const lowH = Math.max(64, Math.ceil(H / density));
    if (!pixelOffscreenBuffer) {
      pixelOffscreenBuffer = createBufferCanvas(lowW, lowH);
    } else if (pixelOffscreenBuffer.width !== lowW || pixelOffscreenBuffer.height !== lowH) {
      pixelOffscreenBuffer.width = lowW;
      pixelOffscreenBuffer.height = lowH;
    }

    const pCtx = pixelOffscreenBuffer.getContext('2d');
    if (pCtx) {
      pCtx.save();
      pCtx.clearRect(0, 0, lowW, lowH);
      pCtx.scale(1 / density, 1 / density);
      drawTerminalScene(pCtx, 'crisp');
      pCtx.restore();

      ctx.save();
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pixelOffscreenBuffer, 0, 0, lowW, lowH, 0, 0, W, H);
      ctx.imageSmoothingEnabled = prevSmooth;
      ctx.restore();
    }
  } else {
    // Smooth density (N=1)
    drawTerminalScene(ctx, 'crisp');
  }

  // Subtle bloom overlay ('lighter', low alpha — allowed in both style and black mode)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.42 * exitFade;
  drawTerminalScene(ctx, 'bloom');
  ctx.restore();

  // Style mode only: cached LCD/scanline overlay + sliding letterbox bars
  if (!isBlackMode) {
    const lcdOverlay = getCachedLcdScanlineOverlay(W, H, density);
    ctx.save();
    ctx.globalAlpha = 0.55 * windowAlpha;
    ctx.drawImage(lcdOverlay, 0, 0, W, H);
    ctx.restore();

    // Thin cinematic letterbox bars sliding in/out
    const barEnter = easeOutCubic(progress(t, 0, Math.min(0.45, enter * 0.5)));
    const barExit = 1 - easeInCubic(progress(t, exitStart, total));
    const barFactor = barEnter * barExit;
    const maxBarH = Math.round(H * 0.055);
    const barH = Math.round(maxBarH * barFactor);
    if (barH > 0) {
      ctx.fillStyle = '#020306';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
    }
  }

  ctx.restore();
};
