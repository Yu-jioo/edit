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
import { applyStudioCanvasTextProps, drawBidiWord } from '../utils/textLayout';
import {
  computeStandardVideoEventTimes,
  drawVideoCaptionAndSource,
  drawVideoClipInScreen,
  fitVideoShellInBox,
  resolveVideoScene,
} from './videoShared';

export const VID_PIP_CONFIG = {
  id: 'vid_pip' as const,
  mode: 'video' as const,
  nameAr: 'صورة داخل صورة',
  nameEn: 'PiP Bubble',
  descriptionAr:
    'نافذة تعليق دائرية أو مستديرة الزوايا بإطار بارز ونقطة بث نابضة واسم المتحدث، مثالية لزوايا الشاشة',
  defaultAccent: '#38BDF8',
  defaultKeywordColor: '#FDE047',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Tajawal' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Outfit' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  colors: {
    bgTop: '#0B1220',
    bgBot: '#1E293B',
    liveRed: '#EF4444',
    hardShadow: '#090D16',
    tagBg: '#0F172A',
    captionText: '#F8FAFC',
  },
  fonts: {
    captionAr: 'Cairo' as ArabicFontFamily,
    captionEn: 'Plus Jakarta Sans' as EnglishFontFamily,
  },
};

export function getVidPipEventTimes(
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
    VID_PIP_CONFIG.fonts.captionAr,
    VID_PIP_CONFIG.fonts.captionEn
  );
}

export const renderVidPip: PureStyleRenderer = (
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
  const accentColor = custom.accentColor || VID_PIP_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || VID_PIP_CONFIG.defaultKeywordColor;
  const pipShape = custom.videoPipShape || 'circle';
  const nameTag = (custom.videoPipNameTag || '').trim();

  // 1. Background
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, VID_PIP_CONFIG.colors.bgTop);
    bg.addColorStop(1, VID_PIP_CONFIG.colors.bgBot);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  const targetAspect =
    pipShape === 'circle'
      ? 1
      : scene.adaptFrameToClip
        ? scene.clipAspect
        : 16 / 9;

  const hasAnyCaption = scene.hasCaption || scene.hasSourceLine;
  const shell = fitVideoShellInBox({
    boxX: scene.boxX,
    boxY: scene.boxY,
    boxWidth: scene.boxWidth,
    boxHeight: scene.boxHeight,
    screenAspect: targetAspect,
    bezelLeftRatio: 0.025,
    bezelRightRatio: 0.025,
    bezelTopRatio: 0.025,
    bezelBottomRatio: 0.025,
    minPad: 6,
    hasCaptionText: hasAnyCaption,
    preferCaptionBelow: true,
  });

  // Enter: easeOutBack pop + subtle breathing during hold
  const enterP = progress(t, 0, vt.enter);
  const exitP = progress(t, vt.exitStart, vt.total);
  const popEase = easeOutBack(enterP);
  const exitEase = easeInCubic(exitP);
  const breathing = 1 + Math.sin(t * 2.3) * 0.014 * (1 - exitEase);
  const scaleFactor = clamp(lerp(0.65, 1.0, popEase) * lerp(1.0, 0.72, exitEase) * breathing, 0.08, 1.15);
  const alpha = isGreen ? (exitP > 0.88 ? 0 : 1) : clamp(enterP * 2.5, 0, 1) * (1 - exitEase);

  if (alpha <= 0.01) {
    ctx.restore();
    return;
  }

  const cx = shell.screenX + shell.screenW * 0.5;
  const cy = shell.screenY + shell.screenH * 0.5;
  const ringW = clamp(Math.round(Math.min(shell.screenW, shell.screenH) * 0.036), 4, 10);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scaleFactor, scaleFactor);
  ctx.translate(-cx, -cy);

  if (pipShape === 'circle') {
    const r = Math.min(shell.screenW, shell.screenH) * 0.5;
    if (isGreen) {
      ctx.fillStyle = VID_PIP_CONFIG.colors.hardShadow;
      ctx.beginPath();
      ctx.arc(cx + 8, cy + 10, r + ringW, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(cx, cy, r + ringW, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Thick Accent Ring
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(cx, cy, r + ringW, 0, Math.PI * 2);
    ctx.fill();

    // Inner circular video clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    drawVideoClipInScreen(
      ctx,
      scene.drawable,
      scene.crop,
      scene.fitMode,
      cx - r,
      cy - r,
      r * 2,
      r * 2,
      '#090D16'
    );
    if (hasAnyCaption && !shell.captionBelow) {
      drawVideoCaptionAndSource({
        ctx,
        areaX: cx - r,
        areaY: cy - r,
        areaW: r * 2,
        areaH: r * 2,
        insideOverlay: true,
        caption: scene.caption,
        hasCaption: scene.hasCaption,
        sourceLine: scene.sourceLine,
        hasSourceLine: scene.hasSourceLine,
        fontFamily:
          custom.quoteFontOverride ||
          (scene.direction === 'ltr'
            ? VID_PIP_CONFIG.fonts.captionEn
            : VID_PIP_CONFIG.fonts.captionAr),
        fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
        direction: scene.direction,
        textColor: VID_PIP_CONFIG.colors.captionText,
        keywordColor,
        accentColor,
        isGreen,
        t,
        captionStartSec: vt.clipStart * 0.55,
        alpha: 1,
        seed: custom.seed,
      });
    }
    ctx.restore();

    // Small pulsing live dot on top-right of circle rim
    const dotAngle = -Math.PI * 0.25;
    const dotX = cx + Math.cos(dotAngle) * (r + ringW * 0.35);
    const dotY = cy + Math.sin(dotAngle) * (r + ringW * 0.35);
    const dotR = clamp(Math.round(r * 0.08), 5, 11);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.2);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR + 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = VID_PIP_CONFIG.colors.liveRed;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR * (isGreen ? 1 : lerp(0.85, 1.08, pulse)), 0, Math.PI * 2);
    ctx.fill();
  } else {
    const cornerR = clamp(Math.round(Math.min(shell.screenW, shell.screenH) * 0.12), 12, 32);
    if (isGreen) {
      ctx.fillStyle = VID_PIP_CONFIG.colors.hardShadow;
      ctx.beginPath();
      ctx.roundRect(
        shell.screenX - ringW + 8,
        shell.screenY - ringW + 10,
        shell.screenW + ringW * 2,
        shell.screenH + ringW * 2,
        cornerR + ringW
      );
      ctx.fill();
    } else {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.52)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.roundRect(
        shell.screenX - ringW,
        shell.screenY - ringW,
        shell.screenW + ringW * 2,
        shell.screenH + ringW * 2,
        cornerR + ringW
      );
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.roundRect(
      shell.screenX - ringW,
      shell.screenY - ringW,
      shell.screenW + ringW * 2,
      shell.screenH + ringW * 2,
      cornerR + ringW
    );
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(shell.screenX, shell.screenY, shell.screenW, shell.screenH, cornerR);
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
      '#090D16'
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
            ? VID_PIP_CONFIG.fonts.captionEn
            : VID_PIP_CONFIG.fonts.captionAr),
        fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
        direction: scene.direction,
        textColor: VID_PIP_CONFIG.colors.captionText,
        keywordColor,
        accentColor,
        isGreen,
        t,
        captionStartSec: vt.clipStart * 0.55,
        alpha: 1,
        seed: custom.seed,
      });
    }
    ctx.restore();

    // Pulsing live dot on top-right corner
    const dotR = clamp(Math.round(Math.min(shell.screenW, shell.screenH) * 0.045), 5, 10);
    const dotX = shell.screenX + shell.screenW - dotR * 1.4;
    const dotY = shell.screenY + dotR * 1.4;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.2);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = VID_PIP_CONFIG.colors.liveRed;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR * (isGreen ? 1 : lerp(0.85, 1.1, pulse)), 0, Math.PI * 2);
    ctx.fill();
  }

  // Optional Name Tag Badge at bottom of PiP bubble
  if (nameTag.length > 0) {
    const tagFontSize = clamp(Math.round(shell.screenW * 0.075), 11, 20);
    applyStudioCanvasTextProps(ctx, 'Cairo', 700, tagFontSize, scene.direction);
    const textW = ctx.measureText(nameTag).width;
    const tagW = clamp(textW + 24, 60, shell.screenW * 0.92);
    const tagH = tagFontSize + 12;
    const tagX = cx - tagW * 0.5;
    const tagY = shell.screenY + shell.screenH - tagH * 0.55;

    ctx.fillStyle = VID_PIP_CONFIG.colors.tagBg;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, tagW, tagH, tagH * 0.5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    drawBidiWord(ctx, nameTag, cx + Math.min(textW, tagW - 14) * 0.5, tagY + tagH * 0.53, scene.direction);
  }

  ctx.restore();

  if (hasAnyCaption && shell.captionBelow) {
    drawVideoCaptionAndSource({
      ctx,
      areaX: shell.frameX - Math.round(shell.frameW * 0.14),
      areaY: shell.captionAreaY + (nameTag.length > 0 ? 10 : 0),
      areaW: shell.frameW * 1.28,
      areaH: Math.max(30, shell.captionAreaH - (nameTag.length > 0 ? 10 : 0)),
      insideOverlay: false,
      caption: scene.caption,
      hasCaption: scene.hasCaption,
      sourceLine: scene.sourceLine,
      hasSourceLine: scene.hasSourceLine,
      fontFamily:
        custom.quoteFontOverride ||
        (scene.direction === 'ltr'
          ? VID_PIP_CONFIG.fonts.captionEn
          : VID_PIP_CONFIG.fonts.captionAr),
      fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
      direction: scene.direction,
      textColor: VID_PIP_CONFIG.colors.captionText,
      keywordColor,
      accentColor,
      isGreen,
      t,
      captionStartSec: vt.clipStart * 0.55,
      alpha,
      seed: custom.seed,
      pillBackground: isGreen ? '#0F172A' : 'rgba(15, 23, 42, 0.78)',
    });
  }

  ctx.restore();
};
