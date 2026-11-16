import {
  ArabicFontFamily,
  BackgroundMode,
  CalligraphyTheme,
  EnglishFontFamily,
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
  getCachedBrushMaskSprite,
  getCachedRicePaperCanvas,
  getOrGenerateCachedCanvas,
} from '../utils/assetCache';
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
import { applyStudioCanvasTextProps, layoutArabicQuote } from '../utils/textLayout';

export const CALLIGRAPHY_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#F8F3E6',
  textSecondary: '#E5D8C1',
  accent: '#F8F3E6',
  keyword: '#F5B041',
};

export const CALLIGRAPHY_INK_CONFIG = {
  id: 'calligraphy-ink' as const,
  mode: 'phrase' as const,
  nameAr: 'خط عربي بالفرشاة',
  nameEn: 'Calligraphy Ink',
  descriptionAr: 'خط عربي أصيل بمظهر ليلي فاخر بحبر ذهبي وعاجي أو ورق أرز كلاسيكي مع كشف بالفرشاة وختم خطاط',
  defaultAccent: '#111111',
  defaultKeywordColor: '#F5B041',
  defaultQuoteFont: 'Aref Ruqaa' as ArabicFontFamily,
  defaultAuthorFont: 'Aref Ruqaa' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Playfair Display' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Playfair Display' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'style' as BackgroundMode,
  lightPalette: CALLIGRAPHY_LIGHT_PALETTE,
  allowedFonts: [
    'Aref Ruqaa',
    'Aref Ruqaa Ink',
    'Reem Kufi',
    'Lalezar',
    'Katibeh',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
    'KOMission Black',
    'Zain Rounded instance mob',
    '29LT Azahar Display AL TN Trial Bold',
  ] as ArabicFontFamily[],
  allowedEnglishFonts: [
    'Playfair Display',
    'Cormorant Garamond',
    'Cinzel',
    'Lora',
  ] as EnglishFontFamily[],
  colors: {
    ricePaper: '#EFE7D6',
    ink: '#111111',
    keywordVermilion: '#B3261E',
    nightBgCore: '#101626',
    nightBgEdge: '#04060B',
    nightIvoryInk: '#F8F3E6',
    nightGoldKeyword: '#F5B041',
    sealRed: '#B3261E',
  },
  lineHeightRatio: 1.78,
};

function drawCalligrapherSeal(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number,
  scale: number
) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(-0.04);

  const half = size / 2;
  ctx.fillStyle = CALLIGRAPHY_INK_CONFIG.colors.sealRed;
  ctx.beginPath();
  ctx.roundRect(-half, -half, size, size, 4);
  ctx.fill();

  ctx.strokeStyle = '#F8F3E6';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-half + 3.5, -half + 3.5, size - 7, size - 7);

  // Stylized geometric Kufic seal motif inside the stamp
  ctx.beginPath();
  ctx.moveTo(-half + 8, -3);
  ctx.lineTo(half - 8, -3);
  ctx.moveTo(-half + 8, 4);
  ctx.lineTo(half - 8, 4);
  ctx.moveTo(0, -half + 7);
  ctx.lineTo(0, half - 7);
  ctx.stroke();

  ctx.restore();
}

export function getCalligraphyEventTimes(
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
  const { enter, hold } = getEffectiveTimeline(timeline, content.quoteText, 'phrase', 0.45);
  const defaultFont =
    direction === 'ltr'
      ? CALLIGRAPHY_INK_CONFIG.defaultEnglishQuoteFont
      : CALLIGRAPHY_INK_CONFIG.defaultQuoteFont;
  const font = custom.quoteFontOverride || defaultFont;

  const isFullscreen = pos === 'fullscreen';
  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: font,
    fontWeight: 700,
    minFontSize: isFullscreen ? (isHorizontal ? 62 : 52) : isHorizontal ? 38 : 34,
    maxFontSize: isFullscreen ? (isHorizontal ? 132 : 108) : isHorizontal ? 86 : 74,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: CALLIGRAPHY_INK_CONFIG.lineHeightRatio,
    boxX: posBox.boxX,
    boxY: posBox.boxY,
    boxWidth: posBox.boxWidth,
    boxHeight: posBox.boxHeight,
    align: posBox.align,
    direction,
  });

  const numLines = Math.max(1, layout.lines.length);
  const maxRevealSpan = Math.min(enter + 0.35 * hold, enter * 0.95);
  const lineDur = Math.max(0.28, (maxRevealSpan * 0.85) / numLines);

  const seenGroups = new Set<number>();
  const keywordTimes: number[] = [];
  for (const rect of layout.keywordLineRects) {
    if (!seenGroups.has(rect.groupId)) {
      seenGroups.add(rect.groupId);
      const lStart = lerp(0.05, Math.max(0.08, maxRevealSpan - lineDur), numLines > 1 ? rect.lineIndex / (numLines - 1) : 0);
      keywordTimes.push(Number((lStart + lineDur * 0.55).toFixed(3)));
    }
  }

  return { enterStart: 0.05, keywordTimes };
}

export const renderCalligraphyInk: PureStyleRenderer = (
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

  const theme: CalligraphyTheme = custom.calligraphyTheme || 'night';
  const isNightStyle = isBlack || (!isGreen && theme === 'night');

  const { enter, hold, exitStart, total } = getEffectiveTimeline(
    timeline,
    content.quoteText,
    'phrase',
    0.45
  );

  // Colors per background & theme rule
  const customInkOverride =
    custom.accentColor &&
    custom.accentColor.toLowerCase() !== '#111111' &&
    custom.accentColor.toLowerCase() !== '#6fa8ff'
      ? custom.accentColor
      : '';

  const inkColor = isNightStyle
    ? customInkOverride || CALLIGRAPHY_INK_CONFIG.colors.nightIvoryInk
    : isGreen
      ? CALLIGRAPHY_INK_CONFIG.colors.ink
      : custom.accentColor || CALLIGRAPHY_INK_CONFIG.colors.ink;

  const defaultKwForTheme = isNightStyle
    ? CALLIGRAPHY_INK_CONFIG.colors.nightGoldKeyword
    : CALLIGRAPHY_INK_CONFIG.colors.keywordVermilion;

  const keywordColor = custom.keywordColor || defaultKwForTheme;

  const font =
    custom.quoteFontOverride ||
    (isLtr
      ? CALLIGRAPHY_INK_CONFIG.defaultEnglishQuoteFont
      : CALLIGRAPHY_INK_CONFIG.defaultQuoteFont);

  // Exit: smooth alpha dissolve
  const exitProgress = progress(t, exitStart, total);
  const masterAlpha = 1 - easeInCubic(exitProgress);

  // 2. Layout inside position box
  const posBox = getPhrasePositionBox(pos, custom.format, W, H, direction);
  const isFullscreen = pos === 'fullscreen';
  const boxCenterX = posBox.boxX + posBox.boxWidth * 0.5;
  const boxCenterY = posBox.boxY + posBox.boxHeight * 0.5;

  ctx.save();

  // 1. Background
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (isBlack) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else if (theme === 'night') {
    // Luxury Royal Night Background with Golden Spotlight & Floating Gold Dust
    const bgGrad = ctx.createRadialGradient(
      boxCenterX,
      boxCenterY,
      Math.min(W, H) * 0.04,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.78
    );
    bgGrad.addColorStop(0, '#162038');
    bgGrad.addColorStop(0.45, '#0A0F1D');
    bgGrad.addColorStop(1, '#030509');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = masterAlpha;

    // Warm golden ambient glow behind the calligraphy region
    const goldPool = ctx.createRadialGradient(
      boxCenterX,
      boxCenterY,
      20,
      boxCenterX,
      boxCenterY,
      Math.max(posBox.boxWidth, posBox.boxHeight) * 0.75
    );
    goldPool.addColorStop(0, hexToRgba(keywordColor, 0.19));
    goldPool.addColorStop(0.55, hexToRgba(keywordColor, 0.05));
    goldPool.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = goldPool;
    ctx.fillRect(0, 0, W, H);

    // Floating gold leaf dust particles
    const moteRng = mulberry32(combineSeed(custom.seed, 1905));
    for (let m = 0; m < 26; m++) {
      const bx = moteRng();
      const by = moteRng();
      const speedX = (moteRng() - 0.5) * 0.01;
      const speedY = -0.005 - moteRng() * 0.01;
      const phase = moteRng() * Math.PI * 2;
      const rad = 1.2 + moteRng() * 2.8;
      const px = (((bx + speedX * t) % 1 + 1) % 1) * W;
      const py = (((by + speedY * t) % 1 + 1) % 1) * H;
      const pulse = 0.4 + 0.6 * Math.sin(t * 2.0 + phase);

      const mGrad = ctx.createRadialGradient(px, py, 0, px, py, rad * 2.4);
      mGrad.addColorStop(0, hexToRgba('#FDE68A', 0.35 * pulse));
      mGrad.addColorStop(1, 'rgba(253, 230, 138, 0)');
      ctx.fillStyle = mGrad;
      ctx.beginPath();
      ctx.arc(px, py, rad * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ornate golden corner framing around the screen or position region
    const frameMargin = Math.round(Math.min(W, H) * 0.045);
    ctx.strokeStyle = hexToRgba('#F5B041', 0.28);
    ctx.lineWidth = 1.4;
    ctx.strokeRect(frameMargin, frameMargin, W - frameMargin * 2, H - frameMargin * 2);
    ctx.strokeStyle = hexToRgba('#F5B041', 0.14);
    ctx.lineWidth = 1;
    ctx.strokeRect(
      frameMargin + 8,
      frameMargin + 8,
      W - (frameMargin + 8) * 2,
      H - (frameMargin + 8) * 2
    );
    ctx.restore();
  } else {
    // Classic Warm Rice Paper Background with Soft Gallery Spotlight
    ctx.fillStyle = CALLIGRAPHY_INK_CONFIG.colors.ricePaper;
    ctx.fillRect(0, 0, W, H);
    const ricePaper = getCachedRicePaperCanvas(W, H, custom.seed);
    ctx.save();
    ctx.globalAlpha = masterAlpha;
    ctx.drawImage(ricePaper, 0, 0, W, H);

    // Subtle warm gallery spotlight over the active phrase box
    const spot = ctx.createRadialGradient(
      boxCenterX,
      boxCenterY,
      20,
      boxCenterX,
      boxCenterY,
      Math.max(W, H) * 0.65
    );
    spot.addColorStop(0, 'rgba(255, 252, 244, 0.32)');
    spot.addColorStop(0.65, 'rgba(240, 230, 210, 0)');
    spot.addColorStop(1, 'rgba(68, 48, 24, 0.24)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);

    // Subtle traditional double hairline border
    const frameMargin = Math.round(Math.min(W, H) * 0.045);
    ctx.strokeStyle = 'rgba(120, 92, 58, 0.26)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(frameMargin, frameMargin, W - frameMargin * 2, H - frameMargin * 2);
    ctx.restore();
  }

  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: font,
    fontWeight: 700,
    minFontSize: isFullscreen ? (isHorizontal ? 62 : 52) : isHorizontal ? 38 : 34,
    maxFontSize: isFullscreen ? (isHorizontal ? 132 : 108) : isHorizontal ? 86 : 74,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: CALLIGRAPHY_INK_CONFIG.lineHeightRatio,
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

  const numLines = Math.max(1, layout.lines.length);
  const maxRevealSpan = Math.min(enter + 0.35 * hold, enter * 0.95);
  const lineDur = Math.max(0.28, (maxRevealSpan * 0.85) / numLines);

  // Scratch canvas for brush-stroke destination-in compositing per line
  const padX = Math.round(layout.fontSize * 0.85);
  const padY = Math.round(layout.fontSize * 0.65);

  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];
    const lStart = lerp(
      0.05,
      Math.max(0.08, maxRevealSpan - lineDur),
      numLines > 1 ? i / (numLines - 1) : 0
    );
    const lProg = easeInOutCubic(progress(t, lStart, lStart + lineDur));
    if (lProg <= 0.005) continue;

    const spriteW = Math.max(64, Math.ceil(line.width + padX * 2));
    const spriteH = Math.max(48, Math.ceil(layout.lineHeight + padY * 2));
    const spriteOriginX = Math.round(line.leftX - padX);
    const spriteOriginY = Math.round(line.topY - padY);
    const localRightX = line.rightX - spriteOriginX;
    const localBaselineY = line.y - spriteOriginY;

    // 2a. Cached Crisp Line Sprite with subtle depth
    const crispKey = `p1-line-v2|${line.text}|${font}|${layout.fontSize}|${inkColor}|${keywordColor}|${isNightStyle ? 'n' : 'p'}|${direction}|${spriteW}x${spriteH}|${line.words.map((w) => (w.isKeyword ? '1' : '0')).join('')}`;
    const crispSprite = getOrGenerateCachedCanvas(crispKey, spriteW, spriteH, (sCtx) => {
      applyStudioCanvasTextProps(sCtx, font, 700, layout.fontSize, direction);
      sCtx.textAlign = 'right';
      for (const w of line.words) {
        const localWordX = localRightX - (line.rightX - w.x);
        if (isNightStyle) {
          sCtx.save();
          sCtx.shadowColor = w.isKeyword ? hexToRgba(keywordColor, 0.55) : 'rgba(0, 0, 0, 0.65)';
          sCtx.shadowBlur = w.isKeyword ? 14 : 8;
          sCtx.shadowOffsetY = 2;
          sCtx.fillStyle = w.isKeyword ? keywordColor : inkColor;
          sCtx.fillText(w.text, localWordX, localBaselineY);
          sCtx.restore();
        } else {
          sCtx.fillStyle = w.isKeyword ? keywordColor : inkColor;
          sCtx.fillText(w.text, localWordX, localBaselineY);
        }
      }
    });

    // 2b. Cached Blurred Ink-Bleed / Gold-Glow Sprite (omitted on Green Screen to prevent soft edges)
    let bleedSprite: HTMLCanvasElement | null = null;
    if (!isGreen) {
      const bleedKey = `${crispKey}|bleed`;
      bleedSprite = getOrGenerateCachedCanvas(bleedKey, spriteW, spriteH, (bCtx) => {
        bCtx.save();
        if ('filter' in bCtx) {
          bCtx.filter = isNightStyle ? 'blur(5px)' : 'blur(3.5px)';
        }
        bCtx.drawImage(crispSprite, 0, 0);
        bCtx.restore();
      });
    }

    // 2c. Cached Brush-Stroke Bristle Mask
    const maskSprite = getCachedBrushMaskSprite(spriteW + 120, spriteH, custom.seed, i);

    // Composite line with brush mask on a temporary buffer
    const compCanvas = createBufferCanvas(spriteW, spriteH);
    const compCtx = compCanvas.getContext('2d')!;

    // Subtle ink bleed or golden aura fading in slightly after stroke passes
    if (bleedSprite && !isGreen) {
      const bleedProg = easeOutCubic(progress(t, lStart + lineDur * 0.2, lStart + lineDur * 1.1));
      if (bleedProg > 0.01) {
        compCtx.save();
        compCtx.globalAlpha = (isNightStyle ? 0.34 : 0.24) * bleedProg;
        compCtx.drawImage(bleedSprite, 0, 0);
        compCtx.restore();
      }
    }

    compCtx.drawImage(crispSprite, 0, 0);

    // Apply destination-in brush mask moving right-to-left (RTL) or left-to-right (LTR)
    compCtx.globalCompositeOperation = 'destination-in';
    const maskFullW = spriteW + 120;
    const revealedW = maskFullW * lProg;
    const maskDrawX = isLtr ? -120 + revealedW - maskFullW : spriteW + 20 - revealedW;
    compCtx.drawImage(maskSprite, maskDrawX, 0, maskFullW, spriteH);
    compCtx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.globalAlpha = isGreen ? (masterAlpha > 0.25 ? 1 : 0) : masterAlpha;
    ctx.drawImage(compCanvas, spriteOriginX, spriteOriginY);
    ctx.restore();

    // 3. Keyword Splash: 8-16 seeded ink / gold-leaf droplets + double dry-brush underline
    const lineKwRects = layout.keywordLineRects.filter((r) => r.lineIndex === i);
    for (const rect of lineKwRects) {
      const kwStart = lStart + lineDur * 0.48;
      const kwProg = easeOutCubic(progress(t, kwStart, kwStart + 0.38));
      if (kwProg <= 0.01) continue;

      const rng = mulberry32(combineSeed(custom.seed, 1400 + rect.groupId * 71 + i * 19));
      const dropletCount = 8 + Math.floor(rng() * 9); // 8 to 16 droplets

      ctx.save();
      ctx.globalAlpha = isGreen ? (kwProg > 0.2 ? 1 : 0) : masterAlpha * kwProg;
      ctx.fillStyle = keywordColor;

      // Small splash droplets radiating around keyword
      for (let d = 0; d < dropletCount; d++) {
        const angle = rng() * Math.PI * 2;
        const baseX = lerp(rect.leftX, rect.rightX, rng());
        const baseY = lerp(rect.topY + layout.fontSize * 0.15, rect.bottomY, rng());
        const dist = (12 + rng() * 36) * kwProg;
        const dx = baseX + Math.cos(angle) * dist;
        const dy = baseY + Math.sin(angle) * dist * 0.65;
        const radius = (1.8 + rng() * 4.4) * (1 - 0.15 * kwProg);

        ctx.beginPath();
        ctx.ellipse(
          dx,
          dy,
          radius,
          radius * (0.65 + rng() * 0.5),
          angle,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // Thick dry-brush underline (directional)
      const uSpan = (rect.width + 18) * kwProg;
      const uStartX = isLtr ? rect.leftX - 9 : rect.rightX + 9;
      const uEndX = isLtr ? uStartX + uSpan : uStartX - uSpan;
      const uY = rect.baselineY + layout.fontSize * 0.19;
      const mainStrokeH = Math.max(5, layout.fontSize * 0.095);

      ctx.strokeStyle = keywordColor;
      ctx.lineCap = 'round';

      if (isNightStyle && !isGreen) {
        ctx.shadowColor = hexToRgba(keywordColor, 0.5);
        ctx.shadowBlur = 10;
      }

      // Main dry-brush body
      ctx.lineWidth = mainStrokeH;
      ctx.beginPath();
      ctx.moveTo(uStartX, uY);
      ctx.quadraticCurveTo(
        lerp(uStartX, uEndX, 0.5),
        uY + 3.5,
        uEndX,
        uY - 1.5
      );
      ctx.stroke();

      // Secondary dry-bristle parallel streak
      ctx.lineWidth = Math.max(2, mainStrokeH * 0.38);
      ctx.beginPath();
      ctx.moveTo(isLtr ? uStartX + 4 : uStartX - 4, uY + mainStrokeH * 0.65);
      ctx.quadraticCurveTo(
        lerp(uStartX, uEndX, 0.45),
        uY + mainStrokeH * 0.85,
        lerp(uStartX, uEndX, 0.92),
        uY + mainStrokeH * 0.4
      );
      ctx.stroke();

      ctx.restore();
    }
  }

  // 4. Calligrapher's Red Seal Stamp (ختم الخطاط) at the end of the phrase block
  if (!isGreen && layout.lines.length > 0) {
    const lastLine = layout.lines[layout.lines.length - 1];
    const sealStart = maxRevealSpan * 0.78;
    const sealProg = easeOutCubic(progress(t, sealStart, sealStart + 0.28));
    if (sealProg > 0.01) {
      const sealSize = clamp(Math.round(layout.fontSize * 0.52), 26, 44);
      const sealX = isLtr
        ? Math.min(posBox.boxX + posBox.boxWidth - sealSize, lastLine.rightX + sealSize * 0.95)
        : Math.max(posBox.boxX + sealSize, lastLine.leftX - sealSize * 0.95);
      const sealY = lastLine.y - sealSize * 0.25;
      const sealScale = lerp(1.35, 1.0, sealProg);
      drawCalligrapherSeal(ctx, sealX, sealY, sealSize, masterAlpha * sealProg * 0.9, sealScale);
    }
  }

  ctx.restore();
};

