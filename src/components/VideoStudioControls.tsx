import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Film,
  Lock,
  Maximize2,
  RotateCcw,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  CropState,
  PhrasePosition,
  StyleCustomization,
  VideoLayoutBox,
  VideoPipShape,
  VideoSourceMetadata,
  VideoStyleId,
} from '../types';
import {
  clamp,
  clampVideoBoxToSafeMargin,
  computeVideoTimeline,
  DEFAULT_VIDEO_BOX,
  DEFAULT_VIDEO_DURATION,
  getDefaultVideoBoxForPosition,
  isGreenishColor,
  resolveBackgroundMode,
  scaleVideoBoxFromBase,
} from '../utils/math';
import { parseKeywordMarkup } from '../utils/textLayout';
import { formatVideoTimeSeconds } from '../utils/videoSource';

interface VideoUploadAndClipControlsProps {
  customization: StyleCustomization;
  setCustomization: React.Dispatch<React.SetStateAction<StyleCustomization>>;
  videoMeta: VideoSourceMetadata | null;
  videoThumbnails: HTMLCanvasElement[];
  videoLoading: boolean;
  videoLoadError: string | null;
  videoSoftWarning: string | null;
  videoGreenRatio: number;
  onSelectVideoFile: (file: File) => void;
  onClearVideoFile: () => void;
}

export const VideoUploadAndClipControls: React.FC<VideoUploadAndClipControlsProps> = ({
  customization,
  setCustomization,
  videoMeta,
  videoThumbnails,
  videoLoading,
  videoLoadError,
  videoSoftWarning,
  videoGreenRatio,
  onSelectVideoFile,
  onClearVideoFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const duration =
    videoMeta?.duration && videoMeta.duration > 0
      ? videoMeta.duration
      : customization.videoDurationSec || DEFAULT_VIDEO_DURATION;
  const trimIn = clamp(customization.videoTrimIn ?? 0, 0, Math.max(0, duration - 0.1));
  const trimOut = clamp(customization.videoTrimOut ?? duration, trimIn + 0.1, duration);
  const speed = clamp(customization.videoSpeed ?? 1.0, 0.5, 2.0);
  const speedIsNormal = Math.abs(speed - 1.0) < 0.01;
  const bgMode = resolveBackgroundMode(customization);
  const isGreen = bgMode === 'green';

  const parsedCaptionKeywords = parseKeywordMarkup(customization.videoCaption || '');

  const handleFilePick = (file: File | undefined | null) => {
    if (!file) return;
    onSelectVideoFile(file);
  };

  return (
    <div className="space-y-4" data-testid="video-upload-and-clip-controls">
      {/* Upload / Drag-Drop Box */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingFile(true);
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingFile(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) handleFilePick(dropped);
        }}
        className={`rounded-xl border border-dashed p-3.5 transition-colors ${
          isDraggingFile
            ? 'border-sky-400 bg-sky-500/10'
            : 'border-slate-700 bg-slate-950/90 hover:border-slate-600'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          data-testid="video-file-input"
          accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(e) => {
            handleFilePick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
              <Film className="w-4 h-4 text-sky-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {videoMeta ? videoMeta.fileName : 'اختر أو اسحب مقطع فيديو (MP4 / MOV / WEBM)'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {videoMeta
                  ? `${videoMeta.displayWidth}×${videoMeta.displayHeight} · ${formatVideoTimeSeconds(videoMeta.duration)} · ${(videoMeta.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB${videoMeta.rotation ? ` · دوران ${videoMeta.rotation}°` : ''} · ${videoMeta.hasAudio ? 'يحتوي صوتاً' : 'بدون صوت'}`
                  : 'يعرض مقطعاً تجريبياً افتراضياً حتى ترفع ملفك الخاص (لا يُحفظ الملف في القوالب)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="btn-upload-video"
              disabled={videoLoading}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{videoLoading ? 'جارٍ القراءة...' : videoMeta ? 'تغيير' : 'رفع فيديو'}</span>
            </button>
            {videoMeta && (
              <button
                type="button"
                data-testid="btn-clear-video"
                onClick={onClearVideoFile}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                إزالة
              </button>
            )}
          </div>
        </div>
      </div>

      {videoLoadError && (
        <div
          data-testid="video-decode-error"
          className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-200"
        >
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{videoLoadError}</span>
        </div>
      )}

      {videoSoftWarning && (
        <div
          data-testid="video-soft-warning"
          className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-200"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{videoSoftWarning}</span>
        </div>
      )}

      {isGreen && videoGreenRatio > 0.08 && (
        <div
          data-testid="video-green-poster-warning"
          className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-200"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            تنبيه الكروما: يحتوي الإطار التمثيلي على أكثر من {Math.round(videoGreenRatio * 100)}% درجات خضراء، مما قد يتأثر عند إزالة الخلفية الخضراء (#00FF00).
          </span>
        </div>
      )}

      {/* Cached Thumbnail Strip + Dual Trim In/Out Sliders */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-200">قص المقطع (Trim In / Out)</span>
          <span className="font-mono-tabular text-sky-400">
            {formatVideoTimeSeconds(trimIn)} — {formatVideoTimeSeconds(trimOut)} (
            {(trimOut - trimIn).toFixed(1)} ث)
          </span>
        </div>

        {/* Visual Thumbnail Strip */}
        <div className="relative h-12 rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex">
          {videoThumbnails.length > 0 ? (
            videoThumbnails.map((thumbCanvas, idx) => (
              <img
                key={idx}
                src={thumbCanvas.toDataURL('image/jpeg', 0.65)}
                alt=""
                className="h-full flex-1 object-cover pointer-events-none select-none"
              />
            ))
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-500 bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900">
              معاينة شريط المقطع الافتراضي (0.0 – {duration.toFixed(1)} ث)
            </div>
          )}
          {/* Active trimmed window highlight */}
          <div
            className="absolute inset-y-0 border-x-2 border-sky-400 bg-sky-400/10 pointer-events-none"
            style={{
              left: `${(trimIn / Math.max(0.1, duration)) * 100}%`,
              right: `${Math.max(0, 100 - (trimOut / Math.max(0.1, duration)) * 100)}%`,
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>بداية القص (In)</span>
              <span className="font-mono-tabular text-slate-200">{trimIn.toFixed(1)} ث</span>
            </div>
            <input
              type="range"
              data-testid="slider-video-trim-in"
              min={0}
              max={Math.max(0, trimOut - 0.1)}
              step={0.1}
              value={trimIn}
              onChange={(e) => {
                const nextIn = clamp(parseFloat(e.target.value), 0, Math.max(0, trimOut - 0.1));
                setCustomization((c) => ({ ...c, videoTrimIn: Number(nextIn.toFixed(2)) }));
              }}
              className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>نهاية القص (Out)</span>
              <span className="font-mono-tabular text-slate-200">{trimOut.toFixed(1)} ث</span>
            </div>
            <input
              type="range"
              data-testid="slider-video-trim-out"
              min={Math.min(duration, trimIn + 0.1)}
              max={duration}
              step={0.1}
              value={trimOut}
              onChange={(e) => {
                const nextOut = clamp(parseFloat(e.target.value), Math.min(duration, trimIn + 0.1), duration);
                setCustomization((c) => ({ ...c, videoTrimOut: Number(nextOut.toFixed(2)) }));
              }}
              className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Speed + End Behavior + Clip Audio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Speed Slider */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">سرعة التشغيل</span>
            <span className="font-mono-tabular font-bold text-sky-400">{speed.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            data-testid="slider-video-speed"
            min={0.5}
            max={2.0}
            step={0.05}
            value={speed}
            onChange={(e) =>
              setCustomization((c) => ({
                ...c,
                videoSpeed: parseFloat(e.target.value),
              }))
            }
            className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>0.5x أبطأ</span>
            <button
              type="button"
              onClick={() => setCustomization((c) => ({ ...c, videoSpeed: 1.0 }))}
              className="text-sky-400 hover:underline"
            >
              1.0x عادي
            </button>
            <span>2.0x أسرع</span>
          </div>
        </div>

        {/* End Behavior (Freeze vs Loop) */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
          <span className="block text-xs font-semibold text-slate-200">
            عند انتهاء المقطع قبل التايملاين
          </span>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 rounded-lg">
            <button
              type="button"
              data-testid="btn-video-end-freeze"
              onClick={() => setCustomization((c) => ({ ...c, videoEndBehavior: 'freeze' }))}
              className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors ${
                (customization.videoEndBehavior || 'freeze') === 'freeze'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              تجميد آخر إطار
            </button>
            <button
              type="button"
              data-testid="btn-video-end-loop"
              onClick={() => setCustomization((c) => ({ ...c, videoEndBehavior: 'loop' }))}
              className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors ${
                customization.videoEndBehavior === 'loop'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              تكرار (Loop)
            </button>
          </div>
        </div>
      </div>

      {/* Clip Audio Toggle & Volume (auto-muted when speed != 1) */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-200">
            <input
              type="checkbox"
              data-testid="checkbox-video-audio"
              disabled={!speedIsNormal || videoMeta?.hasAudio === false}
              checked={speedIsNormal && (customization.videoAudioEnabled ?? true) && videoMeta?.hasAudio !== false}
              onChange={(e) =>
                setCustomization((c) => ({ ...c, videoAudioEnabled: e.target.checked }))
              }
              className="rounded accent-sky-400 w-4 h-4"
            />
            {speedIsNormal && (customization.videoAudioEnabled ?? true) && videoMeta?.hasAudio !== false ? (
              <Volume2 className="w-4 h-4 text-sky-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
            <span>تضمين صوت المقطع الأصلي</span>
          </label>
          <span className="font-mono-tabular text-xs text-slate-400">
            {Math.round((customization.videoAudioVolume ?? 0.85) * 100)}%
          </span>
        </div>

        {!speedIsNormal ? (
          <p className="text-[11px] text-amber-300">
            تم كتم صوت المقطع تلقائياً لأن سرعة التشغيل ({speed.toFixed(2)}x) تختلف عن 1.0x.
          </p>
        ) : videoMeta?.hasAudio === false ? (
          <p className="text-[11px] text-slate-400">
            هذا الملف لا يحتوي على مسار صوتي.
          </p>
        ) : (
          <input
            type="range"
            data-testid="slider-video-audio-volume"
            min={0}
            max={1}
            step={0.05}
            disabled={!(customization.videoAudioEnabled ?? true)}
            value={customization.videoAudioVolume ?? 0.85}
            onChange={(e) =>
              setCustomization((c) => ({
                ...c,
                videoAudioVolume: parseFloat(e.target.value),
              }))
            }
            className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-40"
          />
        )}
      </div>

      {/* Optional Caption & Source Line */}
      <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="video-caption-input" className="text-xs font-semibold text-slate-200">
              تعليق اختياري مع الفيديو (يدعم تمييز *الكلمة* والتشكيل)
            </label>
          </div>
          <textarea
            id="video-caption-input"
            data-testid="input-video-caption"
            rows={2}
            dir="auto"
            value={customization.videoCaption ?? ''}
            onChange={(e) =>
              setCustomization((c) => ({ ...c, videoCaption: e.target.value }))
            }
            placeholder="اتركه فارغاً بدون تعليق، أو اكتب مثلاً: لحظة *استثنائية* من التوثيق..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 resize-none"
          />
          {parsedCaptionKeywords.keywordGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              {parsedCaptionKeywords.keywordGroups.map((kw: string, i: number) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-300 font-semibold"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="video-source-input" className="block text-xs font-semibold text-slate-300">
            سطر المصدر (اختياري)
          </label>
          <input
            id="video-source-input"
            data-testid="input-video-source"
            type="text"
            dir="auto"
            value={customization.videoSourceLine ?? ''}
            onChange={(e) =>
              setCustomization((c) => ({ ...c, videoSourceLine: e.target.value }))
            }
            placeholder="مثال: المصدر: أرشيف الاستوديو"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
          />
        </div>
      </div>
    </div>
  );
};

interface VideoLayoutAndStyleControlsProps {
  activeStyleId: VideoStyleId;
  customization: StyleCustomization;
  setCustomization: React.Dispatch<React.SetStateAction<StyleCustomization>>;
  videoCrop: CropState;
  setVideoCrop: React.Dispatch<React.SetStateAction<CropState>>;
  onSelectQuickPosition: (pos: PhrasePosition) => void;
}

const VIDEO_QUICK_POSITIONS: { id: PhrasePosition; labelAr: string }[] = [
  { id: 'center', labelAr: 'وسط' },
  { id: 'right', labelAr: 'يمين' },
  { id: 'left', labelAr: 'يسار' },
  { id: 'fullscreen', labelAr: 'ملء الشاشة' },
  { id: 'top-right', labelAr: 'أعلى يمين' },
  { id: 'top-left', labelAr: 'أعلى يسار' },
  { id: 'bottom-right', labelAr: 'أسفل يمين' },
  { id: 'bottom-left', labelAr: 'أسفل يسار' },
];

export const VideoLayoutAndStyleControls: React.FC<VideoLayoutAndStyleControlsProps> = ({
  activeStyleId,
  customization,
  setCustomization,
  videoCrop,
  setVideoCrop,
  onSelectQuickPosition,
}) => {
  const allowOut = Boolean(customization.videoAllowOutOfMargin);
  const box = clampVideoBoxToSafeMargin(customization.videoBox || DEFAULT_VIDEO_BOX, allowOut);
  const scaleRatio = customization.videoScale ?? 1.0;
  const fitMode = customization.videoFit || 'contain';
  const aspectLock = customization.videoAspectLock !== false;
  const adaptFrame = customization.videoAdaptFrameToClip !== false;
  const isVerticalFormat = customization.format === '9:16';

  const updateBoxField = (field: keyof VideoLayoutBox, rawVal: number) => {
    if (!Number.isFinite(rawVal)) return;
    setCustomization((c) => {
      const cur = c.videoBox || DEFAULT_VIDEO_BOX;
      const next = clampVideoBoxToSafeMargin({ ...cur, [field]: rawVal }, Boolean(c.videoAllowOutOfMargin));
      return { ...c, videoBox: next };
    });
  };

  const handleScaleChange = (newScale: number) => {
    setCustomization((c) => {
      const base = getDefaultVideoBoxForPosition(c.position || 'center', c.format);
      const nextBox = scaleVideoBoxFromBase(base, newScale, Boolean(c.videoAllowOutOfMargin));
      return {
        ...c,
        videoScale: newScale,
        videoBox: nextBox,
      };
    });
  };

  const handleResetLayout = () => {
    setCustomization((c) => {
      const nextBox = getDefaultVideoBoxForPosition('center', c.format);
      return {
        ...c,
        position: 'center',
        videoBox: nextBox,
        videoScale: 1.0,
        videoAspectLock: true,
        videoAdaptFrameToClip: true,
        videoAllowOutOfMargin: false,
        videoFit: 'contain',
        backgroundMode: 'green',
        greenScreen: true,
      };
    });
    setVideoCrop({ zoom: 1, offsetX: 0, offsetY: 0 });
  };

  const bgMode = resolveBackgroundMode(customization);
  const accentIsGreen = isGreenishColor(customization.accentColor);
  const kwIsGreen = Boolean(customization.keywordColor && isGreenishColor(customization.keywordColor));

  return (
    <div className="space-y-4" data-testid="video-layout-controls">
      {/* Style-Specific Video Controls */}
      {activeStyleId === 'vid_cinematic' && (
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
            data-testid="checkbox-video-cinematic-grade"
            checked={customization.cinematicGrade !== false}
            onChange={(e) =>
              setCustomization((c) => ({ ...c, cinematicGrade: e.target.checked }))
            }
            className="rounded accent-sky-400 w-4 h-4"
          />
        </label>
      )}

      {activeStyleId === 'vid_pip' && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2.5">
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-slate-200">
              شكل إطار صورة داخل صورة (PiP Shape)
            </span>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 rounded-lg">
              {(
                [
                  { id: 'circle' as VideoPipShape, label: 'دائري (Circle)' },
                  { id: 'rounded-rect' as VideoPipShape, label: 'مستطيل دائري' },
                ]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`btn-pip-shape-${opt.id}`}
                  onClick={() => setCustomization((c) => ({ ...c, videoPipShape: opt.id }))}
                  className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors ${
                    (customization.videoPipShape || 'circle') === opt.id
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="pip-name-tag" className="block text-xs font-semibold text-slate-300">
              شارة الاسم على الإطار (اختياري)
            </label>
            <input
              id="pip-name-tag"
              type="text"
              data-testid="input-pip-name-tag"
              value={customization.videoPipNameTag ?? ''}
              onChange={(e) =>
                setCustomization((c) => ({ ...c, videoPipNameTag: e.target.value }))
              }
              placeholder="مثال: أحمد / المعلّق"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
            />
          </div>
        </div>
      )}

      {/* Quick Position Presets */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">
            موضع الصندوق السريع (نسبة مئوية %)
          </span>
          <button
            type="button"
            data-testid="btn-video-layout-reset"
            onClick={handleResetLayout}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>إعادة ضبط</span>
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {VIDEO_QUICK_POSITIONS.map((p) => {
            const disabled = isVerticalFormat && (p.id === 'left' || p.id === 'right');
            const selected = (customization.position || 'center') === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                data-testid={`btn-video-pos-${p.id}`}
                onClick={() => onSelectQuickPosition(p.id)}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                  disabled
                    ? 'opacity-35 cursor-not-allowed bg-slate-900 text-slate-600'
                    : selected
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                {p.labelAr}
              </button>
            );
          })}
        </div>
        {isVerticalFormat && (
          <p className="text-[11px] text-slate-400">
            ملاحظة: موضعا اليمين واليسار معطلان في المقاس الطولي 9:16 لضمان مساحة عرض مريحة.
          </p>
        )}
      </div>

      {/* Size Slider 30% - 120% + Numeric X/Y/W/H */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">حجم الصندوق (30% – 120%)</span>
            <span className="font-mono-tabular font-bold text-sky-400">
              {Math.round(scaleRatio * 100)}%
            </span>
          </div>
          <input
            type="range"
            data-testid="slider-video-box-scale"
            min={0.3}
            max={1.2}
            step={0.02}
            value={scaleRatio}
            onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
            className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {(
            [
              { key: 'x' as const, label: 'X %' },
              { key: 'y' as const, label: 'Y %' },
              { key: 'w' as const, label: 'W %' },
              { key: 'h' as const, label: 'H %' },
            ]
          ).map((fld) => (
            <div key={fld.key} className="space-y-1">
              <label className="block text-[10px] font-semibold text-slate-400 text-center">
                {fld.label}
              </label>
              <input
                type="number"
                data-testid={`input-video-box-${fld.key}`}
                step={0.5}
                value={Number(box[fld.key].toFixed(1))}
                onChange={(e) => updateBoxField(fld.key, parseFloat(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-center font-mono-tabular text-white focus:outline-none focus:border-sky-400"
              />
            </div>
          ))}
        </div>

        <p className="text-[11px] text-slate-400">
          يمكنك سحب الصندوق مباشرة على المعاينة أو سحب مقابض الزوايا لتغيير الحجم مع خطوط المحاذاة المغناطيسية.
        </p>
      </div>

      {/* Adaptive Frame, Aspect Lock, Out-of-Margin Toggles */}
      <div className="space-y-2">
        <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 cursor-pointer">
          <div className="flex items-center gap-2">
            <Maximize2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <div>
              <span className="block text-xs font-semibold text-slate-200">
                تكييف الإطار حسب المقطع
              </span>
              <span className="block text-[10px] text-slate-400">
                يأخذ الإطار نسبة أبعاد الفيديو تلقائياً (طولي / مربع / عرضي) بدون أشرطة زائدة
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            data-testid="checkbox-video-adapt-frame"
            checked={adaptFrame}
            onChange={(e) =>
              setCustomization((c) => ({ ...c, videoAdaptFrameToClip: e.target.checked }))
            }
            className="rounded accent-sky-400 w-4 h-4 shrink-0"
          />
        </label>

        <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 cursor-pointer">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-200">
              قفل نسبة الصندوق عند سحب الزوايا
            </span>
          </div>
          <input
            type="checkbox"
            data-testid="checkbox-video-aspect-lock"
            checked={aspectLock}
            onChange={(e) =>
              setCustomization((c) => ({ ...c, videoAspectLock: e.target.checked }))
            }
            className="rounded accent-sky-400 w-4 h-4 shrink-0"
          />
        </label>

        <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 cursor-pointer">
          <span className="text-xs font-semibold text-slate-200">
            السماح بالخروج عن الهامش الآمن (6%)
          </span>
          <input
            type="checkbox"
            data-testid="checkbox-video-out-of-margin"
            checked={allowOut}
            onChange={(e) =>
              setCustomization((c) => {
                const nextAllow = e.target.checked;
                return {
                  ...c,
                  videoAllowOutOfMargin: nextAllow,
                  videoBox: clampVideoBoxToSafeMargin(c.videoBox || DEFAULT_VIDEO_BOX, nextAllow),
                };
              })
            }
            className="rounded accent-sky-400 w-4 h-4 shrink-0"
          />
        </label>
      </div>

      {/* Fit Mode (Contain vs Cover) + Pan/Zoom inside Screen */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2.5">
        <span className="block text-xs font-semibold text-slate-200">
          ملاءمة الفيديو داخل الشاشة (بدون تمديد)
        </span>
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 rounded-lg">
          <button
            type="button"
            data-testid="btn-video-fit-contain"
            onClick={() => setCustomization((c) => ({ ...c, videoFit: 'contain' }))}
            className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors ${
              fitMode === 'contain'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            احتواء كامل (Contain)
          </button>
          <button
            type="button"
            data-testid="btn-video-fit-cover"
            onClick={() => setCustomization((c) => ({ ...c, videoFit: 'cover' }))}
            className={`py-1.5 px-2 rounded-md text-xs font-semibold transition-colors ${
              fitMode === 'cover'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ملء الإطار (Cover)
          </button>
        </div>

        {(fitMode === 'cover' || videoCrop.zoom > 1.01) && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">تكبير وموضع القص (Zoom 1x – 2x)</span>
              <span className="font-mono-tabular text-sky-400">
                {videoCrop.zoom.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              data-testid="slider-video-crop-zoom"
              min={1.0}
              max={2.0}
              step={0.05}
              value={clamp(videoCrop.zoom, 1, 2)}
              onChange={(e) =>
                setVideoCrop((prev) => ({
                  ...prev,
                  zoom: parseFloat(e.target.value),
                }))
              }
              className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>في وضع الملء يمكنك السحب داخل الشاشة لتحريك القص</span>
              <button
                type="button"
                onClick={() => setVideoCrop({ zoom: 1, offsetX: 0, offsetY: 0 })}
                className="text-sky-400 hover:underline shrink-0"
              >
                توسيط القص
              </button>
            </div>
          </div>
        )}
      </div>

      {bgMode === 'green' && (accentIsGreen || kwIsGreen) && (
        <div
          data-testid="video-green-accent-warning"
          className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-200"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            تنبيه الكروما: لون التمييز أو الكلمة المفتاحية المحدد يقع في النطاق الأخضر وقد يختفي مع الخلفية الخضراء (#00FF00).
          </span>
        </div>
      )}
    </div>
  );
};

interface VideoTimingSummaryControlsProps {
  customization: StyleCustomization;
  setCustomization: React.Dispatch<React.SetStateAction<StyleCustomization>>;
  videoMeta: VideoSourceMetadata | null;
}

export const VideoTimingSummaryControls: React.FC<VideoTimingSummaryControlsProps> = ({
  customization,
  setCustomization,
  videoMeta,
}) => {
  const duration =
    videoMeta?.duration && videoMeta.duration > 0
      ? videoMeta.duration
      : customization.videoDurationSec || DEFAULT_VIDEO_DURATION;
  const vt = computeVideoTimeline({
    videoDuration: duration,
    trimIn: customization.videoTrimIn ?? 0,
    trimOut: customization.videoTrimOut ?? duration,
    speed: customization.videoSpeed ?? 1.0,
    customDurationEnabled: customization.videoCustomDurationEnabled,
    customDuration: customization.videoCustomDuration,
  });

  return (
    <div className="space-y-3" data-testid="video-timing-controls">
      <div className="grid grid-cols-3 gap-2 text-center bg-slate-950 border border-slate-800 rounded-xl p-2.5">
        <div>
          <span className="block text-[10px] text-slate-400">الدخول</span>
          <span className="font-mono-tabular text-xs font-bold text-white">{vt.enter.toFixed(1)} ث</span>
        </div>
        <div>
          <span className="block text-[10px] text-slate-400">عرض الفيديو</span>
          <span className="font-mono-tabular text-xs font-bold text-sky-400">{vt.hold.toFixed(1)} ث</span>
        </div>
        <div>
          <span className="block text-[10px] text-slate-400">الخروج</span>
          <span className="font-mono-tabular text-xs font-bold text-white">{vt.exit.toFixed(1)} ث</span>
        </div>
      </div>

      <label className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 cursor-pointer">
        <div>
          <span className="block text-xs font-semibold text-slate-200">
            تحديد مدة عرض مخصصة (بدل التلقائي)
          </span>
          <span className="block text-[10px] text-slate-400">
            المدة التلقائية الحالية حسب القص والسرعة: {vt.naturalSpan.toFixed(1)} ث
          </span>
        </div>
        <input
          type="checkbox"
          data-testid="checkbox-video-custom-duration"
          checked={Boolean(customization.videoCustomDurationEnabled)}
          onChange={(e) =>
            setCustomization((c) => ({
              ...c,
              videoCustomDurationEnabled: e.target.checked,
              videoCustomDuration: c.videoCustomDuration ?? vt.naturalSpan,
            }))
          }
          className="rounded accent-sky-400 w-4 h-4 shrink-0"
        />
      </label>

      {customization.videoCustomDurationEnabled && (
        <div className="space-y-1 bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300">مدة عرض المقطع المخصصة</span>
            <span className="font-mono-tabular font-bold text-sky-400">
              {(customization.videoCustomDuration ?? vt.naturalSpan).toFixed(1)} ث
            </span>
          </div>
          <input
            type="range"
            data-testid="slider-video-custom-duration"
            min={1.0}
            max={60.0}
            step={0.5}
            value={customization.videoCustomDuration ?? vt.naturalSpan}
            onChange={(e) =>
              setCustomization((c) => ({
                ...c,
                videoCustomDuration: parseFloat(e.target.value),
              }))
            }
            className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      )}

      <div className="flex items-center justify-between text-xs bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
        <span className="text-slate-300 font-semibold">إجمالي مدة الفيديو النهائي</span>
        <span data-testid="video-total-duration" className="font-mono-tabular font-bold text-emerald-400">
          {vt.total.toFixed(2)} ثانية
        </span>
      </div>
    </div>
  );
};
