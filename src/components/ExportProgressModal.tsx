import React from 'react';
import { AlertTriangle, CheckCircle2, Film, X } from 'lucide-react';
import { ExportProgressState } from '../utils/exporter';

interface ExportProgressModalProps {
  state: ExportProgressState | null;
  onCancel: () => void;
  onClose: () => void;
}

export const ExportProgressModal: React.FC<ExportProgressModalProps> = ({
  state,
  onCancel,
  onClose,
}) => {
  if (!state) return null;

  const isRunning =
    state.status === 'preparing' ||
    state.status === 'rendering' ||
    state.status === 'encoding-audio' ||
    state.status === 'finalizing';

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '—';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} ميجابايت`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 text-right">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Film className="w-5 h-5 text-sky-400 shrink-0" />
            <h2 id="export-modal-title" className="text-base font-bold text-white">
              {state.status === 'completed'
                ? 'اكتمل تصدير الفيديو بنجاح'
                : state.status === 'error'
                ? 'تعذر إكمال التصدير'
                : state.status === 'cancelled'
                ? 'تم إلغاء التصدير'
                : 'جارٍ تصدير الفيديو إطاراً تلو الآخر...'}
            </h2>
          </div>
          {!isRunning && (
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق نافذة التصدير"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {isRunning && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">
                  {state.status === 'preparing' && 'تحضير الخطوط العربية ومُرمّز H.264...'}
                  {state.status === 'rendering' && 'رسم الإطارات وترميز الفيديو...'}
                  {state.status === 'encoding-audio' && 'معالجة ودمج المسار الصوتي (AAC)...'}
                  {state.status === 'finalizing' && 'تجميع ملف MP4 النهائي...'}
                </span>
                <span className="font-mono-tabular font-bold text-sky-400">
                  {state.percentage}%
                </span>
              </div>

              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-sky-500 transition-all duration-150 rounded-full"
                  style={{ width: `${Math.max(2, state.percentage)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">الإطار الحالي</span>
                <span className="font-mono-tabular font-semibold text-slate-100">
                  {state.currentFrame} / {state.totalFrames}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">الوقت المتبقي المقدر</span>
                <span className="font-mono-tabular font-semibold text-slate-100">
                  {state.estimatedRemainingSeconds !== null
                    ? `${state.estimatedRemainingSeconds} ثانية`
                    : 'جارٍ الحساب...'}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                يرجى عدم إغلاق هذه النافذة أو الانتقال إلى تبويب آخر أثناء التصدير لضمان أقصى سرعة لمعالج الرسوميات.
              </span>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-xs font-semibold text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-lg transition-colors whitespace-nowrap"
              >
                إلغاء التصدير
              </button>
            </div>
          </div>
        )}

        {state.status === 'completed' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3.5 text-emerald-200 text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-semibold text-emerald-100">
                  تم حفظ الملف وتنزيله بنجاح بجودة مطابقة تماماً للمعاينة!
                </p>
                {state.fileName && (
                  <p className="font-mono-tabular text-[11px] text-emerald-300/90 mt-0.5">
                    {state.fileName}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">حجم الملف</span>
                <span className="font-mono-tabular font-semibold text-slate-100">
                  {formatBytes(state.fileSizeBytes)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">المدة الإجمالية</span>
                <span className="font-mono-tabular font-semibold text-slate-100">
                  {state.durationSeconds} ثانية ({state.totalFrames} إطار)
                </span>
              </div>
            </div>

            {state.audioSkippedNotice && (
              <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                {state.audioSkippedNotice}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap"
              >
                تم
              </button>
            </div>
          </div>
        )}

        {(state.status === 'error' || state.status === 'cancelled') && (
          <div className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 border border-slate-800 rounded-xl p-3.5">
              {state.errorMessage || 'تم إيقاف عملية التصدير وتحرير الذاكرة بنجاح.'}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
