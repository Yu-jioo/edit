import { QuotationMarkStyle, ResolvedTextDirection } from '../types';
import { clamp } from './math';

export interface KeywordWordToken {
  text: string;
  isKeyword: boolean;
  groupId: number | null;
}

export interface ParsedKeywordResult {
  cleanText: string;
  paragraphs: KeywordWordToken[][];
  flatTokens: KeywordWordToken[];
  keywordGroups: string[];
  unmatchedAsteriskWarning: boolean;
}

export interface PositionedWord {
  text: string;
  x: number; // In canvas with textAlign = 'right', right edge of the word bounding box
  y: number; // Baseline Y coordinate
  width: number;
  fontSize: number;
  scaleMultiplier: number;
  isKeyword: boolean;
  groupId: number | null;
  lineIndex: number;
  wordIndexInLine: number;
  globalWordIndex: number;
}

export interface PositionedLine {
  lineIndex: number;
  text: string;
  words: PositionedWord[];
  width: number;
  y: number; // Baseline Y coordinate
  topY: number;
  bottomY: number;
  rightX: number; // Right edge X coordinate
  leftX: number; // Left edge X coordinate
}

export interface KeywordLineRect {
  groupId: number;
  lineIndex: number;
  rightX: number;
  leftX: number;
  width: number;
  topY: number;
  bottomY: number;
  baselineY: number;
  words: PositionedWord[];
}

export interface ArabicQuoteLayout {
  fontFamily: string;
  fontWeight: number | string;
  fontSize: number;
  lineHeight: number; // pixel line height
  lineHeightRatio: number;
  lines: PositionedLine[];
  words: PositionedWord[];
  keywordLineRects: KeywordLineRect[];
  keywordGroups: string[];
  unmatchedAsteriskWarning: boolean;
  totalHeight: number;
  maxLineWidth: number;
  align: 'right' | 'center' | 'left';
  direction: ResolvedTextDirection;
  boxX: number; // Left edge of safe bounding box
  boxY: number; // Top edge of vertically centered text block
  boxWidth: number;
}

export interface LayoutRequest {
  text: string;
  quotationMarks: QuotationMarkStyle;
  fontFamily: string;
  fontWeight: number | string;
  minFontSize: number;
  maxFontSize: number;
  fontSizeMultiplier: number; // 0.7 to 1.3
  keywordScaleMultiplier?: number; // e.g., 1.32 for Punch Words style
  lineHeightRatio: number; // 1.65 to 1.85
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  align: 'right' | 'center' | 'left';
  direction?: ResolvedTextDirection;
  verticalAlign?: 'center' | 'top';
}

export interface BidiRun {
  text: string;
  direction: ResolvedTextDirection;
}

const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_OR_CODE_RE = /[A-Za-z0-9=+\-*/<>_{}[\]()$#@%&~^`|\\]/;

/**
 * Determines the intrinsic direction of a single word token.
 * Arabic script is always 'rtl'. Latin letters, ASCII digits, and code tokens without Arabic are 'ltr'.
 */
export function getWordIntrinsicDirection(
  wordText: string,
  baseDirection: ResolvedTextDirection = 'rtl'
): ResolvedTextDirection {
  if (ARABIC_SCRIPT_RE.test(wordText)) {
    return 'rtl';
  }
  if (LATIN_OR_CODE_RE.test(wordText)) {
    return 'ltr';
  }
  return baseDirection;
}

/**
 * Segments a string into directional runs (RTL vs LTR) without ever splitting Arabic letters.
 */
export function segmentTextIntoBidiRuns(
  text: string,
  baseDirection: ResolvedTextDirection = 'rtl'
): BidiRun[] {
  if (!text) return [];
  const runs: BidiRun[] = [];
  let currentText = '';
  let currentDir: ResolvedTextDirection | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    let chDir: ResolvedTextDirection | 'neutral' = 'neutral';
    if (ARABIC_SCRIPT_RE.test(ch)) {
      chDir = 'rtl';
    } else if (/[A-Za-z0-9]/.test(ch)) {
      chDir = 'ltr';
    }

    const resolvedCharDir: ResolvedTextDirection =
      chDir === 'neutral' ? (currentDir ?? baseDirection) : chDir;

    if (currentDir === null) {
      currentDir = resolvedCharDir;
      currentText = ch;
    } else if (resolvedCharDir === currentDir) {
      currentText += ch;
    } else {
      runs.push({ text: currentText, direction: currentDir });
      currentDir = resolvedCharDir;
      currentText = ch;
    }
  }

  if (currentText && currentDir) {
    runs.push({ text: currentText, direction: currentDir });
  }

  return runs;
}

/**
 * Draws a single word token at `rightX, baselineY` (assuming textAlign = 'right' semantics)
 * while preserving exact bidi direction for Latin words, numbers, short code, and mixed tokens,
 * and never splitting Arabic characters.
 */
export function drawBidiWord(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  wordText: string,
  rightX: number,
  baselineY: number,
  baseDirection: ResolvedTextDirection = 'rtl'
): void {
  if (!wordText) return;
  const runs = segmentTextIntoBidiRuns(wordText, baseDirection);
  const prevDir = ctx.direction;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'right';

  if (runs.length <= 1) {
    const dir = runs[0]?.direction ?? getWordIntrinsicDirection(wordText, baseDirection);
    ctx.direction = dir;
    ctx.fillText(wordText, rightX, baselineY);
    ctx.direction = prevDir;
    ctx.textAlign = prevAlign;
    return;
  }

  // Multi-run single token (e.g. Arabic prefix attached to Latin/number token):
  // Measure each run intact (never splitting Arabic letters) and place along baseDirection.
  const runWidths = runs.map((r) => {
    ctx.direction = r.direction;
    return ctx.measureText(r.text).width;
  });
  const totalRunW = runWidths.reduce((a, b) => a + b, 0);

  if (baseDirection === 'rtl') {
    let cursorRight = rightX;
    for (let i = 0; i < runs.length; i++) {
      ctx.direction = runs[i].direction;
      ctx.fillText(runs[i].text, cursorRight, baselineY);
      cursorRight -= runWidths[i];
    }
  } else {
    let cursorLeft = rightX - totalRunW;
    for (let i = 0; i < runs.length; i++) {
      ctx.direction = runs[i].direction;
      const rRight = cursorLeft + runWidths[i];
      ctx.fillText(runs[i].text, rRight, baselineY);
      cursorLeft = rRight;
    }
  }

  ctx.direction = prevDir;
  ctx.textAlign = prevAlign;
}

const layoutCache = new Map<string, ArabicQuoteLayout>();

const LITERAL_ASTERISK_PLACEHOLDER = '\uE000';

/**
 * Parses text containing `*keyword*` markers into word tokens `{ text, isKeyword, groupId }`.
 * - Single `*...*` pairs mark keyword groups (multi-word inside `*...*` share the same groupId).
 * - Escaped `\*` renders a literal `*` and never triggers keyword mode.
 * - Unmatched `*` is ignored (never drawn) and flags `unmatchedAsteriskWarning = true`.
 * - Preserves all Arabic tashkeel / diacritics.
 */
export function parseKeywordMarkup(rawText: string): ParsedKeywordResult {
  if (!rawText) {
    return {
      cleanText: '',
      paragraphs: [],
      flatTokens: [],
      keywordGroups: [],
      unmatchedAsteriskWarning: false,
    };
  }

  // 1. Replace escaped \* with private-use placeholder
  const escaped = rawText.replace(/\\\*/g, LITERAL_ASTERISK_PLACEHOLDER);

  // 2. Locate all unescaped asterisk indices
  const starIndices: number[] = [];
  for (let i = 0; i < escaped.length; i++) {
    if (escaped[i] === '*') {
      starIndices.push(i);
    }
  }

  let unmatchedAsteriskWarning = false;
  let working = escaped;

  if (starIndices.length % 2 === 1) {
    unmatchedAsteriskWarning = true;
    // Ignore the last unmatched asterisk by removing it
    const lastIdx = starIndices[starIndices.length - 1];
    working = escaped.slice(0, lastIdx) + escaped.slice(lastIdx + 1);
  }

  // 3. Parse matched *...* spans across the string
  interface Span {
    text: string;
    isKeyword: boolean;
    groupId: number | null;
  }

  const spans: Span[] = [];
  const keywordGroups: string[] = [];
  let inKeyword = false;
  let currentGroupId: number | null = null;
  let buffer = '';

  const flushBuffer = () => {
    if (!buffer) return;
    const restored = buffer.replace(new RegExp(LITERAL_ASTERISK_PLACEHOLDER, 'g'), '*');
    spans.push({
      text: restored,
      isKeyword: inKeyword,
      groupId: inKeyword ? currentGroupId : null,
    });
    if (inKeyword && currentGroupId !== null) {
      const cleanedGroup = restored.trim().replace(/\s+/g, ' ');
      if (cleanedGroup) {
        keywordGroups[currentGroupId] = keywordGroups[currentGroupId]
          ? `${keywordGroups[currentGroupId]} ${cleanedGroup}`
          : cleanedGroup;
      }
    }
    buffer = '';
  };

  for (let i = 0; i < working.length; i++) {
    const ch = working[i];
    if (ch === '*') {
      flushBuffer();
      if (!inKeyword) {
        inKeyword = true;
        currentGroupId = keywordGroups.length;
        keywordGroups.push('');
      } else {
        inKeyword = false;
        currentGroupId = null;
      }
    } else {
      buffer += ch;
    }
  }
  flushBuffer();

  // Filter out empty keyword groups (e.g. `**`)
  const validGroupMap = new Map<number, number>();
  const finalKeywordGroups: string[] = [];
  keywordGroups.forEach((g, idx) => {
    const t = g.trim();
    if (t) {
      validGroupMap.set(idx, finalKeywordGroups.length);
      finalKeywordGroups.push(t);
    }
  });

  // 4. Reconstruct paragraphs and tokenize by whitespace while preserving span membership
  // Build a character-level map of groupId for each character in the star-stripped string
  let fullClean = '';
  const charGroupIds: (number | null)[] = [];

  for (const span of spans) {
    const mappedGroup =
      span.isKeyword && span.groupId !== null && validGroupMap.has(span.groupId)
        ? validGroupMap.get(span.groupId)!
        : null;
    for (let i = 0; i < span.text.length; i++) {
      fullClean += span.text[i];
      charGroupIds.push(mappedGroup);
    }
  }

  const paragraphs: KeywordWordToken[][] = [];
  const flatTokens: KeywordWordToken[] = [];

  let charIdx = 0;
  const rawParas = fullClean.split(/\r?\n/);

  for (let pIdx = 0; pIdx < rawParas.length; pIdx++) {
    const pText = rawParas[pIdx];
    const pStart = charIdx;
    const pTokens: KeywordWordToken[] = [];

    let wStart = -1;
    for (let i = 0; i <= pText.length; i++) {
      const ch = i < pText.length ? pText[i] : ' ';
      const isSpace = /\s/.test(ch);
      if (!isSpace && wStart === -1) {
        wStart = i;
      } else if (isSpace && wStart !== -1) {
        const wordStr = pText.slice(wStart, i);
        // Check if any character in this word belongs to a keyword group
        let wordGroup: number | null = null;
        for (let k = wStart; k < i; k++) {
          const g = charGroupIds[pStart + k];
          if (g !== null) {
            wordGroup = g;
            break;
          }
        }
        const token: KeywordWordToken = {
          text: wordStr,
          isKeyword: wordGroup !== null,
          groupId: wordGroup,
        };
        pTokens.push(token);
        flatTokens.push(token);
        wStart = -1;
      }
    }

    if (pTokens.length > 0) {
      paragraphs.push(pTokens);
    }

    // Advance charIdx past paragraph + newline character(s)
    charIdx += pText.length;
    if (fullClean[charIdx] === '\r') charIdx++;
    if (fullClean[charIdx] === '\n') charIdx++;
  }

  return {
    cleanText: fullClean,
    paragraphs,
    flatTokens,
    keywordGroups: finalKeywordGroups,
    unmatchedAsteriskWarning,
  };
}

/**
 * Formats the quote string with optional quotation marks without altering any text or diacritics.
 * In LTR (English), uses curly double quotes “ ” when 'double' is selected.
 */
export function formatQuoteWithMarks(
  text: string,
  marks: QuotationMarkStyle,
  direction: ResolvedTextDirection = 'rtl'
): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (marks === 'guillemets') {
    return direction === 'ltr' ? `“${trimmed}”` : `«${trimmed}»`;
  }
  if (marks === 'double') {
    return direction === 'ltr' ? `“${trimmed}”` : `"${trimmed}"`;
  }
  return trimmed;
}

export interface FontCalibrationProfile {
  sizeScale: number;
  lineHeightBonus: number;
  minLineHeightRatio: number;
  spaceRatio: number;
  baselineOffsetRatio: number;
  keywordRectTopFactor: number;
  keywordRectBottomFactor: number;
  preferredWeight: number | null;
  fallbackChain: string | null;
}

const DEFAULT_FONT_CALIBRATION: FontCalibrationProfile = {
  sizeScale: 1.0,
  lineHeightBonus: 0,
  minLineHeightRatio: 0,
  spaceRatio: 0.31,
  baselineOffsetRatio: 0,
  keywordRectTopFactor: 0.88,
  keywordRectBottomFactor: 0.28,
  preferredWeight: null,
  fallbackChain: null,
};

/**
 * Returns SFNT-calibrated optical scaling, spacing, weight, baseline, and fallback metrics
 * for custom self-hosted fonts and high-contrast display faces so text never clips, overlaps,
 * or triggers synthetic faux-bolding.
 */
export function getFontCalibration(fontFamily: string): FontCalibrationProfile {
  if (fontFamily === 'KOMission Black') {
    return {
      sizeScale: 0.88,
      lineHeightBonus: 0.14,
      minLineHeightRatio: 1.76,
      spaceRatio: 0.37,
      baselineOffsetRatio: 0.22,
      keywordRectTopFactor: 1.04,
      keywordRectBottomFactor: 0.36,
      preferredWeight: 900,
      fallbackChain: '"Cairo", "Noto Naskh Arabic", sans-serif',
    };
  }
  if (fontFamily === 'Zain Rounded instance mob') {
    return {
      sizeScale: 1.03,
      lineHeightBonus: 0.02,
      minLineHeightRatio: 1.56,
      spaceRatio: 0.33,
      baselineOffsetRatio: 0.08,
      keywordRectTopFactor: 0.86,
      keywordRectBottomFactor: 0.28,
      preferredWeight: 400,
      fallbackChain: '"Zain", "Cairo", "Noto Naskh Arabic", sans-serif',
    };
  }
  if (
    fontFamily === '29LT Azahar Display AL TN Trial Bold' ||
    fontFamily === '29LT Azahar AL VF TN Trial Display Light'
  ) {
    return {
      sizeScale: 0.96,
      lineHeightBonus: 0.13,
      minLineHeightRatio: 1.74,
      spaceRatio: 0.36,
      baselineOffsetRatio: 0.16,
      keywordRectTopFactor: 0.98,
      keywordRectBottomFactor: 0.38,
      preferredWeight: 700,
      fallbackChain: '"Amiri", "Noto Naskh Arabic", sans-serif',
    };
  }
  if (
    fontFamily === 'Reem Kufi' ||
    fontFamily === 'Aref Ruqaa' ||
    fontFamily === 'Aref Ruqaa Ink' ||
    fontFamily === 'Lalezar' ||
    fontFamily === 'Rakkas'
  ) {
    return {
      ...DEFAULT_FONT_CALIBRATION,
      spaceRatio: 0.38,
    };
  }
  return DEFAULT_FONT_CALIBRATION;
}

/**
 * Resolves virtual weight-specific font identifiers (e.g. 'Almarai Bold', 'Almarai ExtraBold')
 * and single-master custom faces into their exact CSS font-family name and numeric font-weight.
 */
export function resolveStudioFontSpec(
  fontFamily: string,
  fontWeight: number | string
): { cssFontFamily: string; cssFontWeight: number | string } {
  if (fontFamily === 'Almarai ExtraBold') {
    return { cssFontFamily: 'Almarai', cssFontWeight: 800 };
  }
  if (fontFamily === 'Almarai Bold') {
    return { cssFontFamily: 'Almarai', cssFontWeight: 700 };
  }
  if (fontFamily === 'Almarai') {
    return { cssFontFamily: 'Almarai', cssFontWeight: 400 };
  }
  if (
    fontFamily === '29LT Azahar AL VF TN Trial Display Light' ||
    fontFamily === '29LT Azahar Display AL TN Trial Bold'
  ) {
    return {
      cssFontFamily: '29LT Azahar Display AL TN Trial Bold',
      cssFontWeight: 700,
    };
  }
  const cal = getFontCalibration(fontFamily);
  if (cal.preferredWeight !== null) {
    return { cssFontFamily: fontFamily, cssFontWeight: cal.preferredWeight };
  }
  return { cssFontFamily: fontFamily, cssFontWeight: fontWeight };
}

/**
 * Applies required canvas text properties for Arabic or Latin scripts.
 */
export function applyStudioCanvasTextProps(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  fontFamily: string,
  fontWeight: number | string,
  fontSize: number,
  direction: ResolvedTextDirection = 'rtl'
) {
  ctx.direction = direction;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D).letterSpacing = '0px';
  }
  if ('fontKerning' in ctx) {
    (ctx as CanvasRenderingContext2D).fontKerning = 'normal';
  }
  if ('textRendering' in ctx) {
    (ctx as CanvasRenderingContext2D).textRendering = 'optimizeLegibility';
  }
  const { cssFontFamily, cssFontWeight } = resolveStudioFontSpec(fontFamily, fontWeight);
  const cal = getFontCalibration(fontFamily);
  const fallback =
    cal.fallbackChain ||
    (direction === 'ltr' ? 'sans-serif' : '"Noto Naskh Arabic", sans-serif');
  ctx.font = `${cssFontWeight} ${Math.round(fontSize)}px "${cssFontFamily}", ${fallback}`;
}

export const applyArabicCanvasTextProps = applyStudioCanvasTextProps;

interface MeasuredWordToken {
  text: string;
  width: number;
  fontSize: number;
  scaleMultiplier: number;
  isKeyword: boolean;
  groupId: number | null;
}

/**
 * Wraps paragraphs and words into lines for a given fontSize and measures each word's width,
 * accounting for per-word keywordScaleMultiplier and text direction.
 */
function wrapWordsAtFontSize(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  paragraphs: KeywordWordToken[][],
  fontFamily: string,
  fontWeight: number | string,
  fontSize: number,
  keywordScaleMultiplier: number,
  maxWidth: number,
  direction: ResolvedTextDirection = 'rtl'
): {
  rawLines: { words: MeasuredWordToken[]; width: number; maxWordScale: number }[];
  spaceWidth: number;
  maxLineWidth: number;
} {
  applyStudioCanvasTextProps(ctx, fontFamily, fontWeight, fontSize, direction);

  const isLtr = direction === 'ltr';
  const spaceMeasure = ctx.measureText(' ').width;
  const cal = getFontCalibration(fontFamily);
  const spaceWidth = isLtr
    ? Math.max(spaceMeasure * 1.05, fontSize * Math.max(0.24, cal.spaceRatio - 0.06))
    : Math.max(spaceMeasure * 1.15, fontSize * cal.spaceRatio);

  const rawLines: { words: MeasuredWordToken[]; width: number; maxWordScale: number }[] = [];
  let maxLineWidth = 0;

  for (const paraTokens of paragraphs) {
    if (paraTokens.length === 0) continue;

    let currentWords: MeasuredWordToken[] = [];
    let currentWidth = 0;
    let currentMaxScale = 1.0;

    for (const token of paraTokens) {
      const scaleMult = token.isKeyword ? keywordScaleMultiplier : 1.0;
      const wordFontSize = Math.round(fontSize * scaleMult);
      if (scaleMult !== 1.0) {
        applyStudioCanvasTextProps(ctx, fontFamily, fontWeight, wordFontSize, direction);
      } else {
        applyStudioCanvasTextProps(ctx, fontFamily, fontWeight, fontSize, direction);
      }
      const wordWidth = ctx.measureText(token.text).width;

      const measured: MeasuredWordToken = {
        text: token.text,
        width: wordWidth,
        fontSize: wordFontSize,
        scaleMultiplier: scaleMult,
        isKeyword: token.isKeyword,
        groupId: token.groupId,
      };

      if (currentWords.length === 0) {
        currentWords.push(measured);
        currentWidth = wordWidth;
        currentMaxScale = scaleMult;
      } else if (currentWidth + spaceWidth + wordWidth <= maxWidth) {
        currentWords.push(measured);
        currentWidth += spaceWidth + wordWidth;
        if (scaleMult > currentMaxScale) currentMaxScale = scaleMult;
      } else {
        rawLines.push({ words: currentWords, width: currentWidth, maxWordScale: currentMaxScale });
        if (currentWidth > maxLineWidth) maxLineWidth = currentWidth;
        currentWords = [measured];
        currentWidth = wordWidth;
        currentMaxScale = scaleMult;
      }
    }

    if (currentWords.length > 0) {
      rawLines.push({ words: currentWords, width: currentWidth, maxWordScale: currentMaxScale });
      if (currentWidth > maxLineWidth) maxLineWidth = currentWidth;
    }
  }

  return { rawLines, spaceWidth, maxLineWidth };
}

/**
 * Computes and caches the bidirectional text layout using binary search on font size
 * so that the quote/phrase always fits comfortably inside (boxWidth, boxHeight).
 * Also returns keywordLineRects (one rect per line per keyword group) for multi-line keywords.
 */
export function layoutArabicQuote(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  req: LayoutRequest
): ArabicQuoteLayout {
  const direction: ResolvedTextDirection = req.direction ?? 'rtl';
  const keywordScaleMultiplier = req.keywordScaleMultiplier ?? 1.0;
  const fontSizeMultiplier = req.fontSizeMultiplier ?? 1.0;
  const baseLineHeightRatio = req.lineHeightRatio ?? 1.6;
  const cal = getFontCalibration(req.fontFamily);
  const effectiveLineHeightRatio = Math.max(
    baseLineHeightRatio + cal.lineHeightBonus,
    cal.minLineHeightRatio
  );
  const scaledMinFont = Math.max(12, Math.round(req.minFontSize * cal.sizeScale));
  const scaledMaxFont = Math.max(scaledMinFont, Math.round(req.maxFontSize * cal.sizeScale));
  const isFixedFontSize = req.minFontSize === req.maxFontSize;
  const formattedWithMarks = formatQuoteWithMarks(req.text, req.quotationMarks, direction);
  const verticalAlign = req.verticalAlign ?? 'center';
  const formattingKey = [
    formattedWithMarks,
    req.fontFamily,
    req.fontWeight,
    scaledMinFont,
    scaledMaxFont,
    fontSizeMultiplier.toFixed(2),
    keywordScaleMultiplier.toFixed(2),
    effectiveLineHeightRatio.toFixed(2),
    cal.baselineOffsetRatio.toFixed(2),
    Math.round(req.boxX),
    Math.round(req.boxY),
    Math.round(req.boxWidth),
    Math.round(req.boxHeight),
    req.align,
    direction,
    verticalAlign,
  ].join('|');

  const cached = layoutCache.get(formattingKey);
  if (cached) {
    return cached;
  }

  const parsed = parseKeywordMarkup(formattedWithMarks);

  ctx.save();

  // Binary search for largest font size in [scaledMinFont, scaledMaxFont] that fits boxWidth & boxHeight
  let low = isFixedFontSize ? scaledMinFont : Math.max(18, Math.round(scaledMinFont * 0.75));
  let high = scaledMaxFont;
  let bestSize = low;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const { rawLines, maxLineWidth } = wrapWordsAtFontSize(
      ctx,
      parsed.paragraphs,
      req.fontFamily,
      req.fontWeight,
      mid,
      keywordScaleMultiplier,
      req.boxWidth,
      direction
    );
    const lineHeight = mid * effectiveLineHeightRatio;
    const totalHeight = rawLines.length * lineHeight;

    const fitsWidth = maxLineWidth <= req.boxWidth * 1.01;
    const fitsHeight = totalHeight <= req.boxHeight;

    if (fitsWidth && fitsHeight) {
      bestSize = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Apply user's manual font-size multiplier (0.7x - 1.3x), then ensure it still doesn't overflow boxWidth/boxHeight
  let finalFontSize = clamp(
    Math.round(bestSize * req.fontSizeMultiplier),
    Math.max(12, Math.round(scaledMinFont * 0.65)),
    Math.round(scaledMaxFont * 1.3)
  );

  let wrapped = wrapWordsAtFontSize(
    ctx,
    parsed.paragraphs,
    req.fontFamily,
    req.fontWeight,
    finalFontSize,
    keywordScaleMultiplier,
    req.boxWidth,
    direction
  );

  // Safety step-down if user multiplier pushed the text outside the safe box
  const safetyMinSize = isFixedFontSize ? 14 : 18;
  while (
    finalFontSize > safetyMinSize &&
    (wrapped.maxLineWidth > req.boxWidth * 1.02 ||
      wrapped.rawLines.length * (finalFontSize * effectiveLineHeightRatio) > req.boxHeight * 1.04)
  ) {
    finalFontSize -= 2;
    wrapped = wrapWordsAtFontSize(
      ctx,
      parsed.paragraphs,
      req.fontFamily,
      req.fontWeight,
      finalFontSize,
      keywordScaleMultiplier,
      req.boxWidth,
      direction
    );
  }

  const lineHeight = finalFontSize * effectiveLineHeightRatio;
  const totalHeight = wrapped.rawLines.length * lineHeight;

  // Vertically center or top-align the text block inside [req.boxY, req.boxY + req.boxHeight]
  const blockTopY =
    verticalAlign === 'top' ? req.boxY : req.boxY + (req.boxHeight - totalHeight) / 2;

  const lines: PositionedLine[] = [];
  const allWords: PositionedWord[] = [];
  const keywordLineRects: KeywordLineRect[] = [];
  let globalWordIdx = 0;
  const isLtr = direction === 'ltr';

  for (let i = 0; i < wrapped.rawLines.length; i++) {
    const raw = wrapped.rawLines[i];
    const topY = blockTopY + i * lineHeight;
    // Place alphabetic baseline with font-specific ascender/descender calibration
    const baselineY = topY + finalFontSize * (0.92 + cal.baselineOffsetRatio);
    const bottomY = topY + lineHeight;

    const leftX =
      req.align === 'left'
        ? req.boxX
        : req.align === 'center'
          ? req.boxX + (req.boxWidth - raw.width) / 2
          : isLtr
            ? req.boxX + (req.boxWidth - raw.width) / 2
            : req.boxX + req.boxWidth - raw.width;
    const rightX = leftX + raw.width;

    // Segment raw.words on this line into directional runs so embedded Latin/numbers/code in RTL
    // flow left-to-right within their run, while Arabic words flow right-to-left.
    interface IndexedLineWord {
      w: MeasuredWordToken;
      wIdx: number;
      globalIdx: number;
      dir: ResolvedTextDirection;
    }
    const indexedWords: IndexedLineWord[] = raw.words.map((w, wIdx) => ({
      w,
      wIdx,
      globalIdx: globalWordIdx++,
      dir: getWordIntrinsicDirection(w.text, direction),
    }));

    const wordRuns: { dir: ResolvedTextDirection; items: IndexedLineWord[] }[] = [];
    for (const item of indexedWords) {
      if (wordRuns.length > 0 && wordRuns[wordRuns.length - 1].dir === item.dir) {
        wordRuns[wordRuns.length - 1].items.push(item);
      } else {
        wordRuns.push({ dir: item.dir, items: [item] });
      }
    }

    const xByWIdx = new Map<number, number>();

    if (isLtr) {
      let cursorLeft = leftX;
      for (const run of wordRuns) {
        const runW =
          run.items.reduce((acc, it) => acc + it.w.width, 0) +
          Math.max(0, run.items.length - 1) * wrapped.spaceWidth;
        if (run.dir === 'ltr') {
          let innerLeft = cursorLeft;
          for (const it of run.items) {
            xByWIdx.set(it.wIdx, innerLeft + it.w.width);
            innerLeft += it.w.width + wrapped.spaceWidth;
          }
        } else {
          let innerRight = cursorLeft + runW;
          for (const it of run.items) {
            xByWIdx.set(it.wIdx, innerRight);
            innerRight -= it.w.width + wrapped.spaceWidth;
          }
        }
        cursorLeft += runW + wrapped.spaceWidth;
      }
    } else {
      let cursorRight = rightX;
      for (const run of wordRuns) {
        const runW =
          run.items.reduce((acc, it) => acc + it.w.width, 0) +
          Math.max(0, run.items.length - 1) * wrapped.spaceWidth;
        if (run.dir === 'rtl') {
          let innerRight = cursorRight;
          for (const it of run.items) {
            xByWIdx.set(it.wIdx, innerRight);
            innerRight -= it.w.width + wrapped.spaceWidth;
          }
        } else {
          // LTR run inside RTL line: place words left-to-right inside [cursorRight - runW, cursorRight]
          let innerLeft = cursorRight - runW;
          for (const it of run.items) {
            xByWIdx.set(it.wIdx, innerLeft + it.w.width);
            innerLeft += it.w.width + wrapped.spaceWidth;
          }
        }
        cursorRight -= runW + wrapped.spaceWidth;
      }
    }

    const lineWords: PositionedWord[] = [];
    for (const it of indexedWords) {
      const positioned: PositionedWord = {
        text: it.w.text,
        x: xByWIdx.get(it.wIdx) ?? rightX,
        y: baselineY,
        width: it.w.width,
        fontSize: it.w.fontSize,
        scaleMultiplier: it.w.scaleMultiplier,
        isKeyword: it.w.isKeyword,
        groupId: it.w.groupId,
        lineIndex: i,
        wordIndexInLine: it.wIdx,
        globalWordIndex: it.globalIdx,
      };
      lineWords.push(positioned);
      allWords.push(positioned);
    }

    // Group contiguous keyword words on this line by groupId to form per-line keyword bounding rects
    const groupsInLine = new Map<number, PositionedWord[]>();
    for (const pw of lineWords) {
      if (pw.isKeyword && pw.groupId !== null) {
        const list = groupsInLine.get(pw.groupId) || [];
        list.push(pw);
        groupsInLine.set(pw.groupId, list);
      }
    }

    for (const [groupId, gWords] of groupsInLine.entries()) {
      const minX = Math.min(...gWords.map((gw) => gw.x - gw.width));
      const maxX = Math.max(...gWords.map((gw) => gw.x));
      const maxWordFont = Math.max(...gWords.map((gw) => gw.fontSize));
      keywordLineRects.push({
        groupId,
        lineIndex: i,
        rightX: maxX,
        leftX: minX,
        width: Math.max(4, maxX - minX),
        topY: baselineY - maxWordFont * cal.keywordRectTopFactor,
        bottomY: baselineY + maxWordFont * cal.keywordRectBottomFactor,
        baselineY,
        words: gWords,
      });
    }

    lines.push({
      lineIndex: i,
      text: raw.words.map((w) => w.text).join(' '),
      words: lineWords,
      width: raw.width,
      y: baselineY,
      topY,
      bottomY,
      rightX,
      leftX,
    });
  }

  ctx.restore();

  const result: ArabicQuoteLayout = {
    fontFamily: req.fontFamily,
    fontWeight: req.fontWeight,
    fontSize: finalFontSize,
    lineHeight,
    lineHeightRatio: effectiveLineHeightRatio,
    lines,
    words: allWords,
    keywordLineRects,
    keywordGroups: parsed.keywordGroups,
    unmatchedAsteriskWarning: parsed.unmatchedAsteriskWarning,
    totalHeight,
    maxLineWidth: wrapped.maxLineWidth,
    align: req.align,
    direction,
    boxX: req.boxX,
    boxY: blockTopY,
    boxWidth: req.boxWidth,
  };

  if (layoutCache.size > 150) {
    const firstKey = layoutCache.keys().next().value;
    if (firstKey) layoutCache.delete(firstKey);
  }
  layoutCache.set(formattingKey, result);

  return result;
}

/**
 * Clears the layout cache (called after document.fonts finishes loading).
 */
export function clearLayoutCache(): void {
  layoutCache.clear();
}

/**
 * Explicitly loads all 16 Arabic fonts (9 original + 7 new phrase fonts) and awaits document.fonts.ready.
 */
export async function ensureArabicFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const fontsToLoad = [
    '400 32px "Amiri"',
    '700 32px "Amiri"',
    '400 32px "Aref Ruqaa"',
    '700 32px "Aref Ruqaa"',
    '400 32px "Aref Ruqaa Ink"',
    '700 32px "Aref Ruqaa Ink"',
    '400 32px "Noto Naskh Arabic"',
    '700 32px "Noto Naskh Arabic"',
    '400 32px "Noto Kufi Arabic"',
    '700 32px "Noto Kufi Arabic"',
    '400 32px "Cairo"',
    '700 32px "Cairo"',
    '800 32px "Cairo"',
    '900 32px "Cairo"',
    '400 32px "Readex Pro"',
    '700 32px "Readex Pro"',
    '400 32px "IBM Plex Sans Arabic"',
    '700 32px "IBM Plex Sans Arabic"',
    '400 32px "Reem Kufi"',
    '700 32px "Reem Kufi"',
    '400 32px "El Messiri"',
    '700 32px "El Messiri"',
    '400 32px "Tajawal"',
    '700 32px "Tajawal"',
    '400 32px "Lalezar"',
    '400 32px "Rakkas"',
    '700 32px "Changa"',
    '800 32px "Changa"',
    '400 32px "Almarai"',
    '700 32px "Almarai"',
    '800 32px "Almarai"',
    '400 32px "Katibeh"',
    '900 32px "KOMission Black"',
    '400 32px "Zain Rounded instance mob"',
    '400 32px "Zain"',
    '700 32px "Zain"',
    '700 32px "29LT Azahar Display AL TN Trial Bold"',
  ];

  try {
    await Promise.allSettled(fontsToLoad.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    clearLayoutCache();
  } catch {
    // Ignore network errors if offline
  }
}

export const ensureStudioFontsLoaded = ensureArabicFontsLoaded;

export interface KeystrokeStep {
  time: number;
  revealedLeftX: number;
  revealedRightX?: number;
  wordIndex: number;
  isSpace: boolean;
  globalStepIndex: number;
}

export interface LineTypingSchedule {
  lineIndex: number;
  startTime: number;
  endTime: number;
  steps: KeystrokeStep[];
}

export interface LayoutTypingSchedule {
  lines: LineTypingSchedule[];
  allSteps: KeystrokeStep[];
  keystrokeTimes: number[];
  lineEndTimes: number[];
  keywordTimes: number[];
  rectFinishTimes: number[];
  typingStartTime: number;
  typingEndTime: number;
}

const COMBINING_TASHKEEL_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D4-\u08E1\u08E3-\u08FF]/;

/**
 * Splits a word or string into logical keystroke clusters (each base character grouped with its combining tashkeel marks).
 */
export function splitIntoKeystrokeClusters(wordText: string): string[] {
  const clusters: string[] = [];
  for (let i = 0; i < wordText.length; i++) {
    const ch = wordText[i];
    if (clusters.length > 0 && COMBINING_TASHKEEL_RE.test(ch)) {
      clusters[clusters.length - 1] += ch;
    } else {
      clusters.push(ch);
    }
  }
  return clusters;
}

/**
 * Computes deterministic stepped keystroke positions and timestamps for a laid-out phrase.
 * Supports both RTL (Arabic) and LTR (English) writing directions.
 * - Uses ctx.measureText on logical-text prefixes so Arabic letters remain 100% connected.
 * - Next line starts only after the previous line is fully revealed (+ lineBreakGapSec).
 * - keywordTimes records the exact moment typing reaches each keyword group's start.
 */
export function computeTypingScheduleForLayout(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: ArabicQuoteLayout,
  typingStartSec: number,
  typingSpeedCharsPerSec: number = 18,
  lineBreakGapSec: number = 0.12
): LayoutTypingSchedule {
  const speed = clamp(typingSpeedCharsPerSec, 8, 30);
  const stepDur = 1 / speed;
  const isLtr = layout.direction === 'ltr';

  const lineSchedules: LineTypingSchedule[] = [];
  const allSteps: KeystrokeStep[] = [];
  const keystrokeTimes: number[] = [];
  const lineEndTimes: number[] = [];
  const keywordTimes: number[] = [];
  const seenGroups = new Set<number>();
  const wordEndTimes = new Map<number, number>();

  let currentTime = typingStartSec;
  let globalStepIndex = 0;

  ctx.save();

  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];
    const lineSteps: KeystrokeStep[] = [];
    const lineStartTime = currentTime;

    // Sweep words in visual direction (right-to-left in RTL, left-to-right in LTR)
    // so stepped clip boundaries advance monotonically even with embedded bidi runs.
    const visualWords = [...line.words].sort((a, b) => (isLtr ? a.x - b.x : b.x - a.x));

    for (let wIdx = 0; wIdx < visualWords.length; wIdx++) {
      const w = visualWords[wIdx];
      applyStudioCanvasTextProps(
        ctx,
        layout.fontFamily,
        layout.fontWeight,
        w.fontSize,
        layout.direction
      );

      const clusters = splitIntoKeystrokeClusters(w.text);
      const measuredFullW = Math.max(1, ctx.measureText(w.text).width);
      let prefix = '';

      for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
        prefix += clusters[cIdx];
        const rawPrefixW = ctx.measureText(prefix).width;
        const scaledPrefixW =
          cIdx === clusters.length - 1
            ? w.width
            : clamp(rawPrefixW * (w.width / measuredFullW), 1, w.width);

        const revealedLeftX = w.x - scaledPrefixW;
        const wordLeftX = w.x - w.width;
        const revealedRightX = wordLeftX + scaledPrefixW;
        const stepTime = Number(currentTime.toFixed(4));

        if (cIdx === 0 && w.isKeyword && w.groupId !== null && !seenGroups.has(w.groupId)) {
          seenGroups.add(w.groupId);
          keywordTimes.push(Number(stepTime.toFixed(3)));
        }

        const step: KeystrokeStep = {
          time: stepTime,
          revealedLeftX,
          revealedRightX,
          wordIndex: w.globalWordIndex,
          isSpace: false,
          globalStepIndex: globalStepIndex++,
        };
        lineSteps.push(step);
        allSteps.push(step);
        keystrokeTimes.push(Number(stepTime.toFixed(3)));

        if (cIdx === clusters.length - 1) {
          wordEndTimes.set(w.globalWordIndex, stepTime);
        }

        currentTime += stepDur;
      }

      // Add discrete space keystroke step between words on the same line
      if (wIdx < visualWords.length - 1) {
        const nextWord = visualWords[wIdx + 1];
        const stepTime = Number(currentTime.toFixed(4));
        const spaceStep: KeystrokeStep = {
          time: stepTime,
          revealedLeftX: nextWord.x,
          revealedRightX: nextWord.x - nextWord.width,
          wordIndex: w.globalWordIndex,
          isSpace: true,
          globalStepIndex: globalStepIndex++,
        };
        lineSteps.push(spaceStep);
        allSteps.push(spaceStep);
        keystrokeTimes.push(Number(stepTime.toFixed(3)));
        currentTime += stepDur;
      }
    }

    const lineEndTime =
      lineSteps.length > 0 ? lineSteps[lineSteps.length - 1].time : lineStartTime;
    lineEndTimes.push(Number(lineEndTime.toFixed(3)));

    lineSchedules.push({
      lineIndex: i,
      startTime: lineStartTime,
      endTime: lineEndTime,
      steps: lineSteps,
    });

    if (i < layout.lines.length - 1) {
      currentTime = lineEndTime + stepDur + lineBreakGapSec;
    }
  }

  ctx.restore();

  const rectFinishTimes: number[] = layout.keywordLineRects.map((rect) => {
    const lastWord = rect.words[rect.words.length - 1];
    return wordEndTimes.get(lastWord.globalWordIndex) ?? typingStartSec;
  });

  const typingEndTime =
    lineSchedules.length > 0
      ? lineSchedules[lineSchedules.length - 1].endTime
      : typingStartSec;

  return {
    lines: lineSchedules,
    allSteps,
    keystrokeTimes,
    lineEndTimes,
    keywordTimes,
    rectFinishTimes,
    typingStartTime: typingStartSec,
    typingEndTime,
  };
}

/**
 * Evaluates the stepped revealed state of a single line at timestamp `t`.
 * In RTL, revealed area expands leftwards (revealedLeftX decreases).
 * In LTR, revealed area expands rightwards (revealedRightX increases).
 */
export function evaluateLineTypingAtTime(
  line: PositionedLine,
  lineSchedule: LineTypingSchedule,
  t: number,
  direction: ResolvedTextDirection = 'rtl'
): {
  hasStarted: boolean;
  isFinished: boolean;
  revealedLeftX: number;
  revealedRightX: number;
  activeStepIndex: number;
  activeStep: KeystrokeStep | null;
} {
  if (lineSchedule.steps.length === 0 || t < lineSchedule.startTime) {
    return {
      hasStarted: false,
      isFinished: false,
      revealedLeftX: line.rightX,
      revealedRightX: line.leftX,
      activeStepIndex: -1,
      activeStep: null,
    };
  }

  let activeIdx = -1;
  for (let i = 0; i < lineSchedule.steps.length; i++) {
    if (t >= lineSchedule.steps[i].time) {
      activeIdx = i;
    } else {
      break;
    }
  }

  if (activeIdx === -1) {
    return {
      hasStarted: false,
      isFinished: false,
      revealedLeftX: line.rightX,
      revealedRightX: line.leftX,
      activeStepIndex: -1,
      activeStep: null,
    };
  }

  const isFinished = activeIdx >= lineSchedule.steps.length - 1;
  const activeStep = lineSchedule.steps[activeIdx];
  const revealedLeftX = isFinished ? line.leftX : activeStep.revealedLeftX;
  const revealedRightX = isFinished
    ? line.rightX
    : activeStep.revealedRightX ?? line.leftX + (line.rightX - activeStep.revealedLeftX);

  return {
    hasStarted: true,
    isFinished,
    revealedLeftX,
    revealedRightX,
    activeStepIndex: activeIdx,
    activeStep,
  };
}

