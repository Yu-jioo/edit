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
import {
  drawCroppedImage,
  getCachedCinematicBlurredPhoto,
  getCachedGradedPortrait,
} from '../utils/assetCache';
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

export const CINEMATIC_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#FFFFFF',
  textSecondary: '#E2E8F0',
  accent: '#FFFFFF',
  keyword: '#FFD166',
  border: '#FFFFFF',
};

export const CINEMATIC_CONFIG = {
  id: 'cinematic' as const,
  mode: 'quote' as const,
  nameAr: 'سينمائي (فيديو وثائقي)',
  nameEn: 'Cinematic Documentary',
  descriptionAr:
    'مظهر وثائقي حديث مع زووم سينمائي ناعم ومستمر وتمويه خلفية وكشف متتابع كلمة بكلمة',
  defaultAccent: '#FFFFFF',
  defaultKeywordColor: '#FFD166',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Cinzel' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Outfit' as EnglishFontFamily,
  allowedEnglishFonts: ['Cinzel', 'Playfair Display', 'Plus Jakarta Sans', 'Outfit', 'Lora'] as EnglishFontFamily[],
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'style' as BackgroundMode,
  lightPalette: CINEMATIC_LIGHT_PALETTE,
  colors: {
    white: '#FFFFFF',
    textShadow: 'rgba(0, 0, 0, 0.88)',
    subtitle: 'rgba(255, 255, 255, 0.82)',
  },
  lineHeightRatio: 1.68,
};

export function getCinematicEventTimes(
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
    (isLtr ? CINEMATIC_CONFIG.defaultEnglishQuoteFont : CINEMATIC_CONFIG.defaultQuoteFont);

  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 700,
    minFontSize: isHorizontal ? 38 : 34,
    maxFontSize: isHorizontal ? 76 : 64,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: CINEMATIC_CONFIG.lineHeightRatio,
    boxX: isHorizontal ? W * 0.32 : W * 0.08,
    boxY: isHorizontal ? H * 0.26 : H * 0.38,
    boxWidth: isHorizontal ? W * 0.6 : W * 0.84,
    boxHeight: isHorizontal ? H * 0.44 : H * 0.35,
    align: isHorizontal ? (isLtr ? 'left' : 'right') : 'center',
    direction,
  });

  const totalWords = Math.max(1, quoteLayout.words.length);
  const revealStart = enter * 0.12;
  const revealEnd = enter * 0.82;

  const seenGroups = new Set<number>();
  const keywordTimes: number[] = [];
  for (let i = 0; i < quoteLayout.words.length; i++) {
    const w = quoteLayout.words[i];
    if (w.isKeyword && w.groupId !== null && !seenGroups.has(w.groupId)) {
      seenGroups.add(w.groupId);
      const wordTStart = lerp(revealStart, revealEnd, i / totalWords);
      keywordTimes.push(Number((wordTStart + 0.15).toFixed(3)));
    }
  }

  return { enterStart: Number(revealStart.toFixed(3)), keywordTimes };
}

export const renderCinematic: PureStyleRenderer = (
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

  const keywordColor = custom.keywordColor || CINEMATIC_CONFIG.defaultKeywordColor;
  const direction = resolveTextDirection(custom, content.quoteText);
  const isLtr = direction === 'ltr';
  const quoteFont =
    custom.quoteFontOverride ||
    (isLtr ? CINEMATIC_CONFIG.defaultEnglishQuoteFont : CINEMATIC_CONFIG.defaultQuoteFont);
  const authorFont =
    custom.authorFontOverride ||
    (isLtr ? CINEMATIC_CONFIG.defaultEnglishAuthorFont : CINEMATIC_CONFIG.defaultAuthorFont);

  // Overall opacity envelopes
  const fadeIn = easeOutCubic(progress(t, 0.0, enter * 0.45));
  const fadeOut = 1 - easeInCubic(progress(t, exitStart + (total - exitStart) * 0.25, total));
  const sceneAlpha = fadeIn * fadeOut;

  // Text exit fade
  const textExitAlpha = 1 - easeInCubic(progress(t, exitStart, exitStart + (total - exitStart) * 0.7));

  // Continuous, silky smooth slow zoom-in (1.0x to 1.08x) over the entire video duration
  const zoomProgress = clamp(t / Math.max(0.1, total), 0, 1);
  const dollyScale = lerp(1.0, 1.08, zoomProgress);

  ctx.save();

  // =========================================================================
  // 1. BASE FILL (Obsidian Black, Chroma Green #00FF00, or Pure Screen Black #000000)
  // =========================================================================
  if (bgMode === 'green') {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#060608';
    ctx.fillRect(0, 0, W, H);
  }

  // =========================================================================
  // 2. BACKGROUND PHOTO WITH CINEMATIC BLUR, SLOW ZOOM & SCRIM (Style mode)
  //    OR FRAMED PORTRAIT BESIDE/ABOVE TEXT (Solid Green / Black modes)
  // =========================================================================
  if (!isSolidBg && sceneAlpha > 0.005) {
    ctx.save();
    ctx.globalAlpha = sceneAlpha;

    const drawW = W * dollyScale;
    const drawH = H * dollyScale;
    const drawX = (W - drawW) / 2 - (isHorizontal ? W * 0.03 : 0);
    const drawY = (H - drawH) / 2;

    const blurAmount = custom.backgroundBlur !== undefined ? custom.backgroundBlur : 6;
    const blurredBg = getCachedCinematicBlurredPhoto(
      content.photoSource,
      content.photoId,
      content.crop,
      W,
      H,
      blurAmount
    );
    ctx.drawImage(blurredBg, drawX, drawY, drawW, drawH);

    // 2a. Asymmetric Scrim Gradient
    if (isHorizontal) {
      const scrim = ctx.createLinearGradient(W * 0.15, 0, W * 0.95, 0);
      scrim.addColorStop(0, 'rgba(6, 8, 12, 0.05)');
      scrim.addColorStop(0.35, 'rgba(6, 8, 12, 0.52)');
      scrim.addColorStop(0.68, 'rgba(4, 6, 9, 0.84)');
      scrim.addColorStop(1, 'rgba(2, 4, 7, 0.94)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, W, H);
    } else {
      const scrim = ctx.createLinearGradient(0, H * 0.15, 0, H * 0.88);
      scrim.addColorStop(0, 'rgba(6, 8, 12, 0.12)');
      scrim.addColorStop(0.45, 'rgba(5, 7, 10, 0.72)');
      scrim.addColorStop(0.8, 'rgba(3, 5, 8, 0.92)');
      scrim.addColorStop(1, 'rgba(2, 4, 7, 0.96)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, W, H);
    }

    // 2b. Cinematic Edge Vignette
    const vig = ctx.createRadialGradient(
      W * 0.5,
      H * 0.5,
      Math.min(W, H) * 0.28,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.74
    );
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(0.65, 'rgba(0, 0, 0, 0.38)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.82)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();
  } else if (isSolidBg && sceneAlpha > 0.005) {
    // Solid background rule for Q6 (Cinematic): show the photo as a framed portrait beside/above the text
    const frameW = isHorizontal ? 340 : 280;
    const frameH = isHorizontal ? 420 : 320;
    const frameX = isHorizontal ? W * 0.07 : (W - frameW) / 2;
    const frameY = isHorizontal ? (H - frameH) / 2 : H * 0.07;

    ctx.save();
    ctx.globalAlpha = isGreen ? (sceneAlpha * textExitAlpha > 0.25 ? 1 : 0) : sceneAlpha * textExitAlpha;

    const portrait = getCachedGradedPortrait(
      content.photoSource,
      content.photoId,
      content.crop,
      frameW,
      frameH,
      'normal'
    );

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(frameX, frameY, frameW, frameH, 24);
    ctx.clip();
    const zW = frameW * dollyScale;
    const zH = frameH * dollyScale;
    ctx.drawImage(portrait, frameX + (frameW - zW) / 2, frameY + (frameH - zH) / 2, zW, zH);
    ctx.restore();

    ctx.strokeStyle = CINEMATIC_CONFIG.colors.white;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(frameX, frameY, frameW, frameH, 24);
    ctx.stroke();
    ctx.restore();
  }

  // =========================================================================
  // 3. QUOTE TEXT — SEQUENTIAL WORD-BY-WORD REVEAL + KEYWORD EMPHASIS
  // =========================================================================
  const textBoxX = isHorizontal ? W * 0.32 : W * 0.08;
  const textBoxW = isHorizontal ? W * 0.6 : W * 0.84;
  const textBoxY = isHorizontal ? H * 0.26 : H * 0.38;
  const textBoxH = isHorizontal ? H * 0.44 : H * 0.35;
  const textAlign = isHorizontal ? (isLtr ? 'left' : 'right') : 'center';

  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 700,
    minFontSize: isHorizontal ? 38 : 34,
    maxFontSize: isHorizontal ? 76 : 64,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: CINEMATIC_CONFIG.lineHeightRatio,
    boxX: textBoxX,
    boxY: textBoxY,
    boxWidth: textBoxW,
    boxHeight: textBoxH,
    align: textAlign,
    direction,
  });

  const totalWords = Math.max(1, quoteLayout.words.length);
  const revealStart = enter * 0.12;
  const revealEnd = enter * 0.82;

  if (sceneAlpha > 0.005 && textExitAlpha > 0.005) {
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
      const wordTStart = lerp(revealStart, revealEnd, i / totalWords);
      const wordProgress = progress(t, wordTStart, wordTStart + 0.12);

      if (wordProgress <= 0) continue;

      const rawWordAlpha = easeOutCubic(wordProgress) * textExitAlpha * sceneAlpha;
      const wordAlpha = isGreen ? (rawWordAlpha > 0.25 ? 1 : 0) : rawWordAlpha;
      if (wordAlpha <= 0.005) continue;

      const wx = word.x;
      const wy = word.y;

      // 1. Ambient drop shadow (omitted in black Screen mode)
      if (!isBlack) {
        ctx.globalAlpha = isGreen ? 1 : wordAlpha * 0.85;
        ctx.fillStyle = CINEMATIC_CONFIG.colors.textShadow;
        ctx.fillText(word.text, wx + 2, wy + 3);
        ctx.fillText(word.text, wx + 4, wy + 5);
      }

      // 2. Keyword emphasis (~0.15s after word appears)
      const kwEmph = word.isKeyword
        ? easeOutCubic(progress(t, wordTStart + 0.15, wordTStart + 0.42))
        : 0;

      if (word.isKeyword && kwEmph > 0.01) {
        if (!isGreen) {
          ctx.save();
          ctx.shadowColor = hexToRgba(keywordColor, 0.75 * kwEmph);
          ctx.shadowBlur = 16 * kwEmph;
          ctx.globalAlpha = wordAlpha;
          ctx.fillStyle = mixHexColor(CINEMATIC_CONFIG.colors.white, keywordColor, kwEmph);
          ctx.fillText(word.text, wx, wy);
          ctx.restore();
        } else {
          ctx.globalAlpha = 1;
          ctx.fillStyle = keywordColor;
          ctx.fillText(word.text, wx, wy);
        }

        const uW = word.width * kwEmph;
        const uX = isLtr ? word.x - word.width : word.x - uW;
        ctx.globalAlpha = isGreen ? 1 : wordAlpha * 0.92;
        ctx.fillStyle = keywordColor;
        ctx.fillRect(uX, wy + quoteLayout.fontSize * 0.16, uW, 3.5);
      } else {
        ctx.globalAlpha = wordAlpha;
        ctx.fillStyle = CINEMATIC_CONFIG.colors.white;
        ctx.fillText(word.text, wx, wy);
      }
    }
    ctx.restore();
  }

  // =========================================================================
  // 4. BOTTOM AUTHOR BADGE (CIRCULAR AVATAR + NAME + SUBTITLE IN CORNER)
  // =========================================================================
  const badgeStart = enter * 0.72;
  const badgeProgress = easeOutCubic(progress(t, badgeStart, enter));
  const rawBadgeAlpha = badgeProgress * textExitAlpha * sceneAlpha;
  const badgeAlpha = isGreen ? (rawBadgeAlpha > 0.25 ? 1 : 0) : rawBadgeAlpha;

  if (badgeAlpha > 0.005 && content.authorName.trim()) {
    ctx.save();
    ctx.globalAlpha = badgeAlpha;

    const avatarRadius = isHorizontal ? 48 : 40;
    const avatarDiameter = avatarRadius * 2;
    const avatarMarginRight = isHorizontal ? W * 0.065 : W * 0.08;
    const avatarMarginBottom = isHorizontal ? H * 0.075 : H * 0.085;

    const avatarCenterX = W - avatarMarginRight - avatarRadius;
    const avatarCenterY = H - avatarMarginBottom - avatarRadius;

    const slideOffset = (1 - badgeProgress) * 14;
    const currentAvatarY = avatarCenterY + slideOffset;

    ctx.save();
    if (!isGreen && !isBlack) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;
    }

    ctx.beginPath();
    ctx.arc(avatarCenterX, currentAvatarY, avatarRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.save();
    ctx.clip();

    ctx.shadowColor = 'transparent';

    drawCroppedImage(
      ctx,
      content.photoSource,
      content.crop,
      avatarCenterX - avatarRadius,
      currentAvatarY - avatarRadius,
      avatarDiameter,
      avatarDiameter
    );
    ctx.restore();

    ctx.strokeStyle = CINEMATIC_CONFIG.colors.white;
    ctx.lineWidth = isHorizontal ? 3.5 : 3;
    ctx.beginPath();
    ctx.arc(avatarCenterX, currentAvatarY, avatarRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const textGap = 22;
    const textRightAnchor = avatarCenterX - avatarRadius - textGap;
    const hasSubtitle = content.subtitle.trim().length > 0;

    const authorFontSize = isHorizontal ? 32 : 28;
    const authorNameY = hasSubtitle ? currentAvatarY - 6 : currentAvatarY + 10;

    applyStudioCanvasTextProps(ctx, authorFont, 700, authorFontSize, direction);
    ctx.textAlign = 'right';

    if (!isBlack) {
      ctx.fillStyle = CINEMATIC_CONFIG.colors.textShadow;
      ctx.fillText(content.authorName.trim(), textRightAnchor + 2, authorNameY + 3);
    }
    ctx.fillStyle = CINEMATIC_CONFIG.colors.white;
    ctx.fillText(content.authorName.trim(), textRightAnchor, authorNameY);

    if (hasSubtitle) {
      const subtitleY = currentAvatarY + 28;
      const subFontSize = isHorizontal ? 21 : 19;

      applyStudioCanvasTextProps(ctx, authorFont, 500, subFontSize, direction);
      ctx.textAlign = 'right';

      if (!isBlack) {
        ctx.fillStyle = CINEMATIC_CONFIG.colors.textShadow;
        ctx.fillText(content.subtitle.trim(), textRightAnchor + 1, subtitleY + 2);
      }
      ctx.fillStyle = isGreen ? '#FFFFFF' : CINEMATIC_CONFIG.colors.subtitle;
      ctx.fillText(content.subtitle.trim(), textRightAnchor, subtitleY);
    }

    ctx.restore();
  }

  ctx.restore();
};
