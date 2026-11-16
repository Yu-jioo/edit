import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import {
  FlyerCricketPresetId,
  SceneEventTimes,
  SfxSettings,
  SfxType,
  StyleCustomization,
  VideoEndBehavior,
} from '../types';
import { clamp } from './math';
import { combineSeed, mulberry32 } from './random';

export interface FlyerCricketPresetMeta {
  id: FlyerCricketPresetId;
  labelAr: string;
  descriptionAr: string;
}

export const FLYER_CRICKET_PRESETS: readonly FlyerCricketPresetMeta[] = [
  {
    id: 'distant_soft',
    labelAr: 'بعيد ناعم',
    descriptionAr: 'صرير ليلي بعيد بدفء هادئ',
  },
  {
    id: 'damp_forest',
    labelAr: 'غابة رطبة',
    descriptionAr: 'صوتان ناعمان مع صدى غابة رطبة',
  },
  {
    id: 'midnight_calm',
    labelAr: 'سكون منتصف الليل',
    descriptionAr: 'نغمة عميقة متباعدة ومريحة',
  },
] as const;

export const DEFAULT_FLYER_CRICKET_PRESET: FlyerCricketPresetId = 'distant_soft';
export const DEFAULT_FLYER_CRICKET_VOLUME = 0.35;

export function resolveFlyerCricketPreset(
  preset?: string | null
): FlyerCricketPresetId {
  if (
    preset === 'distant_soft' ||
    preset === 'damp_forest' ||
    preset === 'midnight_calm'
  ) {
    return preset;
  }
  return DEFAULT_FLYER_CRICKET_PRESET;
}

export function resolveFlyerCricketVolume(volume?: number | null): number {
  if (typeof volume === 'number' && Number.isFinite(volume)) {
    return clamp(volume, 0.05, 1.0);
  }
  return DEFAULT_FLYER_CRICKET_VOLUME;
}

export function isFlyerAudioCustomization(
  custom?: Partial<StyleCustomization>
): boolean {
  if (!custom) return false;
  if (custom.mode === 'phrase') {
    return (custom.phraseStyleId || custom.styleId) === 'phrase_flyer';
  }
  if (custom.mode === 'points') {
    return (custom.pointsStyleId || custom.styleId) === 'pts_flyer';
  }
  return custom.styleId === 'phrase_flyer' || custom.styleId === 'pts_flyer';
}

export function hasFlyerCricketAudio(
  custom?: Partial<StyleCustomization>
): boolean {
  if (!isFlyerAudioCustomization(custom)) return false;
  if (!custom?.flyerCricketEnabled) return false;
  return resolveFlyerCricketVolume(custom.flyerCricketVolume) > 0.005;
}

/**
 * Generates a deterministic white-noise AudioBuffer using our seeded mulberry32 PRNG.
 */
function createSeededNoiseBuffer(
  audioCtx: BaseAudioContext,
  durationSec: number,
  seed: number
): AudioBuffer {
  const sampleRate = audioCtx.sampleRate;
  const length = Math.max(1, Math.floor(durationSec * sampleRate));
  const buffer = audioCtx.createBuffer(2, length, sampleRate);
  const rngL = mulberry32(combineSeed(seed, 8001));
  const rngR = mulberry32(combineSeed(seed, 8002));

  const chL = buffer.getChannelData(0);
  const chR = buffer.getChannelData(1);
  for (let i = 0; i < length; i++) {
    chL[i] = rngL() * 2 - 1;
    chR[i] = rngR() * 2 - 1;
  }
  return buffer;
}

/**
 * Generates a synthetic stereo reverb impulse response buffer (~0.8s exponential decay)
 * using our seeded PRNG for ConvolverNode impact tails.
 */
function createSeededReverbImpulse(
  audioCtx: BaseAudioContext,
  durationSec: number,
  seed: number
): AudioBuffer {
  const sampleRate = audioCtx.sampleRate;
  const length = Math.max(1, Math.floor(durationSec * sampleRate));
  const impulse = audioCtx.createBuffer(2, length, sampleRate);
  const rngL = mulberry32(combineSeed(seed, 8101));
  const rngR = mulberry32(combineSeed(seed, 8102));

  const chL = impulse.getChannelData(0);
  const chR = impulse.getChannelData(1);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 5.2);
    chL[i] = (rngL() * 2 - 1) * env * 0.45;
    chR[i] = (rngR() * 2 - 1) * env * 0.45;
  }
  return impulse;
}

/**
 * Schedules a single synthesized sound effect ('whoosh' | 'impact' | 'whoosh-impact' | 'pop')
 * into `destination` at `triggerTime` (relative to audioCtx.currentTime).
 */
function scheduleSingleSfxAtTime(
  audioCtx: BaseAudioContext,
  destination: AudioNode,
  sfxType: SfxType,
  triggerTime: number,
  gainLevel: number,
  noiseBuffer: AudioBuffer,
  reverbBuffer: AudioBuffer,
  activeNodes: AudioScheduledSourceNode[]
) {
  const t0 = Math.max(audioCtx.currentTime, triggerTime);

  const scheduleWhoosh = (startT: number, vol: number) => {
    const dur = 0.5;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(2.2, startT);
    filter.frequency.setValueAtTime(300, startT);
    filter.frequency.exponentialRampToValueAtTime(3000, startT + dur * 0.72);
    filter.frequency.exponentialRampToValueAtTime(500, startT + dur);

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0.0001, startT);
    env.gain.linearRampToValueAtTime(vol * 0.85, startT + dur * 0.45);
    env.gain.exponentialRampToValueAtTime(0.0001, startT + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(destination);

    src.start(startT, 0, dur + 0.05);
    src.stop(startT + dur + 0.05);
    activeNodes.push(src);
  };

  const scheduleImpact = (startT: number, vol: number) => {
    const dur = 0.8;

    // 1. Sub-bass sine thump (120 -> 40 Hz)
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, startT);
    osc.frequency.exponentialRampToValueAtTime(40, startT + 0.28);

    const oscGain = audioCtx.createGain();
    oscGain.gain.setValueAtTime(0.001, startT);
    oscGain.gain.linearRampToValueAtTime(vol * 0.95, startT + 0.012);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, startT + 0.55);

    osc.connect(oscGain);
    oscGain.connect(destination);

    osc.start(startT);
    osc.stop(startT + 0.58);
    activeNodes.push(osc);

    // 2. Low-passed noise burst + Convolver reverb tail (~0.8s)
    const noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(950, startT);
    lp.frequency.exponentialRampToValueAtTime(140, startT + 0.4);

    const burstGain = audioCtx.createGain();
    burstGain.gain.setValueAtTime(0.001, startT);
    burstGain.gain.linearRampToValueAtTime(vol * 0.65, startT + 0.01);
    burstGain.gain.exponentialRampToValueAtTime(0.0001, startT + 0.35);

    const convolver = audioCtx.createConvolver();
    convolver.buffer = reverbBuffer;

    const wetGain = audioCtx.createGain();
    wetGain.gain.setValueAtTime(vol * 0.48, startT);
    wetGain.gain.exponentialRampToValueAtTime(0.0001, startT + dur);

    noiseSrc.connect(lp);
    lp.connect(burstGain);
    burstGain.connect(destination);
    burstGain.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(destination);

    noiseSrc.start(startT, 0, dur);
    noiseSrc.stop(startT + dur);
    activeNodes.push(noiseSrc);
  };

  const schedulePop = (startT: number, vol: number) => {
    const dur = 0.08; // ~80ms soft pop
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, startT);
    osc.frequency.exponentialRampToValueAtTime(300, startT + dur);

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0.001, startT);
    env.gain.linearRampToValueAtTime(vol * 0.75, startT + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, startT + dur);

    osc.connect(env);
    env.connect(destination);

    osc.start(startT);
    osc.stop(startT + dur + 0.01);
    activeNodes.push(osc);
  };

  // Camera click ("Shutter"): two short seeded noise bursts + a low click
  const scheduleShutter = (startT: number, vol: number) => {
    const burstOffsets = [0, 0.048];
    const burstFreqs = [2800, 3400];

    for (let b = 0; b < burstOffsets.length; b++) {
      const bStart = startT + burstOffsets[b];
      const bDur = 0.024;
      const noiseSrc = audioCtx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;

      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.setValueAtTime(3.2, bStart);
      bp.frequency.setValueAtTime(burstFreqs[b], bStart);

      const env = audioCtx.createGain();
      env.gain.setValueAtTime(0.001, bStart);
      env.gain.linearRampToValueAtTime(vol * (b === 0 ? 0.85 : 0.72), bStart + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, bStart + bDur);

      noiseSrc.connect(bp);
      bp.connect(env);
      env.connect(destination);

      noiseSrc.start(bStart, b * 0.15, bDur + 0.005);
      noiseSrc.stop(bStart + bDur + 0.005);
      activeNodes.push(noiseSrc);
    }

    // Low mechanical mirror click
    const clickOsc = audioCtx.createOscillator();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(190, startT);
    clickOsc.frequency.exponentialRampToValueAtTime(65, startT + 0.038);

    const clickGain = audioCtx.createGain();
    clickGain.gain.setValueAtTime(0.001, startT);
    clickGain.gain.linearRampToValueAtTime(vol * 0.78, startT + 0.003);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, startT + 0.042);

    clickOsc.connect(clickGain);
    clickGain.connect(destination);

    clickOsc.start(startT);
    clickOsc.stop(startT + 0.045);
    activeNodes.push(clickOsc);
  };

  // Paper/card slap ("Slap"): low-passed noise thud with a short thump
  const scheduleSlap = (startT: number, vol: number) => {
    const dur = 0.14;
    const noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1150, startT);
    lp.frequency.exponentialRampToValueAtTime(210, startT + dur);

    const noiseEnv = audioCtx.createGain();
    noiseEnv.gain.setValueAtTime(0.001, startT);
    noiseEnv.gain.linearRampToValueAtTime(vol * 0.85, startT + 0.005);
    noiseEnv.gain.exponentialRampToValueAtTime(0.0001, startT + dur);

    noiseSrc.connect(lp);
    lp.connect(noiseEnv);
    noiseEnv.connect(destination);

    noiseSrc.start(startT, 0.25, dur + 0.01);
    noiseSrc.stop(startT + dur + 0.01);
    activeNodes.push(noiseSrc);

    // Short body thump
    const thumpOsc = audioCtx.createOscillator();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(145, startT);
    thumpOsc.frequency.exponentialRampToValueAtTime(52, startT + 0.095);

    const thumpGain = audioCtx.createGain();
    thumpGain.gain.setValueAtTime(0.001, startT);
    thumpGain.gain.linearRampToValueAtTime(vol * 0.88, startT + 0.006);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, startT + 0.11);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(destination);

    thumpOsc.start(startT);
    thumpOsc.stop(startT + 0.12);
    activeNodes.push(thumpOsc);
  };

  // Play Click ("Play Click"): crisp tactile play-button double-transient + clean bright ping
  const schedulePlayClick = (startT: number, vol: number) => {
    const clickOsc = audioCtx.createOscillator();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(160, startT);
    clickOsc.frequency.exponentialRampToValueAtTime(58, startT + 0.025);

    const clickEnv = audioCtx.createGain();
    clickEnv.gain.setValueAtTime(0.001, startT);
    clickEnv.gain.linearRampToValueAtTime(vol * 0.85, startT + 0.002);
    clickEnv.gain.exponentialRampToValueAtTime(0.0001, startT + 0.028);

    clickOsc.connect(clickEnv);
    clickEnv.connect(destination);
    clickOsc.start(startT);
    clickOsc.stop(startT + 0.032);
    activeNodes.push(clickOsc);

    const pingOsc = audioCtx.createOscillator();
    pingOsc.type = 'sine';
    pingOsc.frequency.setValueAtTime(860, startT + 0.008);
    pingOsc.frequency.exponentialRampToValueAtTime(1320, startT + 0.055);

    const pingEnv = audioCtx.createGain();
    pingEnv.gain.setValueAtTime(0.001, startT + 0.008);
    pingEnv.gain.linearRampToValueAtTime(vol * 0.58, startT + 0.012);
    pingEnv.gain.exponentialRampToValueAtTime(0.0001, startT + 0.068);

    pingOsc.connect(pingEnv);
    pingEnv.connect(destination);
    pingOsc.start(startT + 0.008);
    pingOsc.stop(startT + 0.075);
    activeNodes.push(pingOsc);
  };

  // Glitch ("Glitch"): seeded micro-buffer chop + pitch-jumped digital static bursts
  const scheduleGlitch = (startT: number, vol: number) => {
    const offsets = [0, 0.032, 0.058, 0.095];
    const freqs = [1950, 620, 3400, 1280];
    const durs = [0.022, 0.018, 0.026, 0.02];

    for (let i = 0; i < offsets.length; i++) {
      const bStart = startT + offsets[i];
      const bDur = durs[i];

      const nSrc = audioCtx.createBufferSource();
      nSrc.buffer = noiseBuffer;
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.setValueAtTime(4.2, bStart);
      bp.frequency.setValueAtTime(freqs[i], bStart);

      const nEnv = audioCtx.createGain();
      nEnv.gain.setValueAtTime(0.001, bStart);
      nEnv.gain.linearRampToValueAtTime(vol * 0.72, bStart + 0.002);
      nEnv.gain.exponentialRampToValueAtTime(0.0001, bStart + bDur);

      nSrc.connect(bp);
      bp.connect(nEnv);
      nEnv.connect(destination);
      nSrc.start(bStart, (i * 0.17) % 0.8, bDur + 0.004);
      nSrc.stop(bStart + bDur + 0.004);
      activeNodes.push(nSrc);

      const sq = audioCtx.createOscillator();
      sq.type = 'sawtooth';
      sq.frequency.setValueAtTime(freqs[i] * 0.45, bStart);
      sq.frequency.setValueAtTime(freqs[i] * 0.22, bStart + bDur * 0.5);

      const sqEnv = audioCtx.createGain();
      sqEnv.gain.setValueAtTime(0.001, bStart);
      sqEnv.gain.linearRampToValueAtTime(vol * 0.24, bStart + 0.002);
      sqEnv.gain.exponentialRampToValueAtTime(0.0001, bStart + bDur);

      sq.connect(sqEnv);
      sqEnv.connect(destination);
      sq.start(bStart);
      sq.stop(bStart + bDur + 0.004);
      activeNodes.push(sq);
    }
  };

  if (sfxType === 'whoosh') {
    scheduleWhoosh(t0, gainLevel);
  } else if (sfxType === 'impact') {
    scheduleImpact(t0, gainLevel);
  } else if (sfxType === 'whoosh-impact') {
    scheduleWhoosh(t0, gainLevel * 0.85);
    scheduleImpact(t0 + 0.24, gainLevel);
  } else if (sfxType === 'pop') {
    schedulePop(t0, gainLevel);
  } else if (sfxType === 'shutter') {
    scheduleShutter(t0, gainLevel);
  } else if (sfxType === 'slap') {
    scheduleSlap(t0, gainLevel);
  } else if (sfxType === 'play-click') {
    schedulePlayClick(t0, gainLevel);
  } else if (sfxType === 'glitch') {
    scheduleGlitch(t0, gainLevel);
  }
}

/**
 * Schedules a single seeded keystroke click (or heavier mechanical typewriter thunk) at `triggerTime`.
 */
function scheduleKeystrokeClickAtTime(
  audioCtx: BaseAudioContext,
  destination: AudioNode,
  triggerTime: number,
  gainLevel: number,
  noiseBuffer: AudioBuffer,
  isMechanical: boolean,
  stepSeed: number,
  activeNodes: AudioScheduledSourceNode[]
) {
  const t0 = Math.max(audioCtx.currentTime, triggerTime);
  const rng = mulberry32(stepSeed);
  const vel = (0.82 + rng() * 0.26) * gainLevel;
  const noiseOffset = rng() * 0.6;

  if (isMechanical) {
    // Heavier mechanical typewriter thunk: body thump + metallic strike
    const bodyOsc = audioCtx.createOscillator();
    bodyOsc.type = 'triangle';
    const baseFreq = 185 + rng() * 45;
    bodyOsc.frequency.setValueAtTime(baseFreq, t0);
    bodyOsc.frequency.exponentialRampToValueAtTime(58, t0 + 0.036);

    const bodyGain = audioCtx.createGain();
    bodyGain.gain.setValueAtTime(0.001, t0);
    bodyGain.gain.linearRampToValueAtTime(vel * 0.68, t0 + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.042);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(destination);
    bodyOsc.start(t0);
    bodyOsc.stop(t0 + 0.045);
    activeNodes.push(bodyOsc);

    // Metallic strike transient
    const noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(2.6, t0);
    bp.frequency.setValueAtTime(1450 + rng() * 550, t0);

    const strikeGain = audioCtx.createGain();
    strikeGain.gain.setValueAtTime(0.001, t0);
    strikeGain.gain.linearRampToValueAtTime(vel * 0.85, t0 + 0.002);
    strikeGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.028);

    noiseSrc.connect(bp);
    bp.connect(strikeGain);
    strikeGain.connect(destination);
    noiseSrc.start(t0, noiseOffset, 0.035);
    noiseSrc.stop(t0 + 0.035);
    activeNodes.push(noiseSrc);
  } else {
    // Crisp digital/terminal key click: short noise burst + high tick
    const noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(3.8, t0);
    bp.frequency.setValueAtTime(2200 + rng() * 750, t0);

    const clickGain = audioCtx.createGain();
    clickGain.gain.setValueAtTime(0.001, t0);
    clickGain.gain.linearRampToValueAtTime(vel * 0.72, t0 + 0.0015);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.018);

    noiseSrc.connect(bp);
    bp.connect(clickGain);
    clickGain.connect(destination);
    noiseSrc.start(t0, noiseOffset, 0.022);
    noiseSrc.stop(t0 + 0.022);
    activeNodes.push(noiseSrc);
  }
}

/**
 * Schedules a vintage typewriter carriage-return bell "ding" at each line end.
 */
function scheduleTypewriterBellDingAtTime(
  audioCtx: BaseAudioContext,
  destination: AudioNode,
  triggerTime: number,
  gainLevel: number,
  activeNodes: AudioScheduledSourceNode[]
) {
  const t0 = Math.max(audioCtx.currentTime, triggerTime);
  const dur = 0.46;

  // Fundamental bell tone (~2380 Hz) + bright metallic overtone (~4760 Hz)
  const freqs = [2380, 4760];
  const weights = [0.48, 0.22];

  for (let i = 0; i < freqs.length; i++) {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqs[i], t0);

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gainLevel * weights[i], t0 + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + (i === 0 ? dur : dur * 0.55));

    osc.connect(env);
    env.connect(destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    activeNodes.push(osc);
  }
}

/**
 * Schedules a "Message Pop" sound effect:
 * - isSend = true: crisp rising soft pop (460 Hz -> 740 Hz, ~78ms)
 * - isSend = false (receive): warm lower pop (380 Hz -> 240 Hz, ~95ms)
 */
function scheduleMessagePopAtTime(
  audioCtx: BaseAudioContext,
  destination: AudioNode,
  triggerTime: number,
  gainLevel: number,
  isSend: boolean,
  activeNodes: AudioScheduledSourceNode[]
) {
  const t0 = Math.max(audioCtx.currentTime, triggerTime);
  const dur = isSend ? 0.078 : 0.095;

  const osc = audioCtx.createOscillator();
  osc.type = isSend ? 'sine' : 'triangle';
  if (isSend) {
    osc.frequency.setValueAtTime(460, t0);
    osc.frequency.exponentialRampToValueAtTime(740, t0 + dur);
  } else {
    osc.frequency.setValueAtTime(380, t0);
    osc.frequency.exponentialRampToValueAtTime(240, t0 + dur);
  }

  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0.001, t0);
  env.gain.linearRampToValueAtTime(gainLevel * (isSend ? 0.78 : 0.72), t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(env);
  env.connect(destination);

  osc.start(t0);
  osc.stop(t0 + dur + 0.01);
  activeNodes.push(osc);
}

/**
 * Single unified Web Audio SFX graph builder used by both live preview and OfflineAudioContext MP4 export.
 * Returns a stop() function to immediately silence and disconnect scheduled sources.
 */
export function buildSfxGraph(
  audioCtx: BaseAudioContext,
  sfxSettings: SfxSettings,
  eventTimes: SceneEventTimes,
  seed: number = 1042,
  playbackCursorSec: number = 0
): { stop: () => void } {
  if (!sfxSettings.enabled || sfxSettings.volume <= 0.001) {
    return { stop: () => {} };
  }

  const masterGain = audioCtx.createGain();
  masterGain.gain.value = clamp(sfxSettings.volume, 0, 1);
  masterGain.connect(audioCtx.destination);

  const noiseBuffer = createSeededNoiseBuffer(audioCtx, 1.2, seed);
  const reverbBuffer = createSeededReverbImpulse(audioCtx, 0.85, seed);
  const activeNodes: AudioScheduledSourceNode[] = [];

  const now = audioCtx.currentTime;
  const offset = clamp(sfxSettings.offset, -0.3, 0.3);

  if (sfxSettings.type === 'message-pop') {
    const sends = eventTimes.sendTimes || [];
    const receives = eventTimes.receiveTimes || [];

    if (sends.length === 0 && receives.length === 0) {
      const mainSceneTime = Math.max(0, eventTimes.enterStart + offset);
      if (mainSceneTime >= playbackCursorSec - 0.04) {
        const delayFromCursor = Math.max(0, mainSceneTime - playbackCursorSec);
        scheduleMessagePopAtTime(
          audioCtx,
          masterGain,
          now + delayFromCursor,
          0.9,
          true,
          activeNodes
        );
      }
    } else {
      for (const sTime of sends) {
        const sceneT = Math.max(0, sTime + offset);
        if (sceneT >= playbackCursorSec - 0.03) {
          const delay = Math.max(0, sceneT - playbackCursorSec);
          scheduleMessagePopAtTime(audioCtx, masterGain, now + delay, 0.9, true, activeNodes);
        }
      }
      for (const rTime of receives) {
        const sceneT = Math.max(0, rTime + offset);
        if (sceneT >= playbackCursorSec - 0.03) {
          const delay = Math.max(0, sceneT - playbackCursorSec);
          scheduleMessagePopAtTime(audioCtx, masterGain, now + delay, 0.85, false, activeNodes);
        }
      }
    }
  } else if (sfxSettings.type === 'key-clicks') {
    const isMechanical = Boolean(eventTimes.isMechanicalTypewriter);
    const keystrokeList =
      eventTimes.keystrokeTimes && eventTimes.keystrokeTimes.length > 0
        ? eventTimes.keystrokeTimes
        : Array.from({ length: 14 }, (_, idx) => eventTimes.enterStart + idx * (1 / 18));

    for (let i = 0; i < keystrokeList.length; i++) {
      const clickSceneTime = Math.max(0, keystrokeList[i] + offset);
      if (clickSceneTime >= playbackCursorSec - 0.02) {
        const delayFromCursor = Math.max(0, clickSceneTime - playbackCursorSec);
        scheduleKeystrokeClickAtTime(
          audioCtx,
          masterGain,
          now + delayFromCursor,
          0.9,
          noiseBuffer,
          isMechanical,
          combineSeed(seed, 9200 + i * 31),
          activeNodes
        );
      }
    }

    // Heavier thunk on Enter in terminal chat
    const enterKeys = eventTimes.enterKeyTimes || eventTimes.sendTimes || [];
    for (let eIdx = 0; eIdx < enterKeys.length; eIdx++) {
      const enterSceneTime = Math.max(0, enterKeys[eIdx] + offset);
      if (enterSceneTime >= playbackCursorSec - 0.02) {
        const delayFromCursor = Math.max(0, enterSceneTime - playbackCursorSec);
        scheduleKeystrokeClickAtTime(
          audioCtx,
          masterGain,
          now + delayFromCursor,
          1.05,
          noiseBuffer,
          true, // heavier mechanical thunk on Enter
          combineSeed(seed, 9800 + eIdx * 47),
          activeNodes
        );
      }
    }

    if (isMechanical && eventTimes.lineEndTimes && eventTimes.lineEndTimes.length > 0) {
      for (const bellRaw of eventTimes.lineEndTimes) {
        const bellSceneTime = Math.max(0, bellRaw + offset + 0.02);
        if (bellSceneTime >= playbackCursorSec - 0.02) {
          const delayFromCursor = Math.max(0, bellSceneTime - playbackCursorSec);
          scheduleTypewriterBellDingAtTime(
            audioCtx,
            masterGain,
            now + delayFromCursor,
            0.85,
            activeNodes
          );
        }
      }
    }
  } else {
    // 1. Main scene enter sound effect
    const mainSceneTime = Math.max(0, eventTimes.enterStart + offset);
    if (mainSceneTime >= playbackCursorSec - 0.04) {
      const delayFromCursor = Math.max(0, mainSceneTime - playbackCursorSec);
      scheduleSingleSfxAtTime(
        audioCtx,
        masterGain,
        sfxSettings.type,
        now + delayFromCursor,
        1.0,
        noiseBuffer,
        reverbBuffer,
        activeNodes
      );
    }
  }

  // 2. Optional keyword hit sound effect ("ضربة عند الكلمة المفتاحية")
  if (sfxSettings.keywordHit && eventTimes.keywordTimes.length > 0) {
    const kwHitType: SfxType =
      sfxSettings.type === 'pop' || sfxSettings.type === 'message-pop' ? 'pop' : 'impact';
    const mainSceneTime = Math.max(0, eventTimes.enterStart + offset);
    for (const kwTimeRaw of eventTimes.keywordTimes) {
      const kwSceneTime = Math.max(0, kwTimeRaw + offset);
      // Avoid double-triggering if keyword hit is within 80ms of main enter SFX (when not using key-clicks/message-pop)
      if (
        sfxSettings.type !== 'key-clicks' &&
        sfxSettings.type !== 'message-pop' &&
        Math.abs(kwSceneTime - mainSceneTime) < 0.08
      ) {
        continue;
      }
      if (kwSceneTime >= playbackCursorSec - 0.04) {
        const delayFromCursor = Math.max(0, kwSceneTime - playbackCursorSec);
        scheduleSingleSfxAtTime(
          audioCtx,
          masterGain,
          kwHitType,
          now + delayFromCursor,
          0.82,
          noiseBuffer,
          reverbBuffer,
          activeNodes
        );
      }
    }
  }

  // 3. Optional per-point hit sound effect ("نقرة عند كل نقطة")
  if (sfxSettings.itemHit && eventTimes.itemTimes && eventTimes.itemTimes.length > 0) {
    const hasTerminalKeystrokes =
      Boolean(eventTimes.keystrokeTimes && eventTimes.keystrokeTimes.length > 0);
    if (hasTerminalKeystrokes && sfxSettings.type !== 'key-clicks') {
      // For pts_terminal when main SFX type isn't already key-clicks, play terminal key clicks
      const keystrokeList = eventTimes.keystrokeTimes!;
      for (let i = 0; i < keystrokeList.length; i++) {
        const clickSceneTime = Math.max(0, keystrokeList[i] + offset);
        if (clickSceneTime >= playbackCursorSec - 0.02) {
          const delayFromCursor = Math.max(0, clickSceneTime - playbackCursorSec);
          scheduleKeystrokeClickAtTime(
            audioCtx,
            masterGain,
            now + delayFromCursor,
            0.85,
            noiseBuffer,
            false,
            combineSeed(seed, 9400 + i * 29),
            activeNodes
          );
        }
      }
    } else if (!hasTerminalKeystrokes) {
      // Reuse Soft Pop ('pop') at each item reveal time
      const mainSceneTime = Math.max(0, eventTimes.enterStart + offset);
      for (let idx = 0; idx < eventTimes.itemTimes.length; idx++) {
        const itemTimeRaw = eventTimes.itemTimes[idx];
        const itemSceneTime = Math.max(0, itemTimeRaw + offset);
        if (
          sfxSettings.type === 'pop' &&
          idx === 0 &&
          Math.abs(itemSceneTime - mainSceneTime) < 0.06
        ) {
          continue;
        }
        if (itemSceneTime >= playbackCursorSec - 0.04) {
          const delayFromCursor = Math.max(0, itemSceneTime - playbackCursorSec);
          scheduleSingleSfxAtTime(
            audioCtx,
            masterGain,
            'pop',
            now + delayFromCursor,
            0.85,
            noiseBuffer,
            reverbBuffer,
            activeNodes
          );
        }
      }
    }
  }

  return {
    stop: () => {
      for (const node of activeNodes) {
        try {
          node.stop();
          node.disconnect();
        } catch {
          // Ignore already stopped nodes
        }
      }
      try {
        masterGain.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    },
  };
}

export interface FlyerCricketAudioConfig {
  enabled: boolean;
  preset: FlyerCricketPresetId;
  volume: number;
}

interface CricketAcousticProfile {
  salt: number;
  baseFreqHz: number;
  altFreqHz?: number;
  harmonicRatio: number;
  pulsesMin: number;
  pulsesMax: number;
  pulseDurSec: number;
  pulseGapSec: number;
  minRestSec: number;
  maxRestSec: number;
  lowpassHz: number;
  reverbWet: number;
  breezeLevel: number;
  voiceGain: number;
  panBase: number;
  dualAlternating: boolean;
}

const CRICKET_ACOUSTIC_PROFILES: Record<FlyerCricketPresetId, CricketAcousticProfile> = {
  distant_soft: {
    salt: 4111,
    baseFreqHz: 3680,
    harmonicRatio: 0.065,
    pulsesMin: 3,
    pulsesMax: 3,
    pulseDurSec: 0.024,
    pulseGapSec: 0.017,
    minRestSec: 1.55,
    maxRestSec: 2.35,
    lowpassHz: 4500,
    reverbWet: 0.28,
    breezeLevel: 0.016,
    voiceGain: 0.24,
    panBase: 0.14,
    dualAlternating: false,
  },
  damp_forest: {
    salt: 5237,
    baseFreqHz: 4080,
    altFreqHz: 3860,
    harmonicRatio: 0.08,
    pulsesMin: 3,
    pulsesMax: 4,
    pulseDurSec: 0.02,
    pulseGapSec: 0.014,
    minRestSec: 1.15,
    maxRestSec: 1.9,
    lowpassHz: 4950,
    reverbWet: 0.42,
    breezeLevel: 0.026,
    voiceGain: 0.22,
    panBase: 0.28,
    dualAlternating: true,
  },
  midnight_calm: {
    salt: 6793,
    baseFreqHz: 3340,
    harmonicRatio: 0.045,
    pulsesMin: 2,
    pulsesMax: 3,
    pulseDurSec: 0.028,
    pulseGapSec: 0.02,
    minRestSec: 2.1,
    maxRestSec: 3.1,
    lowpassHz: 3950,
    reverbWet: 0.34,
    breezeLevel: 0.013,
    voiceGain: 0.23,
    panBase: -0.1,
    dualAlternating: false,
  },
};

/**
 * Deterministic Web Audio synthesizer for the 3 calm night cricket sound presets.
 * Used identically during live preview playback, instant sound auditions, and offline MP4 export.
 */
export function buildFlyerCricketGraph(
  audioCtx: BaseAudioContext,
  config: FlyerCricketAudioConfig,
  totalDurationSec: number,
  seed: number = 1042,
  playbackCursorSec: number = 0,
  options?: { auditionOnly?: boolean }
): { stop: () => void; setVolume: (nextVol: number) => void; scheduledChirpCount: number } {
  const safeVol = resolveFlyerCricketVolume(config.volume);
  if (!config.enabled || safeVol <= 0.005 || totalDurationSec <= 0.05) {
    return { stop: () => {}, setVolume: () => {}, scheduledChirpCount: 0 };
  }

  const preset = resolveFlyerCricketPreset(config.preset);
  const profile = CRICKET_ACOUSTIC_PROFILES[preset];
  const auditionOnly = Boolean(options?.auditionOnly);
  const effectiveEndSec = auditionOnly
    ? Math.min(totalDurationSec, playbackCursorSec + 1.25)
    : totalDurationSec;
  const remainingSec = Math.max(0.12, effectiveEndSec - playbackCursorSec);

  const masterGain = audioCtx.createGain();
  const now = audioCtx.currentTime;
  const fadeInSec = auditionOnly ? 0.03 : Math.min(0.24, remainingSec * 0.2);
  const fadeOutSec = auditionOnly ? 0.22 : Math.min(0.38, remainingSec * 0.22);

  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.linearRampToValueAtTime(safeVol, now + fadeInSec);
  if (remainingSec > fadeInSec + fadeOutSec + 0.02) {
    masterGain.gain.setValueAtTime(safeVol, now + remainingSec - fadeOutSec);
  }
  masterGain.gain.linearRampToValueAtTime(0.0001, now + remainingSec);
  masterGain.connect(audioCtx.destination);

  // Air-absorption low-pass filter keeping the cricket warm and soft on the ear
  const airFilter = audioCtx.createBiquadFilter();
  airFilter.type = 'lowpass';
  airFilter.frequency.setValueAtTime(profile.lowpassHz, now);
  airFilter.Q.setValueAtTime(0.7, now);
  airFilter.connect(masterGain);

  const reverbBuffer = createSeededReverbImpulse(audioCtx, 0.95, combineSeed(seed, profile.salt));
  const convolver = audioCtx.createConvolver();
  convolver.buffer = reverbBuffer;
  const wetGain = audioCtx.createGain();
  wetGain.gain.value = profile.reverbWet;
  convolver.connect(wetGain);
  wetGain.connect(airFilter);

  const activeNodes: AudioScheduledSourceNode[] = [];

  // Ultra-subtle nocturnal breeze bed so the silence between chirps feels deep and natural
  const noiseBuffer = createSeededNoiseBuffer(audioCtx, 1.5, combineSeed(seed, profile.salt + 99));
  const breezeSrc = audioCtx.createBufferSource();
  breezeSrc.buffer = noiseBuffer;
  breezeSrc.loop = true;

  const breezeFilter = audioCtx.createBiquadFilter();
  breezeFilter.type = 'lowpass';
  breezeFilter.frequency.setValueAtTime(340, now);
  breezeFilter.Q.setValueAtTime(0.6, now);

  const breezeGain = audioCtx.createGain();
  breezeGain.gain.setValueAtTime(auditionOnly ? profile.breezeLevel * 0.6 : profile.breezeLevel, now);

  breezeSrc.connect(breezeFilter);
  breezeFilter.connect(breezeGain);
  breezeGain.connect(masterGain);
  breezeSrc.start(now);
  breezeSrc.stop(now + remainingSec + 0.05);
  activeNodes.push(breezeSrc);

  // Build deterministic timeline of cricket chirps across [0, effectiveEndSec]
  const rng = mulberry32(combineSeed(seed, profile.salt + 17));
  const firstChirpSceneTime = auditionOnly
    ? playbackCursorSec + 0.03
    : 0.22 + rng() * 0.22;

  interface ChirpEvent {
    sceneTime: number;
    freqHz: number;
    pulses: number;
    pan: number;
    ampScale: number;
  }

  const chirps: ChirpEvent[] = [];
  if (auditionOnly) {
    chirps.push({
      sceneTime: firstChirpSceneTime,
      freqHz: profile.baseFreqHz,
      pulses: profile.pulsesMax,
      pan: profile.panBase,
      ampScale: 1.0,
    });
    if (profile.dualAlternating && profile.altFreqHz) {
      chirps.push({
        sceneTime: firstChirpSceneTime + 0.48,
        freqHz: profile.altFreqHz,
        pulses: profile.pulsesMin,
        pan: -profile.panBase,
        ampScale: 0.85,
      });
    }
  } else {
    let cursor = firstChirpSceneTime;
    let idx = 0;
    while (cursor < totalDurationSec - 0.14) {
      const useAlt = profile.dualAlternating && Boolean(profile.altFreqHz) && idx % 2 === 1;
      const baseF = useAlt ? profile.altFreqHz! : profile.baseFreqHz;
      const freqJitter = 1 + (rng() - 0.5) * 0.022;
      const pulses =
        profile.pulsesMin === profile.pulsesMax
          ? profile.pulsesMin
          : profile.pulsesMin + Math.floor(rng() * (profile.pulsesMax - profile.pulsesMin + 1));
      const pan = useAlt
        ? -profile.panBase
        : profile.panBase + (rng() - 0.5) * 0.12;
      const ampScale = 0.86 + rng() * 0.26;

      chirps.push({
        sceneTime: cursor,
        freqHz: baseF * freqJitter,
        pulses,
        pan: clamp(pan, -0.6, 0.6),
        ampScale,
      });

      const rest = profile.minRestSec + rng() * (profile.maxRestSec - profile.minRestSec);
      const secondaryEchoGap =
        profile.dualAlternating && idx % 2 === 0 ? 0.55 + rng() * 0.35 : rest;
      cursor += secondaryEchoGap;
      idx++;
    }
  }

  let scheduledChirpCount = 0;
  for (const chirp of chirps) {
    const stepDur = profile.pulseDurSec + profile.pulseGapSec;
    const totalChirpDur = chirp.pulses * stepDur + 0.03;
    if (chirp.sceneTime + totalChirpDur < playbackCursorSec) {
      continue;
    }
    if (chirp.sceneTime >= effectiveEndSec - 0.04) {
      continue;
    }

    const relDelay = Math.max(0.005, chirp.sceneTime - playbackCursorSec);
    const startT = now + relDelay;
    const stopT = startT + totalChirpDur;

    // Primary resonant stridulation carrier + faint natural 2nd harmonic
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(chirp.freqHz, startT);
    // Subtle organic pitch droop across the chirp like real wing deceleration
    osc1.frequency.linearRampToValueAtTime(chirp.freqHz * 0.991, stopT);

    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(chirp.freqHz * 2, startT);

    const osc2Gain = audioCtx.createGain();
    osc2Gain.gain.value = profile.harmonicRatio;

    const chirpEnv = audioCtx.createGain();
    chirpEnv.gain.setValueAtTime(0.0001, startT);

    const peakAmp = profile.voiceGain * chirp.ampScale;
    for (let p = 0; p < chirp.pulses; p++) {
      const pStart = startT + p * stepDur;
      const pPeak = pStart + profile.pulseDurSec * 0.34;
      const pEnd = pStart + profile.pulseDurSec;
      const pulseCurve = 0.85 + 0.15 * Math.sin((p / Math.max(1, chirp.pulses - 1)) * Math.PI);
      chirpEnv.gain.setValueAtTime(0.0001, pStart);
      chirpEnv.gain.linearRampToValueAtTime(peakAmp * pulseCurve, pPeak);
      chirpEnv.gain.exponentialRampToValueAtTime(0.0001, pEnd);
    }

    const bandFilter = audioCtx.createBiquadFilter();
    bandFilter.type = 'bandpass';
    bandFilter.frequency.setValueAtTime(chirp.freqHz, startT);
    bandFilter.Q.setValueAtTime(1.85, startT);

    let tailNode: AudioNode = bandFilter;
    if (typeof audioCtx.createStereoPanner === 'function') {
      const panner = audioCtx.createStereoPanner();
      panner.pan.setValueAtTime(chirp.pan, startT);
      bandFilter.connect(panner);
      tailNode = panner;
    }

    osc1.connect(chirpEnv);
    osc2.connect(osc2Gain);
    osc2Gain.connect(chirpEnv);
    chirpEnv.connect(bandFilter);

    tailNode.connect(airFilter);
    tailNode.connect(convolver);

    osc1.start(startT);
    osc1.stop(stopT);
    osc2.start(startT);
    osc2.stop(stopT);

    activeNodes.push(osc1, osc2);
    scheduledChirpCount++;
  }

  return {
    scheduledChirpCount,
    setVolume: (nextVol: number) => {
      const clamped = clamp(nextVol, 0.05, 1.0);
      try {
        masterGain.gain.setTargetAtTime(clamped, audioCtx.currentTime, 0.04);
      } catch {
        masterGain.gain.value = clamped;
      }
    },
    stop: () => {
      for (const node of activeNodes) {
        try {
          node.stop();
          node.disconnect();
        } catch {
          // Ignore already stopped nodes
        }
      }
      try {
        convolver.disconnect();
        airFilter.disconnect();
        masterGain.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    },
  };
}

export interface VideoClipAudioMixConfig {
  file: File | null;
  hasAudio?: boolean;
  enabled: boolean;
  speed: number;
  volume: number;
  trimIn: number;
  trimOut: number;
  clipStartSec: number;
  clipEndSec: number;
  endBehavior: VideoEndBehavior;
}

function resampleChannelLinear(
  src: Float32Array,
  srcStartSample: number,
  srcEndSample: number,
  srcRate: number,
  dst: Float32Array,
  dstStartSample: number,
  dstLength: number,
  dstRate: number
) {
  const srcAvail = Math.max(0, srcEndSample - srcStartSample);
  if (srcAvail <= 0 || dstLength <= 0) return;
  const ratio = srcRate / dstRate;
  for (let i = 0; i < dstLength; i++) {
    const srcPos = srcStartSample + i * ratio;
    if (srcPos >= srcEndSample - 1) {
      dst[dstStartSample + i] = src[Math.max(0, srcEndSample - 1)];
    } else {
      const idx = Math.floor(srcPos);
      const frac = srcPos - idx;
      const s0 = src[clamp(idx, 0, src.length - 1)];
      const s1 = src[clamp(idx + 1, 0, src.length - 1)];
      dst[dstStartSample + i] = s0 + (s1 - s0) * frac;
    }
  }
}

async function decodeVideoClipAudioSegment(
  file: File,
  trimIn: number,
  trimOut: number,
  targetSampleRate: number
): Promise<AudioBuffer | null> {
  // Prefer mediabunny AudioBufferSink for reliable MP4/MOV/WEBM demuxing & AudioDecoder trimming
  let input: Input | null = null;
  try {
    input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });
    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack) {
      return null;
    }
    const canDecode = await audioTrack.canDecode();
    if (canDecode) {
      const sink = new AudioBufferSink(audioTrack);
      const dur = Math.max(0.1, trimOut - trimIn);
      const totalDstSamples = Math.max(1, Math.ceil(dur * targetSampleRate));
      const offline = new OfflineAudioContext(2, totalDstSamples, targetSampleRate);
      const outBuf = offline.createBuffer(2, totalDstSamples, targetSampleRate);
      const dstL = outBuf.getChannelData(0);
      const dstR = outBuf.getChannelData(1);

      let anyWritten = false;
      const iter = sink.buffers(Math.max(0, trimIn - 0.05), trimOut + 0.05);
      try {
        for await (const wrapped of iter) {
          const b = wrapped.buffer;
          const bStart = wrapped.timestamp;
          const bEnd = bStart + wrapped.duration;
          const overlapStart = Math.max(trimIn, bStart);
          const overlapEnd = Math.min(trimOut, bEnd);
          if (overlapEnd <= overlapStart) continue;

          const srcRate = b.sampleRate;
          const srcStartIdx = clamp(Math.floor((overlapStart - bStart) * srcRate), 0, b.length);
          const srcEndIdx = clamp(Math.ceil((overlapEnd - bStart) * srcRate), srcStartIdx, b.length);
          const dstStartIdx = clamp(Math.round((overlapStart - trimIn) * targetSampleRate), 0, totalDstSamples);
          const dstCount = clamp(
            Math.round((overlapEnd - overlapStart) * targetSampleRate),
            0,
            totalDstSamples - dstStartIdx
          );
          if (dstCount > 0 && srcEndIdx > srcStartIdx) {
            const srcL = b.getChannelData(0);
            const srcR = b.getChannelData(b.numberOfChannels > 1 ? 1 : 0);
            resampleChannelLinear(srcL, srcStartIdx, srcEndIdx, srcRate, dstL, dstStartIdx, dstCount, targetSampleRate);
            resampleChannelLinear(srcR, srcStartIdx, srcEndIdx, srcRate, dstR, dstStartIdx, dstCount, targetSampleRate);
            anyWritten = true;
          }
        }
      } finally {
        await iter.return?.();
      }
      if (anyWritten) {
        return outBuf;
      }
    }
  } catch {
    // Fallback below
  } finally {
    input?.dispose();
  }

  // Fallback via Web Audio decodeAudioData
  try {
    const arr = await file.arrayBuffer();
    const tempCtx = new AudioContext({ sampleRate: targetSampleRate });
    try {
      const decoded = await tempCtx.decodeAudioData(arr);
      const dur = Math.max(0.1, trimOut - trimIn);
      const totalDstSamples = Math.max(1, Math.ceil(dur * targetSampleRate));
      const offline = new OfflineAudioContext(2, totalDstSamples, targetSampleRate);
      const outBuf = offline.createBuffer(2, totalDstSamples, targetSampleRate);
      const srcStartIdx = clamp(Math.floor(trimIn * decoded.sampleRate), 0, decoded.length);
      const srcEndIdx = clamp(Math.ceil(trimOut * decoded.sampleRate), srcStartIdx, decoded.length);
      for (let ch = 0; ch < 2; ch++) {
        const srcCh = decoded.getChannelData(Math.min(ch, decoded.numberOfChannels - 1));
        const dstCh = outBuf.getChannelData(ch);
        resampleChannelLinear(
          srcCh,
          srcStartIdx,
          srcEndIdx,
          decoded.sampleRate,
          dstCh,
          0,
          totalDstSamples,
          targetSampleRate
        );
      }
      return outBuf;
    } finally {
      await tempCtx.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

/**
 * Renders the complete offline stereo audio mix (48 kHz, 2 channels) combining:
 * 1) Optional uploaded background music file (with volume + fade-in/out)
 * 2) Optional video clip trimmed audio track (skipped cleanly when muted or speed != 1)
 * 3) Optional synthesized Web Audio SFX (`buildSfxGraph`)
 * Matches the exact target video duration with a clean tail fade.
 */
export async function renderOfflineAudioMix(params: {
  targetDurationSec: number;
  sfxSettings?: SfxSettings;
  eventTimes: SceneEventTimes;
  musicFile: File | null;
  musicVolume: number;
  seed: number;
  videoClipAudio?: VideoClipAudioMixConfig;
  flyerCricket?: FlyerCricketAudioConfig;
}): Promise<AudioBuffer> {
  const {
    targetDurationSec,
    sfxSettings,
    eventTimes,
    musicFile,
    musicVolume,
    seed,
    videoClipAudio,
    flyerCricket,
  } = params;
  const sampleRate = 48000;
  const totalSamples = Math.max(1, Math.floor(targetDurationSec * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

  // 1. Schedule synthesized SFX if enabled
  if (sfxSettings?.enabled) {
    buildSfxGraph(offlineCtx, sfxSettings, eventTimes, seed, 0);
  }

  // 1b. Schedule optional calm night cricket audio in Living Creature styles
  if (flyerCricket?.enabled) {
    buildFlyerCricketGraph(offlineCtx, flyerCricket, targetDurationSec, seed, 0);
  }

  // 2. Decode and mix optional uploaded background music file
  if (musicFile) {
    try {
      const arrayBuf = await musicFile.arrayBuffer();
      const tempCtx = new AudioContext({ sampleRate });
      let decoded: AudioBuffer;
      try {
        decoded = await tempCtx.decodeAudioData(arrayBuf);
      } finally {
        await tempCtx.close().catch(() => {});
      }

      const musicBuffer = offlineCtx.createBuffer(2, totalSamples, sampleRate);
      const fadeInSamples = Math.floor(Math.min(1.0, targetDurationSec * 0.2) * sampleRate);
      const fadeOutSamples = Math.floor(Math.min(1.2, targetDurationSec * 0.25) * sampleRate);
      const fadeOutStart = totalSamples - fadeOutSamples;

      for (let ch = 0; ch < 2; ch++) {
        const srcCh = decoded.getChannelData(Math.min(ch, decoded.numberOfChannels - 1));
        const dstCh = musicBuffer.getChannelData(ch);
        const srcLen = srcCh.length;
        for (let i = 0; i < totalSamples; i++) {
          const raw = srcLen > 0 ? srcCh[i % srcLen] : 0;
          let env = clamp(musicVolume, 0, 1);
          if (i < fadeInSamples && fadeInSamples > 0) {
            env *= i / fadeInSamples;
          } else if (i > fadeOutStart && fadeOutSamples > 0) {
            env *= (totalSamples - i) / fadeOutSamples;
          }
          dstCh[i] = raw * env;
        }
      }

      const musicSource = offlineCtx.createBufferSource();
      musicSource.buffer = musicBuffer;
      musicSource.connect(offlineCtx.destination);
      musicSource.start(0);
    } catch (err) {
      console.warn('Could not decode background music file during offline mix:', err);
    }
  }

  // 3. Decode and mix optional video clip audio (only when speed === 1, enabled, and file has audio)
  if (
    videoClipAudio &&
    videoClipAudio.file &&
    videoClipAudio.enabled &&
    videoClipAudio.hasAudio !== false &&
    Math.abs((videoClipAudio.speed ?? 1) - 1) < 0.01 &&
    videoClipAudio.volume > 0.001
  ) {
    try {
      const trimmedSeg = await decodeVideoClipAudioSegment(
        videoClipAudio.file,
        Math.max(0, videoClipAudio.trimIn),
        Math.max(videoClipAudio.trimIn + 0.1, videoClipAudio.trimOut),
        sampleRate
      );
      if (trimmedSeg && trimmedSeg.length > 0) {
        const mixBuf = offlineCtx.createBuffer(2, totalSamples, sampleRate);
        const startIdx = clamp(Math.floor(videoClipAudio.clipStartSec * sampleRate), 0, totalSamples);
        const endIdx = clamp(Math.floor(videoClipAudio.clipEndSec * sampleRate), startIdx, totalSamples);
        const segLen = trimmedSeg.length;
        const microFade = Math.min(Math.floor(0.014 * sampleRate), Math.floor(segLen * 0.2));
        const spanLen = endIdx - startIdx;
        const vol = clamp(videoClipAudio.volume, 0, 1);

        for (let ch = 0; ch < 2; ch++) {
          const srcCh = trimmedSeg.getChannelData(Math.min(ch, trimmedSeg.numberOfChannels - 1));
          const dstCh = mixBuf.getChannelData(ch);
          for (let i = 0; i < spanLen; i++) {
            let sampleIdx = i;
            if (videoClipAudio.endBehavior === 'loop') {
              sampleIdx = i % segLen;
            } else if (i >= segLen) {
              break;
            }
            let env = vol;
            if (microFade > 0) {
              if (i < microFade) env *= i / microFade;
              const distFromSpanEnd = spanLen - 1 - i;
              if (distFromSpanEnd < microFade) env *= distFromSpanEnd / microFade;
            }
            dstCh[startIdx + i] = srcCh[sampleIdx] * env;
          }
        }

        const clipSrc = offlineCtx.createBufferSource();
        clipSrc.buffer = mixBuf;
        clipSrc.connect(offlineCtx.destination);
        clipSrc.start(0);
      }
    } catch (clipErr) {
      console.warn('Could not decode/mix video clip audio; skipping clip audio:', clipErr);
    }
  }

  const rendered = await offlineCtx.startRendering();

  // Apply a short 40ms tail fade at the very end of the rendered buffer to prevent clicks
  const tailFadeSamples = Math.min(Math.floor(0.04 * sampleRate), totalSamples);
  if (tailFadeSamples > 0) {
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      const data = rendered.getChannelData(ch);
      for (let i = 0; i < tailFadeSamples; i++) {
        const idx = totalSamples - 1 - i;
        if (idx >= 0) {
          data[idx] = clamp(data[idx] * (i / tailFadeSamples), -1, 1);
        }
      }
    }
  }

  return rendered;
}
