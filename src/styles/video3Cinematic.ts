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
import { getCachedFilmGrainTile } from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeOutCubic,
  lerp,
  progress,
} from '../utils/math';
import {
  applyCinematicTealOrangeToScratch,
  computeStandardVideoEventTimes,
  drawVideoCaptionAndSource,
  drawVideoClipInScreen,
  fitVideoShellInBox,
  resolveVideoScene,
} from './videoShared';

export const VID_CINEMATIC_CONFIG = {
  id: 'vid_cinematic' as const,
  mode: 'video' as const,
  nameAr: 'كادر سينمائي',
  nameEn: 'Cinematic 2.39:1 Frame',
  descriptionAr:
    'كادر عريض 2.39:1 مع تدريج لوني Teal & Orange اختياري، حبيبات فيلم، خط تمييز، وتعليق سفلي أنيق',
  defaultAccent: '#F59E0B',
  defaultKeywordColor: '#38BDF8',
  defaultQuoteFont: 'Reem Kufi' as ArabicFontFamily,
  defaultAuthorFont: 'Readex Pro' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Cinzel' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  colors: {
    backdropBlack: '#06080C',
    letterboxBar: '#040507',
    hardShadow: '#05070B',
    captionText: '#F8FAFC',
  },
  fonts: {
    captionAr: 'Reem Kufi' as ArabicFontFamily,
    captionEn: 'Cinzel' as EnglishFontFamily,
  },
};

export function getVidCinematicEventTimes(
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
    VID_CINEMATIC_CONFIG.fonts.captionAr,
    VID_CINEMATIC_CONFIG.fonts.captionEn
  );
}

export const renderVidCinematic: PureStyleRenderer = (
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
  const accentColor = custom.accentColor || VID_CINEMATIC_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || VID_CINEMATIC_CONFIG.defaultKeywordColor;

  // 1. Background
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = VID_CINEMATIC_CONFIG.colors.backdropBlack;
    ctx.fillRect(0, 0, W, H);
  }

  // Enter: bars slide in, fade up from black. Exit: caption fades first, then fade to black.
  const enterP = easeOutCubic(progress(t, 0, vt.enter));
  const exitP = easeInCubic(progress(t, vt.exitStart, vt.total));
  const videoFadeP = clamp(enterP * (1 - progress(exitP, 0.25, 1.0)), 0, 1);
  const captionAlpha = clamp(1 - progress(exitP, 0, 0.55), 0, 1);

  if (isGreen && videoFadeP <= 0.02) {
    ctx.restore();
    return;
  }

  // Cinematic always stays 2.39:1 (cropped or contained inside per fit toggle)
  const hasAnyCaption = scene.hasCaption || scene.hasSourceLine;
  const shell = fitVideoShellInBox({
    boxX: scene.boxX,
    boxY: scene.boxY,
    boxWidth: scene.boxWidth,
    boxHeight: scene.boxHeight,
    screenAspect: 2.39,
    bezelLeftRatio: 0,
    bezelRightRatio: 0,
    bezelTopRatio: 0,
    bezelBottomRatio: 0,
    minPad: 0,
    hasCaptionText: hasAnyCaption,
    preferCaptionBelow: false,
  });

  const fx = shell.screenX;
  const fy = shell.screenY;
  const fw = shell.screenW;
  const fh = shell.screenH;

  if (isGreen) {
    ctx.fillStyle = VID_CINEMATIC_CONFIG.colors.hardShadow;
    ctx.fillRect(fx + 10, fy + 10, fw, fh);
  }

  // Optional Teal & Orange tone pass
  const useGrade = custom.cinematicGrade !== false;
  const gradedDrawable = useGrade
    ? applyCinematicTealOrangeToScratch(scene.drawable, fw, fh)
    : scene.drawable;

  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, fy, fw, fh);
  ctx.clip();

  ctx.fillStyle = '#05070A';
  ctx.fillRect(fx, fy, fw, fh);

  ctx.save();
  if (!isGreen) {
    ctx.globalAlpha = videoFadeP;
  }
  drawVideoClipInScreen(
    ctx,
    gradedDrawable,
    scene.crop,
    scene.fitMode,
    fx,
    fy,
    fw,
    fh,
    '#05070A'
  );
  ctx.restore();

  // Lower-third / bottom-overlay caption + thin accent line
  if (hasAnyCaption) {
    drawVideoCaptionAndSource({
      ctx,
      areaX: fx,
      areaY: fy,
      areaW: fw,
      areaH: fh,
      insideOverlay: true,
      caption: scene.caption,
      hasCaption: scene.hasCaption,
      sourceLine: scene.sourceLine,
      hasSourceLine: scene.hasSourceLine,
      fontFamily:
        custom.quoteFontOverride ||
        (scene.direction === 'ltr'
          ? VID_CINEMATIC_CONFIG.fonts.captionEn
          : VID_CINEMATIC_CONFIG.fonts.captionAr),
      fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
      direction: scene.direction,
      textColor: VID_CINEMATIC_CONFIG.colors.captionText,
      keywordColor,
      accentColor,
      isGreen,
      t,
      captionStartSec: vt.clipStart * 0.55,
      alpha: captionAlpha,
      seed: custom.seed,
    });
  }
  ctx.restore(); // end rect clip

  // Thin accent frame border
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(fx, fy, fw, fh);

  // Full-frame letterbox bars, vignette & deterministic grain ONLY in style mode
  if (!isGreen) {
    const barTargetH = Math.max(0, fy);
    const barH = lerp(0, barTargetH, enterP);
    if (barH > 1) {
      ctx.fillStyle = VID_CINEMATIC_CONFIG.colors.letterboxBar;
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
    }

    const vig = ctx.createRadialGradient(
      W * 0.5,
      H * 0.5,
      Math.min(W, H) * 0.28,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.72
    );
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.56)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    const grainBucket = Math.floor(t * 12);
    const grainTile = getCachedFilmGrainTile(custom.seed, grainBucket);
    ctx.save();
    ctx.globalAlpha = 0.24;
    const pat = ctx.createPattern(grainTile, 'repeat');
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  ctx.restore();
};
