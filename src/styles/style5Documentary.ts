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
import { getCachedFilmGrainTile, getCachedGradedPortrait } from '../utils/assetCache';
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

export const DOCUMENTARY_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#F4F4F6',
  textSecondary: '#CBD5E1',
  accent: '#F59E0B',
  keyword: '#FBBF24',
  surfaceBg: 'rgba(255, 255, 255, 0.08)',
  border: '#F59E0B',
};

export const DOCUMENTARY_CONFIG = {
  id: 'documentary' as const,
  mode: 'quote' as const,
  nameAr: 'وثائقي',
  nameEn: 'Documentary',
  descriptionAr: 'شاشة منقسمة بأسلوب الأفلام الوثائقية مع صورة أبيض وأسود ومؤشر كتابة وشريط تعريفي سفلي',
  defaultAccent: '#F59E0B',
  defaultKeywordColor: '#FBBF24',
  defaultQuoteFont: 'Noto Naskh Arabic' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Lora' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Playfair Display' as EnglishFontFamily,
  allowedEnglishFonts: ['Lora', 'Playfair Display', 'Plus Jakarta Sans', 'Outfit', 'Cinzel'] as EnglishFontFamily[],
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'style' as BackgroundMode,
  lightPalette: DOCUMENTARY_LIGHT_PALETTE,
  colors: {
    panelBg: '#121316',
    panelSecondary: '#1A1C21',
    quoteText: '#F4F4F6',
    lowerThirdBg: 'rgba(18, 19, 22, 0.92)',
    authorText: '#FFFFFF',
    subtitleText: '#A1A7B5',
  },
  lineHeightRatio: 1.78,
};

export function getDocumentaryEventTimes(
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
  const quoteFont =
    custom.quoteFontOverride ||
    (isLtr ? DOCUMENTARY_CONFIG.defaultEnglishQuoteFont : DOCUMENTARY_CONFIG.defaultQuoteFont);

  const letterboxH = Math.round(H * 0.035);
  const photoAreaW = isHorizontal ? Math.round(W * 0.44) : W;
  const photoAreaH = isHorizontal ? H - letterboxH * 2 : Math.round((H - letterboxH * 2) * 0.43);
  const quotePanelX = isHorizontal ? photoAreaW : 0;
  const quotePanelY = isHorizontal ? letterboxH : letterboxH + photoAreaH;
  const quotePanelW = isHorizontal ? W - photoAreaW : W;
  const quotePanelH = isHorizontal ? H - letterboxH * 2 : H - letterboxH - quotePanelY;
  const padX = Math.round(quotePanelW * 0.1);

  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 600,
    minFontSize: isHorizontal ? 32 : 30,
    maxFontSize: isHorizontal ? 60 : 54,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: DOCUMENTARY_CONFIG.lineHeightRatio,
    boxX: quotePanelX + padX,
    boxY: quotePanelY + (isHorizontal ? quotePanelH * 0.14 : quotePanelH * 0.08),
    boxWidth: quotePanelW - padX * 2,
    boxHeight: isHorizontal ? quotePanelH * 0.54 : quotePanelH * 0.52,
    align: isLtr ? 'left' : 'right',
    direction,
  });

  const totalWords = Math.max(1, quoteLayout.words.length);
  const typeStart = enter * 0.18;
  const typeEnd = enter * 0.92;

  const seenGroups = new Set<number>();
  const keywordTimes: number[] = [];
  for (let i = 0; i < quoteLayout.words.length; i++) {
    const w = quoteLayout.words[i];
    if (w.isKeyword && w.groupId !== null && !seenGroups.has(w.groupId)) {
      seenGroups.add(w.groupId);
      const wordT = lerp(typeStart, typeEnd, i / totalWords);
      keywordTimes.push(Number((wordT + 0.15).toFixed(3)));
    }
  }

  return { enterStart: 0.05, keywordTimes };
}

export const renderDocumentary: PureStyleRenderer = (
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

  const accent = custom.accentColor || DOCUMENTARY_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || DOCUMENTARY_CONFIG.defaultKeywordColor;
  const direction = resolveTextDirection(custom, content.quoteText);
  const isLtr = direction === 'ltr';
  const quoteFont =
    custom.quoteFontOverride ||
    (isLtr ? DOCUMENTARY_CONFIG.defaultEnglishQuoteFont : DOCUMENTARY_CONFIG.defaultQuoteFont);
  const authorFont =
    custom.authorFontOverride ||
    (isLtr ? DOCUMENTARY_CONFIG.defaultEnglishAuthorFont : DOCUMENTARY_CONFIG.defaultAuthorFont);

  const exitProgress = progress(t, exitStart, total);
  const masterAlpha = 1 - easeInCubic(exitProgress);
  const frameIndex = Math.floor(t * 30);

  // Subtle thin letterbox height (3.5% top and bottom) — removed on solid backgrounds
  const letterboxH = isSolidBg ? 0 : Math.round(H * 0.035);

  ctx.save();

  const photoAreaX = isSolidBg ? (isHorizontal ? Math.round(W * 0.06) : Math.round(W * 0.12)) : 0;
  const photoAreaY = isSolidBg ? (isHorizontal ? Math.round(H * 0.12) : Math.round(H * 0.06)) : letterboxH;
  const photoAreaW = isHorizontal
    ? isSolidBg
      ? Math.round(W * 0.36)
      : Math.round(W * 0.44)
    : isSolidBg
      ? Math.round(W * 0.76)
      : W;
  const photoAreaH = isHorizontal
    ? isSolidBg
      ? Math.round(H * 0.76)
      : H - letterboxH * 2
    : isSolidBg
      ? Math.round(H * 0.36)
      : Math.round((H - letterboxH * 2) * 0.43);

  const quotePanelX = isHorizontal ? (isSolidBg ? Math.round(W * 0.44) : photoAreaW) : 0;
  const quotePanelY = isHorizontal ? letterboxH : photoAreaY + photoAreaH;
  const quotePanelW = isHorizontal ? W - quotePanelX : W;
  const quotePanelH = isHorizontal ? H - letterboxH * 2 : H - letterboxH - quotePanelY;

  // 1. Background fill
  if (bgMode === 'green') {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = DOCUMENTARY_CONFIG.colors.panelBg;
    ctx.fillRect(0, 0, W, H);

    const pGrad = ctx.createLinearGradient(
      quotePanelX,
      quotePanelY,
      quotePanelX + quotePanelW,
      quotePanelY + quotePanelH
    );
    pGrad.addColorStop(0, DOCUMENTARY_CONFIG.colors.panelSecondary);
    pGrad.addColorStop(1, DOCUMENTARY_CONFIG.colors.panelBg);
    ctx.fillStyle = pGrad;
    ctx.fillRect(quotePanelX, quotePanelY, quotePanelW, quotePanelH);
  }

  // 2. B&W Documentary Photo Half
  const photoIntro = easeOutCubic(progress(t, 0, enter * 0.55));
  const pushInZoom = lerp(1.0, 1.09, progress(t, 0, total));

  if (photoIntro > 0.005) {
    ctx.save();
    ctx.globalAlpha = isGreen
      ? photoIntro * masterAlpha > 0.25
        ? 1
        : 0
      : photoIntro * masterAlpha;
    ctx.beginPath();
    ctx.rect(photoAreaX, photoAreaY, photoAreaW, photoAreaH);
    ctx.clip();

    const bwPortrait = getCachedGradedPortrait(
      content.photoSource,
      content.photoId,
      content.crop,
      photoAreaW,
      photoAreaH,
      'bw'
    );

    const zW = photoAreaW * pushInZoom;
    const zH = photoAreaH * pushInZoom;
    const zX = photoAreaX + (photoAreaW - zW) / 2;
    const zY = photoAreaY + (photoAreaH - zH) / 2;
    ctx.drawImage(bwPortrait, zX, zY, zW, zH);

    // Animated film grain & vignette only in 'style' background mode
    if (!isSolidBg) {
      const grainTile = getCachedFilmGrainTile(frameIndex, custom.seed);
      ctx.save();
      ctx.globalAlpha = 0.55 * photoIntro * masterAlpha;
      ctx.drawImage(grainTile, photoAreaX, photoAreaY, photoAreaW, photoAreaH);
      ctx.restore();

      const photoVig = ctx.createRadialGradient(
        photoAreaX + photoAreaW * 0.5,
        photoAreaY + photoAreaH * 0.5,
        Math.min(photoAreaW, photoAreaH) * 0.25,
        photoAreaX + photoAreaW * 0.5,
        photoAreaY + photoAreaH * 0.5,
        Math.max(photoAreaW, photoAreaH) * 0.72
      );
      photoVig.addColorStop(0, 'rgba(0,0,0,0)');
      photoVig.addColorStop(1, 'rgba(0,0,0,0.52)');
      ctx.fillStyle = photoVig;
      ctx.fillRect(photoAreaX, photoAreaY, photoAreaW, photoAreaH);
    }
    ctx.restore();

    if (isSolidBg) {
      ctx.save();
      ctx.globalAlpha = isGreen ? 1 : masterAlpha;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(photoAreaX, photoAreaY, photoAreaW, photoAreaH);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = masterAlpha;
      ctx.strokeStyle = hexToRgba(accent, 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (isHorizontal) {
        ctx.moveTo(photoAreaW, photoAreaY);
        ctx.lineTo(photoAreaW, photoAreaY + photoAreaH * photoIntro);
      } else {
        ctx.moveTo(0, quotePanelY);
        ctx.lineTo(W * photoIntro, quotePanelY);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // 3. Word-Level Typewriter Reveal on Quote Panel + Blinking Cursor Bar + Keyword Emphasis
  const padX = Math.round(quotePanelW * 0.1);
  const textBoxX = quotePanelX + padX;
  const textBoxW = quotePanelW - padX * 2;
  const textBoxY = quotePanelY + (isHorizontal ? quotePanelH * 0.14 : quotePanelH * 0.08);
  const textBoxH = isHorizontal ? quotePanelH * 0.54 : quotePanelH * 0.52;

  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 600,
    minFontSize: isHorizontal ? 32 : 30,
    maxFontSize: isHorizontal ? 60 : 54,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: DOCUMENTARY_CONFIG.lineHeightRatio,
    boxX: textBoxX,
    boxY: textBoxY,
    boxWidth: textBoxW,
    boxHeight: textBoxH,
    align: isLtr ? 'left' : 'right',
    direction,
  });

  const totalWords = quoteLayout.words.length;
  const typeStart = enter * 0.18;
  const typeEnd = enter * 0.92;
  const typeProgress = progress(t, typeStart, typeEnd);
  const visibleWordFloat = typeProgress * totalWords;
  const visibleWordCount = clamp(Math.floor(visibleWordFloat + 0.001), 0, totalWords);

  ctx.save();
  applyStudioCanvasTextProps(ctx, quoteLayout.fontFamily, quoteLayout.fontWeight, quoteLayout.fontSize, direction);
  ctx.textAlign = 'right';

  for (let i = 0; i < visibleWordCount; i++) {
    const w = quoteLayout.words[i];
    const wordAge = clamp(visibleWordFloat - i, 0, 1);
    const wAlpha = isGreen
      ? easeOutCubic(wordAge) * masterAlpha > 0.25
        ? 1
        : 0
      : easeOutCubic(wordAge) * masterAlpha;
    if (wAlpha <= 0.005) continue;

    const wordAppearTime = lerp(typeStart, typeEnd, i / Math.max(1, totalWords));
    const kwEmph = w.isKeyword
      ? easeOutCubic(progress(t, wordAppearTime + 0.15, wordAppearTime + 0.42))
      : 0;

    if (w.isKeyword && kwEmph > 0.01) {
      ctx.globalAlpha = wAlpha;
      ctx.fillStyle = mixHexColor(DOCUMENTARY_CONFIG.colors.quoteText, keywordColor, kwEmph);
      ctx.fillText(w.text, w.x, w.y);

      const uW = w.width * kwEmph;
      const uX = isLtr ? w.x - w.width : w.x - uW;
      ctx.fillStyle = keywordColor;
      ctx.fillRect(uX, w.y + quoteLayout.fontSize * 0.16, uW, 3);
    } else {
      ctx.globalAlpha = wAlpha;
      ctx.fillStyle = DOCUMENTARY_CONFIG.colors.quoteText;
      ctx.fillText(w.text, w.x, w.y);
    }
  }

  // Blinking cursor bar
  if (totalWords > 0 && t >= typeStart && masterAlpha > 0.05) {
    const activeIdx = clamp(visibleWordCount - 1, 0, totalWords - 1);
    const activeWord = quoteLayout.words[activeIdx];
    const isTyping = t < typeEnd;
    const blinkOn = isTyping ? true : Math.sin((t - typeEnd) * Math.PI * 4.5) > -0.2;

    if (blinkOn && visibleWordCount > 0) {
      const cursorX = isLtr ? activeWord.x + 8 : activeWord.x - activeWord.width - 12;
      const cursorH = quoteLayout.fontSize * 0.95;
      const cursorY = activeWord.y - quoteLayout.fontSize * 0.78;
      ctx.globalAlpha = isGreen ? 1 : masterAlpha;
      ctx.fillStyle = accent;
      ctx.fillRect(cursorX, cursorY, 4.5, cursorH);
    }
  }
  ctx.restore();

  // 4. Documentary Lower-Third Bar at Bottom
  const ltProg = easeOutCubic(progress(t, enter * 0.55, enter));
  if (ltProg > 0.005 && content.authorName.trim()) {
    const hasSub = Boolean(content.subtitle.trim());
    const barH = hasSub ? 112 : 76;
    const barW = isHorizontal ? Math.min(quotePanelW - padX * 1.5, 640) : W * 0.84;
    const barY = H - letterboxH - barH - (isHorizontal ? 44 : 52);

    ctx.save();
    ctx.globalAlpha = isGreen ? (ltProg * masterAlpha > 0.25 ? 1 : 0) : ltProg * masterAlpha;

    if (isLtr) {
      const barLeftX = isHorizontal ? quotePanelX + padX : W * 0.08;
      ctx.beginPath();
      ctx.rect(barLeftX - 10, barY - 10, barW + 30, barH + 20);
      ctx.clip();

      const slideOffset = -(1 - ltProg) * 140;
      ctx.translate(slideOffset, 0);

      if (!isBlack) {
        ctx.fillStyle = isGreen ? '#121316' : DOCUMENTARY_CONFIG.colors.lowerThirdBg;
        ctx.fillRect(barLeftX, barY, barW, barH);
      } else {
        ctx.fillStyle = DOCUMENTARY_LIGHT_PALETTE.surfaceBg!;
        ctx.fillRect(barLeftX, barY, barW, barH);
      }

      ctx.fillStyle = accent;
      ctx.fillRect(barLeftX, barY, 6, barH);
      ctx.fillRect(barLeftX, barY, barW, 2);

      const textLeft = barLeftX + 26;
      applyStudioCanvasTextProps(ctx, authorFont, 700, isHorizontal ? 33 : 31, direction);
      ctx.textAlign = 'left';
      ctx.fillStyle = DOCUMENTARY_CONFIG.colors.authorText;
      ctx.fillText(content.authorName.trim(), textLeft, barY + (hasSub ? 46 : 49));

      if (hasSub) {
        applyStudioCanvasTextProps(ctx, authorFont, 500, isHorizontal ? 22 : 21, direction);
        ctx.textAlign = 'left';
        ctx.fillStyle = isBlack
          ? DOCUMENTARY_LIGHT_PALETTE.textSecondary
          : DOCUMENTARY_CONFIG.colors.subtitleText;
        ctx.fillText(content.subtitle.trim(), textLeft, barY + 86);
      }
    } else {
      const barRightX = isHorizontal ? W - padX : W * 0.92;

      ctx.beginPath();
      ctx.rect(barRightX - barW - 20, barY - 10, barW + 30, barH + 20);
      ctx.clip();

      const slideOffset = (1 - ltProg) * 140;
      ctx.translate(slideOffset, 0);

      if (!isBlack) {
        ctx.fillStyle = isGreen ? '#121316' : DOCUMENTARY_CONFIG.colors.lowerThirdBg;
        ctx.fillRect(barRightX - barW, barY, barW, barH);
      } else {
        ctx.fillStyle = DOCUMENTARY_LIGHT_PALETTE.surfaceBg!;
        ctx.fillRect(barRightX - barW, barY, barW, barH);
      }

      ctx.fillStyle = accent;
      ctx.fillRect(barRightX - 6, barY, 6, barH);
      ctx.fillRect(barRightX - barW, barY, barW, 2);

      const textRight = barRightX - 26;
      applyStudioCanvasTextProps(ctx, authorFont, 700, isHorizontal ? 33 : 31, direction);
      ctx.textAlign = 'right';
      ctx.fillStyle = DOCUMENTARY_CONFIG.colors.authorText;
      ctx.fillText(content.authorName.trim(), textRight, barY + (hasSub ? 46 : 49));

      if (hasSub) {
        applyStudioCanvasTextProps(ctx, authorFont, 500, isHorizontal ? 22 : 21, direction);
        ctx.textAlign = 'right';
        ctx.fillStyle = isBlack
          ? DOCUMENTARY_LIGHT_PALETTE.textSecondary
          : DOCUMENTARY_CONFIG.colors.subtitleText;
        ctx.fillText(content.subtitle.trim(), textRight, barY + 86);
      }
    }

    ctx.restore();
  }

  // 5. Subtle Thin Letterbox Bars (only in 'style' background mode)
  if (!isSolidBg) {
    ctx.fillStyle = '#060709';
    ctx.fillRect(0, 0, W, letterboxH);
    ctx.fillRect(0, H - letterboxH, W, letterboxH);
  }

  ctx.restore();
};
