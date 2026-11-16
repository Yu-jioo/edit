import {
  ArabicFontFamily,
  EnglishFontFamily,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  SceneEventTimes,
  StyleCustomization,
  StyleId,
  StyleMetadata,
  TimelineConfig,
} from '../types';
import {
  CHAT_MODERN_CONFIG,
  getChatModernEventTimes,
  renderChatModern,
} from './chat1Modern';
import {
  CHAT_TERMINAL_CONFIG,
  getChatTerminalEventTimes,
  renderChatTerminal,
} from './chat2Terminal';
import {
  getImgPolaroidEventTimes,
  IMG_POLAROID_CONFIG,
  renderImgPolaroid,
} from './image1Polaroid';
import {
  getImgBrowserEventTimes,
  IMG_BROWSER_CONFIG,
  renderImgBrowser,
} from './image2Browser';
import {
  getImgNewspaperEventTimes,
  IMG_NEWSPAPER_CONFIG,
  renderImgNewspaper,
} from './image3Newspaper';
import {
  getImgCinematicEventTimes,
  IMG_CINEMATIC_CONFIG,
  renderImgCinematic,
} from './image4Cinematic';
import {
  getImgFloatingEventTimes,
  IMG_FLOATING_CONFIG,
  renderImgFloating,
} from './image5Floating';
import {
  getImgSpotlightEventTimes,
  IMG_SPOTLIGHT_CONFIG,
  renderImgSpotlight,
} from './image6Spotlight';
import {
  CALLIGRAPHY_INK_CONFIG,
  getCalligraphyEventTimes,
  renderCalligraphyInk,
} from './phrase1Calligraphy';
import {
  getTornPaperEventTimes,
  renderTornPaper,
  TORN_PAPER_CONFIG,
} from './phrase2TornPaper';
import {
  getPixelTerminalEventTimes,
  PIXEL_TERMINAL_CONFIG,
  renderPixelTerminal,
} from './phrase4PixelTerminal';
import {
  getOldTypewriterEventTimes,
  OLD_TYPEWRITER_CONFIG,
  renderOldTypewriter,
} from './phrase5OldTypewriter';
import {
  ANNOTATE_CONFIG,
  getAnnotateEventTimes,
  renderAnnotate,
} from './phrase6Annotate';
import {
  getPtsCleanEventTimes,
  PTS_CLEAN_CONFIG,
  renderPtsClean,
} from './points1Clean';
import {
  getPtsCardsEventTimes,
  PTS_CARDS_CONFIG,
  renderPtsCards,
} from './points2Cards';
import {
  getPtsChecklistEventTimes,
  PTS_CHECKLIST_CONFIG,
  renderPtsChecklist,
} from './points3Checklist';
import {
  getPtsTimelineEventTimes,
  PTS_TIMELINE_CONFIG,
  renderPtsTimeline,
  resolveTimelineTheme,
} from './points4Timeline';
import {
  getPtsTerminalEventTimes,
  PTS_TERMINAL_CONFIG,
  renderPtsTerminal,
} from './points5Terminal';
import {
  getPtsRankingEventTimes,
  PTS_RANKING_CONFIG,
  renderPtsRanking,
} from './points6Ranking';
import {
  getMidnightBlueEventTimes,
  MIDNIGHT_BLUE_CONFIG,
  renderMidnightBlue,
} from './style1MidnightBlue';
import {
  getManuscriptEventTimes,
  MANUSCRIPT_CONFIG,
  renderManuscript,
} from './style2Manuscript';
import {
  getModernMinimalEventTimes,
  MODERN_MINIMAL_CONFIG,
  renderModernMinimal,
} from './style3ModernMinimal';
import {
  getGlassmorphismEventTimes,
  GLASSMORPHISM_CONFIG,
  renderGlassmorphism,
} from './style4Glassmorphism';
import {
  DOCUMENTARY_CONFIG,
  getDocumentaryEventTimes,
  renderDocumentary,
} from './style5Documentary';
import {
  CINEMATIC_CONFIG,
  getCinematicEventTimes,
  renderCinematic,
} from './style6Cinematic';
import {
  CHAT_FLOAT_GLASS_CONFIG,
  getChatFloatingEventTimes,
  getImageFloatingEventTimes,
  getPhraseFloatingEventTimes,
  getPointsFloatingEventTimes,
  getQuoteFloatingEventTimes,
  IMG_FLOAT_GLASS_CONFIG,
  isFloatingStyleId,
  PHRASE_FLOAT_GLASS_CONFIG,
  PTS_FLOAT_GLASS_CONFIG,
  QUOTE_FLOAT_GLASS_CONFIG,
  renderChatFloatGlass,
  renderImgFloatGlass,
  renderPhraseFloatGlass,
  renderPtsFloatGlass,
  renderQuoteFloatGlass,
} from './floatingEngine';
import {
  DEFAULT_FLYER_FLIGHT_SPEED,
  drawCreaturePreviewThumbnail,
  FLYER_CREATURES,
  FLYER_DEFAULT_TINTS,
  getFlyerCreatureMeta,
  getPhraseFlyerEventTimes,
  getPtsFlyerEventTimes,
  isFlyerStyleId,
  PHRASE_FLYER_CONFIG,
  PTS_FLYER_CONFIG,
  renderPhraseFlyer,
  renderPtsFlyer,
  resolveFlyerCreature,
  resolveFlyerFlightSpeed,
  resolveFlyerTheme,
} from './flyer_core';
import {
  getVidCrtEventTimes,
  renderVidCrt,
  VID_CRT_CONFIG,
} from './video1Crt';
import {
  getVidPhoneEventTimes,
  renderVidPhone,
  VID_PHONE_CONFIG,
} from './video2Phone';
import {
  getVidCinematicEventTimes,
  renderVidCinematic,
  VID_CINEMATIC_CONFIG,
} from './video3Cinematic';
import {
  getVidFloatingEventTimes,
  renderVidFloating,
  VID_FLOATING_CONFIG,
} from './video4Floating';
import {
  getVidPipEventTimes,
  renderVidPip,
  VID_PIP_CONFIG,
} from './video5Pip';
import {
  getVidCamcorderEventTimes,
  renderVidCamcorder,
  VID_CAMCORDER_CONFIG,
} from './video6Camcorder';

export {
  DEFAULT_FLYER_FLIGHT_SPEED,
  drawCreaturePreviewThumbnail,
  FLYER_CREATURES,
  FLYER_DEFAULT_TINTS,
  getFlyerCreatureMeta,
  isFloatingStyleId,
  isFlyerStyleId,
  resolveFlyerCreature,
  resolveFlyerFlightSpeed,
  resolveFlyerTheme,
  resolveTimelineTheme,
};

export const QUOTE_STYLES_LIST: StyleMetadata[] = [
  MIDNIGHT_BLUE_CONFIG,
  MANUSCRIPT_CONFIG,
  MODERN_MINIMAL_CONFIG,
  GLASSMORPHISM_CONFIG,
  DOCUMENTARY_CONFIG,
  CINEMATIC_CONFIG,
  QUOTE_FLOAT_GLASS_CONFIG,
];

export const PHRASE_STYLES_LIST: StyleMetadata[] = [
  CALLIGRAPHY_INK_CONFIG,
  TORN_PAPER_CONFIG,
  ANNOTATE_CONFIG,
  PIXEL_TERMINAL_CONFIG,
  OLD_TYPEWRITER_CONFIG,
  PHRASE_FLOAT_GLASS_CONFIG,
  PHRASE_FLYER_CONFIG,
];

export const CHAT_STYLES_LIST: StyleMetadata[] = [
  CHAT_MODERN_CONFIG,
  CHAT_TERMINAL_CONFIG,
  CHAT_FLOAT_GLASS_CONFIG,
];

export const POINTS_STYLES_LIST: StyleMetadata[] = [
  PTS_CLEAN_CONFIG,
  PTS_CARDS_CONFIG,
  PTS_CHECKLIST_CONFIG,
  PTS_TIMELINE_CONFIG,
  PTS_TERMINAL_CONFIG,
  PTS_RANKING_CONFIG,
  PTS_FLOAT_GLASS_CONFIG,
  PTS_FLYER_CONFIG,
];

export const IMAGE_STYLES_LIST: StyleMetadata[] = [
  IMG_POLAROID_CONFIG,
  IMG_BROWSER_CONFIG,
  IMG_NEWSPAPER_CONFIG,
  IMG_CINEMATIC_CONFIG,
  IMG_FLOATING_CONFIG,
  IMG_SPOTLIGHT_CONFIG,
  IMG_FLOAT_GLASS_CONFIG,
];

export const VIDEO_STYLES_LIST: StyleMetadata[] = [
  VID_CRT_CONFIG,
  VID_PHONE_CONFIG,
  VID_CINEMATIC_CONFIG,
  VID_FLOATING_CONFIG,
  VID_PIP_CONFIG,
  VID_CAMCORDER_CONFIG,
];

export const STYLES_LIST: StyleMetadata[] = QUOTE_STYLES_LIST;

export const ALL_STYLES_LIST: StyleMetadata[] = [
  ...QUOTE_STYLES_LIST,
  ...PHRASE_STYLES_LIST,
  ...CHAT_STYLES_LIST,
  ...POINTS_STYLES_LIST,
  ...IMAGE_STYLES_LIST,
  ...VIDEO_STYLES_LIST,
];

export const STYLE_RENDERERS: Record<StyleId, PureStyleRenderer> = {
  'midnight-blue': renderMidnightBlue,
  manuscript: renderManuscript,
  'modern-minimal': renderModernMinimal,
  glassmorphism: renderGlassmorphism,
  documentary: renderDocumentary,
  cinematic: renderCinematic,
  quote_float_glass: renderQuoteFloatGlass,
  'calligraphy-ink': renderCalligraphyInk,
  'torn-paper': renderTornPaper,
  annotate: renderAnnotate,
  pixel_terminal: renderPixelTerminal,
  old_typewriter: renderOldTypewriter,
  phrase_float_glass: renderPhraseFloatGlass,
  phrase_flyer: renderPhraseFlyer,
  chat_modern: renderChatModern,
  chat_terminal: renderChatTerminal,
  chat_float_glass: renderChatFloatGlass,
  pts_clean: renderPtsClean,
  pts_cards: renderPtsCards,
  pts_checklist: renderPtsChecklist,
  pts_timeline: renderPtsTimeline,
  pts_terminal: renderPtsTerminal,
  pts_ranking: renderPtsRanking,
  pts_float_glass: renderPtsFloatGlass,
  pts_flyer: renderPtsFlyer,
  img_polaroid: renderImgPolaroid,
  img_browser: renderImgBrowser,
  img_newspaper: renderImgNewspaper,
  img_cinematic: renderImgCinematic,
  img_floating: renderImgFloating,
  img_spotlight: renderImgSpotlight,
  img_float_glass: renderImgFloatGlass,
  vid_crt: renderVidCrt,
  vid_phone: renderVidPhone,
  vid_cinematic: renderVidCinematic,
  vid_floating: renderVidFloating,
  vid_pip: renderVidPip,
  vid_camcorder: renderVidCamcorder,
};

export type EventTimeGetter = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
) => SceneEventTimes;

export const STYLE_EVENT_TIME_GETTERS: Record<StyleId, EventTimeGetter> = {
  'midnight-blue': getMidnightBlueEventTimes,
  manuscript: getManuscriptEventTimes,
  'modern-minimal': getModernMinimalEventTimes,
  glassmorphism: getGlassmorphismEventTimes,
  documentary: getDocumentaryEventTimes,
  cinematic: getCinematicEventTimes,
  quote_float_glass: getQuoteFloatingEventTimes,
  'calligraphy-ink': getCalligraphyEventTimes,
  'torn-paper': getTornPaperEventTimes,
  annotate: getAnnotateEventTimes,
  pixel_terminal: getPixelTerminalEventTimes,
  old_typewriter: getOldTypewriterEventTimes,
  phrase_float_glass: getPhraseFloatingEventTimes,
  phrase_flyer: getPhraseFlyerEventTimes,
  chat_modern: getChatModernEventTimes,
  chat_terminal: getChatTerminalEventTimes,
  chat_float_glass: getChatFloatingEventTimes,
  pts_clean: getPtsCleanEventTimes,
  pts_cards: getPtsCardsEventTimes,
  pts_checklist: getPtsChecklistEventTimes,
  pts_timeline: getPtsTimelineEventTimes,
  pts_terminal: getPtsTerminalEventTimes,
  pts_ranking: getPtsRankingEventTimes,
  pts_float_glass: getPointsFloatingEventTimes,
  pts_flyer: getPtsFlyerEventTimes,
  img_polaroid: getImgPolaroidEventTimes,
  img_browser: getImgBrowserEventTimes,
  img_newspaper: getImgNewspaperEventTimes,
  img_cinematic: getImgCinematicEventTimes,
  img_floating: getImgFloatingEventTimes,
  img_spotlight: getImgSpotlightEventTimes,
  img_float_glass: getImageFloatingEventTimes,
  vid_crt: getVidCrtEventTimes,
  vid_phone: getVidPhoneEventTimes,
  vid_cinematic: getVidCinematicEventTimes,
  vid_floating: getVidFloatingEventTimes,
  vid_pip: getVidPipEventTimes,
  vid_camcorder: getVidCamcorderEventTimes,
};

export const ARABIC_FONTS_LIST: { family: ArabicFontFamily; labelAr: string }[] = [
  { family: 'Amiri', labelAr: 'أميري (Amiri — نسخي كلاسيكي)' },
  { family: 'Aref Ruqaa', labelAr: 'عارف رقعة (Aref Ruqaa — خط رقعة)' },
  { family: 'Aref Ruqaa Ink', labelAr: 'عارف رقعة بالحبر (Aref Ruqaa Ink)' },
  { family: 'Noto Naskh Arabic', labelAr: 'نوتو نسخ (Noto Naskh — واضح ورسمي)' },
  { family: 'Noto Kufi Arabic', labelAr: 'نوتو كوفي (Noto Kufi — هندسي عريض)' },
  { family: 'Cairo', labelAr: 'القاهرة (Cairo — عصري متوازن)' },
  { family: 'Readex Pro', labelAr: 'ريدكس برو (Readex Pro — هندسي حديث)' },
  { family: 'IBM Plex Sans Arabic', labelAr: 'آي بي إم بليكس (IBM Plex Sans)' },
  { family: 'Reem Kufi', labelAr: 'ريم كوفي (Reem Kufi — سينمائي عريض)' },
  { family: 'El Messiri', labelAr: 'المسيري (El Messiri — فني أنيق)' },
  { family: 'Tajawal', labelAr: 'تجوال (Tajawal — ناعم وبسيط)' },
  { family: 'Lalezar', labelAr: 'لاله زار (Lalezar — عناوين جريئة)' },
  { family: 'Rakkas', labelAr: 'رقّاص (Rakkas — ديواني فني بارز)' },
  { family: 'Changa', labelAr: 'تشانغا (Changa — حماسي معاصر)' },
  { family: 'Almarai', labelAr: 'المراعي عادي (Almarai Regular — 400)' },
  { family: 'Almarai Bold', labelAr: 'المراعي عريض (Almarai Bold — 700)' },
  { family: 'Almarai ExtraBold', labelAr: 'المراعي أكثر سماكة (Almarai ExtraBold — 800)' },
  { family: 'Katibeh', labelAr: 'كتيبة (Katibeh — عنوان تراثي)' },
  { family: 'KOMission Black', labelAr: 'كوميشن بلاك (KOMission Black — عريض جريء)' },
  { family: 'Zain Rounded instance mob', labelAr: 'زين مدور (Zain Rounded — ناعم مستدير)' },
  { family: '29LT Azahar Display AL TN Trial Bold', labelAr: 'أزهار ديسبلاي بولد (29LT Azahar Display Bold — عريض أنيق)' },
];

export const AUTHOR_ARABIC_FONTS_LIST = ARABIC_FONTS_LIST.filter(
  (f) => f.family !== 'Almarai Bold' && f.family !== 'Almarai ExtraBold'
);

export const ENGLISH_FONTS_LIST: { family: EnglishFontFamily; labelEn: string; labelAr: string }[] = [
  { family: 'Special Elite', labelEn: 'Special Elite (Typewriter Vintage)', labelAr: 'سبيشال إيليت (آلة كاتبة عتيقة)' },
  { family: 'Playfair Display', labelEn: 'Playfair Display (Editorial Serif)', labelAr: 'بلايفير ديسبلاي (سيريف تحريري أنيق)' },
  { family: 'Cormorant Garamond', labelEn: 'Cormorant Garamond (Classical Literary)', labelAr: 'كورمورانت غاراموند (كلاسيكي أدبي)' },
  { family: 'Lora', labelEn: 'Lora (Contemporary Book Serif)', labelAr: 'لورا (سيريف حديث للكتب)' },
  { family: 'Cinzel', labelEn: 'Cinzel (Cinematic Inscriptional)', labelAr: 'سينزل (سينمائي حجري فخم)' },
  { family: 'Plus Jakarta Sans', labelEn: 'Plus Jakarta Sans (Modern Geometric)', labelAr: 'بلس جاكرتا (هندسي عصري ناصع)' },
  { family: 'Outfit', labelEn: 'Outfit (Clean Tech Sans)', labelAr: 'أوتفيت (سانز تقني نقي)' },
  { family: 'Manrope', labelEn: 'Manrope (Contemporary Grotesque)', labelAr: 'مانروب (غروتسك حديث)' },
  { family: 'Share Tech Mono', labelEn: 'Share Tech Mono (Console / Terminal)', labelAr: 'شير تك مونو (شاشة طرفية برمجية)' },
  { family: 'VT323', labelEn: 'VT323 (Retro CRT Pixel)', labelAr: 'في تي 323 (بكسل ريترو CRT)' },
  { family: 'JetBrains Mono', labelEn: 'JetBrains Mono (Modern Monospace)', labelAr: 'جيت برينز مونو (أحادي المسافة حديث)' },
  { family: 'Oswald', labelEn: 'Oswald (Condensed Poster)', labelAr: 'أوزوالد (ملصقات مكثف جريء)' },
  { family: 'Bebas Neue', labelEn: 'Bebas Neue (Bold Display)', labelAr: 'بيباس نيو (عرض عريض قوي)' },
];

export function getStyleMetadata(styleId: StyleId): StyleMetadata {
  return ALL_STYLES_LIST.find((s) => s.id === styleId) || MIDNIGHT_BLUE_CONFIG;
}

export function resolveActiveStyleId(custom: StyleCustomization): StyleId {
  if (custom.mode === 'video') {
    if (custom.videoStyleId && custom.videoStyleId in STYLE_RENDERERS) {
      return custom.videoStyleId;
    }
    if (custom.styleId in STYLE_RENDERERS && getStyleMetadata(custom.styleId).mode === 'video') {
      return custom.styleId;
    }
    return 'vid_floating';
  }
  if (custom.mode === 'image') {
    if (custom.imageStyleId && custom.imageStyleId in STYLE_RENDERERS) {
      return custom.imageStyleId;
    }
    if (custom.styleId in STYLE_RENDERERS && getStyleMetadata(custom.styleId).mode === 'image') {
      return custom.styleId;
    }
    return 'img_polaroid';
  }
  if (custom.mode === 'points') {
    if (custom.pointsStyleId && custom.pointsStyleId in STYLE_RENDERERS) {
      return custom.pointsStyleId;
    }
    if (custom.styleId in STYLE_RENDERERS && getStyleMetadata(custom.styleId).mode === 'points') {
      return custom.styleId;
    }
    return 'pts_clean';
  }
  if (custom.mode === 'chat') {
    if (custom.chatStyleId && custom.chatStyleId in STYLE_RENDERERS) {
      return custom.chatStyleId;
    }
    if (custom.styleId in STYLE_RENDERERS && getStyleMetadata(custom.styleId).mode === 'chat') {
      return custom.styleId;
    }
    return 'chat_modern';
  }
  if (custom.mode === 'phrase') {
    if (custom.phraseStyleId && custom.phraseStyleId in STYLE_RENDERERS) {
      return custom.phraseStyleId;
    }
    if (custom.styleId in STYLE_RENDERERS && getStyleMetadata(custom.styleId).mode === 'phrase') {
      return custom.styleId;
    }
    return 'calligraphy-ink';
  }
  return custom.styleId;
}

/**
 * Returns deterministic { enterStart, keywordTimes[], sendTimes[], receiveTimes[], keystrokeTimes[] }
 * for any Quote, Key Phrase, or AI Chat scene.
 */
export function getSceneEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  const activeId = resolveActiveStyleId(custom);
  const getter = STYLE_EVENT_TIME_GETTERS[activeId] || getMidnightBlueEventTimes;
  return getter(ctx, content, timeline, custom, size);
}

export interface SceneEventTimesInput {
  ctx?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  content: QuoteContent;
  timeline: TimelineConfig;
  custom: StyleCustomization;
  viewport?: RenderSize;
  size?: RenderSize;
}

export function getEventTimes(
  sceneOrCtx:
    | SceneEventTimesInput
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D,
  content?: QuoteContent,
  timeline?: TimelineConfig,
  custom?: StyleCustomization,
  size?: RenderSize
): SceneEventTimes {
  if ('content' in sceneOrCtx && 'custom' in sceneOrCtx) {
    const baseW = sceneOrCtx.custom.format === '16:9' ? 1920 : 1080;
    const baseH = sceneOrCtx.custom.format === '16:9' ? 1080 : 1920;
    const resolvedSize: RenderSize = sceneOrCtx.size ||
      sceneOrCtx.viewport || {
        width: baseW,
        height: baseH,
        baseWidth: baseW,
        baseHeight: baseH,
        scale: 1,
      };
    const fallbackCtx =
      sceneOrCtx.ctx ||
      ({
        font: '700 40px Cairo',
        save: () => {},
        restore: () => {},
        measureText: (str: string) => ({ width: Array.from(str).length * 20 }),
      } as unknown as CanvasRenderingContext2D);
    return getSceneEventTimes(
      fallbackCtx,
      sceneOrCtx.content,
      sceneOrCtx.timeline,
      sceneOrCtx.custom,
      resolvedSize
    );
  }
  return getSceneEventTimes(
    sceneOrCtx,
    content!,
    timeline!,
    custom!,
    size!
  );
}

/**
 * Master deterministic canvas render function used identically by:
 * 1) The live interactive preview canvas
 * 2) The live style cards thumbnails (in Quote, Key Phrase, and AI Chat modes)
 * 3) The WebCodecs frame-by-frame MP4 exporter (1080p, 1440p, 4K)
 * 4) The PNG still frame exporter
 */
export function renderQuoteFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  t: number,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): void {
  ctx.save();
  ctx.clearRect(0, 0, size.width, size.height);

  if (size.scale !== 1) {
    ctx.scale(size.scale, size.scale);
  }

  const activeId = resolveActiveStyleId(custom);
  const renderer = STYLE_RENDERERS[activeId] || renderMidnightBlue;
  renderer(ctx, t, content, timeline, custom, size);

  ctx.restore();
}

