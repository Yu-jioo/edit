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
import { getCachedBlurredBackdrop, getCachedGradedPortrait } from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeOutCubic,
  getEffectiveTimeline,
  hexToRgba,
  lerp,
  mixHexColor,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
} from '../utils/math';
import { applyStudioCanvasTextProps, layoutArabicQuote } from '../utils/textLayout';

export const GLASSMORPHISM_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#FFFFFF',
  textSecondary: '#E0F2FE',
  accent: '#38BDF8',
  keyword: '#FDE047',
  border: 'rgba(255, 255, 255, 0.45)',
};

export const GLASSMORPHISM_CONFIG = {
  id: 'glassmorphism' as const,
  mode: 'quote' as const,
  nameAr: 'زجاجي',
  nameEn: 'Glassmorphism',
  descriptionAr: 'خلفية ضبابية متحركة مع لوح زجاجي مصنفر أنيق وصورة حادة متداخلة مع الحافة',
  defaultAccent: '#38BDF8',
  defaultKeywordColor: '#FDE047',
  defaultQuoteFont: 'IBM Plex Sans Arabic' as ArabicFontFamily,
  defaultAuthorFont: 'Tajawal' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Outfit' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'style' as BackgroundMode,
  lightPalette: GLASSMORPHISM_LIGHT_PALETTE,
  allowedEnglishFonts: [
    'Outfit',
    'Plus Jakarta Sans',
    'Manrope',
    'Share Tech Mono',
  ] as EnglishFontFamily[],
  colors: {
    textWhite: '#FFFFFF',
    textAuthor: '#E0F2FE',
    textSubtitle: 'rgba(224, 242, 254, 0.72)',
    glassOverlay: 'rgba(255, 255, 255, 0.12)',
    glassBorder: 'rgba(255, 255, 255, 0.28)',
  },
  lineHeightRatio: 1.72,
};

export function getGlassmorphismEventTimes(
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
    ? GLASSMORPHISM_CONFIG.defaultEnglishQuoteFont
    : GLASSMORPHISM_CONFIG.defaultQuoteFont;
  const quoteFont = custom.quoteFontOverride || defaultFont;

  const panelX = isHorizontal ? W * 0.22 : W * 0.08;
  const panelY = isHorizontal ? H * 0.16 : H * 0.34;
  const panelW = isHorizontal ? W * 0.68 : W * 0.84;
  const panelH = isHorizontal ? H * 0.68 : H * 0.52;
  const portraitSize = isHorizontal ? 330 : 280;

  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 700,
    minFontSize: isHorizontal ? 32 : 30,
    maxFontSize: isHorizontal ? 62 : 56,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: GLASSMORPHISM_CONFIG.lineHeightRatio,
    boxX: isHorizontal ? panelX + portraitSize * 0.68 : panelX + 48,
    boxY: isHorizontal ? panelY + 56 : panelY + portraitSize * 0.45 + 24,
    boxWidth: isHorizontal ? panelW - portraitSize * 0.68 - 72 : panelW - 96,
    boxHeight: isHorizontal ? panelH - 185 : panelH - portraitSize * 0.45 - 165,
    align: isHorizontal ? (isLtr ? 'left' : 'right') : 'center',
    direction,
  });

  const totalWords = Math.max(1, quoteLayout.words.length);
  const wordRevealStart = enter * 0.22;
  const wordRevealEnd = enter * 0.72;
  const wordInterval = (wordRevealEnd - wordRevealStart) / totalWords;

  const seenGroups = new Set<number>();
  const keywordTimes: number[] = [];

  for (const w of quoteLayout.words) {
    if (w.isKeyword && w.groupId !== null && !seenGroups.has(w.groupId)) {
      seenGroups.add(w.groupId);
      const wTime = wordRevealStart + w.globalWordIndex * wordInterval;
      keywordTimes.push(Number((wTime + 0.08).toFixed(3)));
    }
  }

  return { enterStart: Number((enter * 0.1).toFixed(3)), keywordTimes };
}

export const renderGlassmorphism: PureStyleRenderer = (
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
  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';

  const accent = custom.accentColor || GLASSMORPHISM_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || GLASSMORPHISM_CONFIG.defaultKeywordColor;
  const direction = resolveTextDirection(custom, content.quoteText);
  const isLtr = direction === 'ltr';
  const quoteFont =
    custom.quoteFontOverride ||
    (isLtr ? GLASSMORPHISM_CONFIG.defaultEnglishQuoteFont : GLASSMORPHISM_CONFIG.defaultQuoteFont);
  const authorFont =
    custom.authorFontOverride ||
    (isLtr ? GLASSMORPHISM_CONFIG.defaultEnglishAuthorFont : GLASSMORPHISM_CONFIG.defaultAuthorFont);

  const exitProgress = progress(t, exitStart, total);
  const masterAlpha = 1 - easeInCubic(exitProgress);
  const bgIntro = easeOutCubic(progress(t, 0, enter * 0.45));

  // Slow Ken Burns zoom over the whole timeline (1.04 -> 1.15)
  const kenBurnsScale = lerp(1.04, 1.15, progress(t, 0, total));

  ctx.save();

  // 1. Full-Frame Blurred Background with Slow Ken Burns Zoom (or Pure Solid Green / Black)
  if (bgMode === 'green') {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    const blurredBg = getCachedBlurredBackdrop(
      content.photoSource,
      content.photoId,
      content.crop,
      W,
      H
    );
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = bgIntro * masterAlpha;
    const scaledW = W * kenBurnsScale;
    const scaledH = H * kenBurnsScale;
    const offsetX = (W - scaledW) / 2;
    const offsetY = (H - scaledH) / 2;
    ctx.drawImage(blurredBg, offsetX, offsetY, scaledW, scaledH);

    const ambient = ctx.createRadialGradient(W * 0.8, H * 0.2, 20, W * 0.8, H * 0.2, W * 0.55);
    ambient.addColorStop(0, hexToRgba(accent, 0.22));
    ambient.addColorStop(1, hexToRgba(accent, 0));
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 2. Frosted Glass Panel Geometry & Overlapping Framed Portrait Coordinates
  const panelX = isHorizontal ? W * 0.22 : W * 0.08;
  const panelY = isHorizontal ? H * 0.16 : H * 0.34;
  const panelW = isHorizontal ? W * 0.68 : W * 0.84;
  const panelH = isHorizontal ? H * 0.68 : H * 0.52;
  const panelRadius = 36;

  // Sharp framed portrait beside/above the text
  const portraitSize = isHorizontal ? 330 : 280;
  const portraitX = isHorizontal ? panelX - portraitSize * 0.38 : W * 0.5 - portraitSize / 2;
  const portraitY = isHorizontal
    ? H * 0.5 - portraitSize / 2
    : panelY - portraitSize * 0.55;

  const textBoxX = isHorizontal ? panelX + portraitSize * 0.68 : panelX + 48;
  const textBoxW = isHorizontal ? panelW - portraitSize * 0.68 - 72 : panelW - 96;
  const textBoxY = isHorizontal ? panelY + 56 : panelY + portraitSize * 0.45 + 24;
  const textBoxH = isHorizontal ? panelH - 185 : panelH - portraitSize * 0.45 - 165;
  const textAlign = isHorizontal ? (isLtr ? 'left' : 'right') : 'center';

  // 3. Draw Frosted Glass Panel (slides & fades in)
  const panelProg = easeOutCubic(progress(t, enter * 0.1, enter * 0.62));
  const panelSlideY = (1 - panelProg) * 42;

  if (panelProg > 0.005) {
    ctx.save();
    ctx.globalAlpha = isGreen ? (panelProg * masterAlpha > 0.25 ? 1 : 0) : panelProg * masterAlpha;
    ctx.translate(0, panelSlideY);

    if (bgMode === 'style') {
      const blurredBg = getCachedBlurredBackdrop(
        content.photoSource,
        content.photoId,
        content.crop,
        W,
        H
      );
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.roundRect(panelX + 4, panelY + 18, panelW, panelH, panelRadius);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, panelRadius);
      ctx.clip();

      const refractScale = kenBurnsScale * 1.06;
      const rW = W * refractScale;
      const rH = H * refractScale;
      ctx.drawImage(blurredBg, (W - rW) / 2, (H - rH) / 2 - panelSlideY, rW, rH);

      const sheen = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
      sheen.addColorStop(0, 'rgba(255, 255, 255, 0.17)');
      sheen.addColorStop(0.5, GLASSMORPHISM_CONFIG.colors.glassOverlay);
      sheen.addColorStop(1, hexToRgba(accent, 0.1));
      ctx.fillStyle = sheen;
      ctx.fillRect(panelX, panelY, panelW, panelH);
      ctx.restore();
    } else if (isGreen) {
      // On green screen: hard-edged opaque dark card so text and card key cleanly with zero green spill
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, panelRadius);
      ctx.fill();
    } else if (isBlack) {
      // On black Screen mode: no dark fill, only luminous glass sheen & specular frame
      const sheen = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
      sheen.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
      sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)');
      sheen.addColorStop(1, hexToRgba(accent, 0.14));
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, panelRadius);
      ctx.fill();
    }

    // Thin specular border around frosted panel
    if (isGreen) {
      ctx.strokeStyle = accent;
    } else {
      const borderGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
      borderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      borderGrad.addColorStop(0.5, GLASSMORPHISM_CONFIG.colors.glassBorder);
      borderGrad.addColorStop(1, hexToRgba(accent, 0.45));
      ctx.strokeStyle = borderGrad;
    }
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, panelRadius);
    ctx.stroke();

    ctx.restore();
  }

  // 4. Quote Text Appears Word by Word Sequentially + Keyword Emphasis
  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 700,
    minFontSize: isHorizontal ? 32 : 30,
    maxFontSize: isHorizontal ? 62 : 56,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: GLASSMORPHISM_CONFIG.lineHeightRatio,
    boxX: textBoxX,
    boxY: textBoxY,
    boxWidth: textBoxW,
    boxHeight: textBoxH,
    align: textAlign,
    direction,
  });

  const totalWords = Math.max(1, quoteLayout.words.length);
  const wordRevealStart = enter * 0.22;
  const wordRevealEnd = enter * 0.72;
  const wordInterval = (wordRevealEnd - wordRevealStart) / totalWords;

  ctx.save();
  applyStudioCanvasTextProps(ctx, quoteLayout.fontFamily, quoteLayout.fontWeight, quoteLayout.fontSize, direction);
  ctx.textAlign = 'right';

  for (const w of quoteLayout.words) {
    const wTime = wordRevealStart + w.globalWordIndex * wordInterval;
    if (t < wTime) continue;

    const wProg = easeOutCubic(progress(t, wTime, wTime + 0.22));
    if (wProg <= 0.005) continue;

    const wordOffsetY = isGreen ? panelSlideY * 0.5 : (1 - wProg) * 14 + panelSlideY * 0.5;
    const wy = w.y + wordOffsetY;
    const wordAlpha = isGreen ? (wProg * masterAlpha > 0.25 ? 1 : 0) : wProg * masterAlpha;

    if (!isBlack) {
      ctx.globalAlpha = isGreen ? wordAlpha : wordAlpha * 0.4;
      ctx.fillStyle = '#020617';
      ctx.fillText(w.text, w.x + 2, wy + 3);
    }

    const kwEmph = w.isKeyword
      ? easeOutCubic(progress(t, wTime + 0.08, wTime + 0.34))
      : 0;

    if (w.isKeyword && kwEmph > 0.01) {
      if (!isGreen) {
        ctx.save();
        ctx.shadowColor = hexToRgba(keywordColor, 0.7 * kwEmph);
        ctx.shadowBlur = 14 * kwEmph;
        ctx.globalAlpha = wordAlpha;
        ctx.fillStyle = mixHexColor(GLASSMORPHISM_CONFIG.colors.textWhite, keywordColor, kwEmph);
        ctx.fillText(w.text, w.x, wy);
        ctx.restore();
      } else {
        ctx.globalAlpha = wordAlpha;
        ctx.fillStyle = keywordColor;
        ctx.fillText(w.text, w.x, wy);
      }

      const uW = w.width * kwEmph;
      const uX = isLtr ? w.x - w.width : w.x - uW;
      ctx.globalAlpha = isGreen ? 1 : wordAlpha * 0.9;
      ctx.fillStyle = keywordColor;
      ctx.fillRect(uX, wy + quoteLayout.fontSize * 0.16, uW, 3);
    } else {
      ctx.globalAlpha = wordAlpha;
      ctx.fillStyle = GLASSMORPHISM_CONFIG.colors.textWhite;
      ctx.fillText(w.text, w.x, wy);
    }
  }
  ctx.restore();

  // 5. Author Name & Subtitle Inside Frosted Panel
  const metaProg = easeOutCubic(progress(t, enter * 0.65, enter));
  if (metaProg > 0.005 && content.authorName.trim()) {
    ctx.save();
    ctx.globalAlpha = isGreen ? (metaProg * masterAlpha > 0.25 ? 1 : 0) : metaProg * masterAlpha;

    const lastBottom =
      quoteLayout.lines.length > 0
        ? quoteLayout.lines[quoteLayout.lines.length - 1].bottomY
        : textBoxY + textBoxH * 0.7;
    const dividerY = clamp(lastBottom + 24, textBoxY + 60, panelY + panelH - 110);
    const anchorX = textAlign === 'right' ? textBoxX + textBoxW : (textAlign === 'left' ? textBoxX : textBoxX + textBoxW / 2);

    const barW = 72 * metaProg;
    const barX = textAlign === 'right' ? anchorX - barW : (textAlign === 'left' ? anchorX : anchorX - barW / 2);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(barX, dividerY, barW, 4, 2);
    ctx.fill();

    const authorY = dividerY + 44 + (1 - metaProg) * 14;
    applyStudioCanvasTextProps(ctx, authorFont, 700, isHorizontal ? 34 : 32, direction);
    ctx.textAlign = textAlign;
    ctx.fillStyle = mixHexColor(accent, '#FFFFFF', 0.65);
    ctx.fillText(content.authorName.trim(), anchorX, authorY);

    if (content.subtitle.trim()) {
      const subY = authorY + 38;
      applyStudioCanvasTextProps(ctx, authorFont, 500, isHorizontal ? 23 : 22, direction);
      ctx.textAlign = textAlign;
      ctx.fillStyle = isGreen ? '#E0F2FE' : GLASSMORPHISM_CONFIG.colors.textSubtitle;
      ctx.fillText(content.subtitle.trim(), anchorX, subY);
    }

    ctx.restore();
  }

  // 6. Sharp Portrait in Rounded Frame Beside / Above Text (Shown in all backgrounds including solid green/black)
  const portraitProg = easeOutCubic(progress(t, enter * 0.22, enter * 0.78));
  if (portraitProg > 0.005) {
    ctx.save();
    ctx.globalAlpha = isGreen
      ? portraitProg * masterAlpha > 0.25
        ? 1
        : 0
      : portraitProg * masterAlpha;
    const cx = portraitX + portraitSize / 2;
    const cy = portraitY + portraitSize / 2 + panelSlideY * 0.35;
    const popScale = lerp(0.78, 1.0, portraitProg);

    ctx.translate(cx, cy);
    ctx.scale(popScale, popScale);

    const frameRadius = 32;

    if (!isBlack && !isGreen) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.roundRect(
        -portraitSize / 2 + 6,
        -portraitSize / 2 + 14,
        portraitSize,
        portraitSize,
        frameRadius
      );
      ctx.fill();
    }

    const portraitCanvas = getCachedGradedPortrait(
      content.photoSource,
      content.photoId,
      content.crop,
      portraitSize,
      portraitSize,
      'normal'
    );
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-portraitSize / 2, -portraitSize / 2, portraitSize, portraitSize, frameRadius);
    ctx.clip();
    ctx.drawImage(portraitCanvas, -portraitSize / 2, -portraitSize / 2, portraitSize, portraitSize);
    ctx.restore();

    if (isGreen) {
      ctx.strokeStyle = '#FFFFFF';
    } else {
      const pBorder = ctx.createLinearGradient(
        -portraitSize / 2,
        -portraitSize / 2,
        portraitSize / 2,
        portraitSize / 2
      );
      pBorder.addColorStop(0, '#FFFFFF');
      pBorder.addColorStop(0.5, accent);
      pBorder.addColorStop(1, 'rgba(255, 255, 255, 0.45)');
      ctx.strokeStyle = pBorder;
    }
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(-portraitSize / 2, -portraitSize / 2, portraitSize, portraitSize, frameRadius);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
};
