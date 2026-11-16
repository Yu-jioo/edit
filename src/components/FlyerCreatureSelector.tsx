import React, { useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
  DEFAULT_FLYER_FLIGHT_SPEED,
  drawCreaturePreviewThumbnail,
  FLYER_CREATURES,
  FLYER_DEFAULT_TINTS,
  resolveFlyerCreature,
} from '../styles';
import {
  CalmStyleTheme,
  FlyerCreatureId,
  FlyerCricketPresetId,
} from '../types';
import {
  DEFAULT_FLYER_CRICKET_PRESET,
  DEFAULT_FLYER_CRICKET_VOLUME,
  FLYER_CRICKET_PRESETS,
  resolveFlyerCricketPreset,
  resolveFlyerCricketVolume,
} from '../utils/sfx';

interface FlyerCreatureSelectorProps {
  selectedCreature?: FlyerCreatureId;
  accentColor: string;
  hasCustomColor?: boolean;
  selectedTheme?: CalmStyleTheme;
  flightSpeed?: number;
  cricketEnabled?: boolean;
  cricketPreset?: FlyerCricketPresetId;
  cricketVolume?: number;
  onSelectCreature: (creature: FlyerCreatureId) => void;
  onSelectTheme?: (theme: CalmStyleTheme) => void;
  onChangeFlightSpeed?: (speed: number) => void;
  onToggleCricket?: (enabled: boolean) => void;
  onSelectCricketPreset?: (preset: FlyerCricketPresetId) => void;
  onChangeCricketVolume?: (volume: number) => void;
  onPreviewCricket?: () => void;
}

const CreatureLiveThumb: React.FC<{
  creature: FlyerCreatureId;
  tint: string;
  theme: CalmStyleTheme;
  flightSpeed: number;
}> = ({ creature, tint, theme, flightSpeed }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId = 0;
    let cancelled = false;
    const start = performance.now();

    const renderLoop = (now: number) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const t = (now - start) / 1000;
          drawCreaturePreviewThumbnail(
            ctx,
            canvas.width,
            canvas.height,
            creature,
            tint,
            t,
            theme,
            flightSpeed
          );
        }
      }
      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [creature, tint, theme, flightSpeed]);

  return (
    <canvas
      ref={canvasRef}
      width={96}
      height={54}
      className="w-full h-12 rounded-md border border-slate-800/80 block"
    />
  );
};

export const FlyerCreatureSelector: React.FC<FlyerCreatureSelectorProps> = ({
  selectedCreature,
  accentColor,
  hasCustomColor,
  selectedTheme = 'dark',
  flightSpeed = DEFAULT_FLYER_FLIGHT_SPEED,
  cricketEnabled = false,
  cricketPreset = DEFAULT_FLYER_CRICKET_PRESET,
  cricketVolume = DEFAULT_FLYER_CRICKET_VOLUME,
  onSelectCreature,
  onSelectTheme,
  onChangeFlightSpeed,
  onToggleCricket,
  onSelectCricketPreset,
  onChangeCricketVolume,
  onPreviewCricket,
}) => {
  const activeCreature = resolveFlyerCreature(selectedCreature);
  const activeTheme: CalmStyleTheme = selectedTheme === 'light' ? 'light' : 'dark';
  const activeSpeed = Math.min(1.25, Math.max(0.25, flightSpeed ?? DEFAULT_FLYER_FLIGHT_SPEED));
  const activeCricketPreset = resolveFlyerCricketPreset(cricketPreset);
  const activeCricketVolume = resolveFlyerCricketVolume(cricketVolume);
  const activeCricketMeta =
    FLYER_CRICKET_PRESETS.find((p) => p.id === activeCricketPreset) || FLYER_CRICKET_PRESETS[0];

  const speedLabelAr =
    activeSpeed <= 0.4
      ? 'بطيء جداً وتأملي'
      : activeSpeed <= 0.65
        ? 'بطيء وهادئ (مريح)'
        : activeSpeed <= 0.95
          ? 'انسيابي متوسط'
          : 'انسيابي نشط';

  return (
    <div
      className="space-y-3 pt-3 border-t border-slate-800/80"
      data-testid="flyer-creature-selector"
    >
      {onSelectTheme && (
        <div className="space-y-1.5" data-testid="flyer-theme-selector">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-300">
              ثيم خلفية الكائن الطائر (داكن / أبيض هادئ)
            </span>
            <span className="text-[10px] text-slate-400">
              {activeTheme === 'light'
                ? 'أبيض ثلجي متدرج + هالة باستيل ونص داكن'
                : 'سماء ليلية عميقة + نص مضيء'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
            {(
              [
                { id: 'dark', label: 'داكن سينمائي (ليلي)' },
                { id: 'light', label: 'أبيض هادئ متدرج' },
              ] as { id: CalmStyleTheme; label: string }[]
            ).map((th) => {
              const isSel = activeTheme === th.id;
              return (
                <button
                  key={th.id}
                  type="button"
                  data-testid={`flyer-theme-btn-${th.id}`}
                  onClick={() => onSelectTheme(th.id)}
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

      {onChangeFlightSpeed && (
        <div
          className="space-y-1.5 bg-slate-950/90 border border-slate-800 rounded-xl p-2.5"
          data-testid="flyer-flight-speed-control"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <label
                htmlFor="flyer-flight-speed-slider"
                className="block text-xs font-bold text-sky-300"
              >
                سرعة وانسيابية تحليق الكائن حول النص
              </label>
              <span className="block text-[10px] text-slate-400">
                طيران متصل وهادئ حول السطور طوال المشهد بدون توقفات حادة
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                dir="ltr"
                className="text-xs font-mono-tabular font-bold text-sky-400"
              >
                {activeSpeed.toFixed(2)}x
              </span>
              <span className="text-[10px] text-slate-300 whitespace-nowrap">
                ({speedLabelAr})
              </span>
            </div>
          </div>

          <input
            id="flyer-flight-speed-slider"
            data-testid="flyer-flight-speed-slider"
            type="range"
            min={0.25}
            max={1.25}
            step={0.05}
            value={activeSpeed}
            onChange={(e) => onChangeFlightSpeed(parseFloat(e.target.value))}
            className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />

          <div className="grid grid-cols-3 gap-1 pt-0.5">
            {(
              [
                { val: 0.35, label: 'بطيء جداً (0.35x)' },
                { val: 0.55, label: 'هادئ افتراضي (0.55x)' },
                { val: 0.85, label: 'متوسط (0.85x)' },
              ] as const
            ).map((preset) => {
              const isPresetActive = Math.abs(activeSpeed - preset.val) < 0.03;
              return (
                <button
                  key={preset.val}
                  type="button"
                  data-testid={`flyer-speed-preset-${preset.val}`}
                  onClick={() => onChangeFlightSpeed(preset.val)}
                  className={`py-1 px-1.5 text-[10px] rounded-md transition-colors whitespace-nowrap ${
                    isPresetActive
                      ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <span className="text-xs font-bold text-sky-300">
          الكائن الطائر المضيء (4 كائنات مع معاينة حية)
        </span>
        <span className="text-[10px] text-slate-400">
          نفس المسار الانسيابي والتوقيت لكل كائن
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FLYER_CREATURES.map((item) => {
          const isSelected = activeCreature === item.id;
          const previewTint =
            isSelected && hasCustomColor
              ? accentColor
              : FLYER_DEFAULT_TINTS[item.id];

          return (
            <button
              key={item.id}
              type="button"
              data-testid={`flyer-creature-btn-${item.id}`}
              title={item.id === 'orb' ? 'كرة نورانية (نواة رحيق بيضاء ريشية متوهجة)' : item.labelAr}
              onClick={() => onSelectCreature(item.id)}
              className={`group p-1.5 rounded-xl border text-center transition-all ${
                isSelected
                  ? 'bg-sky-500/15 border-sky-400 text-white shadow-sm'
                  : 'bg-slate-950/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              <CreatureLiveThumb
                creature={item.id}
                tint={previewTint}
                theme={activeTheme}
                flightSpeed={activeSpeed}
              />
              <span className="block text-xs font-bold mt-1.5 whitespace-nowrap">
                {item.labelAr}
              </span>
              <span dir="ltr" className="block text-[9px] text-slate-400 font-mono-tabular">
                {item.defaultAccent}
              </span>
            </button>
          );
        })}
      </div>

      {onToggleCricket && (
        <div
          className="space-y-2.5 bg-slate-950/90 border border-slate-800 rounded-xl p-3"
          data-testid="flyer-cricket-audio-panel"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="block text-xs font-bold text-sky-300 truncate">
                صوت صرصور الليل الهادئ
              </span>
              <span className="block text-[10px] text-slate-400 truncate">
                {cricketEnabled
                  ? activeCricketMeta.descriptionAr
                  : '3 درجات ليلية هادئة للمعاينة الحية وتصدير MP4'}
              </span>
            </div>

            <button
              type="button"
              data-testid="flyer-cricket-toggle-btn"
              aria-pressed={cricketEnabled}
              onClick={() => onToggleCricket(!cricketEnabled)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-colors whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
                cricketEnabled
                  ? 'bg-sky-500/20 text-sky-300 border-sky-400/50'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600 hover:text-white'
              }`}
            >
              {cricketEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>مُفعّل</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>تفعيل الصوت</span>
                </>
              )}
            </button>
          </div>

          {cricketEnabled && (
            <div className="space-y-2.5 pt-1 border-t border-slate-800/70">
              {onSelectCricketPreset && (
                <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="اختر صوت صرصور الليل">
                  {FLYER_CRICKET_PRESETS.map((presetItem) => {
                    const isActive = activeCricketPreset === presetItem.id;
                    return (
                      <button
                        key={presetItem.id}
                        type="button"
                        data-testid={`flyer-cricket-preset-${presetItem.id}`}
                        aria-pressed={isActive}
                        title={presetItem.descriptionAr}
                        onClick={() => onSelectCricketPreset(presetItem.id)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap truncate border focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
                          isActive
                            ? 'bg-sky-500/20 text-sky-300 font-bold border-sky-500/50'
                            : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {presetItem.labelAr}
                      </button>
                    );
                  })}
                </div>
              )}

              {onChangeCricketVolume && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label
                      htmlFor="flyer-cricket-volume-slider"
                      className="text-slate-300 font-medium"
                    >
                      مستوى صوت صرصور الليل
                    </label>
                    <div className="flex items-center gap-2">
                      {onPreviewCricket && (
                        <button
                          type="button"
                          data-testid="flyer-cricket-preview-btn"
                          onClick={onPreviewCricket}
                          className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[10px] font-semibold text-sky-300 border border-slate-700 transition-colors whitespace-nowrap"
                        >
                          سماع عينة
                        </button>
                      )}
                      <span
                        dir="ltr"
                        className="font-mono-tabular text-sky-400 font-semibold"
                      >
                        {Math.round(activeCricketVolume * 100)}%
                      </span>
                    </div>
                  </div>
                  <input
                    id="flyer-cricket-volume-slider"
                    data-testid="flyer-cricket-volume-slider"
                    type="range"
                    min={0.05}
                    max={1.0}
                    step={0.05}
                    value={activeCricketVolume}
                    onChange={(e) => onChangeCricketVolume(parseFloat(e.target.value))}
                    className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
