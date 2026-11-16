import {
  ArabicFontFamily,
  BackgroundMode,
  EnglishFontFamily,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  SceneEventTimes,
  StyleCustomization,
  TimelineConfig,
} from '../types';
import { getCachedFloatingPastelBackdrop } from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeOutBack,
  lerp,
  progress,
} from '../utils/math';
import {
  computeStandardVideoEventTimes,
  drawVideoCaptionAndSource,
  drawVideoClipInScreen,
  fitVideoShellInBox,
  resolveVideoScene,
} from './videoShared';

export const VID_FLOATING_CONFIG = {
  id: 'vid_floating' as const,
  mode: 'video' as const,
  nameAr: 'بطاقة عائمة',
  nameEn: 'Floating Video Card',
  descriptionAr:
    'بطاقة ناعمة الحواف بإطار أبيض رفيع وحركة طفو هادئة مع شارة تعليق بارزة وخلفية باستيل لطيفة',
  defaultAccent: '#6366F1',
  defaultKeywordColor: '#F43F5E',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Tajawal' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Manrope' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  colors: {
    borderWhite: '#FFFFFF',
    cardBg: '#0F172A',
    hardShadow: '#1E1B4B',
    pillText: '#FFFFFF',
  },
  fonts: {
    captionAr: 'Cairo' as ArabicFontFamily,
    captionEn: 'Plus Jakarta Sans' as EnglishFontFamily,
  },
};

export function getVidFloatingEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  return computeStandardVideoEventTimes(
    ctx,
    content,
    timeline,
    custom,
    size,
    VID_FLOATING_CONFIG.fonts.captionAr,
    VID_FLOATING_CONFIG.fonts.captionEn
  );
}

export const renderVidFloating: PureStyleRenderer = (
  ctx,
  t,
  content,
  timeline,
  custom,
  size
) => {
  const { baseWidth: W, baseHeight: H } = size;
  const scene = resolveVideoScene(t, content, timeline, custom, size);
  const { isGreen, timeline: vt } = scene;
  const accentColor = custom.accentColor || VID_FLOATING_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || VID_FLOATING_CONFIG.defaultKeywordColor;

  // 1. Background
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else {
    const pastelBg = getCachedFloatingPastelBackdrop(W, H, accentColor, custom.seed);
    ctx.drawImage(pastelBg, 0, 0, W, H);
  }

  const cardAspect = scene.adaptFrameToClip ? scene.clipAspect : 16 / 9;
  const hasAnyCaption = scene.hasCaption || scene.hasSourceLine;

  const shell = fitVideoShellInBox({
    boxX: scene.boxX,
    boxY: scene.boxY,
    boxWidth: scene.boxWidth,
    boxHeight: scene.boxHeight,
    screenAspect: cardAspect,
    bezelLeftRatio: 0.015,
    bezelRightRatio: 0.015,
    bezelTopRatio: 0.015,
    bezelBottomRatio: 0.015,
    minPad: 5,
    hasCaptionText: hasAnyCaption,
    preferCaptionBelow: true,
  });

  // Enter: slide + scale via easeOutBack. Hold: deterministic vertical float (±6 px).
  const enterP = progress(t, 0, vt.enter);
  const exitP = progress(t, vt.exitStart, vt.total);
  const backEase = easeOutBack(enterP);
  const exitEase = easeInCubic(exitP);

  const slideOffset = lerp(42, 0, backEase) + lerp(0, -34, exitEase);
  const floatOffset = Math.sin(t * 2.1 + (custom.seed % 19)) * 6;
  const cardScale = clamp(lerp(0.82, 1.0, backEase) * lerp(1.0, 0.9, exitEase), 0.1, 1.15);
  const alpha = isGreen ? (exitP > 0.88 ? 0 : 1) : clamp(enterP * 2.4, 0, 1) * (1 - exitEase);

  if (alpha <= 0.01) {
    ctx.restore();
    return;
  }

  const cardR = clamp(Math.round(Math.min(shell.frameW, shell.frameH) * 0.055), 10, 26);
  const cx = shell.frameX + shell.frameW * 0.5;
  const cy = shell.frameY + shell.frameH * 0.5 + slideOffset + floatOffset;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(cardScale, cardScale);
  ctx.translate(-shell.frameX - shell.frameW * 0.5, -shell.frameY - shell.frameH * 0.5);

  // Shadow
  if (isGreen) {
    ctx.fillStyle = VID_FLOATING_CONFIG.colors.hardShadow;
    ctx.beginPath();
    ctx.roundRect(shell.frameX + 12, shell.frameY + 14, shell.frameW, shell.frameH, cardR);
    ctx.fill();
  } else {
    ctx.save();
    ctx.shadowColor = 'rgba(30, 27, 75, 0.28)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = VID_FLOATING_CONFIG.colors.borderWhite;
    ctx.beginPath();
    ctx.roundRect(shell.frameX, shell.frameY, shell.frameW, shell.frameH, cardR);
    ctx.fill();
    ctx.restore();
  }

  // White Outer Card Border
  ctx.fillStyle = VID_FLOATING_CONFIG.colors.borderWhite;
  ctx.beginPath();
  ctx.roundRect(shell.frameX, shell.frameY, shell.frameW, shell.frameH, cardR);
  ctx.fill();

  const innerR = Math.max(6, cardR - 4);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(shell.screenX, shell.screenY, shell.screenW, shell.screenH, innerR);
  ctx.clip();

  drawVideoClipInScreen(
    ctx,
    scene.drawable,
    scene.crop,
    scene.fitMode,
    shell.screenX,
    shell.screenY,
    shell.screenW,
    shell.screenH,
    VID_FLOATING_CONFIG.colors.cardBg
  );

  if (hasAnyCaption && !shell.captionBelow) {
    drawVideoCaptionAndSource({
      ctx,
      areaX: shell.screenX,
      areaY: shell.screenY,
      areaW: shell.screenW,
      areaH: shell.screenH,
      insideOverlay: true,
      caption: scene.caption,
      hasCaption: scene.hasCaption,
      sourceLine: scene.sourceLine,
      hasSourceLine: scene.hasSourceLine,
      fontFamily:
        custom.quoteFontOverride ||
        (scene.direction === 'ltr'
          ? VID_FLOATING_CONFIG.fonts.captionEn
          : VID_FLOATING_CONFIG.fonts.captionAr),
      fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
      direction: scene.direction,
      textColor: VID_FLOATING_CONFIG.colors.pillText,
      keywordColor,
      accentColor,
      isGreen,
      t,
      captionStartSec: vt.clipStart * 0.55,
      alpha: 1,
      seed: custom.seed,
    });
  }

  ctx.restore(); // end inner video clip

  // Overlapping bottom accent caption pill (when captionBelow fits cleanly in box)
  if (hasAnyCaption && shell.captionBelow) {
    const pillW = Math.min(shell.frameW * 0.9, Math.max(180, shell.frameW * 0.78));
    const pillX = shell.frameX + (shell.frameW - pillW) * 0.5;
    const pillY = Math.max(shell.frameY + shell.frameH - Math.round(shell.captionAreaH * 0.36), shell.frameY + 10);
    const pillH = Math.min(shell.captionAreaH, scene.boxY + scene.boxHeight - pillY);

    if (isGreen) {
      ctx.fillStyle = '#1E1B4B';
      ctx.beginPath();
      ctx.roundRect(pillX + 6, pillY + 6, pillW, pillH, 14);
      ctx.fill();
    }

    drawVideoCaptionAndSource({
      ctx,
      areaX: pillX,
      areaY: pillY,
      areaW: pillW,
      areaH: pillH,
      insideOverlay: false,
      caption: scene.caption,
      hasCaption: scene.hasCaption,
      sourceLine: scene.sourceLine,
      hasSourceLine: scene.hasSourceLine,
      fontFamily:
        custom.quoteFontOverride ||
        (scene.direction === 'ltr'
          ? VID_FLOATING_CONFIG.fonts.captionEn
          : VID_FLOATING_CONFIG.fonts.captionAr),
      fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
      direction: scene.direction,
      textColor: VID_FLOATING_CONFIG.colors.pillText,
      keywordColor,
      accentColor,
      isGreen,
      t,
      captionStartSec: vt.clipStart * 0.55,
      alpha: 1,
      seed: custom.seed,
      pillBackground: accentColor,
    });
  }

  ctx.restore();
  ctx.restore();
};
