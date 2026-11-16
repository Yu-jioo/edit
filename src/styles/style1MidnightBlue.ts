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
import { getCachedGradedPortrait, getCachedMidnightBackdrop } from '../utils/assetCache';
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
import { combineSeed, mulberry32 } from '../utils/random';
import { applyStudioCanvasTextProps, layoutArabicQuote } from '../utils/textLayout';

export const MIDNIGHT_BLUE_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#F2F7FF',
  textSecondary: '#BBD8FF',
  accent: '#6FA8FF',
  keyword: '#FFD166',
};

export const MIDNIGHT_BLUE_CONFIG = {
  id: 'midnight-blue' as const,
  mode: 'quote' as const,
  nameAr: 'أزرق ليلي سينمائي',
  nameEn: 'Cinematic Midnight Blue',
  descriptionAr: 'تكوين ليلي سينمائي عميق مع إضاءة محيطية وظلال درامية وحركة تقريب مستمرة للبورتريه',
  defaultAccent: '#6FA8FF',
  defaultKeywordColor: '#FFD166',
  defaultQuoteFont: 'Amiri' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Playfair Display' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Outfit' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'style' as BackgroundMode,
  lightPalette: MIDNIGHT_BLUE_LIGHT_PALETTE,
  allowedEnglishFonts: [
    'Playfair Display',
    'Cinzel',
    'Lora',
    'Outfit',
    'Plus Jakarta Sans',
  ] as EnglishFontFamily[],
  colors: {
    bgEdge: '#020610',
    bgMid: '#0A1933',
    bgCenter: '#163B73',
    quoteText: '#F4F8FF',
    authorText: '#C8E1FF',
    subtitleText: '#8FB2DE',
    moonGlow: '#9CC9FF',
  },
  starCount: 115,
  dustCount: 22,
  lineHeightRatio: 1.75,
};

interface StarParticle {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  twinkleFreq: number;
  twinklePhase: number;
  isBright: boolean;
}

interface DustParticle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
}

const starCache = new Map<number, { stars: StarParticle[]; dust: DustParticle[] }>();

function getStarfield(seed: number) {
  const existing = starCache.get(seed);
  if (existing) return existing;

  const rng = mulberry32(combineSeed(seed, 101));
  const stars: StarParticle[] = [];
  for (let i = 0; i < MIDNIGHT_BLUE_CONFIG.starCount; i++) {
    const isBright = i < 16;
    stars.push({
      x: rng(),
      y: rng(),
      r: isBright ? 1.4 + rng() * 1.6 : 0.6 + rng() * 1.3,
      baseAlpha: isBright ? 0.55 + rng() * 0.45 : 0.2 + rng() * 0.55,
      twinkleFreq: 1.1 + rng() * 2.6,
      twinklePhase: rng() * Math.PI * 2,
      isBright,
    });
  }

  const dust: DustParticle[] = [];
  for (let i = 0; i < MIDNIGHT_BLUE_CONFIG.dustCount; i++) {
    dust.push({
      x: rng(),
      y: rng(),
      r: 2.2 + rng() * 5.2,
      vx: (rng() - 0.5) * 0.015,
      vy: -0.007 - rng() * 0.013,
      alpha: 0.1 + rng() * 0.22,
    });
  }

  const data = { stars, dust };
  starCache.set(seed, data);
  return data;
}

export function getMidnightBlueEventTimes(
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
    ? MIDNIGHT_BLUE_CONFIG.defaultEnglishQuoteFont
    : MIDNIGHT_BLUE_CONFIG.defaultQuoteFont;
  const quoteFont = custom.quoteFontOverride || defaultFont;

  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 700,
    minFontSize: isHorizontal ? 34 : 32,
    maxFontSize: isHorizontal ? 70 : 62,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: MIDNIGHT_BLUE_CONFIG.lineHeightRatio,
    boxX: isHorizontal ? W * 0.44 : W * 0.08,
    boxY: isHorizontal ? H * 0.16 : H * 0.43,
    boxWidth: isHorizontal ? W * 0.48 : W * 0.84,
    boxHeight: isHorizontal ? H * 0.52 : H * 0.34,
    align: isHorizontal ? (isLtr ? 'left' : 'right') : 'center',
    direction,
  });

  const totalWords = Math.max(1, quoteLayout.words.length);
  const wordsStartTime = enter * 0.22;
  const wordsEndTime = enter * 0.85;
  const wordDuration = Math.max(0.22, (wordsEndTime - wordsStartTime) * 0.45);

  const seenGroups = new Set<number>();
  const keywordTimes: number[] = [];
  for (let i = 0; i < quoteLayout.words.length; i++) {
    const w = quoteLayout.words[i];
    if (w.isKeyword && w.groupId !== null && !seenGroups.has(w.groupId)) {
      seenGroups.add(w.groupId);
      const staggerFraction = totalWords > 1 ? i / (totalWords - 1) : 0;
      const wStart = lerp(wordsStartTime, wordsEndTime - wordDuration, staggerFraction);
      keywordTimes.push(Number((wStart + 0.15).toFixed(3)));
    }
  }

  return { enterStart: Number((enter * 0.08).toFixed(3)), keywordTimes };
}

export const renderMidnightBlue: PureStyleRenderer = (
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
  const isSolidBg = bgMode === 'green' || bgMode === 'black';
  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';

  const accent = custom.accentColor || MIDNIGHT_BLUE_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || MIDNIGHT_BLUE_CONFIG.defaultKeywordColor;
  const accentLight = mixHexColor(accent, '#FFFFFF', 0.58);
  const direction = resolveTextDirection(custom, content.quoteText);
  const isLtr = direction === 'ltr';
  const defaultQuoteFont = isLtr
    ? MIDNIGHT_BLUE_CONFIG.defaultEnglishQuoteFont
    : MIDNIGHT_BLUE_CONFIG.defaultQuoteFont;
  const defaultAuthorFont = isLtr
    ? MIDNIGHT_BLUE_CONFIG.defaultEnglishAuthorFont
    : MIDNIGHT_BLUE_CONFIG.defaultAuthorFont;
  const quoteFont = custom.quoteFontOverride || defaultQuoteFont;
  const authorFont = custom.authorFontOverride || defaultAuthorFont;

  const exitProgress = progress(t, exitStart, total);
  const masterAlpha = 1 - easeInCubic(exitProgress);
  const bgFadeIn = easeOutCubic(progress(t, 0, enter * 0.45));
  const kenBurnsZoom = lerp(1.0, 1.1, clamp(t / Math.max(0.1, total), 0, 1));
  const ambientPulse = 0.92 + 0.08 * Math.sin(t * 1.6);

  ctx.save();

  // 2. Layout Coordinates (16:9 vs 9:16) with >= 6% safe margins
  const photoRadius = isHorizontal ? 215 : 182;
  const photoCenterX = isHorizontal ? W * 0.245 : W * 0.5;
  const photoCenterY = isHorizontal ? H * 0.5 : H * 0.255;

  const textBoxX = isHorizontal ? W * 0.44 : W * 0.08;
  const textBoxW = isHorizontal ? W * 0.48 : W * 0.84;
  const textBoxY = isHorizontal ? H * 0.16 : H * 0.43;
  const textBoxH = isHorizontal ? H * 0.52 : H * 0.34;
  const textAlign = isHorizontal ? (isLtr ? 'left' : 'right') : 'center';

  // 1. Background (Cinematic Sky + Volumetric Glow + Stars, or Pure Solid Green / Black)
  if (bgMode === 'green') {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = MIDNIGHT_BLUE_CONFIG.colors.bgEdge;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = bgFadeIn * masterAlpha;

    // Subtle slow drift on the sky backdrop itself
    const skyScale = lerp(1.0, 1.04, clamp(t / Math.max(0.1, total), 0, 1));
    const skyW = W * skyScale;
    const skyH = H * skyScale;
    const skyBackdrop = getCachedMidnightBackdrop(W, H);
    ctx.drawImage(skyBackdrop, (W - skyW) / 2, (H - skyH) / 2, skyW, skyH);

    // Ambient atmospheric pool behind the text & portrait composition
    const poolGrad = ctx.createRadialGradient(
      isHorizontal ? W * 0.35 : W * 0.5,
      isHorizontal ? H * 0.5 : H * 0.36,
      photoRadius * 0.2,
      isHorizontal ? W * 0.45 : W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.58
    );
    poolGrad.addColorStop(0, hexToRgba(accent, 0.16 * ambientPulse));
    poolGrad.addColorStop(0.5, hexToRgba(MIDNIGHT_BLUE_CONFIG.colors.bgCenter, 0.1));
    poolGrad.addColorStop(1, 'rgba(2, 6, 16, 0)');
    ctx.fillStyle = poolGrad;
    ctx.fillRect(0, 0, W, H);

    // Seeded starfield & drifting soft-blue bokeh dust
    const { stars, dust } = getStarfield(custom.seed);
    const starsIntro = easeOutCubic(progress(t, 0.05, enter * 0.75));

    ctx.fillStyle = '#E6F2FF';
    for (const s of stars) {
      const osc = 0.5 + 0.5 * Math.sin(t * s.twinkleFreq + s.twinklePhase);
      ctx.globalAlpha = s.baseAlpha * osc * starsIntro * masterAlpha;
      const sx = s.x * W;
      const sy = s.y * H;
      if (s.isBright) {
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(sx, sy, s.r * 1.5, s.r * 1.5);
      }
    }

    for (const d of dust) {
      const px = (((d.x + d.vx * t) % 1) + 1) % 1;
      const py = (((d.y + d.vy * t) % 1) + 1) % 1;
      const dx = px * W;
      const dy = py * H;
      const bokeh = ctx.createRadialGradient(dx, dy, 0, dx, dy, d.r * 2.4);
      bokeh.addColorStop(0, hexToRgba(accentLight, d.alpha * starsIntro * masterAlpha));
      bokeh.addColorStop(1, hexToRgba(accentLight, 0));
      ctx.fillStyle = bokeh;
      ctx.beginPath();
      ctx.arc(dx, dy, d.r * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle cinematic framing hairlines (top & bottom widescreen accents)
    const frameInsetX = W * 0.055;
    const frameInsetY = H * 0.055;
    const frameLineGrad = ctx.createLinearGradient(frameInsetX, 0, W - frameInsetX, 0);
    frameLineGrad.addColorStop(0, hexToRgba(accent, 0));
    frameLineGrad.addColorStop(0.2, hexToRgba(accentLight, 0.18));
    frameLineGrad.addColorStop(0.8, hexToRgba(accentLight, 0.18));
    frameLineGrad.addColorStop(1, hexToRgba(accent, 0));
    ctx.strokeStyle = frameLineGrad;
    ctx.lineWidth = 1;
    ctx.globalAlpha = starsIntro * masterAlpha;
    ctx.beginPath();
    ctx.moveTo(frameInsetX, frameInsetY);
    ctx.lineTo(W - frameInsetX, frameInsetY);
    ctx.moveTo(frameInsetX, H - frameInsetY);
    ctx.lineTo(W - frameInsetX, H - frameInsetY);
    ctx.stroke();

    ctx.restore();
  }

  // 3. Cinematic Portrait Integration (Deep Shadow + Ambient Backlight + Ken Burns Zoom + Inner Vignette)
  const photoEnter = easeOutCubic(progress(t, enter * 0.06, enter * 0.68));
  const photoScale = lerp(0.88, 1.0, photoEnter);
  const photoAlpha = photoEnter * masterAlpha;

  if (photoAlpha > 0.005) {
    ctx.save();
    ctx.globalAlpha = isGreen ? (photoAlpha > 0.25 ? 1 : 0) : photoAlpha;
    ctx.translate(photoCenterX, photoCenterY);
    ctx.scale(photoScale, photoScale);

    // 3a. Multi-layered Ambient Backlight Halo (omitted on Chroma Green)
    if (!isGreen) {
      const outerGlowR = photoRadius * 2.15;
      const glow = ctx.createRadialGradient(0, 0, photoRadius * 0.5, 0, 0, outerGlowR);
      glow.addColorStop(0, hexToRgba(MIDNIGHT_BLUE_CONFIG.colors.moonGlow, 0.38 * ambientPulse));
      glow.addColorStop(0.42, hexToRgba(accent, 0.18 * ambientPulse));
      glow.addColorStop(0.75, hexToRgba(accent, 0.05));
      glow.addColorStop(1, hexToRgba(accent, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, outerGlowR, 0, Math.PI * 2);
      ctx.fill();

      // Deep cinematic drop shadow beneath the portrait
      if (!isBlack) {
        const shadowGrad = ctx.createRadialGradient(
          8,
          18,
          photoRadius * 0.65,
          8,
          18,
          photoRadius * 1.28
        );
        shadowGrad.addColorStop(0, 'rgba(1, 3, 10, 0.85)');
        shadowGrad.addColorStop(0.6, 'rgba(2, 5, 16, 0.45)');
        shadowGrad.addColorStop(1, 'rgba(2, 5, 16, 0)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(8, 18, photoRadius * 1.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3b. Portrait with Continuous Ken Burns Slow Zoom + Inner Chiaroscuro Vignette
    const portraitDiameter = photoRadius * 2;
    const cachedPortrait = getCachedGradedPortrait(
      content.photoSource,
      content.photoId,
      content.crop,
      portraitDiameter,
      portraitDiameter,
      'teal-orange'
    );

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, photoRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const kbDiameter = portraitDiameter * kenBurnsZoom;
    ctx.drawImage(
      cachedPortrait,
      -kbDiameter / 2,
      -kbDiameter / 2,
      kbDiameter,
      kbDiameter
    );

    // Subtle inner vignette & moonlight rim tint inside the portrait circle
    if (!isGreen) {
      const innerVig = ctx.createRadialGradient(
        -photoRadius * 0.15,
        -photoRadius * 0.15,
        photoRadius * 0.45,
        0,
        0,
        photoRadius
      );
      innerVig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      innerVig.addColorStop(0.72, 'rgba(4, 12, 28, 0.22)');
      innerVig.addColorStop(1, 'rgba(2, 6, 18, 0.68)');
      ctx.fillStyle = innerVig;
      ctx.fillRect(-photoRadius, -photoRadius, portraitDiameter, portraitDiameter);
    }
    ctx.restore();

    // 3c. Sculpted Dual Concentric Specular Rings
    const ringGrad = ctx.createLinearGradient(
      -photoRadius,
      -photoRadius,
      photoRadius,
      photoRadius
    );
    ringGrad.addColorStop(0, '#FFFFFF');
    ringGrad.addColorStop(0.35, accentLight);
    ringGrad.addColorStop(0.7, accent);
    ringGrad.addColorStop(1, isGreen ? accent : hexToRgba(accentLight, 0.35));
    ctx.strokeStyle = ringGrad;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, photoRadius + 2, 0, Math.PI * 2);
    ctx.stroke();

    if (!isGreen) {
      ctx.strokeStyle = hexToRgba(accentLight, 0.26);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, photoRadius + 15, 0, Math.PI * 2);
      ctx.stroke();

      // Subtle crescent rim highlight arc along top-left
      ctx.strokeStyle = hexToRgba('#FFFFFF', 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, photoRadius - 4, Math.PI * 0.95, Math.PI * 1.48);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 4. Quote Layout
  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 700,
    minFontSize: isHorizontal ? 34 : 32,
    maxFontSize: isHorizontal ? 70 : 62,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: MIDNIGHT_BLUE_CONFIG.lineHeightRatio,
    boxX: textBoxX,
    boxY: textBoxY,
    boxWidth: textBoxW,
    boxHeight: textBoxH,
    align: textAlign,
    direction,
  });

  // 5. Quote Text — Cinematic Staggered Reveal + Soft Depth Shadow + Luminous Keyword Emphasis
  const totalWords = Math.max(1, quoteLayout.words.length);
  const wordsStartTime = enter * 0.2;
  const wordsEndTime = enter * 0.84;
  const wordDuration = Math.max(0.24, (wordsEndTime - wordsStartTime) * 0.46);

  ctx.save();
  applyStudioCanvasTextProps(
    ctx,
    quoteLayout.fontFamily,
    quoteLayout.fontWeight,
    quoteLayout.fontSize,
    direction
  );
  ctx.textAlign = 'right';

  for (let i = 0; i < quoteLayout.words.length; i++) {
    const word = quoteLayout.words[i];
    const staggerFraction = totalWords > 1 ? i / (totalWords - 1) : 0;
    const wStart = lerp(wordsStartTime, wordsEndTime - wordDuration, staggerFraction);
    const wProg = easeOutCubic(progress(t, wStart, wStart + wordDuration));
    const wAlpha = wProg * masterAlpha;

    if (wAlpha <= 0.005) continue;

    const riseOffset = (1 - wProg) * 16;
    const wy = word.y + riseOffset;

    // Multi-layered cinematic drop shadow for crisp separation (omitted in black mode)
    if (!isBlack) {
      ctx.globalAlpha = isGreen ? (wAlpha > 0.4 ? 1 : 0) : wAlpha * 0.65;
      ctx.fillStyle = '#02050E';
      ctx.fillText(word.text, word.x + 2, wy + 4);
    }

    // Keyword emphasis
    const kwProg = word.isKeyword
      ? easeOutCubic(progress(t, wStart + 0.14, wStart + 0.45))
      : 0;

    if (word.isKeyword && kwProg > 0.01) {
      if (!isGreen) {
        ctx.save();
        ctx.shadowColor = hexToRgba(keywordColor, 0.78 * kwProg);
        ctx.shadowBlur = 18 * kwProg;
        ctx.globalAlpha = wAlpha;
        ctx.fillStyle = mixHexColor(MIDNIGHT_BLUE_CONFIG.colors.quoteText, keywordColor, kwProg);
        ctx.fillText(word.text, word.x, wy);
        ctx.restore();
      } else {
        ctx.globalAlpha = wAlpha > 0.25 ? 1 : 0;
        ctx.fillStyle = keywordColor;
        ctx.fillText(word.text, word.x, wy);
      }

      // Luminous directional underline sweep under keyword
      const uW = word.width * kwProg;
      const uX = isLtr ? word.x - word.width : word.x - uW;
      ctx.globalAlpha = isGreen ? 1 : wAlpha * 0.92;
      ctx.fillStyle = keywordColor;
      ctx.fillRect(uX, wy + quoteLayout.fontSize * 0.16, uW, 3.2);
    } else {
      ctx.globalAlpha = isGreen ? (wAlpha > 0.25 ? 1 : 0) : wAlpha;
      ctx.fillStyle = MIDNIGHT_BLUE_CONFIG.colors.quoteText;
      ctx.fillText(word.text, word.x, wy);
    }
  }
  ctx.restore();

  // 6. Luminous Horizon Divider, Author Name & Subtitle
  const metaEnter = easeOutCubic(progress(t, enter * 0.66, enter));
  const metaAlpha = metaEnter * masterAlpha;

  if (metaAlpha > 0.005 && content.authorName.trim()) {
    ctx.save();
    ctx.globalAlpha = isGreen ? (metaAlpha > 0.25 ? 1 : 0) : metaAlpha;

    const lastLineBottom =
      quoteLayout.lines.length > 0
        ? quoteLayout.lines[quoteLayout.lines.length - 1].bottomY
        : textBoxY + textBoxH * 0.6;
    const dividerY = clamp(lastLineBottom + 36, textBoxY + 80, H - 170);
    const dividerLen = isHorizontal ? 280 : 230;

    let lineStartX: number;
    let lineEndX: number;

    if (textAlign === 'left') {
      lineStartX = textBoxX;
      lineEndX = lineStartX + dividerLen * metaEnter;
    } else if (textAlign === 'right') {
      lineStartX = textBoxX + textBoxW;
      lineEndX = lineStartX - dividerLen * metaEnter;
    } else {
      const half = (dividerLen * metaEnter) / 2;
      const mid = textBoxX + textBoxW / 2;
      lineStartX = mid - half;
      lineEndX = mid + half;
    }

    if (isGreen) {
      ctx.strokeStyle = accent;
    } else {
      const lineGrad = ctx.createLinearGradient(lineStartX, dividerY, lineEndX, dividerY);
      lineGrad.addColorStop(0, '#FFFFFF');
      lineGrad.addColorStop(0.25, accentLight);
      lineGrad.addColorStop(0.7, accent);
      lineGrad.addColorStop(1, hexToRgba(accent, 0));
      ctx.strokeStyle = lineGrad;
    }

    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(lineStartX, dividerY);
    ctx.lineTo(lineEndX, dividerY);
    ctx.stroke();

    // Small luminous diamond accent at the start of the divider line
    const diamondX = textAlign === 'center' ? (lineStartX + lineEndX) / 2 : lineStartX;
    ctx.fillStyle = isGreen ? accent : '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(diamondX, dividerY - 5);
    ctx.lineTo(diamondX + 5, dividerY);
    ctx.lineTo(diamondX, dividerY + 5);
    ctx.lineTo(diamondX - 5, dividerY);
    ctx.closePath();
    ctx.fill();

    const authorY = dividerY + 52 + (1 - metaEnter) * 12;
    const anchorX =
      textAlign === 'right'
        ? textBoxX + textBoxW
        : textAlign === 'left'
          ? textBoxX
          : textBoxX + textBoxW / 2;
    applyStudioCanvasTextProps(ctx, authorFont, 700, isHorizontal ? 36 : 34, direction);
    ctx.textAlign = textAlign;
    if (!isBlack && !isGreen) {
      ctx.fillStyle = 'rgba(2, 5, 14, 0.75)';
      ctx.fillText(content.authorName.trim(), anchorX + 2, authorY + 3);
    }
    ctx.fillStyle = mixHexColor(accent, '#FFFFFF', 0.55);
    ctx.fillText(content.authorName.trim(), anchorX, authorY);

    if (content.subtitle.trim()) {
      const subY = authorY + 42;
      applyStudioCanvasTextProps(ctx, authorFont, 500, isHorizontal ? 25 : 24, direction);
      ctx.textAlign = textAlign;
      ctx.fillStyle = MIDNIGHT_BLUE_CONFIG.colors.subtitleText;
      ctx.fillText(content.subtitle.trim(), anchorX, subY);
    }

    ctx.restore();
  }

  ctx.restore();
};
