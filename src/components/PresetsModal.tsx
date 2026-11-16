import React, { useRef, useState } from 'react';
import { Bookmark, Download, Trash2, Upload, X } from 'lucide-react';
import { StudioPreset } from '../types';

interface PresetsModalProps {
  isOpen: boolean;
  presets: StudioPreset[];
  onClose: () => void;
  onSavePreset: (name: string) => void;
  onLoadPreset: (preset: StudioPreset) => void;
  onDeletePreset: (id: string) => void;
  onExportJson: () => void;
  onImportJson: (preset: StudioPreset) => void;
}

export const PresetsModal: React.FC<PresetsModalProps> = ({
  isOpen,
  presets,
  onClose,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  onExportJson,
  onImportJson,
}) => {
  const [presetName, setPresetName] = useState('');
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = presetName.trim() || `قالب مخصص ${presets.length + 1}`;
    onSavePreset(trimmed);
    setPresetName('');
  };

  const handleImportFile = (file: File) => {
    setImportError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as StudioPreset;
        if (!parsed || !parsed.customization || !parsed.timeline) {
          setImportError('ملف JSON غير صالح كقالب إعدادات.');
          return;
        }
        onImportJson(parsed);
      } catch {
        setImportError('تعذر قراءة ملف JSON. تأكد من صحة صيغة الملف.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="presets-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 text-right">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
          <div className="flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-sky-400" />
            <h2 id="presets-modal-title" className="text-base font-bold text-white">
              إدارة القوالب والإعدادات المحفوظة (Presets)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة القوالب"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Save current settings to localStorage */}
        <form onSubmit={handleSave} className="space-y-2">
          <label htmlFor="preset-name-input" className="block text-xs font-semibold text-slate-300">
            حفظ الإعدادات الحالية كقالب جديد (الوضع، الستايل، المكان، الخلفية، الألوان، والمؤثر الصوتي)
          </label>
          <div className="flex gap-2">
            <input
              id="preset-name-input"
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="مثال: قالب جملة محورية لقناتي..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              حفظ القالب
            </button>
          </div>
        </form>

        {/* Saved presets list */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-slate-300">
            القوالب المحفوظة في المتصفح ({presets.length})
          </span>
          {presets.length === 0 ? (
            <div className="text-center py-6 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs text-slate-400">
              لا توجد قوالب محفوظة بعد. احفظ إعداداتك المفضلة للوصول إليها لاحقاً بضغطة واحدة.
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
              {presets.map((p) => {
                const pMode = p.mode || p.customization.mode || 'quote';
                const modeLabel =
                  pMode === 'video'
                    ? 'فيديو'
                    : pMode === 'image'
                      ? 'صورة'
                      : pMode === 'points'
                        ? 'نقاط'
                        : pMode === 'chat'
                          ? 'محادثة'
                          : pMode === 'phrase'
                            ? 'جملة محورية'
                            : 'اقتباس';
                const activeStyle =
                  pMode === 'video'
                    ? p.customization.videoStyleId || p.customization.styleId
                    : pMode === 'image'
                      ? p.customization.imageStyleId || p.customization.styleId
                      : pMode === 'points'
                        ? p.customization.pointsStyleId || p.customization.styleId
                        : pMode === 'chat'
                          ? p.customization.chatStyleId || p.customization.styleId
                          : pMode === 'phrase'
                            ? p.customization.phraseStyleId || p.customization.styleId
                            : p.customization.styleId;
                const bgLabel = p.customization.backgroundMode || (p.customization.greenScreen ? 'green' : 'style');
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 bg-slate-950 border border-slate-800/90 rounded-xl px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-100 truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {modeLabel} · {activeStyle} · {bgLabel} · {p.customization.format} · {p.exportSettings.resolution}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onLoadPreset(p);
                          onClose();
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-sky-300 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 rounded-lg transition-colors whitespace-nowrap"
                      >
                        تطبيق
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePreset(p.id)}
                        aria-label={`حذف القالب ${p.name}`}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Export / Import JSON File */}
        <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportJson}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>تصدير كملف JSON</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span>استيراد ملف JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = '';
              }}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            إغلاق
          </button>
        </div>

        {importError && (
          <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
            {importError}
          </p>
        )}
      </div>
    </div>
  );
};
