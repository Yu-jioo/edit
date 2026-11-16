import {
  ArabicFontFamily,
  BackgroundMode,
  CalmStyleTheme,
  EnglishFontFamily,
  FlyerCreatureId,
  PointsMarkerType,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  StyleLightPalette,
  TimelineConfig,
} from '../types';
import { getOrGenerateCachedCanvas } from '../utils/assetCache';
import {
  clamp,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  getEffectiveTimeline,
  getPhrasePositionBox,
  hexToRgba,
  lerp,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
} from '../utils/math';
import { combineSeed, mulberry32 } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  ArabicQuoteLayout,
  drawBidiWord,
  layoutArabicQuote,
} from '../utils/textLayout';
import {
  buildAutoFitPointsLayout,
  drawPointTextWithWipeAndKeywords,
} from './points1Clean';

export interface FlyerCreatureMetadata {
  id: FlyerCreatureId;
  labelAr: string;
  labelEn: string;
  defaultAccent: string;
  defaultKeyword: string;
}

export const FLYER_CREATURES: readonly FlyerCreatureMetadata[] = [
  {
    id: 'orb',
    labelAr: 'كرة نورانية',
    labelEn: 'Luminous Orb',
    defaultAccent: '#6FA8FF',
    defaultKeyword: '#FDE047',
  },
  {
    id: 'butterfly',
    labelAr: 'فراشة',
    labelEn: 'Butterfly',
    defaultAccent: '#FF8FB8',
    defaultKeyword: '#FDE047',
  },
  {
    id: 'bat',
    labelAr: 'خفاش',
    labelEn: 'Night Bat',
    defaultAccent: '#B79CFF',
    defaultKeyword: '#FDE047',
  },
  {
    id: 'firefly',
    labelAr: 'يراعة',
    labelEn: 'Firefly',
    defaultAccent: '#FFC857',
    defaultKeyword: '#FFF3B0',
  },
] as const;

export const FLYER_DEFAULT_TINTS: Record<FlyerCreatureId, string> = {
  orb: '#6FA8FF',
  butterfly: '#FF8FB8',
  bat: '#B79CFF',
  firefly: '#FFC857',
};

export function resolveFlyerCreature(creature?: string | null): FlyerCreatureId {
  if (
    creature === 'orb' ||
    creature === 'butterfly' ||
    creature === 'bat' ||
    creature === 'firefly'
  ) {
    return creature;
  }
  return 'orb';
}

export function getFlyerCreatureMeta(creature?: string | null): FlyerCreatureMetadata {
  const id = resolveFlyerCreature(creature);
  return FLYER_CREATURES.find((c) => c.id === id) || FLYER_CREATURES[0];
}

export function isFlyerStyleId(styleId?: string | null): boolean {
  return styleId === 'phrase_flyer' || styleId === 'pts_flyer';
}

export function resolveFlyerTheme(custom: StyleCustomization): CalmStyleTheme {
  const t = custom.flyerTheme ?? custom.styleTheme;
  return t === 'light' ? 'light' : 'dark';
}

export const DEFAULT_FLYER_FLIGHT_SPEED = 0.55;

export function resolveFlyerFlightSpeed(custom?: Partial<StyleCustomization>): number {
  const raw = custom?.flyerFlightSpeed;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clamp(raw, 0.25, 1.25);
  }
  return DEFAULT_FLYER_FLIGHT_SPEED;
}

const NON_MONO_ARABIC_FONTS: ArabicFontFamily[] = [
  'Cairo',
  'Tajawal',
  'Readex Pro',
  'IBM Plex Sans Arabic',
  'Almarai',
  'Almarai Bold',
  'Almarai ExtraBold',
  'Changa',
  'El Messiri',
  'Reem Kufi',
  'Amiri',
  'Aref Ruqaa',
  'Aref Ruqaa Ink',
  'Noto Naskh Arabic',
  'Noto Kufi Arabic',
  'Lalezar',
  'Rakkas',
  'Katibeh',
  'KOMission Black',
  'Zain Rounded instance mob',
  '29LT Azahar Display AL TN Trial Bold',
];

const FLYER_ENGLISH_FONTS: EnglishFontFamily[] = [
  'Plus Jakarta Sans',
  'Outfit',
  'Manrope',
  'Playfair Display',
  'Cormorant Garamond',
  'Lora',
  'Cinzel',
  'Oswald',
];

export const FLYER_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  accent: '#FFC857',
  keyword: '#FFF3B0',
  surfaceBg: 'rgba(15, 23, 42, 0.72)',
  border: '#FFC857',
};

export const PHRASE_FLYER_CONFIG = {
  id: 'phrase_flyer' as const,
  mode: 'phrase' as const,
  nameAr: 'الكائن الطائر المضيء',
  nameEn: 'Luminous Flyer',
  descriptionAr:
    'كائن طائر مضيء (كرة نورانية / فراشة / خفاش / يراعة) يحلّق بانسيابية ليكشف الكلمات ويتوقف متوهجاً عند الكلمات المفتاحية',
  defaultAccent: '#6FA8FF',
  defaultKeywordColor: '#FDE047',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'black' as BackgroundMode,
  lightPalette: FLYER_LIGHT_PALETTE,
  allowedFonts: NON_MONO_ARABIC_FONTS,
  allowedEnglishFonts: FLYER_ENGLISH_FONTS,
};

export const PTS_FLYER_CONFIG = {
  id: 'pts_flyer' as const,
  mode: 'points' as const,
  nameAr: 'نقاط الكائن الطائر',
  nameEn: 'Flyer Points',
  descriptionAr:
    'كائن طائر مضيء (كرة نورانية / فراشة / خفاش / يراعة) يتنقل بين النقاط ليكشفها تباعاً مع أثر ضوئي متناسق',
  defaultAccent: '#6FA8FF',
  defaultKeywordColor: '#FDE047',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as EnglishFontFamily,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'black' as BackgroundMode,
  lightPalette: FLYER_LIGHT_PALETTE,
  allowedFonts: NON_MONO_ARABIC_FONTS,
  allowedEnglishFonts: FLYER_ENGLISH_FONTS,
  supportedMarkerTypes: [
    'arabic-indic',
    'western',
    'bullets',
    'checks',
    'none',
  ] as PointsMarkerType[],
  defaultMarkerType: 'arabic-indic' as PointsMarkerType,
};

// ============================================================================
// DETERMINISTIC GLOW RHYTHM FOR FIREFLY & CREATURES
// ============================================================================

/**
 * Computes the deterministic glow intensity (0.25 .. 1.65) for the firefly lantern.
 * - Slow breathing pulse at ~0.8 Hz
 * - Quick deterministic double-blink every 3..4 seconds (seeded)
 * - Boosted while hovering on a keyword
 */
export function computeFireflyGlowIntensity(
  t: number,
  seed: number,
  hoverBoost: number
): number {
  const slowPulse = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.8));

  // Deterministic cycle period between 3.15s and 3.85s based on seed
  const rng = mulberry32(combineSeed(seed, 0x51f15e));
  const cyclePeriod = 3.2 + rng() * 0.65;
  const phaseOffset = rng() * cyclePeriod;
  const localT = ((t + phaseOffset) % cyclePeriod + cyclePeriod) % cyclePeriod;

  // Double-blink window near 1.1s..1.42s in each cycle: two crisp peaks
  let blinkFactor = 1.0;
  const b1 = Math.exp(-Math.pow((localT - 1.12) / 0.042, 2));
  const b2 = Math.exp(-Math.pow((localT - 1.28) / 0.045, 2));
  const dip1 = Math.exp(-Math.pow((localT - 1.04) / 0.032, 2));
  const dip2 = Math.exp(-Math.pow((localT - 1.2) / 0.032, 2));
  blinkFactor = clamp(1.0 + 0.55 * (b1 + b2) - 0.52 * (dip1 + dip2), 0.35, 1.55);

  return clamp(slowPulse * blinkFactor + hoverBoost * 0.48, 0.3, 1.75);
}

// ============================================================================
// CACHED STATIC BODY SPRITES (60 FPS PERFORMANCE)
// ============================================================================

const SPRITE_SIZE = 160;
const SPRITE_HALF = SPRITE_SIZE / 2;

function getCachedCreatureBodySprite(
  creature: FlyerCreatureId,
  accentColor: string,
  bgMode: BackgroundMode,
  theme: CalmStyleTheme = 'dark'
): HTMLCanvasElement | OffscreenCanvas {
  const key = `flyer-body-sprite:v5:${creature}:${accentColor}:${bgMode}:${theme}`;
  return getOrGenerateCachedCanvas(key, SPRITE_SIZE, SPRITE_SIZE, (sCtx) => {
    sCtx.save();
    sCtx.translate(SPRITE_HALF, SPRITE_HALF);
    const isLightStyle = bgMode === 'style' && theme === 'light';

    if (creature === 'orb') {
      if (bgMode === 'green') {
        // Hard-edged crisp round white nectar core with airborne specks (zero star tips, zero blur)
        sCtx.fillStyle = '#FFFFFF';
        sCtx.strokeStyle = '#0F172A';
        sCtx.lineWidth = 1.6;
        sCtx.beginPath();
        sCtx.arc(0, 0, 14, 0, Math.PI * 2);
        sCtx.fill();
        sCtx.stroke();

        sCtx.strokeStyle = accentColor;
        sCtx.lineWidth = 1.8;
        sCtx.beginPath();
        sCtx.arc(0, 0, 10, 0, Math.PI * 2);
        sCtx.stroke();

        sCtx.fillStyle = '#FFFFFF';
        sCtx.beginPath();
        sCtx.arc(-4.2, -4.2, 3.2, 0, Math.PI * 2);
        sCtx.fill();

        // Crisp circular airborne nectar specks
        const greenDust = [
          { x: -20, y: -11, r: 2.3 },
          { x: 18, y: -14, r: 2.0 },
          { x: -23, y: 8, r: 1.9 },
          { x: 21, y: 10, r: 2.2 },
          { x: 4, y: -22, r: 1.8 },
          { x: -7, y: 21, r: 2.0 },
        ];
        for (let d = 0; d < greenDust.length; d++) {
          const pt = greenDust[d];
          sCtx.fillStyle = d % 3 === 0 ? accentColor : '#FFFFFF';
          sCtx.strokeStyle = '#0F172A';
          sCtx.lineWidth = 1.0;
          sCtx.beginPath();
          sCtx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
          sCtx.fill();
          sCtx.stroke();
        }
      } else {
        // Pure Round White Feathery Glowing Nectar Core ("نواة بيضاء ريشية متوهجة")
        // In Calm White ('light') theme, add a soft colored pastel cushion behind the white feathery puffs
        // so the pure white core and feathery contour stand out luminously over the snow-white background.
        if (isLightStyle) {
          const cushionGrad = sCtx.createRadialGradient(0, 0, 5, 0, 0, 28);
          cushionGrad.addColorStop(0, hexToRgba(accentColor, 0.44));
          cushionGrad.addColorStop(0.55, hexToRgba(accentColor, 0.22));
          cushionGrad.addColorStop(1, hexToRgba(accentColor, 0));
          sCtx.fillStyle = cushionGrad;
          sCtx.beginPath();
          sCtx.arc(0, 0, 28, 0, Math.PI * 2);
          sCtx.fill();
        }

        // 1) Outer soft feathery downy puffs forming an organic round cloud contour (zero star/petal tips)
        const puffCount = 12;
        for (let p = 0; p < puffCount; p++) {
          const ang = (p * Math.PI * 2) / puffCount;
          const ringR = p % 2 === 0 ? 8.2 : 11.4;
          const puffR = p % 2 === 0 ? 12.8 : 11.2;
          const px = Math.cos(ang) * ringR;
          const py = Math.sin(ang) * ringR;
          const puffGrad = sCtx.createRadialGradient(px, py, 0, px, py, puffR);
          puffGrad.addColorStop(0, isLightStyle ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.42)');
          puffGrad.addColorStop(
            0.55,
            isLightStyle ? hexToRgba(accentColor, 0.26) : 'rgba(255, 255, 255, 0.16)'
          );
          puffGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          sCtx.fillStyle = puffGrad;
          sCtx.beginPath();
          sCtx.arc(px, py, puffR, 0, Math.PI * 2);
          sCtx.fill();
        }

        // 2) Atmospheric accent veil cradling the pure white sphere
        const veilGrad = sCtx.createRadialGradient(0, 0, 4, 0, 0, 23);
        veilGrad.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
        veilGrad.addColorStop(0.45, isLightStyle ? 'rgba(255, 255, 255, 0.78)' : 'rgba(255, 255, 255, 0.45)');
        veilGrad.addColorStop(0.75, hexToRgba(accentColor, isLightStyle ? 0.42 : 0.24));
        veilGrad.addColorStop(1, hexToRgba(accentColor, 0));
        sCtx.fillStyle = veilGrad;
        sCtx.beginPath();
        sCtx.arc(0, 0, 23, 0, Math.PI * 2);
        sCtx.fill();

        // 3) Radiant pure-white feathered core sphere
        const coreGrad = sCtx.createRadialGradient(-2.2, -2.2, 1.2, 0, 0, 13.5);
        coreGrad.addColorStop(0, '#FFFFFF');
        coreGrad.addColorStop(0.6, '#FFFFFF');
        coreGrad.addColorStop(0.85, isLightStyle ? 'rgba(255, 255, 255, 0.88)' : 'rgba(248, 250, 252, 0.68)');
        coreGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        sCtx.fillStyle = coreGrad;
        sCtx.beginPath();
        sCtx.arc(0, 0, 13.5, 0, Math.PI * 2);
        sCtx.fill();

        // 4) Delicate curved feathery gossamer wisps around the spherical rim
        sCtx.strokeStyle = isLightStyle
          ? 'rgba(255, 255, 255, 0.85)'
          : 'rgba(255, 255, 255, 0.42)';
        sCtx.lineWidth = 1.05;
        sCtx.lineCap = 'round';
        for (let w = 0; w < 6; w++) {
          const ang = (w * Math.PI * 2) / 6 + 0.25;
          sCtx.save();
          sCtx.rotate(ang);
          sCtx.beginPath();
          sCtx.arc(0, 0, 14.2 + (w % 2) * 2.2, -0.34, 0.42);
          sCtx.stroke();
          sCtx.restore();
        }

        // 5) Fine soft downy nectar specks embedded around the outer mist
        for (let d = 0; d < 8; d++) {
          const ang = (d * Math.PI * 2) / 8 + 0.38;
          const dist = 16.5 + (d % 3) * 3.4;
          const dx = Math.cos(ang) * dist;
          const dy = Math.sin(ang) * dist;
          const dr = 1.1 + (d % 2) * 0.65;
          const speckGrad = sCtx.createRadialGradient(dx, dy, 0, dx, dy, dr * 2.6);
          speckGrad.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
          if (isLightStyle) {
            speckGrad.addColorStop(0.5, hexToRgba(accentColor, 0.52));
          }
          speckGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          sCtx.fillStyle = speckGrad;
          sCtx.beginPath();
          sCtx.arc(dx, dy, dr * 2.6, 0, Math.PI * 2);
          sCtx.fill();
        }
      }
    } else if (creature === 'butterfly') {
      // Polished Butterfly thorax, abdomen, head, antennae, and pearly body highlight
      const isGreen = bgMode === 'green';
      const isBlack = bgMode === 'black';
      const bodyDark = isBlack ? '#F3E8FF' : '#23192D';
      const bodyMid = isBlack ? '#FFFFFF' : '#3E2C4F';

      // Delicate antennae
      sCtx.strokeStyle = isGreen ? '#1E1B24' : isBlack ? '#FFFFFF' : hexToRgba(accentColor, 0.9);
      sCtx.lineWidth = 1.5;
      sCtx.lineCap = 'round';
      sCtx.beginPath();
      sCtx.moveTo(8, -4);
      sCtx.quadraticCurveTo(18, -15, 23, -12);
      sCtx.moveTo(8, -1);
      sCtx.quadraticCurveTo(19, -8, 24, -4);
      sCtx.stroke();

      // Antenna tips
      sCtx.fillStyle = isGreen ? accentColor : '#FFFFFF';
      sCtx.beginPath();
      sCtx.arc(23, -12, 1.8, 0, Math.PI * 2);
      sCtx.arc(24, -4, 1.8, 0, Math.PI * 2);
      sCtx.fill();

      // Abdomen + thorax
      sCtx.save();
      sCtx.rotate(-0.18);
      if (isGreen) {
        sCtx.fillStyle = '#2A1E35';
      } else {
        const bodyGrad = sCtx.createLinearGradient(-16, -4, 12, 4);
        bodyGrad.addColorStop(0, bodyDark);
        bodyGrad.addColorStop(0.5, bodyMid);
        bodyGrad.addColorStop(1, bodyDark);
        sCtx.fillStyle = bodyGrad;
      }
      sCtx.beginPath();
      sCtx.ellipse(-5, 2, 11, 3.2, 0, 0, Math.PI * 2);
      sCtx.fill();

      sCtx.beginPath();
      sCtx.ellipse(4, 0, 5.5, 3.8, 0, 0, Math.PI * 2);
      sCtx.fill();

      // Head
      sCtx.beginPath();
      sCtx.arc(10.5, -1, 3.2, 0, Math.PI * 2);
      sCtx.fill();

      // Pearly body highlight & rim light
      sCtx.strokeStyle = isGreen ? '#FFFFFF' : 'rgba(255, 255, 255, 0.85)';
      sCtx.lineWidth = 1.3;
      sCtx.beginPath();
      sCtx.moveTo(-13, 0.5);
      sCtx.quadraticCurveTo(-1, -2.2, 11, -2.2);
      sCtx.stroke();
      sCtx.restore();
    } else if (creature === 'bat') {
      // Polished Bat torso, ears, edge rim light, and softly glowing eyes
      const isGreen = bgMode === 'green';
      const isBlack = bgMode === 'black';
      const bodyFill = isBlack ? '#E2D9F3' : '#1E162B';
      const bodyShade = isBlack ? '#C4B5FD' : '#120D1B';

      // Pointed ears
      sCtx.fillStyle = isGreen ? '#231934' : bodyFill;
      sCtx.beginPath();
      sCtx.moveTo(4, -5);
      sCtx.lineTo(8, -16);
      sCtx.lineTo(11, -6);
      sCtx.closePath();
      sCtx.moveTo(9, -4);
      sCtx.lineTo(14, -14);
      sCtx.lineTo(15, -3);
      sCtx.closePath();
      sCtx.fill();

      // Inner ear shade
      sCtx.fillStyle = isGreen ? accentColor : hexToRgba(accentColor, 0.55);
      sCtx.beginPath();
      sCtx.moveTo(6, -6);
      sCtx.lineTo(8, -13);
      sCtx.lineTo(10, -6);
      sCtx.closePath();
      sCtx.fill();

      // Torso & head
      if (isGreen) {
        sCtx.fillStyle = '#1E162B';
      } else {
        const torsoGrad = sCtx.createLinearGradient(-12, -8, 12, 8);
        torsoGrad.addColorStop(0, bodyFill);
        torsoGrad.addColorStop(1, bodyShade);
        sCtx.fillStyle = torsoGrad;
      }
      sCtx.beginPath();
      sCtx.ellipse(-2, 2, 10.5, 5.8, -0.15, 0, Math.PI * 2);
      sCtx.fill();

      sCtx.beginPath();
      sCtx.arc(8.5, -2.5, 5.4, 0, Math.PI * 2);
      sCtx.fill();

      // Subtle edge rim light on lit top side
      sCtx.strokeStyle = isGreen ? '#FFFFFF' : 'rgba(255, 255, 255, 0.72)';
      sCtx.lineWidth = 1.25;
      sCtx.beginPath();
      sCtx.arc(8.5, -2.5, 5.2, -Math.PI * 0.85, -Math.PI * 0.1);
      sCtx.stroke();

      // Softly glowing eyes
      if (!isGreen) {
        const eyeGlow = sCtx.createRadialGradient(10.8, -3.2, 0.2, 10.8, -3.2, 4.5);
        eyeGlow.addColorStop(0, '#FFFFFF');
        eyeGlow.addColorStop(0.4, accentColor);
        eyeGlow.addColorStop(1, 'rgba(0,0,0,0)');
        sCtx.fillStyle = eyeGlow;
        sCtx.beginPath();
        sCtx.arc(10.8, -3.2, 4.5, 0, Math.PI * 2);
        sCtx.fill();
      }
      sCtx.fillStyle = '#FFFFFF';
      sCtx.beginPath();
      sCtx.arc(10.8, -3.2, 1.45, 0, Math.PI * 2);
      sCtx.fill();
    } else if (creature === 'firefly') {
      // FIREFLY ("يراعة") static body sprite: side-top view
      // - Slim dark-brown body (#2A1B12 in style mode; #E8D9B0 in black mode) with subtle highlight line
      // - Rounded head with two tiny antennae and a small dark eye
      // - Pale-orange pronotum plate (#F2A65A)
      const isGreen = bgMode === 'green';
      const isBlack = bgMode === 'black';
      const bodyPrimary = isBlack ? '#E8D9B0' : '#2C1B12';
      const bodySecondary = isBlack ? '#CBB682' : '#1A0F0A';
      const pronotumColor = isBlack ? '#FFD28A' : '#F2A65A';

      sCtx.save();
      sCtx.rotate(-0.12);

      // Two tiny antennae from rounded head
      sCtx.strokeStyle = isBlack ? '#FFF3D1' : isGreen ? '#2C1B12' : '#5C3D28';
      sCtx.lineWidth = 1.4;
      sCtx.lineCap = 'round';
      sCtx.beginPath();
      sCtx.moveTo(15, -3);
      sCtx.quadraticCurveTo(22, -10, 26, -8);
      sCtx.moveTo(16, -1);
      sCtx.quadraticCurveTo(23, -4, 27, -1.5);
      sCtx.stroke();

      // Antenna tiny tips
      sCtx.fillStyle = isBlack ? '#FFFFFF' : '#F2A65A';
      sCtx.beginPath();
      sCtx.arc(26, -8, 1.3, 0, Math.PI * 2);
      sCtx.arc(27, -1.5, 1.3, 0, Math.PI * 2);
      sCtx.fill();

      // Slim segmented abdomen body (side-top view)
      if (isGreen) {
        sCtx.fillStyle = bodyPrimary;
      } else {
        const abGrad = sCtx.createLinearGradient(-18, -6, 6, 7);
        abGrad.addColorStop(0, bodyPrimary);
        abGrad.addColorStop(0.6, bodySecondary);
        abGrad.addColorStop(1, bodyPrimary);
        sCtx.fillStyle = abGrad;
      }
      sCtx.beginPath();
      sCtx.ellipse(-5, 1.5, 13.5, 5.2, 0, 0, Math.PI * 2);
      sCtx.fill();

      if (isBlack) {
        sCtx.strokeStyle = '#FFF8E7';
        sCtx.lineWidth = 1.1;
        sCtx.stroke();
      }

      // Subtle abdominal segment lines
      sCtx.strokeStyle = isBlack
        ? 'rgba(92, 64, 35, 0.38)'
        : 'rgba(255, 235, 200, 0.16)';
      sCtx.lineWidth = 1;
      for (const segX of [-11, -6.5, -2]) {
        sCtx.beginPath();
        sCtx.moveTo(segX, -3.2);
        sCtx.quadraticCurveTo(segX - 1.2, 1.5, segX, 6.1);
        sCtx.stroke();
      }

      // Rounded head
      sCtx.fillStyle = isBlack ? '#DFC99B' : '#23140D';
      sCtx.beginPath();
      sCtx.arc(13.2, -0.8, 4.4, 0, Math.PI * 2);
      sCtx.fill();

      // Pale-orange pronotum plate shield over thorax
      if (isGreen) {
        sCtx.fillStyle = pronotumColor;
      } else {
        const proGrad = sCtx.createLinearGradient(3, -6, 12, 5);
        proGrad.addColorStop(0, '#FFE0B2');
        proGrad.addColorStop(0.45, pronotumColor);
        proGrad.addColorStop(1, '#C97A32');
        sCtx.fillStyle = proGrad;
      }
      sCtx.beginPath();
      sCtx.ellipse(7.5, -0.5, 5.6, 4.6, 0, 0, Math.PI * 2);
      sCtx.fill();

      // Subtle highlight line along the dorsal body & pronotum
      sCtx.strokeStyle = isGreen ? '#FFF8E7' : 'rgba(255, 248, 231, 0.78)';
      sCtx.lineWidth = 1.25;
      sCtx.beginPath();
      sCtx.moveTo(-12, -1.8);
      sCtx.quadraticCurveTo(0, -4.1, 12, -2.8);
      sCtx.stroke();

      // Small dark eye on the rounded head with tiny specular glint
      sCtx.fillStyle = '#120A06';
      sCtx.beginPath();
      sCtx.arc(15.2, -1.6, 1.65, 0, Math.PI * 2);
      sCtx.fill();

      sCtx.fillStyle = '#FFFFFF';
      sCtx.beginPath();
      sCtx.arc(15.6, -2.1, 0.65, 0, Math.PI * 2);
      sCtx.fill();

      sCtx.restore();
    }

    sCtx.restore();
  });
}

// ============================================================================
// STYLE BACKGROUNDS (WITH DEEP FOREST NIGHT FOR FIREFLY)
// ============================================================================

function traceCrescentMoonPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  r: number,
  innerFactor: number = 0.31
): void {
  const c = 0.55228475;
  const kx = r * innerFactor;
  ctx.beginPath();
  // Outer sunlit semicircle on the left side (-x)
  ctx.arc(0, 0, r, -Math.PI * 0.5, Math.PI * 0.5, true);
  // Smooth elliptical inner terminator returning from (0, +r) through (-kx, 0) to (0, -r)
  ctx.bezierCurveTo(-kx * c, r, -kx, r * c, -kx, 0);
  ctx.bezierCurveTo(-kx, -r * c, -kx * c, -r, 0, -r);
  ctx.closePath();
}

function drawMoonSoftGlow(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  moonX: number,
  moonY: number,
  moonR: number,
  accentColor: string,
  theme: CalmStyleTheme,
  t: number,
  bgPace: number = 0.72
): void {
  const isLight = theme === 'light';
  const primaryWave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.19 * bgPace);
  const secondaryWave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.11 * bgPace + 1.15);
  const glowLevel = primaryWave * 0.7 + secondaryWave * 0.3;

  // Offset slightly toward the sunlit crescent belly (matching -0.54 rad tilt)
  const litX = moonX - moonR * 0.18;
  const litY = moonY + moonR * 0.1;

  ctx.save();
  if (!isLight) {
    ctx.globalCompositeOperation = 'screen';
  }

  // 1. Wide atmospheric moonlight scattering veil that expands & dims gradually
  const wideR = moonR * (4.9 + 1.35 * glowLevel);
  const wideGrad = ctx.createRadialGradient(litX, litY, moonR * 0.25, moonX, moonY, wideR);
  if (isLight) {
    const a1 = 0.065 + 0.075 * glowLevel;
    const a2 = 0.028 + 0.036 * glowLevel;
    wideGrad.addColorStop(0, `rgba(199, 210, 254, ${a1.toFixed(3)})`);
    wideGrad.addColorStop(0.38, hexToRgba(accentColor, a2));
    wideGrad.addColorStop(0.72, `rgba(224, 231, 255, ${(a2 * 0.4).toFixed(3)})`);
    wideGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else {
    const a1 = 0.08 + 0.115 * glowLevel;
    const a2 = 0.04 + 0.065 * glowLevel;
    wideGrad.addColorStop(0, `rgba(226, 232, 240, ${a1.toFixed(3)})`);
    wideGrad.addColorStop(0.28, hexToRgba(accentColor, a2));
    wideGrad.addColorStop(0.62, hexToRgba(accentColor, a2 * 0.34));
    wideGrad.addColorStop(1, 'rgba(6, 5, 19, 0)');
  }
  ctx.fillStyle = wideGrad;
  ctx.beginPath();
  ctx.arc(moonX, moonY, wideR, 0, Math.PI * 2);
  ctx.fill();

  // 2. Mid silky lunar halation around the moon perimeter
  const midR = moonR * (2.45 + 0.55 * glowLevel);
  const midGrad = ctx.createRadialGradient(litX, litY, moonR * 0.1, litX, litY, midR);
  if (isLight) {
    const b1 = 0.16 + 0.18 * glowLevel;
    midGrad.addColorStop(0, `rgba(255, 255, 255, ${b1.toFixed(3)})`);
    midGrad.addColorStop(0.45, `rgba(199, 210, 254, ${(b1 * 0.42).toFixed(3)})`);
    midGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else {
    const b1 = 0.10 + 0.15 * glowLevel;
    midGrad.addColorStop(0, `rgba(255, 252, 242, ${b1.toFixed(3)})`);
    midGrad.addColorStop(0.38, `rgba(226, 232, 240, ${(b1 * 0.52).toFixed(3)})`);
    midGrad.addColorStop(0.75, hexToRgba(accentColor, b1 * 0.18));
    midGrad.addColorStop(1, 'rgba(16, 13, 40, 0)');
  }
  ctx.fillStyle = midGrad;
  ctx.beginPath();
  ctx.arc(litX, litY, midR, 0, Math.PI * 2);
  ctx.fill();

  // 3. Soft inner limb mist bloom hugging the sunlit curve for natural edge diffusion
  const coreR = moonR * (1.32 + 0.24 * secondaryWave);
  const coreX = moonX - moonR * 0.34;
  const coreY = moonY + moonR * 0.18;
  const coreGrad = ctx.createRadialGradient(coreX, coreY, moonR * 0.06, coreX, coreY, coreR);
  if (isLight) {
    const c1 = 0.14 + 0.14 * secondaryWave;
    coreGrad.addColorStop(0, `rgba(255, 255, 255, ${c1.toFixed(3)})`);
    coreGrad.addColorStop(0.6, `rgba(224, 231, 255, ${(c1 * 0.35).toFixed(3)})`);
    coreGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else {
    const c1 = 0.085 + 0.125 * secondaryWave;
    coreGrad.addColorStop(0, `rgba(255, 254, 248, ${c1.toFixed(3)})`);
    coreGrad.addColorStop(0.55, `rgba(226, 232, 240, ${(c1 * 0.38).toFixed(3)})`);
    coreGrad.addColorStop(1, 'rgba(6, 5, 19, 0)');
  }
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(coreX, coreY, coreR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPolishedCrescentMoon(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  moonX: number,
  moonY: number,
  moonR: number,
  accentColor: string,
  theme: CalmStyleTheme
): void {
  const isLight = theme === 'light';
  const tiltAngle = -0.54;

  // 1. Soft atmospheric ambient mist behind the moon
  const outerCoronaR = moonR * 3.9;
  const outerCorona = ctx.createRadialGradient(
    moonX - moonR * 0.22,
    moonY + moonR * 0.12,
    moonR * 0.2,
    moonX,
    moonY,
    outerCoronaR
  );
  if (isLight) {
    outerCorona.addColorStop(0, 'rgba(199, 210, 254, 0.24)');
    outerCorona.addColorStop(0.36, hexToRgba(accentColor, 0.10));
    outerCorona.addColorStop(0.75, 'rgba(224, 231, 255, 0.03)');
    outerCorona.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else {
    outerCorona.addColorStop(0, 'rgba(241, 245, 249, 0.15)');
    outerCorona.addColorStop(0.28, hexToRgba(accentColor, 0.11));
    outerCorona.addColorStop(0.65, hexToRgba(accentColor, 0.03));
    outerCorona.addColorStop(1, 'rgba(6, 5, 19, 0)');
  }
  ctx.fillStyle = outerCorona;
  ctx.beginPath();
  ctx.arc(moonX, moonY, outerCoronaR, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(moonX, moonY);
  ctx.rotate(tiltAngle);

  // 2. Feathered translucent earthshine ("ashen light") — fades softly past rim with ZERO hard circle outline
  const earthshine = ctx.createRadialGradient(-moonR * 0.22, 0, moonR * 0.08, 0, 0, moonR * 1.05);
  if (isLight) {
    earthshine.addColorStop(0, 'rgba(129, 140, 248, 0.048)');
    earthshine.addColorStop(0.68, 'rgba(165, 180, 252, 0.022)');
    earthshine.addColorStop(1, 'rgba(199, 210, 254, 0)');
  } else {
    earthshine.addColorStop(0, 'rgba(199, 210, 254, 0.055)');
    earthshine.addColorStop(0.68, 'rgba(148, 163, 184, 0.022)');
    earthshine.addColorStop(1, 'rgba(148, 163, 184, 0)');
  }
  ctx.fillStyle = earthshine;
  ctx.beginPath();
  ctx.arc(0, 0, moonR * 1.05, 0, Math.PI * 2);
  ctx.fill();

  // 3. Multi-shell feathered atmospheric edge halos (dissolves the crisp vector edge into soft moonlight)
  const featherShells: Array<[number, number, number, number]> = [
    // [radiusScale, innerFactor, featherStrokeWidthRatio, alpha]
    [1.08, 0.29, 0.13, 0.055],
    [1.045, 0.30, 0.085, 0.105],
    [1.022, 0.31, 0.052, 0.165],
    [1.006, 0.315, 0.028, 0.235],
  ];
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [rScale, innerF, strokeRatio, shellAlpha] of featherShells) {
    const shellGrad = ctx.createRadialGradient(
      -moonR * 0.48,
      0,
      moonR * 0.06,
      -moonR * 0.18,
      0,
      moonR * 1.24 * rScale
    );
    if (isLight) {
      shellGrad.addColorStop(0, `rgba(129, 140, 248, ${(shellAlpha * 0.72).toFixed(3)})`);
      shellGrad.addColorStop(0.6, hexToRgba(accentColor, shellAlpha * 0.52));
      shellGrad.addColorStop(1, 'rgba(224, 231, 255, 0)');
    } else {
      shellGrad.addColorStop(0, `rgba(255, 253, 246, ${shellAlpha.toFixed(3)})`);
      shellGrad.addColorStop(0.55, `rgba(226, 232, 240, ${(shellAlpha * 0.72).toFixed(3)})`);
      shellGrad.addColorStop(1, hexToRgba(accentColor, shellAlpha * 0.28));
    }
    traceCrescentMoonPath(ctx, moonR * rScale, innerF);
    ctx.fillStyle = shellGrad;
    ctx.fill();
    ctx.strokeStyle = isLight
      ? `rgba(199, 210, 254, ${(shellAlpha * 0.42).toFixed(3)})`
      : `rgba(241, 245, 249, ${(shellAlpha * 0.38).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.8, moonR * strokeRatio);
    ctx.stroke();
  }
  ctx.restore();

  // 4. Main soft-limb illuminated crescent body (bright inset core tapering smoothly toward the rim)
  const crescentGrad = ctx.createRadialGradient(
    -moonR * 0.54,
    -moonR * 0.04,
    moonR * 0.05,
    -moonR * 0.24,
    0,
    moonR * 1.12
  );
  if (isLight) {
    crescentGrad.addColorStop(0, 'rgba(129, 140, 248, 0.46)');
    crescentGrad.addColorStop(0.45, hexToRgba(accentColor, 0.34));
    crescentGrad.addColorStop(0.82, 'rgba(199, 210, 254, 0.20)');
    crescentGrad.addColorStop(1, 'rgba(224, 231, 255, 0.06)');
  } else {
    crescentGrad.addColorStop(0, 'rgba(255, 253, 246, 0.90)');
    crescentGrad.addColorStop(0.42, 'rgba(241, 245, 249, 0.78)');
    crescentGrad.addColorStop(0.78, 'rgba(216, 224, 246, 0.46)');
    crescentGrad.addColorStop(1, hexToRgba(accentColor, 0.16));
  }
  ctx.fillStyle = crescentGrad;
  traceCrescentMoonPath(ctx, moonR * 0.992, 0.32);
  ctx.fill();

  // 5. Clipped soft radial lunar maria, diffused crater basins, and wide multi-pass terminator dissolution
  ctx.save();
  traceCrescentMoonPath(ctx, moonR * 0.992, 0.32);
  ctx.clip();

  const mariaSpots: Array<[number, number, number, number]> = [
    [-moonR * 0.62, -moonR * 0.22, moonR * 0.24, 0.12],
    [-moonR * 0.68, moonR * 0.14, moonR * 0.27, 0.10],
    [-moonR * 0.50, moonR * 0.42, moonR * 0.18, 0.085],
  ];
  for (const [mx, my, mr, alpha] of mariaSpots) {
    const mGrad = ctx.createRadialGradient(mx, my, mr * 0.08, mx, my, mr);
    const col = isLight ? `rgba(79, 70, 229, ${(alpha * 0.72).toFixed(3)})` : `rgba(100, 116, 139, ${alpha.toFixed(3)})`;
    mGrad.addColorStop(0, col);
    mGrad.addColorStop(0.62, isLight ? `rgba(79, 70, 229, ${(alpha * 0.35).toFixed(3)})` : `rgba(100, 116, 139, ${(alpha * 0.45).toFixed(3)})`);
    mGrad.addColorStop(1, 'rgba(100, 116, 139, 0)');
    ctx.fillStyle = mGrad;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft diffused crater basins (no hard stroke rings)
  const craters: Array<[number, number, number]> = [
    [-moonR * 0.74, -moonR * 0.04, moonR * 0.07],
    [-moonR * 0.56, moonR * 0.28, moonR * 0.055],
    [-moonR * 0.54, -moonR * 0.40, moonR * 0.048],
  ];
  for (const [cx, cy, cr] of craters) {
    const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    cGrad.addColorStop(0, isLight ? 'rgba(99, 102, 241, 0.075)' : 'rgba(71, 85, 105, 0.11)');
    cGrad.addColorStop(0.7, isLight ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.08)');
    cGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Multi-pass soft gradient feather along the inner terminator so shadow wraps naturally around the sphere
  const c = 0.55228475;
  const kx = moonR * 0.32;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const terminatorPasses: Array<[number, number]> = [
    [0.34, 0.06],
    [0.22, 0.08],
    [0.13, 0.10],
    [0.06, 0.12],
  ];
  for (const [wRatio, tAlpha] of terminatorPasses) {
    ctx.strokeStyle = isLight
      ? `rgba(99, 102, 241, ${(tAlpha * 0.78).toFixed(3)})`
      : `rgba(20, 17, 54, ${tAlpha.toFixed(3)})`;
    ctx.lineWidth = moonR * wRatio;
    ctx.beginPath();
    ctx.moveTo(0, moonR);
    ctx.bezierCurveTo(-kx * c, moonR, -kx, moonR * c, -kx, 0);
    ctx.bezierCurveTo(-kx, -moonR * c, -kx * c, -moonR, 0, -moonR);
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

function getCachedFlyerStyleBackdrop(
  width: number,
  height: number,
  creature: FlyerCreatureId,
  accentColor: string,
  seed: number,
  theme: CalmStyleTheme = 'dark'
): HTMLCanvasElement | OffscreenCanvas {
  const key = `flyer-backdrop:v6:${width}x${height}:${creature}:${accentColor}:${seed}:${theme}`;
  return getOrGenerateCachedCanvas(key, width, height, (bCtx) => {
    const rng = mulberry32(combineSeed(seed, 0x77a11b));

    if (theme === 'light') {
      // Calm snow-white gradient tailored gently to each creature's habitat
      const bgGrad = bCtx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#FFFFFF');
      bgGrad.addColorStop(0.55, creature === 'butterfly' ? '#FDFCF9' : '#F8FAFC');
      bgGrad.addColorStop(
        1,
        creature === 'firefly'
          ? '#F0FDF4'
          : creature === 'bat'
            ? '#EEF2FF'
            : creature === 'butterfly'
              ? '#FDF2F8'
              : '#EFF6FF'
      );
      bCtx.fillStyle = bgGrad;
      bCtx.fillRect(0, 0, width, height);

      // Soft pastel radial halo from the chosen accent color
      const pastelHalo = bCtx.createRadialGradient(
        width * 0.5,
        height * 0.44,
        height * 0.04,
        width * 0.5,
        height * 0.44,
        Math.max(width, height) * 0.62
      );
      pastelHalo.addColorStop(0, hexToRgba(accentColor, 0.18));
      pastelHalo.addColorStop(0.52, hexToRgba(accentColor, 0.07));
      pastelHalo.addColorStop(1, 'rgba(255, 255, 255, 0)');
      bCtx.fillStyle = pastelHalo;
      bCtx.fillRect(0, 0, width, height);

      // Secondary habitat pastel aura
      const auraX = creature === 'bat' ? width * 0.22 : width * 0.26;
      const auraY = creature === 'bat' ? height * 0.22 : height * 0.72;
      const cornerAura = bCtx.createRadialGradient(
        auraX,
        auraY,
        height * 0.03,
        auraX,
        auraY,
        Math.max(width, height) * 0.48
      );
      cornerAura.addColorStop(
        0,
        creature === 'firefly'
          ? 'rgba(16, 185, 129, 0.09)'
          : creature === 'bat'
            ? 'rgba(129, 140, 248, 0.10)'
            : creature === 'butterfly'
              ? 'rgba(251, 191, 36, 0.08)'
              : 'rgba(56, 189, 248, 0.09)'
      );
      cornerAura.addColorStop(1, 'rgba(255, 255, 255, 0)');
      bCtx.fillStyle = cornerAura;
      bCtx.fillRect(0, 0, width, height);

      if (creature === 'firefly') {
        // Delicate pastel botanical reed silhouettes at the bottom
        const reedCount = Math.round(width / 28);
        bCtx.save();
        bCtx.lineCap = 'round';
        for (let i = 0; i < reedCount; i++) {
          const rx = (i / reedCount) * width + (rng() - 0.5) * 24;
          const reedH = height * (0.06 + rng() * 0.11);
          const lean = (rng() - 0.45) * 34;
          const alpha = 0.08 + rng() * 0.09;
          bCtx.strokeStyle = `rgba(15, 118, 110, ${alpha.toFixed(3)})`;
          bCtx.lineWidth = 1.5 + rng() * 1.8;
          bCtx.beginPath();
          bCtx.moveTo(rx, height + 4);
          bCtx.quadraticCurveTo(
            rx + lean * 0.45,
            height - reedH * 0.55,
            rx + lean,
            height - reedH
          );
          bCtx.stroke();
        }
        bCtx.restore();
      } else if (creature === 'bat') {
        // Soft morning twilight silhouettes & mist curve at bottom
        bCtx.save();
        bCtx.fillStyle = 'rgba(99, 102, 241, 0.045)';
        bCtx.beginPath();
        bCtx.moveTo(0, height);
        bCtx.quadraticCurveTo(width * 0.3, height * 0.91, width * 0.62, height * 0.94);
        bCtx.quadraticCurveTo(width * 0.85, height * 0.96, width, height * 0.9);
        bCtx.lineTo(width, height);
        bCtx.closePath();
        bCtx.fill();

        const moonX = width * 0.2;
        const moonY = height * 0.19;
        const moonR = Math.min(width, height) * 0.044;
        drawPolishedCrescentMoon(bCtx, moonX, moonY, moonR, accentColor, 'light');
        bCtx.restore();
      } else if (creature === 'butterfly') {
        // Delicate pastel garden stems and soft buds at bottom
        const stemCount = Math.round(width / 36);
        bCtx.save();
        bCtx.lineCap = 'round';
        for (let i = 0; i < stemCount; i++) {
          const sx = (i / stemCount) * width + (rng() - 0.5) * 26;
          const stemH = height * (0.055 + rng() * 0.095);
          const lean = (rng() - 0.5) * 36;
          const alpha = 0.08 + rng() * 0.08;
          bCtx.strokeStyle = hexToRgba(accentColor, alpha * 1.15);
          bCtx.lineWidth = 1.4 + rng() * 1.5;
          bCtx.beginPath();
          bCtx.moveTo(sx, height + 4);
          bCtx.quadraticCurveTo(
            sx + lean * 0.42,
            height - stemH * 0.55,
            sx + lean,
            height - stemH
          );
          bCtx.stroke();

          if (i % 3 === 0) {
            bCtx.fillStyle = hexToRgba(accentColor, alpha * 1.3);
            bCtx.beginPath();
            bCtx.ellipse(sx + lean, height - stemH, 3.2, 4.8, lean * 0.015, 0, Math.PI * 2);
            bCtx.fill();
          }
        }
        bCtx.restore();
      } else {
        // Serene soft pastel nebula washes & pearl motes
        for (let c = 0; c < 2; c++) {
          const nx = width * (0.28 + c * 0.46);
          const ny = height * (0.3 + c * 0.36);
          const neb = bCtx.createRadialGradient(nx, ny, height * 0.02, nx, ny, width * 0.42);
          neb.addColorStop(0, c === 0 ? 'rgba(186, 230, 253, 0.16)' : hexToRgba(accentColor, 0.12));
          neb.addColorStop(1, 'rgba(255, 255, 255, 0)');
          bCtx.fillStyle = neb;
          bCtx.fillRect(0, 0, width, height);
        }
        for (let i = 0; i < 24; i++) {
          const sx = rng() * width;
          const sy = rng() * height * 0.88;
          const sr = 1.2 + rng() * 2.4;
          bCtx.fillStyle = hexToRgba(accentColor, 0.07 + rng() * 0.11);
          bCtx.beginPath();
          bCtx.arc(sx, sy, sr, 0, Math.PI * 2);
          bCtx.fill();
        }
      }
      return;
    }

    if (creature === 'firefly') {
      // Deep forest night (#04110F to #0A1F1C)
      const bgGrad = bCtx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#04110F');
      bgGrad.addColorStop(0.58, '#071916');
      bgGrad.addColorStop(1, '#0A1F1C');
      bCtx.fillStyle = bgGrad;
      bCtx.fillRect(0, 0, width, height);

      // Light atmospheric forest mist layers
      for (let m = 0; m < 3; m++) {
        const my = height * (0.42 + m * 0.2);
        const mistGrad = bCtx.createRadialGradient(
          width * (0.28 + m * 0.22),
          my,
          height * 0.04,
          width * (0.28 + m * 0.22),
          my,
          width * 0.48
        );
        mistGrad.addColorStop(0, 'rgba(164, 224, 208, 0.055)');
        mistGrad.addColorStop(0.5, 'rgba(94, 176, 158, 0.025)');
        mistGrad.addColorStop(1, 'rgba(4, 17, 15, 0)');
        bCtx.fillStyle = mistGrad;
        bCtx.fillRect(0, 0, width, height);
      }

      // Faint grass/reed silhouettes at the bottom
      const reedCount = Math.round(width / 26);
      bCtx.save();
      bCtx.lineCap = 'round';
      for (let i = 0; i < reedCount; i++) {
        const rx = (i / reedCount) * width + (rng() - 0.5) * 24;
        const reedH = height * (0.065 + rng() * 0.13);
        const lean = (rng() - 0.45) * 38;
        const alpha = 0.22 + rng() * 0.28;
        bCtx.strokeStyle = `rgba(2, 10, 9, ${alpha.toFixed(3)})`;
        bCtx.lineWidth = 1.6 + rng() * 2.2;
        bCtx.beginPath();
        bCtx.moveTo(rx, height + 4);
        bCtx.quadraticCurveTo(
          rx + lean * 0.45,
          height - reedH * 0.55,
          rx + lean,
          height - reedH
        );
        bCtx.stroke();

        // Occasional cattail / reed seed head
        if (i % 5 === 0) {
          bCtx.fillStyle = `rgba(3, 12, 10, ${(alpha * 0.95).toFixed(3)})`;
          bCtx.save();
          bCtx.translate(rx + lean * 0.82, height - reedH * 0.82);
          bCtx.rotate(lean * 0.008);
          bCtx.beginPath();
          bCtx.ellipse(0, 0, 2.8, 11, 0, 0, Math.PI * 2);
          bCtx.fill();
          bCtx.restore();
        }
      }
      bCtx.restore();

      // Soft dark vignette
      const vig = bCtx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        Math.min(width, height) * 0.28,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(1, 6, 5, 0.62)');
      bCtx.fillStyle = vig;
      bCtx.fillRect(0, 0, width, height);
    } else if (creature === 'bat') {
      // Quiet Moonlit Dusk ("غسق قمري هادئ")
      const bgGrad = bCtx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#060513');
      bgGrad.addColorStop(0.56, '#100D28');
      bgGrad.addColorStop(1, '#1A1438');
      bCtx.fillStyle = bgGrad;
      bCtx.fillRect(0, 0, width, height);

      // Atmospheric moonlit corona & detailed crescent moon in upper corner
      const moonX = width * 0.2;
      const moonY = height * 0.19;
      const moonR = Math.min(width, height) * 0.045;

      const moonAmbient = bCtx.createRadialGradient(
        moonX,
        moonY,
        moonR * 0.4,
        moonX,
        moonY,
        Math.max(width, height) * 0.4
      );
      moonAmbient.addColorStop(0, 'rgba(226, 232, 240, 0.14)');
      moonAmbient.addColorStop(0.28, hexToRgba(accentColor, 0.11));
      moonAmbient.addColorStop(0.65, hexToRgba(accentColor, 0.03));
      moonAmbient.addColorStop(1, 'rgba(6, 5, 19, 0)');
      bCtx.fillStyle = moonAmbient;
      bCtx.fillRect(0, 0, width, height);

      drawPolishedCrescentMoon(bCtx, moonX, moonY, moonR, accentColor, 'dark');

      // Subtle twilight horizon mist layers
      for (let m = 0; m < 2; m++) {
        const my = height * (0.58 + m * 0.22);
        const mist = bCtx.createRadialGradient(
          width * (0.35 + m * 0.3),
          my,
          height * 0.03,
          width * (0.35 + m * 0.3),
          my,
          width * 0.52
        );
        mist.addColorStop(0, 'rgba(199, 210, 254, 0.045)');
        mist.addColorStop(1, 'rgba(10, 8, 27, 0)');
        bCtx.fillStyle = mist;
        bCtx.fillRect(0, 0, width, height);
      }

      // Faint distant dusk hill & slender twilight branch silhouettes at bottom
      bCtx.save();
      bCtx.fillStyle = 'rgba(4, 3, 14, 0.56)';
      bCtx.beginPath();
      bCtx.moveTo(0, height);
      bCtx.quadraticCurveTo(width * 0.28, height * 0.91, width * 0.56, height * 0.94);
      bCtx.quadraticCurveTo(width * 0.82, height * 0.97, width, height * 0.9);
      bCtx.lineTo(width, height);
      bCtx.closePath();
      bCtx.fill();

      const branchCount = Math.round(width / 56);
      bCtx.lineCap = 'round';
      for (let i = 0; i < branchCount; i++) {
        const bx = (i / branchCount) * width + (rng() - 0.5) * 32;
        const bh = height * (0.055 + rng() * 0.095);
        const lean = (rng() - 0.5) * 42;
        const alpha = 0.25 + rng() * 0.25;
        bCtx.strokeStyle = `rgba(4, 3, 13, ${alpha.toFixed(3)})`;
        bCtx.lineWidth = 1.4 + rng() * 1.6;
        bCtx.beginPath();
        bCtx.moveTo(bx, height + 3);
        bCtx.quadraticCurveTo(bx + lean * 0.45, height - bh * 0.52, bx + lean, height - bh);
        bCtx.stroke();
      }
      bCtx.restore();

      // Quiet twilight stars in upper sky
      for (let i = 0; i < 20; i++) {
        const sx = rng() * width;
        const sy = rng() * height * 0.72;
        const sr = 0.7 + rng() * 1.4;
        bCtx.fillStyle = `rgba(226, 232, 240, ${(0.1 + rng() * 0.22).toFixed(3)})`;
        bCtx.beginPath();
        bCtx.arc(sx, sy, sr, 0, Math.PI * 2);
        bCtx.fill();
      }

      // Soft nocturnal vignette
      const vig = bCtx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        Math.min(width, height) * 0.28,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(3, 2, 12, 0.58)');
      bCtx.fillStyle = vig;
      bCtx.fillRect(0, 0, width, height);
    } else if (creature === 'butterfly') {
      // Serene Garden of Light ("حديقة ضوء هادئة")
      const bgGrad = bCtx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#080A1A');
      bgGrad.addColorStop(0.55, '#121530');
      bgGrad.addColorStop(1, '#191B3A');
      bCtx.fillStyle = bgGrad;
      bCtx.fillRect(0, 0, width, height);

      // Soft enchanted garden warm-pastel light glow
      const gardenGlow = bCtx.createRadialGradient(
        width * 0.5,
        height * 0.46,
        height * 0.04,
        width * 0.5,
        height * 0.46,
        Math.max(width, height) * 0.62
      );
      gardenGlow.addColorStop(0, hexToRgba(accentColor, 0.14));
      gardenGlow.addColorStop(0.45, 'rgba(253, 224, 71, 0.04)');
      gardenGlow.addColorStop(1, 'rgba(8, 10, 26, 0)');
      bCtx.fillStyle = gardenGlow;
      bCtx.fillRect(0, 0, width, height);

      // Gentle meadow evening mist layers
      for (let m = 0; m < 2; m++) {
        const my = height * (0.56 + m * 0.2);
        const mist = bCtx.createRadialGradient(
          width * (0.28 + m * 0.44),
          my,
          height * 0.04,
          width * (0.28 + m * 0.44),
          my,
          width * 0.46
        );
        mist.addColorStop(0, hexToRgba(accentColor, 0.065));
        mist.addColorStop(0.6, 'rgba(167, 243, 208, 0.02)');
        mist.addColorStop(1, 'rgba(8, 10, 26, 0)');
        bCtx.fillStyle = mist;
        bCtx.fillRect(0, 0, width, height);
      }

      // Delicate arched botanical stems & leaf buds along the bottom edge
      const stemCount = Math.round(width / 32);
      bCtx.save();
      bCtx.lineCap = 'round';
      for (let i = 0; i < stemCount; i++) {
        const sx = (i / stemCount) * width + (rng() - 0.5) * 24;
        const stemH = height * (0.06 + rng() * 0.12);
        const lean = (rng() - 0.48) * 42;
        const alpha = 0.24 + rng() * 0.24;
        bCtx.strokeStyle = `rgba(6, 7, 20, ${alpha.toFixed(3)})`;
        bCtx.lineWidth = 1.5 + rng() * 1.8;
        bCtx.beginPath();
        bCtx.moveTo(sx, height + 4);
        bCtx.quadraticCurveTo(sx + lean * 0.42, height - stemH * 0.56, sx + lean, height - stemH);
        bCtx.stroke();

        // Soft leaf/flower bud silhouettes
        if (i % 3 === 0) {
          bCtx.fillStyle = `rgba(8, 9, 24, ${(alpha * 0.92).toFixed(3)})`;
          bCtx.save();
          bCtx.translate(sx + lean * 0.92, height - stemH * 0.92);
          bCtx.rotate(lean * 0.014);
          bCtx.beginPath();
          bCtx.ellipse(0, 0, 3.6, 7.2, 0, 0, Math.PI * 2);
          bCtx.fill();
          bCtx.restore();
        }
      }
      bCtx.restore();

      const vig = bCtx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        Math.min(width, height) * 0.28,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(4, 5, 16, 0.56)');
      bCtx.fillStyle = vig;
      bCtx.fillRect(0, 0, width, height);
    } else {
      // Serene Soft Nebula ("سديم هادئ ناعم") for Luminous Orb
      const bgGrad = bCtx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#040914');
      bgGrad.addColorStop(0.55, '#091328');
      bgGrad.addColorStop(1, '#0E1B36');
      bCtx.fillStyle = bgGrad;
      bCtx.fillRect(0, 0, width, height);

      // Multi-layered gentle cosmic nebula clouds
      const nebula1 = bCtx.createRadialGradient(
        width * 0.48,
        height * 0.42,
        height * 0.04,
        width * 0.48,
        height * 0.42,
        Math.max(width, height) * 0.62
      );
      nebula1.addColorStop(0, hexToRgba(accentColor, 0.14));
      nebula1.addColorStop(0.5, hexToRgba(accentColor, 0.045));
      nebula1.addColorStop(1, 'rgba(4, 9, 20, 0)');
      bCtx.fillStyle = nebula1;
      bCtx.fillRect(0, 0, width, height);

      const nebula2 = bCtx.createRadialGradient(
        width * 0.72,
        height * 0.68,
        height * 0.03,
        width * 0.72,
        height * 0.68,
        width * 0.45
      );
      nebula2.addColorStop(0, 'rgba(186, 230, 253, 0.075)');
      nebula2.addColorStop(0.55, hexToRgba(accentColor, 0.035));
      nebula2.addColorStop(1, 'rgba(4, 9, 20, 0)');
      bCtx.fillStyle = nebula2;
      bCtx.fillRect(0, 0, width, height);

      // Quiet scattered starlight dots
      for (let i = 0; i < 28; i++) {
        const sx = rng() * width;
        const sy = rng() * height * 0.88;
        const sr = 0.7 + rng() * 1.6;
        bCtx.fillStyle = `rgba(248, 250, 252, ${(0.11 + rng() * 0.25).toFixed(3)})`;
        bCtx.beginPath();
        bCtx.arc(sx, sy, sr, 0, Math.PI * 2);
        bCtx.fill();
      }

      const vig = bCtx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        Math.min(width, height) * 0.28,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(2, 5, 14, 0.58)');
      bCtx.fillStyle = vig;
      bCtx.fillRect(0, 0, width, height);
    }
  });
}

function drawStyleBackdropAndBokeh(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  creature: FlyerCreatureId,
  accentColor: string,
  bgMode: BackgroundMode,
  seed: number,
  t: number,
  theme: CalmStyleTheme = 'dark',
  flightSpeed: number = DEFAULT_FLYER_FLIGHT_SPEED
): void {
  if (bgMode === 'green') {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (bgMode === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const cached = getCachedFlyerStyleBackdrop(width, height, creature, accentColor, seed, theme);
  ctx.drawImage(cached, 0, 0, width, height);

  const bgPace = clamp(0.62 + (flightSpeed - 0.55) * 0.35, 0.45, 1.05);
  const rng = mulberry32(combineSeed(seed, 0x9931a4));

  if (theme === 'light') {
    if (creature === 'bat') {
      drawMoonSoftGlow(
        ctx,
        width * 0.2,
        height * 0.19,
        Math.min(width, height) * 0.044,
        accentColor,
        'light',
        t,
        bgPace
      );
    }

    // Gentle drifting pastel bokeh circles tailored per creature on the calm white background
    const bokehCount = creature === 'butterfly' ? 11 : 10;
    ctx.save();
    for (let i = 0; i < bokehCount; i++) {
      const bx = (0.08 + rng() * 0.84) * width + Math.sin(t * 0.34 * bgPace + i * 1.7) * 14;
      const by = (0.14 + rng() * 0.72) * height + Math.cos(t * 0.28 * bgPace + i * 2.1) * 10;
      const radius = 11 + rng() * 21;
      const freq = (0.4 + rng() * 0.32) * bgPace;
      const phase = rng() * Math.PI * 2;
      const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq + phase);
      const alpha = 0.05 + 0.12 * pulse;

      const bokehColor =
        creature === 'butterfly' && i % 3 === 0
          ? '#F59E0B'
          : creature === 'bat' && i % 3 === 0
            ? '#818CF8'
            : accentColor;
      const bokehGrad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
      bokehGrad.addColorStop(0, hexToRgba(bokehColor, alpha));
      bokehGrad.addColorStop(0.55, hexToRgba(bokehColor, alpha * 0.45));
      bokehGrad.addColorStop(1, hexToRgba(bokehColor, 0));
      ctx.fillStyle = bokehGrad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (creature === 'firefly') {
    // Distant seeded blinking fireflies as soft bokeh in forest night
    const bokehCount = 11;
    ctx.save();
    for (let i = 0; i < bokehCount; i++) {
      const bx = (0.08 + rng() * 0.84) * width + Math.sin(t * 0.45 * bgPace + i * 1.7) * 14;
      const by = (0.14 + rng() * 0.72) * height + Math.cos(t * 0.38 * bgPace + i * 2.1) * 10;
      const radius = 8 + rng() * 18;
      const freq = (0.52 + rng() * 0.42) * bgPace;
      const phase = rng() * Math.PI * 2;
      const blink = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq + phase), 2.2);
      const alpha = 0.06 + 0.26 * blink;

      const bokehGrad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
      bokehGrad.addColorStop(0, hexToRgba('#FFF8D6', alpha * 0.95));
      bokehGrad.addColorStop(0.4, hexToRgba(accentColor, alpha * 0.65));
      bokehGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = bokehGrad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (creature === 'bat') {
    // Quiet Moonlit Dusk ("غسق قمري هادئ"): gradual multi-layer soft lunar glow + drifting twilight bokeh & faint twinkling stars
    ctx.save();
    const moonX = width * 0.2;
    const moonY = height * 0.19;
    const moonR = Math.min(width, height) * 0.045;
    drawMoonSoftGlow(ctx, moonX, moonY, moonR, accentColor, 'dark', t, bgPace);

    // Gentle twinkling high-sky stars
    for (let s = 0; s < 6; s++) {
      const sx = (0.1 + rng() * 0.8) * width;
      const sy = (0.08 + rng() * 0.44) * height;
      const sr = 1.6 + rng() * 1.4;
      const ph = rng() * Math.PI * 2;
      const tw = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * (0.32 + rng() * 0.22) * bgPace + ph), 2.4);
      const sGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.8);
      sGrad.addColorStop(0, `rgba(241, 245, 249, ${(0.18 + 0.42 * tw).toFixed(3)})`);
      sGrad.addColorStop(1, 'rgba(241, 245, 249, 0)');
      ctx.fillStyle = sGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, sr * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Drifting soft moonlight & twilight mist bokeh orbs
    const bokehCount = 10;
    for (let i = 0; i < bokehCount; i++) {
      const bx = (0.08 + rng() * 0.84) * width + Math.sin(t * 0.32 * bgPace + i * 1.85) * 16;
      const by = (0.16 + rng() * 0.7) * height + Math.cos(t * 0.26 * bgPace + i * 2.15) * 11;
      const radius = 9 + rng() * 18;
      const freq = (0.38 + rng() * 0.34) * bgPace;
      const phase = rng() * Math.PI * 2;
      const blink = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq + phase), 2.0);
      const alpha = 0.045 + 0.17 * blink;

      const bokehGrad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
      bokehGrad.addColorStop(0, `rgba(226, 232, 240, ${(alpha * 0.92).toFixed(3)})`);
      bokehGrad.addColorStop(0.45, hexToRgba(accentColor, alpha * 0.62));
      bokehGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = bokehGrad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (creature === 'butterfly') {
    // Serene Garden of Light ("حديقة ضوء هادئة"): slow floating golden pollen & soft petal-light bokeh
    ctx.save();
    const bokehCount = 12;
    for (let i = 0; i < bokehCount; i++) {
      const baseX = (0.07 + rng() * 0.86) * width;
      const baseY = (0.15 + rng() * 0.72) * height;
      const bx = baseX + Math.sin(t * 0.38 * bgPace + i * 1.65) * 16;
      const by = baseY + Math.cos(t * 0.31 * bgPace + i * 1.95) * 12;
      const radius = 8 + rng() * 17;
      const freq = (0.42 + rng() * 0.38) * bgPace;
      const phase = rng() * Math.PI * 2;
      const blink = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq + phase), 2.1);
      const alpha = 0.055 + 0.22 * blink;
      const isWarmPollen = i % 3 === 0;

      const bokehGrad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
      bokehGrad.addColorStop(0, hexToRgba(isWarmPollen ? '#FFFBEB' : '#FFF5F8', alpha * 0.95));
      bokehGrad.addColorStop(0.42, hexToRgba(isWarmPollen ? '#FDE68A' : accentColor, alpha * 0.68));
      bokehGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = bokehGrad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else {
    // Serene Soft Nebula ("سديم هادئ ناعم") for Luminous Orb: breathing nebula wisp + drifting stardust bokeh
    ctx.save();
    const nebPulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.18 * bgPace);
    const nebX = width * 0.52 + Math.sin(t * 0.22 * bgPace) * 18;
    const nebY = height * 0.44 + Math.cos(t * 0.19 * bgPace) * 12;
    const nebR = Math.max(width, height) * 0.36;
    const nebGlow = ctx.createRadialGradient(nebX, nebY, nebR * 0.08, nebX, nebY, nebR);
    nebGlow.addColorStop(0, hexToRgba(accentColor, 0.04 + 0.035 * nebPulse));
    nebGlow.addColorStop(0.55, 'rgba(186, 230, 253, 0.025)');
    nebGlow.addColorStop(1, 'rgba(4, 9, 20, 0)');
    ctx.fillStyle = nebGlow;
    ctx.beginPath();
    ctx.arc(nebX, nebY, nebR, 0, Math.PI * 2);
    ctx.fill();

    // Softly breathing distant starlight motes
    for (let s = 0; s < 6; s++) {
      const sx = (0.09 + rng() * 0.82) * width;
      const sy = (0.1 + rng() * 0.68) * height;
      const sr = 1.5 + rng() * 1.6;
      const ph = rng() * Math.PI * 2;
      const tw = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * (0.36 + rng() * 0.25) * bgPace + ph), 2.3);
      const sGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 3.0);
      sGrad.addColorStop(0, `rgba(255, 255, 255, ${(0.18 + 0.45 * tw).toFixed(3)})`);
      sGrad.addColorStop(0.5, hexToRgba(accentColor, 0.16 * tw));
      sGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, sr * 3.0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Drifting feathery stardust / nectar bokeh orbs
    const bokehCount = 11;
    for (let i = 0; i < bokehCount; i++) {
      const bx = (0.08 + rng() * 0.84) * width + Math.sin(t * 0.36 * bgPace + i * 1.72) * 15;
      const by = (0.14 + rng() * 0.72) * height + Math.cos(t * 0.31 * bgPace + i * 2.08) * 11;
      const radius = 8.5 + rng() * 17.5;
      const freq = (0.4 + rng() * 0.36) * bgPace;
      const phase = rng() * Math.PI * 2;
      const blink = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq + phase), 2.0);
      const alpha = 0.055 + 0.21 * blink;

      const bokehGrad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
      bokehGrad.addColorStop(0, `rgba(255, 255, 255, ${(alpha * 0.96).toFixed(3)})`);
      bokehGrad.addColorStop(0.4, hexToRgba(i % 2 === 0 ? accentColor : '#BAE6FD', alpha * 0.65));
      bokehGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = bokehGrad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ============================================================================
// CREATURE RENDERING (ALL 4 POLISHED CREATURES + LIVE PREVIEW THUMBNAIL)
// ============================================================================

export interface DrawCreatureParams {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  creature: FlyerCreatureId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speedNorm: number; // 0 when hovering/stopped, 1 when flying at cruise speed
  hoverBoost: number; // 0..1 boost when passing/hovering near a keyword
  t: number;
  scale: number;
  accentColor: string;
  bgMode: BackgroundMode;
  seed: number;
  theme?: CalmStyleTheme;
  flightSpeed?: number;
}

export function drawFlyerCreature(params: DrawCreatureParams): void {
  const {
    ctx,
    creature,
    x,
    y,
    vx,
    vy,
    speedNorm,
    hoverBoost,
    t,
    scale,
    accentColor,
    bgMode,
    seed,
    theme = 'dark',
    flightSpeed = DEFAULT_FLYER_FLIGHT_SPEED,
  } = params;

  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';
  const isLight = bgMode === 'style' && theme === 'light';
  const paceMul = clamp(flightSpeed / 0.55, 0.45, 1.65);

  // Serene weightless vertical bob (+-4.2 px @ 0.42 Hz), smooth turn banking & gentle horizontal flip without sudden snap
  const bobOffset = Math.sin(t * Math.PI * 2 * 0.42 * paceMul) * 4.2 * scale;
  const maxBankRad = (5.2 * Math.PI) / 180;
  const turnBlend = clamp(Math.abs(vx) / 34, 0, 1);
  const smoothTurn = easeInOutCubic(turnBlend);
  const rawBank = (vy / 580) * maxBankRad + (Math.abs(vx) / 960) * maxBankRad * 0.25;
  const bankAngle = clamp(rawBank * smoothTurn, -maxBankRad, maxBankRad);
  const facingLeft = vx < 0;
  const turnScaleX = creature === 'orb' ? 1 : lerp(0.56, 1.0, smoothTurn);

  ctx.save();
  ctx.translate(x, y + bobOffset);
  ctx.scale((facingLeft ? -1 : 1) * turnScaleX, 1);
  ctx.rotate(bankAngle);
  ctx.scale(scale, scale);

  if (creature === 'orb') {
    if (isGreen) {
      // Crisp hard-edged round white nectar sprite without blur
      const sprite = getCachedCreatureBodySprite('orb', accentColor, bgMode, theme);
      ctx.drawImage(sprite, -SPRITE_HALF, -SPRITE_HALF);

      // Deterministic crisp airborne nectar particles
      for (let m = 0; m < 6; m++) {
        const ang = t * (0.36 + m * 0.08) * paceMul + m * ((Math.PI * 2) / 6);
        const orbitR = 23 + 3.5 * Math.sin(t * 0.95 * paceMul + m * 1.9);
        const mx = Math.cos(ang) * orbitR - 4;
        const my = Math.sin(ang) * orbitR * 0.78;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(mx, my, 1.8 + (m % 2) * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      const pulse = 1 + 0.07 * Math.sin(t * 1.85 * paceMul) + hoverBoost * 0.18;
      const haloR = (isLight ? 50 : 46) * pulse;
      const haloGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, haloR);
      if (isLight) {
        // Soft colored pastel halo surrounding the pure white feathery core so it pops against the snow-white backdrop
        haloGrad.addColorStop(0, '#FFFFFF');
        haloGrad.addColorStop(0.24, 'rgba(255, 255, 255, 0.92)');
        haloGrad.addColorStop(0.45, hexToRgba(accentColor, 0.44 + hoverBoost * 0.22));
        haloGrad.addColorStop(0.75, hexToRgba(accentColor, 0.18));
        haloGrad.addColorStop(1, hexToRgba(accentColor, 0));
      } else {
        haloGrad.addColorStop(0, 'rgba(255, 255, 255, 0.94)');
        haloGrad.addColorStop(0.28, 'rgba(255, 255, 255, 0.56)');
        haloGrad.addColorStop(0.56, hexToRgba(accentColor, 0.24 + hoverBoost * 0.18));
        haloGrad.addColorStop(0.84, 'rgba(255, 255, 255, 0.07)');
        haloGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      }
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(0, 0, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Slow serene rotation of the pure round feathery white core
      ctx.save();
      ctx.rotate(t * 0.16 * paceMul);
      const sprite = getCachedCreatureBodySprite('orb', accentColor, bgMode, theme);
      ctx.drawImage(sprite, -SPRITE_HALF, -SPRITE_HALF);
      ctx.restore();

      // 9 drifting airborne white nectar particles floating & trailing softly around the core
      const driftBack = -clamp(Math.hypot(vx, vy) / 260, 0.12, 0.85) * 9;
      for (let m = 0; m < 9; m++) {
        const phase = (seed % 97) * 0.13 + m * 1.618;
        const orbitAng =
          t * (0.28 + (m % 3) * 0.09) * paceMul +
          m * ((Math.PI * 2) / 9) +
          Math.sin(t * 0.65 * paceMul + phase) * 0.25;
        const orbitR = 20 + (m % 3) * 6.5 + 4.2 * Math.sin(t * 1.05 * paceMul + phase);
        const mx = Math.cos(orbitAng) * orbitR + driftBack * (0.4 + (m % 3) * 0.32);
        const my = Math.sin(orbitAng) * orbitR * 0.8 + Math.cos(t * 0.9 * paceMul + phase) * 3.2;
        const twinkle = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.1 * paceMul + phase));
        const rMote = 1.35 + (m % 3) * 0.45 + hoverBoost * 0.45;
        const moteGrad = ctx.createRadialGradient(mx, my, 0, mx, my, rMote * (isLight ? 3.0 : 2.6));
        moteGrad.addColorStop(0, `rgba(255, 255, 255, ${twinkle.toFixed(3)})`);
        moteGrad.addColorStop(
          0.48,
          hexToRgba(accentColor, twinkle * (isLight ? 0.65 : 0.35))
        );
        moteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = moteGrad;
        ctx.beginPath();
        ctx.arc(mx, my, rMote * (isLight ? 3.0 : 2.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (creature === 'butterfly') {
    const flapFreq = lerp(0.92, 1.82, speedNorm) * paceMul;
    const flap = Math.sin(t * Math.PI * 2 * flapFreq);
    const wingScaleY = 0.36 + 0.64 * Math.abs(flap);

    if (!isGreen) {
      const aura = ctx.createRadialGradient(0, 0, 3, 0, 0, 38 + hoverBoost * 10);
      aura.addColorStop(0, hexToRgba(accentColor, 0.38 + hoverBoost * 0.25));
      aura.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, 38 + hoverBoost * 10, 0, Math.PI * 2);
      ctx.fill();
    }

    const drawButterflyWingPair = (wingElevation: number, alphaMul: number) => {
      ctx.save();
      ctx.globalAlpha *= alphaMul;
      ctx.scale(1, wingElevation);

      // Forewing & hindwing paths
      if (isGreen) {
        ctx.fillStyle = accentColor;
      } else {
        const wingGrad = ctx.createLinearGradient(-22, -28, 16, 12);
        wingGrad.addColorStop(0, '#FFFFFF');
        wingGrad.addColorStop(0.28, accentColor);
        wingGrad.addColorStop(0.72, hexToRgba(accentColor, 0.82));
        wingGrad.addColorStop(1, isBlack ? '#FDE047' : '#4C1D95');
        ctx.fillStyle = wingGrad;
      }

      // Forewing
      ctx.beginPath();
      ctx.moveTo(2, -2);
      ctx.bezierCurveTo(16, -28, -14, -34, -22, -14);
      ctx.bezierCurveTo(-24, -4, -10, -1, 2, -2);
      ctx.closePath();
      ctx.fill();

      // Shimmering wing scale band
      if (!isGreen) {
        const bandGrad = ctx.createRadialGradient(-8, -16, 2, -8, -16, 18);
        bandGrad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
        bandGrad.addColorStop(0.6, hexToRgba('#FFF3B0', 0.25));
        bandGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = bandGrad;
        ctx.fill();
      }

      // Hindwing
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-14, -6, -26, 8, -15, 20);
      ctx.bezierCurveTo(-6, 25, 2, 12, 0, 0);
      ctx.closePath();
      ctx.fill();

      // Clear vein hierarchy (primary + secondary veins)
      ctx.strokeStyle = isGreen
        ? '#1E1B24'
        : isBlack
        ? 'rgba(255, 255, 255, 0.85)'
        : 'rgba(255, 255, 255, 0.62)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(1, -2);
      ctx.quadraticCurveTo(-8, -16, -18, -18);
      ctx.moveTo(-6, -12);
      ctx.lineTo(-4, -24);
      ctx.moveTo(-10, -14);
      ctx.lineTo(-14, -25);
      ctx.moveTo(-1, 1);
      ctx.quadraticCurveTo(-10, 10, -14, 17);
      ctx.stroke();

      // Soft rim light on outer wing edge
      ctx.strokeStyle = isGreen ? '#FFFFFF' : 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(2, -2);
      ctx.bezierCurveTo(16, -28, -14, -34, -22, -14);
      ctx.stroke();

      // Seeded tiny wing-edge sparkles
      const spRng = mulberry32(combineSeed(seed, 0x44b1));
      ctx.fillStyle = '#FFFFFF';
      for (let s = 0; s < 4; s++) {
        const spAngle = s * 1.4 + spRng() * 2;
        const twinkle = isGreen
          ? 1
          : 0.45 + 0.55 * Math.sin(t * 7 + spAngle);
        ctx.globalAlpha = alphaMul * twinkle;
        const sx = lerp(-19, -4, s / 3);
        const sy = lerp(-15, -24, s / 3);
        ctx.beginPath();
        ctx.arc(sx, sy, 1.45, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    // Far wing + near wing with subtle depth offset
    drawButterflyWingPair(wingScaleY * 0.78, isGreen ? 1 : 0.72);
    const sprite = getCachedCreatureBodySprite('butterfly', accentColor, bgMode);
    ctx.drawImage(sprite, -SPRITE_HALF, -SPRITE_HALF);
    drawButterflyWingPair(wingScaleY, 1);
  } else if (creature === 'bat') {
    const flapFreq = lerp(0.98, 1.88, speedNorm) * paceMul;
    const flapPhase = Math.sin(t * Math.PI * 2 * flapFreq);
    const wingLift = flapPhase * 12;
    const wingFold = lerp(0.8, 1.0, speedNorm);

    if (!isGreen) {
      const aura = ctx.createRadialGradient(0, 0, 3, 0, 0, 36 + hoverBoost * 10);
      aura.addColorStop(0, hexToRgba(accentColor, 0.34 + hoverBoost * 0.24));
      aura.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, 36 + hoverBoost * 10, 0, Math.PI * 2);
      ctx.fill();
    }

    const drawBatWing = (side: -1 | 1) => {
      ctx.save();
      ctx.scale(1, side === -1 ? 0.82 : 1);
      const tipX = -24 * wingFold;
      const tipY = (-16 + wingLift) * (side === -1 ? 0.75 : 1);
      const midX = -11 * wingFold;
      const midY = (-20 + wingLift * 0.75);

      if (isGreen) {
        ctx.fillStyle = '#2B1F42';
      } else {
        const memGrad = ctx.createLinearGradient(0, -18, -24, 14);
        memGrad.addColorStop(0, isBlack ? hexToRgba(accentColor, 0.92) : hexToRgba(accentColor, 0.72));
        memGrad.addColorStop(0.55, isBlack ? '#C4B5FD' : '#2E1F47');
        memGrad.addColorStop(1, isBlack ? '#EDE9FE' : '#140D21');
        ctx.fillStyle = memGrad;
      }

      ctx.beginPath();
      ctx.moveTo(3, -2);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.quadraticCurveTo(-20 * wingFold, 4, -15 * wingFold, 11);
      ctx.quadraticCurveTo(-9 * wingFold, 5, -7 * wingFold, 12);
      ctx.quadraticCurveTo(-3 * wingFold, 6, -2, 5);
      ctx.closePath();
      ctx.fill();

      // Finer membrane finger-bone ribs
      ctx.strokeStyle = isGreen
        ? accentColor
        : isBlack
        ? '#FFFFFF'
        : hexToRgba('#FFFFFF', 0.55);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(3, -2);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.moveTo(midX, midY * 0.65);
      ctx.lineTo(-15 * wingFold, 11);
      ctx.moveTo(midX * 0.65, midY * 0.45);
      ctx.lineTo(-7 * wingFold, 12);
      ctx.stroke();

      ctx.restore();
    };

    drawBatWing(-1);
    const sprite = getCachedCreatureBodySprite('bat', accentColor, bgMode);
    ctx.drawImage(sprite, -SPRITE_HALF, -SPRITE_HALF);
    drawBatWing(1);
  } else {
    // ========================================================================
    // A) FIREFLY ("يراعة")
    // ========================================================================
    const glowIntensity = computeFireflyGlowIntensity(t, seed, hoverBoost);
    const lanternX = -15.5;
    const lanternY = 3.2;

    // 1. Wide soft lantern halo behind body (omitted in GREEN mode)
    if (!isGreen) {
      const outerHaloR = (38 + hoverBoost * 14) * (0.82 + 0.22 * glowIntensity);
      const haloGrad = ctx.createRadialGradient(
        lanternX,
        lanternY,
        1.5,
        lanternX,
        lanternY,
        outerHaloR
      );
      haloGrad.addColorStop(0, '#FFFFFF');
      haloGrad.addColorStop(0.22, hexToRgba('#FFF3B0', 0.92));
      haloGrad.addColorStop(0.5, hexToRgba(accentColor, 0.58 * glowIntensity));
      haloGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(lanternX, lanternY, outerHaloR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Six thin legs tucked underneath and moving softly
    ctx.save();
    const legTremble = Math.sin(t * 7.5 * paceMul) * 0.55;
    ctx.strokeStyle = isBlack ? '#F3E5AB' : isGreen ? '#3B2416' : '#4A2F1D';
    ctx.lineWidth = 1.25;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const legAnchors = [
      { ax: 8, ay: 3, kx: 10, ky: 8, fx: 12.5, fy: 11.5 },
      { ax: 4, ay: 3.5, kx: 3.5, ky: 9, fx: 5.5, fy: 12.5 },
      { ax: 0, ay: 4, kx: -2.5, ky: 9.2, fx: -4.5, fy: 12.8 },
      { ax: 7, ay: 2.5, kx: 8.5, ky: 7.2, fx: 10.5, fy: 10.2 },
      { ax: 3, ay: 3, kx: 2, ky: 7.8, fx: 3.2, fy: 11 },
      { ax: -1, ay: 3.4, kx: -3.8, ky: 8, fx: -5.8, fy: 11.2 },
    ];
    for (let l = 0; l < legAnchors.length; l++) {
      const leg = legAnchors[l];
      const d = (l % 2 === 0 ? 1 : -1) * legTremble;
      ctx.beginPath();
      ctx.moveTo(leg.ax, leg.ay);
      ctx.lineTo(leg.kx + d * 0.5, leg.ky);
      ctx.lineTo(leg.fx + d, leg.fy);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Static cached Firefly body (head, antennae, eye, pronotum, abdomen)
    const sprite = getCachedCreatureBodySprite('firefly', accentColor, bgMode);
    ctx.drawImage(sprite, -SPRITE_HALF, -SPRITE_HALF);

    // 4. Lantern glowing abdomen tip (foreground core + amber body)
    if (isGreen) {
      // GREEN mode: flat hard-edged fills; solid amber disc with lighter inner disc (no halo)
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(lanternX, lanternY, 7.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFF9DB';
      ctx.beginPath();
      ctx.arc(lanternX - 0.8, lanternY - 0.6, 3.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const coreR = 9.2 * (0.88 + 0.14 * glowIntensity);
      const lanternGrad = ctx.createRadialGradient(
        lanternX - 1,
        lanternY - 1,
        0.8,
        lanternX,
        lanternY,
        coreR
      );
      lanternGrad.addColorStop(0, '#FFFFFF');
      lanternGrad.addColorStop(0.42, '#FFF5B8');
      lanternGrad.addColorStop(0.78, accentColor);
      lanternGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = lanternGrad;
      ctx.beginPath();
      ctx.arc(lanternX, lanternY, coreR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Delicate transparent hind wings with calm, gentle flap rhythm
    const flapAngleBase =
      speedNorm > 0.08
        ? Math.sin(t * Math.PI * 2 * 1.65 * paceMul) * 0.34
        : Math.sin(t * Math.PI * 2 * 0.75 * paceMul) * 0.06;

    const drawHindWingPose = (angleOffset: number, poseAlpha: number) => {
      ctx.save();
      ctx.translate(4, -2);
      ctx.rotate(-0.48 + flapAngleBase + angleOffset);

      if (isGreen) {
        ctx.fillStyle = '#E6F4F1';
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 1.2;
      } else {
        ctx.globalAlpha *= poseAlpha;
        // Faint iridescent sheen gradient
        const wingGrad = ctx.createLinearGradient(0, 0, -24, -14);
        wingGrad.addColorStop(0, isBlack ? 'rgba(255, 255, 255, 0.55)' : 'rgba(224, 242, 254, 0.42)');
        wingGrad.addColorStop(0.55, hexToRgba(accentColor, isBlack ? 0.38 : 0.26));
        wingGrad.addColorStop(1, isBlack ? 'rgba(186, 230, 253, 0.48)' : 'rgba(167, 243, 208, 0.22)');
        ctx.fillStyle = wingGrad;
        ctx.strokeStyle = isBlack
          ? 'rgba(255, 255, 255, 0.88)'
          : 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 1.1;
      }

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-6, -15, -22, -19, -26, -9);
      ctx.bezierCurveTo(-28, -2, -14, 4, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Fine vein lines inside hind wing
      ctx.beginPath();
      ctx.moveTo(-2, -1);
      ctx.quadraticCurveTo(-12, -9, -23, -9);
      ctx.moveTo(-9, -6);
      ctx.lineTo(-16, -14);
      ctx.moveTo(-13, -7);
      ctx.lineTo(-19, -4);
      ctx.stroke();

      ctx.restore();
    };

    if (isGreen) {
      drawHindWingPose(0, 1);
    } else if (speedNorm > 0.12) {
      // Alpha-blended doubled wing poses for soft 3 Hz motion blur while flying
      drawHindWingPose(-0.22, 0.46);
      drawHindWingPose(0.18, 0.68);
    } else {
      // Micro-hover while stopped
      drawHindWingPose(0, 0.78);
      drawHindWingPose(0.06, 0.34);
    }

    // 6. Two translucent hard wing covers (elytra) held slightly open above hind wings
    const drawElytron = (openAngle: number, alpha: number) => {
      ctx.save();
      ctx.translate(5, -2.5);
      ctx.rotate(openAngle);
      if (!isGreen) {
        ctx.globalAlpha *= alpha;
      }
      if (isGreen) {
        ctx.fillStyle = '#523422';
        ctx.strokeStyle = '#F2A65A';
      } else if (isBlack) {
        const elGrad = ctx.createLinearGradient(0, -4, -20, 2);
        elGrad.addColorStop(0, 'rgba(245, 230, 196, 0.92)');
        elGrad.addColorStop(1, 'rgba(212, 180, 125, 0.78)');
        ctx.fillStyle = elGrad;
        ctx.strokeStyle = '#FFFFFF';
      } else {
        const elGrad = ctx.createLinearGradient(0, -4, -20, 2);
        elGrad.addColorStop(0, 'rgba(92, 58, 36, 0.88)');
        elGrad.addColorStop(1, 'rgba(46, 28, 18, 0.76)');
        ctx.fillStyle = elGrad;
        ctx.strokeStyle = 'rgba(242, 166, 90, 0.75)';
      }
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-5, -9, -18, -10, -21, -3);
      ctx.bezierCurveTo(-22, 2, -9, 3, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    const elytraLift = -0.34 - 0.08 * speedNorm;
    drawElytron(elytraLift - 0.14, 0.72);
    drawElytron(elytraLift, 0.94);
  }

  ctx.restore();
}

/**
 * Renders a live preview thumbnail for the 4-creature selector in the studio sidebar.
 */
export function drawCreaturePreviewThumbnail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  creature: FlyerCreatureId,
  accentColor: string,
  t: number,
  theme: CalmStyleTheme = 'dark',
  flightSpeed: number = DEFAULT_FLYER_FLIGHT_SPEED
): void {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const paceMul = clamp(flightSpeed / 0.55, 0.45, 1.65);

  // Preview card background matching the creature & selected theme ('dark' or 'light')
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  if (theme === 'light') {
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.55, creature === 'butterfly' ? '#FDFCF9' : '#F8FAFC');
    grad.addColorStop(
      1,
      creature === 'firefly'
        ? '#F0FDF4'
        : creature === 'bat'
          ? '#EEF2FF'
          : creature === 'butterfly'
            ? '#FDF2F8'
            : '#EFF6FF'
    );
  } else if (creature === 'firefly') {
    grad.addColorStop(0, '#04110F');
    grad.addColorStop(1, '#0A1F1C');
  } else if (creature === 'bat') {
    grad.addColorStop(0, '#060513');
    grad.addColorStop(1, '#1A1438');
  } else if (creature === 'butterfly') {
    grad.addColorStop(0, '#080A1A');
    grad.addColorStop(1, '#191B3A');
  } else {
    grad.addColorStop(0, '#040914');
    grad.addColorStop(1, '#0E1B36');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (theme === 'light') {
    const halo = ctx.createRadialGradient(width * 0.56, height * 0.5, 2, width * 0.56, height * 0.5, width * 0.48);
    halo.addColorStop(0, hexToRgba(accentColor, 0.22));
    halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
  }

  if (creature === 'bat') {
    const thumbMoonX = width * 0.2;
    const thumbMoonY = height * 0.26;
    const thumbMoonR = Math.min(width, height) * 0.13;
    drawPolishedCrescentMoon(ctx, thumbMoonX, thumbMoonY, thumbMoonR, accentColor, theme);
    drawMoonSoftGlow(ctx, thumbMoonX, thumbMoonY, thumbMoonR, accentColor, theme, t, paceMul * 0.72);
  }

  // Gentle floating wave inside thumbnail card reflecting flightSpeed
  const cx = width * 0.56 + Math.sin(t * 0.72 * paceMul) * 4.5;
  const cy = height * 0.5 + Math.cos(t * 0.54 * paceMul) * 3.2;
  for (let i = 7; i >= 1; i--) {
    const tx = cx - i * 6.8;
    const driftY =
      creature === 'orb'
        ? Math.sin(t * 1.45 * paceMul - i * 0.65) * 3.2 - i * 0.45
        : Math.sin(t * 1.6 * paceMul - i * 0.55) * 2.2;
    const ty = cy + driftY;
    const r = Math.max(1.1, (8 - i) * 0.6);
    if (creature === 'orb' && theme === 'light') {
      const pGrad = ctx.createRadialGradient(tx, ty, 0, tx, ty, r * 2.4);
      pGrad.addColorStop(0, `rgba(255, 255, 255, ${((8 - i) * 0.14).toFixed(2)})`);
      pGrad.addColorStop(0.5, hexToRgba(accentColor, (8 - i) * 0.1));
      pGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(tx, ty, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle =
        creature === 'orb'
          ? `rgba(255, 255, 255, ${((8 - i) * 0.12).toFixed(2)})`
          : hexToRgba(accentColor, (8 - i) * 0.1);
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFlyerCreature({
    ctx,
    creature,
    x: cx,
    y: cy,
    vx: 65 * paceMul,
    vy: -Math.sin(t * 0.54 * paceMul) * 14,
    speedNorm: 0.45,
    hoverBoost: 0.25,
    t,
    scale: Math.min(width, height) / 74,
    accentColor,
    bgMode: 'style',
    seed: 101,
    theme,
    flightSpeed,
  });

  ctx.restore();
}

// ============================================================================
// SHARED DETERMINISTIC FLIGHT PATH & TRAIL SAMPLER
// ============================================================================

export interface FlightWaypoint {
  t: number;
  x: number;
  y: number;
  isHover?: boolean;
  keywordGlow?: number;
}

export interface SampledFlightState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speedNorm: number;
  hoverBoost: number;
  visibleAlpha: number;
}

function computeSplineKnotTangent(
  waypoints: FlightWaypoint[],
  k: number
): { vx: number; vy: number } {
  const n = waypoints.length;
  if (n <= 1) return { vx: 0, vy: 0 };

  const cur = waypoints[k];
  const prev = k > 0 ? waypoints[k - 1] : null;
  const next = k < n - 1 ? waypoints[k + 1] : null;

  const hoverPrev = Boolean(
    prev && cur.isHover && prev.isHover && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 14
  );
  const hoverNext = Boolean(
    next && cur.isHover && next.isHover && Math.hypot(next.x - cur.x, next.y - cur.y) < 14
  );
  if (hoverPrev || hoverNext) {
    return { vx: 0, vy: 0 };
  }

  if (!prev && next) {
    const dt = Math.max(0.02, next.t - cur.t);
    return {
      vx: ((next.x - cur.x) / dt) * 0.85,
      vy: ((next.y - cur.y) / dt) * 0.85,
    };
  }
  if (prev && !next) {
    const dt = Math.max(0.02, cur.t - prev.t);
    return {
      vx: ((cur.x - prev.x) / dt) * 0.85,
      vy: ((cur.y - prev.y) / dt) * 0.85,
    };
  }
  if (!prev || !next) return { vx: 0, vy: 0 };

  const dtPrev = Math.max(0.02, cur.t - prev.t);
  const dtNext = Math.max(0.02, next.t - cur.t);
  const dxPrev = cur.x - prev.x;
  const dyPrev = cur.y - prev.y;
  const dxNext = next.x - cur.x;
  const dyNext = next.y - cur.y;

  // Time-weighted Bessel tangent guarantees exact C1 velocity continuity across unequal segments
  const vPrevX = dxPrev / dtPrev;
  const vPrevY = dyPrev / dtPrev;
  const vNextX = dxNext / dtNext;
  const vNextY = dyNext / dtNext;
  const wPrev = dtNext / (dtPrev + dtNext);
  const wNext = dtPrev / (dtPrev + dtNext);

  let vx = vPrevX * wPrev + vNextX * wNext;
  let vy = vPrevY * wPrev + vNextY * wNext;

  // Centripetal-inspired speed cap prevents loops or overshoot when segment distances differ sharply
  const spPrev = Math.hypot(dxPrev, dyPrev) / dtPrev;
  const spNext = Math.hypot(dxNext, dyNext) / dtNext;
  const sp = Math.hypot(vx, vy);
  if (sp > 1e-4 && spPrev > 2 && spNext > 2) {
    const maxSafe = Math.max(8, Math.min(spPrev, spNext) * 1.38);
    if (sp > maxSafe) {
      const s = maxSafe / sp;
      vx *= s;
      vy *= s;
    }
  }

  return { vx, vy };
}

export function sampleFlightWaypoints(
  waypoints: FlightWaypoint[],
  t: number,
  exitStart: number,
  totalDuration: number
): SampledFlightState {
  if (waypoints.length === 0) {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      speedNorm: 0,
      hoverBoost: 0,
      visibleAlpha: 0,
    };
  }

  if (t <= waypoints[0].t) {
    const p0 = waypoints[0];
    const t0 = computeSplineKnotTangent(waypoints, 0);
    return {
      x: p0.x,
      y: p0.y,
      vx: t0.vx,
      vy: t0.vy,
      speedNorm: 0.28,
      hoverBoost: 0,
      visibleAlpha: clamp(t / Math.max(0.08, p0.t + 0.18), 0, 1),
    };
  }

  const last = waypoints[waypoints.length - 1];
  if (t >= last.t) {
    const tLast = computeSplineKnotTangent(waypoints, waypoints.length - 1);
    const exitP = progress(t, exitStart, totalDuration);
    return {
      x: last.x,
      y: last.y - exitP * 14,
      vx: tLast.vx * 0.5,
      vy: -12,
      speedNorm: 0.14,
      hoverBoost: 0,
      visibleAlpha: 1 - easeInCubic(exitP),
    };
  }

  // Binary search for active segment
  let lo = 0;
  let hi = waypoints.length - 2;
  let idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < waypoints[mid].t) {
      hi = mid - 1;
    } else if (t > waypoints[mid + 1].t) {
      lo = mid + 1;
    } else {
      idx = mid;
      break;
    }
  }

  const w1 = waypoints[idx];
  const w2 = waypoints[idx + 1];
  const segDur = Math.max(0.001, w2.t - w1.t);
  const rawU = clamp((t - w1.t) / segDur, 0, 1);

  const dx = w2.x - w1.x;
  const dy = w2.y - w1.y;
  const dist = Math.hypot(dx, dy);
  const isHoverSeg = Boolean(w1.isHover && w2.isHover && dist < 14);

  let x: number;
  let y: number;
  let vx: number;
  let vy: number;

  if (isHoverSeg) {
    // Calm motionless/breathing settle when explicit identical-coordinate hover anchors are passed
    const uHover = easeInOutCubic(rawU);
    x = lerp(w1.x, w2.x, uHover);
    y = lerp(w1.y, w2.y, uHover);
    vx = dx / segDur;
    vy = dy / segDur;
  } else {
    // Exact C1 time-parameterized Cubic Hermite spline (eliminates velocity snaps & corner cusps)
    const tan1 = computeSplineKnotTangent(waypoints, idx);
    const tan2 = computeSplineKnotTangent(waypoints, idx + 1);
    const u = rawU;
    const u2 = u * u;
    const u3 = u2 * u;

    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;

    const dh00 = 6 * u2 - 6 * u;
    const dh10 = 3 * u2 - 4 * u + 1;
    const dh01 = -6 * u2 + 6 * u;
    const dh11 = 3 * u2 - 2 * u;

    x = h00 * w1.x + h10 * segDur * tan1.vx + h01 * w2.x + h11 * segDur * tan2.vx;
    y = h00 * w1.y + h10 * segDur * tan1.vy + h01 * w2.y + h11 * segDur * tan2.vy;

    vx = (dh00 * w1.x + dh10 * segDur * tan1.vx + dh01 * w2.x + dh11 * segDur * tan2.vx) / segDur;
    vy = (dh00 * w1.y + dh10 * segDur * tan1.vy + dh01 * w2.y + dh11 * segDur * tan2.vy) / segDur;
  }

  const speed = Math.hypot(vx, vy);
  const speedNorm = isHoverSeg ? 0.05 : clamp(speed / 360, 0.1, 0.72);
  const g1 = w1.keywordGlow ?? (w1.isHover ? 0.65 : 0);
  const g2 = w2.keywordGlow ?? (w2.isHover ? 0.65 : 0);
  const hoverBoost = isHoverSeg
    ? Math.sin(rawU * Math.PI)
    : clamp(lerp(g1, g2, easeInOutCubic(rawU)), 0, 1);

  const exitP = progress(t, exitStart, totalDuration);
  const visibleAlpha = 1 - easeInCubic(exitP);

  return {
    x,
    y,
    vx,
    vy,
    speedNorm,
    hoverBoost,
    visibleAlpha,
  };
}

/**
 * Draws the deterministic path-sampled trail behind the creature at time `t`.
 * - For Orb: drifting airborne white feathery nectar particles rising gently with soft glow.
 * - For Firefly: a fading dotted line of light sampled from the path, each dot blinking
 *   softly at a seeded phase, tapering and cooling from amber to a faint warm tone.
 * - In GREEN mode: solid small discs shrinking with age, zero blur/halo.
 */
function drawFlyerTrail(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  waypoints: FlightWaypoint[],
  t: number,
  exitStart: number,
  totalDuration: number,
  creature: FlyerCreatureId,
  accentColor: string,
  bgMode: BackgroundMode,
  scale: number,
  seed: number,
  theme: CalmStyleTheme = 'dark',
  flightSpeed: number = DEFAULT_FLYER_FLIGHT_SPEED
): void {
  const isGreen = bgMode === 'green';
  const isLight = bgMode === 'style' && theme === 'light';
  const paceMul = clamp(flightSpeed / 0.55, 0.45, 1.65);
  const dotCount = creature === 'orb' || creature === 'firefly' ? 20 : 16;
  const maxAge = clamp(1.15 / clamp(paceMul, 0.55, 1.45), 0.85, 1.75);
  const rng = mulberry32(combineSeed(seed, 0x8821c));

  ctx.save();
  for (let i = dotCount; i >= 1; i--) {
    const frac = i / dotCount; // 1 = oldest, 0 = newest
    const sampleT = t - frac * maxAge;
    if (sampleT < 0.02) continue;

    const st = sampleFlightWaypoints(waypoints, sampleT, exitStart, totalDuration);
    if (st.visibleAlpha <= 0.02) continue;

    const phase = rng() * Math.PI * 2 + i * 1.07;
    const blink = isGreen
      ? 1
      : 0.62 + 0.38 * Math.sin(t * Math.PI * 2 * 1.15 * paceMul + phase);

    const taper = Math.pow(1 - frac, 1.12);
    const radius = Math.max(
      1.1,
      (creature === 'orb' ? 4.4 : creature === 'firefly' ? 4.8 : 5.2) * taper * scale
    );

    if (isGreen) {
      // GREEN mode: solid small discs shrinking with age, no alpha feathering
      if (creature === 'orb') {
        const driftX = Math.cos(t * 0.95 * paceMul + phase) * 5.2 * frac * scale;
        const driftY = -frac * 10 * scale + Math.sin(t * 1.15 * paceMul + phase) * 4.2 * frac * scale;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(st.x + driftX, st.y + driftY, radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = i % 3 === 0 ? '#FFF8D6' : accentColor;
        ctx.beginPath();
        ctx.arc(st.x, st.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (creature === 'orb') {
      // Airborne drifting white feathery nectar dust particles trailing gracefully
      // In 'light' theme, surround the pure white center with a soft colored pastel halo for crisp contrast
      const driftX = Math.cos(t * 0.92 * paceMul + phase * 1.2) * 8.2 * frac * scale;
      const driftY = -frac * 14 * scale + Math.sin(t * 1.18 * paceMul + phase) * 6.0 * frac * scale;
      const px = st.x + driftX;
      const py = st.y + driftY;
      const alpha = clamp(taper * blink * st.visibleAlpha * (isLight ? 0.92 : 0.85), 0, 1);
      const outerR = radius * (isLight ? 2.75 : 2.4);

      const dustGrad = ctx.createRadialGradient(px, py, 0, px, py, outerR);
      dustGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
      if (isLight) {
        dustGrad.addColorStop(0.36, `rgba(255, 255, 255, ${(alpha * 0.85).toFixed(3)})`);
        dustGrad.addColorStop(0.66, hexToRgba(accentColor, alpha * 0.56));
        dustGrad.addColorStop(1, hexToRgba(accentColor, 0));
      } else {
        dustGrad.addColorStop(0.42, `rgba(255, 255, 255, ${(alpha * 0.55).toFixed(3)})`);
        dustGrad.addColorStop(0.75, hexToRgba(accentColor, alpha * 0.24));
        dustGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      }
      ctx.fillStyle = dustGrad;
      ctx.beginPath();
      ctx.arc(px, py, outerR, 0, Math.PI * 2);
      ctx.fill();

      // Secondary offset micro-speck for airy weightless cloud feel
      if (i % 2 === 0 && frac > 0.15) {
        const subX = st.x - driftX * 0.72 + Math.sin(phase * 2.1) * 5 * scale;
        const subY = st.y + driftY * 0.65 - 3.5 * frac * scale;
        const subR = Math.max(1.0, radius * (isLight ? 1.75 : 1.45));
        const subGrad = ctx.createRadialGradient(subX, subY, 0, subX, subY, subR);
        subGrad.addColorStop(0, `rgba(255, 255, 255, ${(alpha * 0.86).toFixed(3)})`);
        if (isLight) {
          subGrad.addColorStop(0.55, hexToRgba(accentColor, alpha * 0.48));
        }
        subGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = subGrad;
        ctx.beginPath();
        ctx.arc(subX, subY, subR, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (creature === 'firefly') {
      // Tapering and cooling from bright amber to a faint warm tone
      const coolColor = frac < 0.45 ? accentColor : frac < 0.75 ? '#F59E0B' : '#FDE68A';
      const alpha = clamp(taper * blink * st.visibleAlpha * 0.82, 0, 1);

      const dotGrad = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, radius * 2.1);
      dotGrad.addColorStop(0, hexToRgba('#FFFFFF', alpha));
      dotGrad.addColorStop(0.45, hexToRgba(coolColor, alpha * 0.85));
      dotGrad.addColorStop(1, hexToRgba(coolColor, 0));
      ctx.fillStyle = dotGrad;
      ctx.beginPath();
      ctx.arc(st.x, st.y, radius * 2.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const alpha = clamp(taper * blink * st.visibleAlpha * 0.72, 0, 1);
      const dotGrad = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, radius * 2.0);
      dotGrad.addColorStop(0, hexToRgba('#FFFFFF', alpha * 0.9));
      dotGrad.addColorStop(0.5, hexToRgba(accentColor, alpha * 0.75));
      dotGrad.addColorStop(1, hexToRgba(accentColor, 0));
      ctx.fillStyle = dotGrad;
      ctx.beginPath();
      ctx.arc(st.x, st.y, radius * 2.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================================
// 1) PHRASE FLYER (phrase_flyer) SCHEDULE, LAYOUT & RENDERER
// ============================================================================

interface PhraseWordRevealSchedule {
  lineIndex: number;
  wordIndex: number;
  revealStart: number;
  revealEnd: number;
  isKeyword: boolean;
  centerX: number;
  topY: number;
  baselineY: number;
}

interface PhraseFlyerPlan {
  layout: ArabicQuoteLayout;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  direction: ResolvedTextDirection;
  wordSchedules: PhraseWordRevealSchedule[];
  waypoints: FlightWaypoint[];
  keywordTimes: number[];
  effective: ReturnType<typeof getEffectiveTimeline>;
}

export function buildPhraseFlyerPlan(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): PhraseFlyerPlan {
  const { baseWidth: W, baseHeight: H } = size;
  const posBox = getPhrasePositionBox(custom.position || 'center', custom.format, W, H);
  const direction = resolveTextDirection(custom, content.quoteText);
  const effective = getEffectiveTimeline(timeline, content.quoteText, 'phrase', 0.38);
  const flightSpeed = resolveFlyerFlightSpeed(custom);
  const speedFactor = clamp(0.55 / flightSpeed, 0.44, 2.2);

  const defaultFont =
    direction === 'ltr'
      ? PHRASE_FLYER_CONFIG.defaultEnglishQuoteFont
      : PHRASE_FLYER_CONFIG.defaultQuoteFont;
  let quoteFont: string = custom.quoteFontOverride || defaultFont;
  if (
    direction === 'rtl' &&
    custom.quoteFontOverride &&
    !PHRASE_FLYER_CONFIG.allowedFonts.includes(custom.quoteFontOverride as ArabicFontFamily)
  ) {
    quoteFont = defaultFont;
  }

  // Reserve vertical headroom inside the position box so the flying creature above line 0
  // never clips outside the position box or canvas
  const creatureHeadroom = Math.round(Math.min(68, posBox.boxHeight * 0.14));
  const innerX = posBox.boxX + Math.round(posBox.boxWidth * 0.05);
  const innerY = posBox.boxY + creatureHeadroom;
  const innerW = Math.max(180, posBox.boxWidth - Math.round(posBox.boxWidth * 0.1));
  const innerH = Math.max(120, posBox.boxHeight - creatureHeadroom - Math.round(posBox.boxHeight * 0.05));

  const maxFont = custom.format === '16:9' ? 68 : 60;
  const minFont = 22;

  const layout = layoutArabicQuote(ctx, {
    text: content.quoteText,
    quotationMarks: 'none',
    fontFamily: quoteFont,
    fontWeight: 700,
    minFontSize: minFont,
    maxFontSize: maxFont,
    fontSizeMultiplier: custom.fontSizeMultiplier ?? 1.0,
    keywordScaleMultiplier: 1.06,
    lineHeightRatio: 1.72,
    boxX: innerX,
    boxY: innerY,
    boxWidth: innerW,
    boxHeight: innerH,
    align: 'center',
    direction,
    verticalAlign: 'center',
  });

  // Build slow, continuous, stop-free flight schedule across all words & lines
  const totalWords = layout.lines.reduce((acc, l) => acc + l.words.length, 0);

  const flightStart = 0.12;
  const maxAllowedFlightEnd = Math.max(flightStart + 0.65, effective.exitStart - 0.55);
  const desiredGlideSpan = Math.max(
    effective.enter * 0.92,
    (1.05 + totalWords * 0.28) * speedFactor
  );
  const flightEnd = clamp(
    flightStart + desiredGlideSpan,
    flightStart + 0.55,
    maxAllowedFlightEnd
  );
  const totalAvail = Math.max(0.45, flightEnd - flightStart);
  const stepPerWord = totalAvail / Math.max(1, totalWords);

  const wordSchedules: PhraseWordRevealSchedule[] = [];
  const waypoints: FlightWaypoint[] = [];
  const keywordTimes: number[] = [];
  const seenKeyGroup = new Set<number>();

  const flightYOffset = Math.max(26, layout.fontSize * 0.68);
  let cursorT = flightStart;

  // Compute text block envelope for smooth turnaround curves and continuous ambient orbit
  let textLeft = W * 0.35;
  let textRight = W * 0.65;
  let textTop = H * 0.38;
  let textBottom = H * 0.62;
  if (layout.lines.length > 0) {
    textLeft = Math.min(...layout.lines.map((l) => l.leftX));
    textRight = Math.max(...layout.lines.map((l) => l.rightX));
    textTop = layout.lines[0].topY;
    textBottom = layout.lines[layout.lines.length - 1].y + layout.fontSize * 0.32;
  }

  const keywordGlowAtTime = (sampleT: number): number => {
    let best = 0.22;
    for (let k = 0; k < keywordTimes.length; k++) {
      const d = Math.abs(sampleT - keywordTimes[k]);
      if (d < 0.55) {
        best = Math.max(best, lerp(1.0, 0.22, d / 0.55));
      }
    }
    return best;
  };

  // First build exact word reveal schedule & keyword event timestamps (100% deterministic & SFX-synced)
  const lineSpans: {
    startT: number;
    endT: number;
    leftX: number;
    rightX: number;
    flyY: number;
  }[] = [];

  for (let li = 0; li < layout.lines.length; li++) {
    const line = layout.lines[li];
    const lineFlyY = clamp(line.y - flightYOffset, 42, H - 42);
    const lineStartT = cursorT;

    for (let wi = 0; wi < line.words.length; wi++) {
      const w = line.words[wi];
      const wordCenterX = clamp(w.x - w.width * 0.5, 42, W - 42);
      const revStart = cursorT;
      const revEnd = Math.min(
        effective.exitStart - 0.12,
        revStart + Math.max(0.45, stepPerWord * 1.65)
      );

      wordSchedules.push({
        lineIndex: li,
        wordIndex: wi,
        revealStart: revStart,
        revealEnd: revEnd,
        isKeyword: w.isKeyword,
        centerX: wordCenterX,
        topY: line.topY,
        baselineY: line.y,
      });

      if (w.isKeyword && w.groupId !== null && !seenKeyGroup.has(w.groupId)) {
        seenKeyGroup.add(w.groupId);
        keywordTimes.push(Number(revStart.toFixed(3)));
      }

      cursorT += stepPerWord;
    }

    const lineEndT = Math.max(lineStartT + 0.12, cursorT - stepPerWord * 0.25);
    lineSpans.push({
      startT: lineStartT,
      endT: lineEndT,
      leftX: clamp(line.leftX, 56, W - 56),
      rightX: clamp(line.rightX, 56, W - 56),
      flyY: lineFlyY,
    });
  }

  // Generate gradual, calm flowing wave waypoints across all lines (wide curvature radius, zero sharp U-turns)
  if (lineSpans.length > 0) {
    const readingDir = direction === 'rtl' ? -1 : 1; // -1: right->left, +1: left->right
    const centerBlockX = clamp((textLeft + textRight) * 0.5, 120, W - 120);
    const sweepHalfW = clamp((textRight - textLeft) * 0.34, 88, Math.min(260, posBox.boxWidth * 0.34));

    const pushSmoothWp = (tVal: number, xVal: number, yVal: number) => {
      const prevT = waypoints.length > 0 ? waypoints[waypoints.length - 1].t : -1;
      const safeT = Number(Math.max(tVal, prevT + 0.05).toFixed(3));
      waypoints.push({
        t: safeT,
        x: clamp(xVal, 48, W - 48),
        y: clamp(yVal, 44, H - 44),
        isHover: false,
        keywordGlow: keywordGlowAtTime(safeT),
      });
    };

    const firstFlyY = lineSpans[0].flyY;
    const lastFlyY = lineSpans[lineSpans.length - 1].flyY;
    const entryStartX = centerBlockX - readingDir * (sweepHalfW * 0.92);
    waypoints.push({
      t: 0,
      x: clamp(entryStartX - readingDir * 36, 48, W - 48),
      y: clamp(firstFlyY - 22, 44, H - 44),
      isHover: false,
      keywordGlow: 0.18,
    });

    if (lineSpans.length === 1) {
      // Single-line quote: one serene wide crest sweeping across the line
      const s0 = lineSpans[0];
      const segStart = centerBlockX - readingDir * sweepHalfW;
      const segEnd = centerBlockX + readingDir * sweepHalfW;
      pushSmoothWp(lerp(s0.startT, s0.endT, 0.15), lerp(segStart, segEnd, 0.15), firstFlyY - 12);
      pushSmoothWp(lerp(s0.startT, s0.endT, 0.5), centerBlockX, firstFlyY - 22);
      pushSmoothWp(lerp(s0.startT, s0.endT, 0.85), lerp(segStart, segEnd, 0.85), firstFlyY - 10);
    } else {
      // Multi-line quote: gradual continuous wave descending across lines with generous turn radius
      // Vertical span expands gently above first line and below last line so turnaround curvature stays wide
      const topArchY = clamp(firstFlyY - 24, 44, H - 44);
      const botArchY = clamp(lastFlyY + 26, 44, H - 44);
      const halfCycles = Math.min(2.0, Math.max(1.0, (lineSpans.length - 1) * 0.85 + 0.35));
      const sampleCount = Math.max(5, Math.round(halfCycles * 4) + 1);
      const t0 = lineSpans[0].startT;
      const t1 = lineSpans[lineSpans.length - 1].endT;

      for (let i = 0; i < sampleCount; i++) {
        const u = i / (sampleCount - 1);
        const st = lerp(t0, t1, u);
        const phase = u * Math.PI * halfCycles;
        // Smooth cosine horizontal sweep + gentle vertical S-descent with vertical breathing
        const sx = centerBlockX - readingDir * Math.cos(phase) * sweepHalfW;
        const sy = lerp(topArchY, botArchY, easeInOutCubic(u)) - Math.sin(phase) * 18;
        pushSmoothWp(st, sx, sy);
      }
    }
  }

  // Continuous serene ambient wave orbit around the text block matching final sweep tangent (never reverses abruptly)
  if (waypoints.length > 0) {
    const lastWp = waypoints[waypoints.length - 1];
    const prevWp = waypoints.length > 1 ? waypoints[waypoints.length - 2] : lastWp;
    const centerX = clamp((textLeft + textRight) * 0.5, 80, W - 80);
    const centerY = clamp((textTop + textBottom) * 0.5, 80, H - 80);
    const rx = clamp((textRight - textLeft) * 0.5 + 48, 90, W * 0.42);
    const ry = clamp((textBottom - textTop) * 0.5 + 38, 56, H * 0.34);

    // Match orbital angular direction to the creature's current cross-product around the center
    const relX = (lastWp.x - centerX) / Math.max(1, rx);
    const relY = (lastWp.y - centerY) / Math.max(1, ry);
    const velX = lastWp.x - prevWp.x;
    const velY = lastWp.y - prevWp.y;
    const cross = relX * velY - relY * velX;
    const angularDir = cross >= 0 ? 1 : -1;

    const startAngle =
      Math.hypot(relX, relY) < 0.35
        ? Math.atan2(velY, velX || (direction === 'rtl' ? -1 : 1))
        : Math.atan2(relY, relX);
    const stepTime = clamp(1.25 * speedFactor, 0.68, 2.05);
    const stepAngle = angularDir * (Math.PI * 0.28);

    let orbitT = lastWp.t + stepTime * 0.72;
    let stepIdx = 1;
    while (orbitT < effective.total - 0.15) {
      const ang = startAngle + stepIdx * stepAngle;
      const ox = clamp(centerX + Math.cos(ang) * rx, 42, W - 42);
      const oy = clamp(
        centerY + Math.sin(ang) * ry - Math.cos(stepIdx * 0.9) * 8,
        40,
        H - 40
      );
      waypoints.push({
        t: Number(orbitT.toFixed(3)),
        x: ox,
        y: oy,
        isHover: false,
        keywordGlow: 0.24 + 0.14 * (0.5 + 0.5 * Math.sin(stepIdx * 1.1)),
      });
      orbitT += stepTime;
      stepIdx++;
    }

    const finalPrev = waypoints[waypoints.length - 1];
    if (effective.total > finalPrev.t + 0.04) {
      const finalAng = startAngle + stepIdx * stepAngle * 0.75;
      waypoints.push({
        t: Number(effective.total.toFixed(3)),
        x: clamp(centerX + Math.cos(finalAng) * rx, 42, W - 42),
        y: clamp(centerY + Math.sin(finalAng) * ry - 10, 40, H - 40),
        isHover: false,
        keywordGlow: 0.2,
      });
    }
  }

  return {
    layout,
    boxX: innerX,
    boxY: innerY,
    boxWidth: innerW,
    boxHeight: innerH,
    direction,
    wordSchedules,
    waypoints,
    keywordTimes,
    effective,
  };
}

export function getPhraseFlyerEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const plan = buildPhraseFlyerPlan(ctx, content, timeline, custom, size);
  return {
    enterStart: 0.08,
    keywordTimes: plan.keywordTimes,
  };
}

export const renderPhraseFlyer: PureStyleRenderer = (
  ctx,
  t,
  content,
  timeline,
  custom,
  size
) => {
  const { baseWidth: W, baseHeight: H } = size;
  const bgMode = resolveBackgroundMode(custom);
  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';
  const theme = resolveFlyerTheme(custom);
  const isLight = !isGreen && !isBlack && theme === 'light';
  const creature = resolveFlyerCreature(custom.flyerCreature);
  const flightSpeed = resolveFlyerFlightSpeed(custom);
  const creatureMeta = getFlyerCreatureMeta(creature);
  const accentColor = custom.accentColor || creatureMeta.defaultAccent;
  const rawKeyword = custom.keywordColor || creatureMeta.defaultKeyword;
  const isDefaultPaleKeyword =
    rawKeyword.toUpperCase() === '#FDE047' ||
    rawKeyword.toUpperCase() === '#FFF3B0' ||
    rawKeyword.toUpperCase() === '#FFD166';
  const keywordColor = isLight && isDefaultPaleKeyword ? '#D97706' : rawKeyword;

  // 1. Draw Background (Style / Green / Black)
  drawStyleBackdropAndBokeh(
    ctx,
    W,
    H,
    creature,
    accentColor,
    bgMode,
    custom.seed,
    t,
    theme,
    flightSpeed
  );

  // 2. Compute identical deterministic layout & flight plan
  const plan = buildPhraseFlyerPlan(ctx, content, timeline, custom, size);
  const { layout, direction, wordSchedules, waypoints, effective } = plan;

  const exitP = progress(t, effective.exitStart, effective.total);
  const masterAlpha = 1 - easeInCubic(exitP);

  // 3. Draw revealed words (unrevealed words have alpha = 0 so creature never covers unrevealed text)
  ctx.save();

  let schedIdx = 0;
  for (let li = 0; li < layout.lines.length; li++) {
    const line = layout.lines[li];
    for (let wi = 0; wi < line.words.length; wi++) {
      const word = line.words[wi];
      const sched = wordSchedules[schedIdx++];
      if (!sched) continue;

      const revP = progress(t, sched.revealStart, sched.revealEnd);
      if (revP <= 0.001) continue; // Completely unrevealed -> not drawn yet

      const wordEase = easeOutCubic(revP);
      const liftY = (1 - wordEase) * 6;
      const wx = word.x;
      const wy = word.y + liftY;

      ctx.save();
      applyStudioCanvasTextProps(
        ctx,
        layout.fontFamily,
        layout.fontWeight,
        word.fontSize,
        direction
      );

      if (isGreen) {
        // GREEN mode: crisp alpha step (no feathered translucent edges), white text with thin hard dark outline
        ctx.globalAlpha = revP >= 0.2 && masterAlpha > 0.2 ? 1 : 0;
        if (ctx.globalAlpha > 0) {
          const r = 2.4;
          const d = 1.7;
          const offsets: [number, number][] = [
            [-r, 0],
            [r, 0],
            [0, -r],
            [0, r],
            [-d, -d],
            [d, -d],
            [-d, d],
            [d, d],
          ];
          ctx.fillStyle = '#0B1320';
          for (let oi = 0; oi < offsets.length; oi++) {
            drawBidiWord(
              ctx,
              word.text,
              wx + offsets[oi][0],
              wy + offsets[oi][1],
              direction
            );
          }
          ctx.fillStyle = word.isKeyword ? keywordColor : '#FFFFFF';
          drawBidiWord(ctx, word.text, wx, wy, direction);
        }
      } else {
        ctx.globalAlpha = clamp(wordEase * masterAlpha, 0, 1);
        if (word.isKeyword) {
          ctx.shadowColor = hexToRgba(
            isLight ? accentColor : keywordColor,
            isBlack ? 0.65 : isLight ? 0.35 : 0.55
          );
          ctx.shadowBlur = isLight ? 12 : 16;
          ctx.fillStyle = keywordColor;
        } else {
          ctx.shadowColor = isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(0, 0, 0, 0.55)';
          ctx.shadowBlur = isLight ? 6 : 8;
          ctx.fillStyle = isLight ? '#0F172A' : '#F8FAFC';
        }
        drawBidiWord(ctx, word.text, wx, wy, direction);
      }

      ctx.restore();
    }
  }
  ctx.restore();

  // 4. Draw deterministic path-sampled trail & flying creature
  const creatureScale = clamp(layout.fontSize / 42, 0.85, 1.38);
  drawFlyerTrail(
    ctx,
    waypoints,
    t,
    effective.exitStart,
    effective.total,
    creature,
    accentColor,
    bgMode,
    creatureScale,
    custom.seed,
    theme,
    flightSpeed
  );

  const st = sampleFlightWaypoints(waypoints, t, effective.exitStart, effective.total);
  if (st.visibleAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = isGreen ? (st.visibleAlpha > 0.2 ? 1 : 0) : st.visibleAlpha;
    if (ctx.globalAlpha > 0) {
      drawFlyerCreature({
        ctx,
        creature,
        x: st.x,
        y: st.y,
        vx: st.vx,
        vy: st.vy,
        speedNorm: st.speedNorm,
        hoverBoost: st.hoverBoost,
        t,
        scale: creatureScale,
        accentColor,
        bgMode,
        seed: custom.seed,
        theme,
        flightSpeed,
      });
    }
    ctx.restore();
  }
};

// ============================================================================
// 2) POINTS FLYER (pts_flyer) SCHEDULE, LAYOUT & RENDERER
// ============================================================================

export function buildPointsFlyerPlan(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  custom: StyleCustomization,
  size: RenderSize
) {
  const { schedule, layout } = buildAutoFitPointsLayout({
    ctx,
    content,
    custom,
    size,
    styleId: 'pts_flyer',
    allowedArabicFonts: PTS_FLYER_CONFIG.allowedFonts,
    defaultArabicFont: PTS_FLYER_CONFIG.defaultQuoteFont,
    defaultEnglishFont: PTS_FLYER_CONFIG.defaultEnglishQuoteFont,
    fontWeight: 700,
    minFontSize: 20,
    maxFontSize: 44,
    lineHeightRatio: 1.56,
    supportedMarkerTypes: PTS_FLYER_CONFIG.supportedMarkerTypes,
    defaultMarkerType: PTS_FLYER_CONFIG.defaultMarkerType,
    innerPadXRatio: 0.045,
    innerPadYRatio: 0.055,
  });

  const { baseWidth: W, baseHeight: H } = size;
  const waypoints: FlightWaypoint[] = [];
  const flyLift = Math.max(20, layout.fontSize * 0.56);
  const flightSpeed = resolveFlyerFlightSpeed(custom);
  const speedFactor = clamp(0.55 / flightSpeed, 0.44, 2.2);

  // Entry waypoint leads smoothly into title (sweeping toward item 0's marker edge) or directly into item 0
  const firstSlot = layout.items[0];
  const isFirstLtr = firstSlot?.direction === 'ltr';
  const hasTitle = Boolean(layout.titleLayout && layout.titleText.length > 0);
  const titleStartX = clamp(
    layout.boxX + layout.boxW * (isFirstLtr ? 0.66 : 0.34),
    42,
    W - 42
  );
  const titleEndX = clamp(
    layout.boxX + layout.boxW * (isFirstLtr ? 0.34 : 0.66),
    42,
    W - 42
  );

  const entryX = hasTitle
    ? clamp(titleStartX + (isFirstLtr ? 46 : -46), 42, W - 42)
    : firstSlot
      ? clamp(firstSlot.markerCenterX + (isFirstLtr ? -48 : 48), 42, W - 42)
      : W * 0.5;
  const entryY = hasTitle
    ? clamp(layout.titleY - 22, 38, H - 38)
    : firstSlot
      ? clamp(firstSlot.slotY - 28, 38, H - 38)
      : H * 0.25;
  waypoints.push({ t: 0, x: entryX, y: entryY, isHover: false, keywordGlow: 0.15 });

  const pushPointsWp = (tVal: number, xVal: number, yVal: number, glow: number) => {
    const prevT = waypoints.length > 0 ? waypoints[waypoints.length - 1].t : -1;
    const safeT = Number(Math.max(tVal, prevT + 0.045).toFixed(3));
    waypoints.push({
      t: safeT,
      x: clamp(xVal, 42, W - 42),
      y: clamp(yVal, 38, H - 38),
      isHover: false,
      keywordGlow: glow,
    });
  };

  if (hasTitle) {
    const titleFlyY = clamp(layout.titleY - 14, 38, H - 38);
    pushPointsWp(0.18, titleStartX, titleFlyY - 6, 0.42);
    pushPointsWp(0.42, titleEndX, titleFlyY, 0.52);
  }

  const timing = content.pointsTiming || custom.pointsTiming;
  const wipeDur = clamp(
    timing?.flyerRevealDuration ?? 0.65 * clamp(speedFactor, 0.72, 1.38),
    0.2,
    2.2
  );

  // Lazy, gradual vertical S-wave winding calmly down through all points (zero row-to-row snap-backs)
  if (layout.items.length > 0) {
    const centerBlockX = clamp(layout.boxX + layout.boxW * 0.5, 100, W - 100);
    const waveAmpX = clamp(layout.boxW * 0.24, 86, 230);
    const readingDir = isFirstLtr ? 1 : -1;
    const itemCount = layout.items.length;
    const firstRowY = clamp(
      layout.items[0].slotY + Math.max(10, layout.items[0].slotH * 0.22) - flyLift * 0.35,
      44,
      H - 44
    );
    const lastSlot = layout.items[itemCount - 1];
    const lastRowY = clamp(
      lastSlot.slotY + Math.max(10, lastSlot.slotH * 0.22) - flyLift * 0.35,
      44,
      H - 44
    );
    const waveStartT = layout.items[0].sched.startTime;
    const lastNextStart =
      lastSlot.sched.startTime +
      Math.max(0.55, Math.min(1.1, (schedule.exitStart - lastSlot.sched.startTime) * 0.72));
    const waveEndT = Math.max(waveStartT + 0.6, Math.min(schedule.exitStart - 0.12, lastNextStart));

    // One gentle half-wave per ~2.4 rows so the curve stays wide, unhurried, and completely corner-free up to 12 rows
    const totalHalfCycles = Math.max(1.0, Math.min(3.0, itemCount * 0.42));
    const sampleCount = Math.max(5, Math.round(totalHalfCycles * 4) + 1);

    for (let s = 0; s < sampleCount; s++) {
      const u = s / (sampleCount - 1);
      const st = lerp(waveStartT, waveEndT, u);
      const phase = u * Math.PI * totalHalfCycles;
      const sx = centerBlockX - readingDir * Math.cos(phase) * waveAmpX;
      const sy = lerp(firstRowY - 10, lastRowY + 14, u) - Math.sin(phase) * 14;

      // Boost glow smoothly when passing near an item with keywords
      let glow = 0.35;
      for (const slot of layout.items) {
        if (slot.layout.keywordLineRects.length > 0 && Math.abs(st - slot.sched.startTime) < 0.65) {
          glow = Math.max(glow, 0.9);
        }
      }
      pushPointsWp(st, sx, sy, glow);
    }
  }

  // Continuous ambient glide around the points container matching final row tangent (never reverses abruptly)
  if (waypoints.length > 0) {
    const lastWp = waypoints[waypoints.length - 1];
    const prevWp = waypoints.length > 1 ? waypoints[waypoints.length - 2] : lastWp;
    const centerX = clamp(layout.boxX + layout.boxW * 0.5, 80, W - 80);
    const centerY = clamp(layout.boxY + layout.boxH * 0.5, 80, H - 80);
    const rx = clamp(layout.boxW * 0.44, 90, W * 0.42);
    const ry = clamp(layout.boxH * 0.42, 64, H * 0.36);

    const relX = (lastWp.x - centerX) / Math.max(1, rx);
    const relY = (lastWp.y - centerY) / Math.max(1, ry);
    const velX = lastWp.x - prevWp.x;
    const velY = lastWp.y - prevWp.y;
    const cross = relX * velY - relY * velX;
    const angularDir = cross >= 0 ? 1 : -1;

    const startAngle =
      Math.hypot(relX, relY) < 0.35
        ? Math.atan2(velY, velX || (isFirstLtr ? 1 : -1))
        : Math.atan2(relY, relX);
    const stepTime = clamp(1.25 * speedFactor, 0.68, 2.05);
    const stepAngle = angularDir * (Math.PI * 0.28);

    let orbitT = lastWp.t + stepTime * 0.72;
    let stepIdx = 1;
    while (orbitT < schedule.totalDuration - 0.15) {
      const ang = startAngle + stepIdx * stepAngle;
      waypoints.push({
        t: Number(orbitT.toFixed(3)),
        x: clamp(centerX + Math.cos(ang) * rx, 42, W - 42),
        y: clamp(centerY + Math.sin(ang) * ry - Math.cos(stepIdx * 0.9) * 8, 38, H - 38),
        isHover: false,
        keywordGlow: 0.26,
      });
      orbitT += stepTime;
      stepIdx++;
    }

    const finalPrev = waypoints[waypoints.length - 1];
    const endT = Math.max(finalPrev.t + 0.04, schedule.totalDuration);
    const finalAng = startAngle + stepIdx * stepAngle * 0.75;
    waypoints.push({
      t: Number(endT.toFixed(3)),
      x: clamp(centerX + Math.cos(finalAng) * rx, 42, W - 42),
      y: clamp(centerY + Math.sin(finalAng) * ry - 10, 38, H - 38),
      isHover: false,
      keywordGlow: 0.2,
    });
  }

  return { schedule, layout, waypoints, wipeDur };
}

export function getPtsFlyerEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  _timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const { schedule, layout } = buildPointsFlyerPlan(ctx, content, custom, size);
  return {
    enterStart: 0.08,
    itemTimes: schedule.itemTimes,
    keywordTimes: layout.allKeywordTimes,
  };
}

export const renderPtsFlyer: PureStyleRenderer = (
  ctx,
  t,
  content,
  _timeline,
  custom,
  size
) => {
  const { baseWidth: W, baseHeight: H } = size;
  const bgMode = resolveBackgroundMode(custom);
  const isGreen = bgMode === 'green';
  const isBlack = bgMode === 'black';
  const theme = resolveFlyerTheme(custom);
  const isLight = !isGreen && !isBlack && theme === 'light';
  const creature = resolveFlyerCreature(custom.flyerCreature);
  const flightSpeed = resolveFlyerFlightSpeed(custom);
  const creatureMeta = getFlyerCreatureMeta(creature);
  const accentColor = custom.accentColor || creatureMeta.defaultAccent;
  const rawKeyword = custom.keywordColor || creatureMeta.defaultKeyword;
  const isDefaultPaleKeyword =
    rawKeyword.toUpperCase() === '#FDE047' ||
    rawKeyword.toUpperCase() === '#FFF3B0' ||
    rawKeyword.toUpperCase() === '#FFD166';
  const keywordColor = isLight && isDefaultPaleKeyword ? '#D97706' : rawKeyword;
  const primaryTextColor = isGreen ? '#FFFFFF' : isLight ? '#0F172A' : '#F8FAFC';

  // 1. Background
  drawStyleBackdropAndBokeh(
    ctx,
    W,
    H,
    creature,
    accentColor,
    bgMode,
    custom.seed,
    t,
    theme,
    flightSpeed
  );

  // 2. Layout & Flight Plan
  const { schedule, layout, waypoints, wipeDur } = buildPointsFlyerPlan(ctx, content, custom, size);
  const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
  const masterAlpha = 1 - easeInCubic(exitP);

  // 3. Optional Title
  if (layout.titleLayout && layout.titleText.length > 0) {
    const titleP = easeOutCubic(progress(t, 0.08, 0.45));
    if (titleP > 0.01) {
      ctx.save();
      ctx.globalAlpha = isGreen ? (titleP > 0.25 && masterAlpha > 0.25 ? 1 : 0) : titleP * masterAlpha;
      if (ctx.globalAlpha > 0) {
        const titleOriginX = layout.boxX + Math.round(layout.boxW * 0.04);
        drawPointTextWithWipeAndKeywords({
          ctx,
          layout: layout.titleLayout,
          originX: titleOriginX,
          originY: layout.titleY,
          wipeProgress: titleP,
          textColor: primaryTextColor,
          keywordColor,
          underlineKeywords: true,
          outlineColor: isGreen ? '#0B1320' : undefined,
          outlineWidth: isGreen ? 2.5 : undefined,
        });
      }
      ctx.restore();
    }
  }

  // 4. Reveal Points Items (unrevealed items are completely hidden so creature never covers unrevealed text)
  const highlightCurrent = custom.pointsHighlightCurrent !== false;

  for (let i = 0; i < layout.items.length; i++) {
    const slot = layout.items[i];
    const itemT = t - slot.sched.startTime;
    if (itemT <= 0.001) continue; // Unrevealed point -> not drawn yet

    const revealP = easeOutCubic(clamp(itemT / wipeDur, 0, 1));
    const nextStart =
      i + 1 < layout.items.length ? layout.items[i + 1].sched.startTime : Infinity;
    const dimP =
      highlightCurrent && t >= nextStart
        ? easeOutCubic(clamp((t - nextStart) / 0.25, 0, 1))
        : 0;
    const itemAlpha = lerp(1, 0.58, dimP) * revealP * masterAlpha;

    ctx.save();
    ctx.globalAlpha = isGreen ? (revealP > 0.2 && masterAlpha > 0.2 ? 1 : 0) : itemAlpha;

    if (ctx.globalAlpha > 0) {
      // Subtle translucent row backing in style/black mode
      if (!isGreen) {
        ctx.fillStyle = isBlack
          ? 'rgba(255, 255, 255, 0.045)'
          : isLight
            ? 'rgba(255, 255, 255, 0.82)'
            : 'rgba(15, 23, 42, 0.38)';
        ctx.beginPath();
        ctx.roundRect(slot.slotX, slot.slotY, slot.slotW, slot.slotH, 12);
        ctx.fill();
        if (isLight) {
          ctx.strokeStyle = hexToRgba(accentColor, 0.32);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      // Marker badge / number
      if (slot.markerText) {
        const markerDur = Math.min(0.45, Math.max(0.22, wipeDur * 0.78));
        const markerScale = easeOutBack(clamp(itemT / markerDur, 0, 1));
        ctx.save();
        ctx.translate(slot.markerCenterX, slot.markerCenterY);
        ctx.scale(markerScale, markerScale);
        const badgeR = Math.max(14, Math.round(layout.fontSize * 0.58));

        ctx.fillStyle = isGreen
          ? accentColor
          : hexToRgba(accentColor, isLight ? 0.18 : 0.22);
        ctx.beginPath();
        ctx.arc(0, 0, badgeR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isGreen ? '#0B1320' : accentColor;
        ctx.lineWidth = isGreen ? 2.2 : 1.6;
        ctx.stroke();

        ctx.font = `800 ${Math.round(layout.fontSize * 0.68)}px "${layout.fontFamily}", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isGreen ? '#0B1320' : isLight ? '#0F172A' : '#FFFFFF';
        ctx.fillText(slot.markerText, 0, 1);
        ctx.restore();
      }

      // Item text words with horizontal wipe & connected Arabic ligatures
      drawPointTextWithWipeAndKeywords({
        ctx,
        layout: slot.layout,
        originX: slot.textX,
        originY: slot.textY,
        wipeProgress: revealP,
        textColor: primaryTextColor,
        keywordColor,
        underlineKeywords: true,
        outlineColor: isGreen ? '#0B1320' : undefined,
        outlineWidth: isGreen ? 2.4 : undefined,
      });
    }

    ctx.restore();
  }

  // 5. Trail & Flying Creature
  const creatureScale = clamp(layout.fontSize / 34, 0.85, 1.32);
  drawFlyerTrail(
    ctx,
    waypoints,
    t,
    schedule.exitStart,
    schedule.totalDuration,
    creature,
    accentColor,
    bgMode,
    creatureScale,
    custom.seed,
    theme,
    flightSpeed
  );

  const st = sampleFlightWaypoints(
    waypoints,
    t,
    schedule.exitStart,
    schedule.totalDuration
  );
  if (st.visibleAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = isGreen ? (st.visibleAlpha > 0.2 ? 1 : 0) : st.visibleAlpha;
    if (ctx.globalAlpha > 0) {
      drawFlyerCreature({
        ctx,
        creature,
        x: st.x,
        y: st.y,
        vx: st.vx,
        vy: st.vy,
        speedNorm: st.speedNorm,
        hoverBoost: st.hoverBoost,
        t,
        scale: creatureScale,
        accentColor,
        bgMode,
        seed: custom.seed,
        theme,
        flightSpeed,
      });
    }
    ctx.restore();
  }
};
