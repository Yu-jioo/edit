import React, { useEffect, useRef, useState } from 'react';
import { Focus, RotateCcw, Upload, ZoomIn } from 'lucide-react';
import { CropState, ImageFitMode, SpotlightRegion, SpotlightShape } from '../types';
import {
  drawCroppedImage,
  drawFittedImage,
  getDefaultInsertImageCanvas,
} from '../utils/assetCache';
import { clamp, DEFAULT_SPOTLIGHT_REGION } from '../utils/math';

interface PhotoCropControlProps {
  photoSource: HTMLImageElement | HTMLCanvasElement | null;
  photoId: string;
  crop: CropState;
  onPhotoChange: (img: HTMLImageElement | null, id: string) => void;
  onCropChange: (crop: CropState) => void;
  label?: string;
  resetLabel?: string;
  isImageMode?: boolean;
  fitMode?: ImageFitMode;
  spotlightRegion?: SpotlightRegion;
  spotlightShape?: SpotlightShape;
  onSpotlightRegionChange?: (region: SpotlightRegion) => void;
}

export const PhotoCropControl: React.FC<PhotoCropControlProps> = ({
  photoSource,
  photoId,
  crop,
  onPhotoChange,
  onCropChange,
  label = 'صورة القائل (رفع أو سحب أو لصق Ctrl+V)',
  resetLabel = 'استعادة الصورة الافتراضية',
  isImageMode = false,
  fitMode = 'cover',
  spotlightRegion,
  spotlightShape = 'circle',
  onSpotlightRegionChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const spotlightCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; startOffsetX: number; startOffsetY: number }>({
    x: 0,
    y: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  });

  // Spotlight drag/resize interaction state
  const [spotDragMode, setSpotDragMode] = useState<'none' | 'move' | 'resize'>('none');
  const spotStartRef = useRef<{
    clientX: number;
    clientY: number;
    region: SpotlightRegion;
  }>({
    clientX: 0,
    clientY: 0,
    region: DEFAULT_SPOTLIGHT_REGION,
  });

  // Render live interactive crop preview thumbnail
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isImageMode) {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const src = photoSource || getDefaultInsertImageCanvas();
      drawFittedImage(ctx, src, crop, fitMode, 0, 0, canvas.width, canvas.height, 1.0);
    } else {
      drawCroppedImage(ctx, photoSource, crop, 0, 0, canvas.width, canvas.height);
    }

    // Subtle rule-of-thirds guide grid while panning or zoomed
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 3, 0);
    ctx.lineTo(canvas.width / 3, canvas.height);
    ctx.moveTo((canvas.width * 2) / 3, 0);
    ctx.lineTo((canvas.width * 2) / 3, canvas.height);
    ctx.moveTo(0, canvas.height / 3);
    ctx.lineTo(canvas.width, canvas.height / 3);
    ctx.moveTo(0, (canvas.height * 2) / 3);
    ctx.lineTo(canvas.width, (canvas.height * 2) / 3);
    ctx.stroke();
  }, [photoSource, photoId, crop, isImageMode, fitMode]);

  // Render interactive Spotlight Region selector canvas when active
  useEffect(() => {
    if (!spotlightRegion || !onSpotlightRegionChange) return;
    const canvas = spotlightCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0B101B';
    ctx.fillRect(0, 0, W, H);

    const src = photoSource || getDefaultInsertImageCanvas();
    drawFittedImage(ctx, src, crop, 'contain', 0, 0, W, H, 1.0);

    const rx = spotlightRegion.x * W;
    const ry = spotlightRegion.y * H;
    const rw = spotlightRegion.w * W;
    const rh = spotlightRegion.h * H;

    // Dim outside spotlight region
    ctx.save();
    ctx.fillStyle = 'rgba(6, 9, 16, 0.62)';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(rx, ry, rw, rh);
    ctx.fill('evenodd');
    ctx.restore();

    // Draw selection rectangle + shape preview
    ctx.save();
    ctx.strokeStyle = spotlightShape === 'arrow' ? '#FF4D6D' : '#FFD400';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(rx, ry, rw, rh);

    if (spotlightShape === 'circle') {
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(rx + rw * 0.5, ry + rh * 0.5, rw * 0.5, rh * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Bottom-right resize handle
    const handleSize = 12;
    ctx.fillStyle = '#FFD400';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.5;
    ctx.fillRect(rx + rw - handleSize * 0.5, ry + rh - handleSize * 0.5, handleSize, handleSize);
    ctx.strokeRect(rx + rw - handleSize * 0.5, ry + rh - handleSize * 0.5, handleSize, handleSize);
    ctx.restore();
  }, [photoSource, photoId, crop, spotlightRegion, spotlightShape, onSpotlightRegionChange]);

  const loadFileAsImage = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        onPhotoChange(img, `upload-${Date.now()}`);
        onCropChange({ zoom: 1, offsetX: 0, offsetY: 0 });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Global paste listener for clipboard image pasting
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'textarea' || activeTag === 'input') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            loadFileAsImage(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startOffsetX: crop.offsetX,
      startOffsetY: crop.offsetY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPanning) return;
    const dx = (e.clientX - panStartRef.current.x) / 90;
    const dy = (e.clientY - panStartRef.current.y) / 90;
    onCropChange({
      ...crop,
      offsetX: clamp(panStartRef.current.startOffsetX + dx, -1, 1),
      offsetY: clamp(panStartRef.current.startOffsetY + dy, -1, 1),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setIsPanning(false);
    }
  };

  // Spotlight pointer handlers
  const handleSpotPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!spotlightRegion || !onSpotlightRegionChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const ny = clamp((e.clientY - rect.top) / Math.max(1, rect.height), 0, 1);

    const handleX = spotlightRegion.x + spotlightRegion.w;
    const handleY = spotlightRegion.y + spotlightRegion.h;
    const distToCorner = Math.hypot(nx - handleX, ny - handleY);

    e.currentTarget.setPointerCapture(e.pointerId);
    spotStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      region: { ...spotlightRegion },
    };

    if (distToCorner < 0.09) {
      setSpotDragMode('resize');
    } else {
      setSpotDragMode('move');
    }
  };

  const handleSpotPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (spotDragMode === 'none' || !spotlightRegion || !onSpotlightRegionChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - spotStartRef.current.clientX) / Math.max(1, rect.width);
    const dy = (e.clientY - spotStartRef.current.clientY) / Math.max(1, rect.height);
    const start = spotStartRef.current.region;

    if (spotDragMode === 'resize') {
      const nextW = clamp(start.w + dx, 0.12, 1 - start.x);
      const nextH = clamp(start.h + dy, 0.12, 1 - start.y);
      onSpotlightRegionChange({
        x: start.x,
        y: start.y,
        w: Number(nextW.toFixed(3)),
        h: Number(nextH.toFixed(3)),
      });
    } else {
      const nextX = clamp(start.x + dx, 0, 1 - start.w);
      const nextY = clamp(start.y + dy, 0, 1 - start.h);
      onSpotlightRegionChange({
        x: Number(nextX.toFixed(3)),
        y: Number(nextY.toFixed(3)),
        w: start.w,
        h: start.h,
      });
    }
  };

  const handleSpotPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (spotDragMode !== 'none') {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setSpotDragMode('none');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-300">{label}</label>
        {photoSource && (
          <button
            type="button"
            onClick={() => {
              onPhotoChange(null, isImageMode ? 'default-insert-image' : 'default-silhouette');
              onCropChange({ zoom: 1, offsetX: 0, offsetY: 0 });
            }}
            className="text-xs text-slate-400 hover:text-sky-400 transition-colors whitespace-nowrap"
          >
            {resetLabel}
          </button>
        )}
      </div>

      <div className="grid grid-cols-[112px_1fr] gap-3 items-stretch">
        {/* Interactive Drag-to-Reposition Crop Thumbnail */}
        <div className="relative group rounded-lg overflow-hidden border border-slate-800 bg-slate-900 aspect-square flex items-center justify-center">
          <canvas
            ref={previewCanvasRef}
            width={160}
            height={160}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="w-full h-full cursor-move touch-none"
            title="اسحب لتحريك الصورة داخل الإطار"
          />
          <span className="pointer-events-none absolute bottom-1 inset-x-1 text-center text-[10px] bg-slate-950/80 text-slate-300 py-0.5 rounded">
            اسحب للتحريك
          </span>
        </div>

        {/* Dropzone + Zoom Slider */}
        <div className="flex flex-col justify-between gap-2">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              const file = e.dataTransfer.files?.[0];
              if (file) loadFileAsImage(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label={label}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`flex-1 flex flex-col items-center justify-center px-3 py-2.5 rounded-lg border border-dashed cursor-pointer transition-colors text-center ${
              isDraggingFile
                ? 'border-sky-400 bg-sky-500/10 text-sky-200'
                : 'border-slate-700 hover:border-slate-500 bg-slate-900/60 text-slate-300'
            }`}
          >
            <Upload className="w-4 h-4 mb-1 text-sky-400" />
            <span className="text-xs font-medium">اختر صورة أو أفلتها هنا</span>
            <span className="text-[11px] text-slate-400 mt-0.5">
              PNG, JPG, WEBP — يحافظ على الشفافية بدون تشويه
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/*"
              aria-label="ملف الصورة"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadFileAsImage(file);
                e.target.value = '';
              }}
            />
          </div>

          {/* Crop Zoom & Reset Controls */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800/80 rounded-lg px-2.5 py-1.5">
            <ZoomIn className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              aria-label="تكبير الصورة"
              value={crop.zoom}
              onChange={(e) =>
                onCropChange({
                  ...crop,
                  zoom: parseFloat(e.target.value),
                })
              }
              className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="text-[11px] font-mono-tabular text-slate-300 w-9 text-left shrink-0">
              {crop.zoom.toFixed(1)}x
            </span>
            <button
              type="button"
              onClick={() => onCropChange({ zoom: 1, offsetX: 0, offsetY: 0 })}
              title="إعادة ضبط القص والتكبير"
              aria-label="إعادة ضبط القص والتكبير"
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Spotlight Region Selector (shown when img_spotlight is active) */}
      {spotlightRegion && onSpotlightRegionChange && (
        <div
          data-testid="spotlight-region-selector"
          className="p-3 bg-slate-950/80 border border-amber-500/30 rounded-xl space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <Focus className="w-3.5 h-3.5" />
              <span>منطقة التحديد (اسحب لتحريك المستطيل أو اسحب الزاوية لتغيير الحجم)</span>
            </span>
            <button
              type="button"
              onClick={() => onSpotlightRegionChange({ ...DEFAULT_SPOTLIGHT_REGION })}
              className="text-[11px] text-slate-400 hover:text-amber-300 transition-colors"
            >
              توسيط 40% افتراضي
            </button>
          </div>
          <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-900 aspect-video max-h-44 mx-auto">
            <canvas
              ref={spotlightCanvasRef}
              width={320}
              height={180}
              onPointerDown={handleSpotPointerDown}
              onPointerMove={handleSpotPointerMove}
              onPointerUp={handleSpotPointerUp}
              className="w-full h-full cursor-crosshair touch-none block"
            />
          </div>
        </div>
      )}
    </div>
  );
};
