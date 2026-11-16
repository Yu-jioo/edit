import React, { useEffect, useRef } from 'react';
import { renderQuoteFrame } from '../styles';
import {
  ChatStyleId,
  ImageStyleId,
  PhraseStyleId,
  PointsStyleId,
  QuoteContent,
  StyleCustomization,
  StyleMetadata,
  TimelineConfig,
  VideoStyleId,
} from '../types';
import { getEffectiveTimeline, getTypingConfigForCustomization } from '../utils/math';

interface StyleThumbnailCardProps {
  styleMeta: StyleMetadata;
  isSelected: boolean;
  content: QuoteContent;
  timeline: TimelineConfig;
  custom: StyleCustomization;
  fontsReadyTick: number;
  onSelect: () => void;
}

export const StyleThumbnailCard: React.FC<StyleThumbnailCardProps> = ({
  styleMeta,
  isSelected,
  content,
  timeline,
  custom,
  fontsReadyTick,
  onSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const thumbWidth = 288;
    const thumbHeight = 162;
    const baseWidth = 1920;
    const baseHeight = 1080;

    const cardMode = styleMeta.mode || 'quote';
    const previewCustom: StyleCustomization = {
      ...custom,
      mode: cardMode,
      styleId: styleMeta.id,
      phraseStyleId: cardMode === 'phrase' ? (styleMeta.id as PhraseStyleId) : custom.phraseStyleId,
      chatStyleId: cardMode === 'chat' ? (styleMeta.id as ChatStyleId) : custom.chatStyleId,
      pointsStyleId: cardMode === 'points' ? (styleMeta.id as PointsStyleId) : custom.pointsStyleId,
      imageStyleId: cardMode === 'image' ? (styleMeta.id as ImageStyleId) : custom.imageStyleId,
      videoStyleId: cardMode === 'video' ? (styleMeta.id as VideoStyleId) : custom.videoStyleId,
      videoBox: cardMode === 'video' ? { x: 8, y: 8, w: 84, h: 84 } : custom.videoBox,
      position:
        cardMode === 'phrase' ||
        cardMode === 'chat' ||
        cardMode === 'points' ||
        cardMode === 'image' ||
        cardMode === 'video'
          ? 'fullscreen'
          : custom.position,
      backgroundMode: 'style',
      format: '16:9',
      accentColor: isSelected ? custom.accentColor : styleMeta.defaultAccent,
      keywordColor: isSelected
        ? custom.keywordColor || styleMeta.defaultKeywordColor || styleMeta.defaultAccent
        : styleMeta.defaultKeywordColor || styleMeta.defaultAccent,
      quoteFontOverride: isSelected ? custom.quoteFontOverride : '',
      authorFontOverride: isSelected ? custom.authorFontOverride : '',
      greenScreen: false,
    };

    const effective = getEffectiveTimeline(
      timeline,
      content.quoteText,
      cardMode,
      styleMeta.id === 'annotate' ? 0.55 : 0.35,
      getTypingConfigForCustomization(previewCustom)
    );
    const sampleT =
      cardMode === 'chat' || cardMode === 'points'
        ? Math.max(effective.enter + 0.2, effective.exitStart - 0.4)
        : cardMode === 'image' || cardMode === 'video'
          ? effective.enter + effective.hold * 0.45
          : effective.enter + effective.hold * 0.42;

    const thumbContent: QuoteContent =
      cardMode === 'video'
        ? {
            ...content,
            videoGetFrame: () => content.videoPosterSource || null,
          }
        : content;

    renderQuoteFrame(ctx, sampleT, thumbContent, timeline, previewCustom, {
      width: thumbWidth,
      height: thumbHeight,
      baseWidth,
      baseHeight,
      scale: thumbWidth / baseWidth,
    });
  }, [
    styleMeta,
    isSelected,
    content,
    custom,
    timeline,
    fontsReadyTick,
  ]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex flex-col text-right rounded-xl overflow-hidden border transition-all duration-150 focus-visible:outline-2 focus-visible:outline-sky-400 ${
        isSelected
          ? 'border-sky-400 bg-slate-900 ring-1 ring-sky-400/50'
          : 'border-slate-800/90 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900'
      }`}
    >
      <div className="relative w-full aspect-video bg-slate-950 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={288}
          height={162}
          className="w-full h-full object-cover"
        />
        <div
          className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full border border-white/40"
          style={{
            backgroundColor: isSelected ? custom.accentColor : styleMeta.defaultAccent,
          }}
        />
      </div>
      <div className="p-2.5">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-bold text-slate-100 group-hover:text-white truncate">
            {styleMeta.nameAr}
          </span>
          {isSelected && (
            <span className="text-[11px] font-medium text-sky-400 shrink-0">مُفعّل</span>
          )}
        </div>
        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
          {styleMeta.descriptionAr}
        </p>
      </div>
    </button>
  );
};
