export type StudioMode = 'quote' | 'phrase' | 'chat' | 'points' | 'image' | 'video';

export type QuoteStyleId =
  | 'midnight-blue'
  | 'manuscript'
  | 'modern-minimal'
  | 'glassmorphism'
  | 'documentary'
  | 'cinematic'
  | 'quote_float_glass';

export type PhraseStyleId =
  | 'calligraphy-ink'
  | 'torn-paper'
  | 'annotate'
  | 'pixel_terminal'
  | 'old_typewriter'
  | 'phrase_float_glass'
  | 'phrase_flyer';

export type ChatStyleId =
  | 'chat_modern'
  | 'chat_terminal'
  | 'chat_float_glass';

export type PointsStyleId =
  | 'pts_clean'
  | 'pts_cards'
  | 'pts_checklist'
  | 'pts_timeline'
  | 'pts_terminal'
  | 'pts_ranking'
  | 'pts_float_glass'
  | 'pts_flyer';

export type ImageStyleId =
  | 'img_polaroid'
  | 'img_browser'
  | 'img_newspaper'
  | 'img_cinematic'
  | 'img_floating'
  | 'img_spotlight'
  | 'img_float_glass';

export type VideoStyleId =
  | 'vid_crt'
  | 'vid_phone'
  | 'vid_cinematic'
  | 'vid_floating'
  | 'vid_pip'
  | 'vid_camcorder';

export type FloatingThemeVariant = 'gems' | 'glass' | 'gold';

export type FlyerCreatureId = 'orb' | 'butterfly' | 'bat' | 'firefly';

export type FlyerCricketPresetId = 'distant_soft' | 'damp_forest' | 'midnight_calm';

export type StyleId =
  | QuoteStyleId
  | PhraseStyleId
  | ChatStyleId
  | PointsStyleId
  | ImageStyleId
  | VideoStyleId;

export type VideoEndBehavior = 'freeze' | 'loop';
export type VideoPipShape = 'circle' | 'rounded-rect';

export interface VideoLayoutBox {
  x: number; // percentage 0..100 of frame width
  y: number; // percentage 0..100 of frame height
  w: number; // percentage 0..100 of frame width
  h: number; // percentage 0..100 of frame height
}

export interface VideoSourceMetadata {
  duration: number;
  codedWidth: number;
  codedHeight: number;
  displayWidth: number;
  displayHeight: number;
  rotation: 0 | 90 | 180 | 270;
  hasAudio: boolean;
  fileSizeBytes: number;
  fileName: string;
  isVfr?: boolean;
  codec?: string;
}

export type ImageFitMode = 'cover' | 'contain';

export type SpotlightShape = 'circle' | 'rectangle' | 'arrow';

export interface SpotlightRegion {
  x: number; // 0..1 normalized left
  y: number; // 0..1 normalized top
  w: number; // 0..1 normalized width
  h: number; // 0..1 normalized height
}

export type PointsMarkerType =
  | 'western'
  | 'arabic-indic'
  | 'bullets'
  | 'checks'
  | 'none';

export type TimelinePathShape =
  | 'straight'
  | 'wave'
  | 'zigzag'
  | 'circle'
  | 'stepped';

export type TimelineOrientation = 'auto' | 'horizontal' | 'vertical';

export type TimelineVerticalSide = 'auto' | 'alternating' | 'left' | 'right';

export interface PointsItem {
  id: string;
  text: string;
  nodeOffsetX?: number; // per-point node X offset in base canvas px
  nodeOffsetY?: number; // per-point node Y offset in base canvas px
  textOffsetX?: number; // per-point text X offset in base canvas px
  textOffsetY?: number; // per-point text Y offset in base canvas px
  itemScale?: number; // per-point scale multiplier (0.7..1.4, default 1.0)
}

export interface PointsTimingConfig {
  revealInterval: number; // 0.4 - 3.0s (default 1.2s, or 2.5s for pts_ranking)
  autoInterval: boolean; // ~0.2s per word, min 0.8s
  endHold: number; // 1.0 - 6.0s (default 2.0s)
  flyerRevealDuration?: number; // 0.2 - 2.0s (default 0.65s) for pts_flyer sentence wipe speed
}

export type AspectRatioFormat = '16:9' | '9:16';

export type PhrasePosition =
  | 'center'
  | 'top'
  | 'bottom'
  | 'right'
  | 'left'
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'fullscreen';

export type BackgroundMode = 'style' | 'green' | 'black';

export type AnnotationType =
  | 'auto'
  | 'underline'
  | 'circle'
  | 'highlight'
  | 'arrow'
  | 'bracket';

export type PixelDensity = 1 | 2 | 3 | 4;

export type SfxType =
  | 'whoosh'
  | 'impact'
  | 'whoosh-impact'
  | 'pop'
  | 'shutter'
  | 'slap'
  | 'key-clicks'
  | 'message-pop'
  | 'play-click'
  | 'glitch';

export interface SfxSettings {
  enabled: boolean;
  type: SfxType;
  volume: number; // 0.0 to 1.0 (default 0.6)
  offset: number; // -0.3 to +0.3s
  keywordHit: boolean;
  itemHit?: boolean; // "نقرة عند كل نقطة" in Points mode
}

export interface SceneEventTimes {
  enterStart: number;
  clipStart?: number;
  clipEnd?: number;
  keywordTimes: number[];
  annotationTimes?: number[];
  itemTimes?: number[];
  sendTimes?: number[];
  receiveTimes?: number[];
  keystrokeTimes?: number[];
  enterKeyTimes?: number[];
  lineEndTimes?: number[];
  isMechanicalTypewriter?: boolean;
}

export type ChatRole = 'user' | 'ai';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

export interface ChatTimingConfig {
  userTypingSpeed: number; // 8-30 chars/s, default 18
  aiReplySpeed: number; // 4-20 words/s, default 9
  thinkingDelay: number; // 0-10 s, default 0.9
  messageGap: number; // 0.2-3 s, default 0.4
  endHold: number; // 1-6 s, default 2
}

export type ChatTheme = 'dark' | 'light';
export type ChatAiReplyStyle = 'plain' | 'bubble';

export type QuotationMarkStyle = 'guillemets' | 'double' | 'none';

export type TextDirection = 'auto' | 'rtl' | 'ltr';
export type ResolvedTextDirection = 'rtl' | 'ltr';

export type GeometricShape = 'circle' | 'rounded-square' | 'arch';
export type MinimalTheme = 'dark' | 'light';
export type CalligraphyTheme = 'night' | 'paper';
export type CalmStyleTheme = 'dark' | 'light';

export type ArabicFontFamily =
  | 'Amiri'
  | 'Aref Ruqaa'
  | 'Aref Ruqaa Ink'
  | 'Noto Naskh Arabic'
  | 'Noto Kufi Arabic'
  | 'Cairo'
  | 'Readex Pro'
  | 'IBM Plex Sans Arabic'
  | 'Reem Kufi'
  | 'El Messiri'
  | 'Tajawal'
  | 'Lalezar'
  | 'Rakkas'
  | 'Changa'
  | 'Almarai'
  | 'Almarai Bold'
  | 'Almarai ExtraBold'
  | 'Katibeh'
  | 'KOMission Black'
  | 'Zain Rounded instance mob'
  | '29LT Azahar Display AL TN Trial Bold';

export type EnglishFontFamily =
  | 'Playfair Display'
  | 'Cormorant Garamond'
  | 'Lora'
  | 'Special Elite'
  | 'Plus Jakarta Sans'
  | 'Outfit'
  | 'Manrope'
  | 'Share Tech Mono'
  | 'VT323'
  | 'JetBrains Mono'
  | 'Oswald'
  | 'Cinzel'
  | 'Bebas Neue';

export type StudioFontFamily = ArabicFontFamily | EnglishFontFamily;

export type ExportResolution = '1080p' | '1440p' | '4K';
export type ExportFps = 30 | 60;
export type ExportQuality = 'normal' | 'high' | 'max';

export interface CropState {
  zoom: number; // 1.0 to 3.0
  offsetX: number; // -1.0 to 1.0 (normalized pan offset)
  offsetY: number; // -1.0 to 1.0 (normalized pan offset)
}

export interface QuoteContent {
  quoteText: string;
  authorName: string;
  subtitle: string;
  photoSource: HTMLImageElement | HTMLCanvasElement | null;
  photoId: string; // Unique key for caching processed images
  crop: CropState;
  quotationMarks: QuotationMarkStyle;
  chatMessages?: ChatMessage[];
  userLabel?: string;
  aiLabel?: string;
  pointsTitle?: string;
  pointsItems?: PointsItem[];
  pointsTiming?: PointsTimingConfig;
  imageSource?: HTMLImageElement | HTMLCanvasElement | null;
  imageId?: string;
  imageCrop?: CropState;
  imageCaption?: string;
  imageSourceLine?: string;
  videoPosterSource?: HTMLImageElement | HTMLCanvasElement | null;
  videoGetFrame?: (sourceTime: number) => HTMLImageElement | HTMLCanvasElement | null;
  videoId?: string;
  videoMeta?: VideoSourceMetadata | null;
  videoCrop?: CropState;
  videoCaption?: string;
  videoSourceLine?: string;
}

export interface TimelineConfig {
  enterDuration: number; // 0.5 - 8.0s
  holdDuration: number; // 2.0 - 15.0s
  exitDuration: number; // 0.5 - 2.0s
  autoHold: boolean;
}

export interface StyleLightPalette {
  textPrimary: string;
  textSecondary: string;
  accent: string;
  keyword: string;
  surfaceBg?: string;
  border?: string;
}

export interface StyleCustomization {
  mode?: StudioMode; // 'quote' | 'phrase' | 'chat' | 'points' | 'image' | 'video'
  styleId: StyleId;
  phraseStyleId?: PhraseStyleId;
  chatStyleId?: ChatStyleId;
  pointsStyleId?: PointsStyleId;
  imageStyleId?: ImageStyleId;
  videoStyleId?: VideoStyleId;
  format: AspectRatioFormat;
  position?: PhrasePosition;
  backgroundMode?: BackgroundMode;
  textDirection?: TextDirection; // 'auto' | 'rtl' | 'ltr' (default 'auto')
  accentColor: string;
  keywordColor?: string;
  annotationType?: AnnotationType;
  quoteFontOverride: StudioFontFamily | ''; // '' means use style default
  authorFontOverride: StudioFontFamily | '';
  fontSizeMultiplier: number; // 0.7 - 1.3
  minimalShape: GeometricShape; // used by Style 3 Modern Minimal
  minimalTheme?: MinimalTheme; // 'dark' | 'light' used by Style 3 Modern Minimal
  calligraphyTheme?: CalligraphyTheme; // 'night' | 'paper' used by Phrase Style 1 Calligraphy Ink
  timelineTheme?: CalmStyleTheme; // 'dark' | 'light' (Calm White Gradient) for pts_timeline
  flyerTheme?: CalmStyleTheme; // 'dark' | 'light' (Calm White Gradient) for phrase_flyer & pts_flyer
  styleTheme?: CalmStyleTheme; // 'dark' | 'light' shared alias for timeline & flyer themes
  backgroundBlur?: number; // 0 to 16px background blur
  typingSpeed?: number; // 8 to 30 chars/sec (default 18) for typing styles
  pixelDensity?: PixelDensity; // 1 (smooth), 2 (soft), 3 (medium), 4 (coarse) for pixel_terminal & chat_terminal & pts_terminal
  terminalBootLine?: boolean; // optional Latin boot line in pixel_terminal (default false)
  chatTheme?: ChatTheme; // 'dark' | 'light' for chat_modern
  chatAiReplyStyle?: ChatAiReplyStyle; // 'plain' | 'bubble' for chat_modern
  chatSwapSides?: boolean; // swap user/AI bubble sides in chat_modern
  chatUserLabel?: string; // default "أنا"
  chatAiLabel?: string; // default "الذكاء الاصطناعي"
  chatMessages?: ChatMessage[];
  chatTiming?: ChatTimingConfig;
  pointsMarkerType?: PointsMarkerType; // 'western' | 'arabic-indic' | 'bullets' | 'checks' | 'none'
  pointsHighlightCurrent?: boolean; // default true
  timelineShape?: TimelinePathShape; // 'straight' | 'wave' | 'zigzag' | 'circle' | 'stepped'
  timelineOrientation?: TimelineOrientation; // 'auto' | 'horizontal' | 'vertical'
  timelineVerticalSide?: TimelineVerticalSide; // 'auto' | 'alternating' | 'left' | 'right'
  timelineNodeScale?: number; // 0.6 to 1.6 (default 1.0)
  timelineStemScale?: number; // 0.5 to 1.8 (default 1.0)
  timelineSpread?: number; // 0.6 to 1.35 (default 1.0)
  timelineOffsetX?: number; // -0.3 to +0.3 normalized (default 0)
  timelineOffsetY?: number; // -0.3 to +0.3 normalized (default 0)
  pointsTitle?: string;
  pointsItems?: PointsItem[];
  pointsTiming?: PointsTimingConfig;
  imageFit?: ImageFitMode; // 'cover' | 'contain'
  imageScale?: number; // 0.6 to 1.2 (60-120% of the region, default 1.0)
  imagePushIn?: boolean; // slow push-in (1.0 -> 1.08)
  imageCaption?: string; // optional caption (supports *keyword*)
  imageSourceLine?: string; // optional small source line ("المصدر: ...")
  newspaperKeepColor?: boolean; // toggle to keep color in img_newspaper (default false = B&W halftone)
  cinematicGrade?: boolean; // optional teal-and-orange grade in img_cinematic & vid_cinematic
  spotlightRegion?: SpotlightRegion; // normalized { x, y, w, h } in [0, 1]
  spotlightShape?: SpotlightShape; // 'circle' | 'rectangle' | 'arrow'
  videoBox?: VideoLayoutBox; // single percentage layout box { x, y, w, h } (0..100)
  videoAllowOutOfMargin?: boolean; // default false -> clamped inside 6% safe area
  videoAspectLock?: boolean; // default true when dragging corner handles
  videoAdaptFrameToClip?: boolean; // default true ("تكييف الإطار حسب المقطع")
  videoFit?: ImageFitMode; // 'contain' (default) | 'cover'
  videoScale?: number; // 0.3 to 1.2 (30% - 120%)
  videoTrimIn?: number; // seconds
  videoTrimOut?: number; // seconds
  videoDurationSec?: number; // cached source duration in seconds for timeline computation
  videoSpeed?: number; // 0.5 to 2.0 (default 1.0)
  videoEndBehavior?: VideoEndBehavior; // 'freeze' (default) | 'loop'
  videoAudioEnabled?: boolean; // default true (muted when speed !== 1)
  videoAudioVolume?: number; // 0.0 to 1.0 (default 0.85)
  videoCustomDurationEnabled?: boolean; // default false
  videoCustomDuration?: number; // seconds (middle span override when customDurationEnabled)
  videoCaption?: string; // optional caption (supports *keyword*)
  videoSourceLine?: string; // optional small source line
  videoPipShape?: VideoPipShape; // 'circle' | 'rounded-rect'
  videoPipNameTag?: string; // optional name badge in vid_pip
  showFloatingObjects?: boolean; // toggle surrounding 3D floating objects (default true)
  flyerCreature?: FlyerCreatureId; // 'orb' | 'butterfly' | 'bat' | 'firefly' (default 'orb')
  flyerFlightSpeed?: number; // 0.25 to 1.25 (default 0.55 = calm slow continuous flight)
  flyerCustomColor?: boolean; // whether the user manually customized the flyer accent color
  flyerCricketEnabled?: boolean; // quiet ambient cricket sound in phrase_flyer & pts_flyer
  flyerCricketPreset?: FlyerCricketPresetId; // 'distant_soft' | 'damp_forest' | 'midnight_calm'
  flyerCricketVolume?: number; // 0.05 to 1.0 (default 0.35)
  greenScreen: boolean; // replaces background with solid #00FF00 (synced with backgroundMode === 'green')
  seed: number; // deterministic seed for particles/grain
}

export interface ExportSettings {
  resolution: ExportResolution;
  fps: ExportFps;
  quality: ExportQuality;
  endPadding: boolean; // 0.4s padding at the end
  quickTest: boolean; // exports first 3 seconds only
  audioFile: File | null;
  audioVolume: number; // 0.0 to 1.0
}

export interface RenderSize {
  width: number; // actual target pixel width (e.g. 1920, 2560, 3840)
  height: number; // actual target pixel height (e.g. 1080, 1440, 2160)
  baseWidth: number; // 1920 for 16:9, 1080 for 9:16
  baseHeight: number; // 1080 for 16:9, 1920 for 1920
  scale: number; // width / baseWidth
}

export interface StyleMetadata {
  id: StyleId;
  mode?: StudioMode;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  defaultAccent: string;
  defaultKeywordColor?: string;
  defaultQuoteFont: ArabicFontFamily;
  defaultAuthorFont: ArabicFontFamily;
  defaultEnglishQuoteFont?: EnglishFontFamily;
  defaultEnglishAuthorFont?: EnglishFontFamily;
  supportedBackgrounds?: BackgroundMode[];
  recommendedBackground?: BackgroundMode;
  lightPalette?: StyleLightPalette;
  allowedFonts?: ArabicFontFamily[];
  allowedEnglishFonts?: EnglishFontFamily[];
  supportedMarkerTypes?: PointsMarkerType[];
  defaultMarkerType?: PointsMarkerType;
  defaultImageFit?: ImageFitMode;
}

export interface StudioPreset {
  id: string;
  name: string;
  createdAt: string;
  mode?: StudioMode;
  phraseText?: string;
  chatMessages?: ChatMessage[];
  chatUserLabel?: string;
  chatAiLabel?: string;
  chatTiming?: ChatTimingConfig;
  pointsTitle?: string;
  pointsItems?: PointsItem[];
  pointsTiming?: PointsTimingConfig;
  pointsMarkerType?: PointsMarkerType;
  pointsHighlightCurrent?: boolean;
  timelineShape?: TimelinePathShape;
  timelineOrientation?: TimelineOrientation;
  timelineVerticalSide?: TimelineVerticalSide;
  timelineNodeScale?: number;
  timelineStemScale?: number;
  timelineSpread?: number;
  timelineOffsetX?: number;
  timelineOffsetY?: number;
  imageCaption?: string;
  imageSourceLine?: string;
  imageFit?: ImageFitMode;
  imageScale?: number;
  imagePushIn?: boolean;
  newspaperKeepColor?: boolean;
  cinematicGrade?: boolean;
  spotlightRegion?: SpotlightRegion;
  spotlightShape?: SpotlightShape;
  showFloatingObjects?: boolean;
  flyerCreature?: FlyerCreatureId;
  flyerFlightSpeed?: number;
  flyerCricketEnabled?: boolean;
  flyerCricketPreset?: FlyerCricketPresetId;
  flyerCricketVolume?: number;
  timelineTheme?: CalmStyleTheme;
  flyerTheme?: CalmStyleTheme;
  styleTheme?: CalmStyleTheme;
  videoStyleId?: VideoStyleId;
  videoBox?: VideoLayoutBox;
  videoAllowOutOfMargin?: boolean;
  videoAspectLock?: boolean;
  videoAdaptFrameToClip?: boolean;
  videoFit?: ImageFitMode;
  videoScale?: number;
  videoCrop?: CropState;
  videoTrimIn?: number;
  videoTrimOut?: number;
  videoSpeed?: number;
  videoEndBehavior?: VideoEndBehavior;
  videoAudioEnabled?: boolean;
  videoAudioVolume?: number;
  videoCustomDurationEnabled?: boolean;
  videoCustomDuration?: number;
  videoCaption?: string;
  videoSourceLine?: string;
  videoPipShape?: VideoPipShape;
  videoPipNameTag?: string;
  timeline: TimelineConfig;
  customization: StyleCustomization;
  exportSettings: Omit<ExportSettings, 'audioFile'>;
  quotationMarks: QuotationMarkStyle;
  sfxSettings?: SfxSettings;
}

export type PureStyleRenderer = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  t: number,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
) => void;

