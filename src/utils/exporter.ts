import { ArrayBufferTarget, FileSystemWritableFileStreamTarget, Muxer } from 'mp4-muxer';
import {
   getSceneEventTimes,
  isFlyerStyleId,
  renderQuoteFrame,
  resolveActiveStyleId,
  resolveFlyerCreature,
} from '../styles';
import {
  ExportResolution,
  ExportSettings,
  QuoteContent,
  SfxSettings,
  StyleCustomization,
  TimelineConfig,
} from '../types';
import {
  clamp,
  computeVideoSourceTime,
  computeVideoTimeline,
  DEFAULT_VIDEO_DURATION,
  getEffectiveTimeline,
  getRenderSize,
  getTargetBitrate,
  getTypingConfigForCustomization,
  resolveBackgroundMode,
  videoBoxToPixels,
} from './math';
import {
  hasFlyerCricketAudio,
  renderOfflineAudioMix,
  resolveFlyerCricketPreset,
  resolveFlyerCricketVolume,
} from './sfx';
import { ensureArabicFontsLoaded } from './textLayout';
import { createVideoExportDecoder, getDefaultVideoPosterCanvas } from './videoSource';

export interface ExportProgressState {
  status: 'preparing' | 'rendering' | 'encoding-audio' | 'finalizing' | 'completed' | 'cancelled' | 'error';
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  estimatedRemainingSeconds: number | null;
  fileSizeBytes?: number;
  durationSeconds?: number;
  fileName?: string;
  audioSkippedNotice?: string;
  errorMessage?: string;
}

const H264_CODEC_CANDIDATES = [
  'avc1.640033', // High Profile Level 5.1 (supports 4K@60)
  'avc1.640032', // High Profile Level 5.0
  'avc1.64002a', // High Profile Level 4.2 (1080p@60)
  'avc1.640028', // High Profile Level 4.0 (1080p@30)
  'avc1.4d0032', // Main Profile Level 5.0
  'avc1.4d002a', // Main Profile Level 4.2
  'avc1.4d0028', // Main Profile Level 4.0
  'avc1.420028', // Baseline Profile Level 4.0
  'avc1.42001f', // Baseline Profile Level 3.1
];

/**
 * Formats the export file name according to specification:
 * - Quote mode: quote-{style}-{bg}-{res}.{ext}
 * - Phrase mode: phrase-{style}-{bg}-{position}-{res}.{ext}
 * - Chat mode: chat-{style}-{bg}-{position}-{res}.{ext}
 */
export function buildExportFileName(
  custom: StyleCustomization,
  resolution: ExportResolution,
  ext: 'mp4' | 'webm' | 'png'
): string {
  const mode = custom.mode || 'quote';
  const styleId = resolveActiveStyleId(custom);
  const bg = resolveBackgroundMode(custom);
  const creatureSeg = isFlyerStyleId(styleId)
    ? `-${resolveFlyerCreature(custom.flyerCreature)}`
    : '';
  if (mode === 'video') {
    const pos = custom.position || 'center';
    return `video-${styleId}-${bg}-${pos}-${resolution}.${ext}`;
  }
  if (mode === 'image') {
    const pos = custom.position || 'center';
    return `image-${styleId}-${bg}-${pos}-${resolution}.${ext}`;
  }
  if (mode === 'points') {
    const pos = custom.position || 'center';
    return `points-${styleId}${creatureSeg}-${bg}-${pos}-${resolution}.${ext}`;
  }
  if (mode === 'chat') {
    const pos = custom.position || 'center';
    return `chat-${styleId}-${bg}-${pos}-${resolution}.${ext}`;
  }
  if (mode === 'phrase') {
    const pos = custom.position || 'center';
    return `phrase-${styleId}${creatureSeg}-${bg}-${pos}-${resolution}.${ext}`;
  }
  return `quote-${styleId}-${bg}-${resolution}.${ext}`;
}

/**
 * Checks if WebCodecs H.264 VideoEncoder is supported in the current browser for the given resolution/fps.
 * Configures BT.709 limited range color space where supported so #00FF00 and #000000 stay exact.
 */
export async function findSupportedH264Config(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return null;
  }

  for (const codec of H264_CODEC_CANDIDATES) {
    const bt709Candidate: VideoEncoderConfig & {
      colorSpace?: VideoColorSpaceInit;
    } = {
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
      bitrateMode: 'variable',
      latencyMode: 'quality',
      avc: { format: 'avc' },
      colorSpace: {
        primaries: 'bt709',
        transfer: 'bt709',
        matrix: 'bt709',
        fullRange: false,
      },
    };

    try {
      const support = await VideoEncoder.isConfigSupported(bt709Candidate);
      if (support.supported) {
        return support.config || bt709Candidate;
      }
    } catch {
      // Fallback if colorSpace or latencyMode is rejected
    }

    const candidate: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
      bitrateMode: 'variable',
      latencyMode: 'quality',
      avc: { format: 'avc' },
    };

    try {
      const support = await VideoEncoder.isConfigSupported(candidate);
      if (support.supported) {
        return support.config || candidate;
      }
    } catch {
      // Try basic candidate
    }

    const basicCandidate: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
    };
    try {
      const support = await VideoEncoder.isConfigSupported(basicCandidate);
      if (support.supported) {
        return support.config || basicCandidate;
      }
    } catch {
      // Continue trying next profile
    }
  }

  return null;
}

/**
 * Checks whether the current browser supports WebCodecs H.264 MP4 export at 1080p30.
 */
export async function checkWebCodecsMp4Support(): Promise<boolean> {
  const cfg = await findSupportedH264Config(1920, 1080, 30, 12_000_000);
  return cfg !== null;
}

/**
 * Checks whether WebCodecs AAC AudioEncoder is supported (48 kHz stereo, 192 kbps).
 */
async function findSupportedAacConfig(
  sampleRate: number,
  numberOfChannels: number
): Promise<AudioEncoderConfig | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
    return null;
  }
  const config: AudioEncoderConfig = {
    codec: 'mp4a.40.2', // AAC-LC
    sampleRate,
    numberOfChannels,
    bitrate: 192_000,
  };
  try {
    const res = await AudioEncoder.isConfigSupported(config);
    return res.supported ? config : null;
  } catch {
    return null;
  }
}

/**
 * Encodes an AudioBuffer (from OfflineAudioContext 48 kHz stereo mix) into AAC chunks via WebCodecs AudioEncoder.
 */
async function encodeAudioBufferToAac(
  renderedBuffer: AudioBuffer,
  audioEncoder: AudioEncoder,
  sampleRate: number,
  numberOfChannels: number,
  shouldCancel: () => boolean
): Promise<void> {
  const totalSamples = renderedBuffer.length;
  const chunkSize = 4096;
  const chCount = clamp(numberOfChannels, 1, 2);

  for (let offset = 0; offset < totalSamples; offset += chunkSize) {
    if (shouldCancel()) break;
    const framesInChunk = Math.min(chunkSize, totalSamples - offset);
    const planarData = new Float32Array(framesInChunk * chCount);

    for (let ch = 0; ch < chCount; ch++) {
      const srcChannel = renderedBuffer.getChannelData(
        Math.min(ch, renderedBuffer.numberOfChannels - 1)
      );
      const dstOffset = ch * framesInChunk;
      for (let i = 0; i < framesInChunk; i++) {
        planarData[dstOffset + i] = clamp(srcChannel[offset + i], -1, 1);
      }
    }

    const timestampUs = Math.round((offset / sampleRate) * 1_000_000);
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: framesInChunk,
      numberOfChannels: chCount,
      timestamp: timestampUs,
      data: planarData,
    });

    audioEncoder.encode(audioData);
    audioData.close();

    while (audioEncoder.encodeQueueSize > 16 && !shouldCancel()) {
      await new Promise((r) => setTimeout(r, 4));
    }
  }

  await audioEncoder.flush();
}

/**
 * Main frame-by-frame deterministic WebCodecs MP4 exporter.
 */
export async function exportMp4Video(params: {
  content: QuoteContent;
  timeline: TimelineConfig;
  custom: StyleCustomization;
  exportSettings: ExportSettings;
  sfxSettings?: SfxSettings;
  videoFile?: File | null;
  onProgress: (state: ExportProgressState) => void;
  abortSignal: { cancelled: boolean };
}): Promise<void> {
  const {
    content,
    timeline,
    custom,
    exportSettings,
    sfxSettings,
    videoFile,
    onProgress,
    abortSignal,
  } = params;

  onProgress({
    status: 'preparing',
    currentFrame: 0,
    totalFrames: 1,
    percentage: 0,
    estimatedRemainingSeconds: null,
  });

  await ensureArabicFontsLoaded();

  const renderSize = getRenderSize(custom.format, exportSettings.resolution);
  const fps = exportSettings.fps;
  const bitrate = getTargetBitrate(exportSettings.resolution, fps, exportSettings.quality);

  const mode = custom.mode || 'quote';
  const activeStyleId = resolveActiveStyleId(custom);
  const effectiveTimeline = getEffectiveTimeline(
    timeline,
    content.quoteText,
    mode,
    activeStyleId === 'annotate' ? 0.55 : 0.35,
    getTypingConfigForCustomization(custom)
  );
  const paddingSec = exportSettings.endPadding ? 0.4 : 0;
  const fullDurationSec = effectiveTimeline.total + paddingSec;
  const exportDurationSec = exportSettings.quickTest
    ? Math.min(3.0, fullDurationSec)
    : fullDurationSec;

  const totalFrames = Math.max(1, Math.round(exportDurationSec * fps));
  const fileName = buildExportFileName(custom, exportSettings.resolution, 'mp4');

  // 1. Verify H.264 encoder config
  const videoEncoderConfig = await findSupportedH264Config(
    renderSize.width,
    renderSize.height,
    fps,
    bitrate
  );

  if (!videoEncoderConfig) {
    onProgress({
      status: 'error',
      currentFrame: 0,
      totalFrames,
      percentage: 0,
      estimatedRemainingSeconds: null,
      errorMessage:
        'متصفحك الحالي لا يدعم ترميز H.264 عبر WebCodecs لهذه الدقة. يرجى استخدام متصفح Chrome أو Edge على سطح المكتب أو استخدام خيار تصدير WebM الاحتياطي.',
    });
    return;
  }

  // 2. Check optional audio track support (music, SFX, or Video Insert clip audio)
  const videoSpeed = custom.videoSpeed ?? 1.0;
  const videoDuration =
    content.videoMeta?.duration || custom.videoDurationSec || DEFAULT_VIDEO_DURATION;
  const vt = computeVideoTimeline({
    videoDuration,
    trimIn: custom.videoTrimIn ?? 0,
    trimOut: custom.videoTrimOut ?? videoDuration,
    speed: videoSpeed,
    customDurationEnabled: custom.videoCustomDurationEnabled,
    customDuration: custom.videoCustomDuration,
  });
  const hasClipAudioToExport = Boolean(
    mode === 'video' &&
      videoFile &&
      content.videoMeta?.hasAudio !== false &&
      (custom.videoAudioEnabled ?? true) &&
      Math.abs(videoSpeed - 1) < 0.01 &&
      (custom.videoAudioVolume ?? 0.85) > 0.01
  );
  const cricketAudioEnabled = hasFlyerCricketAudio(custom);
  const hasAudioToExport = Boolean(
    exportSettings.audioFile ||
      sfxSettings?.enabled ||
      hasClipAudioToExport ||
      cricketAudioEnabled
  );
  let audioConfig: AudioEncoderConfig | null = null;
  let audioSkippedNotice: string | undefined;
  const audioSampleRate = 48000;
  const audioChannels = 2;

  if (hasAudioToExport) {
    audioConfig = await findSupportedAacConfig(audioSampleRate, audioChannels);
    if (!audioConfig) {
      audioSkippedNotice =
        'ملاحظة: متصفحك لا يدعم ترميز الصوت AAC داخل MP4، لذلك تم تصدير الفيديو بدون المسار الصوتي.';
    }
  }

  // 3. Try File System Access API (showSaveFilePicker) if available in top-level context; fallback to ArrayBufferTarget
  let writableStream: FileSystemWritableFileStream | null = null;
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as unknown as {
        showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'MP4 Video File',
            accept: { 'video/mp4': ['.mp4'] },
          },
        ],
      });
      writableStream = await handle.createWritable();
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        onProgress({
          status: 'cancelled',
          currentFrame: 0,
          totalFrames,
          percentage: 0,
          estimatedRemainingSeconds: null,
        });
        return;
      }
      writableStream = null;
    }
  }

  const muxerTarget = writableStream
    ? new FileSystemWritableFileStreamTarget(writableStream)
    : new ArrayBufferTarget();

  const muxer = new Muxer({
    target: muxerTarget,
    video: {
      codec: 'avc',
      width: renderSize.width,
      height: renderSize.height,
    },
    audio: audioConfig
      ? {
          codec: 'aac',
          sampleRate: audioSampleRate,
          numberOfChannels: audioChannels,
        }
      : undefined,
    fastStart: writableStream ? false : 'in-memory',
  });

  let encoderError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      encoderError = err;
    },
  });

  videoEncoder.configure(videoEncoderConfig);

  let audioEncoder: AudioEncoder | null = null;
  if (audioConfig) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
      },
      error: (err) => {
        console.warn('AudioEncoder error:', err);
      },
    });
    audioEncoder.configure(audioConfig);
  }

  // Create OffscreenCanvas (or fallback HTMLCanvasElement) at exact export pixel dimensions
  const useOffscreen = typeof OffscreenCanvas !== 'undefined';
  const renderCanvas = useOffscreen
    ? new OffscreenCanvas(renderSize.width, renderSize.height)
    : document.createElement('canvas');

  if (!useOffscreen) {
    (renderCanvas as HTMLCanvasElement).width = renderSize.width;
    (renderCanvas as HTMLCanvasElement).height = renderSize.height;
  }

  const ctx = renderCanvas.getContext('2d', { alpha: false }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;

  const startTimePerf = performance.now();
  const frameDurationUs = Math.round((1 / fps) * 1_000_000);
  const keyFrameInterval = fps * 2;

  let exportVideoDecoder: Awaited<ReturnType<typeof createVideoExportDecoder>> | null = null;

  try {
    let activeContent = content;
    if (mode === 'video' && videoFile) {
      const boxPx = videoBoxToPixels(
        custom.videoBox,
        renderSize.width,
        renderSize.height,
        Boolean(custom.videoAllowOutOfMargin)
      );
      exportVideoDecoder = await createVideoExportDecoder({
        file: videoFile,
        posterCanvas:
          (content.videoPosterSource as HTMLCanvasElement) || getDefaultVideoPosterCanvas(),
        maxOnCanvasWidth: boxPx.boxWidth,
        maxOnCanvasHeight: boxPx.boxHeight,
        trimIn: vt.trimIn,
        trimOut: vt.trimOut,
      });
      activeContent = {
        ...content,
        videoGetFrame: (sourceTime: number) => exportVideoDecoder!.getFrame(sourceTime),
      };
    }

    for (let i = 0; i < totalFrames; i++) {
      if (abortSignal.cancelled) {
        try {
          videoEncoder.close();
          if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
          if (writableStream) await writableStream.abort();
        } catch {
          // Ignore close errors
        }
        onProgress({
          status: 'cancelled',
          currentFrame: i,
          totalFrames,
          percentage: Math.round((i / totalFrames) * 100),
          estimatedRemainingSeconds: null,
        });
        return;
      }

      if (encoderError) {
        throw encoderError;
      }

      const t = i / fps;
      const clampedT = Math.min(t, effectiveTimeline.total);

      if (exportVideoDecoder) {
        const sourceT = computeVideoSourceTime(clampedT, {
          clipStart: vt.clipStart,
          clipEnd: vt.clipEnd,
          trimIn: vt.trimIn,
          trimOut: vt.trimOut,
          speed: vt.speed,
          endBehavior: custom.videoEndBehavior || 'freeze',
        });
        await exportVideoDecoder.prepareFrameAtSourceTime(sourceT);
      }

      renderQuoteFrame(ctx, clampedT, activeContent, timeline, custom, renderSize);

      const timestampUs = Math.round((i / fps) * 1_000_000);
      const videoFrame = new VideoFrame(renderCanvas, {
        timestamp: timestampUs,
        duration: frameDurationUs,
      });

      const isKeyFrame = i % keyFrameInterval === 0;
      videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
      videoFrame.close();

      while (videoEncoder.encodeQueueSize > 8 && !abortSignal.cancelled) {
        await new Promise((r) => setTimeout(r, 4));
      }

      if (i % 3 === 0 || i === totalFrames - 1) {
        const elapsedSec = (performance.now() - startTimePerf) / 1000;
        const framesDone = i + 1;
        const rate = framesDone / Math.max(0.05, elapsedSec);
        const remainingSec = Math.max(0, (totalFrames - framesDone) / rate);

        onProgress({
          status: 'rendering',
          currentFrame: framesDone,
          totalFrames,
          percentage: Math.round((framesDone / totalFrames) * 100),
          estimatedRemainingSeconds: Math.round(remainingSec),
          audioSkippedNotice,
        });

        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // Encode optional audio track (OfflineAudioContext 48 kHz stereo mix of SFX + Music + Clip Audio)
    if (hasAudioToExport && audioEncoder && !abortSignal.cancelled) {
      onProgress({
        status: 'encoding-audio',
        currentFrame: totalFrames,
        totalFrames,
        percentage: 98,
        estimatedRemainingSeconds: 1,
        audioSkippedNotice,
      });
      try {
        const eventTimes = getSceneEventTimes(ctx, activeContent, timeline, custom, renderSize);
        const mixedBuffer = await renderOfflineAudioMix({
          targetDurationSec: exportDurationSec,
          sfxSettings,
          eventTimes,
          musicFile: exportSettings.audioFile,
          musicVolume: exportSettings.audioVolume,
          seed: custom.seed,
          flyerCricket: cricketAudioEnabled
            ? {
                enabled: true,
                preset: resolveFlyerCricketPreset(custom.flyerCricketPreset),
                volume: resolveFlyerCricketVolume(custom.flyerCricketVolume),
              }
            : undefined,
          videoClipAudio:
            mode === 'video' && videoFile
              ? {
                  file: videoFile,
                  hasAudio: content.videoMeta?.hasAudio,
                  enabled: custom.videoAudioEnabled ?? true,
                  speed: videoSpeed,
                  volume: custom.videoAudioVolume ?? 0.85,
                  trimIn: vt.trimIn,
                  trimOut: vt.trimOut,
                  clipStartSec: vt.clipStart,
                  clipEndSec: vt.clipEnd,
                  endBehavior: custom.videoEndBehavior || 'freeze',
                }
              : undefined,
        });
        await encodeAudioBufferToAac(
          mixedBuffer,
          audioEncoder,
          audioSampleRate,
          audioChannels,
          () => abortSignal.cancelled
        );
      } catch (audioErr) {
        console.warn('Failed to render/encode audio mix:', audioErr);
        audioSkippedNotice = 'تعذر معالجة المسار الصوتي، تم تصدير الفيديو بدون صوت.';
      }
    }

    onProgress({
      status: 'finalizing',
      currentFrame: totalFrames,
      totalFrames,
      percentage: 99,
      estimatedRemainingSeconds: 0,
      audioSkippedNotice,
    });

    await videoEncoder.flush();
    videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== 'closed') {
      audioEncoder.close();
    }

    muxer.finalize();

    let finalByteSize = 0;
    if (writableStream) {
      await writableStream.close();
      finalByteSize = Math.round((bitrate / 8) * exportDurationSec * 0.65);
    } else if (muxerTarget instanceof ArrayBufferTarget) {
      const buffer = muxerTarget.buffer;
      finalByteSize = buffer.byteLength;
      const blob = new Blob([buffer], { type: 'video/mp4' });
      triggerBlobDownload(blob, fileName);
    }

    onProgress({
      status: 'completed',
      currentFrame: totalFrames,
      totalFrames,
      percentage: 100,
      estimatedRemainingSeconds: 0,
      fileSizeBytes: finalByteSize,
      durationSeconds: Number(exportDurationSec.toFixed(1)),
      fileName,
      audioSkippedNotice,
    });
  } catch (err: unknown) {
    try {
      if (videoEncoder.state !== 'closed') videoEncoder.close();
      if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
      if (writableStream) await writableStream.abort();
    } catch {
      // Ignore cleanup errors
    }
    const rawMsg = err instanceof Error ? err.message : String(err);
    const friendlyMsg = /decoding error/i.test(rawMsg)
      ? `تعذر فك ترميز ملف الفيديو المرفق (${rawMsg}). يُنصح بتحويل المقطع إلى MP4 بترميز H.264 القياسي والمحاولة مرة أخرى.`
      : rawMsg;
    onProgress({
      status: 'error',
      currentFrame: 0,
      totalFrames,
      percentage: 0,
      estimatedRemainingSeconds: null,
      errorMessage: `حدث خطأ أثناء تصدير الفيديو: ${friendlyMsg}`,
    });
  } finally {
    if (exportVideoDecoder) {
      await exportVideoDecoder.dispose().catch(() => {});
    }
  }
}

/**
 * Fallback real-time WebM exporter using canvas.captureStream + MediaRecorder (VP9 -> VP8).
 */
export async function exportWebMFallback(params: {
  content: QuoteContent;
  timeline: TimelineConfig;
  custom: StyleCustomization;
  exportSettings: ExportSettings;
  videoFile?: File | null;
  onProgress: (state: ExportProgressState) => void;
  abortSignal: { cancelled: boolean };
}): Promise<void> {
  const { content, timeline, custom, exportSettings, videoFile, onProgress, abortSignal } = params;
  await ensureArabicFontsLoaded();

  const renderSize = getRenderSize(custom.format, exportSettings.resolution);
  const fps = exportSettings.fps;
  const bitrate = getTargetBitrate(exportSettings.resolution, fps, exportSettings.quality);
  const mode = custom.mode || 'quote';
  const activeStyleId = resolveActiveStyleId(custom);
  const effectiveTimeline = getEffectiveTimeline(
    timeline,
    content.quoteText,
    mode,
    activeStyleId === 'annotate' ? 0.55 : 0.35,
    getTypingConfigForCustomization(custom)
  );
  const exportDurationSec = exportSettings.quickTest
    ? Math.min(3.0, effectiveTimeline.total)
    : effectiveTimeline.total;
  const totalFrames = Math.max(1, Math.round(exportDurationSec * fps));

  const canvas = document.createElement('canvas');
  canvas.width = renderSize.width;
  canvas.height = renderSize.height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const supportedMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: supportedMime,
    videoBitsPerSecond: bitrate,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: supportedMime }));
    };
  });

  const videoDuration =
    content.videoMeta?.duration || custom.videoDurationSec || DEFAULT_VIDEO_DURATION;
  const vt = computeVideoTimeline({
    videoDuration,
    trimIn: custom.videoTrimIn ?? 0,
    trimOut: custom.videoTrimOut ?? videoDuration,
    speed: custom.videoSpeed ?? 1.0,
    customDurationEnabled: custom.videoCustomDurationEnabled,
    customDuration: custom.videoCustomDuration,
  });

  let exportVideoDecoder: Awaited<ReturnType<typeof createVideoExportDecoder>> | null = null;
  let activeContent = content;

  try {
    if (mode === 'video' && videoFile) {
      const boxPx = videoBoxToPixels(
        custom.videoBox,
        renderSize.width,
        renderSize.height,
        Boolean(custom.videoAllowOutOfMargin)
      );
      exportVideoDecoder = await createVideoExportDecoder({
        file: videoFile,
        posterCanvas:
          (content.videoPosterSource as HTMLCanvasElement) || getDefaultVideoPosterCanvas(),
        maxOnCanvasWidth: boxPx.boxWidth,
        maxOnCanvasHeight: boxPx.boxHeight,
        trimIn: vt.trimIn,
        trimOut: vt.trimOut,
      });
      activeContent = {
        ...content,
        videoGetFrame: (sourceTime: number) => exportVideoDecoder!.getFrame(sourceTime),
      };
    }

    recorder.start(100);
    const startPerf = performance.now();

    for (let i = 0; i < totalFrames; i++) {
      if (abortSignal.cancelled) {
        recorder.stop();
        onProgress({
          status: 'cancelled',
          currentFrame: i,
          totalFrames,
          percentage: Math.round((i / totalFrames) * 100),
          estimatedRemainingSeconds: null,
        });
        return;
      }

      const t = i / fps;
      if (exportVideoDecoder) {
        const sourceT = computeVideoSourceTime(Math.min(t, effectiveTimeline.total), {
          clipStart: vt.clipStart,
          clipEnd: vt.clipEnd,
          trimIn: vt.trimIn,
          trimOut: vt.trimOut,
          speed: vt.speed,
          endBehavior: custom.videoEndBehavior || 'freeze',
        });
        await exportVideoDecoder.prepareFrameAtSourceTime(sourceT);
      }

      renderQuoteFrame(ctx, t, activeContent, timeline, custom, renderSize);

      const remainingSec = Math.max(0, exportDurationSec - t);
      onProgress({
        status: 'rendering',
        currentFrame: i + 1,
        totalFrames,
        percentage: Math.round(((i + 1) / totalFrames) * 100),
        estimatedRemainingSeconds: Math.ceil(remainingSec),
      });

      const targetNextMs = ((i + 1) / fps) * 1000;
      const elapsedMs = performance.now() - startPerf;
      const waitMs = Math.max(4, targetNextMs - elapsedMs);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    recorder.stop();
    const blob = await stopPromise;
    const fileName = buildExportFileName(custom, exportSettings.resolution, 'webm');
    triggerBlobDownload(blob, fileName);

    onProgress({
      status: 'completed',
      currentFrame: totalFrames,
      totalFrames,
      percentage: 100,
      estimatedRemainingSeconds: 0,
      fileSizeBytes: blob.size,
      durationSeconds: Number(exportDurationSec.toFixed(1)),
      fileName,
    });
  } finally {
    if (exportVideoDecoder) {
      await exportVideoDecoder.dispose().catch(() => {});
    }
  }
}

/**
 * Exports a high-resolution PNG still image of the fully visible frame (middle of the hold phase).
 */
export async function exportStillPng(params: {
  content: QuoteContent;
  timeline: TimelineConfig;
  custom: StyleCustomization;
  resolution: ExportResolution;
}): Promise<{ fileName: string; width: number; height: number }> {
  const { content, timeline, custom, resolution } = params;
  await ensureArabicFontsLoaded();

  const renderSize = getRenderSize(custom.format, resolution);
  const mode = custom.mode || 'quote';
  const activeStyleId = resolveActiveStyleId(custom);
  const effective = getEffectiveTimeline(
    timeline,
    content.quoteText,
    mode,
    activeStyleId === 'annotate' ? 0.55 : 0.35,
    getTypingConfigForCustomization(custom)
  );
  // In Chat or Points mode, pick a frame in endHold where all items/messages are settled and visible
  const holdMidTime =
    mode === 'chat' || mode === 'points'
      ? Math.max(effective.enter + 0.2, effective.exitStart - 0.5)
      : effective.enter + effective.hold * 0.5;

  const canvas = document.createElement('canvas');
  canvas.width = renderSize.width;
  canvas.height = renderSize.height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  renderQuoteFrame(ctx, holdMidTime, content, timeline, custom, renderSize);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  const fileName = buildExportFileName(custom, resolution, 'png');
  if (blob) {
    triggerBlobDownload(blob, fileName);
  }
  return { fileName, width: renderSize.width, height: renderSize.height };
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
