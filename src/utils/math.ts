import {
  AspectRatioFormat,
  BackgroundMode,
  ChatMessage,
  ChatStyleId,
  ChatTimingConfig,
  ExportFps,
  ExportQuality,
  ExportResolution,
  ImageStyleId,
  PhrasePosition,
  PointsItem,
  PointsMarkerType,
  PointsStyleId,
  PointsTimingConfig,
  RenderSize,
  ResolvedTextDirection,
  SpotlightRegion,
  StudioMode,
  StyleCustomization,
  TextDirection,
  TimelineConfig,
  VideoEndBehavior,
  VideoLayoutBox,
  VideoStyleId,
} from '../types';

/**
 * Clamps a numeric value between min and max.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Linearly interpolates between a and b by t.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Normalized progress of t within [start, end], clamped to [0, 1].
 */
export function progress(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0;
  return clamp((t - start) / (end - start), 0, 1);
}

/**
 * Smooth ease-out cubic curve (fast start, gentle settle).
 */
export function easeOutCubic(x: number): number {
  const c = clamp(x, 0, 1);
  return 1 - Math.pow(1 - c, 3);
}

/**
 * Smooth ease-in cubic curve (gentle start, fast exit).
 */
export function easeInCubic(x: number): number {
  const c = clamp(x, 0, 1);
  return c * c * c;
}

/**
 * Smooth ease-in-out cubic curve.
 */
export function easeInOutCubic(x: number): number {
  const c = clamp(x, 0, 1);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Quartic ease-out for crisp minimal animations.
 */
export function easeOutQuart(x: number): number {
  const c = clamp(x, 0, 1);
  return 1 - Math.pow(1 - c, 4);
}

/**
 * Ease-out back curve with slight overshoot for punchy scale reveals.
 */
export function easeOutBack(x: number, overshoot: number = 1.70158): number {
  const c = clamp(x, 0, 1);
  const c1 = overshoot;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2);
}

/**
 * Strips unescaped keyword marker asterisks so word counting reflects actual visible words.
 */
export function stripKeywordMarkers(text: string): string {
  if (!text) return '';
  return text.replace(/\\\*/g, '★').replace(/\*/g, '').replace(/★/g, '*');
}

/**
 * Counts words in an Arabic/multilingual string accurately (ignoring keyword asterisks).
 */
export function countWords(text: string): number {
  const cleaned = stripKeywordMarkers(text).trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

const ARABIC_COMBINING_MARK_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D4-\u08E1\u08E3-\u08FF]/;

/**
 * Counts logical keystrokes (base characters + spaces, grouping combining Arabic tashkeel with their base letter).
 */
export function countLogicalKeystrokes(text: string): number {
  const cleaned = stripKeywordMarkers(text).trim();
  if (!cleaned) return 0;
  let count = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '\r' || ch === '\n') continue;
    if (!ARABIC_COMBINING_MARK_RE.test(ch)) {
      count++;
    }
  }
  return Math.max(1, count);
}

/**
 * Computes auto hold time for Quote mode: ~0.4s per word, minimum 4 seconds, clamped to 15s max.
 */
export function computeAutoHoldDuration(quoteText: string): number {
  const words = countWords(quoteText);
  const calculated = Math.round(words * 0.4 * 10) / 10;
  return clamp(Math.max(4, calculated), 2, 15);
}

/**
 * Computes auto hold time for Key Phrase mode: ~0.35s per word, minimum 2 seconds, max 8 seconds.
 */
export function computePhraseAutoHoldDuration(phraseText: string): number {
  const words = countWords(phraseText);
  const calculated = Math.round(words * 0.35 * 10) / 10;
  return clamp(calculated, 2.0, 8.0);
}

export const DEFAULT_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    text: 'كيف أبدأ تعلم البرمجة بفعالية؟',
  },
  {
    id: 'msg-2',
    role: 'ai',
    text: 'ابدأ ببناء مشاريع صغيرة يومياً، فالسر الحقيقي يكمن في *الاستمرارية* والتطبيق العملي.',
  },
];

export const DEFAULT_CHAT_TIMING: ChatTimingConfig = {
  userTypingSpeed: 18, // 8-30 chars/s, default 18
  aiReplySpeed: 9, // 4-20 words/s, default 9
  thinkingDelay: 0.9, // 0-10 s, default 0.9
  messageGap: 0.4, // 0.2-3 s, default 0.4
  endHold: 2.0, // 1-6 s, default 2
};

export const DEFAULT_POINTS_TITLE = '٣ أسرار للنجاح';

export const DEFAULT_POINTS_ITEMS: PointsItem[] = [
  {
    id: 'pt-1',
    text: 'تحديد هدف واضح ومكتوب بدقة',
  },
  {
    id: 'pt-2',
    text: 'التعلم المستمر وتطوير المهارات يومياً',
  },
  {
    id: 'pt-3',
    text: 'الحفاظ على *الاستمرارية* رغم التحديات',
  },
];

export const MAX_POINTS_ITEMS = 12;

export const DEFAULT_POINTS_TIMING: PointsTimingConfig = {
  revealInterval: 1.2, // 0.4-3.0s, default 1.2s (2.5s for pts_ranking)
  autoInterval: false, // ~0.2s per word, min 0.8s
  endHold: 2.0, // 1.0-6.0s, default 2.0s
};

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Converts Western digits in a number or string into Arabic-Indic digits (٠-٩).
 */
export function toArabicIndicDigits(val: number | string): string {
  return String(val).replace(/\d/g, (d) => ARABIC_INDIC_DIGITS[Number(d)] || d);
}

/**
 * Formats a point marker according to markerType ('western' | 'arabic-indic' | 'bullets' | 'checks' | 'none').
 */
export function formatPointMarker(
  index: number,
  markerType: PointsMarkerType = 'arabic-indic',
  totalCount: number = index + 1,
  isCountdown: boolean = false
): string {
  const num = isCountdown ? Math.max(1, totalCount - index) : index + 1;
  switch (markerType) {
    case 'western':
      return String(num);
    case 'arabic-indic':
      return toArabicIndicDigits(num);
    case 'bullets':
      return '•';
    case 'checks':
      return '✓';
    case 'none':
      return '';
    default:
      return toArabicIndicDigits(num);
  }
}

/**
 * Counts word stats across the optional title and points items.
 * Soft warning if any item > 14 words or total exceeds scaled limit (80 words for <= 8 items, +12 words per item above 8).
 */
export function countPointsStats(
  title: string = '',
  items: PointsItem[] = []
): {
  totalWords: number;
  maxItemWords: number;
  longItemIndices: number[];
  hasLongItem: boolean;
  totalWordLimit: number;
  exceedsTotalLimit: boolean;
} {
  let totalWords = countWords(title || '');
  let maxItemWords = 0;
  let activeCount = 0;
  const longItemIndices: number[] = [];

  (items || []).forEach((item, idx) => {
    if (!item || !item.text) return;
    const w = countWords(item.text);
    if (w <= 0) return;
    activeCount++;
    totalWords += w;
    if (w > maxItemWords) maxItemWords = w;
    if (w > 14) {
      longItemIndices.push(idx + 1);
    }
  });

  const totalWordLimit = activeCount > 8 ? 80 + (activeCount - 8) * 12 : 80;

  return {
    totalWords,
    maxItemWords,
    longItemIndices,
    hasLongItem: maxItemWords > 14,
    totalWordLimit,
    exceedsTotalLimit: totalWords > totalWordLimit,
  };
}

/**
 * Parses quick-paste text for Multi Points mode:
 * - One item per line
 * - Strips leading "-", "•", "1.", "١.", "1)", "١)", etc.
 * - Ignores empty items, caps at MAX_POINTS_ITEMS (12) items.
 */
export function parseQuickPastePointsItems(rawPaste: string): PointsItem[] {
  if (!rawPaste || !rawPaste.trim()) return [];
  const lines = rawPaste.split(/\r?\n/);
  const parsed: PointsItem[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Strip leading bullets or numbering ("-", "•", "1.", "١.", "1-", "١)", etc.)
    // Be careful not to strip "*keyword*" at the start of a line unless "*" is followed by whitespace
    const stripped = trimmed
      .replace(/^(?:[-•●▪▸◦]+|\*\s+|(?:\d+|[٠-٩]+)\s*[.)\-:：])\s*/, '')
      .trim();

    if (stripKeywordMarkers(stripped).trim().length > 0 && parsed.length < MAX_POINTS_ITEMS) {
      parsed.push({
        id: `pt-${Date.now()}-${parsed.length + 1}`,
        text: stripped,
      });
    }
  }

  return parsed.slice(0, MAX_POINTS_ITEMS);
}

export interface ScheduledPointItem {
  index: number;
  displayNumber: number; // 1..N normally, or N..1 in pts_ranking
  item: PointsItem;
  startTime: number; // itemTimes[i]
  revealEnd: number; // when this item's entrance/typing/tick finishes
  activeEnd: number; // when the next item starts (or exitStart for the last item)
  intervalDuration: number;
  wordCount: number;
  keystrokeCount: number;
}

export interface PointsSceneSchedule {
  introDuration: number; // fixed 0.6s
  exitDuration: number; // fixed 0.6s
  requestedEndHold: number;
  effectiveEndHold: number;
  holdExtended: boolean;
  extendedReasonAr?: string;
  items: ScheduledPointItem[];
  itemTimes: number[];
  lastItemRevealEnd: number;
  exitStart: number;
  totalDuration: number;
}

/**
 * Computes the deterministic schedule for Multi Points ("نقاط") mode.
 * - Fixed intro = 0.6s, fixed exit = 0.6s.
 * - Reveal interval = 0.4 - 3.0s (default 1.2s, or 2.5s for pts_ranking) or auto (~0.2s/word, min 0.8s).
 * - Guarantees at least 0.8s of full visibility after the last item finishes revealing (otherwise extends endHold).
 */
export function computePointsSchedule(
  title: string = DEFAULT_POINTS_TITLE,
  items: PointsItem[] = DEFAULT_POINTS_ITEMS,
  timing: PointsTimingConfig = DEFAULT_POINTS_TIMING,
  styleId: PointsStyleId = 'pts_clean'
): PointsSceneSchedule {
  void title;
  const introDuration = 0.6;
  const exitDuration = 0.6;
  const defaultInterval = styleId === 'pts_ranking' ? 2.5 : 1.2;
  const baseInterval = clamp(timing?.revealInterval ?? defaultInterval, 0.4, 3.0);
  const autoInterval = Boolean(timing?.autoInterval);
  const requestedEndHold = clamp(timing?.endHold ?? 2.0, 1.0, 6.0);

  const validItems = (items || [])
    .filter((it) => it && typeof it.text === 'string' && stripKeywordMarkers(it.text).trim().length > 0)
    .slice(0, MAX_POINTS_ITEMS);

  const scheduledItems: ScheduledPointItem[] = [];
  const itemTimes: number[] = [];

  let cursor = introDuration;
  const totalCount = validItems.length;

  for (let i = 0; i < totalCount; i++) {
    const it = validItems[i];
    const words = Math.max(1, countWords(it.text));
    const keystrokes = Math.max(1, countLogicalKeystrokes(it.text));

    const itemInterval = autoInterval
      ? Math.max(styleId === 'pts_ranking' ? 1.2 : 0.8, Number((words * 0.2).toFixed(2)))
      : baseInterval;

    const startTime = Number(cursor.toFixed(3));
    itemTimes.push(startTime);

    const flyerWipeDur =
      styleId === 'pts_flyer'
        ? clamp(timing?.flyerRevealDuration ?? 0.65, 0.2, 2.0)
        : 0.38;

    // Estimate how long this item takes to finish its reveal animation
    let revealSpan = 0.42;
    if (styleId === 'pts_checklist') {
      // Text wipe (0.34s) + checkbox & tick stroke trim (0.24s)
      revealSpan = 0.58;
    } else if (styleId === 'pts_terminal') {
      // Stepped typing reveal at ~28 chars/sec
      revealSpan = clamp(keystrokes / 28, 0.24, 1.85);
    } else if (styleId === 'pts_ranking') {
      // Slam number + text punch + keyword badge pop
      revealSpan = 0.52;
    } else if (styleId === 'pts_flyer') {
      revealSpan = Number(flyerWipeDur.toFixed(3));
    }

    const revealEnd = Number((startTime + revealSpan).toFixed(3));
    const minIntervalForReveal =
      styleId === 'pts_terminal'
        ? revealSpan + 0.12
        : styleId === 'pts_flyer'
          ? flyerWipeDur + 0.14
          : itemInterval;
    const nextCursor =
      i < totalCount - 1
        ? Number((startTime + Math.max(itemInterval, minIntervalForReveal)).toFixed(3))
        : startTime;

    scheduledItems.push({
      index: i,
      displayNumber: styleId === 'pts_ranking' ? totalCount - i : i + 1,
      item: it,
      startTime,
      revealEnd,
      activeEnd: nextCursor,
      intervalDuration: itemInterval,
      wordCount: words,
      keystrokeCount: keystrokes,
    });

    if (i < totalCount - 1) {
      cursor = nextCursor;
    }
  }

  const lastItem = scheduledItems[scheduledItems.length - 1];
  const lastItemStart = lastItem ? lastItem.startTime : introDuration;
  const lastItemRevealEnd = lastItem
    ? lastItem.revealEnd + (styleId === 'pts_terminal' ? 0.14 : 0)
    : introDuration + 0.4;

  // At least 0.8s of full visibility must remain after the last item finishes revealing;
  // for longer simultaneous lists (9..12 items), comfortably provide extra reading time.
  const minVisibleAfterReveal =
    totalCount > 8 && styleId !== 'pts_ranking'
      ? Number((0.8 + (totalCount - 8) * 0.2).toFixed(2))
      : 0.8;
  const rawExitStart = lastItemStart + requestedEndHold;
  const minRequiredExitStart = lastItemRevealEnd + minVisibleAfterReveal;

  let effectiveEndHold = requestedEndHold;
  let holdExtended = false;
  let extendedReasonAr: string | undefined;

  if (minRequiredExitStart > rawExitStart + 0.04) {
    effectiveEndHold = Number(
      (Math.ceil((minRequiredExitStart - lastItemStart) * 10) / 10).toFixed(1)
    );
    holdExtended = true;
    extendedReasonAr = `تم تمديد ثبات النهاية تلقائياً إلى ${effectiveEndHold.toFixed(1)} ثانية لضمان بقاء جميع النقاط واضحة لمدة ${minVisibleAfterReveal.toFixed(1)} ثانية على الأقل بعد اكتمال آخر نقطة.`;
  }

  const exitStart = Number((lastItemStart + effectiveEndHold).toFixed(2));
  if (lastItem) {
    lastItem.activeEnd = exitStart;
  }
  const totalDuration = Number((exitStart + exitDuration).toFixed(2));

  return {
    introDuration,
    exitDuration,
    requestedEndHold,
    effectiveEndHold,
    holdExtended,
    extendedReasonAr,
    items: scheduledItems,
    itemTimes,
    lastItemRevealEnd: Number(lastItemRevealEnd.toFixed(3)),
    exitStart,
    totalDuration,
  };
}

/**
 * Counts total visible words across all non-empty chat messages.
 */
export function countChatTotalWords(messages: ChatMessage[] = []): number {
  let total = 0;
  for (const m of messages) {
    if (!m || !m.text) continue;
    total += countWords(m.text);
  }
  return total;
}

/**
 * Parses quick-paste text where lines starting with "س:" become user messages
 * and lines starting with "ج:" become AI replies. Empty messages are ignored. Max 8 messages.
 */
export function parseQuickPasteChatMessages(rawPaste: string): ChatMessage[] {
  if (!rawPaste || !rawPaste.trim()) return [];
  const rawLines = rawPaste.split(/\r?\n/);
  const parsed: ChatMessage[] = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const userMatch = trimmed.match(/^(?:س|سؤال|Q)\s*[:：-]\s*(.*)$/i);
    const aiMatch = trimmed.match(/^(?:ج|جواب|رد|A)\s*[:：-]\s*(.*)$/i);

    if (userMatch) {
      const body = userMatch[1].trim();
      if (stripKeywordMarkers(body).trim().length > 0 && parsed.length < 8) {
        parsed.push({
          id: `msg-${Date.now()}-${parsed.length + 1}`,
          role: 'user',
          text: body,
        });
      }
    } else if (aiMatch) {
      const body = aiMatch[1].trim();
      if (stripKeywordMarkers(body).trim().length > 0 && parsed.length < 8) {
        parsed.push({
          id: `msg-${Date.now()}-${parsed.length + 1}`,
          role: 'ai',
          text: body,
        });
      }
    } else if (parsed.length > 0) {
      // Continuation line of previous message
      parsed[parsed.length - 1].text += `\n${trimmed}`;
    } else if (stripKeywordMarkers(trimmed).trim().length > 0 && parsed.length < 8) {
      parsed.push({
        id: `msg-${Date.now()}-1`,
        role: 'user',
        text: trimmed,
      });
    }
  }

  return parsed.filter((m) => stripKeywordMarkers(m.text).trim().length > 0).slice(0, 8);
}

export interface ScheduledChatMessage {
  index: number;
  message: ChatMessage;
  role: 'user' | 'ai';
  startTime: number;
  typingStart: number; // for user: typing start
  typingEnd: number; // for user: typing end
  sendTime: number; // for user: moment message is sent / Enter is pressed
  thinkingStart: number; // for ai: start of thinking indicator
  thinkingEnd: number; // for ai: end of thinking indicator
  receiveTime: number; // for ai: moment reply starts streaming
  streamEnd: number; // for ai: moment reply finishes streaming
  endTime: number;
  wordCount: number;
  keystrokeCount: number;
}

export interface ChatConversationSchedule {
  introDuration: number; // fixed 0.6s
  exitDuration: number; // fixed 0.6s
  endHold: number;
  items: ScheduledChatMessage[];
  conversationEnd: number;
  exitStart: number;
  totalDuration: number;
  sendTimes: number[];
  receiveTimes: number[];
}

/**
 * Builds the deterministic schedule for AI Chat mode from messages and ChatTimingConfig.
 * Empty messages are ignored. Max 8 messages.
 * Fixed intro = 0.6s, fixed exit = 0.6s.
 */
export function computeChatSchedule(
  messages: ChatMessage[] = DEFAULT_CHAT_MESSAGES,
  timing: ChatTimingConfig = DEFAULT_CHAT_TIMING,
  styleId: ChatStyleId = 'chat_modern'
): ChatConversationSchedule {
  const userTypingSpeed = clamp(timing?.userTypingSpeed ?? 18, 8, 30);
  const aiReplySpeed = clamp(timing?.aiReplySpeed ?? 9, 4, 20);
  const thinkingDelay = clamp(timing?.thinkingDelay ?? 0.9, 0, 10);
  const messageGap = clamp(timing?.messageGap ?? 0.4, 0.2, 3);
  const endHold = clamp(timing?.endHold ?? 2.0, 1, 6);

  const introDuration = 0.6;
  const exitDuration = 0.6;

  const validMessages = (messages || [])
    .filter((m) => m && typeof m.text === 'string' && stripKeywordMarkers(m.text).trim().length > 0)
    .slice(0, 8);

  const items: ScheduledChatMessage[] = [];
  const sendTimes: number[] = [];
  const receiveTimes: number[] = [];

  let cursor = introDuration;

  for (let i = 0; i < validMessages.length; i++) {
    const msg = validMessages[i];
    const words = Math.max(1, countWords(msg.text));
    const keystrokes = Math.max(1, countLogicalKeystrokes(msg.text));

    if (msg.role === 'user') {
      const startTime = Number(cursor.toFixed(3));
      const typingStart = startTime;
      const typingDur = Math.max(0.18, keystrokes / userTypingSpeed);
      const typingEnd = Number((typingStart + typingDur).toFixed(3));
      const sendTime = Number((typingEnd + 0.04).toFixed(3));
      const popSettle = styleId === 'chat_modern' ? 0.24 : 0.06;
      const endTime = Number((sendTime + popSettle).toFixed(3));

      sendTimes.push(sendTime);

      items.push({
        index: i,
        message: msg,
        role: 'user',
        startTime,
        typingStart,
        typingEnd,
        sendTime,
        thinkingStart: startTime,
        thinkingEnd: startTime,
        receiveTime: sendTime,
        streamEnd: endTime,
        endTime,
        wordCount: words,
        keystrokeCount: keystrokes,
      });

      cursor = endTime + messageGap;
    } else {
      const startTime = Number(cursor.toFixed(3));
      const thinkingStart = startTime;
      const thinkingEnd = Number((thinkingStart + thinkingDelay).toFixed(3));
      const receiveTime = thinkingEnd;
      // Each word fades in over ~0.12s at aiReplySpeed words/s
      const streamSpan = Math.max(0.22, (words - 1) / aiReplySpeed + 0.14);
      const streamEnd = Number((receiveTime + streamSpan).toFixed(3));
      const endTime = streamEnd;

      receiveTimes.push(receiveTime);

      items.push({
        index: i,
        message: msg,
        role: 'ai',
        startTime,
        typingStart: receiveTime,
        typingEnd: streamEnd,
        sendTime: receiveTime,
        thinkingStart,
        thinkingEnd,
        receiveTime,
        streamEnd,
        endTime,
        wordCount: words,
        keystrokeCount: keystrokes,
      });

      cursor = endTime + messageGap;
    }
  }

  const conversationEnd =
    items.length > 0 ? items[items.length - 1].endTime : introDuration + 0.5;
  const exitStart = Number((conversationEnd + endHold).toFixed(2));
  const totalDuration = Number((exitStart + exitDuration).toFixed(2));

  return {
    introDuration,
    exitDuration,
    endHold,
    items,
    conversationEnd,
    exitStart,
    totalDuration,
    sendTimes,
    receiveTimes,
  };
}

/**
 * Computes effective timeline durations and total duration.
 * In Phrase mode, ensures per-word or keystroke reveals finish by enter + 0.35 * hold and at least 0.8s
 * of full visibility remains after the last element (including annotations/underlines); otherwise extends hold.
 * In Chat mode, computes the deterministic schedule from chatMessages and chatTiming.
 * In Points mode, computes the deterministic schedule from pointsItems and pointsTiming.
 */
export function getEffectiveTimeline(
  timeline: TimelineConfig,
  quoteText: string,
  mode: StudioMode = 'quote',
  annotationExtraSec: number = 0,
  typingConfig?: {
    isTypingStyle?: boolean;
    typingSpeed?: number; // 8-30 chars/sec (default 18)
    typingStartSec?: number;
    lineBreakGapSec?: number;
    estimatedLineBreaks?: number;
    chatMessages?: ChatMessage[];
    chatTiming?: ChatTimingConfig;
    chatStyleId?: ChatStyleId;
    pointsTitle?: string;
    pointsItems?: PointsItem[];
    pointsTiming?: PointsTimingConfig;
    pointsStyleId?: PointsStyleId;
    imageStyleId?: ImageStyleId;
    videoEnterDuration?: number;
    videoExitDuration?: number;
    videoDurationSec?: number;
    videoTrimIn?: number;
    videoTrimOut?: number;
    videoSpeed?: number;
    videoCustomDurationEnabled?: boolean;
    videoCustomDuration?: number;
  }
): {
  enter: number;
  hold: number;
  exit: number;
  exitStart: number;
  total: number;
  holdExtended?: boolean;
  extendedReasonAr?: string;
} {
  if (mode === 'points') {
    const sched = computePointsSchedule(
      typingConfig?.pointsTitle ?? DEFAULT_POINTS_TITLE,
      typingConfig?.pointsItems ?? DEFAULT_POINTS_ITEMS,
      typingConfig?.pointsTiming ?? DEFAULT_POINTS_TIMING,
      typingConfig?.pointsStyleId ?? 'pts_clean'
    );
    const enter = sched.introDuration;
    const exit = sched.exitDuration;
    const exitStart = sched.exitStart;
    const total = sched.totalDuration;
    const hold = Number(Math.max(1.0, exitStart - enter).toFixed(2));
    return {
      enter,
      hold,
      exit,
      exitStart,
      total,
      holdExtended: sched.holdExtended,
      extendedReasonAr: sched.extendedReasonAr,
    };
  }
  if (mode === 'chat') {
    const sched = computeChatSchedule(
      typingConfig?.chatMessages ?? DEFAULT_CHAT_MESSAGES,
      typingConfig?.chatTiming ?? DEFAULT_CHAT_TIMING,
      typingConfig?.chatStyleId ?? 'chat_modern'
    );
    const enter = sched.introDuration;
    const exit = sched.exitDuration;
    const exitStart = sched.exitStart;
    const total = sched.totalDuration;
    const hold = Number(Math.max(1.0, exitStart - enter).toFixed(2));
    return {
      enter,
      hold,
      exit,
      exitStart,
      total,
    };
  }
  if (mode === 'phrase') {
    const enter = clamp(timeline.enterDuration, 0.4, 8.0);
    let hold = timeline.autoHold
      ? computePhraseAutoHoldDuration(quoteText)
      : clamp(timeline.holdDuration, 1.5, 15.0);
    const exit = clamp(timeline.exitDuration, 0.3, 2.0);

    const words = Math.max(1, countWords(quoteText));
    // Minimum comfortable per-word reveal span (~0.12s per word beyond enter)
    let revealFinishTime = enter + Math.max(0, Math.max(enter * 0.85, words * 0.12) - enter);

    if (typingConfig?.isTypingStyle) {
      const speed = clamp(typingConfig.typingSpeed ?? 18, 8, 30);
      const keystrokes = countLogicalKeystrokes(quoteText);
      const startSec = typingConfig.typingStartSec ?? 0.34;
      const lineBreaks = typingConfig.estimatedLineBreaks ?? Math.max(0, Math.ceil(words / 4) - 1);
      const lineGap = typingConfig.lineBreakGapSec ?? 0.12;
      const typingEndTime = startSec + keystrokes / speed + lineBreaks * lineGap;
      revealFinishTime = Math.max(revealFinishTime, typingEndTime);
    }

    const neededOverflowIntoHold = Math.max(0, revealFinishTime - enter);

    // Rule 1: Per-word or typing reveals must finish by enter + 0.35 * hold
    const minHoldForReveals = neededOverflowIntoHold > 0 ? neededOverflowIntoHold / 0.35 : 0;

    // Rule 2: At least 0.8s of full visibility must remain after the last element (including annotations/underlines)
    const lastElementTime = revealFinishTime + Math.max(0.25, annotationExtraSec);
    const minHoldForVisibility = Math.max(0, lastElementTime + 0.8 - enter);

    const requiredHold = Math.max(minHoldForReveals, minHoldForVisibility);
    let holdExtended = false;
    let extendedReasonAr: string | undefined;

    if (requiredHold > hold + 0.05) {
      hold = Number((Math.ceil(requiredHold * 10) / 10).toFixed(1));
      holdExtended = true;
      extendedReasonAr = typingConfig?.isTypingStyle
        ? `تم تمديد وقت الثبات تلقائياً إلى ${hold.toFixed(1)} ثانية لإتمام الكتابة الآلية وبقاء الجملة واضحة لمدة 0.8 ثانية على الأقل قبل الخروج.`
        : `تم تمديد وقت الثبات تلقائياً إلى ${hold.toFixed(1)} ثانية لضمان بقاء الجملة والتأثيرات واضحة لمدة 0.8 ثانية على الأقل قبل الخروج.`;
    }

    const total = Number((enter + hold + exit).toFixed(2));
    const exitStart = Number((enter + hold).toFixed(2));

    return {
      enter,
      hold,
      exit,
      exitStart,
      total,
      holdExtended,
      extendedReasonAr,
    };
  }

  if (mode === 'image') {
    const enter = clamp(timeline.enterDuration, 0.3, 8.0);
    let hold = timeline.autoHold
      ? computePhraseAutoHoldDuration(quoteText || DEFAULT_IMAGE_CAPTION)
      : clamp(timeline.holdDuration, 1.0, 15.0);
    const exit = clamp(timeline.exitDuration, 0.3, 2.0);

    // Ensure spotlight camera zoom (~0.8s) + annotation draw (~0.5s) + 0.8s visibility fits comfortably
    const activeImgStyle = typingConfig?.imageStyleId;
    let holdExtended = false;
    let extendedReasonAr: string | undefined;
    if (activeImgStyle === 'img_spotlight') {
      const minSpotlightHold = 2.2;
      if (hold < minSpotlightHold - 0.04) {
        hold = minSpotlightHold;
        holdExtended = true;
        extendedReasonAr = `تم تمديد وقت الثبات تلقائياً إلى ${hold.toFixed(1)} ثانية لإتمام حركة التقريب ورسم التحديد وبقاء الصورة واضحة لمدة 0.8 ثانية على الأقل.`;
      }
    }

    const total = Number((enter + hold + exit).toFixed(2));
    const exitStart = Number((enter + hold).toFixed(2));
    return {
      enter,
      hold,
      exit,
      exitStart,
      total,
      holdExtended,
      extendedReasonAr,
    };
  }

  if (mode === 'video') {
    const enter = clamp(typingConfig?.videoEnterDuration ?? VIDEO_ENTER_DURATION, 0.3, 4.0);
    const exit = clamp(typingConfig?.videoExitDuration ?? VIDEO_EXIT_DURATION, 0.3, 2.0);
    const vt = computeVideoTimeline({
      videoDuration: typingConfig?.videoDurationSec ?? DEFAULT_VIDEO_DURATION,
      trimIn: typingConfig?.videoTrimIn ?? 0,
      trimOut: typingConfig?.videoTrimOut ?? typingConfig?.videoDurationSec ?? DEFAULT_VIDEO_DURATION,
      speed: typingConfig?.videoSpeed ?? 1.0,
      customDurationEnabled: typingConfig?.videoCustomDurationEnabled,
      customDuration: typingConfig?.videoCustomDuration,
    });
    const hold = vt.hold;
    const total = Number((enter + hold + exit).toFixed(2));
    const exitStart = Number((enter + hold).toFixed(2));
    return {
      enter,
      hold,
      exit,
      exitStart,
      total,
    };
  }

  const enter = clamp(timeline.enterDuration, 0.5, 8.0);
  const hold = timeline.autoHold
    ? computeAutoHoldDuration(quoteText)
    : clamp(timeline.holdDuration, 2.0, 15.0);
  const exit = clamp(timeline.exitDuration, 0.5, 2.0);
  const total = Number((enter + hold + exit).toFixed(2));
  const exitStart = Number((enter + hold).toFixed(2));

  return {
    enter,
    hold,
    exit,
    exitStart,
    total,
  };
}

export const DEFAULT_IMAGE_CAPTION = 'لحظة *تاريخية* توثّق بداية التحول الرقمي';
export const DEFAULT_IMAGE_SOURCE_LINE = 'المصدر: الأرشيف التقني ٢٠٢٥';
export const DEFAULT_SPOTLIGHT_REGION: SpotlightRegion = {
  x: 0.3,
  y: 0.3,
  w: 0.4,
  h: 0.4,
};
export const DEFAULT_IMAGE_TIMELINE: TimelineConfig = {
  enterDuration: 0.8,
  holdDuration: 3.0,
  exitDuration: 0.6,
  autoHold: false,
};

export const DEFAULT_VIDEO_CAPTION = 'لقطة *حية* توثّق الفكرة بوضوح';
export const DEFAULT_VIDEO_SOURCE_LINE = 'المصدر: مقطع توثيقي';
export const DEFAULT_VIDEO_DURATION = 6.0;
export const VIDEO_ENTER_DURATION = 0.6;
export const VIDEO_EXIT_DURATION = 0.5;
export const DEFAULT_VIDEO_BOX: VideoLayoutBox = {
  x: 18,
  y: 12,
  w: 64,
  h: 76,
};
export const DEFAULT_VIDEO_TIMELINE: TimelineConfig = {
  enterDuration: VIDEO_ENTER_DURATION,
  holdDuration: DEFAULT_VIDEO_DURATION,
  exitDuration: VIDEO_EXIT_DURATION,
  autoHold: false,
};

export interface VideoTimelineComputed {
  enter: number;
  hold: number;
  exit: number;
  clipStart: number;
  clipEnd: number;
  exitStart: number;
  total: number;
  trimmedDuration: number;
  naturalSpan: number;
  trimIn: number;
  trimOut: number;
  speed: number;
}

/**
 * Computes Video mode timing:
 * - Enter: 0.6s
 * - Exit: 0.5s
 * - Middle clip span: (trimOut - trimIn) / speed (automatic) OR customDuration when customDurationEnabled is true.
 */
export function computeVideoTimeline(params: {
  videoDuration?: number;
  trimIn?: number;
  trimOut?: number;
  speed?: number;
  customDurationEnabled?: boolean;
  customDuration?: number;
}): VideoTimelineComputed {
  const duration = Math.max(0.2, Number.isFinite(params.videoDuration) ? params.videoDuration! : DEFAULT_VIDEO_DURATION);
  const rawIn = clamp(params.trimIn ?? 0, 0, Math.max(0, duration - 0.1));
  const rawOut = clamp(params.trimOut ?? duration, rawIn + 0.1, duration);
  const trimmedDuration = Math.max(0.1, Number((rawOut - rawIn).toFixed(3)));
  const speed = clamp(params.speed ?? 1.0, 0.5, 2.0);
  const naturalSpan = Math.max(0.3, Number((trimmedDuration / speed).toFixed(2)));
  const middle =
    params.customDurationEnabled && Number.isFinite(params.customDuration)
      ? clamp(params.customDuration!, 0.5, 120)
      : naturalSpan;

  const enter = VIDEO_ENTER_DURATION;
  const exit = VIDEO_EXIT_DURATION;
  const clipStart = enter;
  const clipEnd = Number((enter + middle).toFixed(2));
  const exitStart = clipEnd;
  const total = Number((enter + middle + exit).toFixed(2));

  return {
    enter,
    hold: middle,
    exit,
    clipStart,
    clipEnd,
    exitStart,
    total,
    trimmedDuration,
    naturalSpan,
    trimIn: rawIn,
    trimOut: rawOut,
    speed,
  };
}

/**
 * Computes deterministic source video timestamp (in seconds) for any scene time `t`:
 * sourceTime = trimIn + elapsed * speed, respecting:
 * - Before clipStart: returns trimIn (first frame).
 * - Freeze endBehavior: clamps to trimOut.
 * - Loop endBehavior: wraps modulo trimmedDuration.
 */
export function computeVideoSourceTime(
  sceneT: number,
  opts: {
    clipStart?: number;
    clipEnd?: number;
    trimIn?: number;
    trimOut?: number;
    speed?: number;
    endBehavior?: VideoEndBehavior;
  }
): number {
  const clipStart = opts.clipStart ?? VIDEO_ENTER_DURATION;
  const trimIn = Math.max(0, opts.trimIn ?? 0);
  const trimOut = Math.max(trimIn + 0.1, opts.trimOut ?? trimIn + DEFAULT_VIDEO_DURATION);
  const trimmedDur = Math.max(0.1, trimOut - trimIn);
  const speed = clamp(opts.speed ?? 1.0, 0.5, 2.0);
  const clipEnd = opts.clipEnd ?? clipStart + trimmedDur / speed;
  const endBehavior: VideoEndBehavior = opts.endBehavior || 'freeze';

  if (sceneT <= clipStart) {
    return trimIn;
  }

  const effectiveElapsed = Math.min(Math.max(0, sceneT - clipStart), Math.max(0, clipEnd - clipStart));
  const rawAdvance = effectiveElapsed * speed;

  if (rawAdvance <= trimmedDur + 1e-6) {
    return clamp(trimIn + rawAdvance, trimIn, trimOut);
  }

  if (endBehavior === 'loop') {
    const wrapped = rawAdvance % trimmedDur;
    return clamp(trimIn + wrapped, trimIn, trimOut);
  }

  return trimOut;
}

/**
 * Returns the typing, chat, points, image, or video timeline configuration for getEffectiveTimeline.
 */
export function getTypingConfigForCustomization(custom?: StyleCustomization):
  | {
      isTypingStyle?: boolean;
      typingSpeed?: number;
      typingStartSec?: number;
      lineBreakGapSec?: number;
      chatMessages?: ChatMessage[];
      chatTiming?: ChatTimingConfig;
      chatStyleId?: ChatStyleId;
      pointsTitle?: string;
      pointsItems?: PointsItem[];
      pointsTiming?: PointsTimingConfig;
      pointsStyleId?: PointsStyleId;
      imageStyleId?: ImageStyleId;
      videoStyleId?: VideoStyleId;
      videoDurationSec?: number;
      videoTrimIn?: number;
      videoTrimOut?: number;
      videoSpeed?: number;
      videoCustomDurationEnabled?: boolean;
      videoCustomDuration?: number;
      videoEnterDuration?: number;
      videoExitDuration?: number;
    }
  | undefined {
  if (!custom) return undefined;
  if (custom.mode === 'video') {
    const activeVideoStyle: VideoStyleId =
      custom.videoStyleId ||
      (custom.styleId === 'vid_crt' ||
      custom.styleId === 'vid_phone' ||
      custom.styleId === 'vid_cinematic' ||
      custom.styleId === 'vid_floating' ||
      custom.styleId === 'vid_pip' ||
      custom.styleId === 'vid_camcorder'
        ? custom.styleId
        : 'vid_floating');
    const dur = custom.videoDurationSec ?? DEFAULT_VIDEO_DURATION;
    return {
      videoStyleId: activeVideoStyle,
      videoDurationSec: dur,
      videoTrimIn: custom.videoTrimIn ?? 0,
      videoTrimOut: custom.videoTrimOut ?? dur,
      videoSpeed: custom.videoSpeed ?? 1.0,
      videoCustomDurationEnabled: custom.videoCustomDurationEnabled ?? false,
      videoCustomDuration: custom.videoCustomDuration,
      videoEnterDuration: VIDEO_ENTER_DURATION,
      videoExitDuration: VIDEO_EXIT_DURATION,
    };
  }
  if (custom.mode === 'image') {
    const activeImageStyle: ImageStyleId =
      custom.imageStyleId ||
      (custom.styleId === 'img_polaroid' ||
      custom.styleId === 'img_browser' ||
      custom.styleId === 'img_newspaper' ||
      custom.styleId === 'img_cinematic' ||
      custom.styleId === 'img_floating' ||
      custom.styleId === 'img_spotlight' ||
      custom.styleId === 'img_float_glass'
        ? custom.styleId
        : 'img_polaroid');
    return {
      imageStyleId: activeImageStyle,
    };
  }
  if (custom.mode === 'points') {
    const activePointsStyle: PointsStyleId =
      custom.pointsStyleId ||
      (custom.styleId === 'pts_clean' ||
      custom.styleId === 'pts_cards' ||
      custom.styleId === 'pts_checklist' ||
      custom.styleId === 'pts_timeline' ||
      custom.styleId === 'pts_terminal' ||
      custom.styleId === 'pts_ranking' ||
      custom.styleId === 'pts_float_glass' ||
      custom.styleId === 'pts_flyer'
        ? custom.styleId
        : 'pts_clean');
    return {
      pointsTitle: custom.pointsTitle ?? DEFAULT_POINTS_TITLE,
      pointsItems: custom.pointsItems ?? DEFAULT_POINTS_ITEMS,
      pointsTiming: custom.pointsTiming ?? DEFAULT_POINTS_TIMING,
      pointsStyleId: activePointsStyle,
    };
  }
  if (custom.mode === 'chat') {
    const activeChatStyle: ChatStyleId =
      custom.chatStyleId ||
      (custom.styleId === 'chat_terminal' || custom.styleId === 'chat_float_glass'
        ? custom.styleId
        : 'chat_modern');
    return {
      chatMessages: custom.chatMessages ?? DEFAULT_CHAT_MESSAGES,
      chatTiming: custom.chatTiming ?? DEFAULT_CHAT_TIMING,
      chatStyleId: activeChatStyle,
    };
  }
  const activeId =
    custom.mode === 'phrase' ? custom.phraseStyleId || custom.styleId : custom.styleId;
  if (activeId === 'pixel_terminal') {
    return {
      isTypingStyle: true,
      typingSpeed: clamp(custom.typingSpeed ?? 18, 8, 30),
      typingStartSec: custom.terminalBootLine ? 0.56 : 0.34,
      lineBreakGapSec: 0.1,
    };
  }
  if (activeId === 'old_typewriter') {
    return {
      isTypingStyle: true,
      typingSpeed: clamp(custom.typingSpeed ?? 18, 8, 30),
      typingStartSec: 0.32,
      lineBreakGapSec: 0.16,
    };
  }
  return undefined;
}

/**
 * Resolves the active BackgroundMode from StyleCustomization (backward-compatible with boolean greenScreen).
 */
export function resolveBackgroundMode(custom: StyleCustomization): BackgroundMode {
  if (custom.backgroundMode) {
    return custom.backgroundMode;
  }
  return custom.greenScreen ? 'green' : 'style';
}

/**
 * Detects whether the text is predominantly Left-to-Right (English/Latin) or Right-to-Left (Arabic).
 */
export function detectTextDirection(
  text: string,
  configuredDirection: TextDirection = 'auto'
): ResolvedTextDirection {
  if (configuredDirection === 'rtl') return 'rtl';
  if (configuredDirection === 'ltr') return 'ltr';

  const cleaned = stripKeywordMarkers(text || '');
  const arabicMatches = cleaned.match(
    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g
  );
  const latinMatches = cleaned.match(/[A-Za-z]/g);

  const arabicCount = arabicMatches ? arabicMatches.length : 0;
  const latinCount = latinMatches ? latinMatches.length : 0;

  if (latinCount > arabicCount) {
    return 'ltr';
  }
  return 'rtl';
}

/**
 * Resolves the effective text direction from customization and raw text.
 */
export function resolveTextDirection(
  custom?: StyleCustomization,
  text?: string
): ResolvedTextDirection {
  const configured = custom?.textDirection || 'auto';
  return detectTextDirection(text || '', configured);
}

/**
 * Computes the target layout bounding box and alignment for Key Phrase positions.
 * Enforces >= 6% safe margin on all sides:
 * - top / bottom: full-width band ~28% of height
 * - left / right: column ~44% of width, vertically centered
 * - center: box ~70% x 40%
 * - fullscreen: huge text filling the safe area (88% x 84%)
 */
export function getPhrasePositionBox(
  position: PhrasePosition = 'center',
  format: AspectRatioFormat = '16:9',
  W: number = 1920,
  H: number = 1080,
  direction: ResolvedTextDirection = 'rtl'
): {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  align: 'right' | 'center' | 'left';
} {
  const effectivePos: PhrasePosition =
    format === '9:16' && (position === 'left' || position === 'right') ? 'center' : position;

  const sideAlign = direction === 'ltr' ? 'left' : 'right';

  switch (effectivePos) {
    case 'top':
      return {
        boxX: Math.round(W * 0.08),
        boxY: Math.round(H * 0.06),
        boxWidth: Math.round(W * 0.84),
        boxHeight: Math.round(H * 0.28),
        align: 'center',
      };
    case 'bottom':
      return {
        boxX: Math.round(W * 0.08),
        boxY: Math.round(H * 0.66),
        boxWidth: Math.round(W * 0.84),
        boxHeight: Math.round(H * 0.28),
        align: 'center',
      };
    case 'right':
      return {
        boxX: Math.round(W * 0.5),
        boxY: Math.round(H * 0.22),
        boxWidth: Math.round(W * 0.44),
        boxHeight: Math.round(H * 0.56),
        align: sideAlign,
      };
    case 'left':
      return {
        boxX: Math.round(W * 0.06),
        boxY: Math.round(H * 0.22),
        boxWidth: Math.round(W * 0.44),
        boxHeight: Math.round(H * 0.56),
        align: sideAlign,
      };
    case 'fullscreen':
      return {
        boxX: Math.round(W * 0.06),
        boxY: Math.round(H * 0.08),
        boxWidth: Math.round(W * 0.88),
        boxHeight: Math.round(H * 0.84),
        align: 'center',
      };
    case 'center':
    default:
      return {
        boxX: Math.round(W * 0.15),
        boxY: Math.round(H * 0.3),
        boxWidth: Math.round(W * 0.7),
        boxHeight: Math.round(H * 0.4),
        align: 'center',
      };
  }
}

/**
 * Computes the target chat window region for AI Chat mode:
 * - center: ~62% w x 84% h
 * - left / right column: ~44% w x 84% h (disabled in 9:16 -> falls back to center)
 * - fullscreen: safe area (6% margin -> 88% w x 88% h)
 */
export function getChatPositionBox(
  position: PhrasePosition = 'center',
  format: AspectRatioFormat = '16:9',
  W: number = 1920,
  H: number = 1080
): {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  effectivePosition: 'center' | 'right' | 'left' | 'fullscreen';
} {
  let effectivePosition: 'center' | 'right' | 'left' | 'fullscreen' =
    position === 'right' || position === 'left' || position === 'fullscreen'
      ? position
      : 'center';

  if (format === '9:16' && (effectivePosition === 'left' || effectivePosition === 'right')) {
    effectivePosition = 'center';
  }

  switch (effectivePosition) {
    case 'right': {
      const boxWidth = Math.round(W * 0.44);
      const boxHeight = Math.round(H * 0.84);
      return {
        boxX: Math.round(W * 0.5),
        boxY: Math.round((H - boxHeight) * 0.5),
        boxWidth,
        boxHeight,
        effectivePosition: 'right',
      };
    }
    case 'left': {
      const boxWidth = Math.round(W * 0.44);
      const boxHeight = Math.round(H * 0.84);
      return {
        boxX: Math.round(W * 0.06),
        boxY: Math.round((H - boxHeight) * 0.5),
        boxWidth,
        boxHeight,
        effectivePosition: 'left',
      };
    }
    case 'fullscreen': {
      const boxX = Math.round(W * 0.06);
      const boxY = Math.round(H * 0.06);
      return {
        boxX,
        boxY,
        boxWidth: W - boxX * 2,
        boxHeight: H - boxY * 2,
        effectivePosition: 'fullscreen',
      };
    }
    case 'center':
    default: {
      const boxWidth = Math.round(W * 0.62);
      const boxHeight = Math.round(H * 0.84);
      return {
        boxX: Math.round((W - boxWidth) * 0.5),
        boxY: Math.round((H - boxHeight) * 0.5),
        boxWidth,
        boxHeight,
        effectivePosition: 'center',
      };
    }
  }
}

/**
 * Computes the target stage region for Multi Points ("نقاط") mode:
 * - center: ~70% w x 80% h
 * - left / right column: ~44% w x 84% h (disabled in 9:16 -> falls back to center)
 * - fullscreen: safe area (6% margin -> 88% w x 88% h)
 */
export function getPointsPositionBox(
  position: PhrasePosition = 'center',
  format: AspectRatioFormat = '16:9',
  W: number = 1920,
  H: number = 1080
): {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  effectivePosition: 'center' | 'right' | 'left' | 'fullscreen';
} {
  let effectivePosition: 'center' | 'right' | 'left' | 'fullscreen' =
    position === 'right' || position === 'left' || position === 'fullscreen'
      ? position
      : 'center';

  if (format === '9:16' && (effectivePosition === 'left' || effectivePosition === 'right')) {
    effectivePosition = 'center';
  }

  switch (effectivePosition) {
    case 'right': {
      const boxWidth = Math.round(W * 0.44);
      const boxHeight = Math.round(H * 0.84);
      return {
        boxX: Math.round(W * 0.5),
        boxY: Math.round((H - boxHeight) * 0.5),
        boxWidth,
        boxHeight,
        effectivePosition: 'right',
      };
    }
    case 'left': {
      const boxWidth = Math.round(W * 0.44);
      const boxHeight = Math.round(H * 0.84);
      return {
        boxX: Math.round(W * 0.06),
        boxY: Math.round((H - boxHeight) * 0.5),
        boxWidth,
        boxHeight,
        effectivePosition: 'left',
      };
    }
    case 'fullscreen': {
      const boxX = Math.round(W * 0.06);
      const boxY = Math.round(H * 0.06);
      return {
        boxX,
        boxY,
        boxWidth: W - boxX * 2,
        boxHeight: H - boxY * 2,
        effectivePosition: 'fullscreen',
      };
    }
    case 'center':
    default: {
      const boxWidth = Math.round(W * 0.7);
      const boxHeight = Math.round(H * 0.8);
      return {
        boxX: Math.round((W - boxWidth) * 0.5),
        boxY: Math.round((H - boxHeight) * 0.5),
        boxWidth,
        boxHeight,
        effectivePosition: 'center',
      };
    }
  }
}

export type EffectiveImagePosition =
  | 'center'
  | 'right'
  | 'left'
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'fullscreen';

/**
 * Computes the target stage region for Image Insert ("صورة") mode:
 * - center: ~64% w x 76% h
 * - left / right: ~44% w x 80% h (disabled in 9:16 -> falls back to center)
 * - corners (top-right, top-left, bottom-right, bottom-left): ~34% w x 40% h (in 9:16: ~60% w x 26% h)
 * - fullscreen: safe area (6% margin -> 88% w x 88% h)
 * Applies the size slider `imageScale` (60% - 120%) while clamping to the 6% safe area so nothing overflows.
 */
export function getImagePositionBox(
  position: PhrasePosition = 'center',
  format: AspectRatioFormat = '16:9',
  W: number = 1920,
  H: number = 1080,
  imageScale: number = 1.0
): {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  effectivePosition: EffectiveImagePosition;
} {
  const validSet = new Set<EffectiveImagePosition>([
    'center',
    'right',
    'left',
    'top-right',
    'top-left',
    'bottom-right',
    'bottom-left',
    'fullscreen',
  ]);
  let effectivePosition: EffectiveImagePosition = validSet.has(position as EffectiveImagePosition)
    ? (position as EffectiveImagePosition)
    : 'center';

  if (format === '9:16' && (effectivePosition === 'left' || effectivePosition === 'right')) {
    effectivePosition = 'center';
  }

  const safeMarginX = Math.round(W * 0.06);
  const safeMarginY = Math.round(H * 0.06);
  const maxSafeW = W - safeMarginX * 2;
  const maxSafeH = H - safeMarginY * 2;
  const scaleFactor = clamp(imageScale || 1.0, 0.6, 1.2);

  let baseW = Math.round(W * 0.64);
  let baseH = Math.round(H * 0.76);

  if (effectivePosition === 'fullscreen') {
    baseW = maxSafeW;
    baseH = maxSafeH;
  } else if (effectivePosition === 'left' || effectivePosition === 'right') {
    baseW = Math.round(W * 0.44);
    baseH = Math.round(H * 0.8);
  } else if (
    effectivePosition === 'top-right' ||
    effectivePosition === 'top-left' ||
    effectivePosition === 'bottom-right' ||
    effectivePosition === 'bottom-left'
  ) {
    baseW = Math.round(W * (format === '9:16' ? 0.6 : 0.34));
    baseH = Math.round(H * (format === '9:16' ? 0.26 : 0.4));
  }

  const boxWidth = clamp(Math.round(baseW * scaleFactor), 180, maxSafeW);
  const boxHeight = clamp(Math.round(baseH * scaleFactor), 160, maxSafeH);

  let boxX = Math.round((W - boxWidth) * 0.5);
  let boxY = Math.round((H - boxHeight) * 0.5);

  switch (effectivePosition) {
    case 'right':
      boxX = W - safeMarginX - boxWidth;
      boxY = Math.round((H - boxHeight) * 0.5);
      break;
    case 'left':
      boxX = safeMarginX;
      boxY = Math.round((H - boxHeight) * 0.5);
      break;
    case 'top-right':
      boxX = W - safeMarginX - boxWidth;
      boxY = safeMarginY;
      break;
    case 'top-left':
      boxX = safeMarginX;
      boxY = safeMarginY;
      break;
    case 'bottom-right':
      boxX = W - safeMarginX - boxWidth;
      boxY = H - safeMarginY - boxHeight;
      break;
    case 'bottom-left':
      boxX = safeMarginX;
      boxY = H - safeMarginY - boxHeight;
      break;
    case 'fullscreen':
    case 'center':
    default:
      boxX = Math.round((W - boxWidth) * 0.5);
      boxY = Math.round((H - boxHeight) * 0.5);
      break;
  }

  return {
    boxX: clamp(boxX, safeMarginX, W - safeMarginX - boxWidth),
    boxY: clamp(boxY, safeMarginY, H - safeMarginY - boxHeight),
    boxWidth,
    boxHeight,
    effectivePosition,
  };
}

/**
 * Computes the percentage layout box { x, y, w, h } (0..100) for a Video Insert quick position preset:
 * - center: 64x76%
 * - right / left: 44x80% (disabled in 9:16 -> falls back to center)
 * - corners: 34x40% in 16:9 (60x26% in 9:16) anchored inside 6% safe margin
 * - fullscreen: 6..94% safe area (x: 6, y: 6, w: 88, h: 88)
 */
export function getDefaultVideoBoxForPosition(
  position: PhrasePosition = 'center',
  format: AspectRatioFormat = '16:9'
): VideoLayoutBox {
  const validSet = new Set<EffectiveImagePosition>([
    'center',
    'right',
    'left',
    'top-right',
    'top-left',
    'bottom-right',
    'bottom-left',
    'fullscreen',
  ]);
  let pos: EffectiveImagePosition = validSet.has(position as EffectiveImagePosition)
    ? (position as EffectiveImagePosition)
    : 'center';

  if (format === '9:16' && (pos === 'left' || pos === 'right')) {
    pos = 'center';
  }

  switch (pos) {
    case 'fullscreen':
      return { x: 6, y: 6, w: 88, h: 88 };
    case 'right':
      return { x: 50, y: 10, w: 44, h: 80 };
    case 'left':
      return { x: 6, y: 10, w: 44, h: 80 };
    case 'top-right': {
      const w = format === '9:16' ? 60 : 34;
      const h = format === '9:16' ? 26 : 40;
      return { x: 94 - w, y: 6, w, h };
    }
    case 'top-left': {
      const w = format === '9:16' ? 60 : 34;
      const h = format === '9:16' ? 26 : 40;
      return { x: 6, y: 6, w, h };
    }
    case 'bottom-right': {
      const w = format === '9:16' ? 60 : 34;
      const h = format === '9:16' ? 26 : 40;
      return { x: 94 - w, y: 94 - h, w, h };
    }
    case 'bottom-left': {
      const w = format === '9:16' ? 60 : 34;
      const h = format === '9:16' ? 26 : 40;
      return { x: 6, y: 94 - h, w, h };
    }
    case 'center':
    default:
      return { x: 18, y: 12, w: 64, h: 76 };
  }
}

/**
 * Clamps a percentage VideoLayoutBox either to the 6% safe margin (6..94%)
 * or to the canvas edges (0..100%) if `allowOutOfMargin` is true.
 */
export function clampVideoBoxToSafeMargin(
  rawBox: VideoLayoutBox,
  allowOutOfMargin: boolean = false
): VideoLayoutBox {
  const minMargin = allowOutOfMargin ? -25 : 6;
  const maxRight = allowOutOfMargin ? 125 : 94;
  const maxSpan = allowOutOfMargin ? 120 : 88;
  const w = clamp(Number.isFinite(rawBox.w) ? rawBox.w : 64, 12, maxSpan);
  const h = clamp(Number.isFinite(rawBox.h) ? rawBox.h : 76, 12, maxSpan);
  const x = clamp(Number.isFinite(rawBox.x) ? rawBox.x : 18, minMargin, maxRight - w);
  const y = clamp(Number.isFinite(rawBox.y) ? rawBox.y : 12, minMargin, maxRight - h);
  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    w: Number(w.toFixed(2)),
    h: Number(h.toFixed(2)),
  };
}

export interface VideoBoxSnapResult {
  box: VideoLayoutBox;
  snappedCenterX: boolean;
  snappedCenterY: boolean;
  snappedSafeLeft: boolean;
  snappedSafeRight: boolean;
  snappedSafeTop: boolean;
  snappedSafeBottom: boolean;
}

/**
 * Snaps a VideoLayoutBox to frame center X/Y and the 6% safe-area margins within threshold.
 */
export function snapVideoBoxToGuides(
  rawBox: VideoLayoutBox,
  allowOutOfMargin: boolean = false,
  thresholdPct: number = 1.25
): VideoBoxSnapResult {
  const box = { ...rawBox };
  let snappedCenterX = false;
  let snappedCenterY = false;
  let snappedSafeLeft = false;
  let snappedSafeRight = false;
  let snappedSafeTop = false;
  let snappedSafeBottom = false;

  const cx = box.x + box.w * 0.5;
  const cy = box.y + box.h * 0.5;

  if (Math.abs(cx - 50) <= thresholdPct) {
    box.x = 50 - box.w * 0.5;
    snappedCenterX = true;
  } else if (Math.abs(box.x - 6) <= thresholdPct) {
    box.x = 6;
    snappedSafeLeft = true;
  } else if (Math.abs(box.x + box.w - 94) <= thresholdPct) {
    box.x = 94 - box.w;
    snappedSafeRight = true;
  }

  if (Math.abs(cy - 50) <= thresholdPct) {
    box.y = 50 - box.h * 0.5;
    snappedCenterY = true;
  } else if (Math.abs(box.y - 6) <= thresholdPct) {
    box.y = 6;
    snappedSafeTop = true;
  } else if (Math.abs(box.y + box.h - 94) <= thresholdPct) {
    box.y = 94 - box.h;
    snappedSafeBottom = true;
  }

  return {
    box: clampVideoBoxToSafeMargin(box, allowOutOfMargin),
    snappedCenterX,
    snappedCenterY,
    snappedSafeLeft,
    snappedSafeRight,
    snappedSafeTop,
    snappedSafeBottom,
  };
}

export type VideoCornerHandle = 'nw' | 'ne' | 'sw' | 'se';

/**
 * Resizes a VideoLayoutBox from a corner handle, respecting aspect lock and safe margins.
 */
export function resizeVideoBoxFromCorner(
  startBox: VideoLayoutBox,
  handle: VideoCornerHandle,
  dxPct: number,
  dyPct: number,
  aspectLock: boolean = true,
  allowOutOfMargin: boolean = false
): VideoLayoutBox {
  const minW = 14;
  const minH = 14;
  const minBound = allowOutOfMargin ? -25 : 6;
  const maxBound = allowOutOfMargin ? 125 : 94;

  const anchorX = handle === 'nw' || handle === 'sw' ? startBox.x + startBox.w : startBox.x;
  const anchorY = handle === 'nw' || handle === 'ne' ? startBox.y + startBox.h : startBox.y;

  const signX = handle === 'nw' || handle === 'sw' ? -1 : 1;
  const signY = handle === 'nw' || handle === 'ne' ? -1 : 1;

  let nextW = Math.max(minW, startBox.w + dxPct * signX);
  let nextH = Math.max(minH, startBox.h + dyPct * signY);

  if (aspectLock && startBox.h > 0 && startBox.w > 0) {
    const ratio = startBox.w / startBox.h;
    if (Math.abs(dxPct) >= Math.abs(dyPct)) {
      nextH = Math.max(minH, nextW / ratio);
      nextW = nextH * ratio;
    } else {
      nextW = Math.max(minW, nextH * ratio);
      nextH = nextW / ratio;
    }
  }

  const maxAvailW = signX < 0 ? anchorX - minBound : maxBound - anchorX;
  const maxAvailH = signY < 0 ? anchorY - minBound : maxBound - anchorY;

  if (nextW > maxAvailW) {
    const k = maxAvailW / nextW;
    nextW = maxAvailW;
    if (aspectLock) nextH *= k;
  }
  if (nextH > maxAvailH) {
    const k = maxAvailH / nextH;
    nextH = maxAvailH;
    if (aspectLock) nextW *= k;
  }

  const x = signX < 0 ? anchorX - nextW : anchorX;
  const y = signY < 0 ? anchorY - nextH : anchorY;

  return clampVideoBoxToSafeMargin({ x, y, w: nextW, h: nextH }, allowOutOfMargin);
}

/**
 * Scales a VideoLayoutBox around its center from a baseline box using scale ratio (0.3 .. 1.2).
 */
export function scaleVideoBoxFromBase(
  baseBox: VideoLayoutBox,
  scaleRatio: number,
  allowOutOfMargin: boolean = false
): VideoLayoutBox {
  const s = clamp(scaleRatio, 0.3, 1.2);
  const cx = baseBox.x + baseBox.w * 0.5;
  const cy = baseBox.y + baseBox.h * 0.5;
  const w = baseBox.w * s;
  const h = baseBox.h * s;
  return clampVideoBoxToSafeMargin(
    {
      x: cx - w * 0.5,
      y: cy - h * 0.5,
      w,
      h,
    },
    allowOutOfMargin
  );
}

/**
 * Converts a percentage VideoLayoutBox to base canvas pixel coordinates.
 */
export function videoBoxToPixels(
  box: VideoLayoutBox | undefined,
  W: number,
  H: number,
  allowOutOfMargin: boolean = false
): { boxX: number; boxY: number; boxWidth: number; boxHeight: number } {
  const resolved = clampVideoBoxToSafeMargin(box || DEFAULT_VIDEO_BOX, allowOutOfMargin);
  return {
    boxX: Math.round((resolved.x / 100) * W),
    boxY: Math.round((resolved.y / 100) * H),
    boxWidth: Math.max(48, Math.round((resolved.w / 100) * W)),
    boxHeight: Math.max(48, Math.round((resolved.h / 100) * H)),
  };
}

/**
 * Checks if an RGB pixel (0-255) is in the green / yellow-green chroma key hue range.
 */
export function isRgbPixelGreenHue(r: number, g: number, b: number, a: number = 255): boolean {
  if (a < 32) return false;
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d < 0.18 || gn < 0.35) return false;

  let h = 0;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) * 60;
  } else {
    h = ((rn - gn) / d + 4) * 60;
  }

  return h >= 68 && h <= 165;
}

/**
 * Checks if a hex color is green or yellow-green (hue roughly 65° to 165° with noticeable saturation),
 * which would clash with Chroma Key (#00FF00) removal in video editors.
 */
export function isGreenishColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return isRgbPixelGreenHue(r, g, b, 255);
}

/**
 * Master envelope visibility factor (1 during hold, eases in during enter, eases out during exit).
 */
export function getMasterExitFactor(t: number, exitStart: number, total: number): number {
  if (t <= exitStart) return 1;
  const p = progress(t, exitStart, total);
  return 1 - easeInCubic(p);
}

/**
 * Computes RenderSize for a given aspect ratio format and resolution preset.
 */
export function getRenderSize(
  format: AspectRatioFormat,
  resolution: ExportResolution = '1080p'
): RenderSize {
  const baseWidth = format === '16:9' ? 1920 : 1080;
  const baseHeight = format === '16:9' ? 1080 : 1920;

  let multiplier = 1;
  if (resolution === '1440p') multiplier = 4 / 3; // 2560x1440 or 1440x2560
  if (resolution === '4K') multiplier = 2; // 3840x2160 or 2160x3840

  const width = Math.round(baseWidth * multiplier);
  const height = Math.round(baseHeight * multiplier);

  return {
    width,
    height,
    baseWidth,
    baseHeight,
    scale: multiplier,
  };
}

/**
 * Calculates target video bitrate in bits per second based on resolution, fps, and quality preset.
 * For 1080p30: normal = 12 Mbps, high = 20 Mbps, max = 35 Mbps.
 * Scaled by pixel count ratio and frame rate ratio.
 */
export function getTargetBitrate(
  resolution: ExportResolution,
  fps: ExportFps,
  quality: ExportQuality
): number {
  const baseMbps = quality === 'normal' ? 12 : quality === 'high' ? 20 : 35;
  const pixelScale =
    resolution === '1080p' ? 1 : resolution === '1440p' ? (2560 * 1440) / (1920 * 1080) : 4;
  const fpsScale = fps === 60 ? 1.5 : 1.0;
  return Math.round(baseMbps * 1_000_000 * pixelScale * fpsScale);
}

/**
 * Converts hex color (#RRGGBB) to { r, g, b } components (0-255).
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16) || 0;
    const g = parseInt(cleaned[1] + cleaned[1], 16) || 0;
    const b = parseInt(cleaned[2] + cleaned[2], 16) || 0;
    return { r, g, b };
  }
  const num = parseInt(cleaned, 16);
  if (isNaN(num)) return { r: 111, g: 168, b: 255 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Returns an rgba(...) string from a hex color and alpha (0-1).
 */
export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
}

/**
 * Lightens or darkens a hex color by mixing it with white or black.
 */
export function mixHexColor(hex: string, targetHex: string, weight: number): string {
  const c1 = hexToRgb(hex);
  const c2 = hexToRgb(targetHex);
  const w = clamp(weight, 0, 1);
  const r = Math.round(lerp(c1.r, c2.r, w));
  const g = Math.round(lerp(c1.g, c2.g, w));
  const b = Math.round(lerp(c1.b, c2.b, w));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
