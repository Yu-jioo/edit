import {
  ArabicFontFamily,
  BackgroundMode,
  ChatAiReplyStyle,
  ChatMessage,
  ChatTheme,
  ChatTimingConfig,
  PureStyleRenderer,
  QuoteContent,
  RenderSize,
  ResolvedTextDirection,
  SceneEventTimes,
  StyleCustomization,
  StyleLightPalette,
  TimelineConfig,
} from '../types';
import {
  clamp,
  computeChatSchedule,
  DEFAULT_CHAT_MESSAGES,
  DEFAULT_CHAT_TIMING,
  detectTextDirection,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  easeOutQuart,
  getChatPositionBox,
  hexToRgba,
  lerp,
  progress,
  resolveBackgroundMode,
  resolveTextDirection,
  ScheduledChatMessage,
} from '../utils/math';
import {
  applyStudioCanvasTextProps,
  ArabicQuoteLayout,
  computeTypingScheduleForLayout,
  drawBidiWord,
  evaluateLineTypingAtTime,
  getFontCalibration,
  layoutArabicQuote,
  LayoutTypingSchedule,
} from '../utils/textLayout';

export const CHAT_MODERN_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#F2F5FA',
  textSecondary: '#A8B3C7',
  accent: '#4C8DFF',
  keyword: '#FFD166',
  border: '#4C8DFF',
};

export const CHAT_MODERN_CONFIG = {
  id: 'chat_modern' as const,
  mode: 'chat' as const,
  nameAr: 'شات عادي',
  nameEn: 'Modern Chat',
  descriptionAr:
    'نافذة محادثة عصرية بفقاعات رسائل ومؤشر تفكير ثلاثي النقاط وشريط كتابة سفلي وتمرير تلقائي سلس',
  defaultAccent: '#4C8DFF',
  defaultKeywordColor: '#FFD166',
  defaultQuoteFont: 'Cairo' as ArabicFontFamily,
  defaultAuthorFont: 'Cairo' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Plus Jakarta Sans' as const,
  defaultEnglishAuthorFont: 'Plus Jakarta Sans' as const,
  supportedBackgrounds: ['style', 'green', 'black'] as BackgroundMode[],
  recommendedBackground: 'green' as BackgroundMode,
  lightPalette: CHAT_MODERN_LIGHT_PALETTE,
};

interface PrelaidChatMessage {
  sched: ScheduledChatMessage;
  direction: ResolvedTextDirection;
  layout: ArabicQuoteLayout;
  inputLineLayout: ArabicQuoteLayout;
  inputTypingSchedule: LayoutTypingSchedule;
  bubbleW: number;
  bubbleH: number;
  slotTopY: number;
  slotBottomY: number;
  labelHeight: number;
  padX: number;
  padY: number;
  keywordAppearTimes: number[];
}

interface ScrollCheckpoint {
  time: number;
  targetScroll: number;
}

/**
 * Pure function of `t` that evaluates smooth upward auto-scroll (easeInOutCubic ~0.35s)
 * whenever new content extends past `viewportH`.
 */
export function evaluateDeterministicChatScroll(
  t: number,
  checkpoints: ScrollCheckpoint[]
): number {
  if (checkpoints.length === 0) return 0;

  let currentScroll = 0;
  const scrollDur = 0.35;

  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    if (t < cp.time) break;
    if (cp.targetScroll > currentScroll) {
      const p = progress(t, cp.time, cp.time + scrollDur);
      currentScroll = lerp(currentScroll, cp.targetScroll, easeInOutCubic(p));
    }
  }

  return Math.max(0, currentScroll);
}

/**
 * Lightens or darkens a hex color by a percentage (-1..1) for smooth bubble gradients.
 */
function adjustHexBrightness(hex: string, amount: number): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return hex;
  const r = clamp(Math.round(((num >> 16) & 0xff) + 255 * amount), 0, 255);
  const g = clamp(Math.round(((num >> 8) & 0xff) + 255 * amount), 0, 255);
  const b = clamp(Math.round((num & 0xff) + 255 * amount), 0, 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Draws a generic geometric 4-point sparkle avatar for AI on canvas (no brand logos).
 */
function drawAiSparkleAvatar(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  accentColor: string,
  theme: ChatTheme,
  isBlackMode: boolean,
  isGreenMode: boolean
) {
  ctx.save();
  if (isBlackMode) {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (isGreenMode) {
    ctx.fillStyle = theme === 'light' ? '#E6EEFF' : '#1E2638';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    const avGrad = ctx.createLinearGradient(
      centerX - radius,
      centerY - radius,
      centerX + radius,
      centerY + radius
    );
    if (theme === 'light') {
      avGrad.addColorStop(0, '#F0F5FF');
      avGrad.addColorStop(1, '#DCE8FF');
    } else {
      avGrad.addColorStop(0, '#242F46');
      avGrad.addColorStop(1, '#171E2E');
    }
    ctx.fillStyle = avGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hexToRgba(accentColor, 0.55);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // Draw 4-point sparkle star inside circle
  const rOuter = radius * 0.58;
  const rInner = radius * 0.19;
  ctx.fillStyle = isBlackMode ? '#FFFFFF' : accentColor;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    const px = centerX + Math.cos(angle) * r;
    const py = centerY + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function buildModernChatSceneLayout(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  custom: StyleCustomization,
  size: RenderSize
) {
  const { baseWidth: W, baseHeight: H } = size;
  const isHorizontal = custom.format === '16:9';
  const winBox = getChatPositionBox(custom.position || 'center', custom.format, W, H);
  const winX = winBox.boxX;
  const winY = winBox.boxY;
  const winW = winBox.boxWidth;
  const winH = winBox.boxHeight;

  const headerH = isHorizontal ? 62 : 58;
  const inputAreaH = isHorizontal ? 76 : 72;
  const msgPadX = Math.max(22, Math.round(winW * 0.042));
  const msgPadTop = 20;
  const msgPadBottom = 16;

  const msgAreaX = winX + msgPadX;
  const msgAreaY = winY + headerH + msgPadTop;
  const msgAreaW = Math.max(180, winW - msgPadX * 2);
  const msgAreaH = Math.max(140, winH - headerH - inputAreaH - msgPadTop - msgPadBottom);

  const messages: ChatMessage[] =
    content.chatMessages || custom.chatMessages || DEFAULT_CHAT_MESSAGES;
  const timing: ChatTimingConfig = custom.chatTiming || DEFAULT_CHAT_TIMING;
  const schedule = computeChatSchedule(messages, timing, 'chat_modern');

  const avatarRadius = isHorizontal ? 19 : 17;
  const avatarGap = 14;
  const avatarColumnW = avatarRadius * 2 + avatarGap;
  const overrideCal = getFontCalibration(custom.quoteFontOverride || '');
  const bubblePadX = isHorizontal ? 22 : 18;
  const bubblePadY =
    (isHorizontal ? 15 : 13) + Math.round(overrideCal.lineHeightBonus * 26);

  const baseFontPx = Math.round(
    (winBox.effectivePosition === 'fullscreen'
      ? isHorizontal
        ? 30
        : 27
      : isHorizontal
        ? 26
        : 24) * clamp(custom.fontSizeMultiplier ?? 1.0, 0.7, 1.3)
  );
  const chatFontSize = clamp(baseFontPx, 18, 42);

  const inputBarW = winW - msgPadX * 2;
  const inputTextMaxW = Math.max(120, inputBarW - 110);

  const prelaid: PrelaidChatMessage[] = [];
  const checkpoints: ScrollCheckpoint[] = [];
  const allKeywordTimes: number[] = [];
  const allKeystrokeTimes: number[] = [];

  const userTypingSpeed = clamp(timing.userTypingSpeed ?? 18, 8, 30);
  const aiReplySpeed = clamp(timing.aiReplySpeed ?? 9, 4, 20);

  let currentSlotY = 0;
  const itemGapY = (isHorizontal ? 18 : 16) + Math.round(overrideCal.lineHeightBonus * 20);

  for (let i = 0; i < schedule.items.length; i++) {
    const item = schedule.items[i];
    const isUser = item.role === 'user';
    // User has no avatar column; AI has the sparkle avatar column
    const maxBubbleW = isUser
      ? Math.max(160, Math.round(msgAreaW * 0.8))
      : Math.max(150, Math.round(msgAreaW * 0.82) - avatarColumnW);
    const maxTextW = Math.max(110, maxBubbleW - bubblePadX * 2);

    const msgDir: ResolvedTextDirection =
      custom.textDirection && custom.textDirection !== 'auto'
        ? custom.textDirection
        : detectTextDirection(item.message.text, 'auto');

    const defaultFont =
      msgDir === 'ltr'
        ? CHAT_MODERN_CONFIG.defaultEnglishQuoteFont
        : CHAT_MODERN_CONFIG.defaultQuoteFont;
    const fontFamily = custom.quoteFontOverride || defaultFont;

    // Lay out message at its FINAL size at origin (0, 0) so nothing jitters while streaming
    const layout = layoutArabicQuote(ctx, {
      text: item.message.text,
      quotationMarks: 'none',
      fontFamily,
      fontWeight: 600,
      minFontSize: chatFontSize,
      maxFontSize: chatFontSize,
      fontSizeMultiplier: 1.0,
      keywordScaleMultiplier: 1.0,
      lineHeightRatio: 1.62,
      boxX: 0,
      boxY: 0,
      boxWidth: maxTextW,
      boxHeight: 8000,
      align: msgDir === 'ltr' ? 'left' : 'right',
      direction: msgDir,
      verticalAlign: 'top',
    });

    // Also lay out user message inside the bottom input bar for typing animation
    const singleLineText = item.message.text.replace(/\r?\n/g, ' ');
    const inputLineLayout = layoutArabicQuote(ctx, {
      text: singleLineText,
      quotationMarks: 'none',
      fontFamily,
      fontWeight: 600,
      minFontSize: Math.max(17, Math.round(chatFontSize * 0.86)),
      maxFontSize: Math.max(17, Math.round(chatFontSize * 0.86)),
      fontSizeMultiplier: 1.0,
      keywordScaleMultiplier: 1.0,
      lineHeightRatio: 1.4,
      boxX: 0,
      boxY: 0,
      boxWidth: Math.max(inputTextMaxW, 2400),
      boxHeight: 400,
      align: msgDir === 'ltr' ? 'left' : 'right',
      direction: msgDir,
      verticalAlign: 'top',
    });

    const inputTypingSchedule = computeTypingScheduleForLayout(
      ctx,
      inputLineLayout,
      item.typingStart,
      userTypingSpeed,
      0.04
    );

    if (item.role === 'user') {
      allKeystrokeTimes.push(...inputTypingSchedule.keystrokeTimes);
    }

    // No sender name labels in Modern Chat ("أنا" and "الذكاء الاصطناعي" text removed)
    const labelHeight = 0;
    const textContentW = Math.max(56, Math.ceil(layout.maxLineWidth));
    const bubbleW = Math.min(maxBubbleW, textContentW + bubblePadX * 2);
    const bubbleH = Math.ceil(layout.totalHeight) + bubblePadY * 2;
    const slotTopY = currentSlotY;
    const slotBottomY = slotTopY + bubbleH;

    // Collect keyword timestamps and scroll checkpoints
    const keywordAppearTimes: number[] = [];
    const seenGroups = new Set<number>();

    if (item.role === 'user') {
      for (const w of layout.words) {
        if (w.isKeyword && w.groupId !== null && !seenGroups.has(w.groupId)) {
          seenGroups.add(w.groupId);
          keywordAppearTimes.push(item.sendTime);
          allKeywordTimes.push(item.sendTime);
        }
      }
      // Scroll checkpoint when user bubble is sent into the message list
      const neededScroll = Math.max(0, slotBottomY - msgAreaH);
      checkpoints.push({ time: item.sendTime, targetScroll: neededScroll });
    } else {
      // Thinking indicator checkpoint
      if (item.thinkingEnd > item.thinkingStart) {
        const thinkingBottom = slotTopY + 48;
        checkpoints.push({
          time: item.thinkingStart,
          targetScroll: Math.max(0, thinkingBottom - msgAreaH),
        });
      }

      // Per-line scroll checkpoints as AI reply streams word by word
      for (let lIdx = 0; lIdx < layout.lines.length; lIdx++) {
        const line = layout.lines[lIdx];
        const firstWordIdx = line.words[0]?.globalWordIndex ?? 0;
        const lineStartT = Number((item.receiveTime + firstWordIdx / aiReplySpeed).toFixed(3));
        const lineBottomInSlot =
          slotTopY + bubblePadY + (lIdx + 1) * layout.lineHeight + bubblePadY;
        checkpoints.push({
          time: lineStartT,
          targetScroll: Math.max(0, lineBottomInSlot - msgAreaH),
        });
      }

      for (const w of layout.words) {
        if (w.isKeyword && w.groupId !== null && !seenGroups.has(w.groupId)) {
          seenGroups.add(w.groupId);
          const kwT = Number((item.receiveTime + w.globalWordIndex / aiReplySpeed).toFixed(3));
          keywordAppearTimes.push(kwT);
          allKeywordTimes.push(kwT);
        }
      }
    }

    prelaid.push({
      sched: item,
      direction: msgDir,
      layout,
      inputLineLayout,
      inputTypingSchedule,
      bubbleW,
      bubbleH,
      slotTopY,
      slotBottomY,
      labelHeight,
      padX: bubblePadX,
      padY: bubblePadY,
      keywordAppearTimes,
    });

    currentSlotY = slotBottomY + itemGapY;
  }

  checkpoints.sort((a, b) => a.time - b.time);

  return {
    winBox,
    winX,
    winY,
    winW,
    winH,
    headerH,
    inputAreaH,
    msgPadX,
    msgAreaX,
    msgAreaY,
    msgAreaW,
    msgAreaH,
    avatarRadius,
    avatarGap,
    avatarColumnW,
    chatFontSize,
    schedule,
    prelaid,
    checkpoints,
    allKeywordTimes,
    allKeystrokeTimes,
  };
}

export function getChatModernEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  void timeline;
  const scene = buildModernChatSceneLayout(ctx, content, custom, size);
  return {
    enterStart: scene.schedule.introDuration,
    keywordTimes: scene.allKeywordTimes,
    sendTimes: scene.schedule.sendTimes,
    receiveTimes: scene.schedule.receiveTimes,
    keystrokeTimes: scene.allKeystrokeTimes,
  };
}

export const renderChatModern: PureStyleRenderer = (
  ctx,
  t,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
) => {
  void timeline;
  const { baseWidth: W, baseHeight: H } = size;
  const bgMode = resolveBackgroundMode(custom);
  const isGreenMode = bgMode === 'green';
  const isBlackMode = bgMode === 'black';

  const theme: ChatTheme = custom.chatTheme || 'dark';
  const aiReplyStyle: ChatAiReplyStyle = custom.chatAiReplyStyle || 'plain';
  const swapSides = Boolean(custom.chatSwapSides);

  const scene = buildModernChatSceneLayout(ctx, content, custom, size);
  const { schedule, prelaid, checkpoints } = scene;

  const defaultAccent = theme === 'light' ? '#2F6BFF' : '#4C8DFF';
  const userBubbleColor =
    custom.accentColor && custom.accentColor !== '#6FA8FF'
      ? custom.accentColor
      : defaultAccent;
  const keywordColor =
    custom.keywordColor ||
    (theme === 'light' && !isBlackMode ? '#D97706' : CHAT_MODERN_CONFIG.defaultKeywordColor);

  const windowBg = theme === 'light' ? '#F4F6FA' : '#0F1115';
  const headerBg = theme === 'light' ? '#FFFFFF' : '#151922';
  const aiBubbleBg = theme === 'light' ? '#FFFFFF' : '#1E2330';
  const aiTextColor = isBlackMode
    ? '#F2F5FA'
    : theme === 'light'
      ? '#14161B'
      : '#F2F5FA';
  const secondaryTextColor = isBlackMode
    ? '#A8B3C7'
    : theme === 'light'
      ? '#5A6578'
      : '#8E9BAE';
  const borderColor = isBlackMode
    ? hexToRgba(userBubbleColor, 0.75)
    : theme === 'light'
      ? '#DCE3F0'
      : '#263044';

  const uiFont =
    custom.authorFontOverride ||
    custom.quoteFontOverride ||
    CHAT_MODERN_CONFIG.defaultAuthorFont;

  // Intro (0 -> 0.6s) and Exit (exitStart -> totalDuration)
  const enterP = easeOutQuart(progress(t, 0, schedule.introDuration));
  const exitP = easeInCubic(progress(t, schedule.exitStart, schedule.totalDuration));
  const masterVis = clamp(enterP * (1 - exitP), 0, 1);

  ctx.save();

  // 1. Background Layer
  if (isGreenMode) {
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(0, 0, W, H);
  } else if (isBlackMode) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    // Style background: rich ambient studio gradient behind the chat window
    const bgGrad = ctx.createRadialGradient(
      W * 0.5,
      H * 0.45,
      W * 0.05,
      W * 0.5,
      H * 0.5,
      W * 0.75
    );
    if (theme === 'light') {
      bgGrad.addColorStop(0, '#E8EEF7');
      bgGrad.addColorStop(1, '#CBD5E6');
    } else {
      bgGrad.addColorStop(0, '#131824');
      bgGrad.addColorStop(1, '#07090E');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
  }

  if (masterVis <= 0.005) {
    ctx.restore();
    return;
  }

  // 2. Chat Window Transform (smooth scale + fade on enter/exit; hard edges in green mode)
  const winCenterX = scene.winX + scene.winW * 0.5;
  const winCenterY = scene.winY + scene.winH * 0.5;
  const winScale = lerp(0.95, 1.0, enterP) * lerp(1.0, 0.96, exitP);

  ctx.save();
  ctx.globalAlpha = isGreenMode ? (masterVis > 0.08 ? 1 : 0) : masterVis;
  ctx.translate(winCenterX, winCenterY);
  ctx.scale(winScale, winScale);
  ctx.translate(-winCenterX, -winCenterY);

  const winRadius = 24;

  // Window shadow (ONLY in 'style' background mode — never in green or black)
  if (!isGreenMode && !isBlackMode) {
    ctx.save();
    ctx.shadowColor = theme === 'light' ? 'rgba(15, 23, 42, 0.16)' : 'rgba(0, 0, 0, 0.58)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = windowBg;
    ctx.beginPath();
    ctx.roundRect(scene.winX, scene.winY, scene.winW, scene.winH, winRadius);
    ctx.fill();
    ctx.restore();
  }

  // Window Panel Fill & Border
  if (!isBlackMode) {
    ctx.fillStyle = windowBg;
    ctx.beginPath();
    ctx.roundRect(scene.winX, scene.winY, scene.winW, scene.winH, winRadius);
    ctx.fill();
  }

  // Header Fill
  if (!isBlackMode) {
    ctx.fillStyle = headerBg;
    ctx.beginPath();
    ctx.roundRect(scene.winX, scene.winY, scene.winW, scene.headerH, [
      winRadius,
      winRadius,
      0,
      0,
    ]);
    ctx.fill();
  }

  // Window Outer Border + Header Divider
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = isBlackMode || isGreenMode ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.roundRect(scene.winX, scene.winY, scene.winW, scene.winH, winRadius);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(scene.winX, scene.winY + scene.headerH);
  ctx.lineTo(scene.winX + scene.winY + scene.headerH - scene.winY - scene.headerH + scene.winW, scene.winY + scene.headerH);
  ctx.stroke();

  // 3. Header Content (AI Sparkle Avatar ONLY — no "الذكاء الاصطناعي" text)
  const headerCenterY = scene.winY + scene.headerH * 0.5;
  const headerAvatarX = scene.winX + scene.winW - scene.msgPadX - 18;
  drawAiSparkleAvatar(
    ctx,
    headerAvatarX,
    headerCenterY,
    18,
    userBubbleColor,
    theme,
    isBlackMode,
    isGreenMode
  );

  // Subtle status indicator dot on the opposite side of header
  ctx.save();
  ctx.fillStyle = userBubbleColor;
  ctx.beginPath();
  ctx.arc(scene.winX + scene.msgPadX + 8, headerCenterY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 4. Scrollable Message List Region
  const scrollOffset = evaluateDeterministicChatScroll(t, checkpoints);

  ctx.save();
  ctx.beginPath();
  ctx.rect(scene.msgAreaX - 8, scene.msgAreaY, scene.msgAreaW + 16, scene.msgAreaH);
  ctx.clip();

  for (let i = 0; i < prelaid.length; i++) {
    const pm = prelaid[i];
    const item = pm.sched;

    // Determine if this message is visible yet in the message list
    if (item.role === 'user' && t < item.sendTime) {
      continue;
    }
    if (item.role === 'ai' && t < item.thinkingStart) {
      continue;
    }

    const isUser = item.role === 'user';
    // Default: User bubbles on the right, AI on the left; swapped if swapSides === true
    const onRightSide = isUser ? !swapSides : swapSides;

    // Rise & pop animation for user bubble when sent
    let popScale = 1.0;
    let popOffsetY = 0;
    let itemAlpha = 1.0;
    if (isUser) {
      const sendP = progress(t, item.sendTime, item.sendTime + 0.24);
      popScale = lerp(0.88, 1.0, easeOutBack(sendP, 1.45));
      popOffsetY = (1 - easeOutCubic(sendP)) * 20;
      itemAlpha = isGreenMode ? 1.0 : clamp(sendP * 2.5, 0, 1);
    }

    const drawTopY = scene.msgAreaY + pm.slotTopY - scrollOffset + popOffsetY;
    const drawBottomY = drawTopY + pm.bubbleH;

    // Skip if completely scrolled out of view
    if (drawBottomY < scene.msgAreaY - 24 || drawTopY > scene.msgAreaY + scene.msgAreaH + 24) {
      continue;
    }

    // Horizontal positioning:
    // User has NO avatar ("أنا" and user icon removed) -> bubble aligns directly to edge of msgArea
    // AI keeps the AI sparkle avatar -> bubble/text is offset by avatarColumnW
    const avatarCenterX = onRightSide
      ? scene.msgAreaX + scene.msgAreaW - scene.avatarRadius
      : scene.msgAreaX + scene.avatarRadius;
    const avatarCenterY = drawTopY + Math.min(scene.avatarRadius + 6, pm.bubbleH * 0.5);

    const bubbleX = isUser
      ? onRightSide
        ? scene.msgAreaX + scene.msgAreaW - pm.bubbleW
        : scene.msgAreaX
      : onRightSide
        ? scene.msgAreaX + scene.msgAreaW - scene.avatarColumnW - pm.bubbleW
        : scene.msgAreaX + scene.avatarColumnW;
    const bubbleY = drawTopY;

    ctx.save();
    ctx.globalAlpha *= itemAlpha;

    // Apply pop scale around bubble center for user message
    if (isUser && popScale !== 1.0) {
      const bcx = bubbleX + pm.bubbleW * 0.5;
      const bcy = bubbleY + pm.bubbleH * 0.5;
      ctx.translate(bcx, bcy);
      ctx.scale(popScale, popScale);
      ctx.translate(-bcx, -bcy);
    }

    // Draw AI Sparkle Avatar ONLY for AI messages (User avatar removed)
    if (!isUser) {
      drawAiSparkleAvatar(
        ctx,
        avatarCenterX,
        avatarCenterY,
        scene.avatarRadius,
        userBubbleColor,
        theme,
        isBlackMode,
        isGreenMode
      );
    }

    // Sleek asymmetric bubble corner radii
    const rTopRight = onRightSide ? 6 : 22;
    const rTopLeft = onRightSide ? 22 : 6;
    const radii = [rTopLeft, rTopRight, 22, 22];

    // Check if AI is currently in the thinking phase
    if (!isUser && t >= item.thinkingStart && t < item.receiveTime) {
      const indW = 82;
      const indH = 44;
      const indX = onRightSide ? bubbleX + pm.bubbleW - indW : bubbleX;
      const indY = bubbleY;

      if (isBlackMode) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(indX, indY, indW, indH, radii);
        ctx.stroke();
      } else if (isGreenMode) {
        ctx.fillStyle = aiBubbleBg;
        ctx.beginPath();
        ctx.roundRect(indX, indY, indW, indH, radii);
        ctx.fill();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        const indGrad = ctx.createLinearGradient(indX, indY, indX, indY + indH);
        if (theme === 'light') {
          indGrad.addColorStop(0, '#FFFFFF');
          indGrad.addColorStop(1, '#F1F5FD');
        } else {
          indGrad.addColorStop(0, '#242B3D');
          indGrad.addColorStop(1, '#1A1F2D');
        }
        ctx.fillStyle = indGrad;
        ctx.beginPath();
        ctx.roundRect(indX, indY, indW, indH, radii);
        ctx.fill();

        ctx.strokeStyle =
          theme === 'light' ? '#DCE5F5' : hexToRgba(userBubbleColor, 0.32);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      // Three bouncing dots
      for (let d = 0; d < 3; d++) {
        const bounce = Math.sin(t * 9.0 - d * 1.1);
        const dy = indY + indH * 0.5 - Math.max(0, bounce) * 5;
        const dx = indX + 22 + d * 19;
        ctx.fillStyle = userBubbleColor;
        ctx.beginPath();
        ctx.arc(dx, dy, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      continue;
    }

    // Draw Sleek Message Frame / Bubble
    // User always has a sleek gradient + glowing border bubble;
    // AI has either full bubble ('bubble') or sleek subtle framed card ('plain')
    const showBubbleBox = isUser || aiReplyStyle === 'bubble';
    if (showBubbleBox) {
      if (isUser) {
        if (isGreenMode || isBlackMode) {
          ctx.fillStyle = userBubbleColor;
          ctx.beginPath();
          ctx.roundRect(bubbleX, bubbleY, pm.bubbleW, pm.bubbleH, radii);
          ctx.fill();
        } else {
          // Soft ambient shadow for user bubble in 'style' mode
          ctx.save();
          ctx.shadowColor = hexToRgba(userBubbleColor, theme === 'light' ? 0.24 : 0.32);
          ctx.shadowBlur = 18;
          ctx.shadowOffsetY = 6;

          const uGrad = ctx.createLinearGradient(
            bubbleX,
            bubbleY,
            bubbleX + pm.bubbleW,
            bubbleY + pm.bubbleH
          );
          uGrad.addColorStop(0, adjustHexBrightness(userBubbleColor, 0.07));
          uGrad.addColorStop(1, adjustHexBrightness(userBubbleColor, -0.06));
          ctx.fillStyle = uGrad;
          ctx.beginPath();
          ctx.roundRect(bubbleX, bubbleY, pm.bubbleW, pm.bubbleH, radii);
          ctx.fill();
          ctx.restore();

          // Soft luminous inner-edge border glow
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(bubbleX, bubbleY, pm.bubbleW, pm.bubbleH, radii);
          ctx.stroke();
        }
      } else if (isBlackMode) {
        ctx.strokeStyle = 'rgba(242, 245, 250, 0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, pm.bubbleW, pm.bubbleH, radii);
        ctx.stroke();
      } else if (isGreenMode) {
        ctx.fillStyle = aiBubbleBg;
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, pm.bubbleW, pm.bubbleH, radii);
        ctx.fill();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.save();
        ctx.shadowColor =
          theme === 'light' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(0, 0, 0, 0.28)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 5;

        const aiGrad = ctx.createLinearGradient(
          bubbleX,
          bubbleY,
          bubbleX,
          bubbleY + pm.bubbleH
        );
        if (theme === 'light') {
          aiGrad.addColorStop(0, '#FFFFFF');
          aiGrad.addColorStop(1, '#F5F8FF');
        } else {
          aiGrad.addColorStop(0, '#242B3D');
          aiGrad.addColorStop(1, '#1A202E');
        }
        ctx.fillStyle = aiGrad;
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, pm.bubbleW, pm.bubbleH, radii);
        ctx.fill();
        ctx.restore();

        // Soft glowing border around AI bubble
        ctx.strokeStyle =
          theme === 'light' ? '#D8E2F2' : hexToRgba(userBubbleColor, 0.3);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, pm.bubbleW, pm.bubbleH, radii);
        ctx.stroke();
      }
    } else if (!isBlackMode && !isGreenMode) {
      // Even in 'plain' AI reply style, draw a subtle glowing side accent bar & soft surface tint
      const plainGrad = ctx.createLinearGradient(
        bubbleX,
        bubbleY,
        bubbleX,
        bubbleY + pm.bubbleH
      );
      if (theme === 'light') {
        plainGrad.addColorStop(0, 'rgba(255, 255, 255, 0.72)');
        plainGrad.addColorStop(1, 'rgba(240, 245, 255, 0.52)');
      } else {
        plainGrad.addColorStop(0, 'rgba(30, 36, 52, 0.62)');
        plainGrad.addColorStop(1, 'rgba(22, 27, 40, 0.42)');
      }
      ctx.fillStyle = plainGrad;
      ctx.beginPath();
      ctx.roundRect(bubbleX, bubbleY, pm.bubbleW, pm.bubbleH, radii);
      ctx.fill();

      ctx.strokeStyle =
        theme === 'light'
          ? 'rgba(203, 213, 225, 0.85)'
          : hexToRgba(userBubbleColor, 0.22);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(bubbleX, bubbleY, pm.bubbleW, pm.bubbleH, radii);
      ctx.stroke();
    }

    // Draw Message Words & Keyword Underlines
    const textOriginX =
      pm.direction === 'ltr'
        ? bubbleX + pm.padX
        : bubbleX + pm.bubbleW - pm.padX - pm.layout.boxWidth;
    const textOriginY = bubbleY + pm.padY;
    const aiReplySpeed = clamp((custom.chatTiming || DEFAULT_CHAT_TIMING).aiReplySpeed ?? 9, 4, 20);

    for (const w of pm.layout.words) {
      let wordAlpha = 1.0;
      let wordOffsetY = 0;

      if (!isUser) {
        const wordStartT = item.receiveTime + w.globalWordIndex / aiReplySpeed;
        if (t < wordStartT) continue;
        const wp = progress(t, wordStartT, wordStartT + 0.12);
        wordAlpha = isGreenMode ? 1.0 : wp;
        wordOffsetY = (1 - easeOutCubic(wp)) * 4;
      }

      const drawRightX = textOriginX + w.x;
      const drawBaseY = textOriginY + w.y + wordOffsetY;

      ctx.save();
      ctx.globalAlpha *= wordAlpha;
      applyStudioCanvasTextProps(
        ctx,
        pm.layout.fontFamily,
        pm.layout.fontWeight,
        w.fontSize,
        pm.direction
      );

      if (w.isKeyword) {
        ctx.fillStyle = isUser && theme === 'light' ? '#FDE047' : keywordColor;
      } else {
        ctx.fillStyle = isUser ? '#FFFFFF' : aiTextColor;
      }

      drawBidiWord(ctx, w.text, drawRightX, drawBaseY, pm.direction);

      // Thin underline stroke for keywords (no width change)
      if (w.isKeyword) {
        const ulColor = isUser && theme === 'light' ? '#FDE047' : keywordColor;
        ctx.strokeStyle = ulColor;
        ctx.lineWidth = Math.max(2, Math.round(w.fontSize * 0.08));
        ctx.lineCap = 'round';
        const ulY = drawBaseY + w.fontSize * 0.18;
        ctx.beginPath();
        ctx.moveTo(drawRightX - w.width, ulY);
        ctx.lineTo(drawRightX, ulY);
        ctx.stroke();
      }

      ctx.restore();
    }

    ctx.restore();
  }

  // Smooth top-edge fade when scrolled ( ONLY in 'style' background mode; hard clip in green/black )
  if (!isGreenMode && !isBlackMode && scrollOffset > 2) {
    const fadeH = Math.min(44, scene.msgAreaH * 0.15);
    const fadeGrad = ctx.createLinearGradient(0, scene.msgAreaY, 0, scene.msgAreaY + fadeH);
    fadeGrad.addColorStop(0, windowBg);
    fadeGrad.addColorStop(1, hexToRgba(windowBg, 0));
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(scene.msgAreaX - 6, scene.msgAreaY, scene.msgAreaW + 12, fadeH);
  }

  ctx.restore();

  // 5. Fake Input Bar at the Bottom of the Chat Window
  const inputBarX = scene.winX + scene.msgPadX;
  const inputBarW = scene.winW - scene.msgPadX * 2;
  const inputBarH = 48;
  const inputBarY = scene.winY + scene.winH - scene.inputAreaH * 0.5 - inputBarH * 0.5;

  if (isBlackMode) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(inputBarX, inputBarY, inputBarW, inputBarH, 24);
    ctx.stroke();
  } else {
    ctx.fillStyle = theme === 'light' ? '#FFFFFF' : '#181D29';
    ctx.beginPath();
    ctx.roundRect(inputBarX, inputBarY, inputBarW, inputBarH, 24);
    ctx.fill();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Find if any user message is currently being typed in the input bar
  const activeTypingMsg = prelaid.find(
    (pm) => pm.sched.role === 'user' && t >= pm.sched.typingStart && t < pm.sched.sendTime
  );

  // Send button circle inside input bar (on the left for RTL, right for LTR)
  const sendBtnRadius = 16;
  const sendBtnX = inputBarX + 26;
  const sendBtnY = inputBarY + inputBarH * 0.5;
  ctx.fillStyle = activeTypingMsg ? userBubbleColor : hexToRgba(userBubbleColor, 0.45);
  ctx.beginPath();
  ctx.arc(sendBtnX, sendBtnY, sendBtnRadius, 0, Math.PI * 2);
  ctx.fill();

  // Simple send arrow inside button
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(sendBtnX + 4, sendBtnY);
  ctx.lineTo(sendBtnX - 5, sendBtnY);
  ctx.moveTo(sendBtnX - 1, sendBtnY - 4);
  ctx.lineTo(sendBtnX - 5, sendBtnY);
  ctx.lineTo(sendBtnX - 1, sendBtnY + 4);
  ctx.stroke();

  // Input bar text region
  const inputTextRightX = inputBarX + inputBarW - 22;
  const inputTextLeftX = sendBtnX + sendBtnRadius + 16;
  const inputAvailW = Math.max(80, inputTextRightX - inputTextLeftX);
  const inputBaseY = inputBarY + inputBarH * 0.5 + 7;

  ctx.save();
  ctx.beginPath();
  ctx.rect(inputTextLeftX, inputBarY + 4, inputAvailW, inputBarH - 8);
  ctx.clip();

  if (activeTypingMsg && activeTypingMsg.inputLineLayout.lines.length > 0) {
    const line = activeTypingMsg.inputLineLayout.lines[0];
    const lineSched = activeTypingMsg.inputTypingSchedule.lines[0];
    const isInputLtr = activeTypingMsg.direction === 'ltr';

    if (line && lineSched) {
      const evalState = evaluateLineTypingAtTime(line, lineSched, t, activeTypingMsg.direction);
      const revealedSpanW = isInputLtr
        ? Math.max(0, evalState.revealedRightX - line.leftX)
        : Math.max(0, line.rightX - evalState.revealedLeftX);

      // Pan horizontally if typed text exceeds input bar width
      const panShift = Math.max(0, revealedSpanW - (inputAvailW - 18));

      applyStudioCanvasTextProps(
        ctx,
        activeTypingMsg.inputLineLayout.fontFamily,
        600,
        activeTypingMsg.inputLineLayout.fontSize,
        activeTypingMsg.direction
      );
      ctx.fillStyle = aiTextColor;

      if (isInputLtr) {
        const originLeft = inputTextLeftX - panShift;
        const clipW = Math.max(0, revealedSpanW);
        ctx.save();
        ctx.beginPath();
        ctx.rect(inputTextLeftX, inputBarY, Math.min(inputAvailW, clipW - panShift), inputBarH);
        ctx.clip();
        for (const w of line.words) {
          const drawRightX = originLeft + (w.x - line.leftX);
          drawBidiWord(ctx, w.text, drawRightX, inputBaseY, 'ltr');
        }
        ctx.restore();

        // Caret cursor
        const caretX = Math.min(inputTextRightX - 4, originLeft + revealedSpanW + 3);
        ctx.fillStyle = userBubbleColor;
        ctx.fillRect(caretX, inputBarY + 12, 2.5, inputBarH - 24);
      } else {
        const originRight = inputTextRightX + panShift;
        const clipLeft = originRight - revealedSpanW;
        ctx.save();
        ctx.beginPath();
        ctx.rect(clipLeft, inputBarY, revealedSpanW + 4, inputBarH);
        ctx.clip();
        for (const w of line.words) {
          const drawRightX = originRight - (line.rightX - w.x);
          drawBidiWord(ctx, w.text, drawRightX, inputBaseY, 'rtl');
        }
        ctx.restore();

        // Caret cursor at RTL leading left edge
        const caretX = Math.max(inputTextLeftX + 4, clipLeft - 4);
        ctx.fillStyle = userBubbleColor;
        ctx.fillRect(caretX, inputBarY + 12, 2.5, inputBarH - 24);
      }
    }
  } else {
    // Idle placeholder inside input bar
    applyStudioCanvasTextProps(ctx, uiFont, 400, 15, 'rtl');
    ctx.textAlign = 'right';
    ctx.fillStyle = secondaryTextColor;
    ctx.fillText('اكتب رسالتك...', inputTextRightX, inputBaseY - 1);
  }

  ctx.restore();
  ctx.restore();
  ctx.restore();
};
