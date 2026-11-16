import {
  ArabicFontFamily,
  BackgroundMode,
  EnglishFontFamily,
  FloatingThemeVariant,
  ImageFitMode,
  PointsMarkerType,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  StyleId,
  StyleLightPalette,
  StyleMetadata,
  TimelineConfig,
} from '../types';
import {
  drawFittedImage,
  getCachedGradedPortrait,
} from '../utils/assetCache';
import {
  clamp,
  computeChatSchedule,
  DEFAULT_CHAT_MESSAGES,
  DEFAULT_CHAT_TIMING,
  detectTextDirection,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  getChatPositionBox,
  getEffectiveTimeline,
  getImagePositionBox,
  getPhrasePositionBox,
  getTypingConfigForCustomization,
  hexToRgba,
  lerp,
  mixHexColor,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  drawBidiWord,
  layoutArabicQuote,
} from '../utils/textLayout';
import { evaluateDeterministicChatScroll } from './chat1Modern';
import {
  computeImageBottomCaptionLayout,
  computeImageCaptionKeywordTimes,
  computeImagePushInScale,
  drawImageBottomCaptionOverlay,
  fitImageSlotInBox,
  resolveImageContentParams,
} from './image1Polaroid';
import {
  buildAutoFitPointsLayout,
  drawPointTextWithWipeAndKeywords,
  getPointHighlightAlpha,
} from './points1Clean';

const NON_MONO_ARABIC_FONTS: ArabicFontFamily[] = [
  'Readex Pro',
  'Cairo',
  'Tajawal',
  'IBM Plex Sans Arabic',
  'Almarai',
  'Almarai Bold',
  'Almarai ExtraBold',
  'Reem Kufi',
  'El Messiri',
  'Changa',
  'Lalezar',
  'Amiri',
  'Noto Naskh Arabic',
  'Noto Kufi Arabic',
  'Aref Ruqaa',
  'Aref Ruqaa Ink',
  'Rakkas',
  'Katibeh',
  'KOMission Black',
  'Zain Rounded instance mob',
  '29LT Azahar Display AL TN Trial Bold',
];

const MODERN_ENGLISH_FONTS: EnglishFontFamily[] = [
  'Outfit',
  'Plus Jakarta Sans',
  'Manrope',
  'Playfair Display',
  'Cinzel',
  'Oswald',
];

export interface FloatingPaletteSpec {
  variant: FloatingThemeVariant;
  nameSuffixAr: string;
  nameSuffixEn: string;
  defaultAccent: string;
  defaultKeyword: string;
  secondaryAccent: string;
  bgCore: string;
  bgEdge: string;
  cardFillStyle: string;
  cardFillGreen: string;
  cardBorder: string;
  hardShadow: string;
  textPrimary: string;
  textSecondary: string;
}

export const FLOATING_PALETTES: Record<FloatingThemeVariant, FloatingPaletteSpec> = {
  gems: {
    variant: 'gems',
    nameSuffixAr: 'جواهر وكبسولات 3D',
    nameSuffixEn: '3D Gems & Capsules',
    defaultAccent: '#38BDF8',
    defaultKeyword: '#FDE047',
    secondaryAccent: '#A855F7',
    bgCore: '#0F172A',
    bgEdge: '#030712',
    cardFillStyle: 'rgba(15, 23, 42, 0.84)',
    cardFillGreen: '#0F172A',
    cardBorder: '#38BDF8',
    hardShadow: '#020617',
    textPrimary: '#F8FAFC',
    textSecondary: '#BAE6FD',
  },
  glass: {
    variant: 'glass',
    nameSuffixAr: 'كرات ومكعبات زجاجية',
    nameSuffixEn: 'Glass Spheres & Cubes',
    defaultAccent: '#38BDF8',
    defaultKeyword: '#7DD3FC',
    secondaryAccent: '#60A5FA',
    bgCore: '#0A1E46',
    bgEdge: '#020614',
    cardFillStyle: 'rgba(8, 22, 52, 0.62)',
    cardFillGreen: '#07142E',
    cardBorder: '#38BDF8',
    hardShadow: '#020714',
    textPrimary: '#F8FAFC',
    textSecondary: '#93C5FD',
  },
  gold: {
    variant: 'gold',
    nameSuffixAr: 'شذرات ذهبية ونجوم',
    nameSuffixEn: 'Golden Shards & Stars',
    defaultAccent: '#F59E0B',
    defaultKeyword: '#FDE047',
    secondaryAccent: '#FB7185',
    bgCore: '#18120B',
    bgEdge: '#070503',
    cardFillStyle: 'rgba(24, 18, 11, 0.86)',
    cardFillGreen: '#17120A',
    cardBorder: '#F59E0B',
    hardShadow: '#090603',
    textPrimary: '#FFFBEB',
    textSecondary: '#FDE68A',
  },
};

export function isFloatingStyleId(styleId: StyleId): boolean {
  return (
    styleId.startsWith('quote_float_') ||
    styleId.startsWith('phrase_float_') ||
    styleId.startsWith('chat_float_') ||
    styleId.startsWith('pts_float_') ||
    styleId.startsWith('img_float_')
  );
}

export function getFloatingThemeVariant(styleId: StyleId): FloatingThemeVariant | null {
  if (styleId.endsWith('_gems')) return 'gems';
  if (styleId.endsWith('_glass')) return 'glass';
  if (styleId.endsWith('_gold')) return 'gold';
  return null;
}

interface FloatingObjectInstance {
  x: number;
  y: number;
  baseRadius: number;
  layer: 'back' | 'front';
  shapeIndex: number; // 0 = 3D Glass Sphere, 1 = 3D Translucent Glass Cube
  phase: number;
  speed: number;
  rotSpeed: number;
  baseAngle: number;
  useKeywordTone: boolean;
}

function generateFloatingObjectsAroundBox(
  W: number,
  H: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  seed: number
): FloatingObjectInstance[] {
  const rng = mulberry32(combineSeed(seed || 1042, Math.round(boxW * 13 + boxH * 7)));
  const objects: FloatingObjectInstance[] = [];

  const marginX = Math.max(38, Math.min(W * 0.055, 84));
  const marginY = Math.max(38, Math.min(H * 0.055, 84));

  const leftBandX = Math.max(marginX, boxX - Math.min(96, W * 0.06));
  const rightBandX = Math.min(W - marginX, boxX + boxW + Math.min(96, W * 0.06));
  const topBandY = Math.max(marginY, boxY - Math.min(82, H * 0.055));
  const bottomBandY = Math.min(H - marginY, boxY + boxH + Math.min(82, H * 0.055));

  // Curated positions inspired by the reference composition:
  // Upper-left sphere, mid-left cube, lower-left cube, bottom-left sphere,
  // top-right prominent cube on orbit, upper-right sphere, mid-right cube, bottom-right large sphere
  const anchors: {
    x: number;
    y: number;
    layer: 'back' | 'front';
    scaleMul: number;
    shape: number;
  }[] = [
    // 1) Top-right prominent 3D Glass Cube riding the upper orbital arc
    { x: boxX + boxW * 0.74, y: topBandY - 12, layer: 'front', scaleMul: 1.24, shape: 1 },
    // 2) Bottom-right large foreground 3D Glass Sphere
    { x: rightBandX - 8, y: bottomBandY - 6, layer: 'front', scaleMul: 1.34, shape: 0 },
    // 3) Upper-left 3D Glass Sphere near planet limb
    { x: leftBandX + 16, y: topBandY + 8, layer: 'back', scaleMul: 0.96, shape: 0 },
    // 4) Mid-left 3D Glass Cube outside portrait/left edge
    { x: Math.max(marginX, leftBandX - 42), y: boxY + boxH * 0.28, layer: 'front', scaleMul: 0.86, shape: 1 },
    // 5) Lower-left 3D Glass Cube
    { x: leftBandX + 8, y: bottomBandY + 12, layer: 'front', scaleMul: 0.92, shape: 1 },
    // 6) Bottom-left-center 3D Glass Sphere
    { x: boxX + boxW * 0.22, y: bottomBandY + 8, layer: 'back', scaleMul: 0.88, shape: 0 },
    // 7) Upper-right 3D Glass Sphere
    { x: rightBandX + 10, y: topBandY + 24, layer: 'back', scaleMul: 0.94, shape: 0 },
    // 8) Mid-right 3D Glass Cube near right border
    { x: rightBandX + 24, y: boxY + boxH * 0.62, layer: 'front', scaleMul: 0.98, shape: 1 },
    // 9) Upper-center-left subtle background Glass Sphere
    { x: boxX + boxW * 0.32, y: Math.max(marginY, topBandY - 26), layer: 'back', scaleMul: 0.72, shape: 0 },
    // 10) Far-right subtle background Glass Sphere
    { x: clamp(rightBandX + 68, 44, W - 44), y: clamp(boxY + boxH * 0.36, 44, H - 44), layer: 'back', scaleMul: 0.74, shape: 0 },
  ];

  const minDim = Math.min(W, H);
  const unitR = clamp(minDim * 0.031, 22, 38);

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const jitterX = (rng() - 0.5) * 18;
    const jitterY = (rng() - 0.5) * 16;
    objects.push({
      x: clamp(a.x + jitterX, 36, W - 36),
      y: clamp(a.y + jitterY, 36, H - 36),
      baseRadius: unitR * a.scaleMul * (0.92 + rng() * 0.16),
      layer: a.layer,
      shapeIndex: a.shape,
      phase: rng() * Math.PI * 2,
      speed: 1.35 + rng() * 0.75,
      rotSpeed: (rng() > 0.5 ? 1 : -1) * (0.32 + rng() * 0.34),
      baseAngle: (rng() - 0.5) * 1.1,
      useKeywordTone: i % 3 === 1,
    });
  }

  return objects;
}

/**
 * Draws a luminous 4-point celestial diamond star flare (`✦`) with elongated spikes.
 * In Green Screen mode (`isGreen`), uses 100% opaque crisp geometry and `shadowBlur = 0`.
 */
function drawFourPointStarFlare(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  isGreen: boolean,
  alpha: number = 1
) {
  if (alpha <= 0.02 || radius <= 1) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = isGreen ? (alpha > 0.2 ? 1 : 0) : alpha;
  ctx.shadowBlur = 0;

  if (!isGreen) {
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.35);
    glow.addColorStop(0, '#FFFFFF');
    glow.addColorStop(0.28, hexToRgba(color, 0.78));
    glow.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4-point diamond star spikes
  const longR = radius;
  const waist = radius * 0.16;
  ctx.fillStyle = isGreen ? color : '#E0F2FE';
  ctx.beginPath();
  ctx.moveTo(0, -longR);
  ctx.quadraticCurveTo(waist * 0.4, -waist * 0.4, longR * 1.25, 0);
  ctx.quadraticCurveTo(waist * 0.4, waist * 0.4, 0, longR);
  ctx.quadraticCurveTo(-waist * 0.4, waist * 0.4, -longR * 1.25, 0);
  ctx.quadraticCurveTo(-waist * 0.4, -waist * 0.4, 0, -longR);
  ctx.closePath();
  ctx.fill();

  // Pure white hot center core
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.5, radius * 0.22), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws a horizontal tapered glowing divider line with a central 4-point diamond star flare (`✦`),
 * matching the signature divider above the author name in the reference image.
 */
function drawGlowingDiamondDivider(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  centerX: number,
  y: number,
  halfWidth: number,
  starX: number,
  accentColor: string,
  isGreen: boolean,
  pulse: number = 1
) {
  if (halfWidth <= 8) return;
  ctx.save();
  ctx.shadowBlur = 0;

  if (isGreen) {
    ctx.strokeStyle = mixHexColor(accentColor, '#FFFFFF', 0.35);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(centerX - halfWidth, y);
    ctx.lineTo(centerX + halfWidth, y);
    ctx.stroke();
  } else {
    const lineGrad = ctx.createLinearGradient(centerX - halfWidth, y, centerX + halfWidth, y);
    lineGrad.addColorStop(0, hexToRgba(accentColor, 0));
    lineGrad.addColorStop(0.2, hexToRgba(accentColor, 0.55));
    lineGrad.addColorStop(0.5, '#FFFFFF');
    lineGrad.addColorStop(0.8, hexToRgba(accentColor, 0.55));
    lineGrad.addColorStop(1, hexToRgba(accentColor, 0));

    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - halfWidth, y);
    ctx.lineTo(centerX + halfWidth, y);
    ctx.stroke();
  }

  drawFourPointStarFlare(
    ctx,
    starX,
    y,
    11 * (0.9 + 0.15 * pulse),
    accentColor,
    isGreen,
    1
  );

  ctx.restore();
}

const COSMIC_BACKDROP_IMAGE_PATH = '/assets/images/cosmic_glass_backdrop.jpg';
let cachedCosmicBackdropImage: HTMLImageElement | null = null;
let cosmicBackdropLoadStarted = false;

function getCosmicBackdropImage(): HTMLImageElement | null {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return null;
  }
  if (!cosmicBackdropLoadStarted) {
    cosmicBackdropLoadStarted = true;
    const img = new Image();
    img.decoding = 'async';
    img.src = COSMIC_BACKDROP_IMAGE_PATH;
    cachedCosmicBackdropImage = img;
  }
  if (
    cachedCosmicBackdropImage &&
    cachedCosmicBackdropImage.complete &&
    cachedCosmicBackdropImage.naturalWidth > 0
  ) {
    return cachedCosmicBackdropImage;
  }
  return null;
}

/**
 * Draws sweeping 3D elliptical orbital light arcs (`back` or `front` half-pass)
 * with animated photon flares orbiting around the main glass panel and optional focal badge.
 */
function drawOrbitalLightArcs(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  pass: 'back' | 'front',
  t: number,
  enterProg: number,
  masterAlpha: number,
  accentColor: string,
  keywordColor: string,
  bgMode: BackgroundMode,
  showFloatingObjects: boolean | undefined,
  focalBox?: { x: number; y: number; w: number; h: number }
) {
  if (showFloatingObjects === false) return;
  const pop = clamp(enterProg, 0, 1);
  if (pop <= 0.02 || masterAlpha <= 0.02) return;

  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';
  const brightCyan = mixHexColor(accentColor, '#FFFFFF', 0.45);
  const softCyan = mixHexColor(accentColor, keywordColor, 0.35);

  const cx = boxX + boxW * 0.5;
  const cy = boxY + boxH * 0.5;

  interface OrbitDef {
    ox: number;
    oy: number;
    rx: number;
    ry: number;
    tilt: number;
    speed: number;
    phaseOffset: number;
    lineWidth: number;
  }

  const orbits: OrbitDef[] = [
    // 1) Grand diagonal orbit sweeping from bottom-left to top-right
    {
      ox: cx + boxW * 0.04,
      oy: cy - boxH * 0.02,
      rx: boxW * 0.63 * pop,
      ry: boxH * 0.52 * pop,
      tilt: -0.26,
      speed: 0.65,
      phaseOffset: 0.4,
      lineWidth: 2.0,
    },
    // 2) Secondary sweeping orbit near right & bottom-right corners
    {
      ox: cx + boxW * 0.12,
      oy: cy + boxH * 0.14,
      rx: boxW * 0.56 * pop,
      ry: boxH * 0.38 * pop,
      tilt: -0.14,
      speed: -0.52,
      phaseOffset: 2.1,
      lineWidth: 1.6,
    },
  ];

  if (focalBox) {
    orbits.push({
      ox: focalBox.x + focalBox.w * 0.48,
      oy: focalBox.y + focalBox.h * 0.54,
      rx: focalBox.w * 0.82 * pop,
      ry: focalBox.h * 0.38 * pop,
      tilt: -0.34,
      speed: 0.88,
      phaseOffset: 1.2,
      lineWidth: 2.2,
    });
  }

  const startAngle = pass === 'back' ? Math.PI : 0;
  const endAngle = pass === 'back' ? Math.PI * 2 : Math.PI;

  ctx.save();
  ctx.shadowBlur = 0;

  for (let i = 0; i < orbits.length; i++) {
    const orb = orbits[i];
    ctx.save();
    ctx.translate(orb.ox, orb.oy);
    ctx.rotate(orb.tilt);

    // Smooth, tapered orbital light arc (fades to 0 at ends, no harsh solid edges)
    ctx.globalAlpha = masterAlpha * (isGreen ? 0.72 : pass === 'front' ? 0.56 : 0.34);
    const grad = ctx.createLinearGradient(-orb.rx, 0, orb.rx, 0);
    grad.addColorStop(0, hexToRgba(softCyan, 0));
    grad.addColorStop(0.22, hexToRgba(brightCyan, 0.55));
    grad.addColorStop(0.5, hexToRgba('#FFFFFF', 0.85));
    grad.addColorStop(0.78, hexToRgba(brightCyan, 0.55));
    grad.addColorStop(1, hexToRgba(softCyan, 0));

    ctx.strokeStyle = grad;
    ctx.lineWidth = orb.lineWidth * 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(0, 0, orb.rx, orb.ry, 0, startAngle, endAngle);
    ctx.stroke();

    // Soft outer atmospheric bloom along the orbit (zero shadowBlur)
    if (pass === 'front' && !isBlack) {
      ctx.globalAlpha = masterAlpha * (isGreen ? 0.18 : 0.16);
      ctx.strokeStyle = grad;
      ctx.lineWidth = orb.lineWidth * 3.0;
      ctx.beginPath();
      ctx.ellipse(0, 0, orb.rx, orb.ry, 0, startAngle + 0.15, endAngle - 0.15);
      ctx.stroke();
    }

    // Animated traveling photon comet & 4-point star flare along the orbit
    const rawAngle = ((t * orb.speed + orb.phaseOffset) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const inPass =
      pass === 'back'
        ? rawAngle >= Math.PI && rawAngle <= Math.PI * 2
        : rawAngle >= 0 && rawAngle < Math.PI;

    if (inPass) {
      const tailSpan = 0.42;
      const tailStart = orb.speed >= 0 ? Math.max(startAngle, rawAngle - tailSpan) : rawAngle;
      const tailEnd = orb.speed >= 0 ? rawAngle : Math.min(endAngle, rawAngle + tailSpan);

      ctx.globalAlpha = masterAlpha * (isGreen ? 0.82 : 0.88);
      ctx.strokeStyle = hexToRgba('#FFFFFF', 0.85);
      ctx.lineWidth = orb.lineWidth * 1.45;
      ctx.beginPath();
      ctx.ellipse(0, 0, orb.rx, orb.ry, 0, tailStart, tailEnd);
      ctx.stroke();

      const px = Math.cos(rawAngle) * orb.rx;
      const py = Math.sin(rawAngle) * orb.ry;
      drawFourPointStarFlare(
        ctx,
        px,
        py,
        pass === 'front' ? 9.5 : 6.8,
        accentColor,
        isGreen,
        masterAlpha * 0.9
      );
    }

    ctx.restore();
  }

  ctx.restore();
}

/**
 * Draws a single borderless, fluid 3D Refractive Glass Sphere (`shapeIndex === 0`) or
 * 3D Translucent Tumbling Glass Cube (`shapeIndex === 1`).
 * Uses pure multi-stop translucent gradients and internal specular reflections without any
 * prominent or harsh outer stroke borders (`shadowBlur = 0` always preserved).
 */
function drawSingleFloating3DObject(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  _variant: FloatingThemeVariant,
  shapeIndex: number,
  x: number,
  y: number,
  radius: number,
  angle: number,
  primaryColor: string,
  secondaryColor: string,
  bgMode: BackgroundMode,
  alpha: number
) {
  if (alpha <= 0.01 || radius <= 2) return;
  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = isGreen ? clamp(alpha, 0, 0.92) : alpha;
  ctx.shadowBlur = 0;

  const iceCyan = mixHexColor(primaryColor, '#FFFFFF', 0.62);
  const brightCyan = mixHexColor(primaryColor, '#38BDF8', 0.52);
  const deepSapphire = mixHexColor(primaryColor, '#040B1E', 0.78);
  const midSapphire = mixHexColor(secondaryColor, '#0B1E46', 0.55);

  if (shapeIndex % 2 === 0) {
    // ========================================================================
    // 1) BORDERLESS 3D REFRACTIVE GLASS SPHERE (Fluid Crystal Orb)
    // ========================================================================
    const r = radius * 1.05;

    if (!isBlack && !isGreen) {
      // Soft outer atmospheric aura using radial gradient (no shadowBlur, no hard border)
      const aura = ctx.createRadialGradient(0, 0, r * 0.65, 0, 0, r * 1.42);
      aura.addColorStop(0, hexToRgba(brightCyan, 0.24));
      aura.addColorStop(1, hexToRgba(brightCyan, 0));
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.42, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main glass sphere body (borderless radial Fresnel shading that softly blends at the edge)
    const bodyGrad = ctx.createRadialGradient(
      -r * 0.26,
      -r * 0.28,
      r * 0.05,
      0,
      0,
      r
    );
    bodyGrad.addColorStop(0, hexToRgba(iceCyan, isGreen ? 0.55 : 0.46));
    bodyGrad.addColorStop(0.38, isGreen ? 'rgba(8, 22, 52, 0.64)' : 'rgba(6, 18, 44, 0.56)');
    bodyGrad.addColorStop(0.76, hexToRgba(midSapphire, isGreen ? 0.72 : 0.66));
    bodyGrad.addColorStop(0.94, hexToRgba(iceCyan, isGreen ? 0.78 : 0.72));
    bodyGrad.addColorStop(1, hexToRgba(iceCyan, 0.08));

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Soft internal bottom-right caustic crescent (filled crescent gradient, no harsh stroke)
    const causticGrad = ctx.createRadialGradient(r * 0.24, r * 0.26, r * 0.1, 0, 0, r * 0.92);
    causticGrad.addColorStop(0, hexToRgba(iceCyan, 0));
    causticGrad.addColorStop(0.68, hexToRgba(brightCyan, 0.34));
    causticGrad.addColorStop(1, hexToRgba(iceCyan, 0));
    ctx.fillStyle = causticGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    ctx.fill();

    // Soft top-left specular window reflection oval
    const specGrad = ctx.createRadialGradient(
      -r * 0.34,
      -r * 0.36,
      0,
      -r * 0.34,
      -r * 0.36,
      r * 0.32
    );
    specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    specGrad.addColorStop(0.55, hexToRgba(iceCyan, 0.38));
    specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.ellipse(-r * 0.34, -r * 0.36, r * 0.26, r * 0.14, -0.68, 0, Math.PI * 2);
    ctx.fill();

    // Secondary tiny specular droplet
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.arc(-r * 0.14, -r * 0.52, Math.max(1.3, r * 0.05), 0, Math.PI * 2);
    ctx.fill();

    // Subtle starlight glint on the sunlit rim
    drawFourPointStarFlare(
      ctx,
      -r * 0.62,
      -r * 0.62,
      Math.max(3.8, r * 0.22),
      primaryColor,
      isGreen,
      0.72
    );
  } else {
    // ========================================================================
    // 2) BORDERLESS 3D TRANSLUCENT TUMBLING GLASS CUBE (Fluid Refractive Cube)
    // ========================================================================
    const r = radius * 0.94;
    const rotX = 0.58 + Math.sin(angle) * 0.38;
    const rotY = 0.68 + angle * 0.85;
    const rotZ = angle * 0.42;

    const cx = Math.cos(rotX);
    const sx = Math.sin(rotX);
    const cy = Math.cos(rotY);
    const sy = Math.sin(rotY);
    const cz = Math.cos(rotZ);
    const sz = Math.sin(rotZ);

    const rawVerts = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ];

    const proj = rawVerts.map(([vx, vy, vz]) => {
      const y1 = vy * cx - vz * sx;
      const z1 = vy * sx + vz * cx;
      const x1 = vx;
      const x2 = x1 * cy + z1 * sy;
      const z2 = -x1 * sy + z1 * cy;
      const y2 = y1;
      const x3 = x2 * cz - y2 * sz;
      const y3 = x2 * sz + y2 * cz;
      const persp = 1 / (1 - z2 * 0.12);
      return {
        x: x3 * r * 0.68 * persp,
        y: y3 * r * 0.68 * persp,
        z: z2,
      };
    });

    const faces = [
      { idx: [0, 1, 2, 3], shade: 0.15 },
      { idx: [4, 5, 6, 7], shade: 0.45 },
      { idx: [0, 4, 7, 3], shade: 0.28 },
      { idx: [1, 5, 6, 2], shade: 0.38 },
      { idx: [3, 2, 6, 7], shade: 0.58 },
      { idx: [0, 1, 5, 4], shade: 0.20 },
    ].map((f) => {
      const avgZ =
        (proj[f.idx[0]].z + proj[f.idx[1]].z + proj[f.idx[2]].z + proj[f.idx[3]].z) * 0.25;
      return { ...f, avgZ };
    });

    faces.sort((a, b) => a.avgZ - b.avgZ);

    if (!isGreen && !isBlack) {
      const cubeAura = ctx.createRadialGradient(0, 0, r * 0.25, 0, 0, r * 1.38);
      cubeAura.addColorStop(0, hexToRgba(brightCyan, 0.22));
      cubeAura.addColorStop(1, hexToRgba(brightCyan, 0));
      ctx.fillStyle = cubeAura;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.38, 0, Math.PI * 2);
      ctx.fill();
    }

    // Back 3 faces (pure translucent glass fill, no harsh wireframe border)
    for (let i = 0; i < 3; i++) {
      const f = faces[i];
      ctx.fillStyle = isBlack
        ? hexToRgba(deepSapphire, 0.26)
        : hexToRgba(deepSapphire, isGreen ? 0.46 : 0.38);
      ctx.beginPath();
      ctx.moveTo(proj[f.idx[0]].x, proj[f.idx[0]].y);
      ctx.lineTo(proj[f.idx[1]].x, proj[f.idx[1]].y);
      ctx.lineTo(proj[f.idx[2]].x, proj[f.idx[2]].y);
      ctx.lineTo(proj[f.idx[3]].x, proj[f.idx[3]].y);
      ctx.closePath();
      ctx.fill();
    }

    // Front 3 faces with smooth refractive glass gradients & ultra-soft edge sheen (no hard borders)
    for (let i = 3; i < 6; i++) {
      const f = faces[i];
      const p0 = proj[f.idx[0]];
      const p2 = proj[f.idx[2]];
      const faceGrad = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);

      faceGrad.addColorStop(
        0,
        hexToRgba(iceCyan, (isGreen ? 0.28 : 0.22) + f.shade * 0.42)
      );
      faceGrad.addColorStop(
        0.55,
        hexToRgba(brightCyan, (isGreen ? 0.22 : 0.16) + f.shade * 0.26)
      );
      faceGrad.addColorStop(
        1,
        hexToRgba(midSapphire, (isGreen ? 0.36 : 0.28) + f.shade * 0.24)
      );

      ctx.fillStyle = faceGrad;
      ctx.beginPath();
      ctx.moveTo(proj[f.idx[0]].x, proj[f.idx[0]].y);
      ctx.lineTo(proj[f.idx[1]].x, proj[f.idx[1]].y);
      ctx.lineTo(proj[f.idx[2]].x, proj[f.idx[2]].y);
      ctx.lineTo(proj[f.idx[3]].x, proj[f.idx[3]].y);
      ctx.closePath();
      ctx.fill();

      // Delicate internal light sheen along face seam (very low alpha, no hard border)
      ctx.strokeStyle = hexToRgba('#E0F2FE', i === 5 ? 0.26 : 0.16);
      ctx.lineWidth = 0.85;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // Soft specular starlight glint on the closest front vertex
    let closestV = proj[0];
    for (const v of proj) {
      if (v.z > closestV.z) closestV = v;
    }
    drawFourPointStarFlare(
      ctx,
      closestV.x,
      closestV.y,
      Math.max(4.0, r * 0.22),
      primaryColor,
      isGreen,
      0.76
    );
  }

  ctx.restore();
}

/**
 * Draws the high-quality cinematic cosmic space backdrop in `'style'` mode
 * (using the high-resolution cosmic planet, mountain & reflective lake image with
 * subtle Ken Burns motion and live starlight/water shimmer, plus a procedural fallback
 * for headless/Node environments), or pure `#00FF00` / `#000000` in green/black modes.
 */
function drawFloatingSceneBackdrop(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  variant: FloatingThemeVariant,
  accentColor: string,
  keywordColor: string,
  bgMode: BackgroundMode,
  masterAlpha: number
) {
  ctx.save();
  ctx.shadowBlur = 0;

  if (bgMode === 'green') {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return;
  }
  if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return;
  }

  const pal = FLOATING_PALETTES[variant];
  const cosmicImg = getCosmicBackdropImage();

  if (cosmicImg) {
    // High-resolution cinematic cosmic backdrop image with subtle Ken Burns drift
    ctx.fillStyle = '#030817';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = masterAlpha;
    const imgW = cosmicImg.naturalWidth;
    const imgH = cosmicImg.naturalHeight;
    const baseScale = Math.max(W / imgW, H / imgH);
    const kenBurnsScale = 1.03 + 0.015 * Math.sin(t * 0.38);
    const drawW = imgW * baseScale * kenBurnsScale;
    const drawH = imgH * baseScale * kenBurnsScale;
    const driftX = Math.sin(t * 0.28) * (W * 0.008);
    const driftY = Math.cos(t * 0.24) * (H * 0.005);
    // Anchor slightly toward upper-left (0.38 horizontally) so the planet & citadel stay in frame in both 16:9 and 9:16
    const anchorX = W >= H ? 0.5 : 0.34;
    const dx = (W - drawW) * anchorX + driftX;
    const dy = (H - drawH) * 0.5 + driftY;
    ctx.drawImage(cosmicImg, dx, dy, drawW, drawH);
    ctx.restore();

    // Subtle live twinkling stars & water shimmer overlay so the cinematic photo feels alive
    const starRng = mulberry32(4099);
    for (let i = 0; i < 24; i++) {
      const sx = starRng() * W;
      const sy = starRng() * (H * 0.62);
      const sRad = 0.7 + starRng() * 1.2;
      const twinkle = 0.25 + 0.75 * Math.sin(t * (1.5 + starRng() * 2.0) + i * 1.9);
      ctx.fillStyle = i % 3 === 0 ? '#BAE6FD' : '#FFFFFF';
      ctx.globalAlpha = masterAlpha * twinkle * 0.65;
      ctx.beginPath();
      ctx.arc(sx, sy, sRad, 0, Math.PI * 2);
      ctx.fill();
    }

    drawFourPointStarFlare(
      ctx,
      W * 0.565,
      H * 0.115,
      9 + Math.sin(t * 2.4) * 1.8,
      accentColor,
      false,
      masterAlpha * 0.85
    );

    ctx.restore();
    return;
  }

  // Fallback high-detail procedural cosmic backdrop (used during initial load or in Node tests)
  const skyGrad = ctx.createLinearGradient(0, 0, W * 0.85, H);
  skyGrad.addColorStop(0, '#07193E');
  skyGrad.addColorStop(0.45, pal.bgCore);
  skyGrad.addColorStop(0.82, '#040C20');
  skyGrad.addColorStop(1, pal.bgEdge);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = masterAlpha;

  const starRng = mulberry32(4099);
  for (let i = 0; i < 46; i++) {
    const sx = starRng() * W;
    const sy = starRng() * (H * 0.74);
    const sRad = 0.7 + starRng() * 1.4;
    const twinkle = 0.35 + 0.65 * Math.sin(t * (1.4 + starRng() * 2.2) + i * 1.7);
    ctx.fillStyle = i % 4 === 0 ? '#BAE6FD' : '#FFFFFF';
    ctx.globalAlpha = masterAlpha * twinkle * 0.82;
    ctx.beginPath();
    ctx.arc(sx, sy, sRad, 0, Math.PI * 2);
    ctx.fill();
  }

  drawFourPointStarFlare(
    ctx,
    W * 0.58,
    H * 0.075,
    10 + Math.sin(t * 2.5) * 2,
    accentColor,
    false,
    masterAlpha * 0.92
  );
  drawFourPointStarFlare(
    ctx,
    W * 0.88,
    H * 0.14,
    7 + Math.cos(t * 2.1) * 1.5,
    keywordColor,
    false,
    masterAlpha * 0.75
  );

  const planetX = W * 0.18;
  const planetY = H * 0.32;
  const planetR = Math.min(W, H) * 0.42;

  const corona = ctx.createRadialGradient(
    planetX + planetR * 0.22,
    planetY - planetR * 0.08,
    planetR * 0.65,
    planetX,
    planetY,
    planetR * 1.38
  );
  corona.addColorStop(0, hexToRgba('#FFFFFF', 0.38));
  corona.addColorStop(0.28, hexToRgba(accentColor, 0.34));
  corona.addColorStop(0.62, hexToRgba('#1D4ED8', 0.14));
  corona.addColorStop(1, 'rgba(2, 6, 20, 0)');
  ctx.globalAlpha = masterAlpha;
  ctx.fillStyle = corona;
  ctx.beginPath();
  ctx.arc(planetX, planetY, planetR * 1.38, 0, Math.PI * 2);
  ctx.fill();

  const planetBody = ctx.createRadialGradient(
    planetX + planetR * 0.65,
    planetY - planetR * 0.25,
    planetR * 0.08,
    planetX,
    planetY,
    planetR
  );
  planetBody.addColorStop(0, '#38BDF8');
  planetBody.addColorStop(0.18, '#1E40AF');
  planetBody.addColorStop(0.55, '#091938');
  planetBody.addColorStop(1, '#030817');

  ctx.fillStyle = planetBody;
  ctx.beginPath();
  ctx.arc(planetX, planetY, planetR, 0, Math.PI * 2);
  ctx.fill();

  const waterTopY = H * 0.78;
  ctx.fillStyle = '#050E24';
  ctx.beginPath();
  ctx.moveTo(0, waterTopY);
  ctx.lineTo(0, H * 0.56);
  ctx.lineTo(W * 0.16, H * 0.52);
  ctx.lineTo(W * 0.34, H * 0.68);
  ctx.lineTo(W * 0.52, H * 0.62);
  ctx.lineTo(W * 0.72, H * 0.54);
  ctx.lineTo(W, H * 0.64);
  ctx.lineTo(W, waterTopY);
  ctx.closePath();
  ctx.fill();

  const lakeGrad = ctx.createLinearGradient(0, waterTopY, 0, H);
  lakeGrad.addColorStop(0, '#071B3E');
  lakeGrad.addColorStop(0.5, '#0A2558');
  lakeGrad.addColorStop(1, '#020714');
  ctx.fillStyle = lakeGrad;
  ctx.fillRect(0, waterTopY, W, H - waterTopY);

  ctx.restore();
}

function renderFloatingObjectsLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  objects: FloatingObjectInstance[],
  targetLayer: 'back' | 'front',
  t: number,
  enterProg: number,
  masterAlpha: number,
  variant: FloatingThemeVariant,
  accentColor: string,
  keywordColor: string,
  bgMode: BackgroundMode,
  showFloatingObjects: boolean | undefined
) {
  if (showFloatingObjects === false) return;
  const popScale = easeOutBack(clamp(enterProg, 0, 1), 1.35);
  if (popScale <= 0.02) return;

  for (const obj of objects) {
    if (obj.layer !== targetLayer) continue;
    const parallaxAmp = targetLayer === 'front' ? 13 : 7.5;
    const bobY = Math.sin(t * obj.speed + obj.phase) * parallaxAmp;
    const bobX = Math.cos(t * (obj.speed * 0.72) + obj.phase) * (parallaxAmp * 0.55);
    const angle = obj.baseAngle + t * obj.rotSpeed;
    const r = obj.baseRadius * popScale;
    const prim = obj.useKeywordTone ? keywordColor : accentColor;
    const sec = obj.useKeywordTone ? accentColor : keywordColor;
    const layerAlpha =
      bgMode === 'green'
        ? clamp(masterAlpha, 0, 0.9)
        : masterAlpha * (targetLayer === 'front' ? 0.94 : 0.8);

    drawSingleFloating3DObject(
      ctx,
      variant,
      obj.shapeIndex,
      obj.x + bobX,
      obj.y + bobY,
      r,
      angle,
      prim,
      sec,
      bgMode,
      layerAlpha
    );
  }
}

/**
 * Draws a borderless, fluid, semi-transparent backdrop cushion (`Soft Translucent Backdrop`)
 * behind text/content so the typography stands out clearly while keeping a weightless,
 * seamless floating appearance with zero hard or prominent borders.
 */
function drawLevitating3DCardSurface(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  _variant: FloatingThemeVariant,
  accentColor: string,
  keywordColor: string,
  bgMode: BackgroundMode,
  _t: number = 0
) {
  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';

  ctx.save();
  ctx.shadowBlur = 0;

  const cx = x + w * 0.5;
  const cy = y + h * 0.5;
  const maxR = Math.max(w, h) * 0.68;

  if (isGreen) {
    // Borderless comfortable semi-transparent dark-sapphire cushion for Green Screen mode
    const greenCushion = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.08, cx, cy, maxR);
    greenCushion.addColorStop(0, 'rgba(6, 18, 44, 0.54)');
    greenCushion.addColorStop(0.72, 'rgba(7, 20, 46, 0.42)');
    greenCushion.addColorStop(1, 'rgba(7, 20, 46, 0.18)');
    ctx.fillStyle = greenCushion;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  } else if (isBlack) {
    // Subtle borderless translucent tint in Black mode
    const blackCushion = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.08, cx, cy, maxR);
    blackCushion.addColorStop(0, 'rgba(12, 28, 64, 0.34)');
    blackCushion.addColorStop(0.75, hexToRgba(accentColor, 0.12));
    blackCushion.addColorStop(1, hexToRgba(keywordColor, 0.04));
    ctx.fillStyle = blackCushion;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  } else {
    // 'style' mode: Soft, borderless, lightweight translucent glass cushion behind text
    const softCushion = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.06, cx, cy, maxR);
    softCushion.addColorStop(0, 'rgba(4, 13, 34, 0.44)');
    softCushion.addColorStop(0.68, 'rgba(6, 18, 46, 0.30)');
    softCushion.addColorStop(1, 'rgba(8, 24, 58, 0.10)');
    ctx.fillStyle = softCushion;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();

    // Whisper-light diagonal glass refraction sheen (no border stroke)
    const sheenGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    sheenGrad.addColorStop(0, hexToRgba('#BAE6FD', 0.09));
    sheenGrad.addColorStop(0.5, 'rgba(12, 28, 64, 0.04)');
    sheenGrad.addColorStop(1, hexToRgba(accentColor, 0.08));
    ctx.fillStyle = sheenGrad;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  }

  ctx.restore();
}

// ============================================================================
// 1. QUOTE MODE FLOATING STYLE (quote_float_glass)
// ============================================================================

function makeQuoteFloatingMetadata(
  id: 'quote_float_glass',
  variant: FloatingThemeVariant,
  nameAr: string,
  descriptionAr: string
): StyleMetadata {
  const pal = FLOATING_PALETTES[variant];
  const lightPalette: StyleLightPalette = {
    textPrimary: pal.textPrimary,
    textSecondary: pal.textSecondary,
    accent: pal.defaultAccent,
    keyword: pal.defaultKeyword,
    border: pal.defaultAccent,
  };
  return {
    id,
    mode: 'quote',
    nameAr,
    nameEn: `Floating ${pal.nameSuffixEn}`,
    descriptionAr,
    defaultAccent: pal.defaultAccent,
    defaultKeywordColor: pal.defaultKeyword,
    defaultQuoteFont: 'Readex Pro',
    defaultAuthorFont: 'Tajawal',
    defaultEnglishQuoteFont: 'Outfit',
    defaultEnglishAuthorFont: 'Plus Jakarta Sans',
    supportedBackgrounds: ['style', 'green', 'black'],
    recommendedBackground: 'style',
    lightPalette,
    allowedFonts: NON_MONO_ARABIC_FONTS,
    allowedEnglishFonts: MODERN_ENGLISH_FONTS,
  };
}

export const QUOTE_FLOAT_GLASS_CONFIG = makeQuoteFloatingMetadata(
  'quote_float_glass',
  'glass',
  'كرات ومكعبات زجاجية',
  'بطاقة اقتباس زجاجية عائمة بعمق فضائي، تحيط بها مدارات ضوئية وكرات ومكعبات كريستالية ثلاثية الأبعاد'
);

export function getQuoteFloatingEventTimes(
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
    custom.quoteFontOverride || (isLtr ? 'Outfit' : 'Readex Pro');

  const panelX = isHorizontal ? W * 0.21 : W * 0.09;
  const panelY = isHorizontal ? H * 0.19 : H * 0.32;
  const panelW = isHorizontal ? W * 0.70 : W * 0.82;
  const panelH = isHorizontal ? H * 0.58 : H * 0.54;
  const portraitSize = isHorizontal ? 310 : 250;

  const quoteLayout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: content.quotationMarks,
    fontFamily: quoteFont,
    fontWeight: 700,
    minFontSize: isHorizontal ? 30 : 28,
    maxFontSize: isHorizontal ? 60 : 54,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: 1.68,
    boxX: isHorizontal ? panelX + portraitSize * 0.62 : panelX + 44,
    boxY: isHorizontal ? panelY + 54 : panelY + portraitSize * 0.44 + 24,
    boxWidth: isHorizontal ? panelW - portraitSize * 0.62 - 64 : panelW - 88,
    boxHeight: isHorizontal ? panelH - 180 : panelH - portraitSize * 0.44 - 160,
    align: isHorizontal ? (isLtr ? 'left' : 'right') : 'center',
    direction,
  });

  const totalWords = Math.max(1, quoteLayout.words.length);
  const wordRevealStart = enter * 0.2;
  const wordRevealEnd = enter * 0.72;
  const wordInterval = (wordRevealEnd - wordRevealStart) / totalWords;

  const seenGroups = new Set<number>();
  const keywordTimes: number[] = [];
  for (const w of quoteLayout.words) {
    if (w.isKeyword && w.groupId !== null && !seenGroups.has(w.groupId)) {
      seenGroups.add(w.groupId);
      const wTime = wordRevealStart + w.globalWordIndex * wordInterval;
      keywordTimes.push(Number((wTime + 0.08).toFixed(3)));
    }
  }

  return { enterStart: Number((enter * 0.08).toFixed(3)), keywordTimes };
}

function makeQuoteFloatingRenderer(variant: FloatingThemeVariant): PureStyleRenderer {
  return (ctx, t, content, timeline, custom, size) => {
    const { baseWidth: W, baseHeight: H } = size;
    const isHorizontal = custom.format === '16:9';
    const { enter, exitStart, total } = getEffectiveTimeline(timeline, content.quoteText);
    const bgMode = resolveBackgroundMode(custom);
    const isGreen = bgMode === 'green';
    const isBlack = bgMode === 'black';
    const pal = FLOATING_PALETTES[variant];

    const accent = custom.accentColor || pal.defaultAccent;
    const keywordColor = custom.keywordColor || pal.defaultKeyword;
    const direction = resolveTextDirection(custom, content.quoteText);
    const isLtr = direction === 'ltr';
    const quoteFont =
      custom.quoteFontOverride || (isLtr ? 'Outfit' : 'Readex Pro');
    const authorFont =
      custom.authorFontOverride || (isLtr ? 'Plus Jakarta Sans' : 'Tajawal');

    const enterProg = easeOutCubic(progress(t, 0, enter * 0.65));
    const exitProg = easeInCubic(progress(t, exitStart, total));
    const masterAlpha = clamp(1 - exitProg, 0, 1);

    const panelX = isHorizontal ? W * 0.21 : W * 0.09;
    const panelY = isHorizontal ? H * 0.19 : H * 0.32;
    const panelW = isHorizontal ? W * 0.70 : W * 0.82;
    const panelH = isHorizontal ? H * 0.58 : H * 0.54;
    const panelRadius = 32;

    const portraitSize = isHorizontal ? 310 : 250;
    const portraitX = isHorizontal
      ? panelX - portraitSize * 0.25
      : W * 0.5 - portraitSize / 2;
    const portraitY = isHorizontal
      ? panelY + (panelH - portraitSize) * 0.5
      : panelY - portraitSize * 0.52;

    const floatObjects = generateFloatingObjectsAroundBox(
      W,
      H,
      panelX,
      panelY,
      panelW,
      panelH,
      custom.seed
    );

    ctx.save();
    drawFloatingSceneBackdrop(ctx, W, H, t, variant, accent, keywordColor, bgMode, masterAlpha);

    // Back half of sweeping orbital light rings
    drawOrbitalLightArcs(
      ctx,
      panelX,
      panelY,
      panelW,
      panelH,
      'back',
      t,
      enterProg,
      masterAlpha,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects,
      { x: portraitX, y: portraitY, w: portraitSize, h: portraitSize }
    );

    // Back layer parallax 3D glass spheres & cubes
    renderFloatingObjectsLayer(
      ctx,
      floatObjects,
      'back',
      t,
      enterProg,
      masterAlpha,
      variant,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    // Main Levitating Frosted Glass Card
    const cardHoverY = Math.sin(t * 2.1) * 6.5 * enterProg;
    const cardSlideY = (1 - enterProg) * 36;

    const textBoxX = isHorizontal ? panelX + portraitSize * 0.62 : panelX + 44;
    const textBoxW = isHorizontal ? panelW - portraitSize * 0.62 - 64 : panelW - 88;
    const textBoxY = isHorizontal ? panelY + 54 : panelY + portraitSize * 0.44 + 24;
    const textBoxH = isHorizontal ? panelH - 180 : panelH - portraitSize * 0.44 - 160;
    const textAlign = isHorizontal ? (isLtr ? 'left' : 'right') : 'center';

    if (enterProg > 0.01) {
      ctx.save();
      ctx.globalAlpha = isGreen ? (enterProg * masterAlpha > 0.2 ? 1 : 0) : enterProg * masterAlpha;
      ctx.translate(0, cardSlideY + cardHoverY);
      drawLevitating3DCardSurface(
        ctx,
        panelX,
        panelY,
        panelW,
        panelH,
        panelRadius,
        variant,
        accent,
        keywordColor,
        bgMode,
        t
      );
      ctx.restore();
    }

    // Quote Text Word-by-Word
    const quoteLayout = layoutArabicQuote(ctx, {
      text: content.quoteText,
      quotationMarks: content.quotationMarks,
      fontFamily: quoteFont,
      fontWeight: 700,
      minFontSize: isHorizontal ? 30 : 28,
      maxFontSize: isHorizontal ? 60 : 54,
      fontSizeMultiplier: custom.fontSizeMultiplier,
      lineHeightRatio: 1.68,
      boxX: textBoxX,
      boxY: textBoxY,
      boxWidth: textBoxW,
      boxHeight: textBoxH,
      align: textAlign,
      direction,
    });

    const totalWords = Math.max(1, quoteLayout.words.length);
    const wordRevealStart = enter * 0.2;
    const wordRevealEnd = enter * 0.72;
    const wordInterval = (wordRevealEnd - wordRevealStart) / totalWords;

    ctx.save();
    applyStudioCanvasTextProps(
      ctx,
      quoteLayout.fontFamily,
      quoteLayout.fontWeight,
      quoteLayout.fontSize,
      direction
    );
    ctx.textAlign = 'right';

    for (const w of quoteLayout.words) {
      const wTime = wordRevealStart + w.globalWordIndex * wordInterval;
      if (t < wTime) continue;
      const wProg = easeOutCubic(progress(t, wTime, wTime + 0.22));
      if (wProg <= 0.005) continue;

      const wy = w.y + cardSlideY + cardHoverY + (isGreen ? 0 : (1 - wProg) * 12);
      const wordAlpha = isGreen ? (wProg * masterAlpha > 0.2 ? 1 : 0) : wProg * masterAlpha;

      if (!isBlack) {
        ctx.globalAlpha = isGreen ? wordAlpha : wordAlpha * 0.55;
        ctx.fillStyle = '#020617';
        ctx.fillText(w.text, w.x + 2, wy + 3);
      }

      const kwEmph = w.isKeyword
        ? easeOutCubic(progress(t, wTime + 0.08, wTime + 0.34))
        : 0;

      if (w.isKeyword && kwEmph > 0.01) {
        ctx.globalAlpha = wordAlpha;
        ctx.fillStyle = keywordColor;
        ctx.fillText(w.text, w.x, wy);

        const uW = w.width * kwEmph;
        const uX = isLtr ? w.x - w.width : w.x - uW;
        ctx.fillStyle = keywordColor;
        ctx.fillRect(uX, wy + quoteLayout.fontSize * 0.16, uW, 3.5);
      } else {
        ctx.globalAlpha = wordAlpha;
        ctx.fillStyle = pal.textPrimary;
        ctx.fillText(w.text, w.x, wy);
      }
    }
    ctx.restore();

    // Glowing Diamond-Star Divider & Author Metadata (matching reference image)
    const metaProg = easeOutCubic(progress(t, enter * 0.62, enter));
    if (metaProg > 0.005 && content.authorName.trim()) {
      ctx.save();
      ctx.globalAlpha = isGreen ? (metaProg * masterAlpha > 0.2 ? 1 : 0) : metaProg * masterAlpha;
      ctx.translate(0, cardSlideY + cardHoverY);

      const lastBottom =
        quoteLayout.lines.length > 0
          ? quoteLayout.lines[quoteLayout.lines.length - 1].bottomY
          : textBoxY + textBoxH * 0.7;
      const dividerY = clamp(lastBottom + 24, textBoxY + 56, panelY + panelH - 110);
      const anchorX =
        textAlign === 'right'
          ? textBoxX + textBoxW
          : textAlign === 'left'
            ? textBoxX
            : textBoxX + textBoxW / 2;

      const divHalfW = textBoxW * 0.42 * metaProg;
      const divCenterX = textBoxX + textBoxW * 0.55;
      const starX = divCenterX - divHalfW * 0.12;
      drawGlowingDiamondDivider(
        ctx,
        divCenterX,
        dividerY,
        divHalfW,
        starX,
        accent,
        isGreen,
        Math.sin(t * 3.2)
      );

      const authorY = dividerY + 44;
      applyStudioCanvasTextProps(ctx, authorFont, 700, isHorizontal ? 34 : 31, direction);
      ctx.textAlign = textAlign;
      ctx.fillStyle = mixHexColor(accent, '#FFFFFF', 0.45);
      ctx.fillText(content.authorName.trim(), anchorX, authorY);

      if (content.subtitle.trim()) {
        const subY = authorY + 36;
        applyStudioCanvasTextProps(ctx, authorFont, 500, isHorizontal ? 22 : 21, direction);
        ctx.textAlign = textAlign;
        ctx.fillStyle = '#CBD5E1';
        ctx.fillText(content.subtitle.trim(), anchorX, subY);
      }
      ctx.restore();
    }

    // Levitating Frosted Glass Portrait Frame
    const portraitProg = easeOutBack(progress(t, enter * 0.16, enter * 0.76), 1.3);
    if (portraitProg > 0.01) {
      ctx.save();
      ctx.globalAlpha = isGreen
        ? portraitProg * masterAlpha > 0.2
          ? 1
          : 0
        : clamp(portraitProg, 0, 1) * masterAlpha;
      const cx = portraitX + portraitSize / 2;
      const cy =
        portraitY +
        portraitSize / 2 +
        cardSlideY * 0.4 +
        Math.cos(t * 2.3) * 6 * clamp(enterProg, 0, 1);
      const popScale = lerp(0.76, 1.0, portraitProg);

      ctx.translate(cx, cy);
      ctx.scale(popScale, popScale);
      const frameRadius = 32;

      drawLevitating3DCardSurface(
        ctx,
        -portraitSize / 2,
        -portraitSize / 2,
        portraitSize,
        portraitSize,
        frameRadius,
        variant,
        accent,
        keywordColor,
        bgMode,
        t
      );

      const portraitCanvas = getCachedGradedPortrait(
        content.photoSource,
        content.photoId,
        content.crop,
        portraitSize,
        portraitSize,
        'normal'
      );
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(
        -portraitSize / 2 + 4,
        -portraitSize / 2 + 4,
        portraitSize - 8,
        portraitSize - 8,
        frameRadius - 3
      );
      ctx.clip();
      ctx.drawImage(
        portraitCanvas,
        -portraitSize / 2 + 4,
        -portraitSize / 2 + 4,
        portraitSize - 8,
        portraitSize - 8
      );
      ctx.restore();

      // Soft borderless glass reflection sheen over portrait
      const portSheen = ctx.createLinearGradient(
        -portraitSize / 2,
        -portraitSize / 2,
        portraitSize / 2,
        portraitSize / 2
      );
      portSheen.addColorStop(0, 'rgba(224, 242, 254, 0.16)');
      portSheen.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
      portSheen.addColorStop(1, hexToRgba(accent, 0.1));
      ctx.fillStyle = portSheen;
      ctx.beginPath();
      ctx.roundRect(-portraitSize / 2, -portraitSize / 2, portraitSize, portraitSize, frameRadius);
      ctx.fill();

      ctx.restore();
    }

    // Front half of sweeping orbital light rings (wraps in front of portrait & card)
    drawOrbitalLightArcs(
      ctx,
      panelX,
      panelY,
      panelW,
      panelH,
      'front',
      t,
      enterProg,
      masterAlpha,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects,
      { x: portraitX, y: portraitY, w: portraitSize, h: portraitSize }
    );

    // Foreground layer parallax 3D glass spheres & cubes
    renderFloatingObjectsLayer(
      ctx,
      floatObjects,
      'front',
      t,
      enterProg,
      masterAlpha,
      variant,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    ctx.restore();
  };
}

export const renderQuoteFloatGlass = makeQuoteFloatingRenderer('glass');

// ============================================================================
// 2. PHRASE MODE FLOATING STYLE (phrase_float_glass)
// ============================================================================

function makePhraseFloatingMetadata(
  id: 'phrase_float_glass',
  variant: FloatingThemeVariant,
  nameAr: string,
  descriptionAr: string
): StyleMetadata {
  const pal = FLOATING_PALETTES[variant];
  return {
    id,
    mode: 'phrase',
    nameAr,
    nameEn: `Phrase ${pal.nameSuffixEn}`,
    descriptionAr,
    defaultAccent: pal.defaultAccent,
    defaultKeywordColor: pal.defaultKeyword,
    defaultQuoteFont: 'Readex Pro',
    defaultAuthorFont: 'Readex Pro',
    defaultEnglishQuoteFont: 'Outfit',
    defaultEnglishAuthorFont: 'Outfit',
    supportedBackgrounds: ['style', 'green', 'black'],
    recommendedBackground: 'green',
    lightPalette: {
      textPrimary: pal.textPrimary,
      textSecondary: pal.textSecondary,
      accent: pal.defaultAccent,
      keyword: pal.defaultKeyword,
      border: pal.defaultAccent,
    },
    allowedFonts: NON_MONO_ARABIC_FONTS,
    allowedEnglishFonts: MODERN_ENGLISH_FONTS,
  };
}

export const PHRASE_FLOAT_GLASS_CONFIG = makePhraseFloatingMetadata(
  'phrase_float_glass',
  'glass',
  'كرات ومكعبات زجاجية',
  'لوحة جملة محورية زجاجية عائمة تحيط بها مدارات ضوئية وكرات ومكعبات كريستالية ثلاثية الأبعاد'
);

export function getPhraseFloatingEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const { baseWidth: W, baseHeight: H } = size;
  const isHorizontal = custom.format === '16:9';
  const pos = custom.position || 'center';
  const direction = resolveTextDirection(custom, content.quoteText);
  const posBox = getPhrasePositionBox(pos, custom.format, W, H, direction);
  const { enter } = getEffectiveTimeline(timeline, content.quoteText, 'phrase', 0.35);
  const font =
    custom.quoteFontOverride || (direction === 'ltr' ? 'Outfit' : 'Readex Pro');

  const isFullscreen = pos === 'fullscreen';
  const padX = Math.round(posBox.boxWidth * 0.08);
  const padY = Math.round(posBox.boxHeight * 0.14);

  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: font,
    fontWeight: 700,
    minFontSize: isFullscreen ? (isHorizontal ? 48 : 42) : isHorizontal ? 30 : 28,
    maxFontSize: isFullscreen ? (isHorizontal ? 108 : 92) : isHorizontal ? 76 : 64,
    fontSizeMultiplier: custom.fontSizeMultiplier,
    lineHeightRatio: 1.56,
    boxX: posBox.boxX + padX,
    boxY: posBox.boxY + padY,
    boxWidth: Math.max(120, posBox.boxWidth - padX * 2),
    boxHeight: Math.max(80, posBox.boxHeight - padY * 2),
    align: 'center',
    direction,
  });

  const totalWords = Math.max(1, layout.words.length);
  const revealStart = enter * 0.16;
  const revealEnd = enter * 0.78;
  const interval = (revealEnd - revealStart) / totalWords;

  const seenGroups = new Set<number>();
  const keywordTimes: number[] = [];
  for (const w of layout.words) {
    if (w.isKeyword && w.groupId !== null && !seenGroups.has(w.groupId)) {
      seenGroups.add(w.groupId);
      const wt = revealStart + w.globalWordIndex * interval;
      keywordTimes.push(Number((wt + 0.06).toFixed(3)));
    }
  }

  return { enterStart: 0.05, keywordTimes, annotationTimes: keywordTimes };
}

function makePhraseFloatingRenderer(variant: FloatingThemeVariant): PureStyleRenderer {
  return (ctx, t, content, timeline, custom, size) => {
    const { baseWidth: W, baseHeight: H } = size;
    const isHorizontal = custom.format === '16:9';
    const pos = custom.position || 'center';
    const direction = resolveTextDirection(custom, content.quoteText);
    const isLtr = direction === 'ltr';
    const posBox = getPhrasePositionBox(pos, custom.format, W, H, direction);
    const { enter, exitStart, total } = getEffectiveTimeline(
      timeline,
      content.quoteText,
      'phrase',
      0.35
    );
    const bgMode = resolveBackgroundMode(custom);
    const isGreen = bgMode === 'green';
    const isBlack = bgMode === 'black';
    const pal = FLOATING_PALETTES[variant];

    const accent = custom.accentColor || pal.defaultAccent;
    const keywordColor = custom.keywordColor || pal.defaultKeyword;
    const font =
      custom.quoteFontOverride || (isLtr ? 'Outfit' : 'Readex Pro');

    const enterProg = easeOutBack(progress(t, 0, enter * 0.65), 1.25);
    const exitProg = easeInCubic(progress(t, exitStart, total));
    const masterAlpha = clamp(1 - exitProg, 0, 1);

    const cardMarginX = Math.round(posBox.boxWidth * 0.04);
    const cardMarginY = Math.round(posBox.boxHeight * 0.08);
    const cardX = posBox.boxX + cardMarginX;
    const cardY = posBox.boxY + cardMarginY;
    const cardW = Math.max(160, posBox.boxWidth - cardMarginX * 2);
    const cardH = Math.max(100, posBox.boxHeight - cardMarginY * 2);

    const floatObjects = generateFloatingObjectsAroundBox(
      W,
      H,
      cardX,
      cardY,
      cardW,
      cardH,
      custom.seed
    );

    ctx.save();
    drawFloatingSceneBackdrop(ctx, W, H, t, variant, accent, keywordColor, bgMode, masterAlpha);

    drawOrbitalLightArcs(
      ctx,
      cardX,
      cardY,
      cardW,
      cardH,
      'back',
      t,
      clamp(enterProg, 0, 1),
      masterAlpha,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    renderFloatingObjectsLayer(
      ctx,
      floatObjects,
      'back',
      t,
      clamp(enterProg, 0, 1),
      masterAlpha,
      variant,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    const floatY = Math.sin(t * 2.3) * 6 * clamp(enterProg, 0, 1);
    const slideY = (1 - clamp(enterProg, 0, 1)) * 32;

    if (enterProg > 0.01) {
      ctx.save();
      ctx.globalAlpha = isGreen
        ? masterAlpha > 0.2
          ? 1
          : 0
        : clamp(enterProg, 0, 1) * masterAlpha;
      ctx.translate(0, slideY + floatY);
      drawLevitating3DCardSurface(
        ctx,
        cardX,
        cardY,
        cardW,
        cardH,
        28,
        variant,
        accent,
        keywordColor,
        bgMode,
        t
      );

      // Ornamental glowing diamond-star line near bottom of phrase glass plaque
      drawGlowingDiamondDivider(
        ctx,
        cardX + cardW * 0.5,
        cardY + cardH - 22,
        cardW * 0.34 * clamp(enterProg, 0, 1),
        cardX + cardW * 0.5,
        accent,
        isGreen,
        Math.sin(t * 3.0)
      );
      ctx.restore();
    }

    const isFullscreen = pos === 'fullscreen';
    const padX = Math.round(posBox.boxWidth * 0.08);
    const padY = Math.round(posBox.boxHeight * 0.14);

    const layout = layoutArabicQuote(ctx, {
      text: content.quoteText,
      quotationMarks: 'none',
      fontFamily: font,
      fontWeight: 700,
      minFontSize: isFullscreen ? (isHorizontal ? 48 : 42) : isHorizontal ? 30 : 28,
      maxFontSize: isFullscreen ? (isHorizontal ? 108 : 92) : isHorizontal ? 76 : 64,
      fontSizeMultiplier: custom.fontSizeMultiplier,
      lineHeightRatio: 1.56,
      boxX: posBox.boxX + padX,
      boxY: posBox.boxY + padY,
      boxWidth: Math.max(120, posBox.boxWidth - padX * 2),
      boxHeight: Math.max(80, posBox.boxHeight - padY * 2),
      align: 'center',
      direction,
    });

    const totalWords = Math.max(1, layout.words.length);
    const revealStart = enter * 0.16;
    const revealEnd = enter * 0.78;
    const interval = (revealEnd - revealStart) / totalWords;

    ctx.save();
    applyStudioCanvasTextProps(ctx, layout.fontFamily, layout.fontWeight, layout.fontSize, direction);
    ctx.textAlign = 'right';

    for (const w of layout.words) {
      const wt = revealStart + w.globalWordIndex * interval;
      if (t < wt) continue;
      const wp = easeOutBack(progress(t, wt, wt + 0.24), 1.35);
      if (wp <= 0.01) continue;

      const wy = w.y + slideY + floatY + (1 - clamp(wp, 0, 1)) * 14;
      const wordAlpha = isGreen
        ? masterAlpha > 0.2
          ? 1
          : 0
        : clamp(wp, 0, 1) * masterAlpha;

      if (w.isKeyword) {
        const kwP = easeOutCubic(progress(t, wt + 0.04, wt + 0.28));
        const pillPadX = Math.round(layout.fontSize * 0.18);
        const pillW = w.width + pillPadX * 2;
        const pillH = Math.round(layout.fontSize * 1.18);
        const pillX = w.x - w.width - pillPadX;
        const pillY = wy - layout.fontSize * 0.88;

        ctx.save();
        ctx.globalAlpha = wordAlpha;
        ctx.fillStyle = isBlack
          ? hexToRgba(keywordColor, 0.2)
          : isGreen
            ? 'rgba(14, 41, 88, 0.56)'
            : hexToRgba(keywordColor, 0.22);
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW * kwP, pillH, Math.min(16, pillH * 0.38));
        ctx.fill();
        ctx.restore();

        ctx.globalAlpha = wordAlpha;
        ctx.fillStyle = keywordColor;
        ctx.fillText(w.text, w.x, wy);
      } else {
        if (!isBlack) {
          ctx.globalAlpha = isGreen ? wordAlpha : wordAlpha * 0.5;
          ctx.fillStyle = '#020617';
          ctx.fillText(w.text, w.x + 2, wy + 3);
        }
        ctx.globalAlpha = wordAlpha;
        ctx.fillStyle = pal.textPrimary;
        ctx.fillText(w.text, w.x, wy);
      }
    }
    ctx.restore();

    drawOrbitalLightArcs(
      ctx,
      cardX,
      cardY,
      cardW,
      cardH,
      'front',
      t,
      clamp(enterProg, 0, 1),
      masterAlpha,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    renderFloatingObjectsLayer(
      ctx,
      floatObjects,
      'front',
      t,
      clamp(enterProg, 0, 1),
      masterAlpha,
      variant,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    ctx.restore();
  };
}

export const renderPhraseFloatGlass = makePhraseFloatingRenderer('glass');

// ============================================================================
// 3. CHAT MODE FLOATING STYLE (chat_float_glass)
// ============================================================================

function makeChatFloatingMetadata(
  id: 'chat_float_glass',
  variant: FloatingThemeVariant,
  nameAr: string,
  descriptionAr: string
): StyleMetadata {
  const pal = FLOATING_PALETTES[variant];
  return {
    id,
    mode: 'chat',
    nameAr,
    nameEn: `Chat ${pal.nameSuffixEn}`,
    descriptionAr,
    defaultAccent: pal.defaultAccent,
    defaultKeywordColor: pal.defaultKeyword,
    defaultQuoteFont: 'Cairo',
    defaultAuthorFont: 'Cairo',
    defaultEnglishQuoteFont: 'Plus Jakarta Sans',
    defaultEnglishAuthorFont: 'Plus Jakarta Sans',
    supportedBackgrounds: ['style', 'green', 'black'],
    recommendedBackground: 'green',
    lightPalette: {
      textPrimary: pal.textPrimary,
      textSecondary: pal.textSecondary,
      accent: pal.defaultAccent,
      keyword: pal.defaultKeyword,
      border: pal.defaultAccent,
    },
    allowedFonts: NON_MONO_ARABIC_FONTS,
    allowedEnglishFonts: MODERN_ENGLISH_FONTS,
  };
}

export const CHAT_FLOAT_GLASS_CONFIG = makeChatFloatingMetadata(
  'chat_float_glass',
  'glass',
  'محادثة الهندسة الزجاجية',
  'نافذة محادثة زجاجية عائمة تحيط بها مدارات ضوئية وكرات ومكعبات كريستالية ثلاثية الأبعاد'
);

export function getChatFloatingEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  _timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const { baseWidth: W, baseHeight: H } = size;
  const messages = content.chatMessages || custom.chatMessages || DEFAULT_CHAT_MESSAGES;
  const timing = custom.chatTiming || DEFAULT_CHAT_TIMING;
  const schedule = computeChatSchedule(messages, timing);
  const posBox = getChatPositionBox(custom.position || 'center', custom.format, W, H);
  const maxBubbleW = Math.round(posBox.boxWidth * 0.76);
  const fontSize = Math.round(
    clamp(posBox.boxWidth * 0.032, 22, 36) * (custom.fontSizeMultiplier || 1)
  );

  const sendTimes: number[] = [];
  const receiveTimes: number[] = [];
  const keywordTimes: number[] = [];

  for (const sched of schedule.items) {
    const rawText = sched.message.text || '';
    const dir: ResolvedTextDirection =
      custom.textDirection && custom.textDirection !== 'auto'
        ? custom.textDirection
        : detectTextDirection(rawText);
    const font = custom.quoteFontOverride || (dir === 'ltr' ? 'Plus Jakarta Sans' : 'Cairo');
    const layout = layoutArabicQuote(ctx, {
      text: rawText,
      quotationMarks: 'none',
      fontFamily: font,
      fontWeight: 600,
      minFontSize: fontSize,
      maxFontSize: fontSize,
      fontSizeMultiplier: 1,
      lineHeightRatio: 1.52,
      boxX: 0,
      boxY: 0,
      boxWidth: Math.max(120, maxBubbleW - 36),
      boxHeight: 2000,
      align: dir === 'ltr' ? 'left' : 'right',
      direction: dir,
    });

    if (sched.role === 'user') {
      sendTimes.push(Number(sched.sendTime.toFixed(3)));
      const seen = new Set<number>();
      for (const w of layout.words) {
        if (w.isKeyword && w.groupId !== null && !seen.has(w.groupId)) {
          seen.add(w.groupId);
          keywordTimes.push(Number((sched.sendTime + 0.12).toFixed(3)));
        }
      }
    } else {
      receiveTimes.push(Number(sched.receiveTime.toFixed(3)));
      const totalWords = Math.max(1, layout.words.length);
      const streamDur = Math.max(0.15, sched.endTime - sched.receiveTime);
      const seen = new Set<number>();
      for (const w of layout.words) {
        if (w.isKeyword && w.groupId !== null && !seen.has(w.groupId)) {
          seen.add(w.groupId);
          const wt = sched.receiveTime + (w.globalWordIndex / totalWords) * streamDur;
          keywordTimes.push(Number(wt.toFixed(3)));
        }
      }
    }
  }

  return {
    enterStart: 0.05,
    keywordTimes,
    sendTimes,
    receiveTimes,
  };
}

function makeChatFloatingRenderer(variant: FloatingThemeVariant): PureStyleRenderer {
  return (ctx, t, content, _timeline, custom, size) => {
    const { baseWidth: W, baseHeight: H } = size;
    const bgMode = resolveBackgroundMode(custom);
    const isGreen = bgMode === 'green';
    const isBlack = bgMode === 'black';
    const pal = FLOATING_PALETTES[variant];

    const accent = custom.accentColor || pal.defaultAccent;
    const keywordColor = custom.keywordColor || pal.defaultKeyword;
    const messages = content.chatMessages || custom.chatMessages || DEFAULT_CHAT_MESSAGES;
    const timing = custom.chatTiming || DEFAULT_CHAT_TIMING;
    const schedule = computeChatSchedule(messages, timing);
    const posBox = getChatPositionBox(custom.position || 'center', custom.format, W, H);

    const introP = easeOutCubic(progress(t, 0, schedule.introDuration));
    const exitP = easeInCubic(progress(t, schedule.exitStart, schedule.totalDuration));
    const masterAlpha = clamp(introP * (1 - exitP), 0, 1);

    const floatObjects = generateFloatingObjectsAroundBox(
      W,
      H,
      posBox.boxX,
      posBox.boxY,
      posBox.boxWidth,
      posBox.boxHeight,
      custom.seed
    );

    ctx.save();
    drawFloatingSceneBackdrop(ctx, W, H, t, variant, accent, keywordColor, bgMode, masterAlpha);

    drawOrbitalLightArcs(
      ctx,
      posBox.boxX,
      posBox.boxY,
      posBox.boxWidth,
      posBox.boxHeight,
      'back',
      t,
      introP,
      masterAlpha,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    renderFloatingObjectsLayer(
      ctx,
      floatObjects,
      'back',
      t,
      introP,
      masterAlpha,
      variant,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    const floatY = Math.sin(t * 2.0) * 5 * introP;
    const winX = posBox.boxX;
    const winY = posBox.boxY + floatY;
    const winW = posBox.boxWidth;
    const winH = posBox.boxHeight;

    ctx.save();
    ctx.globalAlpha = isGreen ? (masterAlpha > 0.2 ? 1 : 0) : masterAlpha;
    drawLevitating3DCardSurface(
      ctx,
      winX,
      winY,
      winW,
      winH,
      28,
      variant,
      accent,
      keywordColor,
      bgMode,
      t
    );

    const padX = Math.round(winW * 0.045);
    const headerH = 54;
    const inputBarH = 58;
    const viewportTop = winY + headerH;
    const viewportH = Math.max(120, winH - headerH - inputBarH - 16);
    const maxBubbleW = Math.round((winW - padX * 2) * 0.8);
    const fontSize = Math.round(
      clamp(winW * 0.032, 20, 34) * (custom.fontSizeMultiplier || 1)
    );

    // Glowing Diamond Divider Header Bar
    drawGlowingDiamondDivider(
      ctx,
      winX + winW * 0.5,
      winY + headerH,
      winW * 0.44,
      winX + winW * 0.5,
      accent,
      isGreen,
      Math.sin(t * 2.8)
    );

    const aiLabel = content.aiLabel || custom.chatAiLabel || 'الذكاء الاصطناعي';
    const userLabel = content.userLabel || custom.chatUserLabel || 'أنا';
    applyStudioCanvasTextProps(ctx, 'Cairo', 700, 18, 'rtl');
    ctx.textAlign = 'right';
    ctx.fillStyle = pal.textSecondary;
    ctx.fillText(aiLabel, winX + winW - 24, winY + 34);

    // Pre-layout messages & scroll checkpoints
    let cursorY = 18;
    const checkpoints: { time: number; targetScroll: number }[] = [];
    const laidMessages = schedule.items.map((sched) => {
      const rawText = sched.message.text || '';
      const dir: ResolvedTextDirection =
        custom.textDirection && custom.textDirection !== 'auto'
          ? custom.textDirection
          : detectTextDirection(rawText);
      const font = custom.quoteFontOverride || (dir === 'ltr' ? 'Plus Jakarta Sans' : 'Cairo');
      const layout = layoutArabicQuote(ctx, {
        text: rawText,
        quotationMarks: 'none',
        fontFamily: font,
        fontWeight: 600,
        minFontSize: fontSize,
        maxFontSize: fontSize,
        fontSizeMultiplier: 1,
        lineHeightRatio: 1.5,
        boxX: 0,
        boxY: 0,
        boxWidth: Math.max(110, maxBubbleW - 36),
        boxHeight: 2000,
        align: dir === 'ltr' ? 'left' : 'right',
        direction: dir,
      });

      const bubbleW = clamp(Math.ceil(layout.maxLineWidth) + 38, 120, maxBubbleW);
      const bubbleH = Math.max(52, Math.ceil(layout.totalHeight) + 28);
      const slotTopY = cursorY;
      const slotBottomY = slotTopY + bubbleH + 22;
      cursorY = slotBottomY + 14;

      const appearTime = sched.role === 'user' ? sched.sendTime : sched.receiveTime;
      if (slotBottomY > viewportH) {
        checkpoints.push({
          time: appearTime,
          targetScroll: slotBottomY - viewportH + 16,
        });
      }

      return { sched, rawText, dir, layout, bubbleW, bubbleH, slotTopY };
    });

    const scrollY = evaluateDeterministicChatScroll(t, checkpoints);

    // Clip messages viewport
    ctx.save();
    ctx.beginPath();
    ctx.rect(winX + 6, viewportTop, winW - 12, viewportH);
    ctx.clip();

    const swapSides = Boolean(custom.chatSwapSides);

    for (const item of laidMessages) {
      const { sched, dir, layout, bubbleW, bubbleH, slotTopY } = item;
      const isUser = sched.role === 'user';
      const appearT = isUser ? sched.sendTime : sched.receiveTime;

      // Thinking indicator before AI reply (borderless translucent glass bubble)
      if (!isUser && t >= sched.thinkingStart && t < sched.receiveTime) {
        const dy = viewportTop + slotTopY - scrollY;
        const onRight = swapSides;
        const bx = onRight ? winX + winW - padX - 96 : winX + padX;
        ctx.fillStyle = isBlack
          ? 'rgba(11, 23, 48, 0.48)'
          : isGreen
            ? 'rgba(11, 31, 70, 0.56)'
            : 'rgba(11, 31, 70, 0.46)';
        ctx.beginPath();
        ctx.roundRect(bx, dy, 96, 44, 18);
        ctx.fill();

        for (let d = 0; d < 3; d++) {
          const bounce = Math.sin((t - sched.thinkingStart) * 8 + d * 1.1) * 4;
          ctx.fillStyle = '#E0F2FE';
          ctx.beginPath();
          ctx.arc(bx + 28 + d * 20, dy + 22 + bounce, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (t < appearT) continue;
      const popP = easeOutBack(progress(t, appearT, appearT + 0.28), 1.3);
      const by = viewportTop + slotTopY - scrollY + (1 - clamp(popP, 0, 1)) * 18;
      const onRight = isUser ? !swapSides : swapSides;
      const bx = onRight ? winX + winW - padX - bubbleW : winX + padX;

      // Role label
      applyStudioCanvasTextProps(ctx, 'Cairo', 700, 14, dir);
      ctx.textAlign = onRight ? 'right' : 'left';
      ctx.fillStyle = pal.textSecondary;
      ctx.fillText(
        isUser ? userLabel : aiLabel,
        onRight ? bx + bubbleW - 6 : bx + 6,
        by - 5
      );

      // Borderless translucent glass bubble surface behind message text
      ctx.fillStyle = isUser
        ? isBlack
          ? hexToRgba(accent, 0.22)
          : isGreen
            ? 'rgba(19, 50, 107, 0.58)'
            : hexToRgba(accent, 0.26)
        : isBlack
          ? 'rgba(255, 255, 255, 0.06)'
          : isGreen
            ? 'rgba(9, 26, 60, 0.56)'
            : 'rgba(8, 22, 54, 0.48)';
      ctx.beginPath();
      ctx.roundRect(bx, by, bubbleW, bubbleH, 20);
      ctx.fill();

      // Words inside bubble
      const totalWords = Math.max(1, layout.words.length);
      const streamDur = Math.max(0.15, sched.endTime - sched.receiveTime);
      const revealedRatio = isUser
        ? 1
        : clamp((t - sched.receiveTime) / streamDur, 0, 1);
      const visibleWords = Math.ceil(revealedRatio * totalWords);

      const textOriginX =
        dir === 'ltr' ? bx + 18 : bx + bubbleW - 18 - layout.boxWidth;
      const textOriginY = by + 14;

      applyStudioCanvasTextProps(ctx, layout.fontFamily, layout.fontWeight, layout.fontSize, dir);
      ctx.textAlign = 'right';
      for (const w of layout.words) {
        if (w.globalWordIndex >= visibleWords) continue;
        const wx = textOriginX + w.x;
        const wy = textOriginY + w.y;
        ctx.fillStyle = w.isKeyword ? keywordColor : pal.textPrimary;
        drawBidiWord(ctx, w.text, wx, wy, dir);
      }
    }
    ctx.restore();

    // Borderless Translucent Bottom Input Bar
    const barY = winY + winH - inputBarH - 10;
    const barX = winX + padX;
    const barW = winW - padX * 2;
    ctx.fillStyle = isBlack
      ? 'rgba(7, 13, 28, 0.44)'
      : isGreen
        ? 'rgba(7, 21, 50, 0.54)'
        : 'rgba(6, 18, 44, 0.42)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, 44, 22);
    ctx.fill();

    // Active user typing preview inside input bar
    const activeTypingMsg = laidMessages.find(
      (m) =>
        m.sched.role === 'user' &&
        t >= m.sched.typingStart &&
        t < m.sched.sendTime
    );
    if (activeTypingMsg) {
      const cleanStr = activeTypingMsg.rawText.replace(/\*\*/g, '').replace(/\*/g, '');
      const typeRatio = progress(
        t,
        activeTypingMsg.sched.typingStart,
        activeTypingMsg.sched.typingEnd
      );
      const charCount = Math.max(1, Math.ceil(cleanStr.length * typeRatio));
      const typedStr = cleanStr.slice(0, charCount);
      applyStudioCanvasTextProps(
        ctx,
        activeTypingMsg.layout.fontFamily,
        600,
        Math.min(22, fontSize * 0.82),
        activeTypingMsg.dir
      );
      ctx.textAlign = activeTypingMsg.dir === 'ltr' ? 'left' : 'right';
      ctx.fillStyle = pal.textPrimary;
      ctx.fillText(
        typedStr,
        activeTypingMsg.dir === 'ltr' ? barX + 20 : barX + barW - 20,
        barY + 28
      );
    }

    ctx.restore();

    drawOrbitalLightArcs(
      ctx,
      posBox.boxX,
      posBox.boxY,
      posBox.boxWidth,
      posBox.boxHeight,
      'front',
      t,
      introP,
      masterAlpha,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    renderFloatingObjectsLayer(
      ctx,
      floatObjects,
      'front',
      t,
      introP,
      masterAlpha,
      variant,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    ctx.restore();
  };
}

export const renderChatFloatGlass = makeChatFloatingRenderer('glass');

// ============================================================================
// 4. POINTS MODE FLOATING STYLE (pts_float_glass)
// ============================================================================

function makePointsFloatingMetadata(
  id: 'pts_float_glass',
  variant: FloatingThemeVariant,
  nameAr: string,
  descriptionAr: string
): StyleMetadata {
  const pal = FLOATING_PALETTES[variant];
  return {
    id,
    mode: 'points',
    nameAr,
    nameEn: `Points ${pal.nameSuffixEn}`,
    descriptionAr,
    defaultAccent: pal.defaultAccent,
    defaultKeywordColor: pal.defaultKeyword,
    defaultQuoteFont: 'Readex Pro',
    defaultAuthorFont: 'Readex Pro',
    defaultEnglishQuoteFont: 'Plus Jakarta Sans',
    defaultEnglishAuthorFont: 'Plus Jakarta Sans',
    supportedBackgrounds: ['style', 'green', 'black'],
    recommendedBackground: 'green',
    lightPalette: {
      textPrimary: pal.textPrimary,
      textSecondary: pal.textSecondary,
      accent: pal.defaultAccent,
      keyword: pal.defaultKeyword,
      border: pal.defaultAccent,
    },
    allowedFonts: NON_MONO_ARABIC_FONTS,
    allowedEnglishFonts: MODERN_ENGLISH_FONTS,
    supportedMarkerTypes: ['arabic-indic', 'western', 'bullets', 'checks', 'none'] as PointsMarkerType[],
    defaultMarkerType: 'arabic-indic',
  };
}

export const PTS_FLOAT_GLASS_CONFIG = makePointsFloatingMetadata(
  'pts_float_glass',
  'glass',
  'نقاط الهندسة الزجاجية',
  'بطاقات نقاط زجاجية عائمة تحيط بها مدارات ضوئية وكرات ومكعبات كريستالية ثلاثية الأبعاد'
);

export function getPointsFloatingEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  _timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const { schedule, layout } = buildAutoFitPointsLayout({
    ctx,
    content,
    custom,
    size,
    styleId: custom.pointsStyleId || 'pts_float_glass',
    allowedArabicFonts: NON_MONO_ARABIC_FONTS,
    defaultArabicFont: 'Readex Pro',
    defaultEnglishFont: 'Plus Jakarta Sans',
    fontWeight: 700,
    minFontSize: 20,
    maxFontSize: 40,
    lineHeightRatio: 1.54,
    supportedMarkerTypes: ['arabic-indic', 'western', 'bullets', 'checks', 'none'],
    defaultMarkerType: 'arabic-indic',
    allowTwoByTwoGrid: true,
    innerPadXRatio: 0.04,
    innerPadYRatio: 0.04,
    markerReserveFactor: 2.1,
    itemPadYFactor: 0.46,
    itemGapYFactor: 0.48,
  });

  return {
    enterStart: schedule.introDuration,
    itemTimes: schedule.itemTimes,
    keywordTimes: layout.allKeywordTimes,
  };
}

function makePointsFloatingRenderer(variant: FloatingThemeVariant): PureStyleRenderer {
  return (ctx, t, content, _timeline, custom, size) => {
    const { baseWidth: W, baseHeight: H } = size;
    const bgMode = resolveBackgroundMode(custom);
    const isGreen = bgMode === 'green';
    const pal = FLOATING_PALETTES[variant];

    const accent = custom.accentColor || pal.defaultAccent;
    const keywordColor = custom.keywordColor || pal.defaultKeyword;

    const { schedule, layout } = buildAutoFitPointsLayout({
      ctx,
      content,
      custom,
      size,
      styleId: custom.pointsStyleId || 'pts_float_glass',
      allowedArabicFonts: NON_MONO_ARABIC_FONTS,
      defaultArabicFont: 'Readex Pro',
      defaultEnglishFont: 'Plus Jakarta Sans',
      fontWeight: 700,
      minFontSize: 20,
      maxFontSize: 40,
      lineHeightRatio: 1.54,
      supportedMarkerTypes: ['arabic-indic', 'western', 'bullets', 'checks', 'none'],
      defaultMarkerType: 'arabic-indic',
      allowTwoByTwoGrid: true,
      innerPadXRatio: 0.04,
      innerPadYRatio: 0.04,
      markerReserveFactor: 2.1,
      itemPadYFactor: 0.46,
      itemGapYFactor: 0.48,
    });

    const introP = easeOutCubic(progress(t, 0.04, schedule.introDuration * 0.85));
    const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
    const masterAlpha = clamp(introP * (1 - easeInCubic(exitP)), 0, 1);

    const floatObjects = generateFloatingObjectsAroundBox(
      W,
      H,
      layout.boxX,
      layout.boxY,
      layout.boxW,
      layout.boxH,
      custom.seed
    );

    ctx.save();
    drawFloatingSceneBackdrop(ctx, W, H, t, variant, accent, keywordColor, bgMode, masterAlpha);

    if (masterAlpha <= 0.005) {
      ctx.restore();
      return;
    }

    drawOrbitalLightArcs(
      ctx,
      layout.boxX,
      layout.boxY,
      layout.boxW,
      layout.boxH,
      'back',
      t,
      introP,
      masterAlpha,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    renderFloatingObjectsLayer(
      ctx,
      floatObjects,
      'back',
      t,
      introP,
      masterAlpha,
      variant,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    // Optional Levitating Title Pill
    if (layout.titleLayout && layout.titleText.length > 0) {
      const titleEnterP = easeOutBack(progress(t, 0.06, 0.48), 1.35);
      const isTitleLtr = layout.titleDirection === 'ltr';
      const titleOriginX = isTitleLtr
        ? layout.boxX + Math.round(layout.boxW * 0.04)
        : layout.boxX +
          layout.boxW -
          Math.round(layout.boxW * 0.04) -
          layout.titleLayout.boxWidth;
      const hoverY = Math.sin(t * 2.1) * 3.5;

      ctx.save();
      ctx.globalAlpha = isGreen ? (masterAlpha > 0.2 ? 1 : 0) : masterAlpha;
      const tPadX = 22;
      const tPadY = 10;
      const tCardW = Math.min(layout.boxW, layout.titleLayout.maxLineWidth + tPadX * 2);
      const tCardH = layout.titleLayout.totalHeight + tPadY * 2;
      const tCardX = isTitleLtr
        ? titleOriginX - tPadX
        : titleOriginX + layout.titleLayout.boxWidth - tCardW + tPadX;
      const tCardY = layout.titleY - tPadY + hoverY;

      drawLevitating3DCardSurface(
        ctx,
        tCardX,
        tCardY,
        tCardW,
        tCardH,
        16,
        variant,
        accent,
        keywordColor,
        bgMode,
        t
      );

      drawPointTextWithWipeAndKeywords({
        ctx,
        layout: layout.titleLayout,
        originX: titleOriginX,
        originY: layout.titleY + hoverY,
        wipeProgress: clamp(titleEnterP, 0, 1),
        textColor: pal.textPrimary,
        keywordColor,
        underlineKeywords: true,
      });
      ctx.restore();
    }

    // Levitating Point Cards
    const highlightCurrent = custom.pointsHighlightCurrent ?? true;
    for (let i = 0; i < layout.items.length; i++) {
      const slot = layout.items[i];
      const sched = slot.sched;
      if (t < sched.startTime) continue;

      const dropP = progress(t, sched.startTime, sched.startTime + 0.42);
      const springVal = easeOutBack(dropP, 1.55);
      const cardScale = lerp(0.86, 1.0, springVal);
      const bobY = Math.sin(t * 2.2 + i * 0.85) * 4.5 * clamp(dropP, 0, 1);
      const dropOffsetY = lerp(-28, 0, springVal) + bobY;
      const enterOpacity = clamp(dropP * 2.4, 0, 1);
      const itemAlpha = getPointHighlightAlpha(t, i, schedule.items, highlightCurrent, 0.48);

      const cx = slot.slotX + slot.slotW * 0.5;
      const cy = slot.slotY + slot.slotH * 0.5 + dropOffsetY;

      ctx.save();
      const rawCardAlpha = masterAlpha * enterOpacity * itemAlpha;
      ctx.globalAlpha = isGreen ? (rawCardAlpha > 0.2 ? 1 : 0) : rawCardAlpha;
      ctx.translate(cx, cy);
      ctx.scale(cardScale, cardScale);
      ctx.translate(-cx, -slot.slotY - slot.slotH * 0.5);

      drawLevitating3DCardSurface(
        ctx,
        slot.slotX,
        slot.slotY,
        slot.slotW,
        slot.slotH,
        20,
        variant,
        accent,
        keywordColor,
        bgMode,
        t + i * 0.4
      );

      // 3D Glass Sphere Marker Badge
      if (slot.markerText) {
        const badgeR = Math.round(layout.fontSize * 0.72);
        drawSingleFloating3DObject(
          ctx,
          variant,
          0,
          slot.markerCenterX,
          slot.markerCenterY,
          badgeR,
          0,
          accent,
          keywordColor,
          bgMode,
          1
        );

        const markerScale = slot.markerText.length >= 2 ? 0.72 : 0.85;
        applyStudioCanvasTextProps(
          ctx,
          layout.fontFamily,
          800,
          Math.round(layout.fontSize * markerScale),
          slot.direction
        );
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(slot.markerText, slot.markerCenterX, slot.markerCenterY + 1);
      }

      drawPointTextWithWipeAndKeywords({
        ctx,
        layout: slot.layout,
        originX: slot.textX,
        originY: slot.textY,
        wipeProgress: 1.0,
        textColor: pal.textPrimary,
        keywordColor,
        underlineKeywords: true,
      });

      ctx.restore();
    }

    drawOrbitalLightArcs(
      ctx,
      layout.boxX,
      layout.boxY,
      layout.boxW,
      layout.boxH,
      'front',
      t,
      introP,
      masterAlpha,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    renderFloatingObjectsLayer(
      ctx,
      floatObjects,
      'front',
      t,
      introP,
      masterAlpha,
      variant,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    ctx.restore();
  };
}

export const renderPtsFloatGlass = makePointsFloatingRenderer('glass');

// ============================================================================
// 5. IMAGE MODE FLOATING STYLE (img_float_glass)
// ============================================================================

function makeImageFloatingMetadata(
  id: 'img_float_glass',
  variant: FloatingThemeVariant,
  nameAr: string,
  descriptionAr: string
): StyleMetadata {
  const pal = FLOATING_PALETTES[variant];
  return {
    id,
    mode: 'image',
    nameAr,
    nameEn: `Image ${pal.nameSuffixEn}`,
    descriptionAr,
    defaultAccent: pal.defaultAccent,
    defaultKeywordColor: pal.defaultKeyword,
    defaultQuoteFont: 'Readex Pro',
    defaultAuthorFont: 'Cairo',
    defaultEnglishQuoteFont: 'Plus Jakarta Sans',
    defaultEnglishAuthorFont: 'Plus Jakarta Sans',
    supportedBackgrounds: ['style', 'green', 'black'],
    recommendedBackground: 'green',
    defaultImageFit: 'cover' as ImageFitMode,
    allowedFonts: NON_MONO_ARABIC_FONTS,
    allowedEnglishFonts: MODERN_ENGLISH_FONTS,
  };
}

export const IMG_FLOAT_GLASS_CONFIG = makeImageFloatingMetadata(
  'img_float_glass',
  'glass',
  'إطار الهندسة الزجاجية',
  'بطاقة صورة زجاجية عائمة تحيط بها مدارات ضوئية وكرات ومكعبات كريستالية ثلاثية الأبعاد'
);

export function getImageFloatingEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const { baseWidth: W, baseHeight: H } = size;
  const { enter } = getEffectiveTimeline(
    timeline,
    content.quoteText,
    'image',
    0.35,
    getTypingConfigForCustomization(custom)
  );
  const resolved = resolveImageContentParams(content, custom, 'cover');
  const posBox = getImagePositionBox(
    custom.position || 'center',
    custom.format,
    W,
    H,
    custom.imageScale ?? 1.0
  );
  const font =
    custom.quoteFontOverride ||
    (resolved.direction === 'ltr' ? 'Plus Jakarta Sans' : 'Readex Pro');

  const fitted = fitImageSlotInBox(
    resolved.source,
    Math.max(120, posBox.boxWidth - 12),
    Math.max(110, posBox.boxHeight - 12)
  );

  let keywordTimes: number[] = [];
  if (resolved.hasCaption) {
    const layout = computeImageBottomCaptionLayout(
      ctx,
      fitted.photoW,
      fitted.photoH,
      resolved.caption,
      font,
      custom.fontSizeMultiplier || 1.0,
      resolved.direction
    );
    keywordTimes = computeImageCaptionKeywordTimes(layout, enter * 0.4);
  }

  return {
    enterStart: 0.04,
    keywordTimes,
    annotationTimes: keywordTimes,
  };
}

function makeImageFloatingRenderer(variant: FloatingThemeVariant): PureStyleRenderer {
  return (ctx, t, content, timeline, custom, size) => {
    const { baseWidth: W, baseHeight: H } = size;
    const bgMode = resolveBackgroundMode(custom);
    const isGreen = bgMode === 'green';
    const pal = FLOATING_PALETTES[variant];

    const { enter, exitStart, total } = getEffectiveTimeline(
      timeline,
      content.quoteText,
      'image',
      0.35,
      getTypingConfigForCustomization(custom)
    );
    const resolved = resolveImageContentParams(content, custom, 'cover');
    const posBox = getImagePositionBox(
      custom.position || 'center',
      custom.format,
      W,
      H,
      custom.imageScale ?? 1.0
    );

    const accent = custom.accentColor || pal.defaultAccent;
    const keywordColor = custom.keywordColor || pal.defaultKeyword;

    const enterP = progress(t, 0, enter);
    const exitP = easeInCubic(progress(t, exitStart, total));
    const enterBack = easeOutBack(enterP, 1.3);
    const masterAlpha = isGreen
      ? exitP > 0.85
        ? 0
        : 1
      : clamp(enterP * 1.4 * (1 - exitP), 0, 1);

    const fitted = fitImageSlotInBox(
      resolved.source,
      Math.max(120, posBox.boxWidth - 12),
      Math.max(110, posBox.boxHeight - 12)
    );
    const cardW = fitted.photoW;
    const cardH = fitted.photoH;
    const cardX = posBox.boxX + (posBox.boxWidth - cardW) * 0.5;
    const cardY = posBox.boxY + (posBox.boxHeight - cardH) * 0.5;

    const floatObjects = generateFloatingObjectsAroundBox(
      W,
      H,
      cardX,
      cardY,
      cardW,
      cardH,
      custom.seed
    );

    ctx.save();
    drawFloatingSceneBackdrop(ctx, W, H, t, variant, accent, keywordColor, bgMode, masterAlpha);

    if (masterAlpha <= 0.01) {
      ctx.restore();
      return;
    }

    drawOrbitalLightArcs(
      ctx,
      cardX,
      cardY,
      cardW,
      cardH,
      'back',
      t,
      clamp(enterP, 0, 1),
      masterAlpha,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    renderFloatingObjectsLayer(
      ctx,
      floatObjects,
      'back',
      t,
      clamp(enterP, 0, 1),
      masterAlpha,
      variant,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    const floatY = Math.sin(t * 2.3) * 7 * clamp(enterP, 0, 1);
    const slideY = lerp(38, 0, enterBack) + lerp(0, 26, exitP);
    const scale = lerp(0.84, 1.0, enterBack) * lerp(1.0, 0.88, exitP);

    const centerX = cardX + cardW * 0.5;
    const centerY = cardY + cardH * 0.5;

    ctx.save();
    ctx.translate(centerX, centerY + slideY + floatY);
    ctx.scale(scale, scale);
    ctx.globalAlpha = masterAlpha;

    const halfW = cardW * 0.5;
    const halfH = cardH * 0.5;
    const radius = clamp(Math.round(Math.min(cardW, cardH) * 0.055), 16, 30);

    drawLevitating3DCardSurface(
      ctx,
      -halfW,
      -halfH,
      cardW,
      cardH,
      radius,
      variant,
      accent,
      keywordColor,
      bgMode,
      t
    );

    // Clipped Image inside Levitating Frame (matched strictly to natural aspect ratio)
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-halfW + 3, -halfH + 3, cardW - 6, cardH - 6, Math.max(8, radius - 2));
    ctx.clip();

    const pushScale = computeImagePushInScale(t, total, custom.imagePushIn);
    drawFittedImage(
      ctx,
      resolved.source,
      resolved.crop,
      resolved.fitMode,
      -halfW,
      -halfH,
      cardW,
      cardH,
      pushScale
    );

    if (resolved.hasSourceLine) {
      const srcSize = clamp(Math.round(cardH * 0.032), 11, 16);
      applyStudioCanvasTextProps(ctx, 'Cairo', 600, srcSize, resolved.direction);
      const srcW = ctx.measureText(resolved.sourceLine).width;
      const badgeW = Math.min(cardW - 24, srcW + 24);
      const badgeH = srcSize + 12;
      const badgeX = halfW - badgeW - 14;
      const badgeY = -halfH + 14;

      ctx.fillStyle = 'rgba(7, 20, 46, 0.48)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH * 0.5);
      ctx.fill();

      ctx.fillStyle = pal.textPrimary;
      drawBidiWord(
        ctx,
        resolved.sourceLine,
        badgeX + badgeW - 12,
        badgeY + badgeH * 0.5 + srcSize * 0.34,
        resolved.direction
      );
    }

    // Soft translucent bottom caption overlay inside glass card
    const font =
      custom.quoteFontOverride ||
      (resolved.direction === 'ltr' ? 'Plus Jakarta Sans' : 'Readex Pro');
    drawImageBottomCaptionOverlay({
      ctx,
      photoX: -halfW + 3,
      photoY: -halfH + 3,
      photoW: cardW - 6,
      photoH: cardH - 6,
      caption: resolved.caption,
      hasCaption: resolved.hasCaption,
      hasSourceLine: false, // Source badge sits cleanly in top corner
      fontFamily: font,
      fontSizeMultiplier: custom.fontSizeMultiplier || 1.0,
      direction: resolved.direction,
      textColor: pal.textPrimary,
      keywordColor,
      keywordStyle: 'underline',
      accentLineColor: accent,
      scrimTheme: 'dark',
      isGreen,
      t,
      captionStartSec: enter * 0.3,
      revealAlpha: 1.0,
      seed: custom.seed,
    });

    ctx.restore();

    ctx.restore();

    drawOrbitalLightArcs(
      ctx,
      cardX,
      cardY,
      cardW,
      cardH,
      'front',
      t,
      clamp(enterP, 0, 1),
      masterAlpha,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    renderFloatingObjectsLayer(
      ctx,
      floatObjects,
      'front',
      t,
      clamp(enterP, 0, 1),
      masterAlpha,
      variant,
      accent,
      keywordColor,
      bgMode,
      custom.showFloatingObjects
    );

    ctx.restore();
  };
}

export const renderImgFloatGlass = makeImageFloatingRenderer('glass');
