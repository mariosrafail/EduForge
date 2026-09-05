// Explicit conservative metrics for the single approved initial answer face (Arial).
// Widths are em fractions, deliberately independent of browser/OS font discovery.
const WIDTHS = Object.freeze({ narrow: 0.32, normal: 0.56, wide: 0.82, space: 0.28 });
const NARROW = new Set(".,:;!|'ijlI1()[]".split(""));
const WIDE = new Set("MW@%&#QOwm".split(""));

export function normalizeNativeAnswerWhitespace(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[^\S\n]+/g, " ").trim()).join("\n").trim();
}

export function nativeAnswerTextWidth(value, fontSize) {
  let units = 0;
  for (const character of String(value)) units += character === " " ? WIDTHS.space : NARROW.has(character) ? WIDTHS.narrow : WIDE.has(character) ? WIDTHS.wide : WIDTHS.normal;
  return Math.round(units * fontSize * 1_000) / 1_000;
}

function splitLongToken(token, width, fontSize, measureTextWidth) {
  const chunks = [];
  let current = "";
  for (const character of token) {
    if (current && measureTextWidth(current + character, fontSize) > width) { chunks.push(current); current = character; }
    else current += character;
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapLine(text, width, fontSize, measureTextWidth) {
  if (!text) return [""];
  const lines = [];
  let current = "";
  for (const token of text.split(" ")) {
    const candidate = current ? `${current} ${token}` : token;
    if (measureTextWidth(candidate, fontSize) <= width) { current = candidate; continue; }
    if (current) { lines.push(current); current = ""; }
    if (measureTextWidth(token, fontSize) <= width) { current = token; continue; }
    const chunks = splitLongToken(token, width, fontSize, measureTextWidth);
    lines.push(...chunks.slice(0, -1));
    current = chunks.at(-1) || "";
  }
  if (current) lines.push(current);
  return lines;
}

function wrap(text, width, fontSize, measureTextWidth) {
  return text.split("\n").flatMap((line) => wrapLine(line, width, fontSize, measureTextWidth));
}

export function autoFitNativeOpenResponseAnswer({ text, responseRegion, measureTextWidth = nativeAnswerTextWidth }) {
  const normalizedText = normalizeNativeAnswerWhitespace(text);
  const { area, presentation } = responseRegion;
  const availableWidth = Math.min(presentation.lineWidth, area.width - (2 * presentation.paddingX));
  const baselines = presentation.linePositions.map((position) => Math.round((area.y + position) * 1_000) / 1_000);
  if (!normalizedText) return { fontSize: presentation.answerFontSizeMax, lines: [], baselines, fits: true, overflowReason: null };
  if (presentation.answerSizeMode === "authored") {
    const fontSize = presentation.answerFontSizeMax;
    const lines = wrap(normalizedText, availableWidth, fontSize, measureTextWidth);
    const spacing = Math.max(fontSize, presentation.lineSpacing);
    const authoredBaselines = lines.map((_, index) => area.y + presentation.paddingY + spacing * (index + 1));
    const fits = authoredBaselines.at(-1) <= area.y + area.height - presentation.paddingY && lines.every((line) => measureTextWidth(line, fontSize) <= availableWidth);
    return { fontSize, lines, baselines: authoredBaselines, fits, overflowReason: fits ? null : "authored-size-overflow" };
  }
  // Bounded search also supports large saved maximums without a linear loop.
  let lower = Math.ceil(presentation.answerFontSizeMin);
  let upper = Math.floor(presentation.answerFontSizeMax);
  let best = null;
  while (lower <= upper) {
    const fontSize = lower + Math.floor((upper - lower) / 2);
    const lines = wrap(normalizedText, availableWidth, fontSize, measureTextWidth);
    if (lines.length <= presentation.lineCount && lines.every((line) => measureTextWidth(line, fontSize) <= availableWidth)) {
      best = { fontSize, lines, baselines: baselines.slice(0, lines.length), fits: true, overflowReason: null };
      lower = fontSize + 1;
    } else upper = fontSize - 1;
  }
  if (best) return best;
  const lines = wrap(normalizedText, availableWidth, presentation.answerFontSizeMin, measureTextWidth);
  return { fontSize: presentation.answerFontSizeMin, lines, baselines: baselines.slice(0, Math.min(lines.length, baselines.length)), fits: false, overflowReason: lines.length > presentation.lineCount ? "too-many-lines" : "line-too-wide" };
}
