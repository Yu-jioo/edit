import {
  ArabicFontFamily,
  BackgroundMode,
  ChatMessage,
  ChatTimingConfig,
  PixelDensity,
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
  createBufferCanvas,
  getCachedLcdScanlineOverlay,
  getCachedPixelTerminalBackdrop,
  getOrGenerateCachedCanvas,
} from '../utils/assetCache';
import {
  clamp,
  computeChatSchedule,
  DEFAULT_CHAT_MESSAGES,
  DEFAULT_CHAT_TIMING,
  detectTextDirection,
  easeInCubic,
  easeOutCubic,
  easeOutQuart,
  getChatPositionBox,
  hexToRgba,
  lerp,
  progress,
  resolveBackgroundMode,
  ScheduledChatMessage,
} from '../utils/math';
import { combineSeed, deterministicWave, mulberry32 } from '../utils/random';
import {
  applyStudioCanvasTextProps,
  ArabicQuoteLayout,
  computeTypingScheduleForLayout,
  drawBidiWord,
  evaluateLineTypingAtTime,
  layoutArabicQuote,
  LayoutTypingSchedule,
  PositionedLine,
} from '../utils/textLayout';
import { evaluateDeterministicChatScroll } from './chat1Modern';

export const CHAT_TERMINAL_LIGHT_PALETTE: StyleLightPalette = {
  textPrimary: '#D8F3FF',
  textSecondary: '#7CFFB2',
  accent: '#4DD8FF',
  keyword: '#FFB000',
  border: '#4DD8FF',
};

export const CHAT_TERMINAL_CONFIG = {
  id: 'chat_terminal' as const,
  mode: 'chat' as const,
  nameAr: 'تيرمينال',
  nameEn: 'Terminal Chat',
  descriptionAr:
    'محادثة طرفية بأسلوب شاشة CRT وسطر أوامر مع مؤشر تفكير دوّار وإضاءة فوسفورية',
  defaultAccent: '#4DD8FF',
  defaultKeywordColor: '#FFB000',
  defaultQuoteFont: 'Noto Kufi Arabic' as ArabicFontFamily,
  defaultAuthorFont: 'Noto Kufi Arabic' as ArabicFontFamily,
  defaultEnglishQuoteFont: 'Share Tech Mono' as const,
  defaultEnglishAuthorFont: 'Share Tech Mono' as const,
  supportedBackgrounds: ['style', 'black'] as BackgroundMode[],
  recommendedBackground: 'black' as BackgroundMode,
  lightPalette: CHAT_TERMINAL_LIGHT_PALETTE,
  allowedFonts: [
    'Noto Kufi Arabic',
    'Reem Kufi',
    'IBM Plex Sans Arabic',
    'Cairo',
    'Almarai',
    'Almarai Bold',
    'Almarai ExtraBold',
  ] as ArabicFontFamily[],
  colors: {
    bgDarkBlue: '#05070D',
    panelFill: 'rgba(7, 13, 24, 0.88)',
    titleBarFill: 'rgba(13, 25, 43, 0.94)',
    textPrimary: '#D8F3FF',
    userPrompt: '#4DD8FF',
    aiPrefix: '#7CFFB2',
    keywordAmber: '#FFB000',
  },
  cursorBlinkMs: 530,
};

const ASCII_SPINNER_FRAMES = ['|', '/', '-', '\\'];

interface PrelaidTerminalTurn {
  sched: ScheduledChatMessage;
  direction: ResolvedTextDirection;
  fontFamily: string;
  layout: ArabicQuoteLayout;
  typingSchedule: LayoutTypingSchedule;
  slotTopY: number;
  promptRowH: number;
  textTopOffset: number;
  slotBottomY: number;
}

function getCachedChatTerminalLineSprites(
  line: PositionedLine,
  fontFamily: string,
  fontSize: number,
  textColor: string,
  keywordColor: string,
  direction: ResolvedTextDirection = 'rtl'
): {
  crispCanvas: HTMLCanvasElement;
  bloomCanvas: HTMLCanvasElement;
  padX: number;
  padY: number;
  spriteW: number;
  spriteH: number;
} {
  const padX = Math.ceil(fontSize * 0.65);
  const padY = Math.ceil(fontSize * 0.55);
  const lineSpanW = Math.max(16, Math.ceil(line.rightX - line.leftX));
  const lineSpanH = Math.max(16, Math.ceil(line.bottomY - line.topY));
  const spriteW = lineSpanW + padX * 2;
  const spriteH = lineSpanH + padY * 2;
  const baseKey = `chat-term-line|${fontFamily}|${fontSize}|${textColor}|${keywordColor}|${direction}|${line.words
    .map((w) => `${w.text}:${w.isKeyword ? 1 : 0}:${Math.round(w.x - line.leftX)}`)
    .join('_')}`;

  const crispCanvas = getOrGenerateCachedCanvas(`${baseKey}|crisp`, spriteW, spriteH, (sCtx) => {
    applyStudioCanvasTextProps(sCtx, fontFamily, 700, fontSize, direction);
    const baseY = padY + (line.y - line.topY);

    for (const w of line.words) {
      const localRightX = padX + (w.x - line.leftX);
      sCtx.fillStyle = w.isKeyword ? keywordColor : textColor;
      drawBidiWord(sCtx, w.text, localRightX, baseY, direction);
    }
  });

  const bloomCanvas = getOrGenerateCachedCanvas(`${baseKey}|bloom`, spriteW, spriteH, (sCtx) => {
    sCtx.save();
    try {
      sCtx.filter = 'blur(7px)';
    } catch {
      // Ignore if unsupported
    }
    applyStudioCanvasTextProps(sCtx, fontFamily, 700, fontSize, direction);
    const baseY = padY + (line.y - line.topY);

    for (const w of line.words) {
      const localRightX = padX + (w.x - line.leftX);
      sCtx.fillStyle = w.isKeyword ? keywordColor : textColor;
      drawBidiWord(sCtx, w.text, localRightX, baseY, direction);
      if (w.isKeyword) {
        // Extra amber bloom pass on keywords
        drawBidiWord(sCtx, w.text, localRightX, baseY, direction);
      }
    }
    sCtx.restore();
  });

  return { crispCanvas, bloomCanvas, padX, padY, spriteW, spriteH };
}

function buildTerminalChatSceneLayout(
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

  const titleBarH = winBox.effectivePosition === 'fullscreen' ? 44 : 38;
  const padX = Math.max(22, Math.round(winW * 0.045));
  const padY = 18;

  const msgAreaX = winX + padX;
  const msgAreaY = winY + titleBarH + padY;
  const msgAreaW = Math.max(180, winW - padX * 2);
  const msgAreaH = Math.max(140, winH - titleBarH - padY * 2);

  const messages: ChatMessage[] =
    content.chatMessages || custom.chatMessages || DEFAULT_CHAT_MESSAGES;
  const timing: ChatTimingConfig = custom.chatTiming || DEFAULT_CHAT_TIMING;
  const schedule = computeChatSchedule(messages, timing, 'chat_terminal');

  const density: PixelDensity = custom.pixelDensity ?? 2;
  const densityBoost = density === 4 ? 1.12 : density === 3 ? 1.06 : 1.0;

  const baseFontPx = Math.round(
    (winBox.effectivePosition === 'fullscreen'
      ? isHorizontal
        ? 29
        : 26
      : isHorizontal
        ? 25
        : 23) *
      densityBoost *
      clamp(custom.fontSizeMultiplier ?? 1.0, 0.7, 1.3)
  );
  const termFontSize = clamp(baseFontPx, 18, 42);

  const userTypingSpeed = clamp(timing.userTypingSpeed ?? 18, 8, 30);
  const aiReplySpeed = clamp(timing.aiReplySpeed ?? 9, 4, 20);
  // AI reply streamed line-by-line with stepped reveal, faster than user typing
  const aiEquivalentCharsPerSec = clamp(
    Math.max(userTypingSpeed * 1.45, aiReplySpeed * 5.8),
    18,
    90
  );

  const prelaid: PrelaidTerminalTurn[] = [];
  const checkpoints: { time: number; targetScroll: number }[] = [];
  const allKeywordTimes: number[] = [];
  const allKeystrokeTimes: number[] = [];
  const enterKeyTimes: number[] = [];

  let currentSlotY = 0;
  const turnGapY = isHorizontal ? 22 : 18;

  for (let i = 0; i < schedule.items.length; i++) {
    const item = schedule.items[i];
    const msgDir: ResolvedTextDirection =
      custom.textDirection && custom.textDirection !== 'auto'
        ? custom.textDirection
        : detectTextDirection(item.message.text, 'auto');

    const defaultFont =
      msgDir === 'ltr'
        ? CHAT_TERMINAL_CONFIG.defaultEnglishQuoteFont
        : CHAT_TERMINAL_CONFIG.defaultQuoteFont;
    const allowedArabic = CHAT_TERMINAL_CONFIG.allowedFonts;
    let fontFamily: string = custom.quoteFontOverride || defaultFont;
    if (
      msgDir === 'rtl' &&
      custom.quoteFontOverride &&
      !allowedArabic.includes(custom.quoteFontOverride as ArabicFontFamily)
    ) {
      fontFamily = defaultFont;
    }

    // Reserve a dedicated LTR prompt header row above each turn so Arabic right-aligned lines
    // have the full width of msgAreaW and never collide with the LTR prompt.
    const promptRowH = Math.round(termFontSize * 1.15);
    const textTopOffset = promptRowH + 4;

    const layout = layoutArabicQuote(ctx, {
      text: item.message.text,
      quotationMarks: 'none',
      fontFamily,
      fontWeight: 700,
      minFontSize: termFontSize,
      maxFontSize: termFontSize,
      fontSizeMultiplier: 1.0,
      keywordScaleMultiplier: 1.0,
      lineHeightRatio: 1.68,
      boxX: 0,
      boxY: 0,
      boxWidth: msgAreaW,
      boxHeight: 8000,
      align: msgDir === 'ltr' ? 'left' : 'right',
      direction: msgDir,
      verticalAlign: 'top',
    });

    const isUser = item.role === 'user';
    const effectiveSpeed = isUser ? userTypingSpeed : aiEquivalentCharsPerSec;
    const lineGap = isUser ? 0.06 : 0.04;

    const typingSchedule = computeTypingScheduleForLayout(
      ctx,
      layout,
      isUser ? item.typingStart : item.receiveTime,
      effectiveSpeed,
      lineGap
    );

    if (isUser) {
      allKeystrokeTimes.push(...typingSchedule.keystrokeTimes);
      enterKeyTimes.push(item.sendTime);
    }

    allKeywordTimes.push(...typingSchedule.keywordTimes);

    const slotTopY = currentSlotY;
    const slotBottomY = slotTopY + textTopOffset + Math.ceil(layout.totalHeight) + 6;

    // Scroll checkpoint when prompt appears
    const promptAppearTime = isUser ? item.startTime : item.thinkingStart;
    checkpoints.push({
      time: promptAppearTime,
      targetScroll: Math.max(0, slotTopY + promptRowH + layout.lineHeight - msgAreaH),
    });

    // Scroll checkpoints for each line as it starts typing/streaming
    for (let lIdx = 0; lIdx < typingSchedule.lines.length; lIdx++) {
      const lSched = typingSchedule.lines[lIdx];
      const lineBottomInSlot =
        slotTopY + textTopOffset + (lIdx + 1) * layout.lineHeight + 8;
      checkpoints.push({
        time: lSched.startTime,
        targetScroll: Math.max(0, lineBottomInSlot - msgAreaH),
      });
    }

    prelaid.push({
      sched: item,
      direction: msgDir,
      fontFamily,
      layout,
      typingSchedule,
      slotTopY,
      promptRowH,
      textTopOffset,
      slotBottomY,
    });

    currentSlotY = slotBottomY + turnGapY;
  }

  checkpoints.sort((a, b) => a.time - b.time);

  return {
    winBox,
    winX,
    winY,
    winW,
    winH,
    titleBarH,
    msgAreaX,
    msgAreaY,
    msgAreaW,
    msgAreaH,
    termFontSize,
    density,
    schedule,
    prelaid,
    checkpoints,
    allKeywordTimes,
    allKeystrokeTimes,
    enterKeyTimes,
  };
}

let chatTerminalOffscreenBuffer: HTMLCanvasElement | null = null;

export function getChatTerminalEventTimes(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  content: QuoteContent,
  timeline: TimelineConfig,
  custom: StyleCustomization,
  size: RenderSize
): SceneEventTimes {
  void timeline;
  const scene = buildTerminalChatSceneLayout(ctx, content, custom, size);
  return {
    enterStart: scene.schedule.introDuration,
    keywordTimes: scene.allKeywordTimes,
    sendTimes: scene.schedule.sendTimes,
    receiveTimes: scene.schedule.receiveTimes,
    keystrokeTimes: scene.allKeystrokeTimes,
    enterKeyTimes: scene.enterKeyTimes,
    isMechanicalTypewriter: false,
  };
}

export const renderChatTerminal: PureStyleRenderer = (
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
  // Green is disabled for chat_terminal; treat any solid mode as black screen
  const isBlackMode = bgMode === 'black' || bgMode === 'green';

  const scene = buildTerminalChatSceneLayout(ctx, content, custom, size);
  const { schedule, prelaid, checkpoints, density } = scene;

  const userPromptColor =
    custom.accentColor && custom.accentColor !== '#6FA8FF'
      ? custom.accentColor
      : CHAT_TERMINAL_CONFIG.colors.userPrompt;
  const aiPrefixColor = CHAT_TERMINAL_CONFIG.colors.aiPrefix;
  const textColor = CHAT_TERMINAL_CONFIG.colors.textPrimary;
  const keywordColor =
    custom.keywordColor && custom.keywordColor !== '#FFD166'
      ? custom.keywordColor
      : CHAT_TERMINAL_CONFIG.colors.keywordAmber;

  // Power-on window enter (0 -> 0.6s) + CRT Collapse exit (exitStart -> totalDuration)
  const exitP = progress(t, schedule.exitStart, schedule.totalDuration);
  const crtCollapseY =
    exitP <= 0
      ? 1
      : exitP < 0.58
        ? lerp(1, 0.014, easeInCubic(exitP / 0.58))
        : 0.014;
  const crtCollapseX =
    exitP <= 0.58
      ? lerp(1, 1.06, easeOutCubic(exitP / 0.58))
      : lerp(1.06, 0.0, easeInCubic((exitP - 0.58) / 0.42));
  const exitFade = exitP <= 0.55 ? 1 : 1 - easeInCubic((exitP - 0.55) / 0.45);

  const flickerWave = deterministicWave(t, combineSeed(custom.seed, 5501), 19.5);
  const crtFlicker = 0.97 + 0.03 * flickerWave;

  const winEnterP = easeOutQuart(progress(t, 0.04, schedule.introDuration * 0.92));
  let powerOnFlicker = 1;
  if (t >= 0.06 && t < 0.24) {
    const fStep = Math.floor((t - 0.06) * 45);
    powerOnFlicker = fStep % 2 === 0 ? 1 : 0.45;
  }
  const windowAlpha = clamp(winEnterP * powerOnFlicker * exitFade * crtFlicker, 0, 1);

  ctx.save();

  // 1. Background Layer
  if (isBlackMode) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  } else {
    const pushZoom = lerp(
      1.0,
      1.06,
      clamp(t / Math.max(0.1, schedule.totalDuration), 0, 1)
    );
    const backdrop = getCachedPixelTerminalBackdrop(W, H, userPromptColor);

    ctx.save();
    ctx.translate(W * 0.5, H * 0.5);
    ctx.scale(pushZoom, pushZoom);
    ctx.drawImage(backdrop, -W * 0.5, -H * 0.5, W, H);

    const dustRng = mulberry32(combineSeed(custom.seed, 5520));
    ctx.fillStyle = hexToRgba(userPromptColor, 0.2 * exitFade);
    for (let i = 0; i < 20; i++) {
      const bx = (dustRng() - 0.5) * W * 0.88;
      const by = (dustRng() - 0.5) * H * 0.82;
      const driftX = Math.sin(t * (0.4 + dustRng() * 0.5) + i) * 16;
      const driftY = -t * (6 + dustRng() * 10);
      const r = 1 + dustRng() * 1.8;
      ctx.beginPath();
      ctx.arc(bx + driftX, ((by + driftY + H) % H) - H * 0.5, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const scrollOffset = evaluateDeterministicChatScroll(t, checkpoints);

  // 2. Draw Terminal Window + Conversation Turns (Crisp & Bloom passes)
  const drawTerminalScene = (
    targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    drawPass: 'crisp' | 'bloom'
  ) => {
    if (windowAlpha <= 0.005) return;

    const winCenterX = scene.winX + scene.winW * 0.5;
    const winCenterY = scene.winY + scene.winH * 0.5;
    const enterScale = lerp(0.93, 1.0, winEnterP);

    targetCtx.save();
    targetCtx.globalAlpha = windowAlpha;
    targetCtx.translate(winCenterX, winCenterY);
    targetCtx.scale(enterScale * crtCollapseX, enterScale * crtCollapseY);
    targetCtx.translate(-winCenterX, -winCenterY);

    if (drawPass === 'crisp') {
      if (!isBlackMode) {
        targetCtx.fillStyle = CHAT_TERMINAL_CONFIG.colors.panelFill;
        targetCtx.beginPath();
        targetCtx.roundRect(scene.winX, scene.winY, scene.winW, scene.winH, 10);
        targetCtx.fill();

        targetCtx.fillStyle = CHAT_TERMINAL_CONFIG.colors.titleBarFill;
        targetCtx.beginPath();
        targetCtx.roundRect(scene.winX, scene.winY, scene.winW, scene.titleBarH, [
          10,
          10,
          0,
          0,
        ]);
        targetCtx.fill();
      }

      // Cyan window border
      targetCtx.strokeStyle = userPromptColor;
      targetCtx.lineWidth = isBlackMode ? 2.5 : 2;
      targetCtx.beginPath();
      targetCtx.roundRect(scene.winX, scene.winY, scene.winW, scene.winH, 10);
      targetCtx.stroke();

      targetCtx.beginPath();
      targetCtx.moveTo(scene.winX, scene.winY + scene.titleBarH);
      targetCtx.lineTo(scene.winX + scene.winW, scene.winY + scene.titleBarH);
      targetCtx.stroke();

      // Three terminal window dots on the left of the title bar
      const dotY = scene.winY + scene.titleBarH * 0.5;
      const dotColors = isBlackMode
        ? [userPromptColor, keywordColor, textColor]
        : ['#FF5F56', '#FFBD2E', '#27C93F'];
      for (let d = 0; d < 3; d++) {
        targetCtx.fillStyle = dotColors[d];
        targetCtx.beginPath();
        targetCtx.arc(scene.winX + 22 + d * 20, dotY, 5.5, 0, Math.PI * 2);
        targetCtx.fill();
      }

      // Terminal session title in title bar
      targetCtx.save();
      targetCtx.direction = 'ltr';
      targetCtx.textAlign = 'right';
      targetCtx.textBaseline = 'middle';
      targetCtx.font = `600 14px "Share Tech Mono", monospace`;
      targetCtx.fillStyle = hexToRgba(userPromptColor, 0.85);
      targetCtx.fillText('session: ai-chat // tty1', scene.winX + scene.winW - 18, dotY);
      targetCtx.restore();
    } else {
      targetCtx.strokeStyle = hexToRgba(userPromptColor, 0.35);
      targetCtx.lineWidth = 6;
      targetCtx.beginPath();
      targetCtx.roundRect(scene.winX, scene.winY, scene.winW, scene.winH, 10);
      targetCtx.stroke();
    }

    // Clip to scrollable terminal message area
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(scene.msgAreaX - 6, scene.msgAreaY, scene.msgAreaW + 12, scene.msgAreaH);
    targetCtx.clip();

    let cursorX: number | null = null;
    let cursorTopY = 0;
    let cursorH = scene.termFontSize;
    let cursorColor = userPromptColor;
    let isActivelyTypingNow = false;

    for (let i = 0; i < prelaid.length; i++) {
      const turn = prelaid[i];
      const item = turn.sched;
      const isUser = item.role === 'user';

      const turnAppearTime = isUser ? item.startTime : item.thinkingStart;
      if (t < turnAppearTime) {
        // Show waiting cursor on first turn before typing starts
        if (i === 0 && t >= 0.15 && cursorX === null) {
          cursorX =
            turn.direction === 'ltr'
              ? scene.msgAreaX
              : scene.msgAreaX + scene.msgAreaW;
          cursorTopY =
            scene.msgAreaY + turn.slotTopY + turn.textTopOffset + turn.layout.fontSize * 0.1;
          cursorH = turn.layout.fontSize * 0.92;
        }
        continue;
      }

      const drawSlotTopY = scene.msgAreaY + turn.slotTopY - scrollOffset;
      const drawSlotBottomY = scene.msgAreaY + turn.slotBottomY - scrollOffset;

      if (
        drawSlotBottomY < scene.msgAreaY - 30 ||
        drawSlotTopY > scene.msgAreaY + scene.msgAreaH + 30
      ) {
        continue;
      }

      // Fade older content near top edge in 'style' mode (hard clip in black mode)
      let topEdgeAlpha = 1.0;
      if (!isBlackMode && scrollOffset > 2) {
        const distFromTop = drawSlotTopY - scene.msgAreaY;
        if (distFromTop < 28) {
          topEdgeAlpha = clamp((distFromTop + 28) / 56, 0.15, 1.0);
        }
      }

      targetCtx.save();
      targetCtx.globalAlpha *= topEdgeAlpha;

      // 1. Draw LTR Prompt Header ("you@ai:~$" in #4DD8FF or "ai>" in #7CFFB2)
      const promptBaseY = drawSlotTopY + Math.round(turn.promptRowH * 0.78);
      const promptFontPx = Math.max(15, Math.round(scene.termFontSize * 0.76));

      targetCtx.save();
      targetCtx.direction = 'ltr';
      targetCtx.textAlign = 'left';
      targetCtx.textBaseline = 'alphabetic';
      targetCtx.font = `700 ${promptFontPx}px "Share Tech Mono", monospace`;

      if (isUser) {
        targetCtx.fillStyle = userPromptColor;
        targetCtx.fillText('you@ai:~$', scene.msgAreaX, promptBaseY);
      } else {
        targetCtx.fillStyle = aiPrefixColor;
        if (t < item.receiveTime) {
          // ASCII Spinner during thinking delay: "thinking... | / - \" at 8 fps
          const frameIdx = Math.floor(t * 8) % ASCII_SPINNER_FRAMES.length;
          const spinnerChar = ASCII_SPINNER_FRAMES[frameIdx];
          targetCtx.fillText(
            `ai> thinking... ${spinnerChar}`,
            scene.msgAreaX,
            promptBaseY
          );
        } else {
          targetCtx.fillText('ai>', scene.msgAreaX, promptBaseY);
        }
      }
      targetCtx.restore();

      // If AI turn is still in thinking delay, don't draw reply lines yet
      if (!isUser && t < item.receiveTime) {
        targetCtx.restore();
        continue;
      }

      // 2. Stepped Line Reveal for Message Content
      const textOriginX = scene.msgAreaX;
      const textOriginY = drawSlotTopY + turn.textTopOffset;
      const isTurnLtr = turn.direction === 'ltr';

      for (let lIdx = 0; lIdx < turn.layout.lines.length; lIdx++) {
        const line = turn.layout.lines[lIdx];
        const lineSched = turn.typingSchedule.lines[lIdx];
        if (!lineSched) continue;

        const evalState = evaluateLineTypingAtTime(line, lineSched, t, turn.direction);
        if (!evalState.hasStarted) {
          continue;
        }

        const sprites = getCachedChatTerminalLineSprites(
          line,
          turn.fontFamily,
          turn.layout.fontSize,
          textColor,
          keywordColor,
          turn.direction
        );

        const spriteDrawX = textOriginX + line.leftX - sprites.padX;
        const spriteDrawY = textOriginY + line.topY - sprites.padY;

        let clipLeftX: number;
        let clipW: number;

        if (isTurnLtr) {
          clipLeftX = spriteDrawX;
          const edgeX = evalState.isFinished
            ? textOriginX + line.rightX + sprites.padX
            : textOriginX + Math.ceil(evalState.revealedRightX);
          clipW = Math.max(0, edgeX - clipLeftX);
        } else {
          clipLeftX = evalState.isFinished
            ? spriteDrawX
            : textOriginX + Math.floor(evalState.revealedLeftX);
          const clipRightX = textOriginX + line.rightX + sprites.padX;
          clipW = Math.max(0, clipRightX - clipLeftX);
        }

        if (clipW > 0) {
          targetCtx.save();
          targetCtx.beginPath();
          targetCtx.rect(clipLeftX, spriteDrawY, clipW, sprites.spriteH);
          targetCtx.clip();

          if (drawPass === 'crisp') {
            targetCtx.drawImage(sprites.crispCanvas, spriteDrawX, spriteDrawY);
          } else {
            targetCtx.drawImage(sprites.bloomCanvas, spriteDrawX, spriteDrawY);
          }
          targetCtx.restore();
        }

        // Extra keyword bloom bar once keyword finishes typing
        if (drawPass === 'bloom') {
          for (let rIdx = 0; rIdx < turn.layout.keywordLineRects.length; rIdx++) {
            const rect = turn.layout.keywordLineRects[rIdx];
            if (rect.lineIndex !== lIdx) continue;
            const finishT = turn.typingSchedule.rectFinishTimes[rIdx] ?? item.startTime;
            if (t >= finishT) {
              const pulse = 1 - 0.35 * progress(t, finishT, finishT + 0.45);
              targetCtx.save();
              targetCtx.globalAlpha *= 0.48 * pulse;
              targetCtx.fillStyle = keywordColor;
              targetCtx.fillRect(
                textOriginX + rect.leftX - 4,
                textOriginY + rect.baselineY + turn.layout.fontSize * 0.12,
                rect.width + 8,
                Math.max(3, turn.layout.fontSize * 0.08)
              );
              targetCtx.restore();
            }
          }
        }

        // Track active cursor position
        const nextLineSched =
          lIdx + 1 < turn.typingSchedule.lines.length
            ? turn.typingSchedule.lines[lIdx + 1]
            : null;
        const nextLineStarted = nextLineSched ? t >= nextLineSched.startTime : false;
        const nextTurn = i + 1 < prelaid.length ? prelaid[i + 1] : null;
        const nextTurnStarted = nextTurn
          ? t >=
            (nextTurn.sched.role === 'user'
              ? nextTurn.sched.startTime
              : nextTurn.sched.thinkingStart)
          : false;

        if ((!evalState.isFinished || !nextLineStarted) && !nextTurnStarted) {
          cursorX =
            textOriginX +
            (isTurnLtr ? evalState.revealedRightX : evalState.revealedLeftX);
          cursorTopY = textOriginY + line.y - turn.layout.fontSize * 0.82;
          cursorH = turn.layout.fontSize * 0.94;
          cursorColor = isUser ? userPromptColor : aiPrefixColor;
          isActivelyTypingNow = !evalState.isFinished && t <= lineSched.endTime + 0.05;
        }
      }

      targetCtx.restore();
    }

    // 3. Solid Block Cursor (blinks at 530ms when idle, solid while typing)
    if (cursorX !== null && exitP < 0.25) {
      const blinkOn =
        isActivelyTypingNow ||
        Math.floor((t * 1000) / CHAT_TERMINAL_CONFIG.cursorBlinkMs) % 2 === 0;
      if (blinkOn) {
        const cursorW = Math.max(9, Math.round(scene.termFontSize * 0.42));
        const cx = Math.round(cursorX - cursorW - 3);
        const cy = Math.round(cursorTopY);
        targetCtx.save();
        targetCtx.fillStyle = cursorColor;
        if (drawPass === 'bloom') {
          targetCtx.globalAlpha *= 0.55;
          targetCtx.fillRect(cx - 3, cy - 3, cursorW + 6, cursorH + 6);
        } else {
          targetCtx.fillRect(cx, cy, cursorW, cursorH);
        }
        targetCtx.restore();
      }
    }

    targetCtx.restore();

    // Phosphor horizontal flash line during CRT exit collapse
    if (exitP > 0.2 && exitP < 0.92 && drawPass === 'crisp') {
      const flashAlpha = Math.sin(progress(exitP, 0.2, 0.92) * Math.PI);
      targetCtx.save();
      targetCtx.fillStyle = '#FFFFFF';
      targetCtx.globalAlpha = flashAlpha * 0.9;
      targetCtx.fillRect(scene.winX, winCenterY - 2, scene.winW, 4);
      targetCtx.restore();
    }

    targetCtx.restore();
  };

  if (density > 1) {
    const lowW = Math.max(64, Math.ceil(W / density));
    const lowH = Math.max(64, Math.ceil(H / density));
    if (!chatTerminalOffscreenBuffer) {
      chatTerminalOffscreenBuffer = createBufferCanvas(lowW, lowH);
    } else if (
      chatTerminalOffscreenBuffer.width !== lowW ||
      chatTerminalOffscreenBuffer.height !== lowH
    ) {
      chatTerminalOffscreenBuffer.width = lowW;
      chatTerminalOffscreenBuffer.height = lowH;
    }

    const pCtx = chatTerminalOffscreenBuffer.getContext('2d');
    if (pCtx) {
      pCtx.save();
      pCtx.clearRect(0, 0, lowW, lowH);
      pCtx.scale(1 / density, 1 / density);
      drawTerminalScene(pCtx, 'crisp');
      pCtx.restore();

      ctx.save();
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(chatTerminalOffscreenBuffer, 0, 0, lowW, lowH, 0, 0, W, H);
      ctx.imageSmoothingEnabled = prevSmooth;
      ctx.restore();
    }
  } else {
    drawTerminalScene(ctx, 'crisp');
  }

  // Bloom overlay ('lighter', low alpha — allowed in both style and black mode)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.42 * exitFade;
  drawTerminalScene(ctx, 'bloom');
  ctx.restore();

  // Style mode only: LCD/scanline overlay + sliding letterbox bars
  if (!isBlackMode) {
    const lcdOverlay = getCachedLcdScanlineOverlay(W, H, density);
    ctx.save();
    ctx.globalAlpha = 0.52 * windowAlpha;
    ctx.drawImage(lcdOverlay, 0, 0, W, H);
    ctx.restore();

    const barEnter = easeOutCubic(progress(t, 0, 0.35));
    const barExit = 1 - easeInCubic(progress(t, schedule.exitStart, schedule.totalDuration));
    const barFactor = barEnter * barExit;
    const maxBarH = Math.round(H * 0.05);
    const barH = Math.round(maxBarH * barFactor);
    if (barH > 0) {
      ctx.fillStyle = '#020306';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
    }
  }

  ctx.restore();
};
