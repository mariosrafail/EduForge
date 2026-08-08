export const BULK_IMPORT_FILE_LIMIT = 256;
export const MATCH_CONFIDENCE = Object.freeze({ HIGH: "HIGH", AMBIGUOUS: "AMBIGUOUS", UNMATCHED: "UNMATCHED" });

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav"]);
const NORMAL_TOKENS = new Set(["normal", "default", "base", "enabled", "up"]);
const ACTIVE_TOKENS = new Set(["active", "hover", "pressed", "selected", "down"]);
const EDITION_SYNONYMS = Object.freeze({
  "students-book": [["students", "book"], ["student", "book"], ["students"], ["student"], ["sb"]],
  workbook: [["workbook"], ["work", "book"], ["wb"]],
  "grammar-book": [["grammar", "book"], ["grammar"], ["gb"]],
  extras: [["extras"], ["extra"]],
});
const TOOLBAR_SYNONYMS = Object.freeze({
  mouse: [["mouse"], ["pointer"]], pencil: [["pencil"], ["pen"]], marker: [["marker"]], eraser: [["eraser"]],
  clear: [["clear"]], zoom: [["zoom"]], hide: [["hide"]], show: [["show"]], undo: [["undo"]], redo: [["redo"]],
  text: [["text"]], annotations: [["annotations"], ["annotation"], ["custom", "page"]], url: [["url"]], save: [["save"]],
  load: [["load"], ["open"]], timer: [["timer"]], score: [["score"], ["scoreboard"]], print: [["print"]],
});
const CHROME_SYNONYMS = Object.freeze({ settings: [["settings"], ["setting"]], minimize: [["minimize"], ["minimise"]], close: [["close"], ["exit"], ["quit"]] });

export function naturalCompare(left, right) {
  const leftTokens = normalizeTeacherAssetName(left).tokens;
  const rightTokens = normalizeTeacherAssetName(right).tokens;
  for (let index = 0; index < Math.min(leftTokens.length, rightTokens.length); index += 1) {
    const leftNumber = /^\d+$/.test(leftTokens[index]) ? Number(leftTokens[index]) : null;
    const rightNumber = /^\d+$/.test(rightTokens[index]) ? Number(rightTokens[index]) : null;
    const comparison = leftNumber !== null && rightNumber !== null
      ? leftNumber - rightNumber
      : leftTokens[index].localeCompare(rightTokens[index], undefined, { sensitivity: "base" });
    if (comparison) return comparison;
  }
  return leftTokens.length - rightTokens.length || String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
}

export function normalizeTeacherAssetName(value) {
  const normalized = String(value || "").normalize("NFKD").toLowerCase().replaceAll("\\", "/");
  const extension = normalized.includes(".") ? normalized.split(".").at(-1) : "";
  const withoutExtension = extension ? normalized.slice(0, -(extension.length + 1)) : normalized;
  const tokens = withoutExtension.match(/[a-z]+|\d+/g) || [];
  return { normalized, extension, tokens };
}

function hasSequence(tokens, sequence) {
  return tokens.some((_, start) => sequence.every((token, offset) => tokens[start + offset] === token));
}

function matchesAny(tokens, synonyms) {
  return synonyms.some((sequence) => hasSequence(tokens, sequence));
}

function visualState(tokens, { implicitNormal = false } = {}) {
  const normal = tokens.some((token) => NORMAL_TOKENS.has(token));
  const active = tokens.some((token) => ACTIVE_TOKENS.has(token));
  if (normal === active) return implicitNormal && !normal ? "normal" : null;
  return active ? "active" : "normal";
}

function unitNumber(tokens) {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (!["unit", "u"].includes(tokens[index])) continue;
    const number = Number(tokens[index + 1]);
    if (Number.isSafeInteger(number) && number >= 1 && number <= 10) return number;
  }
  return null;
}

function candidateRecord(file, index) {
  const relativePath = String(file.webkitRelativePath || file.relativePath || file.name || "").replaceAll("\\", "/");
  const parsed = normalizeTeacherAssetName(relativePath || file.name);
  const kind = IMAGE_EXTENSIONS.has(parsed.extension) ? "image" : AUDIO_EXTENSIONS.has(parsed.extension) ? "audio" : parsed.extension === "gaf" ? "gaf" : "unsupported";
  const name = String(file.name || relativePath.split("/").at(-1) || "file");
  return { id: `candidate-${index}`, file, name, relativePath, ...parsed, nameTokens: normalizeTeacherAssetName(name).tokens, kind };
}

function target(key, section, slot, variant, label, descriptor, kind = variant === "sound" ? "audio" : "image", index = null) {
  return { key, section, slot, variant, label, descriptor, kind, index };
}

export function buildTeacherImportTargets(shell) {
  const targets = [
    target("background", "shell", "main", "image", "Shell · Background", { section: "background", slot: "main", variant: "image", index: null }),
    target("animation.gaf", "animation", "title", "gaf", "Shell · Title GAF", { section: "animation", slot: "title", variant: "gaf", index: null }, "gaf"),
  ];
  for (const density of ["sd", "hd"]) for (let index = 0; index < 8; index += 1) targets.push(target(
    `animation.${density}Atlases.${index}`, "animation", "title", density, `Shell · ${density.toUpperCase()} atlas ${index + 1}`,
    { section: "animation", slot: "title", variant: density, index }, "png", index,
  ));
  for (const [id, item] of Object.entries(shell.chrome)) {
    const label = id[0].toUpperCase() + id.slice(1);
    targets.push(target(`chrome.${id}.image`, "chrome", id, "image", `Window Controls · ${label} image`, { section: "chrome", slot: id, variant: "image", index: null }));
    targets.push(target(`chrome.${id}.sound`, "chrome", id, "sound", `Window Controls · ${label} sound`, { section: "audio", slot: "library", variant: "sound", index: null }, "audio"));
  }
  for (const section of ["units", "editions", "toolbar"]) for (const item of shell[section]) for (const variant of ["normal", "active", "sound"]) {
    targets.push(target(`${section}.${item.id}.${variant}`, section, item.id, variant, `${section === "editions" ? "Book Editions" : section[0].toUpperCase() + section.slice(1)} · ${item.label} ${variant}`,
      variant === "sound" ? { section: "audio", slot: "library", variant: "sound", index: null } : { section, slot: item.id, variant, index: null }, variant === "sound" ? "audio" : "image"));
  }
  return targets;
}

function candidateEvidence(candidate, targetItem) {
  const { tokens, kind, extension } = candidate;
  if (targetItem.kind === "gaf") return kind === "gaf" ? { score: 100, reason: "GAF file extension" } : null;
  if (targetItem.kind === "png") {
    if (extension !== "png" || !tokens.includes(targetItem.variant)) return null;
    return { score: 95, reason: `${targetItem.variant.toUpperCase()} density token and PNG atlas` };
  }
  if (targetItem.kind !== kind) return null;
  if (targetItem.key === "background") return matchesAny(tokens, [["background"], ["bg"], ["menu", "background"], ["launcher", "background"]])
    ? { score: 100, reason: "Strong background token" } : null;
  if (targetItem.section === "chrome") {
    if (!matchesAny(tokens, CHROME_SYNONYMS[targetItem.slot])) return null;
    if (kind === "audio") return { score: 100, reason: `Exact ${targetItem.slot} control token + audio` };
    return { score: 100, reason: `Exact ${targetItem.slot} control token` };
  }
  if (targetItem.section === "units") {
    if (unitNumber(tokens) !== Number(targetItem.slot.split("-")[1])) return null;
    if (kind === "audio") return { score: 100, reason: `Exact ${targetItem.slot} token + audio` };
    const state = visualState(tokens);
    return state === targetItem.variant ? { score: 100, reason: `Exact ${targetItem.slot} + ${state}-state tokens` } : null;
  }
  const synonyms = targetItem.section === "editions" ? EDITION_SYNONYMS[targetItem.slot] : TOOLBAR_SYNONYMS[targetItem.slot];
  if (!synonyms || !matchesAny(tokens, synonyms)) return null;
  if (kind === "audio") return { score: 100, reason: `Exact ${targetItem.slot} token + audio` };
  const state = visualState(tokens, { implicitNormal: targetItem.section === "toolbar" });
  return state === targetItem.variant ? { score: 100, reason: `Exact ${targetItem.slot} + ${state}-state evidence` } : null;
}

function currentTargetValue(shell, targetItem) {
  if (targetItem.key === "background") return shell.background;
  if (targetItem.key === "animation.gaf") return shell.titleAnimation.gaf;
  if (targetItem.section === "animation") return shell.titleAnimation[targetItem.variant === "sd" ? "sdAtlases" : "hdAtlases"][targetItem.index] || null;
  if (targetItem.section === "chrome") return shell.chrome[targetItem.slot][targetItem.variant];
  return shell[targetItem.section].find((item) => item.id === targetItem.slot)?.[targetItem.variant] || null;
}

export function matchTeacherProjectAssets(files, shell) {
  if (!Array.isArray(files)) throw new TypeError("files must be an array");
  if (files.length > BULK_IMPORT_FILE_LIMIT) throw Object.assign(new Error(`Select at most ${BULK_IMPORT_FILE_LIMIT} files per import.`), { code: "teacher_bulk_file_limit" });
  const candidates = files.map(candidateRecord).sort((left, right) => naturalCompare(left.relativePath, right.relativePath));
  const targets = buildTeacherImportTargets(shell);
  const gafStemTokens = new Set(candidates.filter((candidate) => candidate.kind === "gaf").flatMap((candidate) => candidate.nameTokens).filter((token) => !/^\d+$/.test(token) && !["sd", "hd"].includes(token)));
  const atlasCandidates = Object.fromEntries(["sd", "hd"].map((density) => [density, candidates.filter((candidate) => candidate.kind === "image" && candidate.extension === "png" && candidate.nameTokens.includes(density) && candidate.nameTokens.some((token) => gafStemTokens.has(token))).sort((a, b) => naturalCompare(a.relativePath, b.relativePath))]));
  const provisional = targets.map((targetItem) => {
    if (currentTargetValue(shell, targetItem)) return { target: targetItem, candidateId: null, confidence: MATCH_CONFIDENCE.UNMATCHED, reason: "Already assigned", existing: true };
    if (targetItem.section === "animation" && ["sd", "hd"].includes(targetItem.variant)) {
      const candidate = atlasCandidates[targetItem.variant][targetItem.index];
      return candidate ? { target: targetItem, candidateId: candidate.id, confidence: MATCH_CONFIDENCE.HIGH, reason: `${targetItem.variant.toUpperCase()} atlas in natural filename order` }
        : { target: targetItem, candidateId: null, confidence: MATCH_CONFIDENCE.UNMATCHED, reason: "No atlas candidate" };
    }
    const matches = candidates.map((candidate) => ({ candidate, evidence: candidateEvidence(candidate, targetItem) })).filter((item) => item.evidence).sort((a, b) => b.evidence.score - a.evidence.score || naturalCompare(a.candidate.relativePath, b.candidate.relativePath));
    if (!matches.length) return { target: targetItem, candidateId: null, confidence: MATCH_CONFIDENCE.UNMATCHED, reason: "No deterministic filename match" };
    if (matches.length > 1 && matches[0].evidence.score === matches[1].evidence.score) return { target: targetItem, candidateId: null, suggestedCandidateIds: matches.map((item) => item.candidate.id), confidence: MATCH_CONFIDENCE.AMBIGUOUS, reason: "Multiple equally strong candidates" };
    return { target: targetItem, candidateId: matches[0].candidate.id, confidence: MATCH_CONFIDENCE.HIGH, reason: matches[0].evidence.reason };
  });
  const claimedImages = new Map();
  for (const mapping of provisional) if (mapping.candidateId && mapping.target.kind !== "audio") {
    const claims = claimedImages.get(mapping.candidateId) || [];
    claims.push(mapping);
    claimedImages.set(mapping.candidateId, claims);
  }
  for (const claims of claimedImages.values()) if (claims.length > 1) for (const mapping of claims) {
    mapping.suggestedCandidateIds = [mapping.candidateId];
    mapping.candidateId = null;
    mapping.confidence = MATCH_CONFIDENCE.AMBIGUOUS;
    mapping.reason = "One image matched multiple visual slots; choose explicitly";
  }
  const used = new Set(provisional.flatMap((mapping) => [mapping.candidateId, ...(mapping.suggestedCandidateIds || [])]).filter(Boolean));
  return {
    candidates,
    mappings: provisional,
    unmatched: candidates.filter((candidate) => !used.has(candidate.id)),
    commonAudio: candidates.filter((candidate) => candidate.kind === "audio" && matchesAny(candidate.tokens, [["button"], ["click"]]) && !used.has(candidate.id)),
  };
}
