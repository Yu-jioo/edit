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
import { getCachedGradedPortrait, getCachedParchmentCanvas } from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  getEffectiveTimeline,
  hexToRgba,
  lerp,
  mixHexColor,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
} from '../utils/math';
import { mulberry32 } from '../utils/random';
import { applyStudioCanvasTextProps, layoutArabicQuote } from '../utils/textLayout';

export const MANUSCRIPT_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#F6ECD7',
  textSecondary: '#E5CF9F',
  accent: '#E09F5A',
  keyword: '#FF6B5E',
  surfaceBg: '#2C1B0E',
  border: '#E09F5A',
};

export const MANUSCRIPT_CONFIG = {
  id: 'manuscript' as const,
  mode: 'quote' as const,
  nameAr: 'مخطوطة وورق قديم',
  nameEn: 'Manuscript / Aged Paper',
  descriptionAr: 'رقعة مخطوطة تراثية بإضاءة شموع دافئة وزخارف إسلامية وصورة مؤطرة بحركة سينمائية',
  defaultAccent: '#8B4513',
  defaultKeywordColor: '#7A1C14',
  defaultQuoteFont: 'Aref Ruqaa' as ArabicFontFamily,
  defaultAuthorFont: 'Noto Naskh Arabic' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Cormorant Garamond' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Cinzel' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'style' as BackgroundMode,
  lightPalette: MANUSCRIPT_LIGHT_PALETTE,
  allowedEnglishFonts: [
    'Cormorant Garamond',
    'Playfair Display',
    'Cinzel',
    'Lora',
  ] as EnglishFontFamily[],
  colors: {
    inkDark: '#221205',
    inkRedBrown: '#7A1C14',
    inkSecondary: '#4A2B13',
    inkSubtitle: '#684120',
    borderGold: '#7B4B19',
    framePaper: '#F6ECD7',
  },
  portraitRotationDeg: -1.8,
  lineHeightRatio: 1.8,
};

interface ManuscriptMote {
  xNorm: number;
  yNorm: number;
  radius: number;
  alpha: number;
  speedX: number;
  speedY: number;
  phase: number;
}

const moteCache = new Map<number, ManuscriptMote[]>();

function getManuscriptDust(seed: number): ManuscriptMote[] {
  const cached = moteCache.get(seed);
  if (cached) return cached;
  const rng = mulberry32(seed + 2209);
  const motes: ManuscriptMote[] = [];
  for (let i = 0; i < 28; i++) {
    motes.push({
      xNorm: rng(),
      yNorm: rng(),
      radius: 1.2 + rng() * 3.2,
      alpha: 0.08 + rng() * 0.22,
      speedX: (rng() - 0.5) * 0.008,
      speedY: -0.004 - rng() * 0.01,
      phase: rng() * Math.PI * 2,
    });
  }
  moteCache.set(seed, motes);
  return motes;
}

function drawIslamicManuscriptBorder(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number,
  color: string,
  alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;

  const m = Math.round(Math.min(W, H) * 0.048);
  const midM = m + 8;
  const innerM = m + 16;
  const cornerSize = 38;

  // Outer bold manuscript rule
  ctx.lineWidth = 2.6;
  ctx.strokeRect(m, m, W - m * 2, H - m * 2);

  // Subtle middle hairline
  ctx.save();
  ctx.globalAlpha = alpha * 0.42;
  ctx.lineWidth = 0.9;
  ctx.strokeRect(midM, midM, W - midM * 2, H - midM * 2);
  ctx.restore();

  // Inner manuscript rule
  ctx.lineWidth = 1.3;
  ctx.strokeRect(innerM, innerM, W - innerM * 2, H - innerM * 2);

  const corners = [
    [m + cornerSize * 0.4, m + cornerSize * 0.4],
    [W - m - cornerSize * 0.4, m + cornerSize * 0.4],
    [m + cornerSize * 0.4, H - m - cornerSize * 0.4],
    [W - m - cornerSize * 0.4, H - m - cornerSize * 0.4],
  ];

  for (const [cx, cy] of corners) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#EFE0BE';
    ctx.beginPath();
    ctx.arc(0, 0, 23, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.7;
    ctx.stroke();

    for (let rot = 0; rot < 2; rot++) {
      ctx.save();
      ctx.rotate((rot * Math.PI) / 4);
      ctx.strokeRect(-11.5, -11.5, 23, 23);
      ctx.restore();
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

export function getManuscriptEventTimes(
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
    ? MANUSCRIPT_CONFIG.defaultEnglishQuoteFont
    : MANUSCRIPT_CONFIG.defaultQuoteFont;
  const quoteFont = custom.quoteFontOverride || defaultFont;

  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 700,
    minFontSize: isHorizontal ? 34 : 32,
    maxFontSize: isHorizontal ? 68 : 60,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: MANUSCRIPT_CONFIG.lineHeightRatio,
    boxX: isHorizontal ? W * 0.44 : W * 0.1,
    boxY: isHorizontal ? H * 0.17 : H * 0.47,
    boxWidth: isHorizontal ? W * 0.46 : W * 0.8,
    boxHeight: isHorizontal ? H * 0.5 : H * 0.33,
    align: isHorizontal ? (isLtr ? 'left' : 'right') : 'center',
    direction,
  });

  const numLines = Math.max(1, quoteLayout.lines.length);
  const wipeStart = enter * 0.18;
  const wipeEnd = enter * 0.85;
  const lineDur = (wipeEnd - wipeStart) / Math.max(1, numLines * 0.78);

  const seenGroups = new Set<number>();
  const keywordTimes: number[] = [];

  for (const rect of quoteLayout.keywordLineRects) {
    if (!seenGroups.has(rect.groupId)) {
      seenGroups.add(rect.groupId);
      const lStart = lerp(wipeStart, wipeEnd - lineDur, numLines > 1 ? rect.lineIndex / (numLines - 1) : 0);
      keywordTimes.push(Number((lStart + lineDur * 0.45 + 0.15).toFixed(3)));
    }
  }

  return { enterStart: Number((enter * 0.08).toFixed(3)), keywordTimes };
}

export const renderManuscript: PureStyleRenderer = (
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

  const rawAccent = custom.accentColor || MANUSCRIPT_CONFIG.defaultAccent;
  const accent = isBlack ? MANUSCRIPT_LIGHT_PALETTE.accent : rawAccent;
  const inkColor = isBlack ? MANUSCRIPT_LIGHT_PALETTE.textPrimary : MANUSCRIPT_CONFIG.colors.inkDark;
  const subtitleColor = isBlack ? MANUSCRIPT_LIGHT_PALETTE.textSecondary : MANUSCRIPT_CONFIG.colors.inkSubtitle;

  // In Q2 Manuscript, use deeper red-brown ink for keywords (or bright warm coral on black mode)
  const keywordInk = isBlack
    ? custom.keywordColor || MANUSCRIPT_LIGHT_PALETTE.keyword
    : custom.keywordColor || MANUSCRIPT_CONFIG.colors.inkRedBrown;

  const direction = resolveTextDirection(custom, content.quoteText);
  const isLtr = direction === 'ltr';
  const defaultQuoteFont = isLtr
    ? MANUSCRIPT_CONFIG.defaultEnglishQuoteFont
    : MANUSCRIPT_CONFIG.defaultQuoteFont;
  const defaultAuthorFont = isLtr
    ? MANUSCRIPT_CONFIG.defaultEnglishAuthorFont
    : MANUSCRIPT_CONFIG.defaultAuthorFont;
  const quoteFont = custom.quoteFontOverride || defaultQuoteFont;
  const authorFont = custom.authorFontOverride || defaultAuthorFont;

  const sceneProg = clamp(t / Math.max(0.1, total), 0, 1);
  const exitProgress = progress(t, exitStart, total);
  const masterAlpha = 1 - easeInCubic(exitProgress);
  const introAlpha = easeOutCubic(progress(t, 0, enter * 0.35)) * masterAlpha;

  // 2. Layout Coordinates (16:9 vs 9:16)
  const frameW = isHorizontal ? 380 : 340;
  const frameH = isHorizontal ? 460 : 400;
  const frameCenterX = isHorizontal ? W * 0.25 : W * 0.5;
  const frameCenterY = isHorizontal ? H * 0.5 : H * 0.27;

  const textBoxX = isHorizontal ? W * 0.44 : W * 0.1;
  const textBoxW = isHorizontal ? W * 0.46 : W * 0.8;
  const textBoxY = isHorizontal ? H * 0.17 : H * 0.47;
  const textBoxH = isHorizontal ? H * 0.5 : H * 0.33;
  const textAlign = isHorizontal ? (isLtr ? 'left' : 'right') : 'center';

  ctx.save();

  // 1. Background: Procedural Candlelit Parchment, Chroma Green, or Screen Black
  if (bgMode === 'green') {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#180D04';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = introAlpha;

    // Subtle slow cinematic push-in on the parchment texture
    const bgZoom = lerp(1.0, 1.032, sceneProg);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(bgZoom, bgZoom);
    const parchment = getCachedParchmentCanvas(W, H, custom.seed);
    ctx.drawImage(parchment, -W / 2, -H / 2, W, H);
    ctx.restore();

    // Warm floating candlelit dust motes
    const motes = getManuscriptDust(custom.seed);
    for (const m of motes) {
      const mx = ((m.xNorm + m.speedX * t) % 1 + 1) % 1;
      const my = ((m.yNorm + m.speedY * t) % 1 + 1) % 1;
      const pulse = 0.55 + 0.45 * Math.sin(t * 1.6 + m.phase);
      const px = mx * W;
      const py = my * H;
      const mGrad = ctx.createRadialGradient(px, py, 0, px, py, m.radius * 2.5);
      mGrad.addColorStop(0, `rgba(255, 232, 185, ${(m.alpha * pulse).toFixed(3)})`);
      mGrad.addColorStop(1, 'rgba(255, 232, 185, 0)');
      ctx.fillStyle = mGrad;
      ctx.beginPath();
      ctx.arc(px, py, m.radius * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    drawIslamicManuscriptBorder(ctx, W, H, accent, 0.78);
    ctx.restore();
  }

  // 3. Vintage Framed Portrait with Warm Candlelight Halo, Deep Shadow & Ken Burns Zoom
  const photoEnter = easeOutCubic(progress(t, enter * 0.08, enter * 0.6));
  const photoAlpha = photoEnter * masterAlpha;
  const kenBurnsZoom = lerp(1.0, 1.09, sceneProg);
  const kenBurnsPanX = lerp(-4, 4, sceneProg);
  const kenBurnsPanY = lerp(-3, 3, sceneProg);

  if (photoAlpha > 0.005) {
    ctx.save();
    ctx.globalAlpha = isGreen ? (photoAlpha > 0.25 ? 1 : 0) : photoAlpha;
    ctx.translate(frameCenterX, frameCenterY + (1 - photoEnter) * 24);
    const angleRad = ((MANUSCRIPT_CONFIG.portraitRotationDeg * Math.PI) / 180) * photoEnter;
    ctx.rotate(angleRad);

    // Warm candlelight ambient halo behind the framed portrait
    if (!isGreen) {
      ctx.save();
      const glowR = Math.max(frameW, frameH) * 0.78;
      const glowGrad = ctx.createRadialGradient(0, 0, frameW * 0.15, 0, 0, glowR);
      glowGrad.addColorStop(0, hexToRgba(isBlack ? accent : '#FFE3A8', isBlack ? 0.24 : 0.32));
      glowGrad.addColorStop(0.55, hexToRgba(accent, 0.1));
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Multi-layered deep archival drop shadow on the parchment
    if (!isBlack && !isGreen) {
      ctx.save();
      ctx.shadowColor = 'rgba(20, 9, 2, 0.48)';
      ctx.shadowBlur = 32;
      ctx.shadowOffsetX = 12;
      ctx.shadowOffsetY = 18;
      ctx.fillStyle = MANUSCRIPT_CONFIG.colors.framePaper;
      ctx.fillRect(-frameW / 2, -frameH / 2, frameW, frameH);
      ctx.restore();

      ctx.fillStyle = 'rgba(28, 14, 4, 0.24)';
      ctx.fillRect(-frameW / 2 + 6, -frameH / 2 + 9, frameW, frameH);
    }

    // Vintage paper mount surface with subtle warm gradient sheen
    const paperGrad = ctx.createLinearGradient(-frameW / 2, -frameH / 2, frameW / 2, frameH / 2);
    paperGrad.addColorStop(0, '#FBF3E2');
    paperGrad.addColorStop(0.55, MANUSCRIPT_CONFIG.colors.framePaper);
    paperGrad.addColorStop(1, '#EAD7B3');
    ctx.fillStyle = isGreen ? MANUSCRIPT_CONFIG.colors.framePaper : paperGrad;
    ctx.fillRect(-frameW / 2, -frameH / 2, frameW, frameH);

    // Double ornamental border on the paper mount
    ctx.strokeStyle = isGreen ? accent : hexToRgba(accent, 0.55);
    ctx.lineWidth = 2;
    ctx.strokeRect(-frameW / 2 + 8, -frameH / 2 + 8, frameW - 16, frameH - 16);

    ctx.strokeStyle = isGreen ? accent : hexToRgba(accent, 0.25);
    ctx.lineWidth = 1;
    ctx.strokeRect(-frameW / 2 + 13, -frameH / 2 + 13, frameW - 26, frameH - 26);

    const pad = 22;
    const innerW = frameW - pad * 2;
    const innerH = frameH - pad * 2 - 18;
    const innerX = -frameW / 2 + pad;
    const innerY = -frameH / 2 + pad;

    // Clipped inner portrait with continuous slow Ken Burns zoom + inner vignette
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerX, innerY, innerW, innerH);
    ctx.clip();

    const sepiaCanvas = getCachedGradedPortrait(
      content.photoSource,
      content.photoId,
      content.crop,
      innerW,
      innerH,
      'sepia'
    );
    ctx.save();
    ctx.translate(innerX + innerW / 2 + kenBurnsPanX, innerY + innerH / 2 + kenBurnsPanY);
    ctx.scale(kenBurnsZoom, kenBurnsZoom);
    ctx.drawImage(sepiaCanvas, -innerW / 2, -innerH / 2, innerW, innerH);
    ctx.restore();

    // Inner archival vignette inside the portrait box
    if (!isGreen) {
      const pCx = innerX + innerW / 2;
      const pCy = innerY + innerH / 2;
      const pRad = Math.max(innerW, innerH) * 0.68;
      const innerVig = ctx.createRadialGradient(pCx, pCy, pRad * 0.45, pCx, pCy, pRad);
      innerVig.addColorStop(0, 'rgba(30, 16, 5, 0)');
      innerVig.addColorStop(0.75, 'rgba(30, 16, 5, 0.16)');
      innerVig.addColorStop(1, 'rgba(22, 10, 2, 0.52)');
      ctx.fillStyle = innerVig;
      ctx.fillRect(innerX, innerY, innerW, innerH);
    }
    ctx.restore();

    ctx.strokeStyle = isGreen
      ? MANUSCRIPT_CONFIG.colors.inkDark
      : hexToRgba(MANUSCRIPT_CONFIG.colors.inkDark, 0.65);
    ctx.lineWidth = 1.6;
    ctx.strokeRect(innerX, innerY, innerW, innerH);

    // Archival corner photo-mounts with gold trim
    const tabSize = 24;
    const mountColor = mixHexColor(accent, '#1E1106', 0.48);
    const corners = [
      [innerX - 2, innerY - 2, 1, 1],
      [innerX + innerW + 2, innerY - 2, -1, 1],
      [innerX - 2, innerY + innerH + 2, 1, -1],
      [innerX + innerW + 2, innerY + innerH + 2, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.fillStyle = mountColor;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * tabSize, cy);
      ctx.lineTo(cx, cy + dy * tabSize);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = hexToRgba('#E5CF9F', isGreen ? 1 : 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + dx * tabSize, cy);
      ctx.lineTo(cx, cy + dy * tabSize);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 4. Quote Layout & Directional Ink Wipe Line by Line + Deeper Red-Brown Keyword Ink & Hand-Drawn Underline
  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 700,
    minFontSize: isHorizontal ? 34 : 32,
    maxFontSize: isHorizontal ? 68 : 60,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: MANUSCRIPT_CONFIG.lineHeightRatio,
    boxX: textBoxX,
    boxY: textBoxY,
    boxWidth: textBoxW,
    boxHeight: textBoxH,
    align: textAlign,
    direction,
  });

  const numLines = Math.max(1, quoteLayout.lines.length);
  const wipeStart = enter * 0.18;
  const wipeEnd = enter * 0.85;
  const lineDur = (wipeEnd - wipeStart) / Math.max(1, numLines * 0.78);

  for (let i = 0; i < quoteLayout.lines.length; i++) {
    const line = quoteLayout.lines[i];
    const lStart = lerp(wipeStart, wipeEnd - lineDur, numLines > 1 ? i / (numLines - 1) : 0);
    const lProg = easeInOutCubic(progress(t, lStart, lStart + lineDur));

    if (lProg <= 0.005) continue;

    const fullSpan = line.width + 80;
    const revealedSpan = fullSpan * lProg;

    ctx.save();
    ctx.globalAlpha = isGreen ? (masterAlpha > 0.25 ? 1 : 0) : masterAlpha;
    ctx.beginPath();
    if (isLtr) {
      const clipLeft = line.leftX - 35;
      ctx.rect(clipLeft, line.topY - 25, revealedSpan + 20, quoteLayout.lineHeight + 50);
    } else {
      const clipLeft = line.rightX + 35 - revealedSpan;
      ctx.rect(clipLeft, line.topY - 25, revealedSpan + 20, quoteLayout.lineHeight + 50);
    }
    ctx.clip();

    applyStudioCanvasTextProps(ctx, quoteLayout.fontFamily, quoteLayout.fontWeight, quoteLayout.fontSize, direction);
    ctx.textAlign = 'right';

    if (!isGreen && !isBlack) {
      ctx.shadowColor = 'rgba(255, 244, 218, 0.35)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetY = 1;
    }

    // Draw words individually so keywords use deeper red-brown ink without changing glyph widths
    for (const w of line.words) {
      const wordAppearFraction = line.width > 0
        ? (isLtr ? (w.x - line.leftX) / line.width : (line.rightX - w.x) / line.width)
        : 0;
      const wordRevealTime = lStart + lineDur * wordAppearFraction;
      const kwEmph = w.isKeyword
        ? easeOutCubic(progress(t, wordRevealTime + 0.15, wordRevealTime + 0.45))
        : 0;

      ctx.fillStyle = w.isKeyword
        ? mixHexColor(inkColor, keywordInk, kwEmph)
        : inkColor;
      ctx.fillText(w.text, w.x, w.y);
    }

    ctx.restore();

    // Hand-drawn calligraphic underline under keyword rects on this line
    const lineKwRects = quoteLayout.keywordLineRects.filter((r) => r.lineIndex === i);
    for (const rect of lineKwRects) {
      const rectAppearFrac = line.width > 0
        ? (isLtr ? (rect.leftX - line.leftX) / line.width : (line.rightX - rect.leftX) / line.width)
        : 0.5;
      const uStart = lStart + lineDur * clamp(rectAppearFrac, 0, 1) + 0.15;
      const uProg = easeOutCubic(progress(t, uStart, uStart + 0.35));
      if (uProg <= 0.01) continue;

      const uSpan = rect.width * uProg;
      const uStartX = isLtr ? rect.leftX : rect.rightX;
      const uEndX = isLtr ? rect.leftX + uSpan : rect.rightX - uSpan;
      const uY = rect.baselineY + quoteLayout.fontSize * 0.18;

      ctx.save();
      ctx.globalAlpha = isGreen ? 1 : masterAlpha * 0.92;
      ctx.strokeStyle = keywordInk;
      ctx.lineWidth = Math.max(2.5, quoteLayout.fontSize * 0.055);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(uStartX, uY);
      ctx.quadraticCurveTo(
        lerp(uStartX, uEndX, 0.5),
        uY + 3.5,
        uEndX,
        uY - 1.5
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  // 5. Author Name & Subtitle Signature Wipe Reveal
  const sigProg = easeInOutCubic(progress(t, enter * 0.72, enter));
  if (sigProg > 0.005 && content.authorName.trim()) {
    const lastLineBottom =
      quoteLayout.lines.length > 0
        ? quoteLayout.lines[quoteLayout.lines.length - 1].bottomY
        : textBoxY + textBoxH * 0.65;
    const flourishY = clamp(lastLineBottom + 34, textBoxY + 70, H - 175);
    const anchorRightX = textAlign === 'right' ? textBoxX + textBoxW : textBoxX + textBoxW * 0.8;
    const anchorX =
      textAlign === 'right'
        ? textBoxX + textBoxW
        : textAlign === 'left'
          ? textBoxX
          : textBoxX + textBoxW / 2;

    ctx.save();
    ctx.globalAlpha = isGreen ? (masterAlpha > 0.25 ? 1 : 0) : masterAlpha;

    const sigBoxW = textBoxW + 60;
    const sigRevealW = sigBoxW * sigProg;
    const sigClipLeft =
      textAlign === 'left'
        ? textBoxX - 25
        : textAlign === 'right'
          ? anchorRightX + 30 - sigRevealW
          : anchorX - 140;

    ctx.beginPath();
    ctx.rect(sigClipLeft, flourishY - 25, sigRevealW, 160);
    ctx.clip();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    const flStart =
      textAlign === 'left'
        ? anchorX
        : textAlign === 'right'
          ? anchorRightX
          : anchorX + 110;
    const flEnd =
      textAlign === 'left'
        ? anchorX + 220
        : textAlign === 'right'
          ? anchorRightX - 220
          : anchorX - 110;
    ctx.moveTo(flStart, flourishY);
    ctx.bezierCurveTo(
      lerp(flStart, flEnd, 0.35),
      flourishY - 10,
      lerp(flStart, flEnd, 0.65),
      flourishY + 10,
      flEnd,
      flourishY
    );
    ctx.stroke();

    const midFlX = (flStart + flEnd) / 2;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(midFlX, flourishY - 6);
    ctx.lineTo(midFlX + 6, flourishY);
    ctx.lineTo(midFlX, flourishY + 6);
    ctx.lineTo(midFlX - 6, flourishY);
    ctx.closePath();
    ctx.fill();

    const authorY = flourishY + 52;
    applyStudioCanvasTextProps(ctx, authorFont, 700, isHorizontal ? 36 : 34, direction);
    ctx.textAlign = textAlign;
    ctx.fillStyle = isBlack ? accent : mixHexColor(accent, MANUSCRIPT_CONFIG.colors.inkDark, 0.5);
    ctx.fillText(`— ${content.authorName.trim()}`, anchorX, authorY);

    if (content.subtitle.trim()) {
      const subY = authorY + 42;
      applyStudioCanvasTextProps(ctx, authorFont, 600, isHorizontal ? 24 : 23, direction);
      ctx.textAlign = textAlign;
      ctx.fillStyle = subtitleColor;
      ctx.fillText(content.subtitle.trim(), anchorX, subY);
    }

    ctx.restore();
  }

  ctx.restore();
};

