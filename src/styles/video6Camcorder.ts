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
  progress,
} from '../utils/math';
import {
  computeStandardVideoEventTimes,
  drawVideoCaptionAndSource,
  drawVideoClipInScreen,
  fitVideoShellInBox,
  resolveVideoScene,
  seededNoiseOffset,
} from './videoShared';

export const VID_CAMCORDER_CONFIG = {
  id: 'vid_camcorder' as const,
  mode: 'video' as const,
  nameAr: 'كاميرا فيديو',
  nameEn: 'Camcorder Viewfinder',
  descriptionAr:
    'واجهة عدسة كاميرا فيديو بمؤشر REC وامض، عداد وقت رقمي حي، أيقونة البطارية، وتأثير تشغيل كلاسيكي',
  defaultAccent: '#EF4444',
  defaultKeywordColor: '#FDE047',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Tajawal' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Share Tech Mono' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'JetBrains Mono' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  colors: {
    roomBg: '#090B0E',
    frameBg: '#07090C',
    hudText: '#F8FAFC',
    recRed: '#EF4444',
    hardShadow: '#05070A',
  },
  fonts: {
    captionAr: 'Cairo' as ArabicFontFamily,
    captionEn: 'Share Tech Mono' as EnglishFontFamily,
  },
};

export function getVidCamcorderEventTimes(
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
    VID_CAMCORDER_CONFIG.fonts.captionAr,
    VID_CAMCORDER_CONFIG.fonts.captionEn
  );
}

function formatCamcorderTimecode(sourceSec: number): string {
  const safe = Math.max(0, sourceSec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe - Math.floor(safe)) * 30);
  const hrs = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

export const renderVidCamcorder: PureStyleRenderer = (
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
  const accentColor = custom.accentColor || VID_CAMCORDER_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || VID_CAMCORDER_CONFIG.defaultKeywordColor;

  // 1. Background
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = VID_CAMCORDER_CONFIG.colors.roomBg;
    ctx.fillRect(0, 0, W, H);
  }

  const vfAspect = scene.adaptFrameToClip ? scene.clipAspect : 16 / 9;
  const hasAnyCaption = scene.hasCaption || scene.hasSourceLine;
  const shell = fitVideoShellInBox({
    boxX: scene.boxX,
    boxY: scene.boxY,
    boxWidth: scene.boxWidth,
    boxHeight: scene.boxHeight,
    screenAspect: vfAspect,
    bezelLeftRatio: 0.012,
    bezelRightRatio: 0.012,
    bezelTopRatio: 0.012,
    bezelBottomRatio: 0.012,
    minPad: 4,
    hasCaptionText: hasAnyCaption,
    preferCaptionBelow: true,
  });

  const enterP = progress(t, 0, vt.enter);
  const exitP = progress(t, vt.exitStart, vt.total);
  const enterAlpha = easeOutCubic(clamp(enterP * 1.6, 0, 1));
  const exitAlpha = 1 - easeInCubic(exitP);
  const masterAlpha = isGreen ? (exitP > 0.9 ? 0 : 1) : clamp(enterAlpha * exitAlpha, 0, 1);

  if (masterAlpha <= 0.01) {
    ctx.restore();
    return;
  }

  ctx.globalAlpha = masterAlpha;

  const fx = shell.screenX;
  const fy = shell.screenY;
  const fw = shell.screenW;
  const fh = shell.screenH;

  if (isGreen) {
    ctx.fillStyle = VID_CAMCORDER_CONFIG.colors.hardShadow;
    ctx.fillRect(fx + 10, fy + 10, fw, fh);
  }

  // 2. Viewfinder Video Surface
  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, fy, fw, fh);
  ctx.clip();

  drawVideoClipInScreen(
    ctx,
    scene.drawable,
    scene.crop,
    scene.fitMode,
    fx,
    fy,
    fw,
    fh,
    VID_CAMCORDER_CONFIG.colors.frameBg
  );

  // Enter power-on static flicker & style-only tracking noise/vignette
  if (!isGreen) {
    const vig = ctx.createRadialGradient(
      fx + fw * 0.5,
      fy + fh * 0.5,
      Math.min(fw, fh) * 0.3,
      fx + fw * 0.5,
      fy + fh * 0.5,
      Math.max(fw, fh) * 0.72
    );
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.36)');
    ctx.fillStyle = vig;
    ctx.fillRect(fx, fy, fw, fh);

    // Subtle seeded tracking stripe noise + enter power-on flicker
    const isPowerFlicker = t < vt.enter * 0.65;
    const grainBucket = Math.floor(t * 24);
    const grainTile = getCachedFilmGrainTile(custom.seed, grainBucket);
    ctx.save();
    ctx.globalAlpha *= isPowerFlicker ? 0.52 : 0.16;
    const pat = ctx.createPattern(grainTile, 'repeat');
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(fx, fy, fw, fh);
    }
    ctx.restore();

    if (isPowerFlicker) {
      const bandY = fy + seededNoiseOffset(custom.seed, Math.floor(t * 36)) * fh;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.fillRect(fx, bandY, fw, clamp(Math.round(fh * 0.04), 4, 14));
    }
  }

  // 3. Corner L-Brackets inside Viewfinder
  const pad = clamp(Math.round(Math.min(fw, fh) * 0.05), 10, 26);
  const arm = clamp(Math.round(Math.min(fw, fh) * 0.085), 16, 46);
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.92)';
  ctx.lineWidth = clamp(Math.round(Math.min(fw, fh) * 0.006), 2, 4);
  ctx.lineCap = 'square';

  // Top-left bracket
  ctx.beginPath();
  ctx.moveTo(fx + pad, fy + pad + arm);
  ctx.lineTo(fx + pad, fy + pad);
  ctx.lineTo(fx + pad + arm, fy + pad);
  // Top-right bracket
  ctx.moveTo(fx + fw - pad - arm, fy + pad);
  ctx.lineTo(fx + fw - pad, fy + pad);
  ctx.lineTo(fx + fw - pad, fy + pad + arm);
  // Bottom-left bracket
  ctx.moveTo(fx + pad, fy + fh - pad - arm);
  ctx.lineTo(fx + pad, fy + fh - pad);
  ctx.lineTo(fx + pad + arm, fy + fh - pad);
  // Bottom-right bracket
  ctx.moveTo(fx + fw - pad - arm, fy + fh - pad);
  ctx.lineTo(fx + fw - pad, fy + fh - pad);
  ctx.lineTo(fx + fw - pad, fy + fh - pad - arm);
  ctx.stroke();

  // 4. Blinking Red REC Dot (530ms period) + PLAY badge + Battery + LTR Timecode
  const hudSize = clamp(Math.round(Math.min(fw, fh) * 0.042), 11, 22);
  const hudInsetX = fx + pad + Math.max(8, Math.round(hudSize * 0.45));
  const hudTopY = fy + pad + Math.max(10, Math.round(hudSize * 0.65));

  const recOn = Math.floor((t * 1000) / 530) % 2 === 0;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.font = `700 ${hudSize}px "Share Tech Mono", "JetBrains Mono", monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  if (recOn) {
    const dotR = clamp(Math.round(hudSize * 0.34), 4, 9);
    ctx.fillStyle = VID_CAMCORDER_CONFIG.colors.recRed;
    ctx.beginPath();
    ctx.arc(hudInsetX + dotR, hudTopY, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = VID_CAMCORDER_CONFIG.colors.hudText;
  ctx.fillText('REC', hudInsetX + Math.round(hudSize * 0.95), hudTopY);

  // PLAY badge + battery on top-right HUD corner
  const batW = clamp(Math.round(hudSize * 1.45), 18, 32);
  const batH = clamp(Math.round(hudSize * 0.78), 10, 17);
  const batX = fx + fw - pad - 8 - batW;
  const batY = hudTopY - batH * 0.5;
  ctx.strokeStyle = VID_CAMCORDER_CONFIG.colors.hudText;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(batX, batY, batW, batH);
  ctx.fillStyle = VID_CAMCORDER_CONFIG.colors.hudText;
  ctx.fillRect(batX + batW, batY + batH * 0.25, 3, batH * 0.5);
  ctx.fillRect(batX + 2.5, batY + 2.5, (batW - 5) * 0.78, batH - 5);

  ctx.textAlign = 'right';
  ctx.fillText('PLAY ▶', batX - 10, hudTopY);

  // Running LTR Latin-digit timecode bottom-left inside viewfinder
  const tcText = formatCamcorderTimecode(scene.sourceTime);
  const hudBotY = fy + fh - pad - Math.max(10, Math.round(hudSize * 0.6));
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  const tcWidth = ctx.measureText(tcText).width + 12;
  ctx.fillRect(hudInsetX - 6, hudBotY - hudSize * 0.65, tcWidth, hudSize * 1.3);
  ctx.fillStyle = VID_CAMCORDER_CONFIG.colors.hudText;
  ctx.fillText(tcText, hudInsetX, hudBotY);
  ctx.restore();

  // Caption overlay inside bottom if captionBelow isn't used
  if (hasAnyCaption && !shell.captionBelow) {
    drawVideoCaptionAndSource({
      ctx,
      areaX: fx,
      areaY: fy,
      areaW: fw,
      areaH: fh - pad - hudSize - 6,
      insideOverlay: true,
      caption: scene.caption,
      hasCaption: scene.hasCaption,
      sourceLine: scene.sourceLine,
      hasSourceLine: scene.hasSourceLine,
      fontFamily:
        custom.quoteFontOverride ||
        (scene.direction === 'ltr'
          ? VID_CAMCORDER_CONFIG.fonts.captionEn
          : VID_CAMCORDER_CONFIG.fonts.captionAr),
      fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
      direction: scene.direction,
      textColor: VID_CAMCORDER_CONFIG.colors.hudText,
      keywordColor,
      accentColor,
      isGreen,
      t,
      captionStartSec: vt.clipStart * 0.55,
      alpha: 1,
      seed: custom.seed,
    });
  }

  ctx.restore(); // end viewfinder clip

  // Thin viewfinder outer border
  ctx.strokeStyle = isGreen ? '#1E293B' : 'rgba(248, 250, 252, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(fx, fy, fw, fh);

  if (hasAnyCaption && shell.captionBelow) {
    drawVideoCaptionAndSource({
      ctx,
      areaX: fx,
      areaY: shell.captionAreaY,
      areaW: fw,
      areaH: shell.captionAreaH,
      insideOverlay: false,
      caption: scene.caption,
      hasCaption: scene.hasCaption,
      sourceLine: scene.sourceLine,
      hasSourceLine: scene.hasSourceLine,
      fontFamily:
        custom.quoteFontOverride ||
        (scene.direction === 'ltr'
          ? VID_CAMCORDER_CONFIG.fonts.captionEn
          : VID_CAMCORDER_CONFIG.fonts.captionAr),
      fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
      direction: scene.direction,
      textColor: VID_CAMCORDER_CONFIG.colors.hudText,
      keywordColor,
      accentColor,
      isGreen,
      t,
      captionStartSec: vt.clipStart * 0.55,
      alpha: 1,
      seed: custom.seed,
      pillBackground: isGreen ? '#0F172A' : 'rgba(15, 23, 42, 0.84)',
    });
  }

  ctx.restore();
};
