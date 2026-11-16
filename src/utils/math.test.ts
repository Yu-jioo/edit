import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  lerp,
  progress,
  easeOutCubic,
  easeInCubic,
  easeInOutCubic,
  computeAutoHoldDuration,
  computePhraseAutoHoldDuration,
  countLogicalKeystrokes,
  computeChatSchedule,
  computePointsSchedule,
  computeVideoSourceTime,
  computeVideoTimeline,
  clampVideoBoxToSafeMargin,
  countChatTotalWords,
  countPointsStats,
  DEFAULT_CHAT_MESSAGES,
  DEFAULT_CHAT_TIMING,
  DEFAULT_IMAGE_CAPTION,
  DEFAULT_IMAGE_SOURCE_LINE,
  DEFAULT_IMAGE_TIMELINE,
  DEFAULT_POINTS_ITEMS,
  DEFAULT_POINTS_TIMING,
  DEFAULT_POINTS_TITLE,
  DEFAULT_SPOTLIGHT_REGION,
  DEFAULT_VIDEO_BOX,
  DEFAULT_VIDEO_TIMELINE,
  detectTextDirection,
  formatPointMarker,
  getChatPositionBox,
  getDefaultVideoBoxForPosition,
  getEffectiveTimeline,
  getImagePositionBox,
  getPointsPositionBox,
  getRenderSize,
  getTargetBitrate,
  getTypingConfigForCustomization,
  getPhrasePositionBox,
  isGreenishColor,
  isRgbPixelGreenHue,
  MAX_POINTS_ITEMS,
  parseQuickPasteChatMessages,
  parseQuickPastePointsItems,
  resizeVideoBoxFromCorner,
  resolveBackgroundMode,
  resolveTextDirection,
  scaleVideoBoxFromBase,
  snapVideoBoxToGuides,
  toArabicIndicDigits,
  videoBoxToPixels,
} from './math';
import { mulberry32, combineSeed, deterministicWave } from './random';
import {
  applyStudioCanvasTextProps,
  computeTypingScheduleForLayout,
  evaluateLineTypingAtTime,
  formatQuoteWithMarks,
  getFontCalibration,
  layoutArabicQuote,
  parseKeywordMarkup,
  resolveStudioFontSpec,
  segmentTextIntoBidiRuns,
  splitIntoKeystrokeClusters,
} from './textLayout';
import { buildExportFileName } from './exporter';
import {
  ALL_STYLES_LIST,
  ARABIC_FONTS_LIST,
  AUTHOR_ARABIC_FONTS_LIST,
  CHAT_STYLES_LIST,
  DEFAULT_FLYER_FLIGHT_SPEED,
  drawCreaturePreviewThumbnail,
  ENGLISH_FONTS_LIST,
  FLYER_CREATURES,
  FLYER_DEFAULT_TINTS,
  getEventTimes,
  getSceneEventTimes,
  getStyleMetadata,
  IMAGE_STYLES_LIST,
  PHRASE_STYLES_LIST,
  POINTS_STYLES_LIST,
  QUOTE_STYLES_LIST,
  renderQuoteFrame,
  resolveFlyerCreature,
  resolveFlyerFlightSpeed,
  resolveFlyerTheme,
  resolveTimelineTheme,
  VIDEO_STYLES_LIST,
} from '../styles';
import {
  buildPhraseFlyerPlan,
  buildPointsFlyerPlan,
  computeFireflyGlowIntensity,
  sampleFlightWaypoints,
} from '../styles/flyer_core';
import { fitImageSlotInBox } from '../styles/image1Polaroid';
import { buildAutoFitPointsLayout, PTS_CLEAN_CONFIG } from '../styles/points1Clean';
import { getPtsTimelineInteractiveTargets } from '../styles/points4Timeline';
import { fitVideoShellInBox } from '../styles/videoShared';
import {
  ArabicFontFamily,
  BackgroundMode,
  ChatMessage,
  ChatStyleId,
  FlyerCreatureId,
  FlyerCricketPresetId,
  ImageStyleId,
  PhrasePosition,
  PointsItem,
  PointsStyleId,
  StyleCustomization,
  VideoStyleId,
} from '../types';
import { getImageGreenPixelRatio } from './assetCache';
import {
  buildFlyerCricketGraph,
  buildSfxGraph,
  DEFAULT_FLYER_CRICKET_PRESET,
  DEFAULT_FLYER_CRICKET_VOLUME,
  FLYER_CRICKET_PRESETS,
  hasFlyerCricketAudio,
  resolveFlyerCricketPreset,
  resolveFlyerCricketVolume,
} from './sfx';

test('detectTextDirection and resolveTextDirection identify Arabic vs English strings and obey manual overrides', () => {
  // Pure Arabic
  assert.equal(detectTextDirection('العلم نور والجهل ظلام'), 'rtl');
  // Pure English
  assert.equal(detectTextDirection('The only way to do great work is to love what you do.'), 'ltr');
  // Mixed with numbers & symbols
  assert.equal(detectTextDirection('3 mistakes that destroy your productivity!'), 'ltr');
  assert.equal(detectTextDirection('٣ أخطاء تدمّر إنتاجيتك يومياً!'), 'rtl');
  // Empty defaults to RTL
  assert.equal(detectTextDirection(''), 'rtl');

  // Manual override takes precedence over content
  const customLtr: StyleCustomization = {
    mode: 'quote',
    styleId: 'midnight-blue',
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#FFFFFF',
    textDirection: 'ltr',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1,
    minimalShape: 'arch',
    seed: 1,
  };
  assert.equal(resolveTextDirection(customLtr, 'نص عربي'), 'ltr');

  const customRtl: StyleCustomization = {
    ...customLtr,
    textDirection: 'rtl',
  };
  assert.equal(resolveTextDirection(customRtl, 'English text'), 'rtl');

  const customAuto: StyleCustomization = {
    ...customLtr,
    textDirection: 'auto',
  };
  assert.equal(resolveTextDirection(customAuto, 'English quote'), 'ltr');
  assert.equal(resolveTextDirection(customAuto, 'اقتباس عربي'), 'rtl');
});

test('formatQuoteWithMarks produces English curly quotes when direction is ltr and Arabic guillemets when rtl', () => {
  const enQuote = 'Stay hungry, stay foolish';
  assert.equal(formatQuoteWithMarks(enQuote, 'guillemets', 'ltr'), '“Stay hungry, stay foolish”');
  assert.equal(formatQuoteWithMarks(enQuote, 'double', 'ltr'), '“Stay hungry, stay foolish”');
  assert.equal(formatQuoteWithMarks(enQuote, 'none', 'ltr'), 'Stay hungry, stay foolish');

  const arQuote = 'العلم نور';
  assert.equal(formatQuoteWithMarks(arQuote, 'guillemets', 'rtl'), '«العلم نور»');
});

test('getPhrasePositionBox handles left and right positioning for both LTR and RTL', () => {
  const rtlRight = getPhrasePositionBox('right', '16:9', 1920, 1080, 'rtl');
  assert.equal(rtlRight.align, 'right');
  assert.ok(rtlRight.boxX > 900);

  const ltrRight = getPhrasePositionBox('right', '16:9', 1920, 1080, 'ltr');
  assert.equal(ltrRight.align, 'left');

  const ltrLeft = getPhrasePositionBox('left', '16:9', 1920, 1080, 'ltr');
  assert.equal(ltrLeft.align, 'left');
  assert.ok(ltrLeft.boxX < 300);
});

test('layoutArabicQuote and typing engine properly compute LTR layouts, words, and typing reveal', () => {
  const ctx = createMockMeasureCtx();
  const enPhrase = 'The secret to *consistency* and momentum';
  const layout = layoutArabicQuote(ctx, {
    text: enPhrase,
    quotationMarks: 'none',
    fontFamily: 'Plus Jakarta Sans',
    fontWeight: 700,
    minFontSize: 24,
    maxFontSize: 64,
    fontSizeMultiplier: 1.0,
    lineHeightRatio: 1.5,
    boxX: 100,
    boxY: 100,
    boxWidth: 800,
    boxHeight: 400,
    align: 'left',
    direction: 'ltr',
  });

  assert.ok(layout.lines.length >= 1);
  assert.equal(layout.direction, 'ltr');
  const kwWords = layout.words.filter((w) => w.isKeyword);
  assert.ok(kwWords.length >= 1);
  assert.equal(kwWords[0].text, 'consistency');

  // Verify LTR typing schedule
  const schedule = computeTypingScheduleForLayout(ctx, layout, 0.5, 18, 0.1);
  assert.ok(schedule.allSteps.length > 0);

  // Before typing starts
  const before = evaluateLineTypingAtTime(layout.lines[0], schedule.lines[0], 0.2, 'ltr');
  assert.equal(before.hasStarted, false);
  assert.equal(before.revealedRightX, layout.lines[0].leftX);

  // After typing finishes
  const after = evaluateLineTypingAtTime(
    layout.lines[0],
    schedule.lines[0],
    schedule.typingEndTime + 0.5,
    'ltr'
  );
  assert.equal(after.isFinished, true);
  assert.equal(after.revealedRightX, layout.lines[0].rightX);
});

test('all quote styles and phrase styles successfully compute event times for English content', () => {
  const ctx = createMockMeasureCtx();
  const timelineCfg = {
    enterDuration: 1.5,
    holdDuration: 5.0,
    exitDuration: 1.0,
    autoHold: false,
  };

  for (const style of ALL_STYLES_LIST) {
    const custom: StyleCustomization = {
      mode: style.mode,
      styleId: style.id,
      phraseStyleId: style.mode === 'phrase' ? (style.id as any) : 'calligraphy-ink',
      format: '16:9',
      position: 'center',
      backgroundMode: 'style',
      greenScreen: false,
      accentColor: style.defaultAccent,
      keywordColor: style.defaultKeywordColor || style.defaultAccent,
      textDirection: 'ltr',
      quoteFontOverride: '',
      authorFontOverride: '',
      fontSizeMultiplier: 1.0,
      minimalShape: 'arch',
      seed: 1042,
      typingSpeed: 18,
      pixelDensity: 2,
      terminalBootLine: false,
    };

    const events = getSceneEventTimes(
      ctx,
      {
        quoteText: 'The only way to do *great work* is to love what you do.',
        authorName: 'Steve Jobs',
        subtitle: 'Co-founder of Apple Inc.',
        photoSource: null,
        photoId: 'steve',
        crop: { zoom: 1, offsetX: 0, offsetY: 0 },
        quotationMarks: 'guillemets',
      },
      timelineCfg,
      custom,
      {
        width: 1920,
        height: 1080,
        baseWidth: 1920,
        baseHeight: 1080,
        scale: 1,
      }
    );

    assert.ok(events.enterStart >= 0);
    assert.ok(Array.isArray(events.keywordTimes));
    assert.ok(events.keywordTimes.length >= 1);
  }
});

test('math helpers clamp, lerp, progress, and easing work deterministically', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);

  assert.equal(lerp(10, 20, 0.5), 15);
  assert.equal(progress(1.5, 1.0, 2.0), 0.5);
  assert.equal(progress(0.5, 1.0, 2.0), 0);
  assert.equal(progress(2.5, 1.0, 2.0), 1);

  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);

  assert.equal(easeInCubic(0), 0);
  assert.equal(easeInCubic(1), 1);
  assert.ok(easeInCubic(0.5) < 0.5);

  assert.equal(easeInOutCubic(0.5), 0.5);
});

test('auto hold time calculates ~0.4s per word with minimum 4s in quote mode', () => {
  // 4-word quote -> minimum 4s
  assert.equal(computeAutoHoldDuration('العلم نور والجهل ظلام'), 4);

  // 15-word quote -> 15 * 0.4 = 6.0s
  const fifteenWords = 'واحد اثنان ثلاثة أربعة خمسة ستة سبعة ثمانية تسعة عشرة أحد اثنا ثلاثة أربعة خمسة';
  assert.equal(computeAutoHoldDuration(fifteenWords), 6);

  const timeline = getEffectiveTimeline(
    { enterDuration: 1.5, holdDuration: 5, exitDuration: 1.0, autoHold: true },
    fifteenWords
  );
  assert.equal(timeline.total, 8.5);
  assert.equal(timeline.exitStart, 7.5);

  // Extended enter duration up to 8s
  const longEnter = getEffectiveTimeline(
    { enterDuration: 7.5, holdDuration: 4.0, exitDuration: 1.0, autoHold: false },
    'اختبار'
  );
  assert.equal(longEnter.enter, 7.5);
  assert.equal(longEnter.total, 12.5);
});

test('phrase mode auto-hold (~0.35s/word, min 2s, max 8s) and auto-extension ensure >= 0.8s visibility', () => {
  assert.equal(computePhraseAutoHoldDuration('السر في *الاستمرارية*'), 2);
  const tenWords = 'واحد اثنان ثلاثة أربعة خمسة ستة سبعة ثمانية تسعة عشرة';
  assert.equal(computePhraseAutoHoldDuration(tenWords), 3.5);

  // Short manual hold on many words should auto-extend so >= 0.8s visibility remains
  const extended = getEffectiveTimeline(
    { enterDuration: 0.8, holdDuration: 1.5, exitDuration: 0.6, autoHold: false },
    tenWords,
    'phrase',
    0.75
  );
  assert.equal(extended.holdExtended, true);
  assert.ok(extended.hold > 1.5);
  assert.ok(extended.extendedReasonAr && extended.extendedReasonAr.length > 0);
});

test('parseKeywordMarkup handles single/multiple keywords, multi-word groups, escaped asterisks, unmatched warning, and tashkeel', () => {
  const parsed1 = parseKeywordMarkup('السر الحقيقي في *الاستمرارية* دائماً');
  assert.equal(parsed1.unmatchedAsteriskWarning, false);
  assert.deepEqual(parsed1.keywordGroups, ['الاستمرارية']);
  assert.equal(parsed1.flatTokens.length, 5);
  assert.equal(parsed1.flatTokens[3].text, 'الاستمرارية');
  assert.equal(parsed1.flatTokens[3].isKeyword, true);
  assert.equal(parsed1.flatTokens[3].groupId, 0);

  // Multi-word group + second keyword + tashkeel
  const parsed2 = parseKeywordMarkup('إِنَّ *العَمَلَ المُتَوَاصِلَ* يَصْنَعُ *الفَارِقَ*');
  assert.equal(parsed2.unmatchedAsteriskWarning, false);
  assert.deepEqual(parsed2.keywordGroups, ['العَمَلَ المُتَوَاصِلَ', 'الفَارِقَ']);
  const kwTokens = parsed2.flatTokens.filter((t) => t.isKeyword);
  assert.equal(kwTokens.length, 3);
  assert.equal(kwTokens[0].groupId, 0);
  assert.equal(kwTokens[1].groupId, 0);
  assert.equal(kwTokens[2].groupId, 1);

  // Escaped asterisk
  const parsedEsc = parseKeywordMarkup('ملاحظة \\* مهمة *جداً*');
  assert.equal(parsedEsc.unmatchedAsteriskWarning, false);
  assert.ok(parsedEsc.cleanText.includes('*'));
  assert.deepEqual(parsedEsc.keywordGroups, ['جداً']);

  // Unmatched asterisk ignored with warning flag
  const parsedUnmatched = parseKeywordMarkup('السر في *الاستمرارية');
  assert.equal(parsedUnmatched.unmatchedAsteriskWarning, true);
  assert.equal(parsedUnmatched.keywordGroups.length, 0);
  assert.ok(!parsedUnmatched.cleanText.includes('*'));
});

test('getPhrasePositionBox returns expected regions and disables left/right in 9:16', () => {
  const topBox = getPhrasePositionBox('top', '16:9', 1920, 1080);
  assert.equal(topBox.boxHeight, Math.round(1080 * 0.28));

  const rightBox16x9 = getPhrasePositionBox('right', '16:9', 1920, 1080);
  assert.equal(rightBox16x9.boxWidth, Math.round(1920 * 0.44));

  // In 9:16, right falls back to center box (~70% x 40%)
  const rightBox9x16 = getPhrasePositionBox('right', '9:16', 1080, 1920);
  const centerBox9x16 = getPhrasePositionBox('center', '9:16', 1080, 1920);
  assert.equal(rightBox9x16.boxX, centerBox9x16.boxX);
  assert.equal(rightBox9x16.boxWidth, centerBox9x16.boxWidth);
});

test('isGreenishColor and resolveBackgroundMode enforce background constraints', () => {
  assert.equal(isGreenishColor('#00FF00'), true);
  assert.equal(isGreenishColor('#A8FF35'), true);
  assert.equal(isGreenishColor('#FF3B5C'), false);
  assert.equal(isGreenishColor('#FFD400'), false);

  const mockCustom = {
    mode: 'phrase' as const,
    styleId: 'cinematic' as const,
    phraseStyleId: 'calligraphy-ink' as const,
    format: '16:9' as const,
    fontFamily: 'Aref Ruqaa' as const,
    quoteFontOverride: '' as const,
    authorFontOverride: '' as const,
    fontSizeMultiplier: 1,
    accentColor: '#FFD400',
    keywordColor: '#B3261E',
    quotationMarks: 'none' as const,
    vignetteIntensity: 0.4,
    grainIntensity: 0.3,
    backgroundBlur: 0.5,
    minimalShape: 'circle' as const,
    seed: 1,
    greenScreen: false,
    backgroundMode: 'green' as const,
    position: 'bottom' as const,
    annotationType: 'circle' as const,
  };
  assert.equal(resolveBackgroundMode(mockCustom), 'green');
  assert.equal(resolveBackgroundMode({ ...mockCustom, backgroundMode: undefined, greenScreen: true }), 'green');
  assert.equal(resolveBackgroundMode({ ...mockCustom, backgroundMode: undefined, greenScreen: false }), 'style');
});

test('buildExportFileName formats quote and phrase MP4 filenames accurately', () => {
  const baseCustom = {
    mode: 'quote' as const,
    styleId: 'cinematic' as const,
    phraseStyleId: 'calligraphy-ink' as const,
    format: '16:9' as const,
    fontFamily: 'Amiri' as const,
    quoteFontOverride: '' as const,
    authorFontOverride: '' as const,
    fontSizeMultiplier: 1,
    accentColor: '#FFD400',
    keywordColor: '#FFB800',
    quotationMarks: 'guillemets' as const,
    vignetteIntensity: 0.4,
    grainIntensity: 0.3,
    backgroundBlur: 0.5,
    minimalShape: 'circle' as const,
    seed: 1,
    greenScreen: false,
    backgroundMode: 'style' as const,
    position: 'center' as const,
  };
  assert.equal(
    buildExportFileName(baseCustom, '1080p', 'mp4'),
    'quote-cinematic-style-1080p.mp4'
  );
  assert.equal(
    buildExportFileName(
      { ...baseCustom, mode: 'phrase', backgroundMode: 'green', position: 'bottom' },
      '4K',
      'mp4'
    ),
    'phrase-calligraphy-ink-green-bottom-4K.mp4'
  );
});

test('mulberry32 PRNG and deterministicWave produce identical output for identical seeds', () => {
  const rng1 = mulberry32(combineSeed(42, 10));
  const rng2 = mulberry32(combineSeed(42, 10));
  for (let i = 0; i < 10; i++) {
    assert.equal(rng1(), rng2());
  }

  const w1 = deterministicWave(2.35, 12345, 1.5);
  const w2 = deterministicWave(2.35, 12345, 1.5);
  assert.equal(w1, w2);
});

test('render size and target bitrate scale accurately for 1080p, 1440p, and 4K', () => {
  const s1080 = getRenderSize('16:9', '1080p');
  assert.equal(s1080.width, 1920);
  assert.equal(s1080.height, 1080);
  assert.equal(s1080.scale, 1);

  const s4kShorts = getRenderSize('9:16', '4K');
  assert.equal(s4kShorts.width, 2160);
  assert.equal(s4kShorts.height, 3840);
  assert.equal(s4kShorts.scale, 2);

  assert.equal(getTargetBitrate('1080p', 30, 'high'), 20_000_000);
  assert.equal(getTargetBitrate('4K', 30, 'high'), 80_000_000);
});

test('formatQuoteWithMarks preserves Arabic characters and diacritics intact', () => {
  const diacriticText = 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ';
  assert.equal(formatQuoteWithMarks(diacriticText, 'guillemets'), '«إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ»');
  assert.equal(formatQuoteWithMarks(diacriticText, 'double'), '"إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ"');
  assert.equal(formatQuoteWithMarks(diacriticText, 'none'), 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ');
});

function createMockMeasureCtx(): CanvasRenderingContext2D {
  let currentFont = '700 48px Cairo';
  const parsePx = () => {
    const m = currentFont.match(/(\d+(?:\.\d+)?)px/);
    return m ? parseFloat(m[1]) : 48;
  };
  return {
    save() {},
    restore() {},
    get font() {
      return currentFont;
    },
    set font(v: string) {
      currentFont = v;
    },
    measureText(text: string) {
      const px = parsePx();
      const clusters = splitIntoKeystrokeClusters(text);
      return {
        width: clusters.length * px * 0.52,
      } as TextMetrics;
    },
  } as unknown as CanvasRenderingContext2D;
}

test('PHRASE_STYLES_LIST has 7 styles including pixel_terminal, old_typewriter, phrase_float_glass, and phrase_flyer', () => {
  assert.equal(PHRASE_STYLES_LIST.length, 7);
  assert.equal(PHRASE_STYLES_LIST[3].id, 'pixel_terminal');
  assert.equal(PHRASE_STYLES_LIST[3].nameAr, 'شاشة كمبيوتر سينمائية');
  assert.deepEqual(PHRASE_STYLES_LIST[3].supportedBackgrounds, ['style', 'black']);
  assert.equal(PHRASE_STYLES_LIST[3].recommendedBackground, 'black');

  assert.equal(PHRASE_STYLES_LIST[4].id, 'old_typewriter');
  assert.equal(PHRASE_STYLES_LIST[4].nameAr, 'آلة كتابة قديمة');
  assert.deepEqual(PHRASE_STYLES_LIST[4].supportedBackgrounds, ['style', 'green']);
  assert.equal(PHRASE_STYLES_LIST[4].recommendedBackground, 'green');

  assert.equal(PHRASE_STYLES_LIST[6].id, 'phrase_flyer');
  assert.equal(PHRASE_STYLES_LIST[6].recommendedBackground, 'black');
});

test('splitIntoKeystrokeClusters keeps Arabic base letters and harakat grouped per logical keystroke', () => {
  const clusters = splitIntoKeystrokeClusters('إِنَّ العَمَلَ');
  // Base letters: إ(نّ) + space + ا ل ع م ل => 8 clusters, diacritics stay attached to their base letters
  assert.equal(clusters.length, 8);
  assert.equal(clusters.join(''), 'إِنَّ العَمَلَ');
  assert.equal(countLogicalKeystrokes('إِنَّ *العَمَلَ*'), 8);
});

test('typing auto-hold extension guarantees typing finishes by enter + 0.35*hold and leaves >= 0.8s visibility', () => {
  const eighteenWords =
    'النجاح الحقيقي لا يأتي صدفة أبداً بل يصنعه الإصرار اليومي والعمل المتواصل رغم كل الصعوبات والتحديات الكبيرة دائماً';
  const customSlow: StyleCustomization = {
    mode: 'phrase',
    styleId: 'pixel_terminal',
    phraseStyleId: 'pixel_terminal',
    format: '16:9',
    position: 'center',
    backgroundMode: 'black',
    greenScreen: false,
    accentColor: '#4DD8FF',
    keywordColor: '#FFB000',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1,
    minimalShape: 'arch',
    seed: 1042,
    typingSpeed: 10,
    pixelDensity: 2,
    terminalBootLine: true,
  };

  const typingCfg = getTypingConfigForCustomization(customSlow);
  assert.ok(typingCfg);

  const eff = getEffectiveTimeline(
    { enterDuration: 0.8, holdDuration: 2.5, exitDuration: 0.6, autoHold: false },
    eighteenWords,
    'phrase',
    0.35,
    typingCfg
  );

  assert.equal(eff.holdExtended, true);
  assert.ok(eff.hold > 2.5);
  assert.ok(eff.extendedReasonAr && eff.extendedReasonAr.includes('تم تمديد وقت الثبات تلقائياً'));
});

test('pixel_terminal and old_typewriter pass all 5 phrase cases across 16:9 & 9:16, all positions, and supported backgrounds', () => {
  const ctx = createMockMeasureCtx();
  const phraseCases = [
    // (1) 3-word phrase with 1 keyword
    'السر في *الاستمرارية*',
    // (2) 8 words with 2 keywords + diacritics
    'إِنَّ *العَمَلَ المُتَوَاصِلَ* يَصْنَعُ *الفَارِقَ* فِي حَيَاةِ الإِنْسَانِ',
    // (3) 18 words
    'النجاح الحقيقي لا يأتي صدفة أبداً بل يصنعه *الإصرار اليومي* والعمل المتواصل رغم كل الصعوبات والتحديات الكبيرة دائماً',
    // (4) Keyword breaking across two lines
    'النجاح يبدأ من *الالتزام اليومي المستمر والعمل الدؤوب المثمر والمتواصل* دائماً',
    // (5) No keyword
    'الاستمرارية الهادئة تبني كل إنجاز عظيم',
  ];

  const styles: ('pixel_terminal' | 'old_typewriter')[] = ['pixel_terminal', 'old_typewriter'];
  const formats: ('16:9' | '9:16')[] = ['16:9', '9:16'];
  const positions: PhrasePosition[] = ['center', 'top', 'bottom', 'right', 'left', 'fullscreen'];

  for (const styleId of styles) {
    const meta = getStyleMetadata(styleId);
    const supportedBgs: BackgroundMode[] = meta.supportedBackgrounds || ['style'];

    for (const phraseText of phraseCases) {
      for (const format of formats) {
        const baseW = format === '16:9' ? 1920 : 1080;
        const baseH = format === '16:9' ? 1080 : 1920;

        for (const position of positions) {
          for (const bgMode of supportedBgs) {
            const custom: StyleCustomization = {
              mode: 'phrase',
              styleId,
              phraseStyleId: styleId,
              format,
              position,
              backgroundMode: bgMode,
              greenScreen: bgMode === 'green',
              accentColor: meta.defaultAccent,
              keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
              quoteFontOverride: '',
              authorFontOverride: '',
              fontSizeMultiplier: 1.0,
              minimalShape: 'arch',
              seed: 1042,
              typingSpeed: 18,
              pixelDensity: 2,
              terminalBootLine: false,
            };

            const posBox = getPhrasePositionBox(position, format, baseW, baseH);
            const isFullscreen = position === 'fullscreen';
            const innerW = Math.round(posBox.boxWidth * (isFullscreen ? 0.88 : 0.84));
            const innerH = Math.round(posBox.boxHeight * (isFullscreen ? 0.76 : 0.74));

            const layout = layoutArabicQuote(ctx, {
              text: phraseText,
              quotationMarks: 'none',
              fontFamily: meta.defaultQuoteFont,
              fontWeight: 700,
              minFontSize: 22,
              maxFontSize: isFullscreen ? 118 : 88,
              fontSizeMultiplier: 1.0,
              keywordScaleMultiplier: 1.0,
              lineHeightRatio: 1.48,
              boxX: posBox.boxX + (posBox.boxWidth - innerW) / 2,
              boxY: posBox.boxY + (posBox.boxHeight - innerH) / 2,
              boxWidth: innerW,
              boxHeight: innerH,
              align: posBox.align,
            });

            assert.ok(layout.lines.length >= 1);
            assert.ok(layout.totalHeight <= innerH * 1.15);

            // For case (4), verify keyword breaking across lines produces per-line rects
            if (phraseText === phraseCases[3]) {
              assert.ok(layout.keywordLineRects.length >= 1);
            }

            // Verify typing schedule and event times
            const timelineCfg = {
              enterDuration: 0.8,
              holdDuration: 2.5,
              exitDuration: 0.6,
              autoHold: false,
            };
            const events = getSceneEventTimes(
              ctx,
              {
                quoteText: phraseText,
                authorName: '',
                subtitle: '',
                photoSource: null,
                photoId: 'default',
                crop: { zoom: 1, offsetX: 0, offsetY: 0 },
                quotationMarks: 'none',
              },
              timelineCfg,
              custom,
              {
                width: baseW,
                height: baseH,
                baseWidth: baseW,
                baseHeight: baseH,
                scale: 1,
              }
            );

            assert.ok(events.enterStart >= 0);
            assert.ok(events.keystrokeTimes && events.keystrokeTimes.length > 0);
            assert.equal(events.isMechanicalTypewriter, styleId === 'old_typewriter');

            // Verify keystroke times are monotonically increasing
            for (let i = 1; i < events.keystrokeTimes!.length; i++) {
              assert.ok(events.keystrokeTimes![i] >= events.keystrokeTimes![i - 1]);
            }

            // Verify evaluateLineTypingAtTime progresses from unstarted to finished
            const schedule = computeTypingScheduleForLayout(
              ctx,
              layout,
              events.enterStart,
              18,
              styleId === 'old_typewriter' ? 0.14 : 0.08
            );
            const beforeState = evaluateLineTypingAtTime(layout.lines[0], schedule.lines[0], 0);
            assert.equal(beforeState.hasStarted, false);
            assert.equal(beforeState.revealedLeftX, layout.lines[0].rightX);

            const lastIdx = schedule.lines.length - 1;
            const afterState = evaluateLineTypingAtTime(
              layout.lines[lastIdx],
              schedule.lines[lastIdx],
              schedule.typingEndTime + 0.5
            );
            assert.equal(afterState.isFinished, true);
            assert.equal(afterState.revealedLeftX, layout.lines[lastIdx].leftX);
          }
        }
      }
    }
  }
});

function createMockCanvasContextForChat(): CanvasRenderingContext2D {
  const noop = () => {};
  const gradientMock = { addColorStop: noop };
  const imageDataMock = (w: number, h: number) => ({
    width: w,
    height: h,
    data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
  });
  const makeCtx = (): Record<string, unknown> => {
    const ctx: Record<string, unknown> = {
      font: '700 40px Cairo',
      fillStyle: '#ffffff',
      strokeStyle: '#ffffff',
      lineWidth: 1,
      lineCap: 'round',
      lineJoin: 'round',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      direction: 'rtl',
      textAlign: 'right',
      textBaseline: 'middle',
      imageSmoothingEnabled: true,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      quadraticCurveTo: noop,
      bezierCurveTo: noop,
      arc: noop,
      ellipse: noop,
      rect: noop,
      roundRect: noop,
      clip: noop,
      fill: noop,
      stroke: noop,
      fillRect: noop,
      strokeRect: noop,
      clearRect: noop,
      fillText: noop,
      strokeText: noop,
      drawImage: noop,
      translate: noop,
      scale: noop,
      rotate: noop,
      transform: noop,
      setTransform: noop,
      setLineDash: noop,
      createLinearGradient: () => gradientMock,
      createRadialGradient: () => gradientMock,
      createPattern: () => ({}),
      createImageData: (w: number, h: number) => imageDataMock(w, h),
      putImageData: noop,
      measureText: (str: string) => {
        const m = String(ctx.font).match(/(\d+(?:\.\d+)?)px/);
        const px = m ? parseFloat(m[1]) : 32;
        return { width: Array.from(str).length * px * 0.52 };
      },
    };
    return ctx;
  };

  if (typeof globalThis.document === 'undefined') {
    (globalThis as unknown as Record<string, unknown>).document = {
      createElement: () => ({
        width: 100,
        height: 100,
        getContext: () => makeCtx(),
      }),
    };
  }

  return makeCtx() as unknown as CanvasRenderingContext2D;
}

test('Chat mode: quick-paste parser, position boxes, export filename, and bidi runs', () => {
  // 1) Quick-paste parser
  const parsed = parseQuickPasteChatMessages(
    'س: كيف أتعلم TypeScript بسرعة؟\n\nج: ابدأ ببناء مشروع *حقيقي* صغير اليوم.\n   \nس:   \nج: بالتوفيق!'
  );
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].role, 'user');
  assert.equal(parsed[0].text, 'كيف أتعلم TypeScript بسرعة؟');
  assert.equal(parsed[1].role, 'ai');
  assert.equal(parsed[1].text, 'ابدأ ببناء مشروع *حقيقي* صغير اليوم.');
  assert.equal(parsed[2].role, 'ai');
  assert.equal(parsed[2].text, 'بالتوفيق!');

  // 2) Chat window region dimensions
  const centerBox = getChatPositionBox('center', '16:9', 1920, 1080);
  assert.equal(Math.round((centerBox.boxWidth / 1920) * 100), 62);
  assert.equal(Math.round((centerBox.boxHeight / 1080) * 100), 84);

  const rightBox = getChatPositionBox('right', '16:9', 1920, 1080);
  assert.equal(Math.round((rightBox.boxWidth / 1920) * 100), 44);
  assert.equal(Math.round((rightBox.boxHeight / 1080) * 100), 84);

  const leftBox = getChatPositionBox('left', '16:9', 1920, 1080);
  assert.equal(Math.round((leftBox.boxWidth / 1920) * 100), 44);
  assert.ok(leftBox.boxX < rightBox.boxX);

  const fullBox = getChatPositionBox('fullscreen', '16:9', 1920, 1080);
  assert.equal(Math.round((fullBox.boxX / 1920) * 100), 6);
  assert.equal(Math.round((fullBox.boxWidth / 1920) * 100), 88);

  // In 9:16, left/right fallback safely to center
  const vertRight = getChatPositionBox('right', '9:16', 1080, 1920);
  const vertCenter = getChatPositionBox('center', '9:16', 1080, 1920);
  assert.equal(vertRight.boxX, vertCenter.boxX);
  assert.equal(vertRight.boxWidth, vertCenter.boxWidth);

  // 3) Export filename contract: chat-{style}-{bg}-{position}-{res}.mp4
  const fn1 = buildExportFileName(
    {
      mode: 'chat',
      styleId: 'midnight-blue',
      chatStyleId: 'chat_modern',
      format: '16:9',
      position: 'right',
      backgroundMode: 'green',
      greenScreen: true,
      accentColor: '#4C8DFF',
      quoteFontOverride: '',
      authorFontOverride: '',
      fontSizeMultiplier: 1,
      seed: 42,
      minimalShape: 'arch',
    },
    '1080p',
    'mp4'
  );
  assert.equal(fn1, 'chat-chat_modern-green-right-1080p.mp4');

  // 4) Bidi segmentation: never splits Arabic into individual characters, keeps Latin/numbers LTR
  const runs = segmentTextIntoBidiRuns('مرحبا OpenAI 2025 في عالم AI');
  assert.ok(runs.length >= 3);
  assert.equal(runs[0].direction, 'rtl');
  assert.ok(runs[0].text.includes('مرحبا'));

  // 5) Extended timing bounds: thinkingDelay up to 10s and messageGap up to 3s
  const extendedSched = computeChatSchedule(
    DEFAULT_CHAT_MESSAGES,
    {
      userTypingSpeed: 18,
      aiReplySpeed: 9,
      thinkingDelay: 10,
      messageGap: 3,
      endHold: 2,
    },
    'chat_modern'
  );
  assert.equal(extendedSched.items.length, 2);
  const userEnd = extendedSched.items[0].endTime;
  const aiStart = extendedSched.items[1].startTime;
  assert.equal(Number((aiStart - userEnd).toFixed(2)), 3.0);
  assert.equal(
    Number((extendedSched.items[1].thinkingEnd - extendedSched.items[1].thinkingStart).toFixed(2)),
    10.0
  );
});

test('Chat mode: both styles, both formats, all positions, all backgrounds across all 6 test scenarios', () => {
  const ctx = createMockCanvasContextForChat();

  const sixtyWordReply = Array.from(
    { length: 12 },
    (_, i) => `هذه فقرة تفصيلية رقم ${i + 1} تشرح كيف يعمل *الذكاء* الاصطناعي بدقة`
  ).join(' ');

  const testCases: { name: string; messages: ChatMessage[] }[] = [
    {
      name: '1 question + 1 short reply',
      messages: [
        { id: 'm1', role: 'user', text: 'ما هو سر النجاح المستدام؟' },
        { id: 'm2', role: 'ai', text: 'السر يكمن في *الاستمرارية* والتعلم اليومي.' },
      ],
    },
    {
      name: '3 exchanges (6 messages)',
      messages: [
        { id: 'e1', role: 'user', text: 'كيف أبدأ مشروعاً تقنياً؟' },
        { id: 'e2', role: 'ai', text: 'ابدأ بحل *مشكلة* حقيقية تواجه المستخدمين.' },
        { id: 'e3', role: 'user', text: 'وماذا عن اختيار التقنيات؟' },
        { id: 'e4', role: 'ai', text: 'اختر الأدوات التي تتقنها لإطلاق *النسخة* الأولى سريعاً.' },
        { id: 'e5', role: 'user', text: 'متى أطلق المنتج للجمهور؟' },
        { id: 'e6', role: 'ai', text: 'فور جهوزية الميزة الأساسية واختبارها.' },
      ],
    },
    {
      name: 'One 60-word reply that forces scrolling',
      messages: [
        { id: 's1', role: 'user', text: 'اشرح لي خطة العمل بالتفصيل الكامل.' },
        { id: 's2', role: 'ai', text: sixtyWordReply },
      ],
    },
    {
      name: 'Mixed Arabic + English/numbers',
      messages: [
        { id: 'b1', role: 'user', text: 'هل إصدار TypeScript 5.4 يدعم React 19 بشكل كامل؟' },
        { id: 'b2', role: 'ai', text: 'نعم، يعمل بكفاءة 100% مع *WebCodecs* و Vite 6.' },
      ],
    },
    {
      name: 'Keyword breaking across two lines',
      messages: [
        { id: 'k1', role: 'user', text: 'ما أهم ركيزة في هندسة البرمجيات الحديثة؟' },
        {
          id: 'k2',
          role: 'ai',
          text: 'إن أهم ركيزة على الإطلاق في الأنظمة الكبيرة هي *البساطة المعمارية القابلة للصيانة والتطوير المستمر* عبر السنين.',
        },
      ],
    },
    {
      name: 'Empty message ignored cleanly',
      messages: [
        { id: 'z0', role: 'user', text: '   ' },
        { id: 'z1', role: 'user', text: 'سؤال فعلي بعد رسالة فارغة؟' },
        { id: 'z2', role: 'ai', text: '' },
        { id: 'z3', role: 'ai', text: 'تم تجاهل الرسائل الفارغة بنجاح وعرض *الجواب* السليم.' },
      ],
    },
  ];

  const styles: ChatStyleId[] = ['chat_modern', 'chat_terminal'];
  const formats: ('16:9' | '9:16')[] = ['16:9', '9:16'];
  const positions: PhrasePosition[] = ['center', 'right', 'left', 'fullscreen'];

  for (const styleId of styles) {
    const meta = getStyleMetadata(styleId);
    const supportedBgs = meta.supportedBackgrounds || ['style', 'black'];

    for (const format of formats) {
      const baseW = format === '16:9' ? 1920 : 1080;
      const baseH = format === '16:9' ? 1080 : 1920;

      for (const position of positions) {
        if (format === '9:16' && (position === 'left' || position === 'right')) continue;

        for (const bgMode of supportedBgs) {
          for (const tc of testCases) {
            const custom: StyleCustomization = {
              mode: 'chat',
              styleId: 'midnight-blue',
              chatStyleId: styleId,
              format,
              position,
              backgroundMode: bgMode,
              greenScreen: bgMode === 'green',
              accentColor: meta.defaultAccent,
              keywordColor: meta.defaultKeywordColor,
              quoteFontOverride: '',
              authorFontOverride: '',
              fontSizeMultiplier: 1.0,
              seed: 101,
              minimalShape: 'arch',
              pixelDensity: 1, // use 1 in unit test to avoid document.createElement in node
              chatMessages: tc.messages,
              chatUserLabel: 'أنا',
              chatAiLabel: 'الذكاء الاصطناعي',
              chatTiming: DEFAULT_CHAT_TIMING,
              chatTheme: 'dark',
              chatAiReplyStyle: 'plain',
              chatSwapSides: false,
            };

            const timelineCfg = {
              enterDuration: 0.6,
              holdDuration: 4,
              exitDuration: 0.6,
              autoHold: true,
            };

            const contentObj = {
              quoteText: '',
              authorName: '',
              subtitle: '',
              photoSource: null,
              photoId: 'default',
              crop: { zoom: 1, offsetX: 0, offsetY: 0 },
              quotationMarks: 'none' as const,
              chatMessages: tc.messages,
              userLabel: 'أنا',
              aiLabel: 'الذكاء الاصطناعي',
            };

            const eff = getEffectiveTimeline(
              timelineCfg,
              '',
              'chat',
              0.35,
              getTypingConfigForCustomization(custom)
            );
            assert.ok(eff.total > 2.0, `Total duration should be > 2s for ${tc.name}`);

            const events = getEventTimes({
              ctx,
              content: contentObj,
              timeline: timelineCfg,
              custom,
              viewport: {
                width: baseW,
                height: baseH,
                baseWidth: baseW,
                baseHeight: baseH,
                scale: 1,
              },
            });

            assert.equal(events.enterStart, 0.6);
            assert.ok(Array.isArray(events.keywordTimes));
            assert.ok(Array.isArray(events.sendTimes) && events.sendTimes.length >= 1);
            assert.ok(Array.isArray(events.receiveTimes) && events.receiveTimes.length >= 1);
            assert.ok(Array.isArray(events.keystrokeTimes) && events.keystrokeTimes.length >= 1);

            // Render frames at intro, mid-stream, endHold, and exit without throwing
            const sampleTimes = [0.2, eff.total * 0.45, eff.exitStart - 0.3, eff.total - 0.2];
            for (const t of sampleTimes) {
              renderQuoteFrame(
                ctx,
                t,
                contentObj,
                timelineCfg,
                custom,
                {
                  width: baseW,
                  height: baseH,
                  baseWidth: baseW,
                  baseHeight: baseH,
                  scale: 1,
                }
              );
            }
          }
        }
      }
    }
  }
});

test('Points mode: quick-paste parser, position boxes, markers, schedule auto-hold extension, and export filename', () => {
  // 1) Quick-paste parser strips leading "-", "•", "1.", "١." and ignores empty lines
  const parsed = parseQuickPastePointsItems(
    '- وضوح الهدف قبل البدء\n\n• القوة الحقيقية تكمن في *الاستمرارية*\n1. التعلم السريع من الأخطاء\n١. الالتزام اليومي\n   '
  );
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0].text, 'وضوح الهدف قبل البدء');
  assert.equal(parsed[1].text, 'القوة الحقيقية تكمن في *الاستمرارية*');
  assert.equal(parsed[2].text, 'التعلم السريع من الأخطاء');
  assert.equal(parsed[3].text, 'الالتزام اليومي');

  // 2) Marker formatting
  assert.equal(toArabicIndicDigits(12), '١٢');
  assert.equal(formatPointMarker(0, 'arabic-indic', 3), '١');
  assert.equal(formatPointMarker(0, 'western', 3), '1');
  assert.equal(formatPointMarker(0, 'bullets', 3), '•');
  assert.equal(formatPointMarker(0, 'checks', 3), '✓');
  assert.equal(formatPointMarker(0, 'none', 3), '');
  // Countdown marker for pts_ranking: first gets N, last gets 1
  assert.equal(formatPointMarker(0, 'arabic-indic', 4, true), '٤');
  assert.equal(formatPointMarker(3, 'arabic-indic', 4, true), '١');

  // 3) Points region dimensions: center ~70% w x 80% h; left/right ~44% w x 84% h; fullscreen = 6% margin
  const centerBox = getPointsPositionBox('center', '16:9', 1920, 1080);
  assert.equal(Math.round((centerBox.boxWidth / 1920) * 100), 70);
  assert.equal(Math.round((centerBox.boxHeight / 1080) * 100), 80);

  const rightBox = getPointsPositionBox('right', '16:9', 1920, 1080);
  assert.equal(Math.round((rightBox.boxWidth / 1920) * 100), 44);
  assert.equal(Math.round((rightBox.boxHeight / 1080) * 100), 84);

  const leftBox = getPointsPositionBox('left', '16:9', 1920, 1080);
  assert.equal(Math.round((leftBox.boxWidth / 1920) * 100), 44);
  assert.ok(leftBox.boxX < rightBox.boxX);

  const fullBox = getPointsPositionBox('fullscreen', '16:9', 1920, 1080);
  assert.equal(Math.round((fullBox.boxX / 1920) * 100), 6);
  assert.equal(Math.round((fullBox.boxWidth / 1920) * 100), 88);

  // 4) Schedule & endHold auto-extension when < 0.8s of full visibility would remain after the last item
  const schedDefault = computePointsSchedule(
    DEFAULT_POINTS_TITLE,
    DEFAULT_POINTS_ITEMS,
    DEFAULT_POINTS_TIMING,
    'pts_clean'
  );
  assert.equal(schedDefault.introDuration, 0.6);
  assert.equal(schedDefault.itemTimes.length, 3);
  assert.deepEqual(schedDefault.itemTimes, [0.6, 1.8, 3.0]);

  // Export filename contract: points-{style}-{bg}-{position}-{res}.mp4
  const fnPoints = buildExportFileName(
    {
      mode: 'points',
      styleId: 'midnight-blue',
      pointsStyleId: 'pts_cards',
      format: '16:9',
      position: 'left',
      backgroundMode: 'green',
      greenScreen: true,
      accentColor: '#2F6BFF',
      quoteFontOverride: '',
      authorFontOverride: '',
      fontSizeMultiplier: 1,
      seed: 42,
      minimalShape: 'arch',
    },
    '1080p',
    'mp4'
  );
  assert.equal(fnPoints, 'points-pts_cards-green-left-1080p.mp4');

  // Verify POINTS_STYLES_LIST has all 8 styles (6 core + 1 glass floating + 1 flyer)
  assert.equal(POINTS_STYLES_LIST.length, 8);
  assert.deepEqual(
    POINTS_STYLES_LIST.map((s) => s.id),
    [
      'pts_clean',
      'pts_cards',
      'pts_checklist',
      'pts_timeline',
      'pts_terminal',
      'pts_ranking',
      'pts_float_glass',
      'pts_flyer',
    ]
  );

  // Verify countPointsStats warnings
  const stats = countPointsStats(DEFAULT_POINTS_TITLE, DEFAULT_POINTS_ITEMS);
  assert.equal(stats.hasLongItem, false);
  assert.ok(stats.totalWords > 5 && stats.totalWords < 80);
});

test('Points mode: all 6 styles, both formats, all positions, all supported backgrounds across all 7 required scenarios', () => {
  const ctx = createMockCanvasContextForChat();

  const testScenarios: { name: string; title: string; items: PointsItem[] }[] = [
    {
      name: '1) 2 short items',
      title: 'نقطتان أساسيتان',
      items: [
        { id: 's1', text: 'التركيز العميق كل صباح' },
        { id: 's2', text: 'المراجعة المستمرة للنتائج' },
      ],
    },
    {
      name: '2) 5 items',
      title: '٥ خطوات لبناء مشروع ناجح',
      items: [
        { id: 'f1', text: 'تحديد المشكلة الحقيقية بدقة' },
        { id: 'f2', text: 'بناء نموذج أولي سريع *MVP*' },
        { id: 'f3', text: 'اختبار المنتج مع مستخدمين حقيقيين' },
        { id: 'f4', text: 'تحسين الأداء وتجربة الاستخدام' },
        { id: 'f5', text: 'التوسع التدريجي المدروس' },
      ],
    },
    {
      name: '3) 8 items with long text',
      title: '٨ مبادئ شاملة للإنتاجية والعمل الاحترافي',
      items: Array.from({ length: 8 }, (_, idx) => ({
        id: `l-${idx + 1}`,
        text: `المبدأ رقم ${idx + 1} يركز على تنظيم الوقت وتوزيع المهام المعقدة إلى خطوات يومية واضحة قابلة للتنفيذ والقياس المستمر`,
      })),
    },
    {
      name: '4) items with diacritics and a keyword',
      title: 'حِكَمٌ فِي *الإِتْقَانِ*',
      items: [
        { id: 'd1', text: 'إِنَّ *العَمَلَ المُتَوَاصِلَ* يَصْنَعُ الفَارِقَ الحَقِيقِيَّ' },
        { id: 'd2', text: 'الصَّبْرُ وَالثَّبَاتُ عِنْدَ الشَّدَائِدِ مِفْتَاحُ *النَّجَاحِ*' },
        { id: 'd3', text: 'العِلْمُ نُورٌ يَهْدِي العَقْلَ إِلَى الصَّوَابِ' },
      ],
    },
    {
      name: '5) a keyword breaking across two lines',
      title: 'القاعدة الذهبية',
      items: [
        {
          id: 'k1',
          text: 'النجاح المستدام يعتمد على *الالتزام اليومي المستمر والعمل الدؤوب المثمر والمتواصل دون انقطاع* طوال العام',
        },
        {
          id: 'k2',
          text: 'التطوير التدريجي يحقق نتائج مضاعفة على المدى البعيد',
        },
      ],
    },
    {
      name: '6) mixed Arabic + English/numbers',
      title: 'تقنيات الويب في 2025',
      items: [
        { id: 'm1', text: 'استخدام TypeScript 5.4 مع React 19 لبناء واجهات قوية' },
        { id: 'm2', text: 'تصدير الفيديو بسرعة 60fps عبر *WebCodecs API* مباشرة' },
        { id: 'm3', text: 'تحسين الأداء بنسبة 100% باستخدام OffscreenCanvas' },
      ],
    },
    {
      name: '7) an empty item ignored cleanly',
      title: '٣ أسرار للنجاح',
      items: [
        { id: 'e0', text: '   ' },
        { id: 'e1', text: 'وضوح الرؤية منذ البداية' },
        { id: 'e2', text: '' },
        { id: 'e3', text: 'الاستمرار في *التطوير* اليومي' },
      ],
    },
  ];

  const styles: PointsStyleId[] = [
    'pts_clean',
    'pts_cards',
    'pts_checklist',
    'pts_timeline',
    'pts_terminal',
    'pts_ranking',
  ];
  const formats: ('16:9' | '9:16')[] = ['16:9', '9:16'];
  const positions: PhrasePosition[] = ['center', 'right', 'left', 'fullscreen'];

  for (const styleId of styles) {
    const meta = getStyleMetadata(styleId);
    const supportedBgs = meta.supportedBackgrounds || ['style', 'green', 'black'];
    const supportedMarkers = meta.supportedMarkerTypes || ['arabic-indic'];

    for (const format of formats) {
      const baseW = format === '16:9' ? 1920 : 1080;
      const baseH = format === '16:9' ? 1080 : 1920;

      for (const position of positions) {
        if (format === '9:16' && (position === 'left' || position === 'right')) continue;

        for (const bgMode of supportedBgs) {
          for (const scenario of testScenarios) {
            const custom: StyleCustomization = {
              mode: 'points',
              styleId,
              pointsStyleId: styleId,
              format,
              position,
              backgroundMode: bgMode,
              greenScreen: bgMode === 'green',
              accentColor: meta.defaultAccent,
              keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
              quoteFontOverride: '',
              authorFontOverride: '',
              fontSizeMultiplier: 1.0,
              seed: 1042,
              minimalShape: 'arch',
              pixelDensity: 1,
              pointsMarkerType: supportedMarkers[0],
              pointsHighlightCurrent: true,
              pointsTitle: scenario.title,
              pointsItems: scenario.items,
              pointsTiming: {
                revealInterval: styleId === 'pts_ranking' ? 2.5 : 1.2,
                autoInterval: false,
                endHold: 2.0,
              },
            };

            const timelineCfg = {
              enterDuration: 0.6,
              holdDuration: 4.0,
              exitDuration: 0.6,
              autoHold: false,
            };

            const contentObj = {
              quoteText: '',
              authorName: '',
              subtitle: '',
              photoSource: null,
              photoId: 'default',
              crop: { zoom: 1, offsetX: 0, offsetY: 0 },
              quotationMarks: 'none' as const,
              pointsTitle: scenario.title,
              pointsItems: scenario.items,
              pointsTiming: custom.pointsTiming,
            };

            const eff = getEffectiveTimeline(
              timelineCfg,
              '',
              'points',
              0.35,
              getTypingConfigForCustomization(custom)
            );
            assert.ok(eff.total > 2.5, `Total duration should be > 2.5s for ${scenario.name}`);

            const events = getEventTimes({
              ctx,
              content: contentObj,
              timeline: timelineCfg,
              custom,
              viewport: {
                width: baseW,
                height: baseH,
                baseWidth: baseW,
                baseHeight: baseH,
                scale: 1,
              },
            });

            assert.equal(events.enterStart, 0.6);
            assert.ok(Array.isArray(events.itemTimes) && events.itemTimes.length >= 2);
            assert.ok(Array.isArray(events.keywordTimes));

            // Render frames at intro, mid-reveal, endHold (all visible), and exit without throwing
            const sampleTimes = [0.2, eff.total * 0.45, eff.exitStart - 0.3, eff.total - 0.15];
            for (const t of sampleTimes) {
              renderQuoteFrame(ctx, t, contentObj, timelineCfg, custom, {
                width: baseW,
                height: baseH,
                baseWidth: baseW,
                baseHeight: baseH,
                scale: 1,
              });
            }
          }
        }
      }
    }
  }
});

test('Image Insert ("صورة") mode: regions, backgrounds, export filename, green pixel detector, and event times', () => {
  // 1) Region dimensions:
  // center ~64% w x 76% h; left/right ~44% w x 80% h; corners ~34% w x 40% h (in 9:16: ~60% w x 26% h); fullscreen = safe area (6% margin)
  const center169 = getImagePositionBox('center', '16:9', 1920, 1080);
  assert.equal(Math.round((center169.boxWidth / 1920) * 100), 64);
  assert.equal(Math.round((center169.boxHeight / 1080) * 100), 76);

  const right169 = getImagePositionBox('right', '16:9', 1920, 1080);
  assert.equal(Math.round((right169.boxWidth / 1920) * 100), 44);
  assert.equal(Math.round((right169.boxHeight / 1080) * 100), 80);

  const left169 = getImagePositionBox('left', '16:9', 1920, 1080);
  assert.equal(Math.round((left169.boxWidth / 1920) * 100), 44);
  assert.ok(left169.boxX < right169.boxX);

  const topRight169 = getImagePositionBox('top-right', '16:9', 1920, 1080);
  assert.equal(Math.round((topRight169.boxWidth / 1920) * 100), 34);
  assert.equal(Math.round((topRight169.boxHeight / 1080) * 100), 40);

  const bottomLeft916 = getImagePositionBox('bottom-left', '9:16', 1080, 1920);
  assert.equal(Math.round((bottomLeft916.boxWidth / 1080) * 100), 60);
  assert.equal(Math.round((bottomLeft916.boxHeight / 1920) * 100), 26);

  const full169 = getImagePositionBox('fullscreen', '16:9', 1920, 1080);
  assert.equal(Math.round((full169.boxX / 1920) * 100), 6);
  assert.equal(Math.round((full169.boxWidth / 1920) * 100), 88);

  // In 9:16, left/right fallback safely to center
  const vertRight = getImagePositionBox('right', '9:16', 1080, 1920);
  const vertCenter = getImagePositionBox('center', '9:16', 1080, 1920);
  assert.equal(vertRight.boxX, vertCenter.boxX);
  assert.equal(vertRight.boxWidth, vertCenter.boxWidth);

  // 2) Verify all 7 Image styles exist and disable 'black' (Screen)
  assert.equal(IMAGE_STYLES_LIST.length, 7);
  assert.deepEqual(
    IMAGE_STYLES_LIST.map((s) => s.id),
    [
      'img_polaroid',
      'img_browser',
      'img_newspaper',
      'img_cinematic',
      'img_floating',
      'img_spotlight',
      'img_float_glass',
    ]
  );
  for (const st of IMAGE_STYLES_LIST) {
    assert.ok(st.supportedBackgrounds?.includes('black'), `${st.id} must support black`);
    assert.ok(st.supportedBackgrounds?.includes('style'));
    assert.ok(st.supportedBackgrounds?.includes('green'));
  }

  // All positions in image mode respect 'style', 'green', and 'black'
  const baseImgCustom: StyleCustomization = {
    mode: 'image',
    styleId: 'midnight-blue',
    imageStyleId: 'img_polaroid',
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#D64045',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1,
    seed: 42,
    minimalShape: 'arch',
  };
  assert.equal(resolveBackgroundMode(baseImgCustom), 'style');
  assert.equal(
    resolveBackgroundMode({
      ...baseImgCustom,
      position: 'fullscreen',
      backgroundMode: 'style',
    }),
    'style'
  );
  assert.equal(
    resolveBackgroundMode({
      ...baseImgCustom,
      position: 'center',
      backgroundMode: 'black',
    }),
    'black'
  );
  assert.equal(
    resolveBackgroundMode({
      ...baseImgCustom,
      position: 'top-right',
      backgroundMode: 'green',
    }),
    'green'
  );

  // 3) Export filename contract: image-{style}-{bg}-{position}-{res}.mp4
  const fnImg = buildExportFileName(
    {
      ...baseImgCustom,
      imageStyleId: 'img_spotlight',
      position: 'top-right',
      backgroundMode: 'green',
    },
    '1080p',
    'mp4'
  );
  assert.equal(fnImg, 'image-img_spotlight-green-top-right-1080p.mp4');

  // 4) Green-hue pixel detection
  assert.equal(isRgbPixelGreenHue(0, 255, 0, 255), true);
  assert.equal(isRgbPixelGreenHue(40, 210, 60, 255), true);
  assert.equal(isRgbPixelGreenHue(220, 40, 50, 255), false);
  assert.equal(isRgbPixelGreenHue(0, 255, 0, 0), false); // transparent ignored
});

test('Image Insert ("صورة") mode: all 6 styles, both formats, every position and supported background across all 7 required scenarios', () => {
  const ctx = createMockCanvasContextForChat();

  // Helper to create mock image sources of different aspect ratios / green pixel ratios
  function createMockImageCanvas(
    w: number,
    h: number,
    options?: { greenRatio?: number; transparentCorners?: boolean }
  ): HTMLCanvasElement {
    const greenRatio = options?.greenRatio ?? 0;
    const transparentCorners = options?.transparentCorners ?? false;
    const mockCanvas = {
      width: w,
      height: h,
      getContext: () => {
        const innerCtx = createMockCanvasContextForChat() as unknown as Record<string, unknown>;
        innerCtx.getImageData = (_x: number, _y: number, gw: number, gh: number) => {
          const total = gw * gh;
          const data = new Uint8ClampedArray(total * 4);
          const greenCount = Math.floor(total * greenRatio);
          for (let i = 0; i < total; i++) {
            const idx = i * 4;
            if (transparentCorners && i < Math.floor(total * 0.15)) {
              data[idx] = 0;
              data[idx + 1] = 0;
              data[idx + 2] = 0;
              data[idx + 3] = 0;
            } else if (i < greenCount) {
              data[idx] = 20;
              data[idx + 1] = 230;
              data[idx + 2] = 45;
              data[idx + 3] = 255;
            } else {
              data[idx] = 40;
              data[idx + 1] = 90;
              data[idx + 2] = 180;
              data[idx + 3] = 255;
            }
          }
          return { data, width: gw, height: gh };
        };
        return innerCtx;
      },
    };
    return mockCanvas as unknown as HTMLCanvasElement;
  }

  // Also ensure globalThis.document.createElement supports getImageData for getImageGreenPixelRatio
  const origDoc = (globalThis as unknown as Record<string, unknown>).document as {
    createElement: (tag: string) => unknown;
  };
  let activeGreenSimRatio = 0;
  (globalThis as unknown as Record<string, unknown>).document = {
    createElement: (tag: string) => {
      const el = origDoc.createElement(tag) as {
        width: number;
        height: number;
        getContext: () => Record<string, unknown>;
      };
      const origGetContext = el.getContext;
      el.getContext = () => {
        const c = origGetContext();
        c.getImageData = (_x: number, _y: number, gw: number, gh: number) => {
          const total = gw * gh;
          const data = new Uint8ClampedArray(total * 4);
          const greenCount = Math.floor(total * activeGreenSimRatio);
          for (let i = 0; i < total; i++) {
            const idx = i * 4;
            if (i < greenCount) {
              data[idx] = 15;
              data[idx + 1] = 240;
              data[idx + 2] = 35;
              data[idx + 3] = 255;
            } else {
              data[idx] = 35;
              data[idx + 1] = 75;
              data[idx + 2] = 165;
              data[idx + 3] = 255;
            }
          }
          return { data, width: gw, height: gh };
        };
        return c;
      };
      return el;
    },
  };

  // All 7 required test scenarios:
  // 1) wide screenshot
  // 2) tall portrait photo
  // 3) square logo PNG with transparency
  // 4) long caption with diacritics
  // 5) keyword breaking across two lines
  // 6) no caption
  // 7) image with >8% green pixels
  const scenarios = [
    {
      name: '1) Wide screenshot (16:9)',
      photoId: 'test-wide-screenshot',
      photoSource: createMockImageCanvas(1920, 1080),
      caption: 'لقطة شاشة عريضة تبيّن *نمو الأداء* خلال الربع الأخير',
      sourceLine: 'المصدر: لوحة التحليلات ٢٠٢٥',
      greenSimRatio: 0.01,
    },
    {
      name: '2) Tall portrait photo (9:16)',
      photoId: 'test-tall-portrait',
      photoSource: createMockImageCanvas(1080, 1920),
      caption: 'صورة طولية عالية الدقة مع *تأطير متوازن*',
      sourceLine: 'المصدر: الأرشيف الفوتوغرافي',
      greenSimRatio: 0.0,
    },
    {
      name: '3) Square logo PNG with transparency',
      photoId: 'test-square-transparent-png',
      photoSource: createMockImageCanvas(800, 800, { transparentCorners: true }),
      caption: 'شعار مربّع بخلفية شفافة *PNG* محفوظة بالكامل',
      sourceLine: 'المصدر: الهوية البصرية',
      greenSimRatio: 0.0,
    },
    {
      name: '4) Long caption with Arabic diacritics (tashkeel)',
      photoId: 'test-long-diacritics',
      photoSource: createMockImageCanvas(1600, 1000),
      caption:
        'إِنَّ *التَّخْطِيطَ الاسْتِرَاتِيجِيَّ المُتْقَنَ* وَالمُتَابَعَةَ الدَّقِيقَةَ لِمُؤَشِّرَاتِ النُّمُوِّ يَصْنَعَانِ فَارِقاً جَوْهَرِيّاً فِي نَجَاحِ المَشَارِيعِ الحَدِيثَةِ',
      sourceLine: 'المصدر: مَجَلَّةُ الإِدَارَةِ وَالأَعْمَالِ',
      greenSimRatio: 0.0,
    },
    {
      name: '5) Keyword breaking across two lines',
      photoId: 'test-keyword-two-lines',
      photoSource: createMockImageCanvas(1400, 900),
      caption:
        'تُظهر هذه الوثيقة التاريخية أهمّية *التحول الرقمي المتكامل والابتكار المستمر في البنية التحتية التقنية* على المدى الطويل',
      sourceLine: 'المصدر: التقرير التقني الشامل',
      greenSimRatio: 0.0,
    },
    {
      name: '6) No caption and no source line',
      photoId: 'test-no-caption',
      photoSource: createMockImageCanvas(1280, 720),
      caption: '',
      sourceLine: '',
      greenSimRatio: 0.0,
    },
    {
      name: '7) Image with >8% green pixels',
      photoId: 'test-green-pixels-image',
      photoSource: createMockImageCanvas(1200, 800, { greenRatio: 0.22 }),
      caption: 'صورة تحتوي على *مساحات خضراء* تتجاوز الحد المسموح للكروما',
      sourceLine: 'المصدر: اختبار الكروما الخضراء',
      greenSimRatio: 0.22,
    },
  ];

  // Verify scenario 7 triggers >8% green pixel detection
  activeGreenSimRatio = 0.22;
  const detectedGreenRatio = getImageGreenPixelRatio(
    scenarios[6].photoSource,
    scenarios[6].photoId
  );
  assert.ok(
    detectedGreenRatio > 0.08,
    `Expected >8% green pixels for scenario 7, got ${detectedGreenRatio}`
  );

  activeGreenSimRatio = 0.01;
  const detectedLowGreenRatio = getImageGreenPixelRatio(
    scenarios[0].photoSource,
    scenarios[0].photoId
  );
  assert.ok(
    detectedLowGreenRatio <= 0.08,
    `Expected <=8% green pixels for scenario 1, got ${detectedLowGreenRatio}`
  );

  const styles: ImageStyleId[] = [
    'img_polaroid',
    'img_browser',
    'img_newspaper',
    'img_cinematic',
    'img_floating',
    'img_spotlight',
  ];
  const formats: ('16:9' | '9:16')[] = ['16:9', '9:16'];
  const positions: PhrasePosition[] = [
    'center',
    'right',
    'left',
    'top-right',
    'top-left',
    'bottom-right',
    'bottom-left',
    'fullscreen',
  ];

  for (const styleId of styles) {
    const meta = getStyleMetadata(styleId);
    const supportedBgs: BackgroundMode[] = ['style', 'green', 'black'];

    for (const format of formats) {
      const baseW = format === '16:9' ? 1920 : 1080;
      const baseH = format === '16:9' ? 1080 : 1920;

      for (const position of positions) {
        if (format === '9:16' && (position === 'left' || position === 'right')) continue;

        for (const bgMode of supportedBgs) {

          for (const sc of scenarios) {
            const custom: StyleCustomization = {
              mode: 'image',
              styleId: 'midnight-blue',
              imageStyleId: styleId,
              format,
              position,
              backgroundMode: bgMode,
              greenScreen: bgMode === 'green',
              accentColor: meta.defaultAccent,
              keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
              quoteFontOverride: '',
              authorFontOverride: '',
              fontSizeMultiplier: 1.0,
              seed: 2025,
              minimalShape: 'arch',
              imageCaption: sc.caption,
              imageSourceLine: sc.sourceLine,
              imageFit: meta.defaultImageFit || 'cover',
              imageScale: 1.0,
              imagePushIn: true,
              newspaperKeepColor: false,
              cinematicGrade: true,
              spotlightRegion: DEFAULT_SPOTLIGHT_REGION,
              spotlightShape: 'circle',
            };

            const contentObj = {
              quoteText: sc.caption,
              authorName: sc.sourceLine,
              subtitle: '',
              photoSource: sc.photoSource,
              photoId: sc.photoId,
              crop: { zoom: 1, offsetX: 0, offsetY: 0 },
              quotationMarks: 'none' as const,
              imageCaption: sc.caption,
              imageSourceLine: sc.sourceLine,
            };

            const eff = getEffectiveTimeline(
              DEFAULT_IMAGE_TIMELINE,
              sc.caption,
              'image'
            );
            assert.equal(eff.enter, 0.8);
            assert.equal(eff.hold, 3.0);
            assert.equal(eff.exit, 0.6);
            assert.equal(eff.total, 4.4);

            const events = getEventTimes({
              ctx,
              content: contentObj,
              timeline: DEFAULT_IMAGE_TIMELINE,
              custom,
              viewport: {
                width: baseW,
                height: baseH,
                baseWidth: baseW,
                baseHeight: baseH,
                scale: 1,
              },
            });

            assert.ok(events.enterStart >= 0 && events.enterStart <= 0.1);
            assert.ok(Array.isArray(events.keywordTimes));
            assert.ok(Array.isArray(events.annotationTimes));
            if (styleId === 'img_spotlight') {
              assert.ok(events.annotationTimes.length >= 1);
            }

            // Render frames at enter (0.3s), hold (2.0s), and exit (4.1s) without throwing
            for (const t of [0.3, 2.0, 4.1]) {
              renderQuoteFrame(ctx, t, contentObj, DEFAULT_IMAGE_TIMELINE, custom, {
                width: baseW,
                height: baseH,
                baseWidth: baseW,
                baseHeight: baseH,
                scale: 1,
              });
            }
          }
        }
      }
    }
  }
});

test('Almarai Regular, Bold, and ExtraBold 800 are available in all 25 styles primary font list, excluded from Quote author list, and resolved cleanly for Canvas', () => {
  const almaraiVariants: ArabicFontFamily[] = [
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
  ];

  // 1) Primary Arabic fonts list contains all three weights
  for (const variant of almaraiVariants) {
    assert.ok(
      ARABIC_FONTS_LIST.some((f) => f.family === variant),
      `ARABIC_FONTS_LIST must include ${variant}`
    );
  }

  // 2) Author Arabic fonts list omits Almarai Bold & ExtraBold
  assert.ok(AUTHOR_ARABIC_FONTS_LIST.some((f) => f.family === 'Almarai'));
  assert.ok(!AUTHOR_ARABIC_FONTS_LIST.some((f) => f.family === 'Almarai Bold'));
  assert.ok(!AUTHOR_ARABIC_FONTS_LIST.some((f) => f.family === 'Almarai ExtraBold'));

  // 3) Every single style in ALL_STYLES_LIST (all 38 styles across 6 modes) allows all 3 Almarai variants
  assert.equal(ALL_STYLES_LIST.length, 38);
  for (const st of ALL_STYLES_LIST) {
    if (st.allowedFonts && st.allowedFonts.length > 0) {
      for (const variant of almaraiVariants) {
        assert.ok(
          st.allowedFonts.includes(variant),
          `Style ${st.id} must include ${variant} in allowedFonts`
        );
      }
    }
  }

  // 4) Virtual weight spec resolution & ctx.font application
  assert.deepEqual(resolveStudioFontSpec('Almarai', 700), {
    cssFontFamily: 'Almarai',
    cssFontWeight: 400,
  });
  assert.deepEqual(resolveStudioFontSpec('Almarai Bold', 400), {
    cssFontFamily: 'Almarai',
    cssFontWeight: 700,
  });
  assert.deepEqual(resolveStudioFontSpec('Almarai ExtraBold', 600), {
    cssFontFamily: 'Almarai',
    cssFontWeight: 800,
  });
  assert.deepEqual(resolveStudioFontSpec('Cairo', 700), {
    cssFontFamily: 'Cairo',
    cssFontWeight: 700,
  });

  const ctx = createMockCanvasContextForChat();
  applyStudioCanvasTextProps(ctx, 'Almarai Bold', 400, 48, 'rtl');
  assert.ok(ctx.font.startsWith('700 48px "Almarai"'));

  applyStudioCanvasTextProps(ctx, 'Almarai ExtraBold', 700, 52, 'rtl');
  assert.ok(ctx.font.startsWith('800 52px "Almarai"'));

  applyStudioCanvasTextProps(ctx, 'Almarai', 700, 44, 'rtl');
  assert.ok(ctx.font.startsWith('400 44px "Almarai"'));

  // 5) Render a style from each of the 5 modes with Almarai Bold & ExtraBold without throwing
  const sampleModeStyles = [
    { mode: 'quote' as const, styleId: 'midnight-blue' as const },
    { mode: 'phrase' as const, styleId: 'calligraphy-ink' as const },
    { mode: 'chat' as const, styleId: 'chat_terminal' as const },
    { mode: 'points' as const, styleId: 'pts_ranking' as const },
    { mode: 'image' as const, styleId: 'img_polaroid' as const },
  ];
  for (const { mode, styleId } of sampleModeStyles) {
    for (const fontVariant of almaraiVariants) {
      const custom: StyleCustomization = {
        mode,
        styleId,
        phraseStyleId: mode === 'phrase' ? styleId : undefined,
        chatStyleId: mode === 'chat' ? styleId : undefined,
        pointsStyleId: mode === 'points' ? styleId : undefined,
        imageStyleId: mode === 'image' ? styleId : undefined,
        format: '16:9',
        position: 'center',
        backgroundMode: mode === 'chat' || mode === 'phrase' ? 'style' : 'green',
        greenScreen: mode !== 'chat' && mode !== 'phrase',
        accentColor: '#38BDF8',
        keywordColor: '#FFD400',
        quoteFontOverride: fontVariant,
        authorFontOverride: '',
        fontSizeMultiplier: 1.0,
        seed: 77,
        minimalShape: 'arch',
        chatMessages: DEFAULT_CHAT_MESSAGES,
        pointsTitle: DEFAULT_POINTS_TITLE,
        pointsItems: DEFAULT_POINTS_ITEMS,
        pointsTiming: DEFAULT_POINTS_TIMING,
        imageCaption: DEFAULT_IMAGE_CAPTION,
        imageSourceLine: DEFAULT_IMAGE_SOURCE_LINE,
      };
      renderQuoteFrame(
        ctx,
        1.5,
        {
          quoteText: 'اختبار خط *المراعي* بجميع الأوزان',
          authorName: 'كاتب',
          subtitle: '',
          photoSource: null,
          photoId: 'default',
          crop: { zoom: 1, offsetX: 0, offsetY: 0 },
          quotationMarks: 'guillemets',
          chatMessages: DEFAULT_CHAT_MESSAGES,
          pointsTitle: DEFAULT_POINTS_TITLE,
          pointsItems: DEFAULT_POINTS_ITEMS,
          pointsTiming: DEFAULT_POINTS_TIMING,
          imageCaption: DEFAULT_IMAGE_CAPTION,
          imageSourceLine: DEFAULT_IMAGE_SOURCE_LINE,
        },
        { enterDuration: 0.8, holdDuration: 3.0, exitDuration: 0.6, autoHold: false },
        custom,
        { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 }
      );
    }
  }
});

test('KOMission Black, Zain Rounded instance mob, and 29LT Azahar Display AL TN Trial Bold are registered, included in all non-terminal/non-typewriter styles, excluded from terminal/typewriter styles, calibrated, and render cleanly', () => {
  const newFonts: ArabicFontFamily[] = [
    'KOMission Black',
    'Zain Rounded instance mob',
    '29LT Azahar Display AL TN Trial Bold',
  ];

  // 1) Registered in both primary and author Arabic font lists
  for (const fontName of newFonts) {
    assert.ok(
      ARABIC_FONTS_LIST.some((f) => f.family === fontName),
      `ARABIC_FONTS_LIST must include ${fontName}`
    );
    assert.ok(
      AUTHOR_ARABIC_FONTS_LIST.some((f) => f.family === fontName),
      `AUTHOR_ARABIC_FONTS_LIST must include ${fontName}`
    );
  }

  // 2) Included in all 21 eligible styles, excluded from the 4 terminal/typewriter styles
  const excludedTerminalAndTypewriter = new Set<string>([
    'pixel_terminal',
    'old_typewriter',
    'chat_terminal',
    'pts_terminal',
  ]);
  assert.equal(ALL_STYLES_LIST.length, 38);

  let includedCount = 0;
  let excludedCount = 0;
  for (const st of ALL_STYLES_LIST) {
    if (excludedTerminalAndTypewriter.has(st.id)) {
      excludedCount++;
      assert.ok(
        st.allowedFonts && st.allowedFonts.length > 0,
        `Terminal/typewriter style ${st.id} must explicitly restrict allowedFonts`
      );
      for (const fontName of newFonts) {
        assert.ok(
          !st.allowedFonts!.includes(fontName),
          `Terminal/typewriter style ${st.id} must NOT include ${fontName}`
        );
      }
    } else {
      includedCount++;
      if (st.allowedFonts && st.allowedFonts.length > 0) {
        for (const fontName of newFonts) {
          assert.ok(
            st.allowedFonts.includes(fontName),
            `Eligible style ${st.id} must include ${fontName} in allowedFonts`
          );
        }
      }
    }
  }
  assert.equal(includedCount, 34);
  assert.equal(excludedCount, 4);

  // 3) Calibration profiles & preferred weights prevent faux-bolding and match fallbacks
  const koCal = getFontCalibration('KOMission Black');
  const zainCal = getFontCalibration('Zain Rounded instance mob');
  const azaharCal = getFontCalibration('29LT Azahar Display AL TN Trial Bold');

  assert.equal(koCal.preferredWeight, 900);
  assert.ok(koCal.sizeScale < 1);
  assert.ok(koCal.minLineHeightRatio >= 1.72);
  assert.ok(koCal.fallbackChain?.includes('"Cairo"'));

  assert.equal(zainCal.preferredWeight, 400);
  assert.ok(zainCal.sizeScale > 1);
  assert.ok(zainCal.fallbackChain?.includes('"Zain"'));

  assert.equal(azaharCal.preferredWeight, 700);
  assert.ok(azaharCal.sizeScale < 1);
  assert.ok(azaharCal.minLineHeightRatio >= 1.74);
  assert.ok(azaharCal.spaceRatio >= 0.35);
  assert.ok(azaharCal.fallbackChain?.includes('"Amiri"'));

  assert.deepEqual(resolveStudioFontSpec('KOMission Black', 400), {
    cssFontFamily: 'KOMission Black',
    cssFontWeight: 900,
  });
  assert.deepEqual(resolveStudioFontSpec('Zain Rounded instance mob', 700), {
    cssFontFamily: 'Zain Rounded instance mob',
    cssFontWeight: 400,
  });
  assert.deepEqual(resolveStudioFontSpec('29LT Azahar Display AL TN Trial Bold', 400), {
    cssFontFamily: '29LT Azahar Display AL TN Trial Bold',
    cssFontWeight: 700,
  });
  // Legacy preset compatibility: Light identifier maps seamlessly to Bold 700
  assert.deepEqual(resolveStudioFontSpec('29LT Azahar AL VF TN Trial Display Light', 300), {
    cssFontFamily: '29LT Azahar Display AL TN Trial Bold',
    cssFontWeight: 700,
  });

  const ctx = createMockCanvasContextForChat();
  applyStudioCanvasTextProps(ctx, 'KOMission Black', 400, 46, 'rtl');
  assert.ok(ctx.font.startsWith('900 46px "KOMission Black"'));
  assert.ok(ctx.font.includes('"Cairo"'));

  applyStudioCanvasTextProps(ctx, 'Zain Rounded instance mob', 800, 46, 'rtl');
  assert.ok(ctx.font.startsWith('400 46px "Zain Rounded instance mob"'));
  assert.ok(ctx.font.includes('"Zain"'));

  applyStudioCanvasTextProps(ctx, '29LT Azahar Display AL TN Trial Bold', 400, 46, 'rtl');
  assert.ok(ctx.font.startsWith('700 46px "29LT Azahar Display AL TN Trial Bold"'));
  assert.ok(ctx.font.includes('"Amiri"'));

  // 4) Calibrated layout maintains safe bounds and adapts optical size & line height
  const baseLayout = layoutArabicQuote(ctx, {
    text: 'نص عربي *مهم* مع 123 Arabic & English للاختبار والتنسيق المتوازن',
    quotationMarks: 'none',
    fontFamily: 'Cairo',
    fontWeight: 700,
    minFontSize: 28,
    maxFontSize: 56,
    fontSizeMultiplier: 1.0,
    lineHeightRatio: 1.55,
    boxX: 40,
    boxY: 40,
    boxWidth: 720,
    boxHeight: 420,
    align: 'center',
    direction: 'rtl',
  });
  const koLayout = layoutArabicQuote(ctx, {
    text: 'نص عربي *مهم* مع 123 Arabic & English للاختبار والتنسيق المتوازن',
    quotationMarks: 'none',
    fontFamily: 'KOMission Black',
    fontWeight: 700,
    minFontSize: 28,
    maxFontSize: 56,
    fontSizeMultiplier: 1.0,
    lineHeightRatio: 1.55,
    boxX: 40,
    boxY: 40,
    boxWidth: 720,
    boxHeight: 420,
    align: 'center',
    direction: 'rtl',
  });
  const azaharLayout = layoutArabicQuote(ctx, {
    text: 'نص عربي *مهم* مع 123 Arabic & English للاختبار والتنسيق المتوازن',
    quotationMarks: 'none',
    fontFamily: '29LT Azahar Display AL TN Trial Bold',
    fontWeight: 700,
    minFontSize: 28,
    maxFontSize: 56,
    fontSizeMultiplier: 1.0,
    lineHeightRatio: 1.55,
    boxX: 40,
    boxY: 40,
    boxWidth: 720,
    boxHeight: 420,
    align: 'center',
    direction: 'rtl',
  });

  assert.ok(koLayout.fontSize <= baseLayout.fontSize);
  assert.ok(koLayout.lineHeightRatio >= 1.76);
  assert.ok(azaharLayout.fontSize <= baseLayout.fontSize);
  assert.ok(azaharLayout.lineHeightRatio >= 1.74);
  assert.ok(koLayout.maxLineWidth <= 720 * 1.03);
  assert.ok(azaharLayout.maxLineWidth <= 720 * 1.03);
  assert.ok(azaharLayout.totalHeight <= 420 * 1.05);

  // 5) Render representative eligible styles across all 5 modes in both 16:9 and 9:16
  const sampleModeStyles = [
    { mode: 'quote' as const, styleId: 'midnight-blue' as const },
    { mode: 'phrase' as const, styleId: 'torn-paper' as const },
    { mode: 'chat' as const, styleId: 'chat_modern' as const },
    { mode: 'points' as const, styleId: 'pts_cards' as const },
    { mode: 'points' as const, styleId: 'pts_ranking' as const },
    { mode: 'image' as const, styleId: 'img_polaroid' as const },
  ];

  for (const format of ['16:9', '9:16'] as const) {
    const baseW = format === '16:9' ? 1920 : 1080;
    const baseH = format === '16:9' ? 1080 : 1920;
    for (const { mode, styleId } of sampleModeStyles) {
      for (const fontName of newFonts) {
        const custom: StyleCustomization = {
          mode,
          styleId,
          phraseStyleId: mode === 'phrase' ? styleId : undefined,
          chatStyleId: mode === 'chat' ? styleId : undefined,
          pointsStyleId: mode === 'points' ? styleId : undefined,
          imageStyleId: mode === 'image' ? styleId : undefined,
          format,
          position: 'center',
          backgroundMode: mode === 'chat' || mode === 'phrase' ? 'style' : 'green',
          greenScreen: mode !== 'chat' && mode !== 'phrase',
          accentColor: '#38BDF8',
          keywordColor: '#FFD400',
          quoteFontOverride: fontName,
          authorFontOverride: fontName,
          fontSizeMultiplier: 1.0,
          seed: 99,
          minimalShape: 'arch',
          chatMessages: DEFAULT_CHAT_MESSAGES,
          pointsTitle: DEFAULT_POINTS_TITLE,
          pointsItems: DEFAULT_POINTS_ITEMS,
          pointsTiming: DEFAULT_POINTS_TIMING,
          imageCaption: DEFAULT_IMAGE_CAPTION,
          imageSourceLine: DEFAULT_IMAGE_SOURCE_LINE,
        };
        renderQuoteFrame(
          ctx,
          1.4,
          {
            quoteText: 'تجربة *إبداعية* بخطوط عربية جديدة 2025',
            authorName: 'الاستوديو',
            subtitle: 'نموذج تجريبي',
            photoSource: null,
            photoId: 'default',
            crop: { zoom: 1, offsetX: 0, offsetY: 0 },
            quotationMarks: 'guillemets',
            chatMessages: DEFAULT_CHAT_MESSAGES,
            pointsTitle: DEFAULT_POINTS_TITLE,
            pointsItems: DEFAULT_POINTS_ITEMS,
            pointsTiming: DEFAULT_POINTS_TIMING,
            imageCaption: DEFAULT_IMAGE_CAPTION,
            imageSourceLine: DEFAULT_IMAGE_SOURCE_LINE,
          },
          { enterDuration: 0.8, holdDuration: 3.0, exitDuration: 0.6, autoHold: false },
          custom,
          { width: baseW, height: baseH, baseWidth: baseW, baseHeight: baseH, scale: 1 }
        );
      }
    }
  }
});

test('pts_timeline supports all 5 path shapes (straight, wave, zigzag, circle, stepped), orientations (auto, horizontal, vertical), and vertical sides (auto, alternating, left, right) with pure #00FF00 green screen isolation', () => {
  const shapes = ['straight', 'wave', 'zigzag', 'circle', 'stepped'] as const;
  const orientations = ['auto', 'horizontal', 'vertical'] as const;
  const verticalSides = ['auto', 'alternating', 'left', 'right'] as const;
  const formats = ['16:9', '9:16'] as const;
  const positions = ['center', 'right', 'left', 'fullscreen'] as const;
  const backgrounds = ['style', 'green', 'black'] as const;

  const content = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'guillemets' as const,
    pointsTitle: 'مراحل *الابتكار* الرقمي 2026',
    pointsItems: [
      { id: '1', text: 'تحديد *المشكلة* الأساسية بدقة' },
      { id: '2', text: 'بناء النموذج الأولي MVP بسرعة' },
      { id: '3', text: 'اختبار التجربة مع *المستخدمين*' },
      { id: '4', text: 'التحسين المستمر والتوسع التدريجي' },
    ],
    pointsTiming: DEFAULT_POINTS_TIMING,
  };
  const timeline = { enterDuration: 0.6, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };

  for (const shape of shapes) {
    for (const orientation of orientations) {
      for (const format of formats) {
        const baseW = format === '16:9' ? 1920 : 1080;
        const baseH = format === '16:9' ? 1080 : 1920;
        const size = { width: baseW, height: baseH, baseWidth: baseW, baseHeight: baseH, scale: 1 };

        for (const pos of positions) {
          for (const bg of backgrounds) {
            const sidesToTest =
              orientation === 'vertical' && shape !== 'circle'
                ? verticalSides
                : (['auto'] as const);

            for (const vSide of sidesToTest) {
              let roundRectCount = 0;
              let maxShadowBlur = 0;
              const ctx = createMockCanvasContextForChat();
              const origRoundRect = ctx.roundRect.bind(ctx);
              ctx.roundRect = (...args: Parameters<typeof origRoundRect>) => {
                roundRectCount++;
                return origRoundRect(...args);
              };

              let currentBlur = 0;
              Object.defineProperty(ctx, 'shadowBlur', {
                get: () => currentBlur,
                set: (val: number) => {
                  currentBlur = val;
                  if (val > maxShadowBlur) maxShadowBlur = val;
                },
                configurable: true,
              });

              const custom: StyleCustomization = {
                mode: 'points',
                styleId: 'pts_timeline',
                pointsStyleId: 'pts_timeline',
                format,
                position: pos,
                backgroundMode: bg,
                greenScreen: bg === 'green',
                timelineShape: shape,
                timelineOrientation: orientation,
                timelineVerticalSide: vSide,
                accentColor: '#4DD8FF',
                keywordColor: '#FFD166',
                quoteFontOverride: 'Cairo',
                authorFontOverride: 'Cairo',
                fontSizeMultiplier: 1.0,
                minimalShape: 'arch',
                seed: 1042,
                pointsTitle: content.pointsTitle,
                pointsItems: content.pointsItems,
                pointsTiming: content.pointsTiming,
              };

              const ev = getSceneEventTimes(ctx, content, timeline, custom, size);
              assert.equal(ev.itemTimes?.length, 4);
              assert.ok(ev.keywordTimes.length >= 3);

              renderQuoteFrame(ctx, 3.2, content, timeline, custom, size);

              if (bg === 'green') {
                // In green screen mode, the large container panel is skipped, while each revealed item gets a comfortable semi-transparent text backplate
                assert.ok(
                  roundRectCount >= 1 && roundRectCount <= content.pointsItems.length,
                  `Expected comfortable per-text roundRect backplates (1..${content.pointsItems.length}) in green mode, got ${roundRectCount} for shape=${shape}, orientation=${orientation}, vSide=${vSide}`
                );
                assert.equal(
                  maxShadowBlur,
                  0,
                  `Expected 0 shadowBlur in green mode for shape=${shape}, orientation=${orientation}, vSide=${vSide}`
                );
              }
            }
          }
        }
      }
    }
  }

  // Verify global & per-point size and position adjustments update interactive targets accurately
  const testCtx = createMockCanvasContextForChat();
  const baseSize = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const baseCustom: StyleCustomization = {
    mode: 'points',
    styleId: 'pts_timeline',
    pointsStyleId: 'pts_timeline',
    format: '16:9',
    position: 'center',
    backgroundMode: 'green',
    greenScreen: true,
    timelineShape: 'straight',
    timelineOrientation: 'horizontal',
    accentColor: '#4DD8FF',
    keywordColor: '#FFD166',
    quoteFontOverride: 'Cairo',
    authorFontOverride: 'Cairo',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 1042,
    pointsTitle: content.pointsTitle,
    pointsItems: content.pointsItems,
    pointsTiming: content.pointsTiming,
  };

  const defaultTargets = getPtsTimelineInteractiveTargets(testCtx, content, baseCustom, baseSize);
  assert.equal(defaultTargets.length, 4);

  const adjustedItems = content.pointsItems.map((it, idx) =>
    idx === 0
      ? {
          ...it,
          nodeOffsetX: 60,
          nodeOffsetY: -45,
          textOffsetX: 35,
          textOffsetY: -25,
          itemScale: 1.25,
        }
      : it
  );
  const adjustedCustom: StyleCustomization = {
    ...baseCustom,
    timelineNodeScale: 1.3,
    timelineStemScale: 1.4,
    timelineSpread: 1.2,
    timelineOffsetX: 0.1,
    timelineOffsetY: -0.08,
    pointsItems: adjustedItems,
  };
  const adjustedContent = { ...content, pointsItems: adjustedItems };
  const adjustedTargets = getPtsTimelineInteractiveTargets(
    testCtx,
    adjustedContent,
    adjustedCustom,
    baseSize
  );
  assert.equal(adjustedTargets.length, 4);
  assert.ok(adjustedTargets[0].nodeRadius > defaultTargets[0].nodeRadius);
  assert.notEqual(adjustedTargets[0].nodeX, defaultTargets[0].nodeX);
  assert.notEqual(adjustedTargets[0].nodeY, defaultTargets[0].nodeY);
  assert.notEqual(adjustedTargets[0].textBoxX, defaultTargets[0].textBoxX);
  assert.notEqual(adjustedTargets[0].textBoxY, defaultTargets[0].textBoxY);

  // Render adjusted frame in green mode without errors
  renderQuoteFrame(testCtx, 3.2, adjustedContent, timeline, adjustedCustom, baseSize);
});

test('all 5 glass 3D floating styles (across quote, phrase, chat, points, image) render cleanly with zero shadowBlur in green screen and obey showFloatingObjects toggle', () => {
  const floatingIds = [
    { mode: 'quote' as const, id: 'quote_float_glass' as const },
    { mode: 'phrase' as const, id: 'phrase_float_glass' as const },
    { mode: 'chat' as const, id: 'chat_float_glass' as const },
    { mode: 'points' as const, id: 'pts_float_glass' as const },
    { mode: 'image' as const, id: 'img_float_glass' as const },
  ];

  const size = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const timeline = { enterDuration: 0.8, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };
  const content = {
    quoteText: 'الإبداع يبدأ من *الخيال الحر* والتجربة المستمرة',
    authorName: 'الاستوديو',
    subtitle: '2026',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'guillemets' as const,
    chatMessages: DEFAULT_CHAT_MESSAGES,
    pointsTitle: DEFAULT_POINTS_TITLE,
    pointsItems: DEFAULT_POINTS_ITEMS,
    pointsTiming: DEFAULT_POINTS_TIMING,
    imageCaption: DEFAULT_IMAGE_CAPTION,
    imageSourceLine: DEFAULT_IMAGE_SOURCE_LINE,
  };

  for (const { mode, id } of floatingIds) {
    for (const bg of ['style', 'green'] as const) {
      for (const showFloating of [true, false]) {
        let maxShadowBlur = 0;
        const ctx = createMockCanvasContextForChat();
        let currentBlur = 0;
        Object.defineProperty(ctx, 'shadowBlur', {
          get: () => currentBlur,
          set: (val: number) => {
            currentBlur = val;
            if (val > maxShadowBlur) maxShadowBlur = val;
          },
          configurable: true,
        });

        const custom: StyleCustomization = {
          mode,
          styleId: id,
          phraseStyleId: mode === 'phrase' ? id : undefined,
          chatStyleId: mode === 'chat' ? id : undefined,
          pointsStyleId: mode === 'points' ? id : undefined,
          imageStyleId: mode === 'image' ? id : undefined,
          format: '16:9',
          position: 'center',
          backgroundMode: bg,
          greenScreen: bg === 'green',
          showFloatingObjects: showFloating,
          accentColor: '#38BDF8',
          keywordColor: '#FDE047',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1.0,
          minimalShape: 'arch',
          seed: 1042,
          chatMessages: DEFAULT_CHAT_MESSAGES,
          pointsTitle: DEFAULT_POINTS_TITLE,
          pointsItems: DEFAULT_POINTS_ITEMS,
          pointsTiming: DEFAULT_POINTS_TIMING,
          imageCaption: DEFAULT_IMAGE_CAPTION,
          imageSourceLine: DEFAULT_IMAGE_SOURCE_LINE,
        };

        const ev = getSceneEventTimes(ctx, content, timeline, custom, size);
        assert.ok(ev.enterStart >= 0);

        renderQuoteFrame(ctx, 2.2, content, timeline, custom, size);

        if (bg === 'green') {
          assert.equal(
            maxShadowBlur,
            0,
            `Expected 0 shadowBlur in green mode for floating style ${id} (showFloating=${showFloating})`
          );
        }
      }
    }
  }
});

test('Flyer styles (phrase_flyer & pts_flyer): 4 creatures including firefly ("يراعة"), default tints, preset fallback, export filenames, identical schedule across creatures, and all 7 scenarios across formats/positions/backgrounds', () => {
  // 1) Verify all 4 creatures in FLYER_CREATURES and their default tints
  assert.equal(FLYER_CREATURES.length, 4);
  assert.deepEqual(
    FLYER_CREATURES.map((c) => ({ id: c.id, labelAr: c.labelAr, defaultAccent: c.defaultAccent })),
    [
      { id: 'orb', labelAr: 'كرة نورانية', defaultAccent: '#6FA8FF' },
      { id: 'butterfly', labelAr: 'فراشة', defaultAccent: '#FF8FB8' },
      { id: 'bat', labelAr: 'خفاش', defaultAccent: '#B79CFF' },
      { id: 'firefly', labelAr: 'يراعة', defaultAccent: '#FFC857' },
    ]
  );
  assert.equal(FLYER_DEFAULT_TINTS.orb, '#6FA8FF');
  assert.equal(FLYER_DEFAULT_TINTS.butterfly, '#FF8FB8');
  assert.equal(FLYER_DEFAULT_TINTS.bat, '#B79CFF');
  assert.equal(FLYER_DEFAULT_TINTS.firefly, '#FFC857');
  assert.equal(isGreenishColor(FLYER_DEFAULT_TINTS.firefly), false);

  // 2) Old presets without flyerCreature fall back to 'orb'
  assert.equal(resolveFlyerCreature(undefined), 'orb');
  assert.equal(resolveFlyerCreature(null), 'orb');
  assert.equal(resolveFlyerCreature('unknown_old_value'), 'orb');
  assert.equal(resolveFlyerCreature('firefly'), 'firefly');

  // 3) Export filenames include creature id (e.g., "firefly")
  const baseCustom: StyleCustomization = {
    mode: 'phrase',
    styleId: 'phrase_flyer',
    phraseStyleId: 'phrase_flyer',
    flyerCreature: 'firefly',
    format: '16:9',
    position: 'center',
    backgroundMode: 'black',
    greenScreen: false,
    accentColor: '#FFC857',
    keywordColor: '#FFF3B0',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 2026,
  };
  assert.equal(
    buildExportFileName(baseCustom, '1080p', 'mp4'),
    'phrase-phrase_flyer-firefly-black-center-1080p.mp4'
  );
  assert.equal(
    buildExportFileName(
      {
        ...baseCustom,
        mode: 'points',
        styleId: 'pts_flyer',
        pointsStyleId: 'pts_flyer',
        flyerCreature: 'firefly',
        backgroundMode: 'green',
      },
      '1080p',
      'mp4'
    ),
    'points-pts_flyer-firefly-green-center-1080p.mp4'
  );

  // 4) Firefly deterministic glow rhythm pulses and boosts on keyword hover
  const gBase = computeFireflyGlowIntensity(1.0, 2026, 0);
  const gHover = computeFireflyGlowIntensity(1.0, 2026, 1.0);
  assert.ok(gHover > gBase, 'Hovering on a keyword must boost firefly lantern glow');
  assert.equal(
    computeFireflyGlowIntensity(2.35, 2026, 0.5),
    computeFireflyGlowIntensity(2.35, 2026, 0.5),
    'Firefly glow must be a pure deterministic function of (t, seed, hoverBoost)'
  );

  // 5) Switching creatures never changes flight schedule or event times
  const ctx = createMockCanvasContextForChat();
  const size16x9 = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const timeline = { enterDuration: 1.8, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };
  const sampleContent = {
    quoteText: 'إِنَّ *الإِصْرَارَ* يَصْنَعُ الفَارِقَ فِي كُلِّ *مَسَارٍ* حَقِيقِيٍّ',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: 'ركائز *النجاح* المستدام',
    pointsItems: DEFAULT_POINTS_ITEMS,
    pointsTiming: DEFAULT_POINTS_TIMING,
  };

  const creatures: FlyerCreatureId[] = ['orb', 'butterfly', 'bat', 'firefly'];
  let refPhraseEvents: ReturnType<typeof getSceneEventTimes> | null = null;
  let refPtsEvents: ReturnType<typeof getSceneEventTimes> | null = null;

  for (const cr of creatures) {
    drawCreaturePreviewThumbnail(ctx, 96, 54, cr, FLYER_DEFAULT_TINTS[cr], 1.2);
    const pEv = getSceneEventTimes(
      ctx,
      sampleContent,
      timeline,
      { ...baseCustom, flyerCreature: cr },
      size16x9
    );
    const ptEv = getSceneEventTimes(
      ctx,
      sampleContent,
      timeline,
      {
        ...baseCustom,
        mode: 'points',
        styleId: 'pts_flyer',
        pointsStyleId: 'pts_flyer',
        flyerCreature: cr,
      },
      size16x9
    );
    if (!refPhraseEvents) refPhraseEvents = pEv;
    if (!refPtsEvents) refPtsEvents = ptEv;
    assert.deepEqual(pEv, refPhraseEvents, `phrase_flyer event times must be identical for ${cr}`);
    assert.deepEqual(ptEv, refPtsEvents, `pts_flyer event times must be identical for ${cr}`);
  }

  // 6) Test all 4 creatures, both formats, every position and background across all 7 required scenarios
  const phraseScenarios = [
    // 1. 3-word phrase with 1 keyword
    'القوة في *التركيز*',
    // 2. 8 words with 2 keywords and diacritics
    'إِنَّ *العِلْمَ* نُورٌ يُضِيءُ طَرِيقَ *المُسْتَقْبَلِ* لِكُلِّ مُجْتَهِدٍ',
    // 3. 18 words
    'النجاح الحقيقي لا يأتي صدفة أبداً بل يصنعه *الإصرار* اليومي والعمل المتواصل رغم كل الصعوبات والتحديات الكبيرة في الحياة',
    // 4. Keyword breaking across two lines + mixed Arabic + English/numbers
    'تطوير أنظمة *الذكاء الاصطناعي المتقدمة AI 2026* يفتح آفاقاً واسعة لـ 100 مشروع رقمي حديث',
  ];

  const pointsScenarios: { title: string; items: PointsItem[] }[] = [
    // 5. 3 points
    {
      title: 'خطوات *الإنجاز*',
      items: [
        { id: '1', text: 'تحديد *الهدف* بدقة' },
        { id: '2', text: 'التنفيذ اليومي المنظم' },
        { id: '3', text: 'المراجعة والتحسين المستمر' },
      ],
    },
    // 6. 8 long points
    {
      title: 'خطة *التطوير* الشاملة',
      items: Array.from({ length: 8 }, (_, idx) => ({
        id: `long-${idx + 1}`,
        text: `النقطة الاستراتيجية رقم ${idx + 1} لبناء منظومة *إنتاجية متكاملة* تحقق نتائج ملموسة ومستدامة على المدى الطويل`,
      })),
    },
    // 7. Mixed Arabic + English/numbers
    {
      title: 'تحديثات WebCodecs 2026',
      items: [
        { id: 'm1', text: 'تصدير MP4 بدقة *4K 60fps* بسرعة عالية' },
        { id: 'm2', text: 'دعم Chroma Key #00FF00 ووضع Screen #000000' },
        { id: 'm3', text: 'معاينة فورية بسرعة 60 إطاراً في الثانية' },
      ],
    },
  ];

  const formats = ['16:9', '9:16'] as const;
  const backgrounds: BackgroundMode[] = ['style', 'green', 'black'];
  const phrasePositions: PhrasePosition[] = [
    'center',
    'top',
    'bottom',
    'right',
    'left',
    'fullscreen',
  ];
  const pointsPositions: PhrasePosition[] = ['center', 'right', 'left', 'fullscreen'];

  for (const cr of creatures) {
    for (const fmt of formats) {
      const sz =
        fmt === '16:9'
          ? { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 }
          : { width: 1080, height: 1920, baseWidth: 1080, baseHeight: 1920, scale: 1 };

      for (const bg of backgrounds) {
        // Test phrase_flyer across positions & scenarios
        for (const pos of phrasePositions) {
          for (const text of phraseScenarios) {
            let maxBlur = 0;
            let curBlur = 0;
            const testCtx = createMockCanvasContextForChat();
            Object.defineProperty(testCtx, 'shadowBlur', {
              get: () => curBlur,
              set: (v: number) => {
                curBlur = v;
                if (v > maxBlur) maxBlur = v;
              },
              configurable: true,
            });

            const custom: StyleCustomization = {
              ...baseCustom,
              flyerCreature: cr,
              format: fmt,
              position: pos,
              backgroundMode: bg,
              greenScreen: bg === 'green',
              accentColor: FLYER_DEFAULT_TINTS[cr],
            };
            renderQuoteFrame(
              testCtx,
              1.6,
              { ...sampleContent, quoteText: text },
              timeline,
              custom,
              sz
            );
            if (bg === 'green') {
              assert.equal(maxBlur, 0, `phrase_flyer green mode must have 0 shadowBlur (${cr})`);
            }
          }
        }

        // Test pts_flyer across positions & scenarios
        for (const pos of pointsPositions) {
          for (const sc of pointsScenarios) {
            let maxBlur = 0;
            let curBlur = 0;
            const testCtx = createMockCanvasContextForChat();
            Object.defineProperty(testCtx, 'shadowBlur', {
              get: () => curBlur,
              set: (v: number) => {
                curBlur = v;
                if (v > maxBlur) maxBlur = v;
              },
              configurable: true,
            });

            const custom: StyleCustomization = {
              ...baseCustom,
              mode: 'points',
              styleId: 'pts_flyer',
              pointsStyleId: 'pts_flyer',
              flyerCreature: cr,
              format: fmt,
              position: pos,
              backgroundMode: bg,
              greenScreen: bg === 'green',
              accentColor: FLYER_DEFAULT_TINTS[cr],
              pointsTitle: sc.title,
              pointsItems: sc.items,
            };
            renderQuoteFrame(
              testCtx,
              2.4,
              { ...sampleContent, pointsTitle: sc.title, pointsItems: sc.items },
              timeline,
              custom,
              sz
            );
            if (bg === 'green') {
              assert.equal(maxBlur, 0, `pts_flyer green mode must have 0 shadowBlur (${cr})`);
            }
          }
        }
      }
    }
  }
});

test('Round white feathery nectar orb, smooth curved spline trajectory, and pts_flyer calm reveal speed pacing', () => {
  // 1) Verify sampleFlightWaypoints C1-continuous Catmull-Rom curved arc & calm hover behavior
  const wps = [
    { t: 0, x: 100, y: 200 },
    { t: 0.4, x: 260, y: 170 },
    { t: 1.0, x: 460, y: 210, isHover: true },
    { t: 1.4, x: 460, y: 210, isHover: true },
    { t: 2.0, x: 640, y: 260 },
  ];
  const sPre = sampleFlightWaypoints(wps, 0.39, 2.2, 2.6);
  const sPost = sampleFlightWaypoints(wps, 0.41, 2.2, 2.6);
  assert.ok(Math.hypot(sPost.x - sPre.x, sPost.y - sPre.y) < 16, 'Spline position must remain continuous across waypoints');
  assert.ok(Number.isFinite(sPost.vx) && Number.isFinite(sPost.vy), 'Spline velocity must remain finite');
  const sHover = sampleFlightWaypoints(wps, 1.2, 2.2, 2.6);
  assert.ok(Math.abs(sHover.x - 460) < 1e-6 && Math.abs(sHover.y - 210) < 1e-6, 'Hover anchor must stay calm with zero spline overshoot');

  // 2) Verify pts_flyer calm default (0.65s) + custom slow (1.8s) & fast (0.2s) pacing
  const defaultSched = computePointsSchedule(
    DEFAULT_POINTS_TITLE,
    DEFAULT_POINTS_ITEMS,
    { ...DEFAULT_POINTS_TIMING, revealInterval: 0.8 },
    'pts_flyer'
  );
  assert.ok(
    Math.abs(defaultSched.items[0].revealEnd - defaultSched.items[0].startTime - 0.65) < 1e-6,
    'Default pts_flyer reveal span must be 0.65s'
  );

  const slowSched = computePointsSchedule(
    DEFAULT_POINTS_TITLE,
    DEFAULT_POINTS_ITEMS,
    { ...DEFAULT_POINTS_TIMING, revealInterval: 0.8, flyerRevealDuration: 1.8 },
    'pts_flyer'
  );
  const fastSched = computePointsSchedule(
    DEFAULT_POINTS_TITLE,
    DEFAULT_POINTS_ITEMS,
    { ...DEFAULT_POINTS_TIMING, revealInterval: 0.8, flyerRevealDuration: 0.2 },
    'pts_flyer'
  );
  assert.ok(
    slowSched.items[1].startTime >= slowSched.items[0].startTime + 1.9,
    'Slow pts_flyer reveal must extend spacing so creature finishes sweep before next point'
  );
  assert.ok(
    Math.abs(fastSched.items[0].revealEnd - fastSched.items[0].startTime - 0.2) < 1e-6
  );
  assert.ok(slowSched.totalDuration > fastSched.totalDuration);

  // 3) Render both phrase_flyer and pts_flyer with round white feathery nectar 'orb' (#6FA8FF default) across style, green, black
  const sz = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const timeline = { enterDuration: 2.2, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };
  const bgs: BackgroundMode[] = ['style', 'green', 'black'];
  for (const bg of bgs) {
    let maxBlur = 0;
    let curBlur = 0;
    const ctx = createMockCanvasContextForChat();
    Object.defineProperty(ctx, 'shadowBlur', {
      get: () => curBlur,
      set: (v: number) => {
        curBlur = v;
        if (v > maxBlur) maxBlur = v;
      },
      configurable: true,
    });
    const baseOrbCustom: StyleCustomization = {
      mode: 'points',
      styleId: 'pts_flyer',
      pointsStyleId: 'pts_flyer',
      flyerCreature: 'orb',
      format: '16:9',
      position: 'center',
      backgroundMode: bg,
      greenScreen: bg === 'green',
      accentColor: FLYER_DEFAULT_TINTS.orb,
      keywordColor: '#FDE047',
      quoteFontOverride: '',
      authorFontOverride: '',
      fontSizeMultiplier: 1.0,
      minimalShape: 'arch',
      seed: 99,
      pointsTitle: DEFAULT_POINTS_TITLE,
      pointsItems: DEFAULT_POINTS_ITEMS,
      pointsTiming: { ...DEFAULT_POINTS_TIMING, revealInterval: 1.0, flyerRevealDuration: 1.6 },
    };
    renderQuoteFrame(
      ctx,
      1.5,
      {
        quoteText: 'النور يبدأ من *الداخل* حين تهدأ الروح',
        authorName: '',
        subtitle: '',
        photoSource: null,
        photoId: 'default',
        crop: { zoom: 1, offsetX: 0, offsetY: 0 },
        quotationMarks: 'none',
        pointsTitle: DEFAULT_POINTS_TITLE,
        pointsItems: DEFAULT_POINTS_ITEMS,
        pointsTiming: baseOrbCustom.pointsTiming,
      },
      timeline,
      baseOrbCustom,
      sz
    );
    renderQuoteFrame(
      ctx,
      1.2,
      {
        quoteText: 'النور يبدأ من *الداخل* حين تهدأ الروح',
        authorName: '',
        subtitle: '',
        photoSource: null,
        photoId: 'default',
        crop: { zoom: 1, offsetX: 0, offsetY: 0 },
        quotationMarks: 'none',
      },
      timeline,
      { ...baseOrbCustom, mode: 'phrase', styleId: 'phrase_flyer' },
      sz
    );
    if (bg === 'green') {
      assert.equal(maxBlur, 0, 'Orb green mode must maintain zero shadowBlur');
    }
  }
});

test('Image mode full-fit framing: fitImageSlotInBox exact aspect matching & all 7 image styles green/style/black renders', () => {
  const mkMockImage = (w: number, h: number) =>
    ({
      width: w,
      height: h,
      naturalWidth: w,
      naturalHeight: h,
      getContext: () => createMockCanvasContextForChat(),
    }) as unknown as HTMLCanvasElement;

  const sampleAspects = [
    { name: '16:9 wide', w: 1920, h: 1080 },
    { name: '9:16 tall', w: 1080, h: 1920 },
    { name: '1:1 square', w: 800, h: 800 },
    { name: '21:9 ultrawide', w: 2520, h: 1080 },
  ];

  // Verify fitImageSlotInBox matches natural aspect ratio within <= 1.5% across formats & positions
  for (const format of ['16:9', '9:16'] as const) {
    const baseW = format === '16:9' ? 1920 : 1080;
    const baseH = format === '16:9' ? 1080 : 1920;
    for (const pos of ['center', 'right', 'top-right'] as const) {
      const posBox = getImagePositionBox(pos, format, baseW, baseH, 1.0);
      for (const sa of sampleAspects) {
        const img = mkMockImage(sa.w, sa.h);
        const fitted = fitImageSlotInBox(img, posBox.boxWidth, posBox.boxHeight);
        assert.ok(fitted.photoW <= posBox.boxWidth + 1);
        assert.ok(fitted.photoH <= posBox.boxHeight + 1);
        const targetAspect = sa.w / sa.h;
        const fittedAspect = fitted.photoW / fitted.photoH;
        const relDiff = Math.abs(fittedAspect - targetAspect) / targetAspect;
        assert.ok(
          relDiff < 0.02,
          `${sa.name} in ${format}/${pos}: fitted aspect ${fittedAspect.toFixed(3)} should match ${targetAspect.toFixed(3)}`
        );
      }
    }
  }

  // Render all 7 image templates (including img_float_glass) across wide/tall/square images, with & without caption, and check green mode shadowBlur === 0
  const all7Styles: ImageStyleId[] = [
    'img_polaroid',
    'img_browser',
    'img_newspaper',
    'img_cinematic',
    'img_floating',
    'img_spotlight',
    'img_float_glass',
  ];

  const bgs: BackgroundMode[] = ['style', 'green', 'black'];
  const captions = [
    { cap: 'النمو *الذكي* في التصميم المرئي الحديث', src: 'المصدر: مختبر الرؤية' },
    { cap: '', src: '' },
  ];

  for (const styleId of all7Styles) {
    const meta = getStyleMetadata(styleId);
    for (const bg of bgs) {
      for (const sa of sampleAspects.slice(0, 3)) {
        for (const c of captions) {
          let maxBlur = 0;
          let curBlur = 0;
          const ctx = createMockCanvasContextForChat();
          Object.defineProperty(ctx, 'shadowBlur', {
            get: () => curBlur,
            set: (v: number) => {
              curBlur = v;
              if (v > maxBlur) maxBlur = v;
            },
            configurable: true,
          });

          const custom: StyleCustomization = {
            mode: 'image',
            styleId: 'midnight-blue',
            imageStyleId: styleId,
            format: '16:9',
            position: 'center',
            backgroundMode: bg,
            greenScreen: bg === 'green',
            accentColor: meta.defaultAccent,
            keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
            quoteFontOverride: '',
            authorFontOverride: '',
            fontSizeMultiplier: 1.0,
            seed: 314,
            minimalShape: 'arch',
            pixelDensity: 1,
            imageCaption: c.cap,
            imageSourceLine: c.src,
            imageFit: 'cover',
            imageScale: 1.0,
            imagePushIn: true,
            spotlightRegion: DEFAULT_SPOTLIGHT_REGION,
            spotlightShape: 'circle',
          };

          const contentObj = {
            quoteText: c.cap,
            authorName: c.src,
            subtitle: '',
            photoSource: mkMockImage(sa.w, sa.h),
            photoId: `fit-${sa.name}`,
            crop: { zoom: 1, offsetX: 0, offsetY: 0 },
            quotationMarks: 'none' as const,
            imageCaption: c.cap,
            imageSourceLine: c.src,
          };

          const size = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
          const events = getEventTimes({ ctx, content: contentObj, timeline: DEFAULT_IMAGE_TIMELINE, custom, viewport: size });
          assert.ok(Array.isArray(events.keywordTimes));

          renderQuoteFrame(ctx, 2.0, contentObj, DEFAULT_IMAGE_TIMELINE, custom, size);

          if (bg === 'green') {
            assert.equal(
              maxBlur,
              0,
              `${styleId} (${sa.name}, caption=${Boolean(c.cap)}) green mode must keep shadowBlur === 0`
            );
          }
        }
      }
    }
  }
});

test('Video Insert ("فيديو") mode: 6 style configs, filenames, timeline/speed/trim/loop/freeze, free layout box, and rendering across all formats & boxes', () => {
  // 1) Verify all 6 style metadata configs (supportedBackgrounds: ['style', 'green'], recommended: 'green', excludes 'black')
  assert.equal(VIDEO_STYLES_LIST.length, 6);
  const expectedIds: VideoStyleId[] = [
    'vid_crt',
    'vid_phone',
    'vid_cinematic',
    'vid_floating',
    'vid_pip',
    'vid_camcorder',
  ];
  assert.deepEqual(
    VIDEO_STYLES_LIST.map((s) => s.id),
    expectedIds
  );
  for (const st of VIDEO_STYLES_LIST) {
    assert.deepEqual(st.supportedBackgrounds, ['style', 'green']);
    assert.equal(st.recommendedBackground, 'green');
    assert.equal(st.mode, 'video');
  }

  // 2) Export filenames: video-{style}-{bg}-{pos}-{res}.{ext}
  const baseVidCustom: StyleCustomization = {
    mode: 'video',
    styleId: 'vid_crt',
    videoStyleId: 'vid_crt',
    format: '16:9',
    position: 'center',
    backgroundMode: 'green',
    greenScreen: true,
    accentColor: '#38BDF8',
    keywordColor: '#FDE047',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 2026,
    videoBox: DEFAULT_VIDEO_BOX,
    videoAllowOutOfMargin: false,
    videoAspectLock: true,
    videoAdaptFrameToClip: true,
    videoFit: 'contain',
    videoScale: 1.0,
    videoTrimIn: 1.0,
    videoTrimOut: 5.0,
    videoSpeed: 1.0,
    videoEndBehavior: 'freeze',
    videoAudioEnabled: true,
    videoAudioVolume: 0.85,
    videoCustomDurationEnabled: false,
    videoDurationSec: 8.0,
  };
  assert.equal(
    buildExportFileName(baseVidCustom, '1080p', 'mp4'),
    'video-vid_crt-green-center-1080p.mp4'
  );
  assert.equal(
    buildExportFileName(
      {
        ...baseVidCustom,
        styleId: 'vid_cinematic',
        videoStyleId: 'vid_cinematic',
        backgroundMode: 'style',
        greenScreen: false,
        position: 'fullscreen',
      },
      '4K',
      'mp4'
    ),
    'video-vid_cinematic-style-fullscreen-4K.mp4'
  );

  // 3) Timing & sourceTime: Enter 0.6s, Exit 0.5s, speed 0.5x..2x, loop vs freeze, custom duration
  const vtSlow = computeVideoTimeline({
    videoDuration: 10,
    trimIn: 2,
    trimOut: 6,
    speed: 0.5,
  });
  assert.equal(vtSlow.enter, 0.6);
  assert.equal(vtSlow.exit, 0.5);
  assert.equal(vtSlow.trimmedDuration, 4);
  assert.equal(vtSlow.naturalSpan, 8);
  assert.equal(vtSlow.clipStart, 0.6);
  assert.equal(vtSlow.clipEnd, 8.6);
  assert.equal(vtSlow.total, 9.1);

  const vtFastCustom = computeVideoTimeline({
    videoDuration: 10,
    trimIn: 0,
    trimOut: 4,
    speed: 2.0,
    customDurationEnabled: true,
    customDuration: 6.0,
  });
  assert.equal(vtFastCustom.naturalSpan, 2.0);
  assert.equal(vtFastCustom.hold, 6.0);
  assert.equal(vtFastCustom.clipEnd, 6.6);
  assert.equal(vtFastCustom.total, 7.1);

  // sourceTime before clipStart, freeze past end, and loop wrap past end
  assert.equal(
    computeVideoSourceTime(0.2, {
      clipStart: 0.6,
      clipEnd: 6.6,
      trimIn: 1.0,
      trimOut: 4.0,
      speed: 1.0,
      endBehavior: 'freeze',
    }),
    1.0
  );
  assert.equal(
    computeVideoSourceTime(5.1, {
      clipStart: 0.6,
      clipEnd: 6.6,
      trimIn: 1.0,
      trimOut: 4.0,
      speed: 1.0,
      endBehavior: 'freeze',
    }),
    4.0
  );
  const loopedT = computeVideoSourceTime(5.1, {
    clipStart: 0.6,
    clipEnd: 6.6,
    trimIn: 1.0,
    trimOut: 4.0,
    speed: 1.0,
    endBehavior: 'loop',
  });
  // elapsed = 4.5s over a 3.0s clip -> 1.0 + (4.5 % 3.0) = 2.5s
  assert.ok(Math.abs(loopedT - 2.5) < 1e-6);

  const effVid = getEffectiveTimeline(
    DEFAULT_VIDEO_TIMELINE,
    '',
    'video',
    0,
    getTypingConfigForCustomization(baseVidCustom)
  );
  assert.equal(effVid.enter, 0.6);
  assert.equal(effVid.exit, 0.5);
  assert.equal(effVid.hold, 4.0);
  assert.equal(effVid.total, 5.1);

  // 4) Layout box defaults, clamping (6% safe margin + override), corner resize aspect lock, snap guides, scale 30%-120%
  assert.deepEqual(getDefaultVideoBoxForPosition('center', '16:9'), { x: 18, y: 12, w: 64, h: 76 });
  assert.deepEqual(getDefaultVideoBoxForPosition('right', '16:9'), { x: 50, y: 10, w: 44, h: 80 });
  assert.deepEqual(getDefaultVideoBoxForPosition('left', '16:9'), { x: 6, y: 10, w: 44, h: 80 });
  assert.deepEqual(getDefaultVideoBoxForPosition('fullscreen', '16:9'), { x: 6, y: 6, w: 88, h: 88 });
  // In 9:16 left/right disabled -> falls back to center; corners use 60x26%
  assert.deepEqual(getDefaultVideoBoxForPosition('right', '9:16'), { x: 18, y: 12, w: 64, h: 76 });
  const tr916 = getDefaultVideoBoxForPosition('top-right', '9:16');
  assert.equal(tr916.w, 60);
  assert.equal(tr916.h, 26);

  const clampedSafe = clampVideoBoxToSafeMargin({ x: 0, y: 0, w: 50, h: 50 }, false);
  assert.equal(clampedSafe.x, 6);
  assert.equal(clampedSafe.y, 6);
  const clampedOut = clampVideoBoxToSafeMargin({ x: 0, y: 0, w: 50, h: 50 }, true);
  assert.equal(clampedOut.x, 0);
  assert.equal(clampedOut.y, 0);

  const snapped = snapVideoBoxToGuides({ x: 17.5, y: 11.5, w: 64, h: 76 }, false, 1.5);
  assert.equal(snapped.snappedCenterX, true);
  assert.equal(snapped.snappedCenterY, true);
  assert.equal(snapped.box.x, 18);
  assert.equal(snapped.box.y, 12);

  const startAspect = 50 / 40;
  const resized = resizeVideoBoxFromCorner({ x: 20, y: 20, w: 50, h: 40 }, 'se', -10, -2, true, false);
  const nextAspect = resized.w / resized.h;
  assert.ok(Math.abs(nextAspect - startAspect) < 0.02, 'Corner resize with aspectLock must preserve box aspect ratio');

  const scaled30 = scaleVideoBoxFromBase({ x: 18, y: 12, w: 64, h: 76 }, 0.3, false);
  assert.ok(scaled30.w < 20 && scaled30.h < 24);
  const px169 = videoBoxToPixels(DEFAULT_VIDEO_BOX, 1920, 1080, false);
  const px916 = videoBoxToPixels(DEFAULT_VIDEO_BOX, 1080, 1920, false);
  assert.equal(px169.boxWidth, Math.round(1920 * 0.64));
  assert.equal(px916.boxWidth, Math.round(1080 * 0.64));

  // 5) Shell fitting preserves clip aspect across vertical, square, and widescreen clips
  for (const clipAspect of [16 / 9, 9 / 16, 1.0]) {
    const fitted = fitVideoShellInBox({
      boxX: 100,
      boxY: 80,
      boxWidth: 640,
      boxHeight: 480,
      screenAspect: clipAspect,
      hasCaptionText: true,
      preferCaptionBelow: true,
    });
    assert.ok(fitted.frameW <= 640 + 1);
    assert.ok(fitted.frameH <= 480 + 1);
    const screenAsp = fitted.screenW / fitted.screenH;
    assert.ok(Math.abs(screenAsp - clipAspect) / clipAspect < 0.03);
  }

  // 6) Render all 6 video styles across formats (16:9, 9:16, 4K scale=2), bg ('style', 'green'), clip orientations, captions, and crop/fit modes
  const mkMockVideoCanvas = (w: number, h: number) =>
    ({
      width: w,
      height: h,
      getContext: () => createMockCanvasContextForChat(),
    }) as unknown as HTMLCanvasElement;

  const clipShapes = [
    { label: 'landscape 16:9', w: 1920, h: 1080 },
    { label: 'portrait 9:16', w: 1080, h: 1920 },
    { label: 'square 1:1', w: 1080, h: 1080 },
  ];

  const captionVariants = [
    {
      cap: 'إِنَّ *العَمَلَ المُتَوَاصِلَ* يَصْنَعُ *الفَارِقَ* فِي حَيَاةِ الإِنْسَانِ وَيَبْنِي المُسْتَقْبَلَ',
      src: 'المصدر: مختبر الرؤية',
    },
    { cap: '', src: '' },
  ];

  for (const styleId of expectedIds) {
    const meta = getStyleMetadata(styleId);
    for (const fmt of ['16:9', '9:16'] as const) {
      const sz = getRenderSize(fmt, '1080p');
      for (const bg of ['style', 'green'] as BackgroundMode[]) {
        for (const clipShape of clipShapes) {
          for (const capVar of captionVariants) {
            let maxBlur = 0;
            let curBlur = 0;
            const ctx = createMockCanvasContextForChat();
            Object.defineProperty(ctx, 'shadowBlur', {
              get: () => curBlur,
              set: (v: number) => {
                curBlur = v;
                if (v > maxBlur) maxBlur = v;
              },
              configurable: true,
            });

            const box = capVar.cap
              ? getDefaultVideoBoxForPosition('center', fmt)
              : getDefaultVideoBoxForPosition('top-right', fmt);

            const custom: StyleCustomization = {
              ...baseVidCustom,
              styleId,
              videoStyleId: styleId,
              format: fmt,
              position: capVar.cap ? 'center' : 'top-right',
              videoBox: box,
              backgroundMode: bg,
              greenScreen: bg === 'green',
              accentColor: meta.defaultAccent,
              keywordColor: meta.defaultKeywordColor || meta.defaultAccent,
              videoCaption: capVar.cap,
              videoSourceLine: capVar.src,
              videoFit: styleId === 'vid_cinematic' ? 'cover' : 'contain',
              videoPipShape: styleId === 'vid_pip' && bg === 'style' ? 'rounded-rect' : 'circle',
              videoPipNameTag: styleId === 'vid_pip' ? 'المعلق' : '',
              cinematicGrade: styleId === 'vid_cinematic' && bg === 'style',
              pixelDensity: 1,
            };

            const mockFrame = mkMockVideoCanvas(clipShape.w, clipShape.h);
            const contentObj = {
              quoteText: capVar.cap,
              authorName: capVar.src,
              subtitle: '',
              photoSource: null,
              photoId: 'default',
              crop: { zoom: 1, offsetX: 0, offsetY: 0 },
              quotationMarks: 'none' as const,
              videoPosterSource: mockFrame,
              videoGetFrame: () => mockFrame,
              videoMeta: {
                duration: 8,
                codedWidth: clipShape.w,
                codedHeight: clipShape.h,
                displayWidth: clipShape.w,
                displayHeight: clipShape.h,
                rotation: 0 as const,
                hasAudio: true,
                fileSizeBytes: 1024 * 1024,
                fileName: 'sample.mp4',
              },
              videoCrop: { zoom: 1.35, offsetX: 0.2, offsetY: -0.15 },
              videoCaption: capVar.cap,
              videoSourceLine: capVar.src,
            };

            const events = getEventTimes({
              ctx,
              content: contentObj,
              timeline: DEFAULT_VIDEO_TIMELINE,
              custom,
              viewport: sz,
            });
            assert.equal(events.enterStart, 0.04);
            assert.equal(events.clipStart, 0.6);
            assert.ok(events.clipEnd && events.clipEnd >= 4.5);
            assert.ok(Array.isArray(events.keywordTimes));

            // Render Enter, Active, and Exit frames cleanly
            renderQuoteFrame(ctx, 0.25, contentObj, DEFAULT_VIDEO_TIMELINE, custom, sz);
            renderQuoteFrame(ctx, 2.0, contentObj, DEFAULT_VIDEO_TIMELINE, custom, sz);
            renderQuoteFrame(ctx, effVid.total - 0.15, contentObj, DEFAULT_VIDEO_TIMELINE, custom, sz);

            if (bg === 'green') {
              assert.equal(
                maxBlur,
                0,
                `${styleId} (${fmt}, ${clipShape.label}) in green Chroma Key mode must keep shadowBlur === 0`
              );
            }
          }
        }
      }
    }
  }

  // 7) Verify 4K Scale rendering for Video Insert without throwing
  const sz4k = getRenderSize('16:9', '4K');
  const ctx4k = createMockCanvasContextForChat();
  const mock4k = mkMockVideoCanvas(1920, 1080);
  renderQuoteFrame(
    ctx4k,
    1.8,
    {
      quoteText: 'مقطع بدقة *4K* فائقة',
      authorName: '',
      subtitle: '',
      photoSource: null,
      photoId: '4k',
      crop: { zoom: 1, offsetX: 0, offsetY: 0 },
      quotationMarks: 'none',
      videoPosterSource: mock4k,
      videoGetFrame: () => mock4k,
      videoCaption: 'مقطع بدقة *4K* فائقة',
      videoSourceLine: '',
    },
    DEFAULT_VIDEO_TIMELINE,
    { ...baseVidCustom, pixelDensity: 1 },
    sz4k
  );

  // 8) Verify SFX types 'play-click' and 'glitch' execute safely on mock AudioContext
  const mkMockParam = () => ({
    value: 0,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    cancelScheduledValues: () => {},
  });
  const mkMockAudioCtx = () =>
    ({
      currentTime: 0,
      sampleRate: 48000,
      destination: {},
      createGain: () => ({ gain: mkMockParam(), connect: () => {}, disconnect: () => {} }),
      createOscillator: () => ({
        type: 'sine',
        frequency: mkMockParam(),
        connect: () => {},
        start: () => {},
        stop: () => {},
      }),
      createBiquadFilter: () => ({
        type: 'lowpass',
        frequency: mkMockParam(),
        Q: mkMockParam(),
        connect: () => {},
      }),
      createBuffer: (ch: number, len: number, sr: number) => ({
        numberOfChannels: ch,
        length: len,
        sampleRate: sr,
        getChannelData: () => new Float32Array(len),
      }),
      createBufferSource: () => ({
        buffer: null,
        connect: () => {},
        start: () => {},
        stop: () => {},
      }),
      createConvolver: () => ({
        buffer: null,
        normalize: true,
        connect: () => {},
      }),
    }) as unknown as AudioContext;

  for (const sfxType of ['play-click', 'glitch'] as const) {
    const graph = buildSfxGraph(
      mkMockAudioCtx(),
      { enabled: true, type: sfxType, volume: 0.7, offset: 0, keywordHit: true, itemHit: false },
      { enterStart: 0.6, clipStart: 0.6, clipEnd: 4.6, keywordTimes: [1.5, 2.8] },
      42,
      0
    );
    assert.equal(typeof graph.stop, 'function');
    graph.stop();
  }
});

test('Calm White Gradient ("أبيض هادئ متدرج") theme in pts_timeline, phrase_flyer, and pts_flyer', () => {
  const baseCustom: StyleCustomization = {
    mode: 'points',
    styleId: 'pts_timeline',
    pointsStyleId: 'pts_timeline',
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#4DD8FF',
    keywordColor: '#FFD166',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 1042,
  };

  // 1) Theme resolvers default to 'dark' and resolve 'light' from timelineTheme, flyerTheme, or styleTheme
  assert.equal(resolveTimelineTheme(baseCustom), 'dark');
  assert.equal(resolveFlyerTheme(baseCustom), 'dark');
  assert.equal(resolveTimelineTheme({ ...baseCustom, timelineTheme: 'light' }), 'light');
  assert.equal(resolveFlyerTheme({ ...baseCustom, flyerTheme: 'light' }), 'light');
  assert.equal(resolveTimelineTheme({ ...baseCustom, styleTheme: 'light' }), 'light');
  assert.equal(resolveFlyerTheme({ ...baseCustom, styleTheme: 'light' }), 'light');

  const sz = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const timeline = { enterDuration: 2.2, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };

  // 2) Verify pts_timeline in 'light' theme across all 5 path shapes renders dark slate text (#0F172A) and frosted white cards
  const shapes = ['straight', 'wave', 'zigzag', 'circle', 'stepped'] as const;
  for (const sh of shapes) {
    const fillStylesSeen = new Set<string>();
    const ctx = createMockCanvasContextForChat();
    let curFill: unknown = '#000000';
    Object.defineProperty(ctx, 'fillStyle', {
      get: () => curFill,
      set: (v: unknown) => {
        curFill = v;
        if (typeof v === 'string') fillStylesSeen.add(v.toUpperCase());
      },
      configurable: true,
    });

    renderQuoteFrame(
      ctx,
      3.2,
      {
        quoteText: '',
        authorName: '',
        subtitle: '',
        photoSource: null,
        photoId: 'default',
        crop: { zoom: 1, offsetX: 0, offsetY: 0 },
        quotationMarks: 'none',
        pointsTitle: 'مراحل *التطوير* الأساسية',
        pointsItems: DEFAULT_POINTS_ITEMS,
        pointsTiming: DEFAULT_POINTS_TIMING,
      },
      timeline,
      {
        ...baseCustom,
        timelineShape: sh,
        timelineTheme: 'light',
      },
      sz
    );

    assert.ok(
      fillStylesSeen.has('#0F172A'),
      `pts_timeline (${sh}) in 'light' theme must use dark slate text #0F172A`
    );
    assert.ok(
      fillStylesSeen.has('#D97706'),
      `pts_timeline (${sh}) in 'light' theme must calibrate default pale keyword #FFD166 to high-contrast #D97706`
    );
    assert.ok(
      fillStylesSeen.has('RGBA(255, 255, 255, 0.88)'),
      `pts_timeline (${sh}) in 'light' theme must render frosted white callout card backplate`
    );
  }

  // 3) Verify phrase_flyer and pts_flyer in 'light' theme across all 4 creatures ('orb', 'butterfly', 'bat', 'firefly')
  const creatures: FlyerCreatureId[] = ['orb', 'butterfly', 'bat', 'firefly'];
  for (const cr of creatures) {
    const phraseFills = new Set<string>();
    const ctxPhrase = createMockCanvasContextForChat();
    let curPhraseFill: unknown = '#000000';
    Object.defineProperty(ctxPhrase, 'fillStyle', {
      get: () => curPhraseFill,
      set: (v: unknown) => {
        curPhraseFill = v;
        if (typeof v === 'string') phraseFills.add(v.toUpperCase());
      },
      configurable: true,
    });

    renderQuoteFrame(
      ctxPhrase,
      1.6,
      {
        quoteText: 'الهدوء يصنع *التركيز* العميق في العمل',
        authorName: '',
        subtitle: '',
        photoSource: null,
        photoId: 'default',
        crop: { zoom: 1, offsetX: 0, offsetY: 0 },
        quotationMarks: 'none',
      },
      timeline,
      {
        ...baseCustom,
        mode: 'phrase',
        styleId: 'phrase_flyer',
        phraseStyleId: 'phrase_flyer',
        flyerCreature: cr,
        flyerTheme: 'light',
        accentColor: FLYER_DEFAULT_TINTS[cr],
        keywordColor: '#FDE047',
      },
      sz
    );

    assert.ok(
      phraseFills.has('#0F172A'),
      `phrase_flyer (${cr}) in 'light' theme must render dark slate text #0F172A`
    );
    assert.ok(
      phraseFills.has('#D97706'),
      `phrase_flyer (${cr}) in 'light' theme must calibrate pale keyword #FDE047 to #D97706`
    );

    const ptsFills = new Set<string>();
    const ctxPts = createMockCanvasContextForChat();
    let curPtsFill: unknown = '#000000';
    Object.defineProperty(ctxPts, 'fillStyle', {
      get: () => curPtsFill,
      set: (v: unknown) => {
        curPtsFill = v;
        if (typeof v === 'string') ptsFills.add(v.toUpperCase());
      },
      configurable: true,
    });

    renderQuoteFrame(
      ctxPts,
      2.4,
      {
        quoteText: '',
        authorName: '',
        subtitle: '',
        photoSource: null,
        photoId: 'default',
        crop: { zoom: 1, offsetX: 0, offsetY: 0 },
        quotationMarks: 'none',
        pointsTitle: 'خطوات *النجاح* المستدام',
        pointsItems: DEFAULT_POINTS_ITEMS,
        pointsTiming: DEFAULT_POINTS_TIMING,
      },
      timeline,
      {
        ...baseCustom,
        mode: 'points',
        styleId: 'pts_flyer',
        pointsStyleId: 'pts_flyer',
        flyerCreature: cr,
        flyerTheme: 'light',
        accentColor: FLYER_DEFAULT_TINTS[cr],
        keywordColor: '#FDE047',
      },
      sz
    );

    assert.ok(
      ptsFills.has('#0F172A'),
      `pts_flyer (${cr}) in 'light' theme must render dark slate text & numerals #0F172A`
    );
    assert.ok(
      ptsFills.has('RGBA(255, 255, 255, 0.82)'),
      `pts_flyer (${cr}) in 'light' theme must render frosted white row cards`
    );

    // Live thumbnail preview in both 'dark' and 'light' themes
    drawCreaturePreviewThumbnail(ctxPts, 96, 54, cr, FLYER_DEFAULT_TINTS[cr], 0.8, 'dark');
    drawCreaturePreviewThumbnail(ctxPts, 96, 54, cr, FLYER_DEFAULT_TINTS[cr], 0.8, 'light');
  }
});

test('Smooth slow continuous creature flight around text and flyerFlightSpeed control', () => {
  // 1) Verify resolveFlyerFlightSpeed defaults to 0.55 and clamps [0.25, 1.25]
  assert.equal(resolveFlyerFlightSpeed(), DEFAULT_FLYER_FLIGHT_SPEED);
  assert.equal(resolveFlyerFlightSpeed({}), 0.55);
  assert.equal(resolveFlyerFlightSpeed({ flyerFlightSpeed: 0.1 }), 0.25);
  assert.equal(resolveFlyerFlightSpeed({ flyerFlightSpeed: 2.0 }), 1.25);
  assert.equal(resolveFlyerFlightSpeed({ flyerFlightSpeed: 0.35 }), 0.35);

  // 2) Verify flowing waypoints with keywordGlow maintain non-zero velocity (no sudden stops) and smooth hoverBoost
  const flowingWps = [
    { t: 0, x: 1200, y: 420, isHover: false, keywordGlow: 0.15 },
    { t: 0.9, x: 960, y: 400, isHover: false, keywordGlow: 1.0 },
    { t: 1.8, x: 700, y: 415, isHover: false, keywordGlow: 0.2 },
    { t: 2.8, x: 860, y: 560, isHover: false, keywordGlow: 0.25 },
  ];
  for (const sampleT of [0.45, 0.9, 1.35, 2.2]) {
    const st = sampleFlightWaypoints(flowingWps, sampleT, 3.2, 3.8);
    const speed = Math.hypot(st.vx, st.vy);
    assert.ok(speed > 25, `Flowing trajectory at t=${sampleT} must maintain continuous non-zero velocity (got ${speed})`);
  }
  const kwState = sampleFlightWaypoints(flowingWps, 0.88, 3.2, 3.8);
  assert.ok(kwState.hoverBoost > 0.8, 'Passing over a keyword waypoint must boost glow smoothly without stopping');

  // 3) Verify slower flyerFlightSpeed (0.35x) spreads keyword reveal times slower than faster (0.95x) in phrase_flyer
  const ctx = createMockCanvasContextForChat();
  const sz = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const timeline = { enterDuration: 1.2, holdDuration: 4.0, exitDuration: 0.6, autoHold: false };
  const content = {
    quoteText: 'الهدوء والسكينة يصنعان *التركيز* العميق في كل *خطوة* يومية',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: 'خطوات *الهدوء* والتركيز',
    pointsItems: DEFAULT_POINTS_ITEMS,
    pointsTiming: DEFAULT_POINTS_TIMING,
  };
  const baseCustom: StyleCustomization = {
    mode: 'phrase',
    styleId: 'phrase_flyer',
    phraseStyleId: 'phrase_flyer',
    flyerCreature: 'orb',
    flyerFlightSpeed: 0.55,
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#6FA8FF',
    keywordColor: '#FDE047',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 2026,
  };

  const evSlow = getSceneEventTimes(ctx, content, timeline, { ...baseCustom, flyerFlightSpeed: 0.35 }, sz);
  const evFast = getSceneEventTimes(ctx, content, timeline, { ...baseCustom, flyerFlightSpeed: 0.95 }, sz);
  assert.ok(
    evSlow.keywordTimes.length >= 2 && evFast.keywordTimes.length >= 2,
    'Both slow and fast flyer schedules must emit keyword times'
  );
  assert.ok(
    evSlow.keywordTimes[1] > evFast.keywordTimes[1],
    `Ultra-slow flight (0.35x) must reach second keyword later (${evSlow.keywordTimes[1]}s) than faster flight (${evFast.keywordTimes[1]}s)`
  );

  // 4) Render phrase_flyer & pts_flyer across multiple timestamps (including late hold t=3.8s) and speeds without error
  for (const spd of [0.35, 0.55, 0.95]) {
    for (const t of [0.5, 1.8, 3.8]) {
      renderQuoteFrame(ctx, t, content, timeline, { ...baseCustom, flyerFlightSpeed: spd }, sz);
      renderQuoteFrame(
        ctx,
        t,
        content,
        timeline,
        {
          ...baseCustom,
          mode: 'points',
          styleId: 'pts_flyer',
          pointsStyleId: 'pts_flyer',
          flyerFlightSpeed: spd,
        },
        sz
      );
    }
  }
});

test('Gradual-wave flyer trajectories remain C1-smooth without sharp turns, and Bat/Butterfly/Orb render calm living ambient backdrops', () => {
  const ctx = createMockCanvasContextForChat();
  const sz = { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 };
  const timeline = { enterDuration: 1.4, holdDuration: 4.0, exitDuration: 0.6, autoHold: false };
  const multiLineQuote =
    'الهدوء والسكينة يصنعان *التركيز* العميق في كل *خطوة* يومية متواصلة نحو الإنجاز الحقيقي';

  const content = {
    quoteText: multiLineQuote,
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: 'خطوات *الهدوء* المستمر',
    pointsItems: DEFAULT_POINTS_ITEMS,
    pointsTiming: DEFAULT_POINTS_TIMING,
  };

  const baseCustom: StyleCustomization = {
    mode: 'phrase',
    styleId: 'phrase_flyer',
    phraseStyleId: 'phrase_flyer',
    flyerCreature: 'bat',
    flyerFlightSpeed: 0.55,
    format: '16:9',
    position: 'center',
    backgroundMode: 'style',
    greenScreen: false,
    accentColor: '#B79CFF',
    keywordColor: '#FDE047',
    quoteFontOverride: '',
    authorFontOverride: '',
    fontSizeMultiplier: 1.0,
    minimalShape: 'arch',
    seed: 1042,
  };

  // 1) Verify phrase_flyer C1 velocity continuity and zero sharp hairpin turns across 30ms samples
  const phrasePlan = buildPhraseFlyerPlan(ctx, content, timeline, baseCustom, sz);
  assert.ok(phrasePlan.waypoints.length >= 4);
  for (let i = 1; i < phrasePlan.waypoints.length - 1; i++) {
    const tKnot = phrasePlan.waypoints[i].t;
    const pre = sampleFlightWaypoints(phrasePlan.waypoints, tKnot - 0.0001, phrasePlan.effective.exitStart, phrasePlan.effective.total);
    const post = sampleFlightWaypoints(phrasePlan.waypoints, tKnot + 0.0001, phrasePlan.effective.exitStart, phrasePlan.effective.total);
    const dv = Math.hypot(post.vx - pre.vx, post.vy - pre.vy);
    assert.ok(dv < 5, `phrase_flyer velocity must be C1 continuous across knot ${i} at t=${tKnot} (dv=${dv})`);
  }

  let prevDirX = 0;
  let prevDirY = 0;
  let hasPrevDir = false;
  for (let t = 0.06; t <= phrasePlan.effective.total - 0.25; t += 0.03) {
    const st = sampleFlightWaypoints(phrasePlan.waypoints, t, phrasePlan.effective.exitStart, phrasePlan.effective.total);
    const sp = Math.hypot(st.vx, st.vy);
    if (sp > 20) {
      const dx = st.vx / sp;
      const dy = st.vy / sp;
      if (hasPrevDir) {
        const dot = prevDirX * dx + prevDirY * dy;
        assert.ok(dot > 0.72, `phrase_flyer must avoid sharp turns at t=${t.toFixed(2)} (dot=${dot.toFixed(3)})`);
      }
      prevDirX = dx;
      prevDirY = dy;
      hasPrevDir = true;
    }
  }

  // 2) Verify pts_flyer C1 velocity continuity and zero sharp turns across 30ms samples
  const ptsCustom: StyleCustomization = {
    ...baseCustom,
    mode: 'points',
    styleId: 'pts_flyer',
    pointsStyleId: 'pts_flyer',
  };
  const ptsPlan = buildPointsFlyerPlan(ctx, content, ptsCustom, sz);
  assert.ok(ptsPlan.waypoints.length >= 4);
  for (let i = 1; i < ptsPlan.waypoints.length - 1; i++) {
    const tKnot = ptsPlan.waypoints[i].t;
    const pre = sampleFlightWaypoints(ptsPlan.waypoints, tKnot - 0.0001, ptsPlan.schedule.exitStart, ptsPlan.schedule.totalDuration);
    const post = sampleFlightWaypoints(ptsPlan.waypoints, tKnot + 0.0001, ptsPlan.schedule.exitStart, ptsPlan.schedule.totalDuration);
    const dv = Math.hypot(post.vx - pre.vx, post.vy - pre.vy);
    assert.ok(dv < 5, `pts_flyer velocity must be C1 continuous across knot ${i} at t=${tKnot} (dv=${dv})`);
  }

  hasPrevDir = false;
  for (let t = 0.06; t <= ptsPlan.schedule.totalDuration - 0.25; t += 0.03) {
    const st = sampleFlightWaypoints(ptsPlan.waypoints, t, ptsPlan.schedule.exitStart, ptsPlan.schedule.totalDuration);
    const sp = Math.hypot(st.vx, st.vy);
    if (sp > 20) {
      const dx = st.vx / sp;
      const dy = st.vy / sp;
      if (hasPrevDir) {
        const dot = prevDirX * dx + prevDirY * dy;
        assert.ok(dot > 0.72, `pts_flyer must avoid sharp turns at t=${t.toFixed(2)} (dot=${dot.toFixed(3)})`);
      }
      prevDirX = dx;
      prevDirY = dy;
      hasPrevDir = true;
    }
  }

  // 3) Verify bespoke calm animated bokeh gradients execute for Bat, Butterfly, and Orb in both dark and light themes, while Green stays pure
  const creatures: FlyerCreatureId[] = ['bat', 'butterfly', 'orb', 'firefly'];
  for (const cr of creatures) {
    for (const theme of ['dark', 'light'] as const) {
      let radialGradCalls = 0;
      const testCtx = createMockCanvasContextForChat();
      const origRadial = testCtx.createRadialGradient.bind(testCtx);
      testCtx.createRadialGradient = ((...args: Parameters<CanvasRenderingContext2D['createRadialGradient']>) => {
        radialGradCalls++;
        return origRadial(...args);
      }) as CanvasRenderingContext2D['createRadialGradient'];

      renderQuoteFrame(
        testCtx,
        1.5,
        content,
        timeline,
        {
          ...baseCustom,
          flyerCreature: cr,
          flyerTheme: theme,
          accentColor: FLYER_DEFAULT_TINTS[cr],
          backgroundMode: 'style',
        },
        sz
      );

      assert.ok(
        radialGradCalls >= 10,
        `${cr} (${theme}) must render calm layered ambient glow & bokeh gradients (got ${radialGradCalls})`
      );
    }

    // Green Chroma Key purity check
    let maxBlur = 0;
    let curBlur = 0;
    const greenCtx = createMockCanvasContextForChat();
    Object.defineProperty(greenCtx, 'shadowBlur', {
      get: () => curBlur,
      set: (v: number) => {
        curBlur = v;
        if (v > maxBlur) maxBlur = v;
      },
      configurable: true,
    });
    renderQuoteFrame(
      greenCtx,
      1.5,
      content,
      timeline,
      {
        ...baseCustom,
        flyerCreature: cr,
        accentColor: FLYER_DEFAULT_TINTS[cr],
        backgroundMode: 'green',
        greenScreen: true,
      },
      sz
    );
    assert.equal(maxBlur, 0, `${cr} green mode must preserve shadowBlur === 0`);
  }
});

test('Bat theme renders a polished tapered crescent moon with clipped lunar shading and zero opaque dark cutout', () => {
  const thumbSize = 96;
  for (const theme of ['dark', 'light'] as const) {
    let clipCalls = 0;
    let bezierCalls = 0;
    let usedOpaqueDarkCutout = false;
    const rawCtx = createMockCanvasContextForChat();
    const origClip = rawCtx.clip.bind(rawCtx);
    const origBezier = rawCtx.bezierCurveTo.bind(rawCtx);
    let currentFill: unknown = rawCtx.fillStyle;
    Object.defineProperty(rawCtx, 'fillStyle', {
      get: () => currentFill,
      set: (v: unknown) => {
        if (typeof v === 'string' && v.toUpperCase() === '#0A081B') {
          usedOpaqueDarkCutout = true;
        }
        currentFill = v;
      },
      configurable: true,
    });
    rawCtx.clip = ((...args: Parameters<CanvasRenderingContext2D['clip']>) => {
      clipCalls++;
      return origClip(...args);
    }) as CanvasRenderingContext2D['clip'];
    rawCtx.bezierCurveTo = ((...args: Parameters<CanvasRenderingContext2D['bezierCurveTo']>) => {
      bezierCalls++;
      return origBezier(...args);
    }) as CanvasRenderingContext2D['bezierCurveTo'];

    drawCreaturePreviewThumbnail(rawCtx, thumbSize, thumbSize, 'bat', FLYER_DEFAULT_TINTS.bat, 1.2, theme);
    assert.ok(clipCalls >= 1, `Bat thumbnail (${theme}) must clip inside crescent moon for lunar texture`);
    assert.ok(bezierCalls >= 10, `Bat thumbnail (${theme}) must trace multi-shell feathered crescent edges`);
    assert.equal(usedOpaqueDarkCutout, false, `Bat (${theme}) must never stamp an opaque #0A081B circle cutout`);
  }

  // Verify soft glow radius evolves gradually across time for both dark and light Bat scenes
  const captureMaxGlowRadius = (t: number, theme: 'dark' | 'light'): number => {
    let maxR = 0;
    const rawCtx = createMockCanvasContextForChat();
    const origRadial = rawCtx.createRadialGradient.bind(rawCtx);
    rawCtx.createRadialGradient = ((x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
      if (r1 > maxR) maxR = r1;
      return origRadial(x0, y0, r0, x1, y1, r1);
    }) as CanvasRenderingContext2D['createRadialGradient'];
    drawCreaturePreviewThumbnail(rawCtx, 120, 120, 'bat', FLYER_DEFAULT_TINTS.bat, t, theme);
    return maxR;
  };
  assert.notEqual(
    captureMaxGlowRadius(0.1, 'dark'),
    captureMaxGlowRadius(2.4, 'dark'),
    'Dark Bat moon soft glow radius must evolve gradually over time'
  );
  assert.notEqual(
    captureMaxGlowRadius(0.1, 'light'),
    captureMaxGlowRadius(2.4, 'light'),
    'Light Bat moon soft glow radius must evolve gradually over time'
  );

  // Also ensure full-scene 16:9 and 9:16 Bat backdrops render cleanly in dark and light themes
  const content = {
    quoteText: 'سكون الليل يمنحك *وضوح* الرؤية',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: 'تأمل',
    pointsItems: DEFAULT_POINTS_ITEMS,
    pointsTiming: DEFAULT_POINTS_TIMING,
  };
  const timeline = { enterDuration: 1.2, holdDuration: 3.0, exitDuration: 0.6, autoHold: false };
  for (const format of ['16:9', '9:16'] as const) {
    const sz = format === '16:9'
      ? { width: 1920, height: 1080, baseWidth: 1920, baseHeight: 1080, scale: 1 }
      : { width: 1080, height: 1920, baseWidth: 1080, baseHeight: 1920, scale: 1 };
    for (const theme of ['dark', 'light'] as const) {
      const ctx = createMockCanvasContextForChat();
      renderQuoteFrame(
        ctx,
        1.4,
        content,
        timeline,
        {
          mode: 'phrase',
          styleId: 'phrase_flyer',
          phraseStyleId: 'phrase_flyer',
          flyerCreature: 'bat',
          flyerTheme: theme,
          flyerFlightSpeed: 0.55,
          format,
          position: 'center',
          backgroundMode: 'style',
          greenScreen: false,
          accentColor: FLYER_DEFAULT_TINTS.bat,
          keywordColor: '#FDE047',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1.0,
          minimalShape: 'arch',
          seed: 303,
        },
        sz
      );
    }
  }
});

test('Living Creature cricket audio: 3 quiet night presets, strict Flyer scope guard, live audition, and volume control', () => {
  assert.equal(FLYER_CRICKET_PRESETS.length, 3);
  assert.deepEqual(
    FLYER_CRICKET_PRESETS.map((p) => p.id),
    ['distant_soft', 'damp_forest', 'midnight_calm']
  );
  assert.equal(DEFAULT_FLYER_CRICKET_PRESET, 'distant_soft');
  assert.equal(DEFAULT_FLYER_CRICKET_VOLUME, 0.35);

  assert.equal(resolveFlyerCricketPreset(undefined), 'distant_soft');
  assert.equal(resolveFlyerCricketPreset('damp_forest'), 'damp_forest');
  assert.equal(resolveFlyerCricketPreset('unknown' as unknown as FlyerCricketPresetId), 'distant_soft');
  assert.equal(resolveFlyerCricketVolume(undefined), 0.35);
  assert.equal(resolveFlyerCricketVolume(0), 0.05);
  assert.equal(resolveFlyerCricketVolume(2), 1.0);

  // Strict Flyer scope guard: active only on phrase_flyer or pts_flyer
  assert.equal(
    hasFlyerCricketAudio({
      mode: 'phrase',
      styleId: 'phrase_flyer',
      phraseStyleId: 'phrase_flyer',
      flyerCricketEnabled: true,
      flyerCricketVolume: 0.35,
    }),
    true
  );
  assert.equal(
    hasFlyerCricketAudio({
      mode: 'points',
      styleId: 'pts_flyer',
      pointsStyleId: 'pts_flyer',
      flyerCricketEnabled: true,
      flyerCricketVolume: 0.4,
    }),
    true
  );
  assert.equal(
    hasFlyerCricketAudio({
      mode: 'points',
      styleId: 'pts_timeline',
      pointsStyleId: 'pts_timeline',
      flyerCricketEnabled: true,
    }),
    false
  );
  assert.equal(
    hasFlyerCricketAudio({
      mode: 'phrase',
      styleId: 'calligraphy-ink',
      phraseStyleId: 'calligraphy-ink',
      flyerCricketEnabled: true,
    }),
    false
  );

  // Build mock Web Audio context to verify deterministic synthesis across all 3 presets
  const createAudioParam = (init = 0) => ({
    value: init,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    setTargetAtTime: () => {},
  });

  const makeMockAudioCtx = () => {
    let createdOsc = 0;
    let startedNodes = 0;
    let stoppedNodes = 0;
    const mockCtx = {
      currentTime: 0,
      sampleRate: 48000,
      destination: {},
      createBuffer: (ch: number, len: number) => ({
        numberOfChannels: ch,
        length: len,
        getChannelData: () => new Float32Array(len),
      }),
      createGain: () => ({
        gain: createAudioParam(1),
        connect: () => {},
        disconnect: () => {},
      }),
      createBiquadFilter: () => ({
        type: 'lowpass',
        frequency: createAudioParam(1000),
        Q: createAudioParam(1),
        connect: () => {},
        disconnect: () => {},
      }),
      createConvolver: () => ({
        buffer: null,
        connect: () => {},
        disconnect: () => {},
      }),
      createStereoPanner: () => ({
        pan: createAudioParam(0),
        connect: () => {},
        disconnect: () => {},
      }),
      createBufferSource: () => ({
        buffer: null,
        loop: false,
        connect: () => {},
        disconnect: () => {},
        start: () => {
          startedNodes++;
        },
        stop: () => {
          stoppedNodes++;
        },
      }),
      createOscillator: () => {
        createdOsc++;
        return {
          type: 'sine',
          frequency: createAudioParam(440),
          connect: () => {},
          disconnect: () => {},
          start: () => {
            startedNodes++;
          },
          stop: () => {
            stoppedNodes++;
          },
        };
      },
      getStats: () => ({ createdOsc, startedNodes, stoppedNodes }),
    };
    return mockCtx;
  };

  // Disabled returns 0 scheduled chirps
  const disCtx = makeMockAudioCtx();
  const disabledHandle = buildFlyerCricketGraph(
    disCtx as unknown as BaseAudioContext,
    { enabled: false, preset: 'distant_soft', volume: 0.35 },
    6.0,
    1042,
    0
  );
  assert.equal(disabledHandle.scheduledChirpCount, 0);

  // Each of the 3 presets schedules chirps, supports live volume updates, and cleans up on stop()
  for (const preset of FLYER_CRICKET_PRESETS) {
    const mockCtx = makeMockAudioCtx();
    const handle = buildFlyerCricketGraph(
      mockCtx as unknown as BaseAudioContext,
      { enabled: true, preset: preset.id, volume: 0.35 },
      6.5,
      1042,
      0
    );
    assert.ok(
      handle.scheduledChirpCount >= 2,
      `Preset ${preset.id} must schedule at least 2 calm chirps over 6.5s`
    );
    assert.ok(mockCtx.getStats().createdOsc >= 4);
    handle.setVolume(0.5);
    handle.stop();
    assert.ok(mockCtx.getStats().stoppedNodes >= 3);

    // Audition sample mode triggers cleanly
    const audCtx = makeMockAudioCtx();
    const audHandle = buildFlyerCricketGraph(
      audCtx as unknown as BaseAudioContext,
      { enabled: true, preset: preset.id, volume: 0.4 },
      2.0,
      1042,
      0,
      { auditionOnly: true }
    );
    assert.ok(audHandle.scheduledChirpCount >= 1);
    audHandle.stop();
  }
});

test('Points mode supports up to 12 items: quick paste, schedule hold extension, single-column auto-fit, and all 8 styles in 16:9 and 9:16', () => {
  assert.equal(MAX_POINTS_ITEMS, 12);

  // 1) Quick-paste parses 14 lines and caps cleanly at 12 while preserving *keywords* and stripping bullets
  const fourteenLines = Array.from({ length: 14 }, (_, i) => `${i + 1}. خطوة رقم ${i + 1} نحو *النجاح*`).join('\n');
  const parsed12 = parseQuickPastePointsItems(fourteenLines);
  assert.equal(parsed12.length, 12);
  assert.equal(parsed12[0].text, 'خطوة رقم 1 نحو *النجاح*');
  assert.equal(parsed12[11].text, 'خطوة رقم 12 نحو *النجاح*');

  // 2) Stats threshold scales comfortably above 80 words for 9..12 items while staying at 80 for <=8
  const short12: PointsItem[] = Array.from({ length: 12 }, (_, i) => ({
    id: `p12-${i + 1}`,
    text: `نقطة عملية واضحة رقم ${i + 1} لتطوير *المهارة*`,
  }));
  const stats12 = countPointsStats('١٢ خطوة للنجاح', short12);
  assert.equal(stats12.totalWordLimit, 128);
  assert.equal(stats12.exceedsTotalLimit, false);
  const stats8 = countPointsStats('٨ خطوات', short12.slice(0, 8));
  assert.equal(stats8.totalWordLimit, 80);

  // 3) Schedule computes all 12 items, Arabic-Indic 10..12, countdown 12..1, and extends short endHold for reading comfort
  const sched12Clean = computePointsSchedule(
    '١٢ خطوة أساسية',
    short12,
    { revealInterval: 1.0, autoInterval: false, endHold: 1.0 },
    'pts_clean'
  );
  assert.equal(sched12Clean.items.length, 12);
  assert.equal(sched12Clean.itemTimes.length, 12);
  assert.equal(formatPointMarker(9, 'arabic-indic', 12, false), '١٠');
  assert.equal(formatPointMarker(10, 'arabic-indic', 12, false), '١١');
  assert.equal(formatPointMarker(11, 'arabic-indic', 12, false), '١٢');
  assert.equal(sched12Clean.holdExtended, true);
  assert.ok(sched12Clean.effectiveEndHold >= 1.9, '12-point clean list with 1.0s requested hold must comfortably extend visibility');

  const sched12Ranking = computePointsSchedule('أقوى ١٢ مهارة', short12, DEFAULT_POINTS_TIMING, 'pts_ranking');
  assert.equal(sched12Ranking.items[0].displayNumber, 12);
  assert.equal(sched12Ranking.items[11].displayNumber, 1);

  // 4) Auto-fit enforces single column (gridCols === 1) for 12 items even in 16:9 fullscreen and prevents bottom overflow
  const ctx = createMockCanvasContextForChat();
  const baseContent = {
    quoteText: '',
    authorName: '',
    subtitle: '',
    photoSource: null,
    photoId: 'default',
    crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    quotationMarks: 'none' as const,
    pointsTitle: '١٢ مبدأ عملي للتركيز *المستمر*',
    pointsItems: short12,
    pointsTiming: DEFAULT_POINTS_TIMING,
  };

  for (const format of ['16:9', '9:16'] as const) {
    const sz = getRenderSize(format, '1080p');
    for (const pos of ['center', 'fullscreen', 'left', 'right'] as const) {
      const { layout } = buildAutoFitPointsLayout({
        ctx,
        content: baseContent,
        custom: {
          mode: 'points',
          styleId: 'pts_cards',
          pointsStyleId: 'pts_cards',
          format,
          position: pos,
          backgroundMode: 'style',
          greenScreen: false,
          accentColor: '#4C8DFF',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1,
          seed: 99,
          minimalShape: 'arch',
        },
        size: sz,
        styleId: 'pts_cards',
        allowedArabicFonts: PTS_CLEAN_CONFIG.allowedFonts,
        defaultArabicFont: PTS_CLEAN_CONFIG.defaultQuoteFont,
        defaultEnglishFont: PTS_CLEAN_CONFIG.defaultEnglishQuoteFont,
        fontWeight: 700,
        minFontSize: 20,
        maxFontSize: 40,
        lineHeightRatio: 1.56,
        supportedMarkerTypes: PTS_CLEAN_CONFIG.supportedMarkerTypes,
        defaultMarkerType: PTS_CLEAN_CONFIG.defaultMarkerType,
        allowTwoByTwoGrid: true,
      });

      assert.equal(layout.gridCols, 1, `12 items must stay single-column for ${format} ${pos}`);
      assert.equal(layout.items.length, 12);
      assert.ok(layout.fontSize >= 12);
      assert.ok(
        layout.contentBottomY <= layout.boxY + layout.boxH + 4,
        `12 items must fit inside container bounds for ${format} ${pos} (bottom=${layout.contentBottomY}, boxBottom=${layout.boxY + layout.boxH})`
      );
    }
  }

  // 5) Render all 8 Points styles cleanly with 12 points across 16:9 and 9:16 (and verify timeline shapes + flyer smoothness)
  const timeline = { enterDuration: 1.2, holdDuration: 4.0, exitDuration: 0.6, autoHold: false };
  for (const styleMeta of POINTS_STYLES_LIST) {
    for (const format of ['16:9', '9:16'] as const) {
      const sz = getRenderSize(format, '1080p');
      const ptsId = styleMeta.id as PointsStyleId;
      const custom: StyleCustomization = {
        mode: 'points',
        styleId: ptsId,
        pointsStyleId: ptsId,
        format,
        position: 'center',
        backgroundMode: 'style',
        greenScreen: false,
        accentColor: styleMeta.defaultAccent,
        keywordColor: styleMeta.defaultKeywordColor,
        quoteFontOverride: '',
        authorFontOverride: '',
        fontSizeMultiplier: 1.0,
        minimalShape: 'arch',
        seed: 2026,
        flyerCreature: 'firefly',
        flyerFlightSpeed: 0.55,
        timelineShape: ptsId === 'pts_timeline' ? 'circle' : undefined,
      };
      const ev = getSceneEventTimes(ctx, baseContent, timeline, custom, sz);
      const itemTimes = ev.itemTimes || [];
      assert.equal(itemTimes.length, 12, `${ptsId} (${format}) must emit 12 item timestamps`);
      renderQuoteFrame(ctx, itemTimes[11] + 0.5, baseContent, timeline, custom, sz);
    }
  }

  // Extra check: pts_timeline horizontal & vertical with 12 points + pts_flyer C1 trajectory continuity with 12 points
  const szWide = getRenderSize('16:9', '1080p');
  for (const shape of ['straight', 'wave', 'circle'] as const) {
    for (const orient of ['horizontal', 'vertical'] as const) {
      renderQuoteFrame(
        ctx,
        14.5,
        baseContent,
        timeline,
        {
          mode: 'points',
          styleId: 'pts_timeline',
          pointsStyleId: 'pts_timeline',
          timelineShape: shape,
          timelineOrientation: orient,
          format: '16:9',
          position: 'center',
          backgroundMode: 'style',
          greenScreen: false,
          accentColor: '#38BDF8',
          quoteFontOverride: '',
          authorFontOverride: '',
          fontSizeMultiplier: 1,
          seed: 77,
          minimalShape: 'arch',
        },
        szWide
      );
    }
  }

  const flyer12Plan = buildPointsFlyerPlan(
    ctx,
    baseContent,
    {
      mode: 'points',
      styleId: 'pts_flyer',
      pointsStyleId: 'pts_flyer',
      flyerCreature: 'bat',
      flyerFlightSpeed: 0.55,
      format: '16:9',
      position: 'center',
      backgroundMode: 'style',
      greenScreen: false,
      accentColor: '#B79CFF',
      quoteFontOverride: '',
      authorFontOverride: '',
      fontSizeMultiplier: 1,
      seed: 1200,
      minimalShape: 'arch',
    },
    szWide
  );
  assert.equal(flyer12Plan.layout.items.length, 12);
  for (let i = 1; i < flyer12Plan.waypoints.length - 1; i++) {
    const tk = flyer12Plan.waypoints[i].t;
    const pre = sampleFlightWaypoints(flyer12Plan.waypoints, tk - 0.0001, flyer12Plan.schedule.exitStart, flyer12Plan.schedule.totalDuration);
    const post = sampleFlightWaypoints(flyer12Plan.waypoints, tk + 0.0001, flyer12Plan.schedule.exitStart, flyer12Plan.schedule.totalDuration);
    assert.ok(Math.hypot(post.vx - pre.vx, post.vy - pre.vy) < 5);
  }
});
