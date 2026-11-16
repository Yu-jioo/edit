import {
  ArabicFontFamily,
  BackgroundMode,
  EnglishFontFamily,
  GeometricShape,
  MinimalTheme,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  SceneEventTimes,
  StyleCustomization,
  StyleLightPalette,
  TimelineConfig,
} from '../types';
import { getCachedGradedPortrait } from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeOutCubic,
  easeOutQuart,
  getEffectiveTimeline,
  hexToRgba,
  lerp,
  mixHexColor,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
} from '../utils/math';
import { applyStudioCanvasTextProps, layoutArabicQuote } from '../utils/textLayout';

export const MODERN_MINIMAL_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  accent: '#FF5A36',
  keyword: '#FFD166',
  border: '#F8FAFC',
};

export const MODERN_MINIMAL_CONFIG = {
  id: 'modern-minimal' as const,
  mode: 'quote' as const,
  nameAr: 'عصري سينمائي',
  nameEn: 'Modern Minimal',
  descriptionAr: 'تصميم معماري معاصر بمظهر داكن سينمائي أو فاتح تحريري وأشكال هندسية وحركة زووم عميقة',
  defaultAccent: '#FF4D2E',
  defaultKeywordColor: '#FF4D2E',
  defaultQuoteFont: 'Readex Pro' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Manrope' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'style' as BackgroundMode,
  lightPalette: MODERN_MINIMAL_LIGHT_PALETTE,
  allowedEnglishFonts: [
    'Plus Jakarta Sans',
    'Outfit',
    'Manrope',
    'Share Tech Mono',
    'Oswald',
  ] as EnglishFontFamily[],
  colors: {
    bgLight: '#F6F4EF',
    textPrimary: '#111318',
    textSecondary: '#4A505C',
    subtleGrid: 'rgba(17, 19, 24, 0.068)',
    bgDark: '#090C12',
    darkTextPrimary: '#F8FAFC',
    darkTextSecondary: '#94A3B8',
    darkSubtleGrid: 'rgba(248, 250, 252, 0.075)',
  },
  lineHeightRatio: 1.65,
};

function traceGeometricShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: GeometricShape,
  w: number,
  h: number
) {
  ctx.beginPath();
  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  } else if (shape === 'rounded-square') {
    const r = Math.min(w, h) * 0.16;
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
  } else {
    const rTop = w / 2;
    const rBottom = 18;
    ctx.roundRect(-w / 2, -h / 2, w, h, [rTop, rTop, rBottom, rBottom]);
  }
  ctx.closePath();
}

export function getModernMinimalEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const { baseWidth: W, baseHeight: H } = size;
  const isHorizontal = custom.format === '16:9';
  const { enter } = getEffectiveTimeline(timeline, content.quoteText);
  const direction = resolveTextDirection(custom, content.quoteText);
  const isLtr = direction === 'ltr';
  const defaultFont = isLtr
    ? MODERN_MINIMAL_CONFIG.defaultEnglishQuoteFont
    : MODERN_MINIMAL_CONFIG.defaultQuoteFont;
  const quoteFont = custom.quoteFontOverride || defaultFont;

  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 800,
    minFontSize: isHorizontal ? 36 : 30,
    maxFontSize: isHorizontal ? 72 : 56,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: MODERN_MINIMAL_CONFIG.lineHeightRatio,
    boxX: isHorizontal ? W * 0.43 : W * 0.08,
    boxY: isHorizontal ? H * 0.16 : H * 0.43,
    boxWidth: isHorizontal ? W * 0.49 : W * 0.84,
    boxHeight: isHorizontal ? H * 0.52 : H * 0.35,
    align: isHorizontal ? (isLtr ? 'left' : 'right') : 'center',
    direction,
  });

  const totalWords = Math.max(1, quoteLayout.words.length);
  const wordRevealStart = enter * 0.14;
  const wordRevealEnd = enter * 0.72;
  const wordInterval = (wordRevealEnd - wordRevealStart) / totalWords;

  const seenGroups = new Set<number>();
  const keywordTimes: number[] = [];
  for (const w of quoteLayout.words) {
    if (w.isKeyword && w.groupId !== null && !seenGroups.has(w.groupId)) {
      seenGroups.add(w.groupId);
      const wTime = wordRevealStart + w.globalWordIndex * wordInterval;
      keywordTimes.push(Number(wTime.toFixed(3)));
    }
  }

  return { enterStart: 0.04, keywordTimes };
}

export const renderModernMinimal: PureStyleRenderer = (
  ctx,
  t,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
) => {
  const { baseWidth: W, baseHeight: H } = size;
  const isHorizontal = custom.format === '16:9';
  const { enter, exitStart, total } = getEffectiveTimeline(timeline, content.quoteText);
  const bgMode = resolveBackgroundMode(custom);
  const isBlack = bgMode === 'black';
  const isGreen = bgMode === 'green';

  const theme: MinimalTheme = custom.minimalTheme || 'dark';
  const useDarkPalette = isBlack || (bgMode === 'style' && theme === 'dark');

  const accent = custom.accentColor || MODERN_MINIMAL_CONFIG.defaultAccent;
  const keywordColor =
    custom.keywordColor || (useDarkPalette ? MODERN_MINIMAL_LIGHT_PALETTE.keyword : accent);
  const textPrimary = useDarkPalette
    ? MODERN_MINIMAL_CONFIG.colors.darkTextPrimary
    : MODERN_MINIMAL_CONFIG.colors.textPrimary;
  const textSecondary = useDarkPalette
    ? MODERN_MINIMAL_CONFIG.colors.darkTextSecondary
    : MODERN_MINIMAL_CONFIG.colors.textSecondary;

  const direction = resolveTextDirection(custom, content.quoteText);
  const isLtr = direction === 'ltr';
  const defaultQuoteFont = isLtr
    ? MODERN_MINIMAL_CONFIG.defaultEnglishQuoteFont
    : MODERN_MINIMAL_CONFIG.defaultQuoteFont;
  const defaultAuthorFont = isLtr
    ? MODERN_MINIMAL_CONFIG.defaultEnglishAuthorFont
    : MODERN_MINIMAL_CONFIG.defaultAuthorFont;
  const quoteFont = custom.quoteFontOverride || defaultQuoteFont;
  const authorFont = custom.authorFontOverride || defaultAuthorFont;
  const shapeType: GeometricShape = custom.minimalShape || 'arch';

  const sceneProg = clamp(t / Math.max(0.1, total), 0, 1);
  const exitProgress = progress(t, exitStart, total);
  const exitEase = easeInCubic(exitProgress);
  const masterAlpha = 1 - exitEase;

  // 2. Asymmetric Layout Geometry
  const shapeW = isHorizontal ? 390 : 310;
  const shapeH = shapeType === 'circle' ? shapeW : isHorizontal ? 470 : 365;
  const photoCenterX = isHorizontal ? W * 0.23 : W * 0.5;
  const photoCenterY = isHorizontal ? H * 0.52 : H * 0.235;

  const textBoxX = isHorizontal ? W * 0.43 : W * 0.08;
  const textBoxW = isHorizontal ? W * 0.49 : W * 0.84;
  const textBoxY = isHorizontal ? H * 0.16 : H * 0.43;
  const textBoxH = isHorizontal ? H * 0.52 : H * 0.35;
  const textAlign = isHorizontal ? (isLtr ? 'left' : 'right') : 'center';

  ctx.save();

  // 1. Background (Cinematic Dark, Editorial Light, Green Screen, or Black Screen)
  if (bgMode === 'green') {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else if (theme === 'dark') {
    // Cinematic Dark Mode Backdrop with Studio Key Light & Vignette
    const bgGrad = ctx.createRadialGradient(
      W * 0.32,
      H * 0.38,
      W * 0.04,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.85
    );
    bgGrad.addColorStop(0, '#161F30');
    bgGrad.addColorStop(0.52, '#0C1018');
    bgGrad.addColorStop(1, '#05070B');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle warm/accent atmospheric pool behind text and portrait
    ctx.save();
    ctx.globalAlpha = masterAlpha * 0.85;
    const poolGrad = ctx.createRadialGradient(
      photoCenterX,
      photoCenterY,
      shapeW * 0.1,
      photoCenterX,
      photoCenterY,
      shapeW * 1.35
    );
    poolGrad.addColorStop(0, hexToRgba(accent, 0.18));
    poolGrad.addColorStop(0.6, hexToRgba(accent, 0.05));
    poolGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = poolGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  } else {
    // Editorial Warm Light Mode Backdrop with Studio Paper Gradient & Soft Edge Vignette
    const bgGrad = ctx.createRadialGradient(
      W * 0.35,
      H * 0.35,
      W * 0.05,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.82
    );
    bgGrad.addColorStop(0, '#FCFBF8');
    bgGrad.addColorStop(0.65, '#F4F0E8');
    bgGrad.addColorStop(1, '#E5DECFE6');
    ctx.fillStyle = MODERN_MINIMAL_CONFIG.colors.bgLight;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = masterAlpha * 0.65;
    const poolGrad = ctx.createRadialGradient(
      photoCenterX,
      photoCenterY,
      shapeW * 0.1,
      photoCenterX,
      photoCenterY,
      shapeW * 1.25
    );
    poolGrad.addColorStop(0, hexToRgba(accent, 0.12));
    poolGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = poolGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Architectural Grid Hairlines & Accent Bar (in Style and Black modes)
  if (!isGreen) {
    ctx.save();
    ctx.globalAlpha = masterAlpha;
    ctx.strokeStyle = useDarkPalette
      ? MODERN_MINIMAL_CONFIG.colors.darkSubtleGrid
      : MODERN_MINIMAL_CONFIG.colors.subtleGrid;
    ctx.lineWidth = 1.5;
    const marginX = W * 0.055;
    const marginY = H * 0.068;
    ctx.beginPath();
    ctx.moveTo(marginX, marginY);
    ctx.lineTo(W - marginX, marginY);
    ctx.moveTo(marginX, H - marginY);
    ctx.lineTo(W - marginX, H - marginY);
    if (isHorizontal) {
      // Subtle vertical architectural divider between portrait zone and typography zone
      const splitX = W * 0.39;
      ctx.moveTo(splitX, marginY);
      ctx.lineTo(splitX, H - marginY);
    }
    ctx.stroke();

    const barProg = easeOutQuart(progress(t, 0, enter * 0.45));
    ctx.fillStyle = accent;
    const barW = 76 * barProg;
    const barX = isLtr ? marginX : W - marginX - barW;
    ctx.fillRect(barX, marginY - 3, barW, 6);
    ctx.restore();
  }

  // 3. Geometric Shape Pop-In + Offset Accent Backdrop + Ken Burns Portrait
  const backShapePop = easeOutQuart(progress(t, 0.04, enter * 0.55));
  const photoShapePop = easeOutQuart(progress(t, 0.14, enter * 0.68));
  const kenBurnsZoom = lerp(1.0, 1.1, sceneProg);
  const kenBurnsPanY = lerp(5, -5, sceneProg);

  if (backShapePop > 0.005) {
    ctx.save();
    ctx.globalAlpha = isGreen ? (masterAlpha > 0.25 ? 1 : 0) : masterAlpha;

    // Outer wireframe architectural echo
    if (!isGreen) {
      ctx.save();
      ctx.translate(photoCenterX + 18 * backShapePop, photoCenterY - 18 * backShapePop);
      ctx.scale(lerp(0.75, 1.0, backShapePop), lerp(0.75, 1.0, backShapePop));
      traceGeometricShape(ctx, shapeType, shapeW, shapeH);
      ctx.strokeStyle = hexToRgba(accent, useDarkPalette ? 0.32 : 0.24);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // Offset solid accent geometric block
    ctx.translate(photoCenterX - 22 * backShapePop, photoCenterY + 22 * backShapePop);
    ctx.scale(lerp(0.6, 1.0, backShapePop), lerp(0.6, 1.0, backShapePop));
    traceGeometricShape(ctx, shapeType, shapeW, shapeH);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();
  }

  if (photoShapePop > 0.005) {
    ctx.save();
    ctx.globalAlpha = isGreen ? (masterAlpha > 0.25 ? 1 : 0) : masterAlpha;
    ctx.translate(photoCenterX, photoCenterY + (1 - photoShapePop) * 35);
    ctx.scale(lerp(0.82, 1.0, photoShapePop), lerp(0.82, 1.0, photoShapePop));

    // Deep multi-layered drop shadow under the main geometric portrait frame
    if (!isBlack && !isGreen) {
      ctx.save();
      ctx.shadowColor = useDarkPalette ? 'rgba(0, 0, 0, 0.68)' : 'rgba(17, 19, 24, 0.26)';
      ctx.shadowBlur = 38;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 18;
      traceGeometricShape(ctx, shapeType, shapeW, shapeH);
      ctx.fillStyle = useDarkPalette ? '#0D111A' : '#FFFFFF';
      ctx.fill();
      ctx.restore();
    }

    traceGeometricShape(ctx, shapeType, shapeW, shapeH);
    ctx.save();
    ctx.clip();

    // Continuous slow Ken Burns zoom on the portrait inside the geometric mask
    const portrait = getCachedGradedPortrait(
      content.photoSource,
      content.photoId,
      content.crop,
      shapeW,
      shapeH,
      'normal'
    );
    ctx.save();
    ctx.translate(0, kenBurnsPanY);
    ctx.scale(kenBurnsZoom, kenBurnsZoom);
    ctx.drawImage(portrait, -shapeW / 2, -shapeH / 2, shapeW, shapeH);
    ctx.restore();

    // Subtle inner cinematic edge vignette inside the geometric frame
    if (!isGreen) {
      const vigR = Math.max(shapeW, shapeH) * 0.65;
      const innerVig = ctx.createRadialGradient(0, 0, vigR * 0.45, 0, 0, vigR);
      innerVig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      innerVig.addColorStop(0.75, 'rgba(0, 0, 0, 0.14)');
      innerVig.addColorStop(1, 'rgba(0, 0, 0, 0.48)');
      ctx.fillStyle = innerVig;
      ctx.fillRect(-shapeW / 2, -shapeH / 2, shapeW, shapeH);
    }
    ctx.restore();

    // Crisp outer rim stroke
    traceGeometricShape(ctx, shapeType, shapeW, shapeH);
    ctx.strokeStyle = useDarkPalette ? hexToRgba('#F8FAFC', 0.85) : textPrimary;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  // 4. Hero Bold Typography with Sequential Word Reveal + Keyword Emphasis
  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 800,
    minFontSize: isHorizontal ? 36 : 30,
    maxFontSize: isHorizontal ? 72 : 56,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: MODERN_MINIMAL_CONFIG.lineHeightRatio,
    boxX: textBoxX,
    boxY: textBoxY,
    boxWidth: textBoxW,
    boxHeight: textBoxH,
    align: textAlign,
    direction,
  });

  const totalWords = Math.max(1, quoteLayout.words.length);
  const wordRevealStart = enter * 0.14;
  const wordRevealEnd = enter * 0.72;
  const wordInterval = (wordRevealEnd - wordRevealStart) / totalWords;
  const slideY = exitEase * -35;

  ctx.save();
  applyStudioCanvasTextProps(ctx, quoteLayout.fontFamily, quoteLayout.fontWeight, quoteLayout.fontSize, direction);
  ctx.textAlign = 'right';

  for (const w of quoteLayout.words) {
    const wTime = wordRevealStart + w.globalWordIndex * wordInterval;
    if (t < wTime) continue;

    const wordSettle = easeOutCubic(progress(t, wTime, wTime + 0.18));
    const wordOffsetY = isGreen ? 0 : (1 - wordSettle) * 10;
    const wordAlpha = isGreen ? (masterAlpha > 0.25 ? 1 : 0) : masterAlpha * wordSettle;

    const kwEmph = w.isKeyword
      ? easeOutCubic(progress(t, wTime + 0.1, wTime + 0.35))
      : 0;

    ctx.save();
    ctx.globalAlpha = wordAlpha;

    if (!isGreen && useDarkPalette) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
    }

    ctx.fillStyle = w.isKeyword
      ? mixHexColor(textPrimary, keywordColor, kwEmph)
      : textPrimary;
    ctx.fillText(w.text, w.x, w.y + slideY + wordOffsetY);
    ctx.restore();

    if (w.isKeyword && kwEmph > 0.01) {
      ctx.save();
      ctx.globalAlpha = isGreen ? 1 : masterAlpha;
      const uW = w.width * kwEmph;
      const uX = isLtr ? w.x - w.width : w.x - uW;
      ctx.fillStyle = keywordColor;
      ctx.fillRect(uX, w.y + slideY + wordOffsetY + quoteLayout.fontSize * 0.15, uW, 5);
      ctx.restore();
    }
  }
  ctx.restore();

  // 5. Bold Accent Underline & Author Metadata (Appears as word reveal finishes)
  const metaProg = easeOutQuart(progress(t, enter * 0.7, enter));
  if (metaProg > 0.005) {
    const lastLineBottom =
      quoteLayout.lines.length > 0
        ? quoteLayout.lines[quoteLayout.lines.length - 1].bottomY
        : textBoxY + textBoxH * 0.65;
    const underlineY = clamp(lastLineBottom + 28, textBoxY + 80, H - 175);
    const underlineW = (isHorizontal ? 160 : 140) * metaProg;
    const uLineX =
      textAlign === 'left'
        ? textBoxX
        : textAlign === 'right'
          ? textBoxX + textBoxW - underlineW
          : textBoxX + (textBoxW - underlineW) / 2;

    ctx.save();
    ctx.globalAlpha = isGreen ? (masterAlpha > 0.25 ? 1 : 0) : masterAlpha;

    ctx.fillStyle = accent;
    ctx.fillRect(uLineX, underlineY, underlineW, 7);

    if (content.authorName.trim()) {
      const anchorX =
        textAlign === 'right'
          ? textBoxX + textBoxW
          : textAlign === 'left'
            ? textBoxX
            : textBoxX + textBoxW / 2;
      const authorY = underlineY + 56;

      ctx.beginPath();
      ctx.rect(textBoxX - 20, underlineY + 14, textBoxW + 40, 120);
      ctx.clip();

      const slideMetaY = (1 - metaProg) * 45;
      applyStudioCanvasTextProps(ctx, authorFont, 800, isHorizontal ? 36 : 34, direction);
      ctx.textAlign = textAlign;
      ctx.fillStyle = textPrimary;
      ctx.fillText(content.authorName.trim(), anchorX, authorY + slideMetaY);

      if (content.subtitle.trim()) {
        const subY = authorY + 42;
        applyStudioCanvasTextProps(ctx, authorFont, 600, isHorizontal ? 24 : 23, direction);
        ctx.textAlign = textAlign;
        ctx.fillStyle = textSecondary;
        ctx.fillText(content.subtitle.trim(), anchorX, subY + slideMetaY);
      }
    }

    ctx.restore();
  }

  ctx.restore();
};

