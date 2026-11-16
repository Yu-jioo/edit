import {
  BackgroundMode,
  CropState,
  ImageFitMode,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  TimelineConfig,
} from '../types';
import { createBufferCanvas, drawFittedImage, getOrGenerateCachedCanvas } from '../utils/assetCache';
import {
  clamp,
  computeVideoSourceTime,
  computeVideoTimeline,
  DEFAULT_VIDEO_BOX,
  DEFAULT_VIDEO_CAPTION,
  DEFAULT_VIDEO_DURATION,
  DEFAULT_VIDEO_SOURCE_LINE,
  easeInOutCubic,
  easeOutCubic,
  lerp,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
  stripKeywordMarkers,
  videoBoxToPixels,
  VideoTimelineComputed,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  ArabicQuoteLayout,
  drawBidiWord,
  KeywordLineRect,
  layoutArabicQuote,
} from '../utils/textLayout';
import { getVideoDisplayAspect, resolveVideoDrawableAtTime } from '../utils/videoSource';

export interface ResolvedVideoScene {
  bgMode: BackgroundMode;
  isGreen: boolean;
  timeline: VideoTimelineComputed;
  sourceTime: number;
  drawable: HTMLImageElement | HTMLCanvasElement;
  clipAspect: number;
  crop: CropState;
  fitMode: ImageFitMode;
  adaptFrameToClip: boolean;
  caption: string;
  hasCaption: boolean;
  sourceLine: string;
  hasSourceLine: boolean;
  direction: ResolvedTextDirection;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
}

export function resolveVideoScene(
  t: number,
  content: QuoteContent,
  _timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): ResolvedVideoScene {
  const { baseWidth: W, baseHeight: H } = size;
  const rawBg = resolveBackgroundMode(custom);
  // Video styles only support 'style' or 'green' ('black' falls back cleanly to 'style')
  const bgMode: BackgroundMode = rawBg === 'green' ? 'green' : 'style';
  const isGreen = bgMode === 'green';

  const duration =
    content.videoMeta?.duration && content.videoMeta.duration > 0
      ? content.videoMeta.duration
      : custom.videoDurationSec && custom.videoDurationSec > 0
        ? custom.videoDurationSec
        : DEFAULT_VIDEO_DURATION;

  const vt = computeVideoTimeline({
    videoDuration: duration,
    trimIn: custom.videoTrimIn ?? 0,
    trimOut: custom.videoTrimOut ?? duration,
    speed: custom.videoSpeed ?? 1.0,
    customDurationEnabled: custom.videoCustomDurationEnabled,
    customDuration: custom.videoCustomDuration,
  });

  const sourceTime = computeVideoSourceTime(t, {
    clipStart: vt.clipStart,
    clipEnd: vt.clipEnd,
    trimIn: vt.trimIn,
    trimOut: vt.trimOut,
    speed: vt.speed,
    endBehavior: custom.videoEndBehavior || 'freeze',
  });

  const drawable = resolveVideoDrawableAtTime(content, sourceTime);
  const clipAspect = getVideoDisplayAspect(content, drawable);

  const crop = content.videoCrop || { zoom: 1, offsetX: 0, offsetY: 0 };

  const fitMode: ImageFitMode = custom.videoFit || 'contain';
  const adaptFrameToClip = custom.videoAdaptFrameToClip !== false;

  const rawCaption =
    custom.videoCaption !== undefined
      ? custom.videoCaption
      : content.videoCaption !== undefined
        ? content.videoCaption
        : DEFAULT_VIDEO_CAPTION;
  const cleanCaption = stripKeywordMarkers(rawCaption || '').trim();
  const hasCaption = cleanCaption.length > 0;

  const rawSourceLine =
    custom.videoSourceLine !== undefined
      ? custom.videoSourceLine
      : content.videoSourceLine !== undefined
        ? content.videoSourceLine
        : '';
  const sourceLine = (rawSourceLine || '').trim();
  const hasSourceLine = sourceLine.length > 0;

  const direction = resolveTextDirection(
    custom,
    rawCaption || sourceLine || DEFAULT_VIDEO_CAPTION || DEFAULT_VIDEO_SOURCE_LINE
  );

  const px = videoBoxToPixels(
    custom.videoBox || DEFAULT_VIDEO_BOX,
    W,
    H,
    Boolean(custom.videoAllowOutOfMargin)
  );

  return {
    bgMode,
    isGreen,
    timeline: vt,
    sourceTime,
    drawable,
    clipAspect,
    crop,
    fitMode,
    adaptFrameToClip,
    caption: rawCaption || '',
    hasCaption,
    sourceLine,
    hasSourceLine,
    direction,
    boxX: px.boxX,
    boxY: px.boxY,
    boxWidth: px.boxWidth,
    boxHeight: px.boxHeight,
  };
}

export interface VideoFrameRects {
  frameX: number;
  frameY: number;
  frameW: number;
  frameH: number;
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
  captionBelow: boolean;
  captionAreaH: number;
  captionAreaY: number;
}

/**
 * Fits a video frame (outer chrome + inner screen + optional external caption area)
 * strictly inside { boxX, boxY, boxWidth, boxHeight } so nothing ever overflows or gets cut off,
 * while matching the chosen screen aspect ratio.
 */
export function fitVideoShellInBox(params: {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  screenAspect: number;
  bezelLeftRatio?: number;
  bezelRightRatio?: number;
  bezelTopRatio?: number;
  bezelBottomRatio?: number;
  minPad?: number;
  hasCaptionText: boolean;
  preferCaptionBelow: boolean;
}): VideoFrameRects {
  const {
    boxX,
    boxY,
    boxWidth,
    boxHeight,
    screenAspect,
    bezelLeftRatio = 0.04,
    bezelRightRatio = 0.04,
    bezelTopRatio = 0.04,
    bezelBottomRatio = 0.04,
    minPad = 6,
    hasCaptionText,
    preferCaptionBelow,
  } = params;

  const minFloor = 36;
  const sideRatio = bezelLeftRatio + bezelRightRatio;
  const vertRatio = bezelTopRatio + bezelBottomRatio;

  // Reserve room below the frame ONLY if enough vertical headroom exists so screen stays crisp
  let captionAreaH = 0;
  let captionBelow = false;
  if (hasCaptionText && preferCaptionBelow && boxHeight >= 210) {
    const candidateCapH = clamp(Math.round(boxHeight * 0.17), 44, 96);
    const remainH = boxHeight - candidateCapH - 10;
    if (remainH >= 110) {
      captionAreaH = candidateCapH;
      captionBelow = true;
    }
  }

  const availW = Math.max(minFloor, boxWidth);
  const availH = Math.max(minFloor, boxHeight - captionAreaH - (captionBelow ? 8 : 0));

  // Derive outer padding proportionally inside available box
  const padL = clamp(Math.round(availW * bezelLeftRatio), minPad, 72);
  const padR = clamp(Math.round(availW * bezelRightRatio), minPad, 110);
  const padT = clamp(Math.round(availH * bezelTopRatio), minPad, 80);
  const padB = clamp(Math.round(availH * bezelBottomRatio), minPad, 80);

  const maxInnerW = Math.max(minFloor, availW / (1 + sideRatio * 0.25) - padL - padR);
  const maxInnerH = Math.max(minFloor, availH / (1 + vertRatio * 0.25) - padT - padB);

  const safeMaxW = Math.max(minFloor, availW - padL - padR);
  const safeMaxH = Math.max(minFloor, availH - padT - padB);

  const targetMaxW = Math.max(maxInnerW, safeMaxW);
  const targetMaxH = Math.max(maxInnerH, safeMaxH);

  let screenW = targetMaxW;
  let screenH = screenW / screenAspect;
  if (screenH > targetMaxH) {
    screenH = targetMaxH;
    screenW = screenH * screenAspect;
  }

  screenW = Math.max(minFloor, Math.round(screenW));
  screenH = Math.max(minFloor, Math.round(screenH));

  const frameW = Math.min(availW, Math.round(screenW + padL + padR));
  const frameH = Math.min(availH, Math.round(screenH + padT + padB));

  // Center shell + caption group inside box
  const totalGroupH = frameH + (captionBelow ? captionAreaH + 8 : 0);
  const groupTop = boxY + Math.round((boxHeight - totalGroupH) * 0.5);
  const frameX = boxX + Math.round((boxWidth - frameW) * 0.5);
  const frameY = groupTop;

  const actualPadL = Math.round((frameW - screenW) * (bezelLeftRatio / Math.max(0.001, sideRatio || 1)));
  const actualPadT = Math.round((frameH - screenH) * (bezelTopRatio / Math.max(0.001, vertRatio || 1)));

  const screenX =
    sideRatio > 0.0001
      ? frameX + actualPadL
      : frameX + Math.round((frameW - screenW) * 0.5);
  const screenY =
    vertRatio > 0.0001
      ? frameY + actualPadT
      : frameY + Math.round((frameH - screenH) * 0.5);

  return {
    frameX,
    frameY,
    frameW,
    frameH,
    screenX,
    screenY,
    screenW,
    screenH,
    captionBelow,
    captionAreaH,
    captionAreaY: frameY + frameH + 8,
  };
}

/**
 * Draws the clipped video drawable into (screenX, screenY, screenW, screenH) using cover/contain
 * without stretching.
 */
export function drawVideoClipInScreen(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  drawable: HTMLImageElement | HTMLCanvasElement,
  crop: CropState,
  fitMode: ImageFitMode,
  screenX: number,
  screenY: number,
  screenW: number,
  screenH: number,
  backdropFill: string = '#090D16'
): void {
  ctx.fillStyle = backdropFill;
  ctx.fillRect(screenX, screenY, screenW, screenH);
  drawFittedImage(ctx, drawable, crop, fitMode, screenX, screenY, screenW, screenH, 1.0);
}

/**
 * Draws video caption (with *keyword* highlights & underline) and optional source line either:
 * - inside bottom overlay of screen (`insideOverlay = true`) OR
 * - inside a dedicated box below/outside the frame (`insideOverlay = false`).
 */
export function drawVideoCaptionAndSource(params: {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  areaX: number;
  areaY: number;
  areaW: number;
  areaH: number;
  insideOverlay: boolean;
  caption: string;
  hasCaption: boolean;
  sourceLine: string;
  hasSourceLine: boolean;
  fontFamily: string;
  fontSizeMultiplier: number;
  direction: ResolvedTextDirection;
  textColor: string;
  keywordColor: string;
  accentColor: string;
  isGreen: boolean;
  t: number;
  captionStartSec: number;
  alpha: number;
  seed: number;
  pillBackground?: string;
}): void {
  const {
    ctx,
    areaX,
    areaY,
    areaW,
    areaH,
    insideOverlay,
    caption,
    hasCaption,
    sourceLine,
    hasSourceLine,
    fontFamily,
    fontSizeMultiplier,
    direction,
    textColor,
    keywordColor,
    accentColor,
    isGreen,
    t,
    captionStartSec,
    alpha,
    seed,
    pillBackground,
  } = params;

  if ((!hasCaption && !hasSourceLine) || alpha <= 0.01) return;

  const revealP = easeOutCubic(progress(t, captionStartSec, captionStartSec + 0.35));
  const effAlpha = isGreen ? (revealP > 0.15 ? 1 : 0) : clamp(revealP * alpha, 0, 1);
  if (effAlpha <= 0.01) return;

  const padX = clamp(Math.round(areaW * 0.045), 8, 22);
  const srcSize = hasSourceLine ? clamp(Math.round(Math.min(areaW, areaH) * 0.036), 10, 14) : 0;
  const srcReserve = hasSourceLine ? srcSize + 6 : 0;

  if (insideOverlay) {
    const maxOverlayH = Math.max(40, Math.round(areaH * 0.44));
    const padTop = clamp(Math.round(areaH * 0.025), 6, 14);
    const padBot = clamp(Math.round(areaH * 0.03), 6, 14);

    let layout: ArabicQuoteLayout | null = null;
    if (hasCaption) {
      const maxFont = clamp(Math.round(Math.min(areaW * 0.068, areaH * 0.095)), 12, 32);
      layout = layoutArabicQuote(ctx, {
        text: caption,
        quotationMarks: 'none',
        fontFamily,
        fontWeight: 700,
        minFontSize: 12,
        maxFontSize: maxFont,
        fontSizeMultiplier: fontSizeMultiplier || 1.0,
        lineHeightRatio: 1.32,
        boxX: areaX + padX,
        boxY: areaY,
        boxWidth: Math.max(60, areaW - padX * 2),
        boxHeight: Math.max(26, maxOverlayH - padTop - padBot - srcReserve),
        align: 'center',
        direction,
      });
    }

    const overlayH = clamp(
      Math.round((layout ? layout.totalHeight : 0) + srcReserve + padTop + padBot),
      32,
      maxOverlayH
    );
    const overlayY = areaY + areaH - overlayH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(areaX, areaY, areaW, areaH);
    ctx.clip();

    if (isGreen) {
      ctx.globalAlpha *= effAlpha;
      ctx.fillStyle = '#0B0F17';
      ctx.fillRect(areaX, overlayY, areaW, overlayH);
      ctx.fillStyle = accentColor;
      ctx.fillRect(areaX, overlayY, areaW, 2.5);
    } else {
      const fadeLead = Math.min(28, Math.round(areaH * 0.12));
      const gradTop = Math.max(areaY, overlayY - fadeLead);
      const scrim = ctx.createLinearGradient(0, gradTop, 0, areaY + areaH);
      scrim.addColorStop(0, 'rgba(6, 10, 18, 0)');
      scrim.addColorStop(0.28, `rgba(6, 10, 18, ${(0.58 * effAlpha).toFixed(3)})`);
      scrim.addColorStop(1, `rgba(6, 10, 18, ${(0.9 * effAlpha).toFixed(3)})`);
      ctx.fillStyle = scrim;
      ctx.fillRect(areaX, gradTop, areaW, areaY + areaH - gradTop);

      ctx.save();
      ctx.globalAlpha *= effAlpha * 0.8;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.6;
      const ruleW = areaW * 0.56 * revealP;
      ctx.beginPath();
      ctx.moveTo(areaX + (areaW - ruleW) * 0.5, overlayY);
      ctx.lineTo(areaX + (areaW + ruleW) * 0.5, overlayY);
      ctx.stroke();
      ctx.restore();
    }

    if (hasCaption) {
      const maxFont = clamp(Math.round(Math.min(areaW * 0.068, areaH * 0.095)), 12, 32);
      const finalLayout = layoutArabicQuote(ctx, {
        text: caption,
        quotationMarks: 'none',
        fontFamily,
        fontWeight: 700,
        minFontSize: 12,
        maxFontSize: maxFont,
        fontSizeMultiplier: fontSizeMultiplier || 1.0,
        lineHeightRatio: 1.32,
        boxX: areaX + padX,
        boxY: overlayY + padTop,
        boxWidth: Math.max(60, areaW - padX * 2),
        boxHeight: Math.max(26, overlayH - padTop - padBot - srcReserve),
        align: 'center',
        direction,
      });
      renderLayoutWordsAndUnderline(
        ctx,
        finalLayout,
        t,
        captionStartSec,
        textColor,
        keywordColor,
        effAlpha,
        seed
      );
    }

    if (hasSourceLine && srcSize > 0) {
      ctx.save();
      ctx.globalAlpha *= effAlpha * 0.85;
      applyStudioCanvasTextProps(ctx, 'Cairo', 600, srcSize, direction);
      ctx.fillStyle = '#CBD5E1';
      const sw = ctx.measureText(sourceLine).width;
      const sy = areaY + areaH - Math.max(5, Math.round(padBot * 0.55));
      drawBidiWord(ctx, sourceLine, areaX + areaW * 0.5 + sw * 0.5, sy, direction);
      ctx.restore();
    }

    ctx.restore();
    return;
  }

  // Dedicated area below frame
  ctx.save();
  ctx.globalAlpha *= effAlpha;
  if (pillBackground) {
    ctx.fillStyle = pillBackground;
    ctx.beginPath();
    ctx.roundRect(areaX, areaY, areaW, areaH, clamp(Math.round(areaH * 0.28), 8, 18));
    ctx.fill();
  }

  if (hasCaption) {
    const maxFont = clamp(Math.round(Math.min(areaW * 0.055, areaH * 0.52)), 12, 30);
    const layout = layoutArabicQuote(ctx, {
      text: caption,
      quotationMarks: 'none',
      fontFamily,
      fontWeight: 700,
      minFontSize: 12,
      maxFontSize: maxFont,
      fontSizeMultiplier: fontSizeMultiplier || 1.0,
      lineHeightRatio: 1.28,
      boxX: areaX + padX,
      boxY: areaY + 4,
      boxWidth: Math.max(60, areaW - padX * 2),
      boxHeight: Math.max(22, areaH - srcReserve - 8),
      align: 'center',
      direction,
    });
    renderLayoutWordsAndUnderline(
      ctx,
      layout,
      t,
      captionStartSec,
      textColor,
      keywordColor,
      1.0,
      seed
    );
  }

  if (hasSourceLine && srcSize > 0) {
    ctx.save();
    ctx.globalAlpha *= 0.85;
    applyStudioCanvasTextProps(ctx, 'Cairo', 600, srcSize, direction);
    ctx.fillStyle = textColor;
    const sw = ctx.measureText(sourceLine).width;
    const sy = areaY + areaH - Math.max(6, Math.round(srcSize * 0.55));
    drawBidiWord(ctx, sourceLine, areaX + areaW * 0.5 + sw * 0.5, sy, direction);
    ctx.restore();
  }
  ctx.restore();
}

function renderLayoutWordsAndUnderline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: ArabicQuoteLayout,
  t: number,
  captionStartSec: number,
  textColor: string,
  keywordColor: string,
  alpha: number,
  _seed: number
) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (const w of layout.words) {
    applyStudioCanvasTextProps(
      ctx,
      layout.fontFamily,
      layout.fontWeight,
      w.fontSize,
      layout.direction
    );
    ctx.fillStyle = w.isKeyword ? keywordColor : textColor;
    drawBidiWord(ctx, w.text, w.x, w.y, layout.direction);
  }
  for (let i = 0; i < layout.keywordLineRects.length; i++) {
    const rect: KeywordLineRect = layout.keywordLineRects[i];
    const p = easeInOutCubic(progress(t, captionStartSec + 0.1 + i * 0.08, captionStartSec + 0.45 + i * 0.08));
    if (p <= 0.02) continue;
    const ly = rect.baselineY + Math.max(3, layout.fontSize * 0.12);
    const curW = rect.width * p;
    const sx = layout.direction === 'ltr' ? rect.leftX : rect.rightX;
    const ex = layout.direction === 'ltr' ? rect.leftX + curW : rect.rightX - curW;
    ctx.strokeStyle = keywordColor;
    ctx.lineWidth = Math.max(2, layout.fontSize * 0.075);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, ly);
    ctx.lineTo(ex, ly);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Shared EventTimes calculation for all 6 Video styles:
 * returns { enterStart, clipStart, clipEnd, keywordTimes[], annotationTimes[] }.
 */
export function computeStandardVideoEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  _timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize,
  defaultFontAr: string,
  defaultFontEn: string
): SceneEventTimes {
  const duration =
    content.videoMeta?.duration && content.videoMeta.duration > 0
      ? content.videoMeta.duration
      : custom.videoDurationSec && custom.videoDurationSec > 0
        ? custom.videoDurationSec
        : DEFAULT_VIDEO_DURATION;

  const vt = computeVideoTimeline({
    videoDuration: duration,
    trimIn: custom.videoTrimIn ?? 0,
    trimOut: custom.videoTrimOut ?? duration,
    speed: custom.videoSpeed ?? 1.0,
    customDurationEnabled: custom.videoCustomDurationEnabled,
    customDuration: custom.videoCustomDuration,
  });

  const rawCaption =
    custom.videoCaption !== undefined
      ? custom.videoCaption
      : content.videoCaption !== undefined
        ? content.videoCaption
        : DEFAULT_VIDEO_CAPTION;
  const cleanCaption = stripKeywordMarkers(rawCaption || '').trim();
  const keywordTimes: number[] = [];

  if (cleanCaption.length > 0) {
    const dir = resolveTextDirection(custom, rawCaption);
    const font = custom.quoteFontOverride || (dir === 'ltr' ? defaultFontEn : defaultFontAr);
    const px = videoBoxToPixels(
      custom.videoBox || DEFAULT_VIDEO_BOX,
      size.baseWidth,
      size.baseHeight,
      Boolean(custom.videoAllowOutOfMargin)
    );
    const layout = layoutArabicQuote(ctx, {
      text: rawCaption,
      quotationMarks: 'none',
      fontFamily: font,
      fontWeight: 700,
      minFontSize: 12,
      maxFontSize: 28,
      fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
      lineHeightRatio: 1.32,
      boxX: px.boxX,
      boxY: px.boxY,
      boxWidth: Math.max(80, px.boxWidth - 24),
      boxHeight: Math.max(40, Math.round(px.boxHeight * 0.35)),
      align: 'center',
      direction: dir,
    });
    const totalWords = Math.max(1, layout.words.length);
    const seen = new Set<number>();
    const baseCapStart = vt.clipStart * 0.65;
    for (const w of layout.words) {
      if (w.isKeyword && w.groupId !== null && !seen.has(w.groupId)) {
        seen.add(w.groupId);
        const frac = totalWords > 1 ? w.globalWordIndex / totalWords : 0;
        keywordTimes.push(Number((baseCapStart + frac * 0.4).toFixed(3)));
      }
    }
  }

  return {
    enterStart: 0.04,
    clipStart: vt.clipStart,
    clipEnd: vt.clipEnd,
    keywordTimes,
    annotationTimes: keywordTimes,
  };
}

/**
 * Cached CRT phosphor fringe / subtle RGB channel offset stripe overlay buffer.
 */
export function getCachedCrtScanlineOverlay(
  w: number,
  h: number
): HTMLCanvasElement {
  const cw = clamp(Math.round(w * 0.5), 48, 640);
  const ch = clamp(Math.round(h * 0.5), 48, 480);
  const key = `vid-crt-scanlines|${cw}x${ch}`;
  return getOrGenerateCachedCanvas(key, cw, ch, (ctx) => {
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    for (let y = 0; y < ch; y += 3) {
      ctx.fillRect(0, y, cw, 1);
    }
    ctx.fillStyle = 'rgba(255, 64, 64, 0.045)';
    ctx.fillRect(0, 0, 2, ch);
    ctx.fillStyle = 'rgba(64, 180, 255, 0.045)';
    ctx.fillRect(cw - 2, 0, 2, ch);
  });
}

/**
 * Applies a cached Teal & Orange tone pass to a downscaled video frame key for vid_cinematic.
 */
export function applyCinematicTealOrangeToScratch(
  drawable: HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number
): HTMLCanvasElement {
  const sw = clamp(Math.round(w * 0.65), 64, 840);
  const sh = clamp(Math.round(h * 0.65), 48, 480);
  const buf = createBufferCanvas(sw, sh);
  const bctx = buf.getContext('2d');
  if (!bctx) return buf;
  bctx.drawImage(drawable, 0, 0, sw, sh);
  try {
    const imgData = bctx.getImageData(0, 0, sw, sh);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const dr = lerp(r, lum * 255, 0.25);
      const dg = lerp(g, lum * 255, 0.25);
      const db = lerp(b, lum * 255, 0.25);
      const shW = Math.pow(1 - lum, 1.4);
      const hiW = Math.pow(lum, 1.35);
      data[i] = clamp(dr - shW * 20 + hiW * 28, 0, 255);
      data[i + 1] = clamp(dg + shW * 7 + hiW * 9, 0, 255);
      data[i + 2] = clamp(db + shW * 26 - hiW * 22, 0, 255);
    }
    bctx.putImageData(imgData, 0, 0);
  } catch {
    // Ignore taint errors
  }
  return buf;
}

export function seededNoiseOffset(seed: number, bucket: number): number {
  const rng = mulberry32(combineSeed(seed, bucket));
  return rng();
}
