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
  easeOutCubic,
  lerp,
  progress,
} from '../utils/math';
import {
  computeStandardVideoEventTimes,
  drawVideoCaptionAndSource,
  drawVideoClipInScreen,
  fitVideoShellInBox,
  getCachedCrtScanlineOverlay,
  resolveVideoScene,
  seededNoiseOffset,
} from './videoShared';

export const VID_CRT_CONFIG = {
  id: 'vid_crt' as const,
  mode: 'video' as const,
  nameAr: 'تلفزيون قديم',
  nameEn: 'Retro CRT TV',
  descriptionAr:
    'جهاز تلفزيون كلاسيكي بمفاتيح دوّارة وهوائي مع خطوط مسح CRT ولمعة تشغيل وخطوط انكماش عند الإغلاق',
  defaultAccent: '#F59E0B',
  defaultKeywordColor: '#38BDF8',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Tajawal' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Share Tech Mono' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  colors: {
    roomBg: '#1A1512',
    cabinetDark: '#3B2B22',
    cabinetMid: '#523C2F',
    bezelInner: '#1E1A18',
    screenOff: '#0A0A0D',
    knobMetal: '#C9B8A3',
    hardShadow: '#0D0907',
    captionText: '#F8FAFC',
  },
  fonts: {
    captionAr: 'Cairo' as ArabicFontFamily,
    captionEn: 'Plus Jakarta Sans' as EnglishFontFamily,
  },
};

export function getVidCrtEventTimes(
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
    VID_CRT_CONFIG.fonts.captionAr,
    VID_CRT_CONFIG.fonts.captionEn
  );
}

export const renderVidCrt: PureStyleRenderer = (
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
  const accentColor = custom.accentColor || VID_CRT_CONFIG.defaultAccent;
  const keywordColor = custom.keywordColor || VID_CRT_CONFIG.defaultKeywordColor;

  // 1. Background
  ctx.save();
  if (isGreen) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = VID_CRT_CONFIG.colors.roomBg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.5, H * 0.48, 20, W * 0.5, H * 0.5, Math.max(W, H) * 0.65);
    glow.addColorStop(0, 'rgba(245, 158, 11, 0.12)');
    glow.addColorStop(1, 'rgba(26, 21, 18, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  // CRT switches strictly between 4:3 and 16:9 when adaptive is ON, or stays 4:3 when OFF
  const crtAspect = scene.adaptFrameToClip
    ? scene.clipAspect < 1.55
      ? 4 / 3
      : 16 / 9
    : 4 / 3;

  const hasAnyCaption = scene.hasCaption || scene.hasSourceLine;
  const shell = fitVideoShellInBox({
    boxX: scene.boxX,
    boxY: scene.boxY,
    boxWidth: scene.boxWidth,
    boxHeight: scene.boxHeight,
    screenAspect: crtAspect,
    bezelLeftRatio: 0.045,
    bezelRightRatio: 0.145,
    bezelTopRatio: 0.11,
    bezelBottomRatio: 0.065,
    minPad: 8,
    hasCaptionText: hasAnyCaption,
    preferCaptionBelow: true,
  });

  // Top antenna space inside padded bezel area
  const antennaH = clamp(Math.round(shell.frameH * 0.11), 12, 46);
  const cabinetY = shell.frameY + Math.round(antennaH * 0.55);
  const cabinetH = Math.max(44, shell.frameH - Math.round(antennaH * 0.55));
  const cabinetR = clamp(Math.round(Math.min(shell.frameW, cabinetH) * 0.045), 6, 18);

  const enterP = easeOutCubic(progress(t, 0, vt.enter));
  const exitP = easeInCubic(progress(t, vt.exitStart, vt.total));
  const shellAlpha = isGreen ? (exitP > 0.9 ? 0 : 1) : clamp(progress(t, 0, 0.25) * (1 - progress(exitP, 0.55, 1)), 0, 1);

  if (shellAlpha <= 0.01) {
    ctx.restore();
    return;
  }

  ctx.globalAlpha = shellAlpha;

  // 2. Hard shadow (green) or soft floor shadow (style)
  if (isGreen) {
    ctx.fillStyle = VID_CRT_CONFIG.colors.hardShadow;
    ctx.beginPath();
    ctx.roundRect(shell.frameX + 10, cabinetY + 10, shell.frameW, cabinetH, cabinetR);
    ctx.fill();
  } else {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = VID_CRT_CONFIG.colors.cabinetDark;
    ctx.beginPath();
    ctx.roundRect(shell.frameX, cabinetY, shell.frameW, cabinetH, cabinetR);
    ctx.fill();
    ctx.restore();
  }

  // 3. Rabbit-ears Antenna (inside box top area)
  const antCx = shell.frameX + shell.frameW * 0.48;
  const antBaseY = cabinetY + 2;
  const antSpread = Math.min(shell.frameW * 0.18, antennaH * 1.45);
  ctx.strokeStyle = isGreen ? '#D4C7B4' : '#B8A896';
  ctx.lineWidth = Math.max(2, Math.round(shell.frameW * 0.005));
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(antCx - 6, antBaseY);
  ctx.lineTo(antCx - antSpread, shell.frameY + 3);
  ctx.moveTo(antCx + 6, antBaseY);
  ctx.lineTo(antCx + antSpread, shell.frameY + 3);
  ctx.stroke();

  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.arc(antCx - antSpread, shell.frameY + 3, 3.2, 0, Math.PI * 2);
  ctx.arc(antCx + antSpread, shell.frameY + 3, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // 4. Outer Wooden/Bakelite TV Cabinet
  ctx.fillStyle = VID_CRT_CONFIG.colors.cabinetMid;
  ctx.strokeStyle = isGreen ? '#261B14' : '#7C5D4A';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(shell.frameX, cabinetY, shell.frameW, cabinetH, cabinetR);
  ctx.fill();
  ctx.stroke();

  // Inner dark molded bezel around screen
  const scrR = clamp(Math.round(Math.min(shell.screenW, shell.screenH) * 0.06), 6, 22);
  const scrX = shell.screenX;
  const scrY = clamp(
    shell.screenY + Math.round(antennaH * 0.25),
    cabinetY + 8,
    cabinetY + cabinetH - shell.screenH - 8
  );
  const scrW = shell.screenW;
  const scrH = Math.min(shell.screenH, cabinetH - 16);

  ctx.fillStyle = VID_CRT_CONFIG.colors.bezelInner;
  ctx.beginPath();
  ctx.roundRect(scrX - 6, scrY - 6, scrW + 12, scrH + 12, scrR + 4);
  ctx.fill();

  // Right-side Rotary Knobs & Speaker Grille (kept inside cabinet bounds)
  const panelLeft = scrX + scrW + 10;
  const panelRight = shell.frameX + shell.frameW - 10;
  const panelW = panelRight - panelLeft;
  if (panelW >= 22) {
    const panelCx = (panelLeft + panelRight) * 0.5;
    const knobR = clamp(Math.round(panelW * 0.28), 6, 18);
    const knob1Y = scrY + scrH * 0.24;
    const knob2Y = scrY + scrH * 0.48;

    for (let k = 0; k < 2; k++) {
      const ky = k === 0 ? knob1Y : knob2Y;
      ctx.fillStyle = '#1B1410';
      ctx.beginPath();
      ctx.arc(panelCx, ky, knobR + 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = VID_CRT_CONFIG.colors.knobMetal;
      ctx.beginPath();
      ctx.arc(panelCx, ky, knobR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#3B2B22';
      ctx.lineWidth = 2;
      const rot = k === 0 ? -0.6 : 0.7;
      ctx.beginPath();
      ctx.moveTo(panelCx, ky);
      ctx.lineTo(panelCx + Math.cos(rot) * knobR * 0.78, ky + Math.sin(rot) * knobR * 0.78);
      ctx.stroke();
    }

    // Power LED + speaker vents
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(panelCx, scrY + scrH * 0.64, clamp(knobR * 0.28, 2.5, 4.5), 0, Math.PI * 2);
    ctx.fill();

    const slotStartY = scrY + scrH * 0.73;
    const slotEndY = scrY + scrH * 0.92;
    ctx.strokeStyle = '#18110D';
    ctx.lineWidth = 2;
    for (let sy = slotStartY; sy <= slotEndY; sy += 6) {
      ctx.beginPath();
      ctx.moveTo(panelLeft + 4, sy);
      ctx.lineTo(panelRight - 4, sy);
      ctx.stroke();
    }
  }

  // 5. Screen Content + CRT Power-On / Power-Off Line Collapse Animation
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(scrX, scrY, scrW, scrH, scrR);
  ctx.clip();

  ctx.fillStyle = VID_CRT_CONFIG.colors.screenOff;
  ctx.fillRect(scrX, scrY, scrW, scrH);

  // Power-on horizontal beam expansion -> full frame -> collapse to horizontal line
  let beamScaleY = 1;
  let beamScaleX = 1;
  let showBeamFlash = false;
  if (t < vt.enter) {
    if (enterP < 0.35) {
      beamScaleX = clamp(enterP / 0.35, 0.05, 1);
      beamScaleY = 0.02;
      showBeamFlash = true;
    } else {
      beamScaleX = 1;
      beamScaleY = easeOutCubic((enterP - 0.35) / 0.65);
    }
  } else if (t > vt.exitStart) {
    if (exitP < 0.65) {
      beamScaleY = clamp(1 - exitP / 0.65, 0.02, 1);
      beamScaleX = 1;
      if (beamScaleY < 0.08) showBeamFlash = true;
    } else {
      beamScaleY = 0.02;
      beamScaleX = clamp(1 - (exitP - 0.65) / 0.35, 0, 1);
      showBeamFlash = true;
    }
  }

  if (beamScaleY > 0.03 && beamScaleX > 0.03) {
    ctx.save();
    const cy = scrY + scrH * 0.5;
    const cx = scrX + scrW * 0.5;
    ctx.translate(cx, cy);
    ctx.scale(beamScaleX, beamScaleY);
    ctx.translate(-cx, -cy);

    drawVideoClipInScreen(
      ctx,
      scene.drawable,
      scene.crop,
      scene.fitMode,
      scrX,
      scrY,
      scrW,
      scrH,
      VID_CRT_CONFIG.colors.screenOff
    );

    // Subtle scanlines & RGB fringe & seeded CRT flicker (ONLY in style mode)
    if (!isGreen) {
      const flicker = 0.96 + seededNoiseOffset(custom.seed, Math.floor(t * 24)) * 0.06;
      const scanTile = getCachedCrtScanlineOverlay(scrW, scrH);
      ctx.save();
      ctx.globalAlpha *= 0.85 * flicker;
      ctx.drawImage(scanTile, scrX, scrY, scrW, scrH);
      ctx.restore();

      const curveVig = ctx.createRadialGradient(
        scrX + scrW * 0.5,
        scrY + scrH * 0.5,
        Math.min(scrW, scrH) * 0.25,
        scrX + scrW * 0.5,
        scrY + scrH * 0.5,
        Math.max(scrW, scrH) * 0.68
      );
      curveVig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      curveVig.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
      ctx.fillStyle = curveVig;
      ctx.fillRect(scrX, scrY, scrW, scrH);
    }

    // If caption doesn't fit cleanly below, place inside screen bottom safe zone
    if (hasAnyCaption && !shell.captionBelow) {
      drawVideoCaptionAndSource({
        ctx,
        areaX: scrX,
        areaY: scrY,
        areaW: scrW,
        areaH: scrH,
        insideOverlay: true,
        caption: scene.caption,
        hasCaption: scene.hasCaption,
        sourceLine: scene.sourceLine,
        hasSourceLine: scene.hasSourceLine,
        fontFamily:
          custom.quoteFontOverride ||
          (scene.direction === 'ltr'
            ? VID_CRT_CONFIG.fonts.captionEn
            : VID_CRT_CONFIG.fonts.captionAr),
        fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
        direction: scene.direction,
        textColor: VID_CRT_CONFIG.colors.captionText,
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
  }

  if (showBeamFlash) {
    ctx.fillStyle = '#FFFFFF';
    const bw = scrW * beamScaleX;
    ctx.fillRect(scrX + (scrW - bw) * 0.5, scrY + scrH * 0.5 - 2, bw, 4);
  }

  ctx.restore(); // end screen clip

  // Caption below TV when room exists
  if (hasAnyCaption && shell.captionBelow) {
    drawVideoCaptionAndSource({
      ctx,
      areaX: shell.frameX,
      areaY: shell.captionAreaY,
      areaW: shell.frameW,
      areaH: shell.captionAreaH,
      insideOverlay: false,
      caption: scene.caption,
      hasCaption: scene.hasCaption,
      sourceLine: scene.sourceLine,
      hasSourceLine: scene.hasSourceLine,
      fontFamily:
        custom.quoteFontOverride ||
        (scene.direction === 'ltr'
          ? VID_CRT_CONFIG.fonts.captionEn
          : VID_CRT_CONFIG.fonts.captionAr),
      fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
      direction: scene.direction,
      textColor: VID_CRT_CONFIG.colors.captionText,
      keywordColor,
      accentColor,
      isGreen,
      t,
      captionStartSec: vt.clipStart * 0.6,
      alpha: 1,
      seed: custom.seed,
      pillBackground: isGreen ? '#161210' : 'rgba(20, 16, 13, 0.78)',
    });
  }

  ctx.restore();
};

export { lerp };
