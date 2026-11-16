import { ALL_FORMATS, BlobSource, CanvasSink, Input, InputVideoTrack } from 'mediabunny';
import { VideoSourceMetadata } from '../types';
import { createBufferCanvas, getImageGreenPixelRatio, getOrGenerateCachedCanvas } from './assetCache';
import { clamp, lerp } from './math';

export interface LoadedVideoAsset {
  ok: true;
  file: File;
  videoId: string;
  objectUrl: string;
  meta: VideoSourceMetadata;
  posterCanvas: HTMLCanvasElement;
  thumbnailStrip: HTMLCanvasElement[];
  greenPixelRatio: number;
  softWarningAr?: string;
}

export interface FailedVideoAsset {
  ok: false;
  errorAr: string;
}

export type LoadVideoAssetResult = LoadedVideoAsset | FailedVideoAsset;

function normalizeRotation(raw: number): 0 | 90 | 180 | 270 {
  const n = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
  if (n === 90) return 90;
  if (n === 180) return 180;
  if (n === 270) return 270;
  return 0;
}

/**
 * Deterministic studio poster canvas (960x540, zero external assets, safe in Node tests).
 * Warm slate & twilight amber editorial backdrop with zero green tones.
 */
export function getDefaultVideoPosterCanvas(): HTMLCanvasElement {
  return getOrGenerateCachedCanvas('default-video-poster-v1', 960, 540, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0F172A');
    bg.addColorStop(0.55, '#1E293B');
    bg.addColorStop(1, '#312E81');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const sun = ctx.createRadialGradient(w * 0.68, h * 0.34, 14, w * 0.68, h * 0.34, w * 0.45);
    sun.addColorStop(0, 'rgba(245, 158, 11, 0.55)');
    sun.addColorStop(0.42, 'rgba(217, 119, 6, 0.22)');
    sun.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);

    // Subtle geometric horizon & architectural planes
    ctx.fillStyle = 'rgba(15, 23, 42, 0.68)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.68);
    ctx.lineTo(w * 0.34, h * 0.44);
    ctx.lineTo(w * 0.62, h * 0.61);
    ctx.lineTo(w, h * 0.42);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(248, 250, 252, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h * 0.78);
    ctx.lineTo(w * 0.92, h * 0.78);
    ctx.stroke();

    // Soft floating bokeh discs
    const discs = [
      { x: 0.22, y: 0.28, r: 44, c: 'rgba(56, 189, 248, 0.18)' },
      { x: 0.76, y: 0.54, r: 64, c: 'rgba(251, 191, 36, 0.16)' },
      { x: 0.44, y: 0.22, r: 28, c: 'rgba(196, 181, 253, 0.15)' },
    ];
    for (const d of discs) {
      ctx.fillStyle = d.c;
      ctx.beginPath();
      ctx.arc(w * d.x, h * d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * Deterministic animated procedural sample video frame when no file has been uploaded yet.
 * Quantized to 24 steps/sec and lightly cached so preview scrub & render stay fast and deterministic.
 */
export function getDefaultVideoFrameAt(sourceTime: number): HTMLCanvasElement {
  const quantized = Math.round(Math.max(0, sourceTime) * 24) % 240;
  const key = `default-video-frame|${quantized}`;
  return getOrGenerateCachedCanvas(key, 640, 360, (ctx, w, h) => {
    const poster = getDefaultVideoPosterCanvas();
    ctx.drawImage(poster, 0, 0, w, h);

    const phase = (quantized / 24) * 1.1;
    // Animated volumetric light sweep across the procedural sample scene
    const sweepX = ((Math.sin(phase * 0.9) * 0.5 + 0.5) * 0.7 + 0.15) * w;
    const sweepY = ((Math.cos(phase * 0.7) * 0.5 + 0.5) * 0.4 + 0.22) * h;
    const beam = ctx.createRadialGradient(sweepX, sweepY, 8, sweepX, sweepY, w * 0.36);
    beam.addColorStop(0, 'rgba(251, 191, 36, 0.28)');
    beam.addColorStop(0.5, 'rgba(56, 189, 248, 0.14)');
    beam.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, w, h);

    // Subtle moving wave silhouette
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.26)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= w; px += 16) {
      const py = h * 0.64 + Math.sin(px * 0.015 + phase * 2.2) * 12;
      if (px === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  });
}

function cloneToReusableCanvas(src: HTMLCanvasElement, targetW?: number, targetH?: number): HTMLCanvasElement {
  const w = Math.max(2, Math.round(targetW ?? src.width));
  const h = Math.max(2, Math.round(targetH ?? src.height));
  const out = createBufferCanvas(w, h);
  const octx = out.getContext('2d');
  if (octx) {
    octx.drawImage(src, 0, 0, w, h);
  }
  return out;
}

async function waitForVideoReadyForSeek(video: HTMLVideoElement, timeoutMs = 4000): Promise<boolean> {
  if (video.readyState >= 1) return true;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('error', onErr);
      resolve(ok);
    };
    const onReady = () => done(true);
    const onErr = () => done(false);
    const timer = window.setTimeout(() => done(video.readyState >= 1), timeoutMs);
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('error', onErr);
  });
}

async function seekAndCaptureVideoElementFrame(
  video: HTMLVideoElement,
  targetTime: number,
  targetW: number,
  targetH: number,
  timeoutMs = 2500
): Promise<HTMLCanvasElement | null> {
  if (typeof document === 'undefined') return null;
  const maxDur = Number.isFinite(video.duration) && video.duration > 0 ? Math.max(0, video.duration - 0.02) : targetTime;
  const clampedT = clamp(targetTime, 0, maxDur);

  const needsSeek = Math.abs(video.currentTime - clampedT) > 0.008 || video.readyState < 2;
  if (needsSeek) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        video.removeEventListener('seeked', done);
        video.removeEventListener('error', done);
        resolve();
      };
      const timer = window.setTimeout(done, timeoutMs);
      video.addEventListener('seeked', done, { once: true });
      video.addEventListener('error', done, { once: true });
      try {
        video.currentTime = clampedT;
      } catch {
        done();
      }
    });
  }

  if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
    return null;
  }

  const cw = Math.max(2, Math.round(targetW / 2) * 2);
  const ch = Math.max(2, Math.round(targetH / 2) * 2);
  const canvas = createBufferCanvas(cw, ch);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(video, 0, 0, cw, ch);
  }
  return canvas;
}

/**
 * Loads an uploaded video file (MP4, MOV, WEBM), validates decodability via mediabunny + WebCodecs
 * (with clear Arabic H.264 guidance if unsupported), reads duration/size/rotation/audio metadata,
 * extracts a cached poster frame & thumbnail strip, and warns softly above 120s or 500MB.
 */
export async function loadVideoAsset(file: File): Promise<LoadVideoAssetResult> {
  let input: Input | null = null;
  let objectUrl = '';

  try {
    input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      return {
        ok: false,
        errorAr: 'لم يتم العثور على مسار فيديو صالح داخل هذا الملف. يرجى اختيار ملف MP4 أو MOV أو WEBM.',
      };
    }

    const canDecode = await videoTrack.canDecode();
    const codec = (await videoTrack.getCodec()) || undefined;
    if (!canDecode) {
      return {
        ok: false,
        errorAr:
          'تعذر فك ترميز هذا المقطع في المتصفح (غالباً لأنه بترميز HEVC / H.265 غير المدعوم). يُنصح بتحويل الفيديو إلى MP4 بترميز H.264 وإعادة رفعه.',
      };
    }

    const [
      codedWidth,
      codedHeight,
      displayWidth,
      displayHeight,
      rawRotation,
      trackDuration,
      containerDuration,
      audioTrack,
    ] = await Promise.all([
      videoTrack.getCodedWidth(),
      videoTrack.getCodedHeight(),
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
      videoTrack.getRotation(),
      videoTrack.computeDuration().catch(() => 0),
      input.computeDuration().catch(() => 0),
      input.getPrimaryAudioTrack().catch(() => null),
    ]);

    const rotation = normalizeRotation(rawRotation);
    const safeDisplayW = Math.max(2, displayWidth || codedWidth || 1280);
    const safeDisplayH = Math.max(2, displayHeight || codedHeight || 720);
    let duration = Math.max(0.2, trackDuration || containerDuration || 6);

    // Quick heuristic check for variable frame rate via packet stats when available
    let isVfr = false;
    try {
      const stats = await videoTrack.computePacketStats(80);
      if (stats && stats.averagePacketRate > 0) {
        isVfr = false;
      }
    } catch {
      // Optional stat
    }

    // Create object URL and verify HTMLVideoElement playability too
    objectUrl = URL.createObjectURL(file);
    const probeOk = await probeVideoElementPlayable(objectUrl);
    if (!probeOk.ok) {
      URL.revokeObjectURL(objectUrl);
      return {
        ok: false,
        errorAr:
          'تعذر تشغيل هذا الفيديو في المتصفح (قد يكون الترميز HEVC أو غير متوافق). يُنصح بتصدير المقطع بصيغة MP4 بترميز H.264.',
      };
    }
    if (probeOk.duration > 0.2) {
      duration = probeOk.duration;
    }

    // Extract poster & thumbnail strip via CanvasSink (default -> prefer-software -> video element fallback)
    const maxPosterEdge = 960;
    const posterScale = Math.min(1, maxPosterEdge / Math.max(safeDisplayW, safeDisplayH));
    const posterSinkW = Math.max(64, Math.round((safeDisplayW * posterScale) / 2) * 2);
    const posterSinkH = Math.max(64, Math.round((safeDisplayH * posterScale) / 2) * 2);
    const posterTime = Math.min(duration * 0.15, 0.8);

    let posterCanvas = getDefaultVideoPosterCanvas();
    let gotRealPoster = false;

    for (const hwMode of ['no-preference', 'prefer-software'] as const) {
      if (gotRealPoster) break;
      try {
        const posterSink = new CanvasSink(videoTrack, {
          width: posterSinkW,
          poolSize: 1,
          decoderOptions: { hardwareAcceleration: hwMode },
        });
        const wrappedPoster =
          (await posterSink.getCanvas(posterTime).catch(() => null)) ||
          (await posterSink.getCanvas(0).catch(() => null));
        if (wrappedPoster?.canvas) {
          posterCanvas = cloneToReusableCanvas(wrappedPoster.canvas as HTMLCanvasElement);
          gotRealPoster = true;
        }
      } catch {
        // Try next tier
      }
    }

    // Generate cached 8-frame thumbnail strip
    const thumbCount = 8;
    const stripScale = Math.min(1, 160 / Math.max(safeDisplayW, safeDisplayH));
    const thumbW = Math.max(48, Math.round((safeDisplayW * stripScale) / 2) * 2);
    const thumbH = Math.max(36, Math.round(((thumbW * safeDisplayH) / safeDisplayW) / 2) * 2);

    const timestamps: number[] = [];
    for (let i = 0; i < thumbCount; i++) {
      const frac = i / (thumbCount - 1);
      timestamps.push(clamp(frac * Math.max(0.1, duration - 0.05), 0, duration));
    }

    const thumbnailStrip: HTMLCanvasElement[] = [];
    for (const hwMode of ['no-preference', 'prefer-software'] as const) {
      if (thumbnailStrip.length > 0) break;
      try {
        const thumbSink = new CanvasSink(videoTrack, {
          width: thumbW,
          poolSize: 1,
          decoderOptions: { hardwareAcceleration: hwMode },
        });
        for await (const item of thumbSink.canvasesAtTimestamps(timestamps)) {
          if (item?.canvas) {
            thumbnailStrip.push(cloneToReusableCanvas(item.canvas as HTMLCanvasElement));
          }
        }
      } catch {
        thumbnailStrip.length = 0;
      }
    }

    // If WebCodecs sinks failed on poster or strip, capture directly from temporary HTMLVideoElement
    if ((!gotRealPoster || thumbnailStrip.length === 0) && typeof document !== 'undefined') {
      const tempVideo = document.createElement('video');
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      tempVideo.preload = 'auto';
      tempVideo.src = objectUrl;
      try {
        const ready = await waitForVideoReadyForSeek(tempVideo, 3500);
        if (ready) {
          if (!gotRealPoster) {
            const captured = await seekAndCaptureVideoElementFrame(tempVideo, posterTime, posterSinkW, posterSinkH);
            if (captured) {
              posterCanvas = captured;
              gotRealPoster = true;
            }
          }
          if (thumbnailStrip.length === 0) {
            for (const ts of timestamps) {
              const thumb = await seekAndCaptureVideoElementFrame(tempVideo, ts, thumbW, thumbH, 1500);
              if (thumb) thumbnailStrip.push(thumb);
            }
          }
        }
      } catch {
        // Fallback below
      } finally {
        try {
          tempVideo.pause();
          tempVideo.removeAttribute('src');
          tempVideo.load();
        } catch {
          // Ignore
        }
      }
    }

    if (thumbnailStrip.length === 0) {
      for (let i = 0; i < thumbCount; i++) {
        thumbnailStrip.push(cloneToReusableCanvas(posterCanvas, thumbW, thumbH));
      }
    }

    const videoId = `vid-${file.name}-${file.size}-${file.lastModified}`;
    const greenPixelRatio = getImageGreenPixelRatio(posterCanvas, videoId);

    const warnings: string[] = [];
    if (duration > 120) {
      warnings.push(`مدة الفيديو (${Math.round(duration)} ث) تتجاوز دقيقتين`);
    }
    if (file.size > 500 * 1024 * 1024) {
      const mb = Math.round(file.size / (1024 * 1024));
      warnings.push(`حجم الملف (${mb} ميجابايت) يتجاوز 500 MB`);
    }

    const meta: VideoSourceMetadata = {
      duration: Number(duration.toFixed(2)),
      codedWidth,
      codedHeight,
      displayWidth: safeDisplayW,
      displayHeight: safeDisplayH,
      rotation,
      hasAudio: Boolean(audioTrack),
      fileSizeBytes: file.size,
      fileName: file.name,
      isVfr,
      codec,
    };

    return {
      ok: true,
      file,
      videoId,
      objectUrl,
      meta,
      posterCanvas,
      thumbnailStrip,
      greenPixelRatio,
      softWarningAr:
        warnings.length > 0
          ? `تنبيه لطيف: ${warnings.join(' و')} — قد يستغرق التصدير وقتاً إضافياً.`
          : undefined,
    };
  } catch (err) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    console.warn('Video load failed:', err);
    return {
      ok: false,
      errorAr:
        'تعذر قراءة أو فك ترميز ملف الفيديو. تأكد من سلامة الملف وأنه بصيغة MP4 (H.264) أو WEBM أو MOV مدعومة.',
    };
  } finally {
    input?.dispose();
  }
}

async function probeVideoElementPlayable(
  objectUrl: string
): Promise<{ ok: boolean; duration: number }> {
  if (typeof document === 'undefined') {
    return { ok: true, duration: 0 };
  }
  return new Promise((resolve) => {
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.muted = true;
    vid.playsInline = true;

    let done = false;
    const finish = (ok: boolean, duration: number = 0) => {
      if (done) return;
      done = true;
      vid.removeAttribute('src');
      vid.load();
      resolve({ ok, duration });
    };

    const timer = window.setTimeout(() => finish(true, 0), 4000);

    vid.onloadeddata = () => {
      window.clearTimeout(timer);
      const dur = Number.isFinite(vid.duration) ? vid.duration : 0;
      finish(true, dur);
    };
    vid.onerror = () => {
      window.clearTimeout(timer);
      finish(false, 0);
    };

    vid.src = objectUrl;
  });
}

/**
 * Preview controller wrapping an HTMLVideoElement + persistent last-frame cache canvas
 * so scrubbing and paused frames never flash black. Uses requestVideoFrameCallback when available.
 */
export class VideoPreviewController {
  private video: HTMLVideoElement;
  private lastFrameCanvas: HTMLCanvasElement;
  private lastDrawnVideoTime: number = -1;
  private targetSeekTime: number = -1;
  private isSeeking = false;
  private pendingSeekTime: number | null = null;
  private rvfcId: number | null = null;
  private disposed = false;
  private objectUrl: string;
  private hasValidFrame = false;

  constructor(
    objectUrl: string,
    posterCanvas: HTMLCanvasElement,
    displayWidth: number,
    displayHeight: number
  ) {
    this.objectUrl = objectUrl;
    const maxEdge = 1280;
    const scale = Math.min(1, maxEdge / Math.max(displayWidth, displayHeight, 1));
    const w = Math.max(64, Math.round(displayWidth * scale));
    const h = Math.max(64, Math.round(displayHeight * scale));

    this.lastFrameCanvas = createBufferCanvas(w, h);
    const lctx = this.lastFrameCanvas.getContext('2d');
    if (lctx && posterCanvas) {
      lctx.drawImage(posterCanvas, 0, 0, w, h);
      this.hasValidFrame = true;
    }

    this.video = document.createElement('video');
    this.video.src = objectUrl;
    this.video.preload = 'auto';
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.crossOrigin = 'anonymous';

    this.video.addEventListener('seeked', this.handleSeeked);
    this.video.addEventListener('loadeddata', this.captureCurrentVideoFrame);

    this.scheduleRvfc();
  }

  private scheduleRvfc = () => {
    if (this.disposed) return;
    const vWithRvfc = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (typeof vWithRvfc.requestVideoFrameCallback === 'function') {
      this.rvfcId = vWithRvfc.requestVideoFrameCallback(() => {
        if (this.disposed) return;
        this.captureCurrentVideoFrame();
        this.scheduleRvfc();
      });
    }
  };

  private handleSeeked = () => {
    this.isSeeking = false;
    this.captureCurrentVideoFrame();
    if (this.pendingSeekTime !== null && !this.disposed) {
      const next = this.pendingSeekTime;
      this.pendingSeekTime = null;
      this.requestSeek(next);
    }
  };

  private captureCurrentVideoFrame = () => {
    if (this.disposed) return;
    if (this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
      const lctx = this.lastFrameCanvas.getContext('2d');
      if (lctx) {
        try {
          lctx.drawImage(
            this.video,
            0,
            0,
            this.lastFrameCanvas.width,
            this.lastFrameCanvas.height
          );
          this.lastDrawnVideoTime = this.video.currentTime;
          this.hasValidFrame = true;
        } catch {
          // Ignore transient frame copy errors
        }
      }
    }
  };

  private requestSeek(timeSec: number) {
    if (this.disposed) return;
    const clamped = Math.max(0, timeSec);
    if (this.isSeeking) {
      this.pendingSeekTime = clamped;
      return;
    }
    if (Math.abs(this.video.currentTime - clamped) > 0.03) {
      this.isSeeking = true;
      this.targetSeekTime = clamped;
      try {
        this.video.currentTime = clamped;
      } catch {
        this.isSeeking = false;
      }
    } else {
      this.captureCurrentVideoFrame();
    }
  }

  public sync(opts: {
    sourceTime: number;
    isPlaying: boolean;
    speed: number;
    audioEnabled: boolean;
    audioVolume: number;
    insideClipSpan: boolean;
    clipActivePausedFreeze?: boolean;
  }) {
    if (this.disposed) return;

    const wantAudio =
      opts.isPlaying &&
      opts.insideClipSpan &&
      opts.audioEnabled &&
      Math.abs((opts.speed || 1) - 1) < 0.01 &&
      opts.audioVolume > 0.01;

    this.video.muted = !wantAudio;
    this.video.volume = clamp(opts.audioVolume, 0, 1);

    const safeRate = clamp(opts.speed || 1, 0.5, 2.0);
    if (Math.abs(this.video.playbackRate - safeRate) > 0.01) {
      try {
        this.video.playbackRate = safeRate;
      } catch {
        // Ignore rate error
      }
    }

    const shouldElementAdvance =
      opts.isPlaying && opts.insideClipSpan && !opts.clipActivePausedFreeze;

    if (shouldElementAdvance) {
      const drift = Math.abs(this.video.currentTime - opts.sourceTime);
      if (drift > 0.22) {
        this.requestSeek(opts.sourceTime);
      } else {
        this.captureCurrentVideoFrame();
      }
      if (this.video.paused) {
        this.video.play().catch(() => {});
      }
    } else {
      if (!this.video.paused) {
        this.video.pause();
      }
      if (Math.abs(this.targetSeekTime - opts.sourceTime) > 0.03 || Math.abs(this.lastDrawnVideoTime - opts.sourceTime) > 0.05) {
        this.requestSeek(opts.sourceTime);
      } else {
        this.captureCurrentVideoFrame();
      }
    }
  }

  public getFrame(): HTMLCanvasElement {
    this.captureCurrentVideoFrame();
    return this.lastFrameCanvas;
  }

  public hasFrame(): boolean {
    return this.hasValidFrame;
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const vWithRvfc = this.video as HTMLVideoElement & {
      cancelVideoFrameCallback?: (id: number) => void;
    };
    if (this.rvfcId !== null && typeof vWithRvfc.cancelVideoFrameCallback === 'function') {
      try {
        vWithRvfc.cancelVideoFrameCallback(this.rvfcId);
      } catch {
        // Ignore
      }
    }
    this.video.removeEventListener('seeked', this.handleSeeked);
    this.video.removeEventListener('loadeddata', this.captureCurrentVideoFrame);
    try {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    } catch {
      // Ignore
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
  }
}

interface ExportDecodedFrameEntry {
  timestamp: number;
  canvas: HTMLCanvasElement;
}

/**
 * Deterministic sequential WebCodecs export frame decoder powered by `mediabunny` `CanvasSink`,
 * with automatic fallback to WebCodecs software decoding (`prefer-software`), sparse `getCanvas`,
 * and off-DOM `<video>` frame seeking if a browser's `VideoDecoder` rejects a packet/profile with `Decoding error.`.
 */
export async function createVideoExportDecoder(params: {
  file: File;
  posterCanvas: HTMLCanvasElement;
  maxOnCanvasWidth: number;
  maxOnCanvasHeight: number;
  trimIn: number;
  trimOut: number;
}): Promise<{
  prepareFrameAtSourceTime: (sourceTime: number) => Promise<HTMLCanvasElement>;
  getFrame: (sourceTime: number) => HTMLCanvasElement;
  dispose: () => Promise<void>;
}> {
  const { file, posterCanvas, maxOnCanvasWidth, maxOnCanvasHeight, trimIn, trimOut } = params;

  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  const videoTrack: InputVideoTrack | null = await input.getPrimaryVideoTrack();
  if (!videoTrack) {
    input.dispose();
    throw new Error(
      'لم يتم العثور على مسار فيديو صالح داخل هذا الملف أثناء التصدير. يُنصح باستخدام ملف MP4 بترميز H.264.'
    );
  }

  const displayW = Math.max(2, await videoTrack.getDisplayWidth().catch(() => posterCanvas.width || 1280));
  const displayH = Math.max(2, await videoTrack.getDisplayHeight().catch(() => posterCanvas.height || 720));
  const isAbove1080p = Math.max(displayW, displayH) > 1920;

  let sinkWidth: number | undefined;
  let fallbackW = Math.max(64, Math.round(displayW / 2) * 2);
  let fallbackH = Math.max(64, Math.round(displayH / 2) * 2);
  if (isAbove1080p) {
    const targetMaxEdge = clamp(Math.max(maxOnCanvasWidth, maxOnCanvasHeight), 240, 1920);
    const scale = Math.min(1, targetMaxEdge / Math.max(displayW, displayH));
    sinkWidth = Math.max(64, Math.round((displayW * scale) / 2) * 2);
    fallbackW = sinkWidth;
    fallbackH = Math.max(64, Math.round((displayH * scale) / 2) * 2);
  }

  const webCodecsSupported = await videoTrack.canDecode().catch(() => false);

  let activeTier: 'wc-default' | 'wc-software' | 'video-seek' = webCodecsSupported
    ? 'wc-default'
    : 'video-seek';

  const makeSink = (hwMode: 'no-preference' | 'prefer-software') =>
    new CanvasSink(videoTrack, {
      ...(sinkWidth ? { width: sinkWidth } : {}),
      poolSize: 2,
      decoderOptions: { hardwareAcceleration: hwMode },
    });

  let defaultSink: CanvasSink | null = webCodecsSupported ? makeSink('no-preference') : null;
  let softwareSink: CanvasSink | null = null;
  let fallbackVideo: HTMLVideoElement | null = null;
  let fallbackObjectUrl = '';
  let fallbackVideoReady = false;

  type SinkIterator = AsyncGenerator<
    { canvas: HTMLCanvasElement | OffscreenCanvas; timestamp: number; duration: number },
    void,
    unknown
  >;

  let iterator: SinkIterator | null = null;
  let currentEntry: ExportDecodedFrameEntry | null = null;
  let lookaheadEntry: ExportDecodedFrameEntry | null = null;
  let lastRequestedTime = -1;
  let currentActiveCanvas: HTMLCanvasElement = posterCanvas;
  const lruCache = new Map<string, HTMLCanvasElement>();

  const toCachedCanvas = (
    srcCanvas: HTMLCanvasElement | OffscreenCanvas,
    ts: number
  ): HTMLCanvasElement => {
    const key = ts.toFixed(4);
    const hit = lruCache.get(key);
    if (hit) {
      lruCache.delete(key);
      lruCache.set(key, hit);
      return hit;
    }
    const cw = Math.max(2, srcCanvas.width);
    const ch = Math.max(2, srcCanvas.height);
    const copy = createBufferCanvas(cw, ch);
    const cctx = copy.getContext('2d');
    if (cctx) {
      cctx.drawImage(srcCanvas, 0, 0, cw, ch);
    }
    if (lruCache.size >= 6) {
      const oldestKey = lruCache.keys().next().value;
      if (oldestKey) lruCache.delete(oldestKey);
    }
    lruCache.set(key, copy);
    return copy;
  };

  const closeActiveIterator = async () => {
    if (iterator) {
      const old = iterator;
      iterator = null;
      try {
        await old.return?.();
      } catch {
        // Ignore iterator teardown errors
      }
    }
    currentEntry = null;
    lookaheadEntry = null;
  };

  const ensureFallbackVideo = async (): Promise<boolean> => {
    if (typeof document === 'undefined') return false;
    if (fallbackVideo && fallbackVideoReady) return true;
    if (!fallbackVideo) {
      fallbackObjectUrl = URL.createObjectURL(file);
      fallbackVideo = document.createElement('video');
      fallbackVideo.muted = true;
      fallbackVideo.playsInline = true;
      fallbackVideo.preload = 'auto';
      fallbackVideo.src = fallbackObjectUrl;
    }
    fallbackVideoReady = await waitForVideoReadyForSeek(fallbackVideo, 5000);
    return fallbackVideoReady;
  };

  const prepareViaVideoSeek = async (clampedT: number): Promise<HTMLCanvasElement> => {
    const key = `vs-${clampedT.toFixed(3)}`;
    const hit = lruCache.get(key);
    if (hit) {
      currentActiveCanvas = hit;
      return hit;
    }
    const ok = await ensureFallbackVideo();
    if (ok && fallbackVideo) {
      const captured = await seekAndCaptureVideoElementFrame(
        fallbackVideo,
        clampedT,
        fallbackW,
        fallbackH,
        2500
      );
      if (captured) {
        if (lruCache.size >= 6) {
          const oldestKey = lruCache.keys().next().value;
          if (oldestKey) lruCache.delete(oldestKey);
        }
        lruCache.set(key, captured);
        currentActiveCanvas = captured;
        return captured;
      }
    }
    return currentActiveCanvas;
  };

  const openIteratorOnSink = async (sink: CanvasSink, startTimestamp: number) => {
    await closeActiveIterator();
    const safeStart = Math.max(0, startTimestamp - 0.05);
    const safeEnd = Math.max(trimOut + 0.5, safeStart + 0.75);
    iterator = sink.canvases(safeStart, safeEnd);
    const first = await iterator.next();
    if (!first.done && first.value) {
      const c = toCachedCanvas(first.value.canvas, first.value.timestamp);
      currentEntry = { timestamp: first.value.timestamp, canvas: c };
      const second = await iterator.next();
      if (!second.done && second.value) {
        const c2 = toCachedCanvas(second.value.canvas, second.value.timestamp);
        lookaheadEntry = { timestamp: second.value.timestamp, canvas: c2 };
      }
    } else {
      const single = await sink.getCanvas(startTimestamp).catch(() => null);
      if (single?.canvas) {
        const c = toCachedCanvas(single.canvas, single.timestamp);
        currentEntry = { timestamp: single.timestamp, canvas: c };
      }
    }
  };

  const runWithCanvasSink = async (
    sink: CanvasSink,
    clampedT: number,
    forceReopenAtCurrent: boolean
  ): Promise<HTMLCanvasElement> => {
    if (!iterator || forceReopenAtCurrent || clampedT < lastRequestedTime - 0.08) {
      const restartAt =
        !forceReopenAtCurrent && clampedT < lastRequestedTime - 0.08 ? trimIn : clampedT;
      await openIteratorOnSink(sink, restartAt);
    }

    // Advance sequentially while lookaheadEntry.timestamp <= clampedT (nearest frame <= sourceTime for VFR)
    while (iterator && lookaheadEntry && lookaheadEntry.timestamp <= clampedT + 1e-4) {
      currentEntry = lookaheadEntry;
      const nextStep = await iterator.next();
      if (!nextStep.done && nextStep.value) {
        const nextCanvas = toCachedCanvas(nextStep.value.canvas, nextStep.value.timestamp);
        lookaheadEntry = {
          timestamp: nextStep.value.timestamp,
          canvas: nextCanvas,
        };
      } else {
        lookaheadEntry = null;
      }
    }

    if (currentEntry) {
      currentActiveCanvas = currentEntry.canvas;
      return currentActiveCanvas;
    }

    const fallbackSingle = await sink.getCanvas(clampedT).catch(() => null);
    if (fallbackSingle?.canvas) {
      currentActiveCanvas = toCachedCanvas(fallbackSingle.canvas, fallbackSingle.timestamp);
      return currentActiveCanvas;
    }
    return currentActiveCanvas;
  };

  const prepareFrameAtSourceTime = async (sourceTime: number): Promise<HTMLCanvasElement> => {
    const clampedT = Math.max(0, sourceTime);

    if (activeTier === 'wc-default' && defaultSink) {
      try {
        const frame = await runWithCanvasSink(defaultSink, clampedT, false);
        lastRequestedTime = clampedT;
        return frame;
      } catch (err) {
        console.warn('Primary WebCodecs decoder failed; falling back to prefer-software:', err);
        await closeActiveIterator();
        activeTier = 'wc-software';
      }
    }

    if (activeTier === 'wc-software') {
      try {
        if (!softwareSink) {
          softwareSink = makeSink('prefer-software');
        }
        const needReopen = !iterator;
        const frame = await runWithCanvasSink(softwareSink, clampedT, needReopen);
        lastRequestedTime = clampedT;
        return frame;
      } catch (err) {
        console.warn('Software WebCodecs sequential decoder failed; trying sparse getCanvas:', err);
        await closeActiveIterator();
        if (softwareSink) {
          try {
            const single = await softwareSink.getCanvas(clampedT);
            if (single?.canvas) {
              currentActiveCanvas = toCachedCanvas(single.canvas, single.timestamp);
              lastRequestedTime = clampedT;
              return currentActiveCanvas;
            }
          } catch {
            // Fall through to off-DOM HTMLVideoElement seek fallback
          }
        }
        activeTier = 'video-seek';
      }
    }

    lastRequestedTime = clampedT;
    return prepareViaVideoSeek(clampedT);
  };

  const getFrame = (_sourceTime: number): HTMLCanvasElement => {
    return currentActiveCanvas;
  };

  const dispose = async () => {
    await closeActiveIterator();
    lruCache.clear();
    input.dispose();
    if (fallbackVideo) {
      try {
        fallbackVideo.pause();
        fallbackVideo.removeAttribute('src');
        fallbackVideo.load();
      } catch {
        // Ignore
      }
      fallbackVideo = null;
    }
    if (fallbackObjectUrl) {
      URL.revokeObjectURL(fallbackObjectUrl);
      fallbackObjectUrl = '';
    }
  };

  return {
    prepareFrameAtSourceTime,
    getFrame,
    dispose,
  };
}

/**
 * Helper used synchronously inside video styles during render().
 * Calls `content.videoGetFrame(sourceTime)` if present, else falls back cleanly to poster or default sample.
 */
export function resolveVideoDrawableAtTime(
  content: {
    videoGetFrame?: (sourceTime: number) => HTMLImageElement | HTMLCanvasElement | null;
    videoPosterSource?: HTMLImageElement | HTMLCanvasElement | null;
  },
  sourceTime: number
): HTMLImageElement | HTMLCanvasElement {
  if (content.videoGetFrame) {
    const f = content.videoGetFrame(sourceTime);
    if (f) return f;
  }
  if (content.videoPosterSource) {
    return content.videoPosterSource;
  }
  return getDefaultVideoFrameAt(sourceTime);
}

/**
 * Returns the clip's display aspect ratio (width / height after rotation metadata),
 * checking metadata first, then poster/frame dimensions.
 */
export function getVideoDisplayAspect(
  content: {
    videoMeta?: VideoSourceMetadata | null;
    videoPosterSource?: HTMLImageElement | HTMLCanvasElement | null;
  },
  fallbackDrawable?: HTMLImageElement | HTMLCanvasElement | null
): number {
  if (
    content.videoMeta &&
    content.videoMeta.displayWidth > 0 &&
    content.videoMeta.displayHeight > 0
  ) {
    return clamp(content.videoMeta.displayWidth / content.videoMeta.displayHeight, 0.25, 4.0);
  }
  const src = fallbackDrawable || content.videoPosterSource;
  if (src) {
    const w =
      'naturalWidth' in src && src.naturalWidth > 0
        ? src.naturalWidth
        : src.width || 16;
    const h =
      'naturalHeight' in src && src.naturalHeight > 0
        ? src.naturalHeight
        : src.height || 9;
    if (w > 0 && h > 0) {
      return clamp(w / h, 0.25, 4.0);
    }
  }
  return 16 / 9;
}

export function formatVideoTimeSeconds(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export { lerp };
