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

export const VID_PHONE_CONFIG = {
  id: 'vid_phone' as const,
  mode: 'video' as const,
  nameAr: 'شاشة موبايل',
  nameEn: 'Phone Mockup',
  descriptionAr:
    'إطار هاتف ذكي عصري بدون شعارات يتحول تلقائياً بين الطولي والعرضي مع ميلان عائم ناعم وخلفية متدرجة',
  defaultAccent: '#6366F1',
  defaultKeywordColor: '#38BDF8',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Tajawal' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Outfit' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  colors: {
    bgStart: '#1B2340',
    bgEnd: '#3A2A6B',
    chassisOuter: '#1E293B',
    chassisRim: '#475569',
    bezelInner: '#090D16',
    speakerSlit: '#334155',
    hardShadow: '#0A0F1D',
    captionText: '#F8FAFC',
  },
  fonts: {
    captionAr: 'Cairo' as ArabicFontFamily,
    captionEn: 'Plus Jakarta Sans' as EnglishFontFamily,
  },
};

export function getVidPhoneEventTimes(
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
    VID_PHONE_CONFIG.fonts.captionAr,
    VID_PHONE_CONFIG.fonts.captionEn
  );
}

export const renderVidPhone: PureStyleRenderer = (
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
  const accentColor = custom.accentColor || VID_PHONE_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || VID_PHONE_CONFIG.defaultKeywordColor;

  // 1. Background
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, VID_PHONE_CONFIG.colors.bgStart);
    grad.addColorStop(1, VID_PHONE_CONFIG.colors.bgEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // Phone adapts automatically between portrait & landscape when adaptive is ON
  const isLandscapePhone = scene.adaptFrameToClip ? scene.clipAspect >= 1.05 : false;
  const phoneScreenAspect = scene.adaptFrameToClip
    ? isLandscapePhone
      ? clamp(scene.clipAspect, 1.2, 2.2)
      : clamp(scene.clipAspect, 0.45, 0.92)
    : 9 / 16;

  const hasAnyCaption = scene.hasCaption || scene.hasSourceLine;
  const shell = fitVideoShellInBox({
    boxX: scene.boxX,
    boxY: scene.boxY,
    boxWidth: scene.boxWidth,
    boxHeight: scene.boxHeight,
    screenAspect: phoneScreenAspect,
    bezelLeftRatio: isLandscapePhone ? 0.055 : 0.036,
    bezelRightRatio: isLandscapePhone ? 0.055 : 0.036,
    bezelTopRatio: isLandscapePhone ? 0.036 : 0.048,
    bezelBottomRatio: isLandscapePhone ? 0.036 : 0.048,
    minPad: 7,
    hasCaptionText: hasAnyCaption,
    preferCaptionBelow: true,
  });

  // 2. Motion: enter scale-up + gentle deterministic floating tilt
  const enterP = progress(t, 0, vt.enter);
  const exitP = progress(t, vt.exitStart, vt.total);
  const enterEase = easeOutBack(enterP);
  const exitEase = easeInCubic(exitP);

  const floatY = Math.sin(t * 1.65 + (custom.seed % 17)) * clamp(shell.frameH * 0.012, 2, 7);
  const floatAngle =
    Math.sin(t * 1.1 + (custom.seed % 29)) * 0.018 * (1 - exitEase);
  const scaleFactor = clamp(lerp(0.84, 1.0, enterEase) * lerp(1.0, 0.88, exitEase), 0.1, 1.2);
  const alpha = isGreen ? (exitP > 0.88 ? 0 : 1) : clamp(enterP * 2.2, 0, 1) * (1 - exitEase);

  if (alpha <= 0.01) {
    ctx.restore();
    return;
  }

  const cx = shell.frameX + shell.frameW * 0.5;
  const cy = shell.frameY + shell.frameH * 0.5 + floatY;
  const outerR = clamp(Math.round(Math.min(shell.frameW, shell.frameH) * 0.095), 14, 38);
  const innerR = Math.max(8, outerR - 6);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(floatAngle);
  ctx.scale(scaleFactor, scaleFactor);
  ctx.translate(-cx, -cy);

  // 3. Shadow (hard offset shadow in green mode, soft drop shadow in style mode)
  if (isGreen) {
    ctx.fillStyle = VID_PHONE_CONFIG.colors.hardShadow;
    ctx.beginPath();
    ctx.roundRect(shell.frameX + 12, shell.frameY + 14, shell.frameW, shell.frameH, outerR);
    ctx.fill();
  } else {
    ctx.save();
    ctx.shadowColor = 'rgba(7, 10, 25, 0.56)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetX = 6;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = VID_PHONE_CONFIG.colors.chassisOuter;
    ctx.beginPath();
    ctx.roundRect(shell.frameX, shell.frameY, shell.frameW, shell.frameH, outerR);
    ctx.fill();
    ctx.restore();
  }

  // 4. Generic Phone Body (no brand logo)
  ctx.fillStyle = VID_PHONE_CONFIG.colors.chassisOuter;
  ctx.strokeStyle = VID_PHONE_CONFIG.colors.chassisRim;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.roundRect(shell.frameX, shell.frameY, shell.frameW, shell.frameH, outerR);
  ctx.fill();
  ctx.stroke();

  // Inner black screen surround
  ctx.fillStyle = VID_PHONE_CONFIG.colors.bezelInner;
  ctx.beginPath();
  ctx.roundRect(shell.screenX - 4, shell.screenY - 4, shell.screenW + 8, shell.screenH + 8, innerR + 2);
  ctx.fill();

  // 5. Screen Clip & Video Drawable
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
    VID_PHONE_CONFIG.colors.bezelInner
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
          ? VID_PHONE_CONFIG.fonts.captionEn
          : VID_PHONE_CONFIG.fonts.captionAr),
      fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
      direction: scene.direction,
      textColor: VID_PHONE_CONFIG.colors.captionText,
      keywordColor,
      accentColor,
      isGreen,
      t,
      captionStartSec: vt.clipStart * 0.6,
      alpha: 1,
      seed: custom.seed,
    });
  }
  ctx.restore();

  // 6. Generic Earpiece Speaker Pill / Camera Dot (placed neatly outside or at edge of screen)
  ctx.fillStyle = VID_PHONE_CONFIG.colors.speakerSlit;
  if (isLandscapePhone) {
    const pillH = clamp(Math.round(shell.frameH * 0.14), 14, 34);
    const pillW = clamp(Math.round(shell.frameW * 0.015), 4, 8);
    ctx.beginPath();
    ctx.roundRect(
      shell.frameX + Math.max(4, (shell.screenX - shell.frameX - pillW) * 0.5),
      shell.frameY + shell.frameH * 0.5 - pillH * 0.5,
      pillW,
      pillH,
      pillW * 0.5
    );
    ctx.fill();
  } else {
    const pillW = clamp(Math.round(shell.frameW * 0.18), 22, 64);
    const pillH = clamp(Math.round(shell.frameH * 0.013), 4, 9);
    ctx.beginPath();
    ctx.roundRect(
      cx - pillW * 0.5,
      shell.frameY + Math.max(5, (shell.screenY - shell.frameY - pillH) * 0.5),
      pillW,
      pillH,
      pillH * 0.5
    );
    ctx.fill();
  }

  // Subtle bottom home bar inside bezel
  if (!isLandscapePhone && shell.frameY + shell.frameH - (shell.screenY + shell.screenH) >= 12) {
    const barW = clamp(Math.round(shell.frameW * 0.28), 24, 90);
    const barY = shell.screenY + shell.screenH + (shell.frameY + shell.frameH - shell.screenY - shell.screenH) * 0.5 - 1.5;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.beginPath();
    ctx.roundRect(cx - barW * 0.5, barY, barW, 3, 2);
    ctx.fill();
  }

  ctx.restore();

  // Caption below Phone when space permits
  if (hasAnyCaption && shell.captionBelow) {
    drawVideoCaptionAndSource({
      ctx,
      areaX: shell.frameX - Math.round(shell.frameW * 0.12),
      areaY: shell.captionAreaY + floatY * 0.4,
      areaW: shell.frameW * 1.24,
      areaH: shell.captionAreaH,
      insideOverlay: false,
      caption: scene.caption,
      hasCaption: scene.hasCaption,
      sourceLine: scene.sourceLine,
      hasSourceLine: scene.hasSourceLine,
      fontFamily:
        custom.quoteFontOverride ||
        (scene.direction === 'ltr'
          ? VID_PHONE_CONFIG.fonts.captionEn
          : VID_PHONE_CONFIG.fonts.captionAr),
      fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
      direction: scene.direction,
      textColor: VID_PHONE_CONFIG.colors.captionText,
      keywordColor,
      accentColor,
      isGreen,
      t,
      captionStartSec: vt.clipStart * 0.6,
      alpha: alpha,
      seed: custom.seed,
      pillBackground: isGreen ? '#141B2D' : 'rgba(15, 23, 42, 0.72)',
    });
  }

  ctx.restore();
};
