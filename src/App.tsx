import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bookmark,
  Camera,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Download,
  Film,
  Maximize2,
  MessageSquare,
  Minimize2,
  Music,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  Trash2,
  Volume2,
  Zap,
} from 'lucide-react';
import { ExportProgressModal } from './components/ExportProgressModal';
import { FlyerCreatureSelector } from './components/FlyerCreatureSelector';
import { PhotoCropControl } from './components/PhotoCropControl';
import { PresetsModal } from './components/PresetsModal';
import { StyleThumbnailCard } from './components/StyleThumbnailCard';
import {
  VideoLayoutAndStyleControls,
  VideoTimingSummaryControls,
  VideoUploadAndClipControls,
} from './components/VideoStudioControls';
import {
  ARABIC_FONTS_LIST,
  AUTHOR_ARABIC_FONTS_LIST,
  CHAT_STYLES_LIST,
  DEFAULT_FLYER_FLIGHT_SPEED,
  ENGLISH_FONTS_LIST,
  FLYER_DEFAULT_TINTS,
  getSceneEventTimes,
  getStyleMetadata,
  IMAGE_STYLES_LIST,
  isFloatingStyleId,
  isFlyerStyleId,
  PHRASE_STYLES_LIST,
  POINTS_STYLES_LIST,
  QUOTE_STYLES_LIST,
  renderQuoteFrame,
  resolveActiveStyleId,
  resolveFlyerCreature,
  resolveFlyerFlightSpeed,
  resolveFlyerTheme,
  resolveTimelineTheme,
  VIDEO_STYLES_LIST,
} from './styles';
import { getPtsTimelineInteractiveTargets } from './styles/points4Timeline';
import {
  AnnotationType,
  ArabicFontFamily,
  BackgroundMode,
  CalligraphyTheme,
  CalmStyleTheme,
  ChatAiReplyStyle,
  ChatMessage,
  ChatRole,
  ChatStyleId,
  ChatTheme,
  ChatTimingConfig,
  EnglishFontFamily,
  ExportFps,
  ExportQuality,
  ExportResolution,
  ExportSettings,
  FlyerCreatureId,
  FlyerCricketPresetId,
  GeometricShape,
  ImageFitMode,
  ImageStyleId,
  MinimalTheme,
  PhrasePosition,
  PhraseStyleId,
  PixelDensity,
  PointsItem,
  PointsMarkerType,
  PointsStyleId,
  PointsTimingConfig,
  QuotationMarkStyle,
  QuoteContent,
  QuoteStyleId,
  SfxSettings,
  SfxType,
  SpotlightShape,
  StudioFontFamily,
  StudioMode,
  StudioPreset,
  StyleCustomization,
  StyleId,
  TextDirection,
  TimelineConfig,
  TimelineOrientation,
  TimelinePathShape,
  TimelineVerticalSide,
  VideoLayoutBox,
  VideoSourceMetadata,
  VideoStyleId,
} from './types';
import {
  getDefaultInsertImageCanvas,
  getImageGreenPixelRatio,
} from './utils/assetCache';
import {
  checkWebCodecsMp4Support,
  ExportProgressState,
  exportMp4Video,
  exportStillPng,
  exportWebMFallback,
} from './utils/exporter';
import {
  clamp,
  clampVideoBoxToSafeMargin,
  countChatTotalWords,
  countPointsStats,
  countWords,
  computeVideoSourceTime,
  computeVideoTimeline,
  DEFAULT_CHAT_MESSAGES,
  DEFAULT_CHAT_TIMING,
  DEFAULT_IMAGE_CAPTION,
  DEFAULT_IMAGE_SOURCE_LINE,
  DEFAULT_IMAGE_TIMELINE,
  DEFAULT_POINTS_ITEMS,
  DEFAULT_POINTS_TIMING,
  DEFAULT_POINTS_TITLE,
  DEFAULT_SPOTLIGHT_REGION,
  DEFAULT_VIDEO_BOX,
  DEFAULT_VIDEO_CAPTION,
  DEFAULT_VIDEO_DURATION,
  DEFAULT_VIDEO_SOURCE_LINE,
  DEFAULT_VIDEO_TIMELINE,
  detectTextDirection,
  getDefaultVideoBoxForPosition,
  getEffectiveTimeline,
  getRenderSize,
  getTypingConfigForCustomization,
  isGreenishColor,
  MAX_POINTS_ITEMS,
  parseQuickPasteChatMessages,
  parseQuickPastePointsItems,
  resizeVideoBoxFromCorner,
  resolveBackgroundMode,
  resolveTextDirection,
  snapVideoBoxToGuides,
  VideoCornerHandle,
} from './utils/math';
import {
  buildFlyerCricketGraph,
  buildSfxGraph,
  DEFAULT_FLYER_CRICKET_PRESET,
  DEFAULT_FLYER_CRICKET_VOLUME,
  hasFlyerCricketAudio,
  resolveFlyerCricketPreset,
  resolveFlyerCricketVolume,
} from './utils/sfx';
import {
  clearLayoutCache,
  ensureArabicFontsLoaded,
  ensureStudioFontsLoaded,
  parseKeywordMarkup,
} from './utils/textLayout';
import {
  getDefaultVideoFrameAt,
  getDefaultVideoPosterCanvas,
  loadVideoAsset,
  VideoPreviewController,
} from './utils/videoSource';

const SAMPLE_QUOTES = [
  {
    label: 'اقتباس فلسفي (عربي)',
    quoteText: 'لا يُمكن للمرء أن يتعلّم *الفلسفة*، بل يتعلّم كيف يتفلسف ويُعمِل عقله في الوجود.',
    authorName: 'إيمانويل كانط',
    subtitle: 'فيلسوف ألماني — 1724 م',
  },
  {
    label: 'English Quote (Steve Jobs)',
    quoteText: 'The only way to do *great work* is to love what you do.',
    authorName: 'Steve Jobs',
    subtitle: 'Co-founder of Apple Inc. — 2005',
  },
  {
    label: 'English Literary (Oscar Wilde)',
    quoteText: 'Be yourself; *everyone else* is already taken.',
    authorName: 'Oscar Wilde',
    subtitle: 'Irish Poet & Playwright',
  },
  {
    label: 'حكمة قصيرة (عربي)',
    quoteText: '*العِلمُ* يَبني بُيوتاً لا عِمادَ لَها',
    authorName: 'أحمد شوقي',
    subtitle: 'أمير الشعراء — 1868 م',
  },
  {
    label: 'نص طويل بالتشكيل (عربي)',
    quoteText:
      'إِنَّمَا الأُمَمُ *الأَخْلاقُ* مَا بَقِيَتْ فَإِنْ هُمُ ذَهَبَتْ أَخْلاقُهُمْ ذَهَبُوا، وَلا خَيْرَ فِي أُمَّةٍ تَجْهَلُ تَارِيخَهَا وَتَنْسَى حِكْمَةَ أَوَائِلِهَا فِي الشَّدَائِدِ وَالمِحَنِ، فَالعَقْلُ سِرَاجُ الحَقِّ وَالبَصِيرَةُ مِيزَانُ العَدْلِ.',
    authorName: 'ابن خلدون',
    subtitle: 'مؤسس علم الاجتماع ومؤرخ — 1332 م',
  },
];

const SAMPLE_PHRASES = [
  {
    label: 'افتراضي (عربي)',
    text: 'السر الحقيقي في *الاستمرارية*',
  },
  {
    label: 'English Hook',
    text: 'The secret to *consistency* and momentum',
  },
  {
    label: 'English Question',
    text: 'Why do *90% of creators* fail in year one?',
  },
  {
    label: 'English Rule',
    text: '*Never quit* before the breakthrough',
  },
  {
    label: 'أرقام وإنتاجية',
    text: '٣ أخطاء تدمّر *إنتاجيتك* يومياً',
  },
  {
    label: 'سؤال تشويقي',
    text: 'لماذا تفشل *٩٠٪ من المشاريع* في السنة الأولى؟',
  },
  {
    label: 'قاعدة مهمة',
    text: '*لا تبدأ* قبل أن تفهم هذه القاعدة',
  },
  {
    label: 'جملة طويلة',
    text: 'الفرق بين الناجح وغيره ليس الموهبة بل القدرة على الاستمرار عندما يفقد الجميع الحماس',
  },
];

const CURATED_ACCENT_COLORS = [
  '#6FA8FF', // Midnight Ice Blue
  '#8B4513', // Manuscript Sepia Bronze
  '#FF4D2E', // Modern Minimal Vermilion
  '#38BDF8', // Glass Sky Cyan
  '#F59E0B', // Documentary / Trailer Amber
  '#FFD400', // Punch / Annotate Yellow
  '#00E5FF', // Neon Cyan
  '#FF2E93', // Neon Magenta
];

const CURATED_KEYWORD_COLORS = [
  '#FFD400', // Vibrant Highlighter Yellow
  '#FF3B5C', // Punch Crimson
  '#B3261E', // Calligraphy Vermilion
  '#FFB65C', // Cinematic Amber
  '#FF2E93', // Neon Pink
  '#00E5FF', // Electric Cyan
  '#FF4D6D', // Arrow Coral
  '#FDE047', // Warm Gold
];

const PHRASE_POSITIONS: { id: PhrasePosition; labelAr: string; descAr: string }[] = [
  { id: 'center', labelAr: 'وسط', descAr: 'صندوق مركزي (70% × 40%)' },
  { id: 'top', labelAr: 'أعلى', descAr: 'شريط علوي عريض (28%)' },
  { id: 'bottom', labelAr: 'أسفل', descAr: 'شريط سفلي عريض (28%)' },
  { id: 'right', labelAr: 'يمين', descAr: 'عمود أيمن (44%)' },
  { id: 'left', labelAr: 'يسار', descAr: 'عمود أيسر (44%)' },
  { id: 'fullscreen', labelAr: 'شاشة كاملة', descAr: 'ملء المساحة الآمنة بالكامل' },
];

const CHAT_POSITIONS: { id: PhrasePosition; labelAr: string; descAr: string }[] = [
  { id: 'center', labelAr: 'وسط', descAr: 'نافذة وسطى (~62% × 84%)' },
  { id: 'right', labelAr: 'يمين', descAr: 'عمود أيمن (~44% × 84%)' },
  { id: 'left', labelAr: 'يسار', descAr: 'عمود أيسر (~44% × 84%)' },
  { id: 'fullscreen', labelAr: 'شاشة كاملة', descAr: 'ملء المساحة الآمنة (هامش 6%)' },
];

const POINTS_POSITIONS: { id: PhrasePosition; labelAr: string; descAr: string }[] = [
  { id: 'center', labelAr: 'وسط', descAr: 'منطقة وسطى (~70% × 80%)' },
  { id: 'right', labelAr: 'يمين', descAr: 'عمود أيمن (~44% × 84%)' },
  { id: 'left', labelAr: 'يسار', descAr: 'عمود أيسر (~44% × 84%)' },
  { id: 'fullscreen', labelAr: 'شاشة كاملة', descAr: 'ملء المساحة الآمنة (هامش 6%)' },
];

const IMAGE_POSITIONS: { id: PhrasePosition; labelAr: string; descAr: string }[] = [
  { id: 'center', labelAr: 'وسط', descAr: 'منطقة وسطى (~64% × 76%)' },
  { id: 'right', labelAr: 'يمين', descAr: 'عمود أيمن (~44% × 80%)' },
  { id: 'left', labelAr: 'يسار', descAr: 'عمود أيسر (~44% × 80%)' },
  { id: 'top-right', labelAr: 'أعلى يمين', descAr: 'زاوية علوية يمنى (~34% × 40%)' },
  { id: 'top-left', labelAr: 'أعلى يسار', descAr: 'زاوية علوية يسرى (~34% × 40%)' },
  { id: 'bottom-right', labelAr: 'أسفل يمين', descAr: 'زاوية سفلية يمنى (~34% × 40%)' },
  { id: 'bottom-left', labelAr: 'أسفل يسار', descAr: 'زاوية سفلية يسرى (~34% × 40%)' },
  { id: 'fullscreen', labelAr: 'شاشة كاملة', descAr: 'ملء المساحة الآمنة (هامش 6%)' },
];

const POINTS_MARKER_OPTIONS: { id: PointsMarkerType; labelAr: string }[] = [
  { id: 'arabic-indic', labelAr: '١-٢-٣' },
  { id: 'western', labelAr: '1-2-3' },
  { id: 'bullets', labelAr: 'نقاط •' },
  { id: 'checks', labelAr: 'صح ✓' },
  { id: 'none', labelAr: 'بدون' },
];

const TIMELINE_PATH_SHAPE_OPTIONS: {
  id: TimelinePathShape;
  labelAr: string;
  subAr: string;
}[] = [
  { id: 'straight', labelAr: 'مستقيم', subAr: 'مسار خطي' },
  { id: 'wave', labelAr: 'موجي', subAr: 'منحنى انسيابي' },
  { id: 'zigzag', labelAr: 'متعرج', subAr: 'زوايا هندسية' },
  { id: 'circle', labelAr: 'دائري', subAr: 'مسار مداري' },
  { id: 'stepped', labelAr: 'مدرج', subAr: 'خطوات متتابعة' },
];

const TIMELINE_ORIENTATION_OPTIONS: {
  id: TimelineOrientation;
  labelAr: string;
  subAr: string;
}[] = [
  { id: 'auto', labelAr: 'تلقائي', subAr: 'حسب الأبعاد' },
  { id: 'horizontal', labelAr: 'أفقي ↔', subAr: 'مسار عرضي' },
  { id: 'vertical', labelAr: 'رأسي ↕', subAr: 'مسار عمودي' },
];

const TIMELINE_VERTICAL_SIDE_OPTIONS: {
  id: TimelineVerticalSide;
  labelAr: string;
  subAr: string;
}[] = [
  { id: 'auto', labelAr: 'تلقائي', subAr: 'متناوب / جانبي' },
  { id: 'alternating', labelAr: 'تناوب يمين/يسار', subAr: 'محور بالمنتصف' },
  { id: 'left', labelAr: 'يسار المسار', subAr: 'المسار يميناً' },
  { id: 'right', labelAr: 'يمين المسار', subAr: 'المسار يساراً' },
];

const BACKGROUND_MODE_OPTIONS: {
  id: BackgroundMode;
  labelAr: string;
  subLabelAr: string;
}[] = [
  { id: 'style', labelAr: 'خلفية الستايل', subLabelAr: 'المظهر الكامل للستايل' },
  { id: 'green', labelAr: 'أخضر (Chroma Key)', subLabelAr: '#00FF00 للتفريغ اللوني' },
  { id: 'black', labelAr: 'أسود (Screen)', subLabelAr: '#000000 لوضع Screen' },
];

const ANNOTATION_TYPE_OPTIONS: { id: AnnotationType; labelAr: string }[] = [
  { id: 'auto', labelAr: 'تلقائي (يتبدل)' },
  { id: 'underline', labelAr: 'خط متعرج' },
  { id: 'circle', labelAr: 'دائرة يدوية' },
  { id: 'highlight', labelAr: 'تظليل (هايلايتر)' },
  { id: 'arrow', labelAr: 'سهم منحني' },
  { id: 'bracket', labelAr: 'قوسين [ ]' },
];

const SFX_TYPE_OPTIONS: { id: SfxType; labelAr: string }[] = [
  { id: 'whoosh', labelAr: 'Whoosh (انسياب هوائي)' },
  { id: 'impact', labelAr: 'Impact (ضربة عميقة)' },
  { id: 'whoosh-impact', labelAr: 'Whoosh + Impact (مدمج)' },
  { id: 'pop', labelAr: 'Soft Pop (نبضة ناعمة)' },
  { id: 'shutter', labelAr: 'Shutter (غالق كاميرا)' },
  { id: 'slap', labelAr: 'Slap (صفعة قصاصة / بطاقة)' },
  { id: 'message-pop', labelAr: 'Message Pop (إرسال واستقبال المحادثة)' },
  { id: 'key-clicks', labelAr: 'Key Clicks (نقرات مفاتيح / تيرمينال)' },
  { id: 'play-click', labelAr: 'Play Click (نقرة تشغيل)' },
  { id: 'glitch', labelAr: 'Glitch (تشويش رقمي)' },
];

const PIXEL_DENSITY_OPTIONS: { id: PixelDensity; labelAr: string; subAr: string }[] = [
  { id: 2, labelAr: 'ناعم', subAr: 'N=2 (افتراضي)' },
  { id: 3, labelAr: 'متوسط', subAr: 'N=3' },
  { id: 4, labelAr: 'خشن', subAr: 'N=4' },
  { id: 1, labelAr: 'بدون', subAr: 'سلس (N=1)' },
];

const PRESETS_STORAGE_KEY = 'quote_video_studio_presets_v1';

export default function App() {
  // 0. Studio Mode ('quote' | 'phrase' | 'chat' | 'points' | 'image')
  const [studioMode, setStudioMode] = useState<StudioMode>('quote');

  // 1. Quote Mode Content State
  const [quoteInput, setQuoteInput] = useState<string>(
    'لا يُمكن للمرء أن يتعلّم الفلسفة، بل يتعلّم كيف يتفلسف ويُعمِل عقله في الوجود.'
  );
  const [debouncedQuote, setDebouncedQuote] = useState<string>(quoteInput);
  const [authorName, setAuthorName] = useState<string>('إيمانويل كانط');
  const [subtitle, setSubtitle] = useState<string>('فيلسوف ألماني — 1724 م');
  const [photoSource, setPhotoSource] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [photoId, setPhotoId] = useState<string>('default-silhouette');
  const [crop, setCrop] = useState({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [quotationMarks, setQuotationMarks] = useState<QuotationMarkStyle>('guillemets');

  // 1b. Key Phrase Mode Content State (Default: "السر الحقيقي في *الاستمرارية*")
  const [phraseInput, setPhraseInput] = useState<string>('السر الحقيقي في *الاستمرارية*');
  const [debouncedPhrase, setDebouncedPhrase] = useState<string>(phraseInput);

  // 1c. Image Insert ("صورة") Mode Content State
  const [imageSource, setImageSource] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [imageId, setImageId] = useState<string>('default-insert-image');
  const [imageCrop, setImageCrop] = useState({ zoom: 1, offsetX: 0, offsetY: 0 });

  // 1d. Video Insert ("فيديو") Mode Content State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoSourceMetadata | null>(null);
  const [videoId, setVideoId] = useState<string>('default-video');
  const [videoPosterCanvas, setVideoPosterCanvas] = useState<HTMLCanvasElement | null>(null);
  const [videoThumbnails, setVideoThumbnails] = useState<HTMLCanvasElement[]>([]);
  const [videoLoading, setVideoLoading] = useState<boolean>(false);
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null);
  const [videoSoftWarning, setVideoSoftWarning] = useState<string | null>(null);
  const [videoGreenRatio, setVideoGreenRatio] = useState<number>(0);
  const [videoCrop, setVideoCrop] = useState({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [videoPresetNotice, setVideoPresetNotice] = useState<string | null>(null);
  const [videoDragGuideState, setVideoDragGuideState] = useState<{
    active: boolean;
    centerX: boolean;
    centerY: boolean;
    safeLeft: boolean;
    safeRight: boolean;
    safeTop: boolean;
    safeBottom: boolean;
  }>({
    active: false,
    centerX: false,
    centerY: false,
    safeLeft: false,
    safeRight: false,
    safeTop: false,
    safeBottom: false,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuote(quoteInput);
    }, 60);
    return () => clearTimeout(timer);
  }, [quoteInput]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPhrase(phraseInput);
    }, 60);
    return () => clearTimeout(timer);
  }, [phraseInput]);

  // 2. Style & Customization State
  const [quoteStyleId, setQuoteStyleId] = useState<QuoteStyleId>('midnight-blue');
  const [phraseStyleId, setPhraseStyleId] = useState<PhraseStyleId>('calligraphy-ink');
  const [chatStyleId, setChatStyleId] = useState<ChatStyleId>('chat_modern');
  const [pointsStyleId, setPointsStyleId] = useState<PointsStyleId>('pts_clean');
  const [imageStyleId, setImageStyleId] = useState<ImageStyleId>('img_polaroid');
  const [videoStyleId, setVideoStyleId] = useState<VideoStyleId>('vid_floating');
  const [quoteBgMode, setQuoteBgMode] = useState<BackgroundMode>('style');
  const [phraseBgMode, setPhraseBgMode] = useState<BackgroundMode>('style');
  const [chatBgMode, setChatBgMode] = useState<BackgroundMode>('style');
  const [pointsBgMode, setPointsBgMode] = useState<BackgroundMode>('style');
  const [imageBgMode, setImageBgMode] = useState<BackgroundMode>('green');
  const [videoBgMode, setVideoBgMode] = useState<BackgroundMode>('green');
  const [quickPasteInput, setQuickPasteInput] = useState<string>('');
  const [pointsQuickPasteInput, setPointsQuickPasteInput] = useState<string>('');

  const [customization, setCustomization] = useState<StyleCustomization>({
    mode: 'quote',
    styleId: 'midnight-blue',
    phraseStyleId: 'calligraphy-ink',
    chatStyleId: 'chat_modern',
    pointsStyleId: 'pts_clean',
    imageStyleId: 'img_polaroid',
    videoStyleId: 'vid_floating',
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    accentColor: '#6FA8FF',
    keywordColor: '#FFD166',
    annotationType: 'auto',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    minimalTheme: 'dark',
    calligraphyTheme: 'night',
    timelineTheme: 'dark',
    flyerTheme: 'dark',
    styleTheme: 'dark',
    backgroundBlur: 6,
    greenScreen: false,
    seed: 1042,
    typingSpeed: 18,
    pixelDensity: 2,
    terminalBootLine: false,
    textDirection: 'auto',
    chatTheme: 'dark',
    chatAiReplyStyle: 'plain',
    chatSwapSides: false,
    chatUserLabel: 'أنا',
    chatAiLabel: 'الذكاء الاصطناعي',
    chatMessages: DEFAULT_CHAT_MESSAGES,
    chatTiming: DEFAULT_CHAT_TIMING,
    pointsMarkerType: 'arabic-indic',
    pointsHighlightCurrent: true,
    timelineShape: 'straight',
    timelineOrientation: 'auto',
    timelineVerticalSide: 'auto',
    timelineNodeScale: 1.0,
    timelineStemScale: 1.0,
    timelineSpread: 1.0,
    timelineOffsetX: 0,
    timelineOffsetY: 0,
    pointsTitle: DEFAULT_POINTS_TITLE,
    pointsItems: DEFAULT_POINTS_ITEMS,
    pointsTiming: DEFAULT_POINTS_TIMING,
    imageCaption: DEFAULT_IMAGE_CAPTION,
    imageSourceLine: DEFAULT_IMAGE_SOURCE_LINE,
    imageFit: 'cover',
    imageScale: 1.0,
    imagePushIn: false,
    newspaperKeepColor: false,
    cinematicGrade: true,
    spotlightRegion: DEFAULT_SPOTLIGHT_REGION,
    spotlightShape: 'circle',
    showFloatingObjects: true,
    flyerCreature: 'orb',
    flyerFlightSpeed: DEFAULT_FLYER_FLIGHT_SPEED,
    flyerCricketEnabled: false,
    flyerCricketPreset: DEFAULT_FLYER_CRICKET_PRESET,
    flyerCricketVolume: DEFAULT_FLYER_CRICKET_VOLUME,
    videoBox: DEFAULT_VIDEO_BOX,
    videoAllowOutOfMargin: false,
    videoAspectLock: true,
    videoAdaptFrameToClip: true,
    videoFit: 'contain',
    videoScale: 1.0,
    videoTrimIn: 0,
    videoTrimOut: DEFAULT_VIDEO_DURATION,
    videoSpeed: 1.0,
    videoEndBehavior: 'freeze',
    videoAudioEnabled: true,
    videoAudioVolume: 0.85,
    videoCustomDurationEnabled: false,
    videoCustomDuration: DEFAULT_VIDEO_DURATION,
    videoDurationSec: DEFAULT_VIDEO_DURATION,
    videoCaption: DEFAULT_VIDEO_CAPTION,
    videoSourceLine: DEFAULT_VIDEO_SOURCE_LINE,
    videoPipShape: 'circle',
    videoPipNameTag: '',
  });

  // 3. Separate Timelines for Quote Mode (1.5 / 6.0 / 1.0), Key Phrase Mode (0.8 / 2.5 / 0.6), Image Mode (0.8 / 3.0 / 0.6), and Video Mode (0.6 / clip / 0.5)
  const [quoteTimeline, setQuoteTimeline] = useState<TimelineConfig>({
    enterDuration: 1.5,
    holdDuration: 6.0,
    exitDuration: 1.0,
    autoHold: false,
  });

  const [phraseTimeline, setPhraseTimeline] = useState<TimelineConfig>({
    enterDuration: 0.8,
    holdDuration: 2.5,
    exitDuration: 0.6,
    autoHold: false,
  });

  const [imageTimeline, setImageTimeline] = useState<TimelineConfig>({
    ...DEFAULT_IMAGE_TIMELINE,
  });

  const [videoTimeline, setVideoTimeline] = useState<TimelineConfig>({
    ...DEFAULT_VIDEO_TIMELINE,
  });

  const activeTimeline =
    studioMode === 'video'
      ? videoTimeline
      : studioMode === 'image'
        ? imageTimeline
        : studioMode === 'phrase'
          ? phraseTimeline
          : quoteTimeline;
  const setActiveTimeline = useCallback(
    (updater: React.SetStateAction<TimelineConfig>) => {
      if (studioMode === 'video') {
        setVideoTimeline(updater);
      } else if (studioMode === 'image') {
        setImageTimeline(updater);
      } else if (studioMode === 'phrase') {
        setPhraseTimeline(updater);
      } else {
        setQuoteTimeline(updater);
      }
    },
    [studioMode]
  );

  // 4. Sound Effects (SFX) State — Default OFF
  const [sfxSettings, setSfxSettings] = useState<SfxSettings>({
    enabled: false,
    type: 'whoosh-impact',
    volume: 0.6,
    offset: 0.0,
    keywordHit: true,
    itemHit: false,
  });

  // 5. Export Settings State
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    resolution: '1080p',
    fps: 30,
    quality: 'high',
    endPadding: true,
    quickTest: false,
    audioFile: null,
    audioVolume: 0.8,
  });

  // 6. Playback & UI State
  const [currentTime, setCurrentTime] = useState<number>(2.4);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isCleanMode, setIsCleanMode] = useState<boolean>(false);
  const [cleanLoop, setCleanLoop] = useState<boolean>(true);
  const [fontsReadyTick, setFontsReadyTick] = useState<number>(0);
  const [mp4Supported, setMp4Supported] = useState<boolean>(true);
  const [exportProgress, setExportProgress] = useState<ExportProgressState | null>(null);
  const [isPresetsOpen, setIsPresetsOpen] = useState<boolean>(false);
  const [savedPresets, setSavedPresets] = useState<StudioPreset[]>(() => {
    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [stillToast, setStillToast] = useState<string>('');
  const [selectedTimelinePointIdx, setSelectedTimelinePointIdx] = useState<number>(0);
  const [isTimelineDragEnabled, setIsTimelineDragEnabled] = useState<boolean>(true);
  const [isDraggingTimelineTarget, setIsDraggingTimelineTarget] = useState<boolean>(false);
  const timelineDragRef = useRef<{
    pointerId: number;
    itemId: string;
    targetType: 'node' | 'text';
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  // Collapsible Control Panel Sections
  const [openSections, setOpenSections] = useState({
    content: true,
    style: true,
    positionBg: true,
    timing: true,
    fontsColors: false,
    sfx: false,
    export: true,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Refs for textarea selection, animation loop, canvas & live Web Audio SFX
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewStageContainerRef = useRef<HTMLDivElement>(null);
  const scrubberInputRef = useRef<HTMLInputElement>(null);
  const timeReadoutRef = useRef<HTMLDivElement>(null);
  const abortExportRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const liveAudioCtxRef = useRef<AudioContext | null>(null);
  const liveSfxStopRef = useRef<(() => void) | null>(null);
  const liveCricketVolumeSetterRef = useRef<((v: number) => void) | null>(null);
  const videoPreviewCtrlRef = useRef<VideoPreviewController | null>(null);
  const videoBoxDragRef = useRef<{
    kind: 'move' | 'crop' | VideoCornerHandle;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startBox: VideoLayoutBox;
    startCrop: { zoom: number; offsetX: number; offsetY: number };
  } | null>(null);

  const playbackRef = useRef<{
    isPlaying: boolean;
    currentTime: number;
    lastFramePerf: number;
  }>({
    isPlaying: true,
    currentTime: 2.4,
    lastFramePerf: performance.now(),
  });

  const syncTimeUi = useCallback((t: number, total: number) => {
    if (scrubberInputRef.current) {
      scrubberInputRef.current.value = String(clamp(t, 0, total));
    }
    if (timeReadoutRef.current) {
      timeReadoutRef.current.textContent = `${t.toFixed(2)}s / ${total.toFixed(2)}s`;
    }
  }, []);

  const activeRawText =
    studioMode === 'video'
      ? customization.videoCaption ?? DEFAULT_VIDEO_CAPTION
      : studioMode === 'image'
        ? customization.imageCaption ?? DEFAULT_IMAGE_CAPTION
        : studioMode === 'points'
          ? [
              customization.pointsTitle ?? DEFAULT_POINTS_TITLE,
              ...(customization.pointsItems || DEFAULT_POINTS_ITEMS).map((it) => it.text),
            ]
              .filter(Boolean)
              .join(' ')
          : studioMode === 'chat'
            ? (customization.chatMessages || DEFAULT_CHAT_MESSAGES).map((m) => m.text).join(' ')
            : studioMode === 'phrase'
              ? phraseInput
              : quoteInput;
  const activeDebouncedText =
    studioMode === 'video' || studioMode === 'image' || studioMode === 'points' || studioMode === 'chat'
      ? activeRawText
      : studioMode === 'phrase'
        ? debouncedPhrase
        : debouncedQuote;
  const activeDirection = resolveTextDirection(customization, activeRawText);
  const isLtr = activeDirection === 'ltr';

  const parsedKeywords = useMemo(
    () => parseKeywordMarkup(activeRawText),
    [activeRawText]
  );

  const pointsStats = useMemo(
    () =>
      countPointsStats(
        customization.pointsTitle ?? DEFAULT_POINTS_TITLE,
        customization.pointsItems || DEFAULT_POINTS_ITEMS
      ),
    [customization.pointsItems, customization.pointsTitle]
  );

  const getVideoPreviewFrame = useCallback(
    (sourceTime: number) => {
      if (videoPreviewCtrlRef.current?.hasFrame()) {
        return videoPreviewCtrlRef.current.getFrame();
      }
      if (videoPosterCanvas) return videoPosterCanvas;
      return getDefaultVideoFrameAt(sourceTime);
    },
    [videoPosterCanvas]
  );

  const contentObj: QuoteContent = useMemo(
    () => ({
      quoteText: activeDebouncedText,
      authorName: studioMode === 'quote' ? authorName : '',
      subtitle: studioMode === 'quote' ? subtitle : '',
      photoSource: studioMode === 'quote' ? photoSource : null,
      photoId,
      crop,
      quotationMarks: studioMode === 'quote' ? quotationMarks : 'none',
      chatMessages: customization.chatMessages || DEFAULT_CHAT_MESSAGES,
      userLabel: customization.chatUserLabel || 'أنا',
      aiLabel: customization.chatAiLabel || 'الذكاء الاصطناعي',
      pointsTitle: customization.pointsTitle ?? DEFAULT_POINTS_TITLE,
      pointsItems: customization.pointsItems || DEFAULT_POINTS_ITEMS,
      pointsTiming: customization.pointsTiming || DEFAULT_POINTS_TIMING,
      imageSource: studioMode === 'image' ? imageSource : null,
      imageId,
      imageCrop,
      imageCaption: customization.imageCaption ?? DEFAULT_IMAGE_CAPTION,
      imageSourceLine: customization.imageSourceLine ?? DEFAULT_IMAGE_SOURCE_LINE,
      videoPosterSource: videoPosterCanvas || getDefaultVideoPosterCanvas(),
      videoGetFrame: studioMode === 'video' ? getVideoPreviewFrame : undefined,
      videoMeta: studioMode === 'video' ? videoMeta : null,
      videoCrop,
      videoCaption: customization.videoCaption ?? DEFAULT_VIDEO_CAPTION,
      videoSourceLine: customization.videoSourceLine ?? DEFAULT_VIDEO_SOURCE_LINE,
    }),
    [
      activeDebouncedText,
      studioMode,
      authorName,
      subtitle,
      photoSource,
      photoId,
      crop,
      quotationMarks,
      customization.chatMessages,
      customization.chatUserLabel,
      customization.chatAiLabel,
      customization.pointsTitle,
      customization.pointsItems,
      customization.pointsTiming,
      imageSource,
      imageId,
      imageCrop,
      customization.imageCaption,
      customization.imageSourceLine,
      videoPosterCanvas,
      getVideoPreviewFrame,
      videoMeta,
      videoCrop,
      customization.videoCaption,
      customization.videoSourceLine,
    ]
  );

  const activeStyleId = resolveActiveStyleId(customization);
  const activeStyleMeta = getStyleMetadata(activeStyleId);

  const effectiveTimeline = useMemo(
    () =>
      getEffectiveTimeline(
        activeTimeline,
        activeDebouncedText,
        studioMode,
        activeStyleId === 'annotate' ? 0.55 : 0.35,
        getTypingConfigForCustomization(customization)
      ),
    [activeTimeline, activeDebouncedText, studioMode, activeStyleId, customization]
  );

  // Stop any playing live SFX & Flyer cricket audio
  const stopLiveSfx = useCallback(() => {
    if (liveSfxStopRef.current) {
      liveSfxStopRef.current();
      liveSfxStopRef.current = null;
    }
    liveCricketVolumeSetterRef.current = null;
  }, []);

  // Trigger live SFX and/or Flyer quiet cricket audio from cursorSec
  const startLiveSfxFrom = useCallback(
    (cursorSec: number, customOverride?: StyleCustomization) => {
      stopLiveSfx();
      const targetCustom = customOverride ?? customization;
      const cricketActive = hasFlyerCricketAudio(targetCustom);
      if (!sfxSettings.enabled && !cricketActive) return;

      try {
        if (!liveAudioCtxRef.current || liveAudioCtxRef.current.state === 'closed') {
          liveAudioCtxRef.current = new AudioContext();
        }
        const audioCtx = liveAudioCtxRef.current;
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }

        const stops: Array<() => void> = [];

        if (sfxSettings.enabled) {
          const canvas = previewCanvasRef.current;
          const ctx = canvas?.getContext('2d');
          if (ctx) {
            const baseWidth = targetCustom.format === '16:9' ? 1920 : 1080;
            const baseHeight = targetCustom.format === '16:9' ? 1080 : 1920;
            const eventTimes = getSceneEventTimes(ctx, contentObj, activeTimeline, targetCustom, {
              width: baseWidth,
              height: baseHeight,
              baseWidth,
              baseHeight,
              scale: 1,
            });
            const handle = buildSfxGraph(
              audioCtx,
              sfxSettings,
              eventTimes,
              targetCustom.seed,
              cursorSec
            );
            stops.push(handle.stop);
          }
        }

        if (cricketActive) {
          const cricketHandle = buildFlyerCricketGraph(
            audioCtx,
            {
              enabled: true,
              preset: resolveFlyerCricketPreset(targetCustom.flyerCricketPreset),
              volume: resolveFlyerCricketVolume(targetCustom.flyerCricketVolume),
            },
            effectiveTimeline.total,
            targetCustom.seed,
            cursorSec
          );
          liveCricketVolumeSetterRef.current = cricketHandle.setVolume;
          stops.push(cricketHandle.stop);
        }

        if (stops.length > 0) {
          liveSfxStopRef.current = () => {
            for (const s of stops) s();
          };
        }
      } catch {
        // Ignore Web Audio autoplay restrictions if not yet interacted
      }
    },
    [sfxSettings, customization, contentObj, activeTimeline, effectiveTimeline.total, stopLiveSfx]
  );

  // Brief ~1.2s audition chirp when toggling or switching cricket sound while paused
  const auditionCricketPreset = useCallback(
    (preset: FlyerCricketPresetId, volume: number, seed: number) => {
      stopLiveSfx();
      try {
        if (!liveAudioCtxRef.current || liveAudioCtxRef.current.state === 'closed') {
          liveAudioCtxRef.current = new AudioContext();
        }
        const audioCtx = liveAudioCtxRef.current;
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        const handle = buildFlyerCricketGraph(
          audioCtx,
          { enabled: true, preset, volume },
          2.0,
          seed,
          0,
          { auditionOnly: true }
        );
        liveCricketVolumeSetterRef.current = handle.setVolume;
        liveSfxStopRef.current = handle.stop;
      } catch {
        // Ignore Web Audio autoplay restrictions
      }
    },
    [stopLiveSfx]
  );

  // Load Arabic fonts & check WebCodecs MP4 support on mount
  useEffect(() => {
    ensureArabicFontsLoaded().then(() => {
      clearLayoutCache();
      setFontsReadyTick((t) => t + 1);
    });
    checkWebCodecsMp4Support().then((supported) => {
      setMp4Supported(supported);
    });
    return () => {
      stopLiveSfx();
      videoPreviewCtrlRef.current?.dispose();
      videoPreviewCtrlRef.current = null;
    };
  }, [stopLiveSfx]);

  // Sync preview HTMLVideoElement to timeline cursor when a real clip is loaded
  const syncVideoElementAtTime = useCallback(
    (t: number, playing: boolean) => {
      const ctrl = videoPreviewCtrlRef.current;
      if (!ctrl) return;
      if (studioMode !== 'video') {
        ctrl.sync({
          sourceTime: 0,
          isPlaying: false,
          speed: 1,
          audioEnabled: false,
          audioVolume: 0,
          insideClipSpan: false,
        });
        return;
      }
      const dur = videoMeta?.duration || customization.videoDurationSec || DEFAULT_VIDEO_DURATION;
      const speed = customization.videoSpeed ?? 1.0;
      const vt = computeVideoTimeline({
        videoDuration: dur,
        trimIn: customization.videoTrimIn ?? 0,
        trimOut: customization.videoTrimOut ?? dur,
        speed,
        customDurationEnabled: customization.videoCustomDurationEnabled,
        customDuration: customization.videoCustomDuration,
      });
      const sourceTime = computeVideoSourceTime(t, {
        clipStart: vt.clipStart,
        clipEnd: vt.clipEnd,
        trimIn: vt.trimIn,
        trimOut: vt.trimOut,
        speed,
        endBehavior: customization.videoEndBehavior || 'freeze',
      });
      const insideClipSpan = t >= vt.clipStart && t <= vt.clipEnd;
      const elapsedInClip = Math.max(0, t - vt.clipStart) * speed;
      const freezePastEnd =
        (customization.videoEndBehavior || 'freeze') === 'freeze' &&
        elapsedInClip > vt.trimmedDuration + 0.02;

      ctrl.sync({
        sourceTime,
        isPlaying: playing,
        speed,
        audioEnabled: customization.videoAudioEnabled ?? true,
        audioVolume: customization.videoAudioVolume ?? 0.85,
        insideClipSpan,
        clipActivePausedFreeze: freezePastEnd,
      });
    },
    [
      studioMode,
      videoMeta?.duration,
      customization.videoDurationSec,
      customization.videoSpeed,
      customization.videoTrimIn,
      customization.videoTrimOut,
      customization.videoCustomDurationEnabled,
      customization.videoCustomDuration,
      customization.videoEndBehavior,
      customization.videoAudioEnabled,
      customization.videoAudioVolume,
    ]
  );

  // Draw one frame to the visible preview canvas
  const drawPreviewAtTime = useCallback(
    (t: number) => {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      const baseWidth = customization.format === '16:9' ? 1920 : 1080;
      const baseHeight = customization.format === '16:9' ? 1080 : 1920;
      const previewScale = 2 / 3;
      const previewWidth = Math.round(baseWidth * previewScale);
      const previewHeight = Math.round(baseHeight * previewScale);

      if (canvas.width !== previewWidth || canvas.height !== previewHeight) {
        canvas.width = previewWidth;
        canvas.height = previewHeight;
      }

      const clampedT = clamp(t, 0, effectiveTimeline.total);
      syncVideoElementAtTime(clampedT, playbackRef.current.isPlaying);
      renderQuoteFrame(ctx, clampedT, contentObj, activeTimeline, customization, {
        width: previewWidth,
        height: previewHeight,
        baseWidth,
        baseHeight,
        scale: previewScale,
      });
    },
    [contentObj, activeTimeline, customization, effectiveTimeline.total, syncVideoElementAtTime]
  );

  // Keep playbackRef synced and redraw when dependencies change
  useEffect(() => {
    playbackRef.current.isPlaying = isPlaying;
    if (!isPlaying) {
      stopLiveSfx();
    }
    const clamped = clamp(playbackRef.current.currentTime, 0, effectiveTimeline.total);
    playbackRef.current.currentTime = clamped;
    drawPreviewAtTime(clamped);
    syncTimeUi(clamped, effectiveTimeline.total);
  }, [
    isPlaying,
    currentTime,
    drawPreviewAtTime,
    syncTimeUi,
    effectiveTimeline.total,
    fontsReadyTick,
    stopLiveSfx,
  ]);

  // Master requestAnimationFrame loop
  useEffect(() => {
    if (!isPlaying) return;

    let rafId = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    playbackRef.current.lastFramePerf = performance.now();

    const tick = (now: number) => {
      if (cancelled || !playbackRef.current.isPlaying) return;

      const dt = Math.min(0.1, (now - playbackRef.current.lastFramePerf) / 1000);
      playbackRef.current.lastFramePerf = now;

      let nextT = playbackRef.current.currentTime + dt;
      if (nextT >= effectiveTimeline.total) {
        if (isCleanMode && !cleanLoop) {
          nextT = effectiveTimeline.total;
          playbackRef.current.isPlaying = false;
          setCurrentTime(nextT);
          setIsPlaying(false);
          stopLiveSfx();
          drawPreviewAtTime(nextT);
          syncTimeUi(nextT, effectiveTimeline.total);
          return;
        } else {
          nextT = 0;
          if (sfxSettings.enabled || hasFlyerCricketAudio(customization)) {
            startLiveSfxFrom(0);
          }
        }
      }
      playbackRef.current.currentTime = nextT;
      drawPreviewAtTime(nextT);
      syncTimeUi(nextT, effectiveTimeline.total);

      timerId = setTimeout(() => {
        if (!cancelled && playbackRef.current.isPlaying) {
          rafId = requestAnimationFrame(tick);
        }
      }, 16);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (timerId) clearTimeout(timerId);
    };
  }, [
    isPlaying,
    drawPreviewAtTime,
    syncTimeUi,
    effectiveTimeline.total,
    isCleanMode,
    cleanLoop,
    sfxSettings.enabled,
    customization,
    startLiveSfxFrom,
    stopLiveSfx,
  ]);

  // Video Insert Handlers (Upload, Clear, Quick Position)
  const handleSelectVideoFile = async (file: File) => {
    setVideoLoading(true);
    setVideoLoadError(null);
    setVideoPresetNotice(null);
    const res = await loadVideoAsset(file);
    if (!res.ok) {
      setVideoLoading(false);
      setVideoLoadError(res.errorAr);
      return;
    }

    videoPreviewCtrlRef.current?.dispose();
    videoPreviewCtrlRef.current = new VideoPreviewController(
      res.objectUrl,
      res.posterCanvas,
      res.meta.displayWidth,
      res.meta.displayHeight
    );

    setVideoFile(res.file);
    setVideoMeta(res.meta);
    setVideoId(res.videoId);
    setVideoPosterCanvas(res.posterCanvas);
    setVideoThumbnails(res.thumbnailStrip);
    setVideoSoftWarning(res.softWarningAr || null);
    setVideoGreenRatio(res.greenPixelRatio);
    setVideoCrop({ zoom: 1, offsetX: 0, offsetY: 0 });
    setVideoLoading(false);

    setCustomization((prev) => ({
      ...prev,
      videoDurationSec: res.meta.duration,
      videoTrimIn: 0,
      videoTrimOut: res.meta.duration,
      videoAudioEnabled: res.meta.hasAudio,
      videoCustomDurationEnabled: false,
      videoCustomDuration: Number((res.meta.duration / (prev.videoSpeed ?? 1.0)).toFixed(2)),
    }));
  };

  const handleClearVideoFile = () => {
    videoPreviewCtrlRef.current?.dispose();
    videoPreviewCtrlRef.current = null;
    setVideoFile(null);
    setVideoMeta(null);
    setVideoId('default-video');
    setVideoPosterCanvas(null);
    setVideoThumbnails([]);
    setVideoLoadError(null);
    setVideoSoftWarning(null);
    setVideoGreenRatio(0);
    setVideoCrop({ zoom: 1, offsetX: 0, offsetY: 0 });
    setVideoPresetNotice(null);
    setCustomization((prev) => ({
      ...prev,
      videoDurationSec: DEFAULT_VIDEO_DURATION,
      videoTrimIn: 0,
      videoTrimOut: DEFAULT_VIDEO_DURATION,
      videoAudioEnabled: true,
      videoCustomDurationEnabled: false,
      videoCustomDuration: DEFAULT_VIDEO_DURATION,
    }));
  };

  const handleSelectVideoQuickPosition = (pos: PhrasePosition) => {
    const nextBox = getDefaultVideoBoxForPosition(pos, customization.format);
    const nextBg: BackgroundMode = pos === 'fullscreen' ? 'style' : 'green';
    setVideoBgMode(nextBg);
    setCustomization((prev) => ({
      ...prev,
      position: pos,
      videoBox: nextBox,
      videoScale: 1.0,
      backgroundMode: nextBg,
      greenScreen: nextBg === 'green',
    }));
  };

  // Mode Switching Handler
  const handleModeChange = (nextMode: StudioMode) => {
    if (nextMode === studioMode) return;
    stopLiveSfx();
    setStudioMode(nextMode);

    if (nextMode === 'video') {
      const vMeta = getStyleMetadata(videoStyleId);
      const validVideoPos: PhrasePosition =
        customization.position === 'top' || customization.position === 'bottom'
          ? 'center'
          : customization.position || 'center';
      const resolvedPos =
        customization.format === '9:16' &&
        (validVideoPos === 'left' || validVideoPos === 'right')
          ? 'center'
          : validVideoPos;
      const supported = vMeta.supportedBackgrounds || ['style', 'green'];
      let targetBg: BackgroundMode =
        resolvedPos === 'fullscreen' ? 'style' : videoBgMode || 'green';
      if (!supported.includes(targetBg)) {
        targetBg = vMeta.recommendedBackground || 'green';
      }
      setVideoBgMode(targetBg);

      setCustomization((prev) => ({
        ...prev,
        mode: 'video',
        styleId: videoStyleId,
        videoStyleId,
        position: resolvedPos,
        videoBox: prev.videoBox || getDefaultVideoBoxForPosition(resolvedPos, prev.format),
        backgroundMode: targetBg,
        greenScreen: targetBg === 'green',
        accentColor: vMeta.defaultAccent,
        keywordColor: vMeta.defaultKeywordColor || vMeta.defaultAccent,
        quoteFontOverride: '',
      }));

      playbackRef.current.currentTime = 1.6;
      setCurrentTime(1.6);
    } else if (nextMode === 'image') {
      const imgMeta = getStyleMetadata(imageStyleId);
      const validImagePos: PhrasePosition =
        customization.position === 'top' || customization.position === 'bottom'
          ? 'center'
          : customization.position || 'center';
      const supported = imgMeta.supportedBackgrounds || ['style', 'green', 'black'];
      let targetBg: BackgroundMode = imageBgMode;
      if (!supported.includes(targetBg)) {
        targetBg = imgMeta.recommendedBackground || supported[0] || 'style';
      }

      setCustomization((prev) => ({
        ...prev,
        mode: 'image',
        styleId: imageStyleId,
        imageStyleId,
        imageFit: prev.imageFit || imgMeta.defaultImageFit || 'cover',
        position: validImagePos,
        backgroundMode: targetBg,
        greenScreen: targetBg === 'green',
        accentColor: imgMeta.defaultAccent,
        keywordColor: imgMeta.defaultKeywordColor || imgMeta.defaultAccent,
        quoteFontOverride: '',
      }));

      playbackRef.current.currentTime = 2.0;
      setCurrentTime(2.0);
    } else if (nextMode === 'points') {
      const ptMeta = getStyleMetadata(pointsStyleId);
      const supported = ptMeta.supportedBackgrounds || ['style', 'green', 'black'];
      let targetBg: BackgroundMode = pointsBgMode;
      if (!supported.includes(targetBg)) {
        targetBg = ptMeta.recommendedBackground || supported[0] || 'style';
      }
      const validPointsPos: PhrasePosition =
        customization.position === 'top' ||
        customization.position === 'bottom' ||
        customization.position?.startsWith('top-') ||
        customization.position?.startsWith('bottom-')
          ? 'center'
          : customization.position || 'center';
      const supportedMarkers = ptMeta.supportedMarkerTypes || [
        'arabic-indic',
        'western',
        'bullets',
        'checks',
        'none',
      ];
      const nextMarker: PointsMarkerType =
        customization.pointsMarkerType &&
        supportedMarkers.includes(customization.pointsMarkerType)
          ? customization.pointsMarkerType
          : ptMeta.defaultMarkerType || 'arabic-indic';

      setCustomization((prev) => ({
        ...prev,
        mode: 'points',
        styleId: pointsStyleId,
        pointsStyleId,
        pointsMarkerType: nextMarker,
        position: validPointsPos,
        backgroundMode: targetBg,
        greenScreen: targetBg === 'green',
        accentColor: ptMeta.defaultAccent,
        keywordColor: ptMeta.defaultKeywordColor || '#FFD400',
        quoteFontOverride: '',
      }));

      playbackRef.current.currentTime = 3.2;
      setCurrentTime(3.2);
    } else if (nextMode === 'chat') {
      const cMeta = getStyleMetadata(chatStyleId);
      const supported = cMeta.supportedBackgrounds || ['style', 'green', 'black'];
      let targetBg: BackgroundMode = chatBgMode;
      if (!supported.includes(targetBg)) {
        targetBg = cMeta.recommendedBackground || supported[0] || 'style';
      }
      const validChatPos: PhrasePosition =
        customization.position === 'top' ||
        customization.position === 'bottom' ||
        customization.position?.startsWith('top-') ||
        customization.position?.startsWith('bottom-')
          ? 'center'
          : customization.position || 'center';

      setCustomization((prev) => ({
        ...prev,
        mode: 'chat',
        styleId: chatStyleId,
        chatStyleId,
        position: validChatPos,
        backgroundMode: targetBg,
        greenScreen: targetBg === 'green',
        accentColor: cMeta.defaultAccent,
        keywordColor: cMeta.defaultKeywordColor || '#FFD166',
        quoteFontOverride: '',
      }));

      playbackRef.current.currentTime = 2.8;
      setCurrentTime(2.8);
    } else if (nextMode === 'phrase') {
      const pMeta = getStyleMetadata(phraseStyleId);
      const supported = pMeta.supportedBackgrounds || ['style', 'green', 'black'];
      let targetBg: BackgroundMode = phraseBgMode;
      if (!supported.includes(targetBg)) {
        targetBg = pMeta.recommendedBackground || supported[0] || 'style';
      }
      const validPhrasePos: PhrasePosition =
        customization.position?.startsWith('top-') ||
        customization.position?.startsWith('bottom-')
          ? 'center'
          : customization.position || 'center';

      setCustomization((prev) => ({
        ...prev,
        mode: 'phrase',
        styleId: phraseStyleId,
        phraseStyleId,
        position: validPhrasePos,
        backgroundMode: targetBg,
        greenScreen: targetBg === 'green',
        accentColor: pMeta.defaultAccent,
        keywordColor: pMeta.defaultKeywordColor || pMeta.defaultAccent,
        quoteFontOverride: '',
      }));

      const sampleMid = 0.8 + 2.5 * 0.4;
      playbackRef.current.currentTime = sampleMid;
      setCurrentTime(sampleMid);
    } else {
      const qMeta = getStyleMetadata(quoteStyleId);
      setCustomization((prev) => ({
        ...prev,
        mode: 'quote',
        styleId: quoteStyleId,
        backgroundMode: quoteBgMode,
        greenScreen: quoteBgMode === 'green',
        accentColor: qMeta.defaultAccent,
        keywordColor: qMeta.defaultKeywordColor || '#FFD166',
        quoteFontOverride: '',
      }));

      playbackRef.current.currentTime = 2.4;
      setCurrentTime(2.4);
    }
  };

  // Style Selection Handler (for Quote, Phrase, Chat, Points, Image, and Video modes)
  const handleStyleSelect = (styleId: StyleId) => {
    if (!isFlyerStyleId(styleId) && isPlaying) {
      // Ensure Flyer-only cricket audio stops immediately when leaving Flyer styles
      stopLiveSfx();
    }
    const meta = getStyleMetadata(styleId);
    const supported = meta.supportedBackgrounds || ['style', 'green', 'black'];

    if (studioMode === 'video') {
      const vidId = styleId as VideoStyleId;
      setVideoStyleId(vidId);

      let nextBg = resolveBackgroundMode(customization);
      if (!supported.includes(nextBg)) {
        nextBg = meta.recommendedBackground || 'green';
      }
      setVideoBgMode(nextBg);

      setCustomization((prev) => ({
        ...prev,
        mode: 'video',
        styleId: vidId,
        videoStyleId: vidId,
        backgroundMode: nextBg,
        greenScreen: nextBg === 'green',
        accentColor: meta.defaultAccent,
        keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
        quoteFontOverride: '',
      }));
    } else if (studioMode === 'image') {
      const imgId = styleId as ImageStyleId;
      setImageStyleId(imgId);

      let nextBg = resolveBackgroundMode(customization);
      if (!supported.includes(nextBg)) {
        nextBg = meta.recommendedBackground || supported[0] || 'style';
      }
      setImageBgMode(nextBg);

      setCustomization((prev) => ({
        ...prev,
        mode: 'image',
        styleId: imgId,
        imageStyleId: imgId,
        imageFit: meta.defaultImageFit || 'cover',
        backgroundMode: nextBg,
        greenScreen: nextBg === 'green',
        accentColor: meta.defaultAccent,
        keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
        quoteFontOverride: '',
      }));
    } else if (studioMode === 'points') {
      const ptId = styleId as PointsStyleId;
      setPointsStyleId(ptId);

      let nextBg = resolveBackgroundMode(customization);
      if (!supported.includes(nextBg)) {
        nextBg = meta.recommendedBackground || supported[0] || 'style';
      }
      setPointsBgMode(nextBg);

      const supportedMarkers = meta.supportedMarkerTypes || [
        'arabic-indic',
        'western',
        'bullets',
        'checks',
        'none',
      ];
      const nextMarker: PointsMarkerType =
        customization.pointsMarkerType &&
        supportedMarkers.includes(customization.pointsMarkerType)
          ? customization.pointsMarkerType
          : meta.defaultMarkerType || 'arabic-indic';

      setCustomization((prev) => {
        const curTiming = prev.pointsTiming || DEFAULT_POINTS_TIMING;
        let nextInterval = curTiming.revealInterval;
        if (ptId === 'pts_ranking' && Math.abs(nextInterval - 1.2) < 0.05) {
          nextInterval = 2.5;
        } else if (ptId !== 'pts_ranking' && Math.abs(nextInterval - 2.5) < 0.05) {
          nextInterval = 1.2;
        }
        const resolvedCreature = resolveFlyerCreature(prev.flyerCreature);
        const flyerTint =
          ptId === 'pts_flyer'
            ? prev.flyerCustomColor
              ? prev.accentColor
              : FLYER_DEFAULT_TINTS[resolvedCreature]
            : meta.defaultAccent;
        return {
          ...prev,
          mode: 'points',
          styleId: ptId,
          pointsStyleId: ptId,
          flyerCreature: resolvedCreature,
          pointsMarkerType: nextMarker,
          pointsTiming: {
            ...curTiming,
            revealInterval: nextInterval,
          },
          backgroundMode: nextBg,
          greenScreen: nextBg === 'green',
          accentColor: flyerTint,
          keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
          quoteFontOverride: '',
        };
      });
    } else if (studioMode === 'chat') {
      const cId = styleId as ChatStyleId;
      setChatStyleId(cId);

      let nextBg = resolveBackgroundMode(customization);
      if (!supported.includes(nextBg)) {
        nextBg = meta.recommendedBackground || supported[0] || 'style';
      }
      setChatBgMode(nextBg);

      setCustomization((prev) => ({
        ...prev,
        mode: 'chat',
        styleId: cId,
        chatStyleId: cId,
        backgroundMode: nextBg,
        greenScreen: nextBg === 'green',
        accentColor: meta.defaultAccent,
        keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
        quoteFontOverride: '',
      }));
    } else if (studioMode === 'phrase') {
      const pId = styleId as PhraseStyleId;
      setPhraseStyleId(pId);

      let nextBg = resolveBackgroundMode(customization);
      if (!supported.includes(nextBg)) {
        nextBg = meta.recommendedBackground || supported[0] || 'style';
      }
      setPhraseBgMode(nextBg);

      setCustomization((prev) => {
        const resolvedCreature = resolveFlyerCreature(prev.flyerCreature);
        const flyerTint =
          pId === 'phrase_flyer'
            ? prev.flyerCustomColor
              ? prev.accentColor
              : FLYER_DEFAULT_TINTS[resolvedCreature]
            : meta.defaultAccent;
        return {
          ...prev,
          mode: 'phrase',
          styleId: pId,
          phraseStyleId: pId,
          flyerCreature: resolvedCreature,
          backgroundMode: nextBg,
          greenScreen: nextBg === 'green',
          accentColor: flyerTint,
          keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
          quoteFontOverride: '',
        };
      });
    } else {
      const qId = styleId as QuoteStyleId;
      setQuoteStyleId(qId);

      let nextBg = resolveBackgroundMode(customization);
      if (!supported.includes(nextBg)) {
        nextBg = meta.recommendedBackground || 'style';
      }
      setQuoteBgMode(nextBg);

      setCustomization((prev) => ({
        ...prev,
        mode: 'quote',
        styleId: qId,
        backgroundMode: nextBg,
        greenScreen: nextBg === 'green',
        accentColor: meta.defaultAccent,
        keywordColor: meta.defaultKeywordColor || '#FFD166',
        quoteFontOverride: '',
      }));
    }
  };

  // Flyer Creature Selection Handler (updates accentColor to creature default unless manually customized)
  const handleSelectFlyerCreature = (creature: FlyerCreatureId) => {
    setCustomization((prev) => ({
      ...prev,
      flyerCreature: creature,
      accentColor: prev.flyerCustomColor
        ? prev.accentColor
        : FLYER_DEFAULT_TINTS[creature],
    }));
  };

  // Flyer Theme Selection Handler ('dark' | 'light' Calm White Gradient)
  const handleSelectFlyerTheme = (nextTheme: CalmStyleTheme) => {
    if (studioMode === 'points') {
      setPointsBgMode('style');
    } else if (studioMode === 'phrase') {
      setPhraseBgMode('style');
    }
    setCustomization((prev) => ({
      ...prev,
      flyerTheme: nextTheme,
      styleTheme: nextTheme,
      backgroundMode: 'style',
      greenScreen: false,
    }));
  };

  // Flyer Flight Speed Handler (0.25x .. 1.25x, default 0.55x calm slow flight)
  const handleChangeFlyerFlightSpeed = (nextSpeed: number) => {
    const clampedSpeed = clamp(nextSpeed, 0.25, 1.25);
    setCustomization((prev) => ({
      ...prev,
      flyerFlightSpeed: clampedSpeed,
    }));
  };

  // Quiet Night Cricket Sound Handlers for Living Creature Styles
  const handleToggleFlyerCricket = (enabled: boolean) => {
    const preset = resolveFlyerCricketPreset(customization.flyerCricketPreset);
    const volume = resolveFlyerCricketVolume(customization.flyerCricketVolume);
    const nextCustom: StyleCustomization = {
      ...customization,
      flyerCricketEnabled: enabled,
      flyerCricketPreset: preset,
      flyerCricketVolume: volume,
    };
    setCustomization(nextCustom);

    if (enabled) {
      if (isPlaying) {
        startLiveSfxFrom(playbackRef.current.currentTime, nextCustom);
      } else {
        auditionCricketPreset(preset, volume, customization.seed);
      }
    } else if (isPlaying && sfxSettings.enabled) {
      startLiveSfxFrom(playbackRef.current.currentTime, nextCustom);
    } else {
      stopLiveSfx();
    }
  };

  const handleSelectFlyerCricketPreset = (preset: FlyerCricketPresetId) => {
    const resolvedPreset = resolveFlyerCricketPreset(preset);
    const volume = resolveFlyerCricketVolume(customization.flyerCricketVolume);
    const nextCustom: StyleCustomization = {
      ...customization,
      flyerCricketEnabled: true,
      flyerCricketPreset: resolvedPreset,
      flyerCricketVolume: volume,
    };
    setCustomization(nextCustom);

    if (isPlaying) {
      startLiveSfxFrom(playbackRef.current.currentTime, nextCustom);
    } else {
      auditionCricketPreset(resolvedPreset, volume, customization.seed);
    }
  };

  const handleChangeFlyerCricketVolume = (volume: number) => {
    const clampedVol = resolveFlyerCricketVolume(volume);
    setCustomization((prev) => ({
      ...prev,
      flyerCricketVolume: clampedVol,
    }));
    if (liveCricketVolumeSetterRef.current) {
      liveCricketVolumeSetterRef.current(clampedVol);
    }
  };

  const handlePreviewFlyerCricket = () => {
    const preset = resolveFlyerCricketPreset(customization.flyerCricketPreset);
    const volume = resolveFlyerCricketVolume(customization.flyerCricketVolume);
    if (isPlaying) {
      startLiveSfxFrom(playbackRef.current.currentTime, {
        ...customization,
        flyerCricketEnabled: true,
        flyerCricketPreset: preset,
        flyerCricketVolume: volume,
      });
    } else {
      auditionCricketPreset(preset, volume, customization.seed);
    }
  };

  // Timeline Theme Selection Handler ('dark' | 'light' Calm White Gradient)
  const handleSelectTimelineTheme = (nextTheme: CalmStyleTheme) => {
    setPointsBgMode('style');
    setCustomization((prev) => ({
      ...prev,
      timelineTheme: nextTheme,
      styleTheme: nextTheme,
      backgroundMode: 'style',
      greenScreen: false,
    }));
  };

  // Position Change Handler (Phrase, Chat, Points, and Image modes)
  const handlePositionChange = (nextPos: PhrasePosition) => {
    setCustomization((prev) => ({
      ...prev,
      position: nextPos,
    }));
  };

  // Background Mode Change Handler
  const handleBackgroundModeChange = (nextBg: BackgroundMode) => {
    const supported = activeStyleMeta.supportedBackgrounds || ['style', 'green', 'black'];
    if (!supported.includes(nextBg)) return;

    if (studioMode === 'video') {
      setVideoBgMode(nextBg);
      setCustomization((prev) => ({
        ...prev,
        backgroundMode: nextBg,
        greenScreen: nextBg === 'green',
      }));
    } else if (studioMode === 'image') {
      setImageBgMode(nextBg);
      setCustomization((prev) => ({
        ...prev,
        backgroundMode: nextBg,
        greenScreen: nextBg === 'green',
      }));
    } else if (studioMode === 'points') {
      setPointsBgMode(nextBg);
      setCustomization((prev) => ({
        ...prev,
        backgroundMode: nextBg,
        greenScreen: nextBg === 'green',
      }));
    } else if (studioMode === 'chat') {
      setChatBgMode(nextBg);
      setCustomization((prev) => ({
        ...prev,
        backgroundMode: nextBg,
        greenScreen: nextBg === 'green',
      }));
    } else if (studioMode === 'phrase') {
      setPhraseBgMode(nextBg);
      setCustomization((prev) => ({
        ...prev,
        backgroundMode: nextBg,
        greenScreen: nextBg === 'green',
      }));
    } else {
      setQuoteBgMode(nextBg);
      setCustomization((prev) => ({
        ...prev,
        backgroundMode: nextBg,
        greenScreen: nextBg === 'green',
      }));
    }
  };

  // Format Change Handler (16:9 vs 9:16)
  const handleFormatChange = (nextFormat: '16:9' | '9:16') => {
    setCustomization((prev) => {
      // In 9:16, left/right positions are disabled; auto-fallback to center if currently left/right
      const nextPos =
        nextFormat === '9:16' && (prev.position === 'left' || prev.position === 'right')
          ? 'center'
          : prev.position;
      return {
        ...prev,
        format: nextFormat,
        position: nextPos,
      };
    });
  };

  // Wrap Selected Text in Asterisks ("★ تمييز النص المحدد")
  const handleWrapSelectionInAsterisks = () => {
    const el = textareaRef.current;
    const currentText = studioMode === 'phrase' ? phraseInput : quoteInput;
    const setText = studioMode === 'phrase' ? setPhraseInput : setQuoteInput;

    if (el && el.selectionStart !== el.selectionEnd) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = currentText.slice(start, end).trim();
      if (selected) {
        // If already wrapped in *...*, unwrap; otherwise wrap in *...*
        const before = currentText.slice(0, start);
        const after = currentText.slice(end);
        const updated = `${before}*${selected}*${after}`;
        setText(updated);
        setTimeout(() => {
          el.focus();
          el.setSelectionRange(start, start + selected.length + 2);
        }, 0);
        return;
      }
    }

    // Fallback if no text is currently highlighted: wrap the last unmarked word
    const trimmed = currentText.trimEnd();
    const lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace === -1 && trimmed.length > 0) {
      if (!trimmed.startsWith('*')) {
        setText(`*${trimmed}*`);
      }
    } else if (lastSpace !== -1) {
      const lastWord = trimmed.slice(lastSpace + 1);
      if (lastWord && !lastWord.includes('*')) {
        setText(`${trimmed.slice(0, lastSpace + 1)}*${lastWord}*`);
      }
    }
  };

  // Image Mode Caption Keyword Wrapper
  const handleWrapImageCaptionKeyword = () => {
    const el = document.getElementById('image-caption-textarea') as HTMLTextAreaElement | null;
    const curCaption = customization.imageCaption ?? DEFAULT_IMAGE_CAPTION;

    if (el && el.selectionStart !== el.selectionEnd) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = curCaption.slice(start, end).trim();
      if (selected) {
        const updated = `${curCaption.slice(0, start)}*${selected}*${curCaption.slice(end)}`;
        setCustomization((c) => ({ ...c, imageCaption: updated }));
        return;
      }
    }

    const trimmed = curCaption.trimEnd();
    const lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace === -1 && trimmed.length > 0 && !trimmed.startsWith('*')) {
      setCustomization((c) => ({ ...c, imageCaption: `*${trimmed}*` }));
    } else if (lastSpace !== -1) {
      const lastWord = trimmed.slice(lastSpace + 1);
      if (lastWord && !lastWord.includes('*')) {
        setCustomization((c) => ({
          ...c,
          imageCaption: `${trimmed.slice(0, lastSpace + 1)}*${lastWord}*`,
        }));
      }
    }
  };

  // Chat Mode Message & Timing Handlers
  const handleUpdateChatMessage = (
    id: string,
    patch: Partial<{ role: ChatRole; text: string }>
  ) => {
    setCustomization((prev) => {
      const list = prev.chatMessages || DEFAULT_CHAT_MESSAGES;
      return {
        ...prev,
        chatMessages: list.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      };
    });
  };

  const handleAddChatMessage = () => {
    setCustomization((prev) => {
      const list = prev.chatMessages || DEFAULT_CHAT_MESSAGES;
      if (list.length >= 8) return prev;
      const lastRole = list[list.length - 1]?.role || 'ai';
      const nextRole: ChatRole = lastRole === 'user' ? 'ai' : 'user';
      return {
        ...prev,
        chatMessages: [
          ...list,
          {
            id: `msg-${Date.now()}-${list.length + 1}`,
            role: nextRole,
            text:
              nextRole === 'user'
                ? 'سؤال جديد للمناقشة؟'
                : 'رد مختصر وواضح يبرز *الفكرة* الأساسية.',
          },
        ],
      };
    });
  };

  const handleDeleteChatMessage = (id: string) => {
    setCustomization((prev) => {
      const list = prev.chatMessages || DEFAULT_CHAT_MESSAGES;
      if (list.length <= 1) return prev;
      return {
        ...prev,
        chatMessages: list.filter((m) => m.id !== id),
      };
    });
  };

  const handleMoveChatMessage = (index: number, delta: -1 | 1) => {
    setCustomization((prev) => {
      const list = [...(prev.chatMessages || DEFAULT_CHAT_MESSAGES)];
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;
      const [moved] = list.splice(index, 1);
      list.splice(targetIndex, 0, moved);
      return {
        ...prev,
        chatMessages: list,
      };
    });
  };

  const handleWrapChatMessageKeyword = (id: string) => {
    const el = document.getElementById(`chat-msg-textarea-${id}`) as HTMLTextAreaElement | null;
    const list = customization.chatMessages || DEFAULT_CHAT_MESSAGES;
    const msg = list.find((m) => m.id === id);
    if (!msg) return;

    if (el && el.selectionStart !== el.selectionEnd) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = msg.text.slice(start, end).trim();
      if (selected) {
        const updated = `${msg.text.slice(0, start)}*${selected}*${msg.text.slice(end)}`;
        handleUpdateChatMessage(id, { text: updated });
        return;
      }
    }

    const trimmed = msg.text.trimEnd();
    const lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace === -1 && trimmed.length > 0 && !trimmed.startsWith('*')) {
      handleUpdateChatMessage(id, { text: `*${trimmed}*` });
    } else if (lastSpace !== -1) {
      const lastWord = trimmed.slice(lastSpace + 1);
      if (lastWord && !lastWord.includes('*')) {
        handleUpdateChatMessage(id, {
          text: `${trimmed.slice(0, lastSpace + 1)}*${lastWord}*`,
        });
      }
    }
  };

  const handleApplyQuickPaste = () => {
    const parsed = parseQuickPasteChatMessages(quickPasteInput);
    if (parsed.length > 0) {
      setCustomization((prev) => ({
        ...prev,
        chatMessages: parsed,
      }));
      setQuickPasteInput('');
    }
  };

  const handleUpdateChatTiming = (patch: Partial<ChatTimingConfig>) => {
    setCustomization((prev) => ({
      ...prev,
      chatTiming: {
        ...(prev.chatTiming || DEFAULT_CHAT_TIMING),
        ...patch,
      },
    }));
  };

  // Multi Points ("نقاط") Mode Handlers
  const handleUpdatePointsTitle = (title: string) => {
    setCustomization((prev) => ({
      ...prev,
      pointsTitle: title,
    }));
  };

  const handleWrapPointsTitleKeyword = () => {
    const el = document.getElementById('points-title-input') as HTMLInputElement | null;
    const title = customization.pointsTitle ?? DEFAULT_POINTS_TITLE;
    if (el && el.selectionStart !== null && el.selectionEnd !== null && el.selectionStart !== el.selectionEnd) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = title.slice(start, end).trim();
      if (selected) {
        const updated = `${title.slice(0, start)}*${selected}*${title.slice(end)}`;
        handleUpdatePointsTitle(updated);
        return;
      }
    }
    const trimmed = title.trimEnd();
    const lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace === -1 && trimmed.length > 0 && !trimmed.startsWith('*')) {
      handleUpdatePointsTitle(`*${trimmed}*`);
    } else if (lastSpace !== -1) {
      const lastWord = trimmed.slice(lastSpace + 1);
      if (lastWord && !lastWord.includes('*')) {
        handleUpdatePointsTitle(`${trimmed.slice(0, lastSpace + 1)}*${lastWord}*`);
      }
    }
  };

  const handleUpdatePointItem = (id: string, text: string) => {
    setCustomization((prev) => {
      const list = prev.pointsItems || DEFAULT_POINTS_ITEMS;
      return {
        ...prev,
        pointsItems: list.map((item) => (item.id === id ? { ...item, text } : item)),
      };
    });
  };

  const handleAddPointItem = () => {
    setCustomization((prev) => {
      const list = prev.pointsItems || DEFAULT_POINTS_ITEMS;
      if (list.length >= MAX_POINTS_ITEMS) return prev;
      return {
        ...prev,
        pointsItems: [
          ...list,
          {
            id: `pt-${Date.now()}-${list.length + 1}`,
            text: `نقطة جديدة رقم ${list.length + 1} تبرز *الفكرة* بوضوح`,
          },
        ],
      };
    });
  };

  const handleDeletePointItem = (id: string) => {
    setCustomization((prev) => {
      const list = prev.pointsItems || DEFAULT_POINTS_ITEMS;
      if (list.length <= 2) return prev;
      return {
        ...prev,
        pointsItems: list.filter((item) => item.id !== id),
      };
    });
  };

  const handleMovePointItem = (index: number, delta: -1 | 1) => {
    setCustomization((prev) => {
      const list = [...(prev.pointsItems || DEFAULT_POINTS_ITEMS)];
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;
      const [moved] = list.splice(index, 1);
      list.splice(targetIndex, 0, moved);
      return {
        ...prev,
        pointsItems: list,
      };
    });
  };

  const handleWrapPointItemKeyword = (id: string) => {
    const el = document.getElementById(`points-item-textarea-${id}`) as HTMLTextAreaElement | null;
    const list = customization.pointsItems || DEFAULT_POINTS_ITEMS;
    const item = list.find((it) => it.id === id);
    if (!item) return;

    if (el && el.selectionStart !== el.selectionEnd) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = item.text.slice(start, end).trim();
      if (selected) {
        const updated = `${item.text.slice(0, start)}*${selected}*${item.text.slice(end)}`;
        handleUpdatePointItem(id, updated);
        return;
      }
    }

    const trimmed = item.text.trimEnd();
    const lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace === -1 && trimmed.length > 0 && !trimmed.startsWith('*')) {
      handleUpdatePointItem(id, `*${trimmed}*`);
    } else if (lastSpace !== -1) {
      const lastWord = trimmed.slice(lastSpace + 1);
      if (lastWord && !lastWord.includes('*')) {
        handleUpdatePointItem(id, `${trimmed.slice(0, lastSpace + 1)}*${lastWord}*`);
      }
    }
  };

  const handleApplyPointsQuickPaste = () => {
    const parsed = parseQuickPastePointsItems(pointsQuickPasteInput);
    if (parsed.length > 0) {
      setCustomization((prev) => ({
        ...prev,
        pointsItems: parsed,
      }));
      setPointsQuickPasteInput('');
    }
  };

  const handleUpdatePointsTiming = (patch: Partial<PointsTimingConfig>) => {
    setCustomization((prev) => ({
      ...prev,
      pointsTiming: {
        ...(prev.pointsTiming || DEFAULT_POINTS_TIMING),
        ...patch,
      },
    }));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => {
          const next = !prev;
          let startT = playbackRef.current.currentTime;
          if (next && startT >= effectiveTimeline.total - 0.05) {
            startT = 0;
            playbackRef.current.currentTime = 0;
            setCurrentTime(0);
          }
          if (next) {
            startLiveSfxFrom(startT);
          } else {
            stopLiveSfx();
          }
          return next;
        });
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        playbackRef.current.currentTime = 0;
        setCurrentTime(0);
        setIsPlaying(true);
        startLiveSfxFrom(0);
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        setIsCleanMode((prev) => !prev);
      } else if (e.code === 'Escape' && isCleanMode) {
        setIsCleanMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [effectiveTimeline.total, isCleanMode, startLiveSfxFrom, stopLiveSfx]);

  const handleScrub = (newTime: number) => {
    stopLiveSfx(); // Always silent while scrubbing
    setIsPlaying(false);
    playbackRef.current.isPlaying = false;
    playbackRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    drawPreviewAtTime(newTime);
  };

  const handleReplay = () => {
    playbackRef.current.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(true);
    playbackRef.current.isPlaying = true;
    startLiveSfxFrom(0);
  };

  const handleStartMp4Export = async () => {
    stopLiveSfx();
    setIsPlaying(false);
    abortExportRef.current = { cancelled: false };
    await exportMp4Video({
      content: contentObj,
      timeline: activeTimeline,
      custom: customization,
      exportSettings,
      sfxSettings,
      videoFile: studioMode === 'video' ? videoFile : undefined,
      onProgress: (state) => setExportProgress(state),
      abortSignal: abortExportRef.current,
    });
  };

  const handleStartWebMExport = async () => {
    stopLiveSfx();
    setIsPlaying(false);
    abortExportRef.current = { cancelled: false };
    await exportWebMFallback({
      content: contentObj,
      timeline: activeTimeline,
      custom: customization,
      exportSettings,
      videoFile: studioMode === 'video' ? videoFile : undefined,
      onProgress: (state) => setExportProgress(state),
      abortSignal: abortExportRef.current,
    });
  };

  const handleExportStill = async () => {
    const res = await exportStillPng({
      content: contentObj,
      timeline: activeTimeline,
      custom: customization,
      resolution: exportSettings.resolution,
    });
    setStillToast(`تم حفظ الصورة الثابتة (${res.width}×${res.height}): ${res.fileName}`);
    setTimeout(() => setStillToast(''), 4500);
  };

  // Preset Handlers
  const savePresetsToStorage = (list: StudioPreset[]) => {
    setSavedPresets(list);
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Ignore quota errors
    }
  };

  const handleSavePreset = (name: string) => {
    const { audioFile: _unused, ...serializableExport } = exportSettings;
    const newPreset: StudioPreset = {
      id: `preset-${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      mode: studioMode,
      phraseText: phraseInput,
      chatMessages: customization.chatMessages || DEFAULT_CHAT_MESSAGES,
      chatUserLabel: customization.chatUserLabel || 'أنا',
      chatAiLabel: customization.chatAiLabel || 'الذكاء الاصطناعي',
      chatTiming: customization.chatTiming || DEFAULT_CHAT_TIMING,
      pointsTitle: customization.pointsTitle ?? DEFAULT_POINTS_TITLE,
      pointsItems: customization.pointsItems || DEFAULT_POINTS_ITEMS,
      pointsTiming: customization.pointsTiming || DEFAULT_POINTS_TIMING,
      pointsMarkerType: customization.pointsMarkerType || 'arabic-indic',
      pointsHighlightCurrent: customization.pointsHighlightCurrent ?? true,
      timelineShape: customization.timelineShape || 'straight',
      timelineOrientation: customization.timelineOrientation || 'auto',
      timelineVerticalSide: customization.timelineVerticalSide || 'auto',
      timelineNodeScale: customization.timelineNodeScale ?? 1.0,
      timelineStemScale: customization.timelineStemScale ?? 1.0,
      timelineSpread: customization.timelineSpread ?? 1.0,
      timelineOffsetX: customization.timelineOffsetX ?? 0,
      timelineOffsetY: customization.timelineOffsetY ?? 0,
      imageCaption: customization.imageCaption ?? DEFAULT_IMAGE_CAPTION,
      imageSourceLine: customization.imageSourceLine ?? DEFAULT_IMAGE_SOURCE_LINE,
      imageFit: customization.imageFit || 'cover',
      imageScale: customization.imageScale ?? 1.0,
      imagePushIn: Boolean(customization.imagePushIn),
      newspaperKeepColor: Boolean(customization.newspaperKeepColor),
      cinematicGrade: customization.cinematicGrade ?? true,
      spotlightRegion: customization.spotlightRegion || DEFAULT_SPOTLIGHT_REGION,
      spotlightShape: customization.spotlightShape || 'circle',
      showFloatingObjects: customization.showFloatingObjects ?? true,
      flyerCreature: resolveFlyerCreature(customization.flyerCreature),
      flyerFlightSpeed: resolveFlyerFlightSpeed(customization),
      flyerCricketEnabled: Boolean(customization.flyerCricketEnabled),
      flyerCricketPreset: resolveFlyerCricketPreset(customization.flyerCricketPreset),
      flyerCricketVolume: resolveFlyerCricketVolume(customization.flyerCricketVolume),
      timelineTheme: resolveTimelineTheme(customization),
      flyerTheme: resolveFlyerTheme(customization),
      styleTheme: customization.styleTheme || 'dark',
      videoStyleId: customization.videoStyleId,
      videoBox: customization.videoBox || DEFAULT_VIDEO_BOX,
      videoAllowOutOfMargin: Boolean(customization.videoAllowOutOfMargin),
      videoAspectLock: customization.videoAspectLock ?? true,
      videoAdaptFrameToClip: customization.videoAdaptFrameToClip ?? true,
      videoFit: customization.videoFit || 'contain',
      videoScale: customization.videoScale ?? 1.0,
      videoCrop: { ...videoCrop },
      videoTrimIn: customization.videoTrimIn ?? 0,
      videoTrimOut: customization.videoTrimOut ?? DEFAULT_VIDEO_DURATION,
      videoSpeed: customization.videoSpeed ?? 1.0,
      videoEndBehavior: customization.videoEndBehavior || 'freeze',
      videoAudioEnabled: customization.videoAudioEnabled ?? true,
      videoAudioVolume: customization.videoAudioVolume ?? 0.85,
      videoCustomDurationEnabled: Boolean(customization.videoCustomDurationEnabled),
      videoCustomDuration: customization.videoCustomDuration,
      videoCaption: customization.videoCaption ?? DEFAULT_VIDEO_CAPTION,
      videoSourceLine: customization.videoSourceLine ?? DEFAULT_VIDEO_SOURCE_LINE,
      videoPipShape: customization.videoPipShape || 'circle',
      videoPipNameTag: customization.videoPipNameTag || '',
      timeline: activeTimeline,
      customization: {
        ...customization,
        flyerCreature: resolveFlyerCreature(customization.flyerCreature),
        flyerFlightSpeed: resolveFlyerFlightSpeed(customization),
        flyerCricketEnabled: Boolean(customization.flyerCricketEnabled),
        flyerCricketPreset: resolveFlyerCricketPreset(customization.flyerCricketPreset),
        flyerCricketVolume: resolveFlyerCricketVolume(customization.flyerCricketVolume),
        timelineTheme: resolveTimelineTheme(customization),
        flyerTheme: resolveFlyerTheme(customization),
      },
      exportSettings: serializableExport,
      quotationMarks,
      sfxSettings,
    };
    savePresetsToStorage([newPreset, ...savedPresets]);
  };

  const handleLoadPreset = (preset: StudioPreset) => {
    const targetMode: StudioMode = preset.mode || preset.customization.mode || 'quote';
    setStudioMode(targetMode);
    if (targetMode === 'video') {
      setVideoTimeline(preset.timeline || DEFAULT_VIDEO_TIMELINE);
      if (preset.videoStyleId || preset.customization.videoStyleId) {
        setVideoStyleId((preset.videoStyleId || preset.customization.videoStyleId) as VideoStyleId);
      } else if (preset.customization.styleId.startsWith('vid_')) {
        setVideoStyleId(preset.customization.styleId as VideoStyleId);
      }
      const presetBg = preset.customization.backgroundMode === 'style' ? 'style' : 'green';
      setVideoBgMode(presetBg);
      if (preset.videoCrop) {
        setVideoCrop(preset.videoCrop);
      }
      if (!videoFile) {
        setVideoPresetNotice(
          'تم تحميل إعدادات قالب الفيديو بنجاح. ارفع مقطع الفيديو الخاص بك لاستبدال المقطع التجريبي (لا تُحفظ ملفات الفيديو داخل القوالب).'
        );
      }
    } else if (targetMode === 'image') {
      setImageTimeline(preset.timeline || DEFAULT_IMAGE_TIMELINE);
      if (preset.customization.imageStyleId) {
        setImageStyleId(preset.customization.imageStyleId);
      } else if (preset.customization.styleId.startsWith('img_')) {
        setImageStyleId(preset.customization.styleId as ImageStyleId);
      }
      if (preset.customization.backgroundMode) {
        setImageBgMode(preset.customization.backgroundMode);
      }
    } else if (targetMode === 'points') {
      if (preset.customization.pointsStyleId) {
        setPointsStyleId(preset.customization.pointsStyleId);
      } else if (
        preset.customization.styleId.startsWith('pts_')
      ) {
        setPointsStyleId(preset.customization.styleId as PointsStyleId);
      }
      if (preset.customization.backgroundMode) {
        setPointsBgMode(preset.customization.backgroundMode);
      }
    } else if (targetMode === 'chat') {
      if (preset.customization.chatStyleId) {
        setChatStyleId(preset.customization.chatStyleId);
      } else if (preset.customization.styleId.startsWith('chat_')) {
        setChatStyleId(preset.customization.styleId as ChatStyleId);
      }
      if (preset.customization.backgroundMode) {
        setChatBgMode(preset.customization.backgroundMode);
      }
    } else if (targetMode === 'phrase') {
      setPhraseTimeline(preset.timeline);
      if (preset.phraseText) {
        setPhraseInput(preset.phraseText);
        setDebouncedPhrase(preset.phraseText);
      }
      if (preset.customization.phraseStyleId) {
        setPhraseStyleId(preset.customization.phraseStyleId);
      }
      if (preset.customization.backgroundMode) {
        setPhraseBgMode(preset.customization.backgroundMode);
      }
    } else {
      setQuoteTimeline(preset.timeline);
      setQuoteStyleId(preset.customization.styleId as QuoteStyleId);
      if (preset.customization.backgroundMode) {
        setQuoteBgMode(preset.customization.backgroundMode);
      }
    }
    const loadedCreature = resolveFlyerCreature(
      preset.flyerCreature || preset.customization.flyerCreature
    );
    setCustomization({
      ...preset.customization,
      mode: targetMode,
      backgroundMode:
        targetMode === 'video' && preset.customization.backgroundMode === 'black'
          ? 'green'
          : preset.customization.backgroundMode,
      greenScreen:
        targetMode === 'video'
          ? preset.customization.backgroundMode !== 'style'
          : preset.customization.greenScreen,
      flyerCreature: loadedCreature,
      flyerFlightSpeed: resolveFlyerFlightSpeed({
        flyerFlightSpeed:
          preset.flyerFlightSpeed ?? preset.customization.flyerFlightSpeed,
      }),
      flyerCricketEnabled: Boolean(
        preset.flyerCricketEnabled ?? preset.customization.flyerCricketEnabled
      ),
      flyerCricketPreset: resolveFlyerCricketPreset(
        preset.flyerCricketPreset ?? preset.customization.flyerCricketPreset
      ),
      flyerCricketVolume: resolveFlyerCricketVolume(
        preset.flyerCricketVolume ?? preset.customization.flyerCricketVolume
      ),
      timelineTheme:
        preset.timelineTheme ||
        preset.customization.timelineTheme ||
        preset.styleTheme ||
        preset.customization.styleTheme ||
        'dark',
      flyerTheme:
        preset.flyerTheme ||
        preset.customization.flyerTheme ||
        preset.styleTheme ||
        preset.customization.styleTheme ||
        'dark',
      styleTheme:
        preset.styleTheme ||
        preset.customization.styleTheme ||
        preset.timelineTheme ||
        preset.flyerTheme ||
        'dark',
      chatMessages:
        preset.chatMessages ||
        preset.customization.chatMessages ||
        DEFAULT_CHAT_MESSAGES,
      chatUserLabel:
        preset.chatUserLabel || preset.customization.chatUserLabel || 'أنا',
      chatAiLabel:
        preset.chatAiLabel || preset.customization.chatAiLabel || 'الذكاء الاصطناعي',
      chatTiming:
        preset.chatTiming || preset.customization.chatTiming || DEFAULT_CHAT_TIMING,
      pointsTitle:
        preset.pointsTitle ??
        preset.customization.pointsTitle ??
        DEFAULT_POINTS_TITLE,
      pointsItems:
        preset.pointsItems ||
        preset.customization.pointsItems ||
        DEFAULT_POINTS_ITEMS,
      pointsTiming:
        preset.pointsTiming ||
        preset.customization.pointsTiming ||
        DEFAULT_POINTS_TIMING,
      pointsMarkerType:
        preset.pointsMarkerType ||
        preset.customization.pointsMarkerType ||
        'arabic-indic',
      pointsHighlightCurrent:
        preset.pointsHighlightCurrent ??
        preset.customization.pointsHighlightCurrent ??
        true,
      timelineShape:
        preset.timelineShape ||
        preset.customization.timelineShape ||
        'straight',
      timelineOrientation:
        preset.timelineOrientation ||
        preset.customization.timelineOrientation ||
        'auto',
      timelineVerticalSide:
        preset.timelineVerticalSide ||
        preset.customization.timelineVerticalSide ||
        'auto',
      timelineNodeScale:
        preset.timelineNodeScale ??
        preset.customization.timelineNodeScale ??
        1.0,
      timelineStemScale:
        preset.timelineStemScale ??
        preset.customization.timelineStemScale ??
        1.0,
      timelineSpread:
        preset.timelineSpread ??
        preset.customization.timelineSpread ??
        1.0,
      timelineOffsetX:
        preset.timelineOffsetX ??
        preset.customization.timelineOffsetX ??
        0,
      timelineOffsetY:
        preset.timelineOffsetY ??
        preset.customization.timelineOffsetY ??
        0,
      imageCaption:
        preset.imageCaption ??
        preset.customization.imageCaption ??
        DEFAULT_IMAGE_CAPTION,
      imageSourceLine:
        preset.imageSourceLine ??
        preset.customization.imageSourceLine ??
        DEFAULT_IMAGE_SOURCE_LINE,
      imageFit:
        preset.imageFit ||
        preset.customization.imageFit ||
        'cover',
      imageScale:
        preset.imageScale ??
        preset.customization.imageScale ??
        1.0,
      imagePushIn:
        preset.imagePushIn ??
        preset.customization.imagePushIn ??
        false,
      newspaperKeepColor:
        preset.newspaperKeepColor ??
        preset.customization.newspaperKeepColor ??
        false,
      cinematicGrade:
        preset.cinematicGrade ??
        preset.customization.cinematicGrade ??
        true,
      spotlightRegion:
        preset.spotlightRegion ||
        preset.customization.spotlightRegion ||
        DEFAULT_SPOTLIGHT_REGION,
      spotlightShape:
        preset.spotlightShape ||
        preset.customization.spotlightShape ||
        'circle',
      showFloatingObjects:
        preset.showFloatingObjects ??
        preset.customization.showFloatingObjects ??
        true,
      videoStyleId:
        preset.videoStyleId ||
        preset.customization.videoStyleId ||
        'vid_floating',
      videoBox:
        preset.videoBox ||
        preset.customization.videoBox ||
        DEFAULT_VIDEO_BOX,
      videoAllowOutOfMargin:
        preset.videoAllowOutOfMargin ??
        preset.customization.videoAllowOutOfMargin ??
        false,
      videoAspectLock:
        preset.videoAspectLock ??
        preset.customization.videoAspectLock ??
        true,
      videoAdaptFrameToClip:
        preset.videoAdaptFrameToClip ??
        preset.customization.videoAdaptFrameToClip ??
        true,
      videoFit:
        preset.videoFit ||
        preset.customization.videoFit ||
        'contain',
      videoScale:
        preset.videoScale ??
        preset.customization.videoScale ??
        1.0,
      videoTrimIn:
        preset.videoTrimIn ??
        preset.customization.videoTrimIn ??
        0,
      videoTrimOut:
        preset.videoTrimOut ??
        preset.customization.videoTrimOut ??
        (videoMeta?.duration || DEFAULT_VIDEO_DURATION),
      videoSpeed:
        preset.videoSpeed ??
        preset.customization.videoSpeed ??
        1.0,
      videoEndBehavior:
        preset.videoEndBehavior ||
        preset.customization.videoEndBehavior ||
        'freeze',
      videoAudioEnabled:
        preset.videoAudioEnabled ??
        preset.customization.videoAudioEnabled ??
        true,
      videoAudioVolume:
        preset.videoAudioVolume ??
        preset.customization.videoAudioVolume ??
        0.85,
      videoCustomDurationEnabled:
        preset.videoCustomDurationEnabled ??
        preset.customization.videoCustomDurationEnabled ??
        false,
      videoCustomDuration:
        preset.videoCustomDuration ??
        preset.customization.videoCustomDuration,
      videoCaption:
        preset.videoCaption ??
        preset.customization.videoCaption ??
        DEFAULT_VIDEO_CAPTION,
      videoSourceLine:
        preset.videoSourceLine ??
        preset.customization.videoSourceLine ??
        DEFAULT_VIDEO_SOURCE_LINE,
      videoPipShape:
        preset.videoPipShape ||
        preset.customization.videoPipShape ||
        'circle',
      videoPipNameTag:
        preset.videoPipNameTag ??
        preset.customization.videoPipNameTag ??
        '',
    });
    setExportSettings((prev) => ({
      ...prev,
      resolution: preset.exportSettings?.resolution ?? prev.resolution,
      fps: preset.exportSettings?.fps ?? prev.fps,
      quality: preset.exportSettings?.quality ?? prev.quality,
      endPadding: preset.exportSettings?.endPadding ?? prev.endPadding,
      quickTest: preset.exportSettings?.quickTest ?? prev.quickTest,
      audioVolume: preset.exportSettings?.audioVolume ?? prev.audioVolume,
    }));
    if (preset.quotationMarks) {
      setQuotationMarks(preset.quotationMarks);
    }
    if (preset.sfxSettings) {
      setSfxSettings(preset.sfxSettings);
    }
  };

  const handleDeletePreset = (id: string) => {
    savePresetsToStorage(savedPresets.filter((p) => p.id !== id));
  };

  const handleExportPresetJson = () => {
    const { audioFile: _unused, ...serializableExport } = exportSettings;
    const preset: StudioPreset = {
      id: `preset-${Date.now()}`,
      name: `قالب ${activeStyleMeta.nameAr}`,
      createdAt: new Date().toISOString(),
      mode: studioMode,
      phraseText: phraseInput,
      chatMessages: customization.chatMessages || DEFAULT_CHAT_MESSAGES,
      chatUserLabel: customization.chatUserLabel || 'أنا',
      chatAiLabel: customization.chatAiLabel || 'الذكاء الاصطناعي',
      chatTiming: customization.chatTiming || DEFAULT_CHAT_TIMING,
      pointsTitle: customization.pointsTitle ?? DEFAULT_POINTS_TITLE,
      pointsItems: customization.pointsItems || DEFAULT_POINTS_ITEMS,
      pointsTiming: customization.pointsTiming || DEFAULT_POINTS_TIMING,
      pointsMarkerType: customization.pointsMarkerType || 'arabic-indic',
      pointsHighlightCurrent: customization.pointsHighlightCurrent ?? true,
      timelineShape: customization.timelineShape || 'straight',
      timelineOrientation: customization.timelineOrientation || 'auto',
      timelineVerticalSide: customization.timelineVerticalSide || 'auto',
      timelineNodeScale: customization.timelineNodeScale ?? 1.0,
      timelineStemScale: customization.timelineStemScale ?? 1.0,
      timelineSpread: customization.timelineSpread ?? 1.0,
      timelineOffsetX: customization.timelineOffsetX ?? 0,
      timelineOffsetY: customization.timelineOffsetY ?? 0,
      imageCaption: customization.imageCaption ?? DEFAULT_IMAGE_CAPTION,
      imageSourceLine: customization.imageSourceLine ?? DEFAULT_IMAGE_SOURCE_LINE,
      imageFit: customization.imageFit || 'cover',
      imageScale: customization.imageScale ?? 1.0,
      imagePushIn: Boolean(customization.imagePushIn),
      newspaperKeepColor: Boolean(customization.newspaperKeepColor),
      cinematicGrade: customization.cinematicGrade ?? true,
      spotlightRegion: customization.spotlightRegion || DEFAULT_SPOTLIGHT_REGION,
      spotlightShape: customization.spotlightShape || 'circle',
      showFloatingObjects: customization.showFloatingObjects ?? true,
      flyerCreature: resolveFlyerCreature(customization.flyerCreature),
      flyerFlightSpeed: resolveFlyerFlightSpeed(customization),
      flyerCricketEnabled: Boolean(customization.flyerCricketEnabled),
      flyerCricketPreset: resolveFlyerCricketPreset(customization.flyerCricketPreset),
      flyerCricketVolume: resolveFlyerCricketVolume(customization.flyerCricketVolume),
      timelineTheme: resolveTimelineTheme(customization),
      flyerTheme: resolveFlyerTheme(customization),
      styleTheme: customization.styleTheme || 'dark',
      videoStyleId: customization.videoStyleId,
      videoBox: customization.videoBox || DEFAULT_VIDEO_BOX,
      videoAllowOutOfMargin: Boolean(customization.videoAllowOutOfMargin),
      videoAspectLock: customization.videoAspectLock ?? true,
      videoAdaptFrameToClip: customization.videoAdaptFrameToClip ?? true,
      videoFit: customization.videoFit || 'contain',
      videoScale: customization.videoScale ?? 1.0,
      videoCrop: { ...videoCrop },
      videoTrimIn: customization.videoTrimIn ?? 0,
      videoTrimOut: customization.videoTrimOut ?? DEFAULT_VIDEO_DURATION,
      videoSpeed: customization.videoSpeed ?? 1.0,
      videoEndBehavior: customization.videoEndBehavior || 'freeze',
      videoAudioEnabled: customization.videoAudioEnabled ?? true,
      videoAudioVolume: customization.videoAudioVolume ?? 0.85,
      videoCustomDurationEnabled: Boolean(customization.videoCustomDurationEnabled),
      videoCustomDuration: customization.videoCustomDuration,
      videoCaption: customization.videoCaption ?? DEFAULT_VIDEO_CAPTION,
      videoSourceLine: customization.videoSourceLine ?? DEFAULT_VIDEO_SOURCE_LINE,
      videoPipShape: customization.videoPipShape || 'circle',
      videoPipNameTag: customization.videoPipNameTag || '',
      timeline: activeTimeline,
      customization: {
        ...customization,
        flyerCreature: resolveFlyerCreature(customization.flyerCreature),
        flyerFlightSpeed: resolveFlyerFlightSpeed(customization),
        flyerCricketEnabled: Boolean(customization.flyerCricketEnabled),
        flyerCricketPreset: resolveFlyerCricketPreset(customization.flyerCricketPreset),
        flyerCricketVolume: resolveFlyerCricketVolume(customization.flyerCricketVolume),
        timelineTheme: resolveTimelineTheme(customization),
        flyerTheme: resolveFlyerTheme(customization),
      },
      exportSettings: serializableExport,
      quotationMarks,
      sfxSettings,
    };
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studio-preset-${studioMode}-${activeStyleId}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleResetTimelineAdjustments = () => {
    setCustomization((prev) => ({
      ...prev,
      timelineNodeScale: 1.0,
      timelineStemScale: 1.0,
      timelineSpread: 1.0,
      timelineOffsetX: 0,
      timelineOffsetY: 0,
      pointsItems: (prev.pointsItems || DEFAULT_POINTS_ITEMS).map((it) => ({
        ...it,
        nodeOffsetX: 0,
        nodeOffsetY: 0,
        textOffsetX: 0,
        textOffsetY: 0,
        itemScale: 1.0,
      })),
    }));
  };

  const handlePreviewCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      studioMode !== 'points' ||
      activeStyleId !== 'pts_timeline' ||
      !isTimelineDragEnabled
    ) {
      return;
    }
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const size = getRenderSize(customization.format, '1080p');
    const scaleX = size.baseWidth / rect.width;
    const scaleY = size.baseHeight / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const targets = getPtsTimelineInteractiveTargets(
      ctx,
      contentObj,
      customization,
      size
    );
    const items = customization.pointsItems || DEFAULT_POINTS_ITEMS;

    // 1. Check node hit first (generous hit radius for easy grabbing)
    for (let i = targets.length - 1; i >= 0; i--) {
      const tgt = targets[i];
      const dist = Math.hypot(canvasX - tgt.nodeX, canvasY - tgt.nodeY);
      if (dist <= Math.max(tgt.nodeRadius * 1.45, 28)) {
        const matchedItem = items[tgt.index];
        if (!matchedItem) continue;
        setSelectedTimelinePointIdx(tgt.index);
        timelineDragRef.current = {
          pointerId: e.pointerId,
          itemId: matchedItem.id,
          targetType: 'node',
          startClientX: e.clientX,
          startClientY: e.clientY,
          startOffsetX: matchedItem.nodeOffsetX ?? 0,
          startOffsetY: matchedItem.nodeOffsetY ?? 0,
        };
        setIsDraggingTimelineTarget(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }

    // 2. Check text box hit
    for (let i = targets.length - 1; i >= 0; i--) {
      const tgt = targets[i];
      const pad = 14;
      if (
        canvasX >= tgt.textBoxX - pad &&
        canvasX <= tgt.textBoxX + tgt.textBoxW + pad &&
        canvasY >= tgt.textBoxY - pad &&
        canvasY <= tgt.textBoxY + tgt.textBoxH + pad
      ) {
        const matchedItem = items[tgt.index];
        if (!matchedItem) continue;
        setSelectedTimelinePointIdx(tgt.index);
        timelineDragRef.current = {
          pointerId: e.pointerId,
          itemId: matchedItem.id,
          targetType: 'text',
          startClientX: e.clientX,
          startClientY: e.clientY,
          startOffsetX: matchedItem.textOffsetX ?? 0,
          startOffsetY: matchedItem.textOffsetY ?? 0,
        };
        setIsDraggingTimelineTarget(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }
  };

  const handlePreviewCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = timelineDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const size = getRenderSize(customization.format, '1080p');
    const dx = (e.clientX - drag.startClientX) * (size.baseWidth / rect.width);
    const dy = (e.clientY - drag.startClientY) * (size.baseHeight / rect.height);

    const nextOffX = Math.round(clamp(drag.startOffsetX + dx, -350, 350));
    const nextOffY = Math.round(clamp(drag.startOffsetY + dy, -350, 350));

    setCustomization((prev) => ({
      ...prev,
      pointsItems: (prev.pointsItems || DEFAULT_POINTS_ITEMS).map((it) => {
        if (it.id !== drag.itemId) return it;
        if (drag.targetType === 'node') {
          return {
            ...it,
            nodeOffsetX: nextOffX,
            nodeOffsetY: nextOffY,
          };
        }
        return {
          ...it,
          textOffsetX: nextOffX,
          textOffsetY: nextOffY,
        };
      }),
    }));
  };

  const handlePreviewCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = timelineDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    timelineDragRef.current = null;
    setIsDraggingTimelineTarget(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }
  };

  const wordCount =
    studioMode === 'points'
      ? pointsStats.totalWords
      : studioMode === 'chat'
        ? countChatTotalWords(customization.chatMessages || DEFAULT_CHAT_MESSAGES)
        : countWords(activeRawText);
  const currentBgMode = resolveBackgroundMode(customization);
  const supportedBgs = activeStyleMeta.supportedBackgrounds || ['style', 'green', 'black'];
  const recommendedBg = activeStyleMeta.recommendedBackground || 'style';

  const hasGreenColorClash =
    (currentBgMode === 'green' || isFlyerStyleId(activeStyleId)) &&
    (isGreenishColor(customization.accentColor) ||
      isGreenishColor(customization.keywordColor || activeStyleMeta.defaultKeywordColor || ''));

  const imageGreenPixelRatio = useMemo(() => {
    if (studioMode !== 'image') return 0;
    const src = imageSource || getDefaultInsertImageCanvas();
    return getImageGreenPixelRatio(src, imageId);
  }, [studioMode, imageSource, imageId]);

  const hasImageGreenPixelClash =
    studioMode === 'image' && currentBgMode === 'green' && imageGreenPixelRatio > 0.08;

  const availableFontsForCurrentStyle = useMemo(() => {
    if (activeStyleMeta.allowedFonts && activeStyleMeta.allowedFonts.length > 0) {
      return ARABIC_FONTS_LIST.filter((f) => activeStyleMeta.allowedFonts!.includes(f.family));
    }
    return ARABIC_FONTS_LIST;
  }, [activeStyleMeta]);

  const availableEnglishFontsForCurrentStyle = useMemo(() => {
    if (activeStyleMeta.allowedEnglishFonts && activeStyleMeta.allowedEnglishFonts.length > 0) {
      return ENGLISH_FONTS_LIST.filter((f) => activeStyleMeta.allowedEnglishFonts!.includes(f.family));
    }
    return ENGLISH_FONTS_LIST;
  }, [activeStyleMeta]);

  // Clean Mode (Full Screen Canvas Only for OBS)
  if (isCleanMode) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black flex items-center justify-center cursor-none select-none"
        onDoubleClick={() => setIsCleanMode(false)}
      >
        <canvas
          ref={previewCanvasRef}
          data-testid="quote-preview-canvas"
          className={
            customization.format === '16:9'
              ? 'w-full h-full object-contain'
              : 'h-full w-auto object-contain'
          }
        />
        <div className="fixed top-4 left-4 opacity-0 hover:opacity-100 transition-opacity duration-200 cursor-pointer flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-3 py-1.5 rounded-lg text-xs text-slate-200">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={cleanLoop}
              onChange={(e) => setCleanLoop(e.target.checked)}
              className="accent-sky-400"
            />
            <span>تكرار تلقائي</span>
          </label>
          <span>·</span>
          <button
            type="button"
            onClick={() => setIsCleanMode(false)}
            className="text-sky-400 hover:underline font-semibold flex items-center gap-1"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>خروج من الوضع النظيف (Esc)</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      data-state={isPlaying ? 'playing' : 'paused'}
      data-mode={studioMode}
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col"
    >
      {/* Top Bar Contract: Brand + Mode Tabs ("اقتباس" | "جملة محورية") + Presets + Export Action */}
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-3 border-b border-slate-800/90 bg-slate-950/95 sticky top-0 z-30">
        <div className="flex items-center gap-5">
          <a
            href="#studio"
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            استوديو فيديو الاقتباسات
          </a>

          {/* Top Mode Tabs: "اقتباس" | "جملة محورية" | "محادثة" | "نقاط" | "صورة" (horizontally scrollable) */}
          <div
            role="tablist"
            aria-label="وضع الاستوديو"
            className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto max-w-full"
          >
            <button
              type="button"
              role="tab"
              aria-selected={studioMode === 'quote'}
              data-testid="tab-mode-quote"
              onClick={() => handleModeChange('quote')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                studioMode === 'quote'
                  ? 'bg-sky-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              اقتباس
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioMode === 'phrase'}
              data-testid="tab-mode-phrase"
              onClick={() => handleModeChange('phrase')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                studioMode === 'phrase'
                  ? 'bg-sky-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              جملة محورية
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioMode === 'chat'}
              data-testid="tab-mode-chat"
              onClick={() => handleModeChange('chat')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                studioMode === 'chat'
                  ? 'bg-sky-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              محادثة
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioMode === 'points'}
              data-testid="tab-mode-points"
              onClick={() => handleModeChange('points')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                studioMode === 'points'
                  ? 'bg-sky-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              نقاط
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioMode === 'image'}
              data-testid="tab-mode-image"
              onClick={() => handleModeChange('image')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                studioMode === 'image'
                  ? 'bg-sky-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              صورة
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioMode === 'video'}
              data-testid="tab-mode-video"
              onClick={() => handleModeChange('video')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                studioMode === 'video'
                  ? 'bg-sky-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              فيديو
            </button>
          </div>
        </div>

        {/* Navigation Links */}
        <nav
          aria-label="أقسام الاستوديو"
          className="hidden xl:flex items-center gap-5 text-xs font-medium text-slate-400"
        >
          <a
            href="#section-content"
            onClick={(e) => {
              e.preventDefault();
              setOpenSections((s) => ({ ...s, content: true }));
            }}
            className="hover:text-white transition-colors whitespace-nowrap"
          >
            {studioMode === 'video'
              ? 'الفيديو'
              : studioMode === 'image'
                ? 'الصورة'
                : studioMode === 'points'
                  ? 'النقاط'
                  : studioMode === 'chat'
                    ? 'الرسائل'
                    : 'المحتوى'}
          </a>
          <a
            href="#section-style"
            onClick={(e) => {
              e.preventDefault();
              setOpenSections((s) => ({ ...s, style: true }));
            }}
            className="hover:text-white transition-colors whitespace-nowrap"
          >
            الستايل ({activeStyleMeta.nameAr})
          </a>
          <a
            href="#section-position-bg"
            onClick={(e) => {
              e.preventDefault();
              setOpenSections((s) => ({ ...s, positionBg: true }));
            }}
            className="hover:text-white transition-colors whitespace-nowrap"
          >
            المكان والخلفية
          </a>
          <a
            href="#section-timing"
            onClick={(e) => {
              e.preventDefault();
              setOpenSections((s) => ({ ...s, timing: true }));
            }}
            className="hover:text-white transition-colors whitespace-nowrap"
          >
            التوقيت ({effectiveTimeline.total}ث)
          </a>
          <button
            type="button"
            onClick={() => setIsPresetsOpen(true)}
            className="hover:text-white transition-colors whitespace-nowrap"
          >
            القوالب المحفوظة
          </button>
        </nav>

        {/* Primary Export Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={mp4Supported ? handleStartMp4Export : handleStartWebMExport}
            className="px-4 py-2 text-xs font-bold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{mp4Supported ? 'تصدير MP4' : 'تصدير WebM'}</span>
          </button>
        </div>
      </header>

      {/* Main Studio Workspace Split */}
      <main
        id="studio"
        className="flex-1 grid grid-cols-1 lg:grid-cols-[440px_1fr] xl:grid-cols-[470px_1fr] min-h-0"
      >
        {/* Right Sidebar Control Panel */}
        <aside className="border-l border-slate-800/90 bg-slate-900/35 overflow-y-auto lg:h-[calc(100vh-57px)] divide-y divide-slate-800/80">
          {/* SECTION 1: المحتوى (Content & Keyword Marker) */}
          <section id="section-content" className="p-4">
            <button
              type="button"
              onClick={() => toggleSection('content')}
              aria-expanded={openSections.content}
              className="w-full flex items-center justify-between text-right py-1"
            >
              <span className="text-sm font-bold text-white">
                {studioMode === 'video'
                  ? '1. مقطع الفيديو والتعليق'
                  : studioMode === 'image'
                    ? '1. الصورة والتعليق'
                    : studioMode === 'points'
                      ? '1. النقاط'
                      : studioMode === 'chat'
                        ? '1. الرسائل'
                        : studioMode === 'phrase'
                          ? '1. نص الجملة المحورية'
                          : '1. المحتوى والاقتباس'}
              </span>
              {openSections.content ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {openSections.content && (
              <div className="mt-4 space-y-4">
                {studioMode === 'video' ? (
                  <div className="space-y-3" data-testid="video-insert-section">
                    {videoPresetNotice && !videoFile && (
                      <div className="flex items-start justify-between gap-2 rounded-xl bg-sky-500/10 border border-sky-500/30 p-2.5 text-xs text-sky-200">
                        <span>{videoPresetNotice}</span>
                        <button
                          type="button"
                          onClick={() => setVideoPresetNotice(null)}
                          className="text-sky-400 hover:text-white shrink-0"
                        >
                          إغلاق
                        </button>
                      </div>
                    )}
                    <VideoUploadAndClipControls
                      customization={customization}
                      setCustomization={setCustomization}
                      videoMeta={videoMeta}
                      videoThumbnails={videoThumbnails}
                      videoLoading={videoLoading}
                      videoLoadError={videoLoadError}
                      videoSoftWarning={videoSoftWarning}
                      videoGreenRatio={videoGreenRatio}
                      onSelectVideoFile={handleSelectVideoFile}
                      onClearVideoFile={handleClearVideoFile}
                    />
                  </div>
                ) : studioMode === 'image' ? (
                  <div className="space-y-4" data-testid="image-insert-section">
                    {/* Image Upload / Drag-Drop / Paste + Crop + Spotlight Region */}
                    <PhotoCropControl
                      photoSource={imageSource}
                      photoId={imageId}
                      crop={imageCrop}
                      isImageMode={true}
                      fitMode={
                        customization.imageFit || activeStyleMeta.defaultImageFit || 'cover'
                      }
                      spotlightRegion={
                        activeStyleId === 'img_spotlight'
                          ? customization.spotlightRegion || DEFAULT_SPOTLIGHT_REGION
                          : undefined
                      }
                      onSpotlightRegionChange={
                        activeStyleId === 'img_spotlight'
                          ? (nextRegion) =>
                              setCustomization((c) => ({
                                ...c,
                                spotlightRegion: nextRegion,
                              }))
                          : undefined
                      }
                      onPhotoChange={(img, id) => {
                        setImageSource(img);
                        setImageId(id);
                      }}
                      onCropChange={setImageCrop}
                    />

                    {/* Fit Toggle: "ملء / احتواء" (cover / contain) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">
                          ملاءمة الصورة داخل الإطار (ملء / احتواء)
                        </span>
                        <span className="text-[10px] text-slate-400">
                          يتطابق الإطار تلقائياً مع أبعاد الصورة
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                        {(
                          [
                            {
                              id: 'cover' as ImageFitMode,
                              labelAr: 'ملء الإطار (Cover)',
                              subAr: 'يملأ الكادر بالكامل',
                            },
                            {
                              id: 'contain' as ImageFitMode,
                              labelAr: 'احتواء كامل (Contain)',
                              subAr: 'مثالي للقطات الشاشة والشعارات',
                            },
                          ]
                        ).map((fitOpt) => {
                          const currentFit =
                            customization.imageFit ||
                            activeStyleMeta.defaultImageFit ||
                            'cover';
                          const isSel = currentFit === fitOpt.id;
                          return (
                            <button
                              key={fitOpt.id}
                              type="button"
                              data-testid={`image-fit-${fitOpt.id}`}
                              onClick={() =>
                                setCustomization((c) => ({ ...c, imageFit: fitOpt.id }))
                              }
                              className={`py-2 px-2.5 rounded-lg text-center transition-colors ${
                                isSel
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
                              }`}
                            >
                              <span className="block text-xs">{fitOpt.labelAr}</span>
                              <span className="block text-[10px] opacity-75 mt-0.5">
                                {fitOpt.subAr}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Optional Caption (supports *keyword*) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="image-caption-textarea"
                          className="text-xs font-semibold text-slate-300"
                        >
                          تعليق توضيحي على الحافة السفلية للصورة (اختياري — يدعم *الكلمات المفتاحية*)
                        </label>
                        <button
                          type="button"
                          data-testid="btn-mark-image-caption-keyword"
                          onClick={handleWrapImageCaptionKeyword}
                          className="px-2 py-0.5 rounded bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/35 text-amber-300 text-[10px] font-bold transition-colors flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>★ تمييز</span>
                        </button>
                      </div>
                      <textarea
                        id="image-caption-textarea"
                        data-testid="image-caption-textarea"
                        dir={isLtr ? 'ltr' : 'rtl'}
                        rows={2}
                        value={customization.imageCaption ?? DEFAULT_IMAGE_CAPTION}
                        onChange={(e) =>
                          setCustomization((c) => ({
                            ...c,
                            imageCaption: e.target.value,
                          }))
                        }
                        placeholder="اكتب تعليقاً يظهر على الحافة السفلية للصورة أو اتركه فارغاً لعرض الصورة فقط..."
                        className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 leading-relaxed resize-y ${
                          isLtr ? 'text-left' : 'text-right'
                        }`}
                      />

                      {/* Live Keyword Chips for Caption */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
                        <span className="text-slate-400 font-medium text-[11px]">
                          الكلمات المفتاحية:
                        </span>
                        {parsedKeywords.keywordGroups.length > 0 ? (
                          parsedKeywords.keywordGroups.map((kw, idx) => (
                            <span
                              key={idx}
                              data-testid="image-keyword-chip"
                              className="px-2 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/35 text-amber-200 text-[11px] font-bold"
                            >
                              [{kw}]
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            لا توجد (ضع *الكلمة* بين نجمتين لتمييزها)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Optional Small Source Line ("المصدر: ...") */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="image-source-input"
                        className="block text-xs font-semibold text-slate-300"
                      >
                        سطر المصدر الصغير (اختياري)
                      </label>
                      <input
                        id="image-source-input"
                        data-testid="image-source-input"
                        type="text"
                        dir={isLtr ? 'ltr' : 'rtl'}
                        value={customization.imageSourceLine ?? DEFAULT_IMAGE_SOURCE_LINE}
                        onChange={(e) =>
                          setCustomization((c) => ({
                            ...c,
                            imageSourceLine: e.target.value,
                          }))
                        }
                        placeholder="المصدر: التقرير السنوي ٢٠٢٥ (اتركه فارغاً لإخفائه)"
                        className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 ${
                          isLtr ? 'text-left' : 'text-right'
                        }`}
                      />
                    </div>
                  </div>
                ) : studioMode === 'points' ? (
                  <div className="space-y-4" data-testid="points-items-section">
                    {/* Optional Single-Line Title */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="points-title-input"
                          className="text-xs font-semibold text-slate-300"
                        >
                          عنوان القائمة (اختياري — سطر واحد)
                        </label>
                        <button
                          type="button"
                          title="تمييز كلمة في العنوان بنجمتين *كلمة*"
                          onClick={handleWrapPointsTitleKeyword}
                          className="px-2 py-0.5 rounded bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/35 text-amber-300 text-[10px] font-bold transition-colors"
                        >
                          ★ تمييز بالعنوان
                        </button>
                      </div>
                      <input
                        id="points-title-input"
                        data-testid="points-title-input"
                        type="text"
                        dir="rtl"
                        value={customization.pointsTitle ?? DEFAULT_POINTS_TITLE}
                        onChange={(e) => handleUpdatePointsTitle(e.target.value)}
                        placeholder="مثال: ٣ أسرار للنجاح (اتركه فارغاً لإخفاء العنوان)"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 text-right"
                      />
                    </div>

                    {/* Points Items List Header + Total Word Count */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">
                        عناصر القائمة ({(customization.pointsItems || DEFAULT_POINTS_ITEMS).length}/{MAX_POINTS_ITEMS})
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono-tabular">
                        إجمالي الكلمات: {pointsStats.totalWords}
                      </span>
                    </div>

                    {/* Item Rows (2-12 items) */}
                    <div className="space-y-2.5">
                      {(customization.pointsItems || DEFAULT_POINTS_ITEMS).map((item, idx, arr) => {
                        const itemWords = countWords(item.text);
                        return (
                          <div
                            key={item.id}
                            data-testid={`points-item-row-${idx}`}
                            className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/90 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[11px] font-bold font-mono-tabular">
                                  #{idx + 1}
                                </span>
                                <span
                                  className={`text-[10px] font-mono-tabular ${
                                    itemWords > 14 ? 'text-amber-300 font-bold' : 'text-slate-400'
                                  }`}
                                >
                                  {itemWords} كلمة
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  title="تمييز النص المحدد بنجمتين *كلمة*"
                                  onClick={() => handleWrapPointItemKeyword(item.id)}
                                  className="px-2 py-1 rounded bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/35 text-amber-300 text-[10px] font-bold transition-colors"
                                >
                                  ★ تمييز
                                </button>
                                <button
                                  type="button"
                                  title="تحريك لأعلى"
                                  disabled={idx === 0}
                                  onClick={() => handleMovePointItem(idx, -1)}
                                  className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="تحريك لأسفل"
                                  disabled={idx === arr.length - 1}
                                  onClick={() => handleMovePointItem(idx, 1)}
                                  className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="حذف النقطة (الحد الأدنى نقطتان)"
                                  disabled={arr.length <= 2}
                                  data-testid={`points-delete-${idx}`}
                                  onClick={() => handleDeletePointItem(item.id)}
                                  className="p-1 rounded bg-slate-900 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <textarea
                              id={`points-item-textarea-${item.id}`}
                              data-testid={`points-textarea-${idx}`}
                              dir="rtl"
                              rows={2}
                              value={item.text}
                              onChange={(e) => handleUpdatePointItem(item.id, e.target.value)}
                              placeholder="اكتب نص النقطة هنا... (يدعم *الكلمات المفتاحية*)"
                              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 leading-relaxed resize-y text-right"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Add Point Button (2-12 items) */}
                    <button
                      type="button"
                      data-testid="btn-add-point-item"
                      disabled={(customization.pointsItems || DEFAULT_POINTS_ITEMS).length >= MAX_POINTS_ITEMS}
                      onClick={handleAddPointItem}
                      className="w-full py-2 px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-300 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة نقطة (من 2 إلى {MAX_POINTS_ITEMS} نقطة)</span>
                    </button>

                    {/* Soft Arabic Warning if an item exceeds ~14 words or total exceeds scaled word limit */}
                    {(pointsStats.hasLongItem || pointsStats.exceedsTotalLimit) && (
                      <div
                        data-testid="points-words-warning"
                        className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-2"
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>
                          {pointsStats.hasLongItem && pointsStats.exceedsTotalLimit
                            ? `تنبيه لطيف: إحدى النقاط تتجاوز 14 كلمة (${pointsStats.maxItemWords} كلمة) وإجمالي الكلمات تجاوز ${pointsStats.totalWordLimit} كلمة (${pointsStats.totalWords} كلمة). سيتم تصغير الخط تلقائياً لاحتوائها، لكن يُنصح بالاختصار.`
                            : pointsStats.hasLongItem
                              ? `تنبيه لطيف: إحدى النقاط تتجاوز 14 كلمة (${pointsStats.maxItemWords} كلمة). يُفضّل اختصار النقطة الواحدة لسرعة القراءة.`
                              : `تنبيه لطيف: إجمالي الكلمات تجاوز ${pointsStats.totalWordLimit} كلمة (${pointsStats.totalWords} كلمة). سيتم ملاءمة الحجم تلقائياً داخل الإطار.`}
                        </span>
                      </div>
                    )}

                    {/* Quick-Paste Box for Points */}
                    <div className="pt-2 border-t border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="points-quick-paste"
                          className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                        >
                          <ClipboardPaste className="w-3.5 h-3.5 text-sky-400" />
                          <span>لصق سريع للنقاط (نقطة في كل سطر)</span>
                        </label>
                        <span className="text-[10px] text-slate-400">
                          يُحذف تلقائياً - و • و 1. و ١.
                        </span>
                      </div>
                      <textarea
                        id="points-quick-paste"
                        data-testid="points-quick-paste-textarea"
                        dir="rtl"
                        rows={3}
                        value={pointsQuickPasteInput}
                        onChange={(e) => setPointsQuickPasteInput(e.target.value)}
                        placeholder={
                          '١. وضوح الهدف قبل البدء\n٢. القوة الحقيقية تكمن في *الاستمرارية*\n٣. التعلم السريع من الأخطاء'
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 leading-relaxed resize-y text-right"
                      />
                      <button
                        type="button"
                        data-testid="btn-apply-points-quick-paste"
                        disabled={!pointsQuickPasteInput.trim()}
                        onClick={handleApplyPointsQuickPaste}
                        className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        تحويل الأسطر الملصقة إلى قائمة نقاط
                      </button>
                    </div>
                  </div>
                ) : studioMode === 'chat' ? (
                  <div className="space-y-4" data-testid="chat-messages-section">
                    {/* Message List Header + Total Word Count */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                        <span>
                          قائمة الرسائل ({(customization.chatMessages || DEFAULT_CHAT_MESSAGES).length}/8)
                        </span>
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono-tabular">
                        إجمالي الكلمات: {wordCount}
                      </span>
                    </div>

                    {/* Message Rows */}
                    <div className="space-y-2.5">
                      {(customization.chatMessages || DEFAULT_CHAT_MESSAGES).map((msg, idx, arr) => (
                        <div
                          key={msg.id}
                          data-testid={`chat-msg-row-${idx}`}
                          className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800/90 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            {/* Role Toggle: سؤال / رد */}
                            <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
                              <button
                                type="button"
                                data-testid={`chat-role-user-${idx}`}
                                onClick={() => handleUpdateChatMessage(msg.id, { role: 'user' })}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                                  msg.role === 'user'
                                    ? 'bg-sky-500/25 text-sky-300 border border-sky-500/40'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                سؤال
                              </button>
                              <button
                                type="button"
                                data-testid={`chat-role-ai-${idx}`}
                                onClick={() => handleUpdateChatMessage(msg.id, { role: 'ai' })}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                                  msg.role === 'ai'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                رد
                              </button>
                            </div>

                            {/* Row Actions: *keyword*, Move Up/Down, Delete */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                title="تمييز النص المحدد بنجمتين *كلمة*"
                                onClick={() => handleWrapChatMessageKeyword(msg.id)}
                                className="px-2 py-1 rounded bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/35 text-amber-300 text-[10px] font-bold transition-colors"
                              >
                                ★ تمييز
                              </button>
                              <button
                                type="button"
                                title="تحريك لأعلى"
                                disabled={idx === 0}
                                onClick={() => handleMoveChatMessage(idx, -1)}
                                className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="تحريك لأسفل"
                                disabled={idx === arr.length - 1}
                                onClick={() => handleMoveChatMessage(idx, 1)}
                                className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="حذف الرسالة"
                                disabled={arr.length <= 1}
                                data-testid={`chat-delete-${idx}`}
                                onClick={() => handleDeleteChatMessage(msg.id)}
                                className="p-1 rounded bg-slate-900 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <textarea
                            id={`chat-msg-textarea-${msg.id}`}
                            data-testid={`chat-textarea-${idx}`}
                            dir="rtl"
                            rows={2}
                            value={msg.text}
                            onChange={(e) =>
                              handleUpdateChatMessage(msg.id, { text: e.target.value })
                            }
                            placeholder={
                              msg.role === 'user'
                                ? 'اكتب سؤال المستخدم هنا... (يدعم *الكلمات المفتاحية*)'
                                : 'اكتب رد الذكاء الاصطناعي هنا... (يدعم *الكلمات المفتاحية*)'
                            }
                            className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 leading-relaxed resize-y text-right"
                          />
                        </div>
                      ))}
                    </div>

                    {/* Add Message Button (max 8) */}
                    <button
                      type="button"
                      data-testid="btn-add-chat-message"
                      disabled={(customization.chatMessages || DEFAULT_CHAT_MESSAGES).length >= 8}
                      onClick={handleAddChatMessage}
                      className="w-full py-2 px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-300 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        إضافة رسالة (الحد الأقصى 8 رسائل)
                      </span>
                    </button>

                    {/* Soft Arabic Warning above ~120 total words */}
                    {wordCount > 120 && (
                      <div
                        data-testid="chat-words-warning"
                        className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-2"
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>
                          تنبيه لطيف: إجمالي كلمات المحادثة تجاوز 120 كلمة ({wordCount} كلمة). المحادثات الطويلة ستستخدم التمرير التلقائي السلس (Auto-scroll)، لكن يُفضل الاختصار لسرعة القراءة.
                        </span>
                      </div>
                    )}

                    {/* Quick-Paste Box: س: / ج: */}
                    <div className="pt-2 border-t border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="chat-quick-paste"
                          className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                        >
                          <ClipboardPaste className="w-3.5 h-3.5 text-sky-400" />
                          <span>لصق سريع للحوار (س: / ج:)</span>
                        </label>
                        <span className="text-[10px] text-slate-400">
                          الأسطر الفارغة يتم تجاهلها
                        </span>
                      </div>
                      <textarea
                        id="chat-quick-paste"
                        data-testid="chat-quick-paste-textarea"
                        dir="rtl"
                        rows={3}
                        value={quickPasteInput}
                        onChange={(e) => setQuickPasteInput(e.target.value)}
                        placeholder={
                          'س: كيف أبدأ في تعلم البرمجة؟\nج: ابدأ بتعلم أساسيات *الخوارزميات* وبناء مشاريع صغيرة.'
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 leading-relaxed resize-y text-right"
                      />
                      <button
                        type="button"
                        data-testid="btn-apply-quick-paste"
                        disabled={!quickPasteInput.trim()}
                        onClick={handleApplyQuickPaste}
                        className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        تحويل النص الملصق إلى رسائل (س: سؤال · ج: رد)
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Photo Upload + Crop (Quote mode ONLY) */}
                    {studioMode === 'quote' && (
                      <PhotoCropControl
                        photoSource={photoSource}
                        photoId={photoId}
                        crop={crop}
                        onPhotoChange={(img, id) => {
                          setPhotoSource(img);
                          setPhotoId(id);
                        }}
                        onCropChange={setCrop}
                      />
                    )}

                    {/* Textarea + Quick Test Samples + Keyword Marker Toolbar */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <label htmlFor="quote-textarea" className="text-xs font-semibold text-slate-300">
                          {studioMode === 'phrase'
                            ? `الجملة المحورية (${wordCount} كلمة — الموصى به 3–25)`
                            : `نص الاقتباس (${wordCount} كلمة)`}
                        </label>
                        <button
                          type="button"
                          data-testid="btn-mark-keyword"
                          onClick={handleWrapSelectionInAsterisks}
                          className="px-2.5 py-1 rounded-md bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/35 text-amber-300 text-[11px] font-bold transition-colors flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>★ تمييز النص المحدد</span>
                        </button>
                      </div>

                      {/* Direction Switcher (Auto / RTL / LTR) */}
                      <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 bg-slate-950/70 border border-slate-800/80 rounded-lg">
                        <div className="flex items-center gap-1.5 text-xs text-slate-300">
                          <span className="text-[11px] font-semibold text-slate-400">الاتجاه:</span>
                          <span className="text-[10px] font-mono text-sky-300 bg-sky-500/10 border border-sky-500/25 px-1.5 py-0.5 rounded">
                            {isLtr ? 'LTR (English)' : 'RTL (العربية)'}
                            {(!customization.textDirection || customization.textDirection === 'auto') ? ' · كشف تلقائي' : ' · يدوي'}
                          </span>
                        </div>
                        <div className="inline-flex rounded-md bg-slate-900 p-0.5 border border-slate-800 text-xs">
                          <button
                            type="button"
                            data-testid="btn-direction-auto"
                            onClick={() => setCustomization((c) => ({ ...c, textDirection: 'auto' }))}
                            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                              !customization.textDirection || customization.textDirection === 'auto'
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            تلقائي (Auto)
                          </button>
                          <button
                            type="button"
                            data-testid="btn-direction-rtl"
                            onClick={() => setCustomization((c) => ({ ...c, textDirection: 'rtl' }))}
                            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                              customization.textDirection === 'rtl'
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            عربي (RTL)
                          </button>
                          <button
                            type="button"
                            data-testid="btn-direction-ltr"
                            onClick={() => setCustomization((c) => ({ ...c, textDirection: 'ltr' }))}
                            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                              customization.textDirection === 'ltr'
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            English (LTR)
                          </button>
                        </div>
                      </div>

                      {/* Quick Test Samples */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                        <span>أمثلة سريعة:</span>
                        {studioMode === 'phrase'
                          ? SAMPLE_PHRASES.map((sample, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setPhraseInput(sample.text);
                                  setDebouncedPhrase(sample.text);
                                }}
                                className="text-sky-400 hover:text-sky-300 hover:underline whitespace-nowrap"
                              >
                                {sample.label}
                              </button>
                            ))
                          : SAMPLE_QUOTES.map((sample, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setQuoteInput(sample.quoteText);
                                  setDebouncedQuote(sample.quoteText);
                                  setAuthorName(sample.authorName);
                                  setSubtitle(sample.subtitle);
                                }}
                                className="text-sky-400 hover:text-sky-300 hover:underline whitespace-nowrap"
                              >
                                {sample.label}
                              </button>
                            ))}
                      </div>

                      <textarea
                        ref={textareaRef}
                        id="quote-textarea"
                        dir={isLtr ? 'ltr' : 'rtl'}
                        rows={3}
                        value={activeRawText}
                        onChange={(e) =>
                          studioMode === 'phrase'
                            ? setPhraseInput(e.target.value)
                            : setQuoteInput(e.target.value)
                        }
                        placeholder={
                          studioMode === 'phrase'
                            ? isLtr
                              ? 'Write key phrase here... wrap *keywords* to highlight them visually'
                              : 'اكتب الجملة المحورية هنا... ضع *حول الكلمة المفتاحية* لإبرازها بصرياً'
                            : isLtr
                              ? 'Write quote here (supports *keywords* to emphasize)...'
                              : 'اكتب نص الاقتباس هنا (يدعم التشكيل الكامل ووضع *حول الكلمات المفتاحية*)...'
                        }
                        className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 leading-relaxed resize-y ${
                          isLtr ? 'text-left font-sans' : 'text-right'
                        }`}
                      />

                      {/* Live Keyword Chips */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
                        <span className="text-slate-400 font-medium text-[11px]">
                          الكلمات المفتاحية:
                        </span>
                        {parsedKeywords.keywordGroups.length > 0 ? (
                          parsedKeywords.keywordGroups.map((kw, idx) => (
                            <span
                              key={idx}
                              data-testid="keyword-chip"
                              className="px-2 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/35 text-amber-200 text-[11px] font-bold"
                            >
                              [{kw}]
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            لا توجد (ضع *الكلمة* بين نجمتين لتمييزها)
                          </span>
                        )}
                      </div>

                      {/* Unmatched asterisk warning */}
                      {parsedKeywords.unmatchedAsteriskWarning && (
                        <div
                          data-testid="unmatched-asterisk-warning"
                          className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                          <span>تنبيه: توجد علامة نجمة (*) غير مغلقة تم تجاهلها تلقائياً.</span>
                        </div>
                      )}

                      {/* Soft Arabic warning above ~25 words in Key Phrase mode */}
                      {studioMode === 'phrase' && wordCount > 25 && (
                        <div
                          data-testid="phrase-length-warning"
                          className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                          <span>
                            تنبيه لطيف: الجملة تتجاوز 25 كلمة ({wordCount} كلمة). يُنصح بـ 3–25 كلمة لأفضل تأثير بصري، ومع ذلك سيتم ملاءمتها تلقائياً داخل الإطار.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Author Name, Subtitle & Quotation Marks (Quote mode ONLY) */}
                    {studioMode === 'quote' && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label
                              htmlFor="author-input"
                              className="block text-xs font-semibold text-slate-300"
                            >
                              اسم القائل / المؤلف
                            </label>
                            <input
                              id="author-input"
                              type="text"
                              dir={isLtr ? 'ltr' : 'rtl'}
                              value={authorName}
                              onChange={(e) => setAuthorName(e.target.value)}
                              placeholder={isLtr ? 'e.g. Steve Jobs' : 'مثال: ابن خلدون'}
                              className={`w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 ${
                                isLtr ? 'text-left' : 'text-right'
                              }`}
                            />
                          </div>
                          <div className="space-y-1">
                            <label
                              htmlFor="subtitle-input"
                              className="block text-xs font-semibold text-slate-300"
                            >
                              سطر فرعي (اختياري)
                            </label>
                            <input
                              id="subtitle-input"
                              type="text"
                              dir={isLtr ? 'ltr' : 'rtl'}
                              value={subtitle}
                              onChange={(e) => setSubtitle(e.target.value)}
                              placeholder={isLtr ? 'e.g. Co-founder of Apple Inc. — 2005' : 'فيلسوف يوناني - 384 ق.م'}
                              className={`w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 ${
                                isLtr ? 'text-left' : 'text-right'
                              }`}
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="block text-xs font-semibold text-slate-300">
                            علامات التنصيص
                          </span>
                          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 border border-slate-800/80 rounded-lg">
                            {(
                              [
                                { id: 'guillemets', label: 'أهلة عربية « »' },
                                { id: 'double', label: 'مزدوجة " "' },
                                { id: 'none', label: 'بدون علامات' },
                              ] as { id: QuotationMarkStyle; label: string }[]
                            ).map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setQuotationMarks(opt.id)}
                                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                                  quotationMarks === opt.id
                                    ? 'bg-slate-800 text-sky-400 font-bold'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          {/* SECTION 2: الستايل وأبعاد الفيديو */}
          <section id="section-style" className="p-4">
            <button
              type="button"
              onClick={() => toggleSection('style')}
              aria-expanded={openSections.style}
              className="w-full flex items-center justify-between text-right py-1"
            >
              <span className="text-sm font-bold text-white">2. الستايل وأبعاد الفيديو</span>
              {openSections.style ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {openSections.style && (
              <div className="mt-4 space-y-4">
                {/* Format Toggle: 16:9 vs 9:16 */}
                <div className="space-y-1.5">
                  <span className="block text-xs font-semibold text-slate-300">
                    أبعاد الفيديو (Format)
                  </span>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => handleFormatChange('16:9')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        customization.format === '16:9'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      16:9 يوتيوب عرضي (1920×1080)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFormatChange('9:16')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        customization.format === '9:16'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      9:16 شورتس / ريلز (1080×1920)
                    </button>
                  </div>
                </div>

                {/* Visual Style Cards with Live Thumbnails */}
                <div className="grid grid-cols-2 gap-2.5">
                  {(studioMode === 'video'
                    ? VIDEO_STYLES_LIST
                    : studioMode === 'image'
                      ? IMAGE_STYLES_LIST
                      : studioMode === 'points'
                        ? POINTS_STYLES_LIST
                        : studioMode === 'chat'
                          ? CHAT_STYLES_LIST
                          : studioMode === 'phrase'
                            ? PHRASE_STYLES_LIST
                            : QUOTE_STYLES_LIST
                  ).map((st) => (
                    <StyleThumbnailCard
                      key={st.id}
                      styleMeta={st}
                      isSelected={activeStyleId === st.id}
                      content={contentObj}
                      timeline={activeTimeline}
                      custom={customization}
                      fontsReadyTick={fontsReadyTick}
                      onSelect={() => handleStyleSelect(st.id)}
                    />
                  ))}
                </div>

                {/* Video Insert ("فيديو") Layout & Style-Specific Controls */}
                {studioMode === 'video' && (
                  <div className="pt-2 border-t border-slate-800/80">
                    <VideoLayoutAndStyleControls
                      activeStyleId={activeStyleId as VideoStyleId}
                      customization={customization}
                      setCustomization={setCustomization}
                      videoCrop={videoCrop}
                      setVideoCrop={setVideoCrop}
                      onSelectQuickPosition={handleSelectVideoQuickPosition}
                    />
                  </div>
                )}

                {/* Image Insert ("صورة") Style-Specific Controls */}
                {studioMode === 'image' && (
                  <div
                    className="space-y-3 pt-2 border-t border-slate-800/80"
                    data-testid="image-style-controls"
                  >
                    {/* Style 3 (img_newspaper): Keep original color toggle */}
                    {activeStyleId === 'img_newspaper' && (
                      <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 cursor-pointer">
                        <div>
                          <span className="block text-xs font-semibold text-slate-200">
                            الحفاظ على ألوان الصورة الأصلية
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            إيقاف التحويل إلى أبيض وأسود مع الإبقاء على نقاط الطباعة الخفيفة (Halftone)
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          data-testid="newspaper-keep-color-checkbox"
                          checked={Boolean(customization.newspaperKeepColor)}
                          onChange={(e) =>
                            setCustomization((c) => ({
                              ...c,
                              newspaperKeepColor: e.target.checked,
                            }))
                          }
                          className="rounded accent-sky-400 w-4 h-4 shrink-0"
                        />
                      </label>
                    )}

                    {/* Style 4 (img_cinematic): Teal & Orange Grade toggle */}
                    {activeStyleId === 'img_cinematic' && (
                      <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 cursor-pointer">
                        <div>
                          <span className="block text-xs font-semibold text-slate-200">
                            تدريج لوني سينمائي (Teal & Orange Grade)
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            معالجة لونية دافئة للسطوع وباردة للظلال داخل الكادر
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          data-testid="cinematic-grade-checkbox"
                          checked={customization.cinematicGrade !== false}
                          onChange={(e) =>
                            setCustomization((c) => ({
                              ...c,
                              cinematicGrade: e.target.checked,
                            }))
                          }
                          className="rounded accent-sky-400 w-4 h-4 shrink-0"
                        />
                      </label>
                    )}

                    {/* Style 6 (img_spotlight): Annotation Shape Choice (circle / rectangle / arrow) */}
                    {activeStyleId === 'img_spotlight' && (
                      <div className="space-y-1.5">
                        <span className="block text-xs font-semibold text-slate-300">
                          شكل علامة التحديد المرسومة (Annotation Shape)
                        </span>
                        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                          {(
                            [
                              { id: 'circle' as SpotlightShape, labelAr: 'دائرة مرسومة' },
                              { id: 'rectangle' as SpotlightShape, labelAr: 'مستطيل مضيء' },
                              { id: 'arrow' as SpotlightShape, labelAr: 'سهم إشارة' },
                            ]
                          ).map((shOpt) => {
                            const isSel =
                              (customization.spotlightShape || 'circle') === shOpt.id;
                            return (
                              <button
                                key={shOpt.id}
                                type="button"
                                data-testid={`spotlight-shape-${shOpt.id}`}
                                onClick={() =>
                                  setCustomization((c) => ({
                                    ...c,
                                    spotlightShape: shOpt.id,
                                  }))
                                }
                                className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors ${
                                  isSel
                                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                                }`}
                              >
                                {shOpt.labelAr}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Multi Points ("نقاط") Mode Controls: Marker Type, Highlight Current, Pixel Density for pts_terminal */}
                {studioMode === 'points' && (
                  <div
                    className="space-y-3 pt-2 border-t border-slate-800/80"
                    data-testid="points-style-controls"
                  >
                    {/* Marker Type Selector */}
                    <div className="space-y-1.5">
                      <span className="block text-xs font-semibold text-slate-300">
                        نوع الترقيم / العلامة (Marker Type)
                      </span>
                      <div className="grid grid-cols-5 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                        {POINTS_MARKER_OPTIONS.map((mOpt) => {
                          const supportedMarkers = activeStyleMeta.supportedMarkerTypes || [
                            'arabic-indic',
                            'western',
                            'bullets',
                            'checks',
                            'none',
                          ];
                          const isSupported = supportedMarkers.includes(mOpt.id);
                          const isSelected =
                            (customization.pointsMarkerType ||
                              activeStyleMeta.defaultMarkerType ||
                              'arabic-indic') === mOpt.id;
                          return (
                            <button
                              key={mOpt.id}
                              type="button"
                              disabled={!isSupported}
                              data-testid={`points-marker-${mOpt.id}`}
                              onClick={() =>
                                setCustomization((c) => ({
                                  ...c,
                                  pointsMarkerType: mOpt.id,
                                }))
                              }
                              className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                                !isSupported
                                  ? 'opacity-30 cursor-not-allowed text-slate-600'
                                  : isSelected
                                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                                    : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {mOpt.labelAr}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Highlight Current Item Toggle ("تمييز النقطة الحالية") */}
                    {activeStyleId !== 'pts_ranking' && (
                      <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 cursor-pointer">
                        <span className="text-xs text-slate-300">
                          تمييز النقطة الحالية (تخفيت النقاط السابقة إلى ~45%)
                        </span>
                        <input
                          type="checkbox"
                          data-testid="points-highlight-current-checkbox"
                          checked={customization.pointsHighlightCurrent ?? true}
                          onChange={(e) =>
                            setCustomization((c) => ({
                              ...c,
                              pointsHighlightCurrent: e.target.checked,
                            }))
                          }
                          className="rounded accent-sky-400 w-4 h-4"
                        />
                      </label>
                    )}

                    {/* Timeline Path Shape & Calm White Theme Selector for pts_timeline */}
                    {activeStyleId === 'pts_timeline' && (
                      <div className="space-y-2.5" data-testid="points-timeline-shape-controls">
                        <div className="space-y-1.5" data-testid="points-timeline-theme-controls">
                          <div className="flex items-center justify-between">
                            <span className="block text-xs font-bold text-sky-300">
                              ثيم الخط الزمني (داكن / أبيض هادئ)
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {resolveTimelineTheme(customization) === 'light'
                                ? 'أبيض ثلجي متدرج + هالة باستيل ونص داكن'
                                : 'داكن سينمائي فاخر'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                            {(
                              [
                                { id: 'dark', label: 'داكن سينمائي (ليلي)' },
                                { id: 'light', label: 'أبيض هادئ متدرج' },
                              ] as { id: CalmStyleTheme; label: string }[]
                            ).map((th) => {
                              const isSel = resolveTimelineTheme(customization) === th.id;
                              return (
                                <button
                                  key={th.id}
                                  type="button"
                                  data-testid={`timeline-theme-btn-${th.id}`}
                                  onClick={() => handleSelectTimelineTheme(th.id)}
                                  className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                                    isSel
                                      ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                                  }`}
                                >
                                  {th.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="block text-xs font-semibold text-slate-300">
                            شكل مسار الخط الزمني (Timeline Shape)
                          </span>
                          <span className="text-[10px] text-sky-400">
                            5 أشكال تفاعلية
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                          {TIMELINE_PATH_SHAPE_OPTIONS.map((shOpt) => {
                            const isSel =
                              (customization.timelineShape || 'straight') === shOpt.id;
                            return (
                              <button
                                key={shOpt.id}
                                type="button"
                                data-testid={`timeline-shape-btn-${shOpt.id}`}
                                onClick={() =>
                                  setCustomization((c) => ({
                                    ...c,
                                    timelineShape: shOpt.id,
                                  }))
                                }
                                className={`py-1.5 px-1 text-center rounded-lg transition-colors whitespace-nowrap ${
                                  isSel
                                    ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                                }`}
                              >
                                <span className="block text-[11px]">{shOpt.labelAr}</span>
                                <span className="block text-[9px] opacity-70 truncate">
                                  {shOpt.subAr}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Timeline Orientation Selector: Auto / Horizontal / Vertical */}
                        <div className="space-y-1.5 pt-1" data-testid="points-timeline-orientation-controls">
                          <div className="flex items-center justify-between">
                            <span className="block text-xs font-semibold text-slate-300">
                              اتجاه المسار (Orientation)
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {customization.timelineShape === 'circle'
                                ? 'يغير زاوية البداية واتجاه الدوران'
                                : 'تطبيق المسار أفقياً أو رأسياً'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                            {TIMELINE_ORIENTATION_OPTIONS.map((orOpt) => {
                              const isSel =
                                (customization.timelineOrientation || 'auto') === orOpt.id;
                              return (
                                <button
                                  key={orOpt.id}
                                  type="button"
                                  data-testid={`timeline-orientation-btn-${orOpt.id}`}
                                  onClick={() =>
                                    setCustomization((c) => ({
                                      ...c,
                                      timelineOrientation: orOpt.id,
                                    }))
                                  }
                                  className={`py-1.5 px-1.5 text-center rounded-lg transition-colors whitespace-nowrap ${
                                    isSel
                                      ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                                  }`}
                                >
                                  <span className="block text-[11px]">{orOpt.labelAr}</span>
                                  <span className="block text-[9px] opacity-70 truncate">
                                    {orOpt.subAr}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Vertical Side Distribution (when effective orientation is vertical and shape !== 'circle') */}
                        {(customization.timelineShape || 'straight') !== 'circle' &&
                          ((customization.timelineOrientation || 'auto') === 'vertical' ||
                            ((customization.timelineOrientation || 'auto') === 'auto' &&
                              (customization.format === '9:16' ||
                                customization.position === 'left' ||
                                customization.position === 'right'))) && (
                            <div
                              className="space-y-1.5 pt-1"
                              data-testid="points-timeline-vertical-side-controls"
                            >
                              <div className="flex items-center justify-between">
                                <span className="block text-xs font-semibold text-slate-300">
                                  توزيع النقاط على المسار الرأسي
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  تناوب أو جهة واحدة
                                </span>
                              </div>
                              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                                {TIMELINE_VERTICAL_SIDE_OPTIONS.map((vsOpt) => {
                                  const isSel =
                                    (customization.timelineVerticalSide || 'auto') ===
                                    vsOpt.id;
                                  return (
                                    <button
                                      key={vsOpt.id}
                                      type="button"
                                      data-testid={`timeline-vside-btn-${vsOpt.id}`}
                                      onClick={() =>
                                        setCustomization((c) => ({
                                          ...c,
                                          timelineVerticalSide: vsOpt.id,
                                        }))
                                      }
                                      className={`py-1.5 px-1 text-center rounded-lg transition-colors whitespace-nowrap ${
                                        isSel
                                          ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                                          : 'text-slate-400 hover:text-white hover:bg-slate-900'
                                      }`}
                                    >
                                      <span className="block text-[10px]">
                                        {vsOpt.labelAr}
                                      </span>
                                      <span className="block text-[8px] opacity-70 truncate">
                                        {vsOpt.subAr}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                        {/* Global & Per-Point Size and Placement Controls for pts_timeline */}
                        <div
                          className="space-y-3 pt-2 mt-2 border-t border-slate-800/90"
                          data-testid="points-timeline-size-position-controls"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-sky-300">
                              التحكم في حجم ومكان النقاط والنصوص
                            </span>
                            <button
                              type="button"
                              data-testid="btn-reset-timeline-adjustments"
                              onClick={handleResetTimelineAdjustments}
                              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-300 hover:text-white transition-colors"
                            >
                              إعادة ضبط الكل
                            </button>
                          </div>

                          {/* Global Sliders Grid */}
                          <div className="grid grid-cols-2 gap-2.5 bg-slate-950/90 border border-slate-800/90 rounded-xl p-2.5">
                            {/* 1. Node Size */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-300 font-medium">حجم العُقد</span>
                                <span className="font-mono-tabular text-sky-400">
                                  {(customization.timelineNodeScale ?? 1.0).toFixed(2)}x
                                </span>
                              </div>
                              <input
                                type="range"
                                data-testid="slider-timeline-node-scale"
                                min={0.6}
                                max={1.6}
                                step={0.05}
                                value={customization.timelineNodeScale ?? 1.0}
                                onChange={(e) =>
                                  setCustomization((c) => ({
                                    ...c,
                                    timelineNodeScale: parseFloat(e.target.value),
                                  }))
                                }
                                className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                              />
                            </div>

                            {/* 2. Stem / Text Distance */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-300 font-medium">بُعد النص</span>
                                <span className="font-mono-tabular text-sky-400">
                                  {(customization.timelineStemScale ?? 1.0).toFixed(2)}x
                                </span>
                              </div>
                              <input
                                type="range"
                                data-testid="slider-timeline-stem-scale"
                                min={0.5}
                                max={1.8}
                                step={0.05}
                                value={customization.timelineStemScale ?? 1.0}
                                onChange={(e) =>
                                  setCustomization((c) => ({
                                    ...c,
                                    timelineStemScale: parseFloat(e.target.value),
                                  }))
                                }
                                className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                              />
                            </div>

                            {/* 3. Path Spread */}
                            <div className="space-y-1 col-span-2">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-300 font-medium">
                                  تمدد واتساع المسار (Path Spread)
                                </span>
                                <span className="font-mono-tabular text-sky-400">
                                  {Math.round((customization.timelineSpread ?? 1.0) * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                data-testid="slider-timeline-spread"
                                min={0.6}
                                max={1.35}
                                step={0.05}
                                value={customization.timelineSpread ?? 1.0}
                                onChange={(e) =>
                                  setCustomization((c) => ({
                                    ...c,
                                    timelineSpread: parseFloat(e.target.value),
                                  }))
                                }
                                className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                              />
                            </div>

                            {/* 4. Global Offset X */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-300 font-medium">إزاحة عامة X</span>
                                <span className="font-mono-tabular text-sky-400">
                                  {Math.round((customization.timelineOffsetX ?? 0) * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                data-testid="slider-timeline-offset-x"
                                min={-0.3}
                                max={0.3}
                                step={0.02}
                                value={customization.timelineOffsetX ?? 0}
                                onChange={(e) =>
                                  setCustomization((c) => ({
                                    ...c,
                                    timelineOffsetX: parseFloat(e.target.value),
                                  }))
                                }
                                className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                              />
                            </div>

                            {/* 5. Global Offset Y */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-300 font-medium">إزاحة عامة Y</span>
                                <span className="font-mono-tabular text-sky-400">
                                  {Math.round((customization.timelineOffsetY ?? 0) * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                data-testid="slider-timeline-offset-y"
                                min={-0.3}
                                max={0.3}
                                step={0.02}
                                value={customization.timelineOffsetY ?? 0}
                                onChange={(e) =>
                                  setCustomization((c) => ({
                                    ...c,
                                    timelineOffsetY: parseFloat(e.target.value),
                                  }))
                                }
                                className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                              />
                            </div>
                          </div>

                          {/* Per-Point Individual Controls & Direct Drag Toggle */}
                          {(() => {
                            const ptsList = customization.pointsItems || DEFAULT_POINTS_ITEMS;
                            const safeIdx = clamp(
                              selectedTimelinePointIdx,
                              0,
                              Math.max(0, ptsList.length - 1)
                            );
                            const currentItem = ptsList[safeIdx];
                            if (!currentItem) return null;

                            const updateCurrentItem = (patch: Partial<PointsItem>) => {
                              setCustomization((c) => ({
                                ...c,
                                pointsItems: (c.pointsItems || DEFAULT_POINTS_ITEMS).map(
                                  (it, idx) => (idx === safeIdx ? { ...it, ...patch } : it)
                                ),
                              }));
                            };

                            return (
                              <div
                                className="bg-slate-950/90 border border-slate-800/90 rounded-xl p-2.5 space-y-2.5"
                                data-testid="points-timeline-per-point-controls"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-semibold text-slate-200">
                                    تحريك وتكبير كل نقطة بشكل فردي
                                  </span>
                                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-sky-300">
                                    <input
                                      type="checkbox"
                                      data-testid="checkbox-timeline-canvas-drag"
                                      checked={isTimelineDragEnabled}
                                      onChange={(e) =>
                                        setIsTimelineDragEnabled(e.target.checked)
                                      }
                                      className="rounded accent-sky-400 w-3.5 h-3.5"
                                    />
                                    <span>سحب مباشر بالماوس على المعاينة</span>
                                  </label>
                                </div>

                                {/* Point Selector Pills */}
                                <div className="flex flex-wrap gap-1">
                                  {ptsList.map((pt, idx) => {
                                    const isSel = idx === safeIdx;
                                    const hasCustom =
                                      Boolean(pt.nodeOffsetX) ||
                                      Boolean(pt.nodeOffsetY) ||
                                      Boolean(pt.textOffsetX) ||
                                      Boolean(pt.textOffsetY) ||
                                      (pt.itemScale !== undefined &&
                                        Math.abs(pt.itemScale - 1) > 0.01);
                                    return (
                                      <button
                                        key={pt.id}
                                        type="button"
                                        data-testid={`timeline-select-point-${idx}`}
                                        onClick={() => setSelectedTimelinePointIdx(idx)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                                          isSel
                                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                                            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                                        }`}
                                      >
                                        <span>نقطة {idx + 1}</span>
                                        {hasCustom && (
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Selected Point Sliders */}
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                  <div className="space-y-1 col-span-2">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-slate-300">
                                        حجم النقطة {safeIdx + 1} (عقدة + نص)
                                      </span>
                                      <span className="font-mono-tabular text-sky-400">
                                        {(currentItem.itemScale ?? 1.0).toFixed(2)}x
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      data-testid="slider-point-item-scale"
                                      min={0.7}
                                      max={1.4}
                                      step={0.05}
                                      value={currentItem.itemScale ?? 1.0}
                                      onChange={(e) =>
                                        updateCurrentItem({
                                          itemScale: parseFloat(e.target.value),
                                        })
                                      }
                                      className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className="text-slate-300">مكان العقدة X</span>
                                      <span className="font-mono-tabular text-sky-400">
                                        {currentItem.nodeOffsetX ?? 0}px
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      data-testid="slider-point-node-offset-x"
                                      min={-350}
                                      max={350}
                                      step={5}
                                      value={currentItem.nodeOffsetX ?? 0}
                                      onChange={(e) =>
                                        updateCurrentItem({
                                          nodeOffsetX: parseInt(e.target.value, 10),
                                        })
                                      }
                                      className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className="text-slate-300">مكان العقدة Y</span>
                                      <span className="font-mono-tabular text-sky-400">
                                        {currentItem.nodeOffsetY ?? 0}px
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      data-testid="slider-point-node-offset-y"
                                      min={-350}
                                      max={350}
                                      step={5}
                                      value={currentItem.nodeOffsetY ?? 0}
                                      onChange={(e) =>
                                        updateCurrentItem({
                                          nodeOffsetY: parseInt(e.target.value, 10),
                                        })
                                      }
                                      className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className="text-slate-300">إزاحة النص X</span>
                                      <span className="font-mono-tabular text-sky-400">
                                        {currentItem.textOffsetX ?? 0}px
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      data-testid="slider-point-text-offset-x"
                                      min={-350}
                                      max={350}
                                      step={5}
                                      value={currentItem.textOffsetX ?? 0}
                                      onChange={(e) =>
                                        updateCurrentItem({
                                          textOffsetX: parseInt(e.target.value, 10),
                                        })
                                      }
                                      className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className="text-slate-300">إزاحة النص Y</span>
                                      <span className="font-mono-tabular text-sky-400">
                                        {currentItem.textOffsetY ?? 0}px
                                      </span>
                                    </div>
                                    <input
                                      type="range"
                                      data-testid="slider-point-text-offset-y"
                                      min={-350}
                                      max={350}
                                      step={5}
                                      value={currentItem.textOffsetY ?? 0}
                                      onChange={(e) =>
                                        updateCurrentItem({
                                          textOffsetY: parseInt(e.target.value, 10),
                                        })
                                      }
                                      className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Pixel Density Selector for pts_terminal */}
                    {activeStyleId === 'pts_terminal' && (
                      <div className="space-y-1">
                        <span className="block text-xs font-semibold text-slate-300">
                          كثافة البكسل (Pixel Density)
                        </span>
                        <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                          {PIXEL_DENSITY_OPTIONS.map((opt) => {
                            const isSel = (customization.pixelDensity ?? 2) === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                data-testid={`points-pixel-density-btn-${opt.id}`}
                                onClick={() =>
                                  setCustomization((c) => ({
                                    ...c,
                                    pixelDensity: opt.id,
                                  }))
                                }
                                className={`py-1.5 px-1.5 text-center rounded-md transition-colors ${
                                  isSel
                                    ? 'bg-slate-800 text-sky-400 font-bold border border-sky-500/30'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                <span className="block text-xs">{opt.labelAr}</span>
                                <span className="block text-[9px] opacity-70">{opt.subAr}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Chat Style 1 ("شات عادي" - chat_modern) Controls */}
                {studioMode === 'chat' && activeStyleId === 'chat_modern' && (
                  <div className="space-y-3 pt-1 border-t border-slate-800/80">
                    {/* Theme Toggle: Dark vs Light */}
                    <div className="space-y-1.5">
                      <span className="block text-xs font-semibold text-slate-300">
                        مظهر نافذة المحادثة (Theme)
                      </span>
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                        {(
                          [
                            { id: 'dark', label: 'داكن (#0F1115)' },
                            { id: 'light', label: 'فاتح (#F4F6FA)' },
                          ] as { id: ChatTheme; label: string }[]
                        ).map((th) => (
                          <button
                            key={th.id}
                            type="button"
                            data-testid={`chat-theme-${th.id}`}
                            onClick={() =>
                              setCustomization((c) => ({ ...c, chatTheme: th.id }))
                            }
                            className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                              (customization.chatTheme || 'dark') === th.id
                                ? 'bg-slate-800 text-sky-400 font-bold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {th.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* AI Reply Style: Plain text with avatar (default) or Bubble */}
                    <div className="space-y-1.5">
                      <span className="block text-xs font-semibold text-slate-300">
                        شكل الرد (AI Reply Style)
                      </span>
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                        {(
                          [
                            { id: 'plain', label: 'نص مع أيقونة (افتراضي)' },
                            { id: 'bubble', label: 'فقاعة محادثة' },
                          ] as { id: ChatAiReplyStyle; label: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            data-testid={`chat-reply-style-${opt.id}`}
                            onClick={() =>
                              setCustomization((c) => ({ ...c, chatAiReplyStyle: opt.id }))
                            }
                            className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                              (customization.chatAiReplyStyle || 'plain') === opt.id
                                ? 'bg-slate-800 text-sky-400 font-bold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Swap Sides Toggle */}
                    <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 cursor-pointer">
                      <span className="text-xs text-slate-300">
                        عكس اتجاه الفقاعات (المستخدم يسار / الذكاء الاصطناعي يمين)
                      </span>
                      <input
                        type="checkbox"
                        data-testid="chat-swap-sides-checkbox"
                        checked={Boolean(customization.chatSwapSides)}
                        onChange={(e) =>
                          setCustomization((c) => ({
                            ...c,
                            chatSwapSides: e.target.checked,
                          }))
                        }
                        className="rounded accent-sky-400 w-4 h-4"
                      />
                    </label>
                  </div>
                )}

                {/* Chat Style 2 ("تيرمينال" - chat_terminal) Pixel Density Selector */}
                {studioMode === 'chat' && activeStyleId === 'chat_terminal' && (
                  <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
                    <div className="space-y-1">
                      <span className="block text-xs font-semibold text-slate-300">
                        كثافة البكسل (Pixel Density)
                      </span>
                      <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                        {PIXEL_DENSITY_OPTIONS.map((opt) => {
                          const isSel = (customization.pixelDensity ?? 2) === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              data-testid={`chat-pixel-density-btn-${opt.id}`}
                              onClick={() =>
                                setCustomization((c) => ({
                                  ...c,
                                  pixelDensity: opt.id,
                                }))
                              }
                              className={`py-1.5 px-1.5 text-center rounded-md transition-colors ${
                                isSel
                                  ? 'bg-slate-800 text-sky-400 font-bold border border-sky-500/30'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              <span className="block text-xs">{opt.labelAr}</span>
                              <span className="block text-[9px] opacity-70">{opt.subAr}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Geometric Shape & Theme Selector for Quote Style 3 (Modern Minimal) */}
                {studioMode === 'quote' && activeStyleId === 'modern-minimal' && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <span className="block text-xs font-semibold text-slate-300">
                        مظهر الستايل العصري (Theme)
                      </span>
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                        {(
                          [
                            { id: 'dark', label: 'داكن سينمائي (Dark)' },
                            { id: 'light', label: 'فاتح تحريري (Light)' },
                          ] as { id: MinimalTheme; label: string }[]
                        ).map((th) => (
                          <button
                            key={th.id}
                            type="button"
                            data-testid={`minimal-theme-${th.id}`}
                            onClick={() =>
                              setCustomization((c) => ({ ...c, minimalTheme: th.id }))
                            }
                            className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                              (customization.minimalTheme || 'dark') === th.id
                                ? 'bg-slate-800 text-sky-400 font-bold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {th.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="block text-xs font-semibold text-slate-300">
                        شكل إطار الصورة (الستايل العصري)
                      </span>
                      <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                        {(
                          [
                            { id: 'arch', label: 'قوس معماري' },
                            { id: 'circle', label: 'دائرة' },
                            { id: 'rounded-square', label: 'مربع مستدير' },
                          ] as { id: GeometricShape; label: string }[]
                        ).map((sh) => (
                          <button
                            key={sh.id}
                            type="button"
                            onClick={() =>
                              setCustomization((c) => ({ ...c, minimalShape: sh.id }))
                            }
                            className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                              customization.minimalShape === sh.id
                                ? 'bg-slate-800 text-sky-400 font-bold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {sh.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Calligraphy Theme Selector for Phrase Style P1 (calligraphy-ink) */}
                {studioMode === 'phrase' && activeStyleId === 'calligraphy-ink' && (
                  <div className="space-y-1.5 pt-1">
                    <span className="block text-xs font-semibold text-slate-300">
                      مظهر ستايل الخط بالفرشاة (ليلي ذهبي / ورق أرز)
                    </span>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                      {(
                        [
                          { id: 'night', label: 'ليلي فاخر بحبر ذهبي' },
                          { id: 'paper', label: 'ورق أرز كلاسيكي' },
                        ] as { id: CalligraphyTheme; label: string }[]
                      ).map((th) => (
                        <button
                          key={th.id}
                          type="button"
                          data-testid={`calligraphy-theme-${th.id}`}
                          onClick={() =>
                            setCustomization((c) => ({ ...c, calligraphyTheme: th.id }))
                          }
                          className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            (customization.calligraphyTheme || 'night') === th.id
                              ? 'bg-slate-800 text-amber-400 font-bold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {th.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Annotation Shape Selector for Phrase Style P6 (Annotate) */}
                {studioMode === 'phrase' && activeStyleId === 'annotate' && (
                  <div className="space-y-1.5 pt-1">
                    <span className="block text-xs font-semibold text-slate-300">
                      نوع علامة الإبراز المرسومة (ستايل تحليل وإبراز)
                    </span>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                      {ANNOTATION_TYPE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setCustomization((c) => ({ ...c, annotationType: opt.id }))
                          }
                          className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            (customization.annotationType || 'auto') === opt.id
                              ? 'bg-slate-800 text-sky-400 font-bold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {opt.labelAr}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Typing Speed & Pixel Terminal Controls (Phrase Styles 4 & 5) */}
                {studioMode === 'phrase' &&
                  (activeStyleId === 'pixel_terminal' || activeStyleId === 'old_typewriter') && (
                    <div className="space-y-3 pt-2 border-t border-slate-800/80">
                      {/* Typing Speed Slider (8-30 chars/sec, default 18) */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <label
                            htmlFor="typing-speed-slider"
                            className="text-slate-300 font-semibold"
                          >
                            سرعة الكتابة (Typing Speed)
                          </label>
                          <div className="flex items-center gap-2">
                            <span
                              data-testid="typing-speed-value"
                              className="font-mono-tabular text-sky-400 font-bold"
                            >
                              {customization.typingSpeed ?? 18} حرف/ثانية
                            </span>
                            {(customization.typingSpeed ?? 18) !== 18 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCustomization((c) => ({ ...c, typingSpeed: 18 }))
                                }
                                className="text-[10px] text-slate-400 hover:text-sky-300"
                              >
                                [افتراضي 18]
                              </button>
                            )}
                          </div>
                        </div>
                        <input
                          id="typing-speed-slider"
                          data-testid="typing-speed-slider"
                          type="range"
                          min={8}
                          max={30}
                          step={1}
                          value={customization.typingSpeed ?? 18}
                          onChange={(e) =>
                            setCustomization((c) => ({
                              ...c,
                              typingSpeed: parseInt(e.target.value, 10),
                            }))
                          }
                          className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span>8 (بطيء متأنٍّ)</span>
                          <span>18 (متوازن)</span>
                          <span>30 (سريع جداً)</span>
                        </div>
                      </div>

                      {/* Pixel Density Selector & Boot Line Toggle (Style 4: pixel_terminal ONLY) */}
                      {activeStyleId === 'pixel_terminal' && (
                        <div className="space-y-2.5 pt-1">
                          <div className="space-y-1">
                            <span className="block text-xs font-semibold text-slate-300">
                              كثافة البكسل (Pixel Density)
                            </span>
                            <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                              {PIXEL_DENSITY_OPTIONS.map((opt) => {
                                const isSel = (customization.pixelDensity ?? 2) === opt.id;
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    data-testid={`pixel-density-btn-${opt.id}`}
                                    onClick={() =>
                                      setCustomization((c) => ({
                                        ...c,
                                        pixelDensity: opt.id,
                                      }))
                                    }
                                    className={`py-1.5 px-1.5 text-center rounded-md transition-colors ${
                                      isSel
                                        ? 'bg-slate-800 text-sky-400 font-bold border border-sky-500/30'
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    <span className="block text-xs">{opt.labelAr}</span>
                                    <span className="block text-[9px] opacity-70">{opt.subAr}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 cursor-pointer">
                            <span className="text-xs text-slate-300">
                              سطر بدء التشغيل اللاتيني (Boot Line) قبل الكتابة
                            </span>
                            <input
                              type="checkbox"
                              data-testid="terminal-boot-line-checkbox"
                              checked={Boolean(customization.terminalBootLine)}
                              onChange={(e) =>
                                setCustomization((c) => ({
                                  ...c,
                                  terminalBootLine: e.target.checked,
                                }))
                              }
                              className="rounded accent-sky-400 w-4 h-4"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                {/* Floating 3D Objects Toggle for all 15 Floating Styles across the 5 pages */}
                {isFloatingStyleId(activeStyleId) && (
                  <div
                    className="space-y-2 pt-2 border-t border-slate-800/80"
                    data-testid="floating-objects-controls"
                  >
                    <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 cursor-pointer hover:border-sky-500/40 transition-colors">
                      <div className="space-y-0.5">
                        <span className="block text-xs font-bold text-sky-300">
                          إظهار الأجسام العائمة المحيطة (3D Parallax Objects)
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          يمكنك إيقافها للاكتفاء بالبطاقة العائمة الرئيسية فقط (مثالي للكروما النظيفة)
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        data-testid="toggle-show-floating-objects"
                        checked={customization.showFloatingObjects ?? true}
                        onChange={(e) =>
                          setCustomization((c) => ({
                            ...c,
                            showFloatingObjects: e.target.checked,
                          }))
                        }
                        className="rounded accent-sky-400 w-4 h-4 shrink-0"
                      />
                    </label>
                  </div>
                )}

                {/* Timeline Theme Selector inside Section 2 for pts_timeline */}
                {studioMode === 'points' && activeStyleId === 'pts_timeline' && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <span className="block text-xs font-bold text-sky-300">
                        ثيم الخط الزمني (داكن / أبيض هادئ)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {resolveTimelineTheme(customization) === 'light'
                          ? 'أبيض ثلجي متدرج + هالة باستيل'
                          : 'داكن سينمائي'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                      {(
                        [
                          { id: 'dark', label: 'داكن سينمائي (ليلي)' },
                          { id: 'light', label: 'أبيض هادئ متدرج' },
                        ] as { id: CalmStyleTheme; label: string }[]
                      ).map((th) => {
                        const isSel = resolveTimelineTheme(customization) === th.id;
                        return (
                          <button
                            key={th.id}
                            type="button"
                            data-testid={`sec2-timeline-theme-btn-${th.id}`}
                            onClick={() => handleSelectTimelineTheme(th.id)}
                            className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                              isSel
                                ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                                : 'text-slate-400 hover:text-white hover:bg-slate-900'
                            }`}
                          >
                            {th.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Flyer Creature Selector (4 creatures with live previews + theme toggle + flight speed slider) for phrase_flyer & pts_flyer */}
                {isFlyerStyleId(activeStyleId) && (
                  <FlyerCreatureSelector
                    selectedCreature={customization.flyerCreature}
                    accentColor={customization.accentColor}
                    hasCustomColor={customization.flyerCustomColor}
                    selectedTheme={resolveFlyerTheme(customization)}
                    flightSpeed={resolveFlyerFlightSpeed(customization)}
                    cricketEnabled={Boolean(customization.flyerCricketEnabled)}
                    cricketPreset={resolveFlyerCricketPreset(customization.flyerCricketPreset)}
                    cricketVolume={resolveFlyerCricketVolume(customization.flyerCricketVolume)}
                    onSelectCreature={handleSelectFlyerCreature}
                    onSelectTheme={handleSelectFlyerTheme}
                    onChangeFlightSpeed={handleChangeFlyerFlightSpeed}
                    onToggleCricket={handleToggleFlyerCricket}
                    onSelectCricketPreset={handleSelectFlyerCricketPreset}
                    onChangeCricketVolume={handleChangeFlyerCricketVolume}
                    onPreviewCricket={handlePreviewFlyerCricket}
                  />
                )}
              </div>
            )}
          </section>

          {/* SECTION 3: المكان والخلفية (Position & Background Modes) */}
          <section id="section-position-bg" className="p-4">
            <button
              type="button"
              onClick={() => toggleSection('positionBg')}
              aria-expanded={openSections.positionBg}
              className="w-full flex items-center justify-between text-right py-1"
            >
              <span className="text-sm font-bold text-white">3. المكان والخلفية</span>
              {openSections.positionBg ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {openSections.positionBg && (
              <div className="mt-4 space-y-4">
                {/* Position Selector (Key Phrase, Chat, Points & Image modes) */}
                {(studioMode === 'phrase' ||
                  studioMode === 'chat' ||
                  studioMode === 'points' ||
                  studioMode === 'image') && (
                  <div className="space-y-1.5">
                    <span className="block text-xs font-semibold text-slate-300">
                      {studioMode === 'image'
                        ? 'موضع الصورة على الشاشة (Position)'
                        : studioMode === 'points'
                          ? 'موضع قائمة النقاط على الشاشة (Position)'
                          : studioMode === 'chat'
                            ? 'موضع نافذة المحادثة على الشاشة (Position)'
                            : 'موضع الجملة على الشاشة (Position)'}
                    </span>
                    <div
                      className={`grid ${
                        studioMode === 'image' ||
                        studioMode === 'chat' ||
                        studioMode === 'points'
                          ? 'grid-cols-2 sm:grid-cols-4'
                          : 'grid-cols-3'
                      } gap-1.5 p-1.5 bg-slate-950 border border-slate-800 rounded-xl`}
                    >
                      {(studioMode === 'image'
                        ? IMAGE_POSITIONS
                        : studioMode === 'points'
                          ? POINTS_POSITIONS
                          : studioMode === 'chat'
                            ? CHAT_POSITIONS
                            : PHRASE_POSITIONS
                      ).map((posOpt) => {
                        const isDisabledInVertical =
                          customization.format === '9:16' &&
                          (posOpt.id === 'left' || posOpt.id === 'right');
                        const isSelected = (customization.position || 'center') === posOpt.id;
                        return (
                          <button
                            key={posOpt.id}
                            type="button"
                            disabled={isDisabledInVertical}
                            data-testid={`pos-btn-${posOpt.id}`}
                            onClick={() => handlePositionChange(posOpt.id)}
                            title={
                              isDisabledInVertical
                                ? 'غير متاح في الوضع الطولي 9:16'
                                : posOpt.descAr
                            }
                            className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                              isDisabledInVertical
                                ? 'opacity-35 cursor-not-allowed text-slate-600'
                                : isSelected
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
                            }`}
                          >
                            {posOpt.labelAr}
                          </button>
                        );
                      })}
                    </div>
                    {customization.format === '9:16' && (
                      <p data-testid="pos-vertical-note" className="text-[11px] text-amber-300/90">
                        ملاحظة: موضعا (يمين) و(يسار) معطّلان في الأبعاد الطولية 9:16 لضمان وضوح القراءة.
                      </p>
                    )}
                  </div>
                )}

                {/* Image Mode: Size Slider (60-120% of region) + Slow Push-In Toggle (1.0 -> 1.08) */}
                {studioMode === 'image' && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <label
                          htmlFor="image-scale-slider"
                          className="text-slate-300 font-medium"
                        >
                          حجم الكادر داخل المنطقة (60% – 120%)
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {Math.round((customization.imageScale ?? 1.0) * 100)}%
                        </span>
                      </div>
                      <input
                        id="image-scale-slider"
                        data-testid="image-scale-slider"
                        type="range"
                        min={0.6}
                        max={1.2}
                        step={0.05}
                        value={customization.imageScale ?? 1.0}
                        onChange={(e) =>
                          setCustomization((c) => ({
                            ...c,
                            imageScale: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 cursor-pointer">
                      <div>
                        <span className="block text-xs font-semibold text-slate-200">
                          تقريب سينمائي بطيء للصورة (Slow Push-In 1.0 → 1.08)
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          حركة تقريب انسيابية للصورة طوال فترة العرض
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        data-testid="image-push-in-checkbox"
                        checked={Boolean(customization.imagePushIn)}
                        onChange={(e) =>
                          setCustomization((c) => ({
                            ...c,
                            imagePushIn: e.target.checked,
                          }))
                        }
                        className="rounded accent-sky-400 w-4 h-4 shrink-0"
                      />
                    </label>
                  </div>
                )}

                {/* Background Mode Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      وضع الخلفية (Background Mode)
                    </span>
                    <span className="text-[11px] text-sky-400">
                      الموصى به:{' '}
                      {recommendedBg === 'style'
                        ? 'خلفية الستايل'
                        : recommendedBg === 'green'
                          ? 'أخضر (Chroma Key)'
                          : 'أسود (Screen)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-950 border border-slate-800 rounded-xl">
                    {BACKGROUND_MODE_OPTIONS.map((bgOpt) => {
                      const isStyleSupported = supportedBgs.includes(bgOpt.id);
                      const isDisabled = !isStyleSupported;
                      const isSelected = currentBgMode === bgOpt.id;

                      const tooltipAr = !isStyleSupported
                        ? bgOpt.id === 'black'
                          ? studioMode === 'video'
                            ? 'وضع Screen غير متاح في وضع الفيديو لأن المناطق الداكنة في المقطع ستصبح شفافة عند الدمج — استخدم خلفية الستايل أو أخضر Chroma Key'
                            : 'غير مدعوم لهذا الستايل لأن الحبر الداكن والورق يختفيان في وضع Screen — استخدم خلفية الستايل أو أخضر Chroma Key'
                          : 'غير مدعوم لهذا الستايل بسبب التوهج الضوئي المتدرج — استخدم خلفية الستايل أو أسود Screen'
                        : bgOpt.subLabelAr;

                      return (
                        <button
                          key={bgOpt.id}
                          type="button"
                          disabled={isDisabled}
                          data-testid={`bg-btn-${bgOpt.id}`}
                          title={tooltipAr}
                          onClick={() => handleBackgroundModeChange(bgOpt.id)}
                          className={`py-2 px-2 rounded-lg text-center transition-colors ${
                            isDisabled
                              ? 'opacity-35 cursor-not-allowed text-slate-600'
                              : isSelected
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                                : 'text-slate-400 hover:text-white hover:bg-slate-900'
                          }`}
                        >
                          <span className="block text-xs whitespace-nowrap">{bgOpt.labelAr}</span>
                          <span className="block text-[10px] opacity-75 truncate mt-0.5">
                            {bgOpt.subLabelAr}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {hasGreenColorClash && (
                    <div
                      data-testid="green-chroma-warning"
                      className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-2"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>
                        تنبيه: اللون المميز أو لون الكلمة المفتاحية قريب من الأخضر أو الأصفر المخضر، وقد يختفي عند إزالة الكروما الخضراء في برامج المونتاج.
                      </span>
                    </div>
                  )}

                  {hasImageGreenPixelClash && (
                    <div
                      data-testid="image-green-pixels-warning"
                      className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-2"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>
                        تنبيه: تحتوي الصورة على نسبة {Math.round(imageGreenPixelRatio * 100)}% من البكسلات الخضراء (أكثر من 8%)، مما قد يجعل أجزاءً من الصورة شفافة عند تفريغ الكروما الخضراء.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* SECTION 4: التوقيت والحركة */}
          <section id="section-timing" className="p-4">
            <button
              type="button"
              onClick={() => toggleSection('timing')}
              aria-expanded={openSections.timing}
              className="w-full flex items-center justify-between text-right py-1"
            >
              <span className="text-sm font-bold text-white">
                4. التوقيت والحركة ({effectiveTimeline.total} ثانية)
              </span>
              {openSections.timing ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {openSections.timing && (
              <div className="mt-4 space-y-3.5">
                {studioMode === 'video' ? (
                  <VideoTimingSummaryControls
                    customization={customization}
                    setCustomization={setCustomization}
                    videoMeta={videoMeta}
                  />
                ) : studioMode === 'points' ? (
                  <div className="space-y-3.5" data-testid="points-schedule-controls">
                    {/* Reveal Interval Slider (0.4 - 3.0 s) + Auto Checkbox */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <label
                          htmlFor="points-interval-slider"
                          className="text-slate-300 font-medium"
                        >
                          الفاصل الزمني بين ظهور النقاط (Reveal Interval)
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {(customization.pointsTiming || DEFAULT_POINTS_TIMING).autoInterval
                            ? 'تلقائي (~0.2ث/كلمة)'
                            : `${(
                                customization.pointsTiming || DEFAULT_POINTS_TIMING
                              ).revealInterval.toFixed(1)} ثانية`}
                        </span>
                      </div>
                      <input
                        id="points-interval-slider"
                        data-testid="points-interval-slider"
                        type="range"
                        min={0.4}
                        max={3.0}
                        step={0.1}
                        disabled={(customization.pointsTiming || DEFAULT_POINTS_TIMING).autoInterval}
                        value={(customization.pointsTiming || DEFAULT_POINTS_TIMING).revealInterval}
                        onChange={(e) =>
                          handleUpdatePointsTiming({
                            revealInterval: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-40"
                      />
                      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-0.5">
                        <input
                          type="checkbox"
                          data-testid="points-auto-interval-checkbox"
                          checked={
                            (customization.pointsTiming || DEFAULT_POINTS_TIMING).autoInterval
                          }
                          onChange={(e) =>
                            handleUpdatePointsTiming({ autoInterval: e.target.checked })
                          }
                          className="rounded accent-sky-500"
                        />
                        <span>
                          تلقائي (~0.2 ثانية لكل كلمة، بحد أدنى 0.8 ثانية لكل نقطة)
                        </span>
                      </label>
                    </div>

                    {/* End Hold Slider (1.0 - 6.0 s, default 2.0 s) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <label
                          htmlFor="points-end-hold-slider"
                          className="text-slate-300 font-medium"
                        >
                          ثبات النهاية بعد ظهور جميع النقاط (End Hold)
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {(customization.pointsTiming || DEFAULT_POINTS_TIMING).endHold.toFixed(1)} ثانية
                        </span>
                      </div>
                      <input
                        id="points-end-hold-slider"
                        data-testid="points-end-hold-slider"
                        type="range"
                        min={1.0}
                        max={6.0}
                        step={0.5}
                        value={(customization.pointsTiming || DEFAULT_POINTS_TIMING).endHold}
                        onChange={(e) =>
                          handleUpdatePointsTiming({
                            endHold: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Flyer Points Sentence Reveal Speed Slider (pts_flyer only) */}
                    {activeStyleId === 'pts_flyer' && (
                      <div
                        className="space-y-1.5 pt-2 border-t border-slate-800/80"
                        data-testid="pts-flyer-reveal-speed-control"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <label
                            htmlFor="pts-flyer-reveal-speed-slider"
                            className="text-slate-300 font-medium"
                          >
                            بطء وسرعة ظهور الجملة (للكائن الطائر)
                          </label>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono-tabular text-sky-400 font-semibold">
                              {(() => {
                                const d = clamp(
                                  (customization.pointsTiming || DEFAULT_POINTS_TIMING)
                                    .flyerRevealDuration ?? 0.65,
                                  0.2,
                                  2.0
                                );
                                const speedLabel =
                                  d <= 0.35
                                    ? 'سريع'
                                    : d <= 0.75
                                      ? 'متوازن'
                                      : d <= 1.25
                                        ? 'هادئ'
                                        : 'بطيء';
                                return `${speedLabel} · ${d.toFixed(2)}ث`;
                              })()}
                            </span>
                            {(customization.pointsTiming?.flyerRevealDuration ?? 0.65) !== 0.65 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdatePointsTiming({ flyerRevealDuration: 0.65 })
                                }
                                className="text-[11px] text-slate-400 hover:text-sky-300 transition-colors"
                              >
                                افتراضي
                              </button>
                            )}
                          </div>
                        </div>
                        <input
                          id="pts-flyer-reveal-speed-slider"
                          data-testid="pts-flyer-reveal-speed-slider"
                          type="range"
                          min={0.2}
                          max={2.0}
                          step={0.05}
                          value={clamp(
                            (customization.pointsTiming || DEFAULT_POINTS_TIMING)
                              .flyerRevealDuration ?? 0.65,
                            0.2,
                            2.0
                          )}
                          onChange={(e) =>
                            handleUpdatePointsTiming({
                              flyerRevealDuration: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>سريع (0.20ث)</span>
                          <span>متوازن (0.65ث)</span>
                          <span>بطيء سينمائي (2.00ث)</span>
                        </div>
                      </div>
                    )}

                    {/* Auto-extended End Hold Note (ensuring >= 0.8s full visibility after last item) */}
                    {effectiveTimeline.holdExtended && effectiveTimeline.extendedReasonAr && (
                      <p
                        data-testid="points-hold-extended-note"
                        className="text-[11px] text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg px-2.5 py-1.5 leading-relaxed"
                      >
                        {effectiveTimeline.extendedReasonAr}
                      </p>
                    )}

                    {/* Computed Total Duration Summary */}
                    <div
                      data-testid="points-computed-duration"
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-400">
                        دخول ثابت 0.6ث · خروج 0.6ث · الإجمالي المحسوب:
                      </span>
                      <span className="font-mono-tabular font-bold text-sky-400">
                        {effectiveTimeline.total.toFixed(2)} ثانية
                      </span>
                    </div>
                  </div>
                ) : studioMode === 'chat' ? (
                  <div className="space-y-3.5" data-testid="chat-schedule-controls">
                    {/* User Typing Speed (8-30 chars/s, default 18) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <label
                          htmlFor="chat-user-speed-slider"
                          className="text-slate-300 font-medium"
                        >
                          سرعة كتابة السؤال (User Typing)
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {(customization.chatTiming || DEFAULT_CHAT_TIMING).userTypingSpeed} حرف/ث
                        </span>
                      </div>
                      <input
                        id="chat-user-speed-slider"
                        data-testid="chat-user-speed-slider"
                        type="range"
                        min={8}
                        max={30}
                        step={1}
                        value={(customization.chatTiming || DEFAULT_CHAT_TIMING).userTypingSpeed}
                        onChange={(e) =>
                          handleUpdateChatTiming({
                            userTypingSpeed: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* AI Reply Speed (4-20 words/s, default 9) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <label
                          htmlFor="chat-ai-speed-slider"
                          className="text-slate-300 font-medium"
                        >
                          سرعة تدفق رد الذكاء الاصطناعي (AI Reply)
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {(customization.chatTiming || DEFAULT_CHAT_TIMING).aiReplySpeed} كلمة/ث
                        </span>
                      </div>
                      <input
                        id="chat-ai-speed-slider"
                        data-testid="chat-ai-speed-slider"
                        type="range"
                        min={4}
                        max={20}
                        step={1}
                        value={(customization.chatTiming || DEFAULT_CHAT_TIMING).aiReplySpeed}
                        onChange={(e) =>
                          handleUpdateChatTiming({
                            aiReplySpeed: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Thinking Delay (0-10 s, default 0.9) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <label
                          htmlFor="chat-thinking-slider"
                          className="text-slate-300 font-medium"
                        >
                          مهلة التفكير قبل كل رد (Thinking Delay)
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {(customization.chatTiming || DEFAULT_CHAT_TIMING).thinkingDelay.toFixed(1)} ثانية
                        </span>
                      </div>
                      <input
                        id="chat-thinking-slider"
                        data-testid="chat-thinking-slider"
                        type="range"
                        min={0}
                        max={10.0}
                        step={0.1}
                        value={(customization.chatTiming || DEFAULT_CHAT_TIMING).thinkingDelay}
                        onChange={(e) =>
                          handleUpdateChatTiming({
                            thinkingDelay: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Gap between messages (0.2-3 s, default 0.4) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <label
                          htmlFor="chat-gap-slider"
                          className="text-slate-300 font-medium"
                        >
                          الفاصل الزمني بين الرسائل (Gap)
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {(customization.chatTiming || DEFAULT_CHAT_TIMING).messageGap.toFixed(1)} ثانية
                        </span>
                      </div>
                      <input
                        id="chat-gap-slider"
                        data-testid="chat-gap-slider"
                        type="range"
                        min={0.2}
                        max={3.0}
                        step={0.1}
                        value={(customization.chatTiming || DEFAULT_CHAT_TIMING).messageGap}
                        onChange={(e) =>
                          handleUpdateChatTiming({
                            messageGap: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* End Hold (1-6 s, default 2) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <label
                          htmlFor="chat-end-hold-slider"
                          className="text-slate-300 font-medium"
                        >
                          ثبات النهاية بعد اكتمال المحادثة (End Hold)
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {(customization.chatTiming || DEFAULT_CHAT_TIMING).endHold.toFixed(1)} ثانية
                        </span>
                      </div>
                      <input
                        id="chat-end-hold-slider"
                        data-testid="chat-end-hold-slider"
                        type="range"
                        min={1.0}
                        max={6.0}
                        step={0.5}
                        value={(customization.chatTiming || DEFAULT_CHAT_TIMING).endHold}
                        onChange={(e) =>
                          handleUpdateChatTiming({
                            endHold: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Computed Total Duration Summary */}
                    <div
                      data-testid="chat-computed-duration"
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-400">
                        دخول ثابت 0.6ث · خروج 0.6ث · الإجمالي المحسوب:
                      </span>
                      <span className="font-mono-tabular font-bold text-sky-400">
                        {effectiveTimeline.total.toFixed(2)} ثانية
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Enter Duration Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <label htmlFor="enter-duration-slider" className="text-slate-300 font-medium">
                          مدة الدخول (Enter)
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {activeTimeline.enterDuration.toFixed(1)} ثانية
                        </span>
                      </div>
                      <input
                        id="enter-duration-slider"
                        type="range"
                        min={0.5}
                        max={8.0}
                        step={0.1}
                        value={activeTimeline.enterDuration}
                        onChange={(e) =>
                          setActiveTimeline((t) => ({
                            ...t,
                            enterDuration: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Hold Duration Slider + Auto Hold Checkbox */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label htmlFor="hold-duration-slider" className="text-slate-300 font-medium">
                          مدة الثبات والقراءة (Hold)
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {effectiveTimeline.hold.toFixed(1)} ثانية
                        </span>
                      </div>
                      <input
                        id="hold-duration-slider"
                        type="range"
                        min={studioMode === 'phrase' ? 1.5 : 2.0}
                        max={15.0}
                        step={0.5}
                        disabled={activeTimeline.autoHold}
                        value={effectiveTimeline.hold}
                        onChange={(e) =>
                          setActiveTimeline((t) => ({
                            ...t,
                            holdDuration: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-40"
                      />
                      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-0.5">
                        <input
                          type="checkbox"
                          checked={activeTimeline.autoHold}
                          onChange={(e) =>
                            setActiveTimeline((t) => ({ ...t, autoHold: e.target.checked }))
                          }
                          className="rounded accent-sky-500"
                        />
                        <span>
                          {studioMode === 'phrase'
                            ? 'حساب وقت القراءة تلقائياً (~0.35 ثانية لكل كلمة، بين 2 و 8 ثوانٍ)'
                            : 'حساب وقت القراءة تلقائياً (0.4 ثانية لكل كلمة، بحد أدنى 4 ثوانٍ)'}
                        </span>
                      </label>

                      {effectiveTimeline.holdExtended && effectiveTimeline.extendedReasonAr && (
                        <p
                          data-testid="hold-extended-note"
                          className="text-[11px] text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg px-2.5 py-1.5 leading-relaxed"
                        >
                          {effectiveTimeline.extendedReasonAr}
                        </p>
                      )}
                    </div>

                    {/* Exit Duration Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <label htmlFor="exit-duration-slider" className="text-slate-300 font-medium">
                          مدة الخروج (Exit)
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {activeTimeline.exitDuration.toFixed(1)} ثانية
                        </span>
                      </div>
                      <input
                        id="exit-duration-slider"
                        type="range"
                        min={0.4}
                        max={2.0}
                        step={0.1}
                        value={activeTimeline.exitDuration}
                        onChange={(e) =>
                          setActiveTimeline((t) => ({
                            ...t,
                            exitDuration: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          {/* SECTION 5: الخطوط والألوان */}
          <section id="section-fonts" className="p-4">
            <button
              type="button"
              onClick={() => toggleSection('fontsColors')}
              aria-expanded={openSections.fontsColors}
              className="w-full flex items-center justify-between text-right py-1"
            >
              <span className="text-sm font-bold text-white">5. الخطوط والألوان</span>
              {openSections.fontsColors ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {openSections.fontsColors && (
              <div className="mt-4 space-y-4">
                {/* Accent Color Picker */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="accent-color-input"
                      className="text-xs font-semibold text-slate-300"
                    >
                      اللون المميز (Accent Color)
                    </label>
                    <button
                      type="button"
                      data-testid="reset-accent-color-btn"
                      onClick={() =>
                        setCustomization((c) => ({
                          ...c,
                          flyerCustomColor: false,
                          accentColor: isFlyerStyleId(activeStyleId)
                            ? FLYER_DEFAULT_TINTS[resolveFlyerCreature(c.flyerCreature)]
                            : activeStyleMeta.defaultAccent,
                        }))
                      }
                      className="text-[11px] text-slate-400 hover:text-sky-400"
                    >
                      افتراضي الستايل (
                      {isFlyerStyleId(activeStyleId)
                        ? FLYER_DEFAULT_TINTS[resolveFlyerCreature(customization.flyerCreature)]
                        : activeStyleMeta.defaultAccent}
                      )
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="accent-color-input"
                      type="color"
                      value={customization.accentColor}
                      onChange={(e) =>
                        setCustomization((c) => ({
                          ...c,
                          accentColor: e.target.value,
                          flyerCustomColor: true,
                        }))
                      }
                      className="w-9 h-9 rounded-lg border border-slate-700 bg-slate-950 cursor-pointer p-0.5 shrink-0"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {CURATED_ACCENT_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() =>
                            setCustomization((c) => ({
                              ...c,
                              accentColor: hex,
                              flyerCustomColor: true,
                            }))
                          }
                          aria-label={`اللون ${hex}`}
                          className={`w-6 h-6 rounded-md border transition-transform ${
                            customization.accentColor.toLowerCase() === hex.toLowerCase()
                              ? 'border-white scale-110'
                              : 'border-white/20 hover:scale-105'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                  {isGreenishColor(customization.accentColor) && (
                    <div
                      data-testid="accent-green-warning"
                      className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span>
                        تنبيه: اللون المختار يميل إلى الأخضر وقد يتداخل مع تفريغ الكروما الخضراء (Chroma Key). يُنصح باختيار لون دافئ أو غير أخضر.
                      </span>
                    </div>
                  )}
                </div>

                {/* Keyword Color Picker ("لون الكلمة المفتاحية") */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="keyword-color-input"
                      className="text-xs font-semibold text-slate-300"
                    >
                      لون الكلمة المفتاحية (Keyword Color)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setCustomization((c) => ({
                          ...c,
                          keywordColor:
                            activeStyleMeta.defaultKeywordColor || activeStyleMeta.defaultAccent,
                        }))
                      }
                      className="text-[11px] text-slate-400 hover:text-sky-400"
                    >
                      افتراضي ({activeStyleMeta.defaultKeywordColor || activeStyleMeta.defaultAccent})
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="keyword-color-input"
                      type="color"
                      value={
                        customization.keywordColor ||
                        activeStyleMeta.defaultKeywordColor ||
                        activeStyleMeta.defaultAccent
                      }
                      onChange={(e) =>
                        setCustomization((c) => ({ ...c, keywordColor: e.target.value }))
                      }
                      className="w-9 h-9 rounded-lg border border-slate-700 bg-slate-950 cursor-pointer p-0.5 shrink-0"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {CURATED_KEYWORD_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setCustomization((c) => ({ ...c, keywordColor: hex }))}
                          aria-label={`لون الكلمة المفتاحية ${hex}`}
                          className={`w-6 h-6 rounded-md border transition-transform ${
                            (customization.keywordColor || '').toLowerCase() === hex.toLowerCase()
                              ? 'border-white scale-110'
                              : 'border-white/20 hover:scale-105'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Font Pickers */}
                <div
                  className={
                    studioMode === 'quote'
                      ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
                      : 'space-y-1'
                  }
                >
                  <div className="space-y-1">
                    <label
                      htmlFor="quote-font-select"
                      className="block text-xs font-semibold text-slate-300"
                    >
                      {studioMode === 'video' || studioMode === 'image'
                        ? 'خط التعليق والمصدر'
                        : studioMode === 'points'
                          ? 'خط النقاط والعنوان'
                          : studioMode === 'chat'
                            ? 'خط رسائل المحادثة'
                            : studioMode === 'phrase'
                              ? 'خط الجملة المحورية'
                              : 'خط نص الاقتباس'}
                    </label>
                    <select
                      id="quote-font-select"
                      value={customization.quoteFontOverride}
                      onChange={(e) =>
                        setCustomization((c) => ({
                          ...c,
                          quoteFontOverride: e.target.value as StudioFontFamily | '',
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                    >
                      <option value="">
                        افتراضي الستايل (
                        {isLtr
                          ? activeStyleMeta.defaultEnglishQuoteFont || activeStyleMeta.defaultQuoteFont
                          : activeStyleMeta.defaultQuoteFont}
                        )
                      </option>
                      {isLtr ? (
                        <>
                          <optgroup label="الخطوط الإنجليزية المناسبة للستايل (Curated English)">
                            {availableEnglishFontsForCurrentStyle.map((f) => (
                              <option key={f.family} value={f.family}>
                                {f.labelEn}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="الخطوط العربية (Arabic Fonts)">
                            {availableFontsForCurrentStyle.map((f) => (
                              <option key={f.family} value={f.family}>
                                {f.labelAr}
                              </option>
                            ))}
                          </optgroup>
                        </>
                      ) : (
                        <>
                          <optgroup label="الخطوط العربية المناسبة للستايل (Arabic Fonts)">
                            {availableFontsForCurrentStyle.map((f) => (
                              <option key={f.family} value={f.family}>
                                {f.labelAr}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="الخطوط الإنجليزية (English Fonts)">
                            {availableEnglishFontsForCurrentStyle.map((f) => (
                              <option key={f.family} value={f.family}>
                                {f.labelEn}
                              </option>
                            ))}
                          </optgroup>
                        </>
                      )}
                    </select>
                  </div>

                  {studioMode === 'quote' && (
                    <div className="space-y-1">
                      <label
                        htmlFor="author-font-select"
                        className="block text-xs font-semibold text-slate-300"
                      >
                        خط اسم القائل
                      </label>
                      <select
                        id="author-font-select"
                        value={customization.authorFontOverride}
                        onChange={(e) =>
                          setCustomization((c) => ({
                            ...c,
                            authorFontOverride: e.target.value as StudioFontFamily | '',
                          }))
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                      >
                        <option value="">
                          افتراضي الستايل (
                          {isLtr
                            ? activeStyleMeta.defaultEnglishAuthorFont || activeStyleMeta.defaultAuthorFont
                            : activeStyleMeta.defaultAuthorFont}
                          )
                        </option>
                        {isLtr ? (
                          <>
                            <optgroup label="الخطوط الإنجليزية المناسبة (English Fonts)">
                              {availableEnglishFontsForCurrentStyle.map((f) => (
                                <option key={f.family} value={f.family}>
                                  {f.labelEn}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="الخطوط العربية (Arabic Fonts)">
                              {AUTHOR_ARABIC_FONTS_LIST.map((f) => (
                                <option key={f.family} value={f.family}>
                                  {f.labelAr}
                                </option>
                              ))}
                            </optgroup>
                          </>
                        ) : (
                          <>
                            <optgroup label="الخطوط العربية (Arabic Fonts)">
                              {AUTHOR_ARABIC_FONTS_LIST.map((f) => (
                                <option key={f.family} value={f.family}>
                                  {f.labelAr}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="الخطوط الإنجليزية (English Fonts)">
                              {availableEnglishFontsForCurrentStyle.map((f) => (
                                <option key={f.family} value={f.family}>
                                  {f.labelEn}
                                </option>
                              ))}
                            </optgroup>
                          </>
                        )}
                      </select>
                    </div>
                  )}
                </div>

                {/* Font Size Multiplier (0.7x - 1.3x) */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <label htmlFor="font-scale-slider" className="text-slate-300 font-medium">
                      مقياس حجم الخط اليدوي (مع الملاءمة التلقائية)
                    </label>
                    <span className="font-mono-tabular text-sky-400 font-semibold">
                      {customization.fontSizeMultiplier.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    id="font-scale-slider"
                    type="range"
                    min={0.7}
                    max={1.3}
                    step={0.05}
                    value={customization.fontSizeMultiplier}
                    onChange={(e) =>
                      setCustomization((c) => ({
                        ...c,
                        fontSizeMultiplier: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Background Blur Slider (0 - 16px) — Restricted exclusively to Quote Style 6 (Cinematic) */}
                {studioMode === 'quote' && activeStyleId === 'cinematic' && (
                  <div className="space-y-1.5 bg-slate-950/80 border border-slate-800/80 rounded-xl p-3">
                    <div className="flex items-center justify-between text-xs">
                      <label
                        htmlFor="bg-blur-slider"
                        className="text-slate-200 font-semibold flex items-center gap-1.5"
                      >
                        <span>درجة تمويه الخلفية (Blur)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tabular text-sky-400 font-bold text-xs">
                          {customization.backgroundBlur ?? 6}px
                          {(customization.backgroundBlur ?? 6) === 0
                            ? ' (بدون تمويه)'
                            : (customization.backgroundBlur ?? 6) <= 6
                              ? ' (خفيف سينمائي)'
                              : ' (عزل قوي)'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCustomization((c) => ({
                              ...c,
                              backgroundBlur: 6,
                            }))
                          }
                          className="text-[10px] text-slate-400 hover:text-sky-300 transition-colors"
                        >
                          [افتراضي 6px]
                        </button>
                      </div>
                    </div>
                    <input
                      id="bg-blur-slider"
                      type="range"
                      min={0}
                      max={16}
                      step={1}
                      value={customization.backgroundBlur ?? 6}
                      onChange={(e) =>
                        setCustomization((c) => ({
                          ...c,
                          backgroundBlur: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                      <span>0px (حادة تماماً)</span>
                      <span>6px (سينمائي خفيف)</span>
                      <span>16px (عزل كامل)</span>
                    </div>
                  </div>
                )}

                {/* Random Seed for Stars / Grain / Particles / Ink Droplets */}
                <div className="flex items-center justify-between bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2">
                  <div className="text-xs">
                    <span className="text-slate-300 font-medium">
                      البذرة العشوائية للتأثيرات (Seed)
                    </span>
                    <span className="block text-[11px] text-slate-500 font-mono-tabular">
                      Seed #{customization.seed} (حتمي ومطابق في التصدير)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCustomization((c) => ({
                        ...c,
                        seed: Math.floor(1000 + Math.random() * 9000),
                      }))
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Shuffle className="w-3.5 h-3.5 text-sky-400" />
                    <span>توزيع جديد</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* SECTION 6: مؤثر صوتي (Synthesized Web Audio SFX) */}
          <section id="section-sfx" className="p-4">
            <button
              type="button"
              onClick={() => toggleSection('sfx')}
              aria-expanded={openSections.sfx}
              className="w-full flex items-center justify-between text-right py-1"
            >
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <span>6. مؤثر صوتي (SFX)</span>
                {sfxSettings.enabled && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-semibold">
                    مُفعّل
                  </span>
                )}
              </span>
              {openSections.sfx ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {openSections.sfx && (
              <div className="mt-4 space-y-3.5">
                <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 cursor-pointer">
                  <span className="text-xs font-bold text-slate-200">
                    تفعيل المؤثر الصوتي التلقائي (في المعاينة وتصدير MP4)
                  </span>
                  <input
                    type="checkbox"
                    data-testid="sfx-enable-checkbox"
                    checked={sfxSettings.enabled}
                    onChange={(e) => {
                      const nextEnabled = e.target.checked;
                      setSfxSettings((s) => ({ ...s, enabled: nextEnabled }));
                      if (!nextEnabled) stopLiveSfx();
                    }}
                    className="rounded accent-sky-400 w-4 h-4"
                  />
                </label>

                {sfxSettings.enabled && (
                  <div className="space-y-3 bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                    {/* SFX Type Selector */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-300">
                        نوع المؤثر الصوتي (مولّد عبر Web Audio API)
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {SFX_TYPE_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSfxSettings((s) => ({ ...s, type: opt.id }))}
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-medium text-right transition-colors ${
                              sfxSettings.type === opt.id
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                                : 'bg-slate-900 text-slate-400 hover:text-white'
                            }`}
                          >
                            {opt.labelAr}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Volume Slider (default 60%) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <label htmlFor="sfx-volume-slider" className="text-slate-300 font-medium">
                          مستوى صوت المؤثر
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {Math.round(sfxSettings.volume * 100)}%
                        </span>
                      </div>
                      <input
                        id="sfx-volume-slider"
                        type="range"
                        min={0.05}
                        max={1.0}
                        step={0.05}
                        value={sfxSettings.volume}
                        onChange={(e) =>
                          setSfxSettings((s) => ({
                            ...s,
                            volume: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Offset Slider (-0.3s to +0.3s) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <label htmlFor="sfx-offset-slider" className="text-slate-300 font-medium">
                          إزاحة التوقيت (Offset)
                        </label>
                        <span className="font-mono-tabular text-sky-400 font-semibold">
                          {sfxSettings.offset >= 0
                            ? `+${sfxSettings.offset.toFixed(2)}s`
                            : `${sfxSettings.offset.toFixed(2)}s`}
                        </span>
                      </div>
                      <input
                        id="sfx-offset-slider"
                        type="range"
                        min={-0.3}
                        max={0.3}
                        step={0.05}
                        value={sfxSettings.offset}
                        onChange={(e) =>
                          setSfxSettings((s) => ({
                            ...s,
                            offset: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Keyword Hit Checkbox */}
                    <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={sfxSettings.keywordHit}
                        onChange={(e) =>
                          setSfxSettings((s) => ({ ...s, keywordHit: e.target.checked }))
                        }
                        className="rounded accent-sky-400"
                      />
                      <span>ضربة عند الكلمة المفتاحية (مزامنة تلقائية مع لحظة ظهورها)</span>
                    </label>

                    {/* Per-Item Hit Checkbox ("نقرة عند كل نقطة") */}
                    <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        data-testid="sfx-item-hit-checkbox"
                        checked={Boolean(sfxSettings.itemHit)}
                        onChange={(e) =>
                          setSfxSettings((s) => ({ ...s, itemHit: e.target.checked }))
                        }
                        className="rounded accent-sky-400"
                      />
                      <span>نقرة عند كل نقطة (Soft Pop أو نقرات تيرمينال مع كل عنصر)</span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* SECTION 7: التصدير (Export MP4, Still PNG, Clean Mode, Audio) */}
          <section id="section-export" className="p-4">
            <button
              type="button"
              onClick={() => toggleSection('export')}
              aria-expanded={openSections.export}
              className="w-full flex items-center justify-between text-right py-1"
            >
              <span className="text-sm font-bold text-white">7. إعدادات التصدير (MP4 / PNG)</span>
              {openSections.export ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {openSections.export && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="export-res-select"
                      className="block text-[11px] font-semibold text-slate-300"
                    >
                      الدقة (Resolution)
                    </label>
                    <select
                      id="export-res-select"
                      value={exportSettings.resolution}
                      onChange={(e) =>
                        setExportSettings((s) => ({
                          ...s,
                          resolution: e.target.value as ExportResolution,
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-white font-mono-tabular focus:outline-none focus:border-sky-400"
                    >
                      <option value="1080p">1080p (Full HD)</option>
                      <option value="1440p">1440p (2K QHD)</option>
                      <option value="4K">4K (Ultra HD)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="export-fps-select"
                      className="block text-[11px] font-semibold text-slate-300"
                    >
                      معدل الإطارات
                    </label>
                    <select
                      id="export-fps-select"
                      value={exportSettings.fps}
                      onChange={(e) =>
                        setExportSettings((s) => ({
                          ...s,
                          fps: Number(e.target.value) as ExportFps,
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-white font-mono-tabular focus:outline-none focus:border-sky-400"
                    >
                      <option value={30}>30 fps</option>
                      <option value={60}>60 fps</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="export-quality-select"
                      className="block text-[11px] font-semibold text-slate-300"
                    >
                      مستوى الجودة
                    </label>
                    <select
                      id="export-quality-select"
                      value={exportSettings.quality}
                      onChange={(e) =>
                        setExportSettings((s) => ({
                          ...s,
                          quality: e.target.value as ExportQuality,
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                    >
                      <option value="normal">عادي (12M)</option>
                      <option value="high">عالي (20M)</option>
                      <option value="max">أقصى (35M)</option>
                    </select>
                  </div>
                </div>

                {/* Optional Background Audio File + Volume */}
                <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-sky-400" />
                      <span>موسيقى خلفية اختيارية (MP3 / WAV)</span>
                    </span>
                    {exportSettings.audioFile && (
                      <button
                        type="button"
                        onClick={() => setExportSettings((s) => ({ ...s, audioFile: null }))}
                        className="text-[11px] text-rose-400 hover:underline"
                      >
                        إزالة الصوت
                      </button>
                    )}
                  </div>

                  <label className="flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-slate-700 hover:border-slate-500 bg-slate-900/50 cursor-pointer text-xs text-slate-300">
                    <span className="truncate">
                      {exportSettings.audioFile
                        ? exportSettings.audioFile.name
                        : 'اختر ملف صوتي ليُدمج تلقائياً مع تلاشي الدخول والخروج...'}
                    </span>
                    <input
                      type="file"
                      accept="audio/mp3,audio/mpeg,audio/wav,audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setExportSettings((s) => ({ ...s, audioFile: file }));
                      }}
                    />
                  </label>

                  {exportSettings.audioFile && (
                    <div className="flex items-center gap-2 pt-1">
                      <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input
                        type="range"
                        min={0.05}
                        max={1.0}
                        step={0.05}
                        aria-label="مستوى صوت الموسيقى"
                        value={exportSettings.audioVolume}
                        onChange={(e) =>
                          setExportSettings((s) => ({
                            ...s,
                            audioVolume: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <span className="text-[11px] font-mono-tabular text-slate-300 w-10 text-left">
                        {Math.round(exportSettings.audioVolume * 100)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Padding & Quick 3s Test Checkboxes */}
                <div className="space-y-2 text-xs text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportSettings.endPadding}
                      onChange={(e) =>
                        setExportSettings((s) => ({ ...s, endPadding: e.target.checked }))
                      }
                      className="rounded accent-sky-500"
                    />
                    <span>إضافة هامش 0.4 ثانية في نهاية المقطع لسهولة الدمج في المونتاج</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-amber-300/95">
                    <input
                      type="checkbox"
                      checked={exportSettings.quickTest}
                      onChange={(e) =>
                        setExportSettings((s) => ({ ...s, quickTest: e.target.checked }))
                      }
                      className="rounded accent-amber-400"
                    />
                    <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>اختبار سريع (تصدير أول 3 ثوانٍ فقط للتحقق من الجودة فوراً)</span>
                  </label>
                </div>

                {!mp4Supported && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 leading-relaxed">
                    متصفحك الحالي لا يدعم ترميز H.264 المباشر عبر WebCodecs. ننصح باستخدام متصفح Chrome أو Edge على سطح المكتب لتصدير MP4، أو يمكنك استخدام زر تصدير WebM الاحتياطي أدناه.
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={handleStartMp4Export}
                    className="w-full py-3 px-4 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-sky-500/10"
                  >
                    <Film className="w-4 h-4" />
                    <span>
                      {exportSettings.quickTest
                        ? `تصدير اختبار سريع MP4 (3 ثوانٍ — ${exportSettings.resolution})`
                        : `تصدير MP4 (${exportSettings.resolution} · ${exportSettings.fps}fps)`}
                    </span>
                  </button>

                  {!mp4Supported && (
                    <button
                      type="button"
                      onClick={handleStartWebMExport}
                      className="w-full py-2.5 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>تصدير WebM (احتياطي)</span>
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleExportStill}
                      className="py-2.5 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Camera className="w-3.5 h-3.5 text-sky-400" />
                      <span>تصدير صورة ثابتة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCleanMode(true)}
                      className="py-2.5 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                      <span>وضع نظيف (OBS)</span>
                    </button>
                  </div>
                </div>

                {stillToast && (
                  <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-2.5 text-center">
                    {stillToast}
                  </p>
                )}
              </div>
            )}
          </section>
        </aside>

        {/* Left / Center Studio Preview Viewport & Timeline Scrubber */}
        <section
          aria-label="معاينة الفيديو وشريط التوقيت"
          className="flex flex-col justify-between p-4 lg:p-6 bg-slate-950 lg:h-[calc(100vh-57px)] overflow-hidden"
        >
          {/* Top Viewport Info Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-900 text-xs text-slate-400">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-400 font-bold text-[11px]">
                {studioMode === 'video'
                  ? 'فيديو'
                  : studioMode === 'image'
                    ? 'صورة'
                    : studioMode === 'points'
                      ? 'نقاط'
                      : studioMode === 'chat'
                        ? 'محادثة'
                        : studioMode === 'phrase'
                          ? 'جملة محورية'
                          : 'اقتباس'}
              </span>
              <span className="font-semibold text-slate-200">{activeStyleMeta.nameAr}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                {customization.format === '16:9' ? '1920×1080 (16:9)' : '1080×1920 (9:16)'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                الخلفية:{' '}
                <strong className="text-slate-200">
                  {currentBgMode === 'style'
                    ? 'الستايل'
                    : currentBgMode === 'green'
                      ? 'أخضر #00FF00'
                      : 'أسود #000000'}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPresetsOpen(true)}
                className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-sky-400 transition-colors"
              >
                <Bookmark className="w-3.5 h-3.5 text-sky-400" />
                <span>حفظ / تحميل قالب</span>
              </button>
              <span aria-hidden="true">·</span>
              <span className="hidden sm:inline text-[11px] text-slate-500">
                الاختصارات: Space للتشغيل · R للإعادة · F للوضع النظيف
              </span>
            </div>
          </div>

          {/* Center Canvas Stage */}
          <div className="flex-1 min-h-0 flex items-center justify-center py-4">
            <div
              ref={previewStageContainerRef}
              onPointerMove={(e) => {
                const drag = videoBoxDragRef.current;
                const stage = previewStageContainerRef.current;
                if (!drag || drag.pointerId !== e.pointerId || !stage) return;
                const rect = stage.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return;

                const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
                const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;

                if (drag.kind === 'crop') {
                  const nx = clamp(drag.startCrop.offsetX - dxPct / 35, -1, 1);
                  const ny = clamp(drag.startCrop.offsetY - dyPct / 35, -1, 1);
                  setVideoCrop((prev) => ({ ...prev, offsetX: nx, offsetY: ny }));
                  return;
                }

                const allowOut = Boolean(customization.videoAllowOutOfMargin);
                if (drag.kind === 'move') {
                  const rawNext: VideoLayoutBox = {
                    ...drag.startBox,
                    x: drag.startBox.x + dxPct,
                    y: drag.startBox.y + dyPct,
                  };
                  const snapped = snapVideoBoxToGuides(rawNext, allowOut, 1.35);
                  setVideoDragGuideState({
                    active: true,
                    centerX: snapped.snappedCenterX,
                    centerY: snapped.snappedCenterY,
                    safeLeft: snapped.snappedSafeLeft,
                    safeRight: snapped.snappedSafeRight,
                    safeTop: snapped.snappedSafeTop,
                    safeBottom: snapped.snappedSafeBottom,
                  });
                  setCustomization((c) => ({ ...c, videoBox: snapped.box }));
                  return;
                }

                const aspectLock = customization.videoAspectLock !== false;
                const resized = resizeVideoBoxFromCorner(
                  drag.startBox,
                  drag.kind,
                  dxPct,
                  dyPct,
                  aspectLock,
                  allowOut
                );
                setVideoDragGuideState((g) => ({ ...g, active: true }));
                setCustomization((c) => ({ ...c, videoBox: resized }));
              }}
              onPointerUp={(e) => {
                const drag = videoBoxDragRef.current;
                if (!drag || drag.pointerId !== e.pointerId) return;
                videoBoxDragRef.current = null;
                setVideoDragGuideState({
                  active: false,
                  centerX: false,
                  centerY: false,
                  safeLeft: false,
                  safeRight: false,
                  safeTop: false,
                  safeBottom: false,
                });
                try {
                  if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  }
                } catch {
                  // Ignore
                }
              }}
              onPointerCancel={() => {
                videoBoxDragRef.current = null;
                setVideoDragGuideState((g) => ({ ...g, active: false }));
              }}
              className={`relative rounded-xl overflow-hidden shadow-2xl border border-slate-800/90 bg-black flex items-center justify-center ${
                customization.format === '16:9'
                  ? 'w-full max-w-5xl aspect-video max-h-full'
                  : 'h-full max-h-[68vh] lg:max-h-[72vh] aspect-[9/16]'
              }`}
            >
              <canvas
                ref={previewCanvasRef}
                data-testid="quote-preview-canvas"
                onPointerDown={handlePreviewCanvasPointerDown}
                onPointerMove={handlePreviewCanvasPointerMove}
                onPointerUp={handlePreviewCanvasPointerUp}
                onPointerCancel={handlePreviewCanvasPointerUp}
                className={`w-full h-full object-contain block ${
                  studioMode === 'points' &&
                  activeStyleId === 'pts_timeline' &&
                  isTimelineDragEnabled
                    ? isDraggingTimelineTarget
                      ? 'cursor-grabbing touch-none'
                      : 'cursor-grab touch-none'
                    : ''
                }`}
              />

              {/* Video Insert Interactive Box Overlay (Drag, Corner Resize, Snap Guides, Fill Crop Pan) */}
              {studioMode === 'video' && (() => {
                const activeBox = clampVideoBoxToSafeMargin(
                  customization.videoBox || DEFAULT_VIDEO_BOX,
                  Boolean(customization.videoAllowOutOfMargin)
                );
                const isFillPanAvailable =
                  (customization.videoFit || 'contain') === 'cover' || videoCrop.zoom > 1.01;

                const startVideoDrag = (
                  kind: 'move' | 'crop' | VideoCornerHandle,
                  e: React.PointerEvent
                ) => {
                  e.stopPropagation();
                  e.preventDefault();
                  videoBoxDragRef.current = {
                    kind,
                    pointerId: e.pointerId,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    startBox: activeBox,
                    startCrop: { ...videoCrop },
                  };
                  previewStageContainerRef.current?.setPointerCapture(e.pointerId);
                };

                const corners: { id: VideoCornerHandle; posClass: string; cursorClass: string }[] = [
                  { id: 'nw', posClass: '-top-1.5 -left-1.5', cursorClass: 'cursor-nwse-resize' },
                  { id: 'ne', posClass: '-top-1.5 -right-1.5', cursorClass: 'cursor-nesw-resize' },
                  { id: 'sw', posClass: '-bottom-1.5 -left-1.5', cursorClass: 'cursor-nesw-resize' },
                  { id: 'se', posClass: '-bottom-1.5 -right-1.5', cursorClass: 'cursor-nwse-resize' },
                ];

                return (
                  <div className="absolute inset-0 pointer-events-none select-none">
                    {/* Snap & 6% Safe Area Guides (shown when actively dragging) */}
                    {videoDragGuideState.active && (
                      <>
                        <div className="absolute inset-[6%] border border-dashed border-sky-400/35 pointer-events-none" />
                        {videoDragGuideState.centerX && (
                          <div className="absolute inset-y-0 left-1/2 w-px bg-amber-400/90 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
                        )}
                        {videoDragGuideState.centerY && (
                          <div className="absolute inset-x-0 top-1/2 h-px bg-amber-400/90 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
                        )}
                        {videoDragGuideState.safeLeft && (
                          <div className="absolute inset-y-0 left-[6%] w-px bg-sky-400/90" />
                        )}
                        {videoDragGuideState.safeRight && (
                          <div className="absolute inset-y-0 right-[6%] w-px bg-sky-400/90" />
                        )}
                        {videoDragGuideState.safeTop && (
                          <div className="absolute inset-x-0 top-[6%] h-px bg-sky-400/90" />
                        )}
                        {videoDragGuideState.safeBottom && (
                          <div className="absolute inset-x-0 bottom-[6%] h-px bg-sky-400/90" />
                        )}
                      </>
                    )}

                    {/* Interactive Percentage Box */}
                    <div
                      data-testid="video-preview-box-overlay"
                      onPointerDown={(e) =>
                        startVideoDrag(isFillPanAvailable ? 'crop' : 'move', e)
                      }
                      title={
                        isFillPanAvailable
                          ? 'اسحب داخل الشاشة لتحريك القص، أو اسحب الحواف لتحريك الصندوق'
                          : 'اسحب لتحريك الصندوق أو اسحب الزوايا لتغيير الحجم'
                      }
                      className={`absolute pointer-events-auto border border-sky-400/55 hover:border-sky-300 transition-colors group ${
                        isFillPanAvailable ? 'cursor-all-scroll' : 'cursor-move'
                      }`}
                      style={{
                        left: `${activeBox.x}%`,
                        top: `${activeBox.y}%`,
                        width: `${activeBox.w}%`,
                        height: `${activeBox.h}%`,
                      }}
                    >
                      {/* Top Border Grip Bar (always moves the whole box, essential in Fill/Cover mode) */}
                      <button
                        type="button"
                        aria-label="تحريك صندوق الفيديو"
                        onPointerDown={(e) => startVideoDrag('move', e)}
                        className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-slate-900/90 border border-sky-400/70 text-[10px] font-bold text-sky-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-move shadow"
                      >
                        تحريك الصندوق
                      </button>

                      {/* Corner Resize Handles */}
                      {corners.map((c) => (
                        <div
                          key={c.id}
                          data-testid={`video-box-handle-${c.id}`}
                          onPointerDown={(e) => startVideoDrag(c.id, e)}
                          className={`absolute w-3.5 h-3.5 rounded-full bg-white border-2 border-sky-400 shadow opacity-75 group-hover:opacity-100 transition-opacity ${c.posClass} ${c.cursorClass}`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Bottom Playback & Scrubbable Timeline Bar */}
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-3.5 space-y-2.5">
            <div className="space-y-1">
              <input
                ref={scrubberInputRef}
                type="range"
                min={0}
                max={effectiveTimeline.total}
                step={0.01}
                aria-label="شريط التوقيت الزمني"
                defaultValue={clamp(currentTime, 0, effectiveTimeline.total)}
                onChange={(e) => handleScrub(parseFloat(e.target.value))}
                className="w-full accent-sky-400 h-2 bg-slate-950 rounded-lg cursor-pointer"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span>
                    دخول:{' '}
                    <strong className="font-mono-tabular text-slate-300">
                      0.0s – {effectiveTimeline.enter.toFixed(1)}s
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    ثبات:{' '}
                    <strong className="font-mono-tabular text-slate-300">
                      {effectiveTimeline.enter.toFixed(1)}s – {effectiveTimeline.exitStart.toFixed(1)}s
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    خروج:{' '}
                    <strong className="font-mono-tabular text-slate-300">
                      {effectiveTimeline.exitStart.toFixed(1)}s – {effectiveTimeline.total.toFixed(1)}s
                    </strong>
                  </span>
                </div>
                <div
                  ref={timeReadoutRef}
                  className="font-mono-tabular text-xs font-semibold text-sky-400"
                >
                  {currentTime.toFixed(2)}s / {effectiveTimeline.total.toFixed(2)}s
                </div>
              </div>
            </div>

            {/* Playback Buttons */}
            <div className="flex items-center justify-between gap-4 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !isPlaying &&
                      playbackRef.current.currentTime >= effectiveTimeline.total - 0.05
                    ) {
                      handleReplay();
                    } else {
                      const nextPlay = !isPlaying;
                      setCurrentTime(playbackRef.current.currentTime);
                      setIsPlaying(nextPlay);
                      if (nextPlay) {
                        startLiveSfxFrom(playbackRef.current.currentTime);
                      } else {
                        stopLiveSfx();
                      }
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>إيقاف مؤقت</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>تشغيل</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleReplay}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>إعادة</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportStill}
                  className="px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Camera className="w-3.5 h-3.5 text-sky-400" />
                  <span>لقطة ثابتة PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCleanMode(true)}
                  className="px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>وضع نظيف</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Modals */}
      <ExportProgressModal
        state={exportProgress}
        onCancel={() => {
          abortExportRef.current.cancelled = true;
        }}
        onClose={() => setExportProgress(null)}
      />

      <PresetsModal
        isOpen={isPresetsOpen}
        presets={savedPresets}
        onClose={() => setIsPresetsOpen(false)}
        onSavePreset={handleSavePreset}
        onLoadPreset={handleLoadPreset}
        onDeletePreset={handleDeletePreset}
        onExportJson={handleExportPresetJson}
        onImportJson={(preset) => {
          handleLoadPreset(preset);
          setIsPresetsOpen(false);
        }}
      />
    </div>
  );
}
