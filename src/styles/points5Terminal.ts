import {
  ArabicFontFamily,
  BackgroundMode,
  EnglishFontFamily,
  PixelDensity,
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
  createBufferCanvas,
  getCachedLcdScanlineOverlay,
  getCachedPixelTerminalBackdrop,
} from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeOutCubic,
  easeOutQuart,
  hexToRgba,
  lerp,
  progress,
  resolveBackgroundMode,
  toArabicIndicDigits,
} from '../utils/math';
import { combineSeed, deterministicWave, mulberry32 } from '../utils/random';
import {
  buildAutoFitPointsLayout,
  drawPointTextWithWipeAndKeywords,
  getPointHighlightAlpha,
} from './points1Clean';

export const PTS_TERMINAL_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#D8F3FF',
  textSecondary: '#7CE4FF',
  accent: '#4DD8FF',
  keyword: '#FFB000',
  border: '#4DD8FF',
};

export const PTS_TERMINAL_CONFIG = {
  id: 'pts_terminal' as const,
  mode: 'points' as const,
  nameAr: 'سجل تيرمينال',
  nameEn: 'Terminal Log',
  descriptionAr:
    'نافذة طرفية ببكسلات ريترو وتوهج CRT وبادئة برمجية وكتابة متدرجة وسطر ختامي done.',
  defaultAccent: '#4DD8FF',
  defaultKeywordColor: '#FFB000',
  defaultQuoteFont: 'Noto Kufi Arabic' as ArabicFontFamily,
  defaultAuthorFont: 'Noto Kufi Arabic' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Share Tech Mono' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Share Tech Mono' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'black'] as BackgroundMode[],
  recommendedBackground: 'black' as BackgroundMode,
  lightPalette: PTS_TERMINAL_LIGHT_PALETTE,
  supportedMarkerTypes: [
    'checks',
    'western',
    'arabic-indic',
    'bullets',
    'none',
  ] as PointsMarkerType[],
  defaultMarkerType: 'checks' as PointsMarkerType,
  allowedFonts: [
    'Noto Kufi Arabic',
    'Reem Kufi',
    'IBM Plex Sans Arabic',
    'Cairo',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
  ] as ArabicFontFamily[],
  allowedEnglishFonts: [
    'Share Tech Mono',
    'JetBrains Mono',
    'VT323',
  ] as EnglishFontFamily[],
  colors: {
    bgDarkBlue: '#05070D',
    panelFill: 'rgba(7, 13, 24, 0.88)',
    titleBarFill: 'rgba(13, 25, 43, 0.94)',
    textPrimary: '#D8F3FF',
    prefixCyan: '#4DD8FF',
    keywordAmber: '#FFB000',
    dimHeader: '#5FB8D6',
  },
  fonts: {
    arabic: 'Noto Kufi Arabic' as ArabicFontFamily,
    english: 'Share Tech Mono' as EnglishFontFamily,
    weight: 700,
    titleWeight: 800,
  },
  sizes: {
    minFontSize: 20,
    maxFontSize: 42,
    lineHeightRatio: 1.54,
  },
  timings: {
    introDuration: 0.6,
    exitDuration: 0.6,
    defaultInterval: 1.2,
    cursorBlinkMs: 530,
  },
};

function formatTerminalPrefix(
  indexZero: number,
  markerType: PointsMarkerType
): string {
  const num = indexZero + 1;
  switch (markerType) {
    case 'checks':
      return '[✓]';
    case 'western':
      return `[${num}]`;
    case 'arabic-indic':
      return `[${toArabicIndicDigits(num)}]`;
    case 'bullets':
      return '[*]';
    case 'none':
    default:
      return '>';
  }
}

let ptsTerminalBuffer: HTMLCanvasElement | null = null;

export function getPtsTerminalEventTimes(
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
    styleId: 'pts_terminal',
    allowedArabicFonts: PTS_TERMINAL_CONFIG.allowedFonts,
    defaultArabicFont: PTS_TERMINAL_CONFIG.defaultQuoteFont,
    defaultEnglishFont: PTS_TERMINAL_CONFIG.defaultEnglishQuoteFont,
    fontWeight: PTS_TERMINAL_CONFIG.fonts.weight,
    minFontSize: PTS_TERMINAL_CONFIG.sizes.minFontSize,
    maxFontSize: PTS_TERMINAL_CONFIG.sizes.maxFontSize,
    lineHeightRatio: PTS_TERMINAL_CONFIG.sizes.lineHeightRatio,
    supportedMarkerTypes: PTS_TERMINAL_CONFIG.supportedMarkerTypes,
    defaultMarkerType: PTS_TERMINAL_CONFIG.defaultMarkerType,
    innerPadXRatio: 0.06,
    innerPadYRatio: 0.14,
    markerReserveFactor: 2.1,
    itemPadYFactor: 0.24,
    itemGapYFactor: 0.32,
  });

  const keystrokeTimes: number[] = [];
  for (const item of schedule.items) {
    const dur = Math.max(0.24, item.revealEnd - item.startTime);
    const steps = clamp(Math.round(item.keystrokeCount), 6, 22);
    for (let s = 0; s < steps; s++) {
      keystrokeTimes.push(Number((item.startTime + (s / steps) * dur).toFixed(3)));
    }
  }

  return {
    enterStart: schedule.introDuration,
    itemTimes: schedule.itemTimes,
    keywordTimes: layout.allKeywordTimes,
    keystrokeTimes,
    enterKeyTimes: schedule.itemTimes,
  };
}

export const renderPtsTerminal: PureStyleRenderer = (
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
  const isBlackMode = bgMode === 'black' || bgMode === 'green';

  const { schedule, layout } = buildAutoFitPointsLayout({
    ctx,
    content,
    custom,
    size,
    styleId: 'pts_terminal',
    allowedArabicFonts: PTS_TERMINAL_CONFIG.allowedFonts,
    defaultArabicFont: PTS_TERMINAL_CONFIG.defaultQuoteFont,
    defaultEnglishFont: PTS_TERMINAL_CONFIG.defaultEnglishQuoteFont,
    fontWeight: PTS_TERMINAL_CONFIG.fonts.weight,
    minFontSize: PTS_TERMINAL_CONFIG.sizes.minFontSize,
    maxFontSize: PTS_TERMINAL_CONFIG.sizes.maxFontSize,
    lineHeightRatio: PTS_TERMINAL_CONFIG.sizes.lineHeightRatio,
    supportedMarkerTypes: PTS_TERMINAL_CONFIG.supportedMarkerTypes,
    defaultMarkerType: PTS_TERMINAL_CONFIG.defaultMarkerType,
    innerPadXRatio: 0.06,
    innerPadYRatio: 0.14,
    markerReserveFactor: 2.1,
    itemPadYFactor: 0.24,
    itemGapYFactor: 0.32,
  });

  const density: PixelDensity = custom.pixelDensity ?? 2;
  const accentColor =
    custom.accentColor && custom.accentColor !== '#6FA8FF'
      ? custom.accentColor
      : PTS_TERMINAL_CONFIG.defaultAccent;
  const keywordColor =
    custom.keywordColor && custom.keywordColor !== '#FFD166'
      ? custom.keywordColor
      : PTS_TERMINAL_CONFIG.defaultKeywordColor;
  const textColor = PTS_TERMINAL_CONFIG.colors.textPrimary;

  const markerType: PointsMarkerType =
    custom.pointsMarkerType &&
    PTS_TERMINAL_CONFIG.supportedMarkerTypes.includes(custom.pointsMarkerType)
      ? custom.pointsMarkerType
      : PTS_TERMINAL_CONFIG.defaultMarkerType;

  const highlightCurrent = custom.pointsHighlightCurrent ?? true;
  const isFullscreen = layout.effectivePosition === 'fullscreen';

  const winX = layout.boxX;
  const winY = layout.boxY;
  const winW = layout.boxW;
  const winH = layout.boxH;
  const titleBarH = isFullscreen ? 44 : 36;

  // CRT Exit Collapse calculation
  const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
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
  const flickerWave = deterministicWave(t, combineSeed(custom.seed, 8501), 19.5);
  const crtFlicker = 0.97 + 0.03 * flickerWave;

  // Power-on window enter + brief flicker
  const winEnterP = easeOutQuart(progress(t, 0.04, schedule.introDuration * 0.9));
  let powerOnFlicker = 1;
  if (t >= 0.06 && t < 0.22) {
    const fStep = Math.floor((t - 0.06) * 45);
    powerOnFlicker = fStep % 2 === 0 ? 1 : 0.44;
  }
  const windowAlpha = clamp(winEnterP * powerOnFlicker * exitFade * crtFlicker, 0, 1);

  ctx.save();

  // 1. Background Layer
  if (isBlackMode) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    const pushZoom = lerp(
      1.0,
      1.05,
      clamp(t / Math.max(0.1, schedule.totalDuration), 0, 1)
    );
    const backdrop = getCachedPixelTerminalBackdrop(W, H, accentColor);
    ctx.save();
    ctx.translate(W * 0.5, H * 0.5);
    ctx.scale(pushZoom, pushZoom);
    ctx.drawImage(backdrop, -W * 0.5, -H * 0.5, W, H);

    const dustRng = mulberry32(combineSeed(custom.seed, 8520));
    ctx.fillStyle = hexToRgba(accentColor, 0.18 * exitFade);
    for (let i = 0; i < 20; i++) {
      const bx = (dustRng() - 0.5) * W * 0.88;
      const by = (dustRng() - 0.5) * H * 0.82;
      const driftX = Math.sin(t * (0.4 + dustRng() * 0.5) + i) * 16;
      const driftY = -t * (6 + dustRng() * 10);
      const r = 1 + dustRng() * 1.6;
      ctx.beginPath();
      ctx.arc(bx + driftX, ((by + driftY + H) % H) - H * 0.5, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 2. Render Terminal Window + Log Items
  const drawTerminalPointsScene = (
    targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    drawPass: 'crisp' | 'bloom'
  ) => {
    if (windowAlpha <= 0.005) return;

    const winCenterX = winX + winW * 0.5;
    const winCenterY = winY + winH * 0.5;
    const enterScale = lerp(0.94, 1.0, winEnterP);

    targetCtx.save();
    targetCtx.globalAlpha = windowAlpha;
    targetCtx.translate(winCenterX, winCenterY);
    targetCtx.scale(enterScale * crtCollapseX, enterScale * crtCollapseY);
    targetCtx.translate(-winCenterX, -winCenterY);

    if (drawPass === 'crisp') {
      if (!isBlackMode) {
        targetCtx.fillStyle = PTS_TERMINAL_CONFIG.colors.panelFill;
        targetCtx.beginPath();
        targetCtx.roundRect(winX, winY, winW, winH, 10);
        targetCtx.fill();

        targetCtx.fillStyle = PTS_TERMINAL_CONFIG.colors.titleBarFill;
        targetCtx.beginPath();
        targetCtx.roundRect(winX, winY, winW, titleBarH, [10, 10, 0, 0]);
        targetCtx.fill();
      }

      targetCtx.strokeStyle = accentColor;
      targetCtx.lineWidth = isBlackMode ? 2.5 : 2;
      targetCtx.beginPath();
      targetCtx.roundRect(winX, winY, winW, winH, 10);
      targetCtx.stroke();

      targetCtx.beginPath();
      targetCtx.moveTo(winX, winY + titleBarH);
      targetCtx.lineTo(winX + winW, winY + titleBarH);
      targetCtx.stroke();

      // Three terminal window dots on the left of the title bar
      const dotY = winY + titleBarH * 0.5;
      const dotColors = isBlackMode
        ? [accentColor, keywordColor, textColor]
        : ['#FF5F56', '#FFBD2E', '#27C93F'];
      for (let d = 0; d < 3; d++) {
        targetCtx.fillStyle = dotColors[d];
        targetCtx.beginPath();
        targetCtx.arc(winX + 22 + d * 20, dotY, 5.5, 0, Math.PI * 2);
        targetCtx.fill();
      }

      // Small dim LTR Latin header "> points --list"
      targetCtx.save();
      targetCtx.direction = 'ltr';
      targetCtx.textAlign = 'left';
      targetCtx.textBaseline = 'alphabetic';
      const headerFontPx = isFullscreen ? 17 : 14;
      targetCtx.font = `600 ${headerFontPx}px monospace`;
      targetCtx.fillStyle = isBlackMode ? accentColor : PTS_TERMINAL_CONFIG.colors.dimHeader;
      targetCtx.fillText('> points --list', winX + 20, winY + titleBarH + headerFontPx + 5);
      targetCtx.restore();
    } else {
      targetCtx.strokeStyle = hexToRgba(accentColor, 0.35);
      targetCtx.lineWidth = 5;
      targetCtx.beginPath();
      targetCtx.roundRect(winX, winY, winW, winH, 10);
      targetCtx.stroke();
    }

    // 3. Optional Title
    if (layout.titleLayout && layout.titleText.length > 0) {
      const titleWipeP = easeOutQuart(
        progress(t, 0.14, Math.max(0.45, schedule.introDuration))
      );
      if (titleWipeP > 0.005) {
        const isTitleLtr = layout.titleDirection === 'ltr';
        const titleOriginX = isTitleLtr
          ? layout.boxX + Math.round(layout.boxW * 0.06)
          : layout.boxX +
            layout.boxW -
            Math.round(layout.boxW * 0.06) -
            layout.titleLayout.boxWidth;

        targetCtx.save();
        targetCtx.globalAlpha *= drawPass === 'bloom' ? 0.55 : 1;
        drawPointTextWithWipeAndKeywords({
          ctx: targetCtx,
          layout: layout.titleLayout,
          originX: titleOriginX,
          originY: layout.titleY,
          wipeProgress: titleWipeP,
          textColor: accentColor,
          keywordColor,
          underlineKeywords: true,
        });
        targetCtx.restore();
      }
    }

    // 4. Render each item with LTR Latin prefix + Stepped RTL clip + solid block cursor
    let cursorX: number | null = null;
    let cursorY: number = 0;
    let cursorH: number = layout.fontSize * 0.92;
    let isActivelyTyping = false;

    const itemCount = layout.items.length;
    for (let i = 0; i < itemCount; i++) {
      const slot = layout.items[i];
      const sched = slot.sched;

      const typeDur = Math.max(0.24, sched.revealEnd - sched.startTime);
      const rawTypeP = progress(t, sched.startTime, sched.startTime + typeDur);
      if (rawTypeP <= 0) {
        if (i === 0 && t >= 0.2 && cursorX === null) {
          cursorX = slot.textX + slot.textW - 12;
          cursorY = slot.slotY + slot.slotH * 0.5;
        }
        continue;
      }

      // Stepped typing progress
      const totalSteps = clamp(Math.round(sched.keystrokeCount), 8, 26);
      const steppedP =
        rawTypeP >= 1
          ? 1
          : Math.max(1 / totalSteps, Math.floor(rawTypeP * totalSteps) / totalSteps);

      const highlightFactor = getPointHighlightAlpha(
        t,
        i,
        schedule.items,
        highlightCurrent,
        0.45
      );
      const rowAlpha = (drawPass === 'bloom' ? 0.52 : 1) * highlightFactor;

      // LTR Latin prefix ([✓], [1], [*])
      const prefixText = formatTerminalPrefix(i, markerType);
      if (prefixText) {
        targetCtx.save();
        targetCtx.globalAlpha *= rowAlpha;
        targetCtx.direction = 'ltr';
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';
        targetCtx.font = `700 ${Math.round(layout.fontSize * 0.82)}px "Share Tech Mono", monospace`;
        targetCtx.fillStyle = accentColor;
        targetCtx.fillText(prefixText, slot.markerCenterX, slot.markerCenterY);
        targetCtx.restore();
      }

      // Right-aligned Arabic text revealed by stepped right-to-left clip
      targetCtx.save();
      targetCtx.globalAlpha *= rowAlpha;
      drawPointTextWithWipeAndKeywords({
        ctx: targetCtx,
        layout: slot.layout,
        originX: slot.textX,
        originY: slot.textY,
        wipeProgress: steppedP,
        textColor,
        keywordColor,
        underlineKeywords: true,
      });
      targetCtx.restore();

      // Track cursor position at leading edge of the active item
      const nextItemStarted =
        i + 1 < schedule.items.length ? t >= schedule.items[i + 1].startTime : false;
      const lastItemDoneTime =
        schedule.items[itemCount - 1]?.revealEnd ?? schedule.introDuration + 1;
      if (rawTypeP < 1 || (!nextItemStarted && t < lastItemDoneTime + 0.12)) {
        const lastLine =
          slot.layout.lines[slot.layout.lines.length - 1] || slot.layout.lines[0];
        if (lastLine) {
          const lineSpan = Math.max(12, lastLine.rightX - lastLine.leftX);
          cursorX =
            slot.direction === 'rtl'
              ? slot.textX + lastLine.rightX - lineSpan * steppedP
              : slot.textX + lastLine.leftX + lineSpan * steppedP;
          cursorY = slot.textY + lastLine.y - layout.fontSize * 0.34;
          isActivelyTyping = rawTypeP < 1;
        }
      }
    }

    // 5. Final dim line "done." after the last item finishes typing
    const lastSched = schedule.items[schedule.items.length - 1];
    if (lastSched) {
      const doneStartT = lastSched.revealEnd + 0.08;
      if (t >= doneStartT) {
        const doneP = easeOutQuart(progress(t, doneStartT, doneStartT + 0.24));
        const doneX = winX + Math.round(winW * 0.06);
        const doneY = winY + winH - Math.max(18, Math.round(winH * 0.045));
        targetCtx.save();
        targetCtx.globalAlpha *= (drawPass === 'bloom' ? 0.35 : 0.62) * doneP;
        targetCtx.direction = 'ltr';
        targetCtx.textAlign = 'left';
        targetCtx.textBaseline = 'alphabetic';
        const doneFontPx = Math.max(14, Math.round(layout.fontSize * 0.68));
        targetCtx.font = `600 ${doneFontPx}px "Share Tech Mono", monospace`;
        targetCtx.fillStyle = isBlackMode ? accentColor : PTS_TERMINAL_CONFIG.colors.dimHeader;
        targetCtx.fillText('done.', doneX, doneY);

        // Place blinking cursor right after "done."
        const doneW = targetCtx.measureText('done.').width;
        cursorX = doneX + doneW + 14;
        cursorY = doneY - doneFontPx * 0.38;
        cursorH = doneFontPx * 0.92;
        isActivelyTyping = false;
        targetCtx.restore();
      }
    }

    // 6. Solid block cursor (530 ms blink)
    if (cursorX !== null && exitP < 0.25) {
      const blinkOn =
        isActivelyTyping ||
        Math.floor((t * 1000) / PTS_TERMINAL_CONFIG.timings.cursorBlinkMs) % 2 === 0;
      if (blinkOn) {
        const cursorW = Math.max(9, Math.round(cursorH * 0.48));
        const cx = Math.round(cursorX - cursorW - 3);
        const cy = Math.round(cursorY - cursorH * 0.5);
        targetCtx.save();
        targetCtx.fillStyle = accentColor;
        if (drawPass === 'bloom') {
          targetCtx.globalAlpha *= 0.5;
          targetCtx.fillRect(cx - 2, cy - 2, cursorW + 4, cursorH + 4);
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
      targetCtx.globalAlpha = flashAlpha * 0.88;
      targetCtx.fillRect(winX, winCenterY - 2, winW, 4);
      targetCtx.restore();
    }

    targetCtx.restore();
  };

  if (density > 1) {
    const lowW = Math.max(64, Math.ceil(W / density));
    const lowH = Math.max(64, Math.ceil(H / density));
    if (!ptsTerminalBuffer) {
      ptsTerminalBuffer = createBufferCanvas(lowW, lowH);
    } else if (ptsTerminalBuffer.width !== lowW || ptsTerminalBuffer.height !== lowH) {
      ptsTerminalBuffer.width = lowW;
      ptsTerminalBuffer.height = lowH;
    }

    const pCtx = ptsTerminalBuffer.getContext('2d');
    if (pCtx) {
      pCtx.save();
      pCtx.clearRect(0, 0, lowW, lowH);
      pCtx.scale(1 / density, 1 / density);
      drawTerminalPointsScene(pCtx, 'crisp');
      pCtx.restore();

      ctx.save();
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(ptsTerminalBuffer, 0, 0, lowW, lowH, 0, 0, W, H);
      ctx.imageSmoothingEnabled = prevSmooth;
      ctx.restore();
    }
  } else {
    drawTerminalPointsScene(ctx, 'crisp');
  }

  // Bloom pass ('lighter', low alpha)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.4 * exitFade;
  drawTerminalPointsScene(ctx, 'bloom');
  ctx.restore();

  // Scanlines + letterbox bars in Style mode
  if (!isBlackMode) {
    const lcdOverlay = getCachedLcdScanlineOverlay(W, H, density);
    ctx.save();
    ctx.globalAlpha = 0.52 * windowAlpha;
    ctx.drawImage(lcdOverlay, 0, 0, W, H);
    ctx.restore();

    const barEnter = easeOutCubic(progress(t, 0, 0.42));
    const barExit = 1 - easeInCubic(progress(t, schedule.exitStart, schedule.totalDuration));
    const barFactor = barEnter * barExit;
    const maxBarH = Math.round(H * 0.05);
    const barH = Math.round(maxBarH * barFactor);
    if (barH > 0) {
      ctx.fillStyle = '#020306';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
    }
  }

  ctx.restore();
};
