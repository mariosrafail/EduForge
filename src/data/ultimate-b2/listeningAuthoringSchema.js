export const ULTIMATE_B2_LISTENING_ACTIVITY_ID = "ultimate-b2-sb-u1-p2-o2";
export const ULTIMATE_B2_LISTENING_SCHEMA_VERSION = 1;

const limits = Object.freeze({
  payloadBytes: 512_000,
  fragments: 160,
  cues: 80,
  scrollEntries: 32,
  segments: 8,
  regionsPerSegment: 32,
  textLength: 2_000,
  timeMs: 3_600_000,
  coordinate: 10_000,
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, required, optional = []) {
  if (!isRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key));
}

function isText(value, maximum = limits.textLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function isInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isGeometry(value) {
  return hasExactKeys(value, ["x", "y", "width", "height"])
    && hasValidGeometryFields(value);
}

function hasValidGeometryFields(value) {
  return isRecord(value)
    && isInteger(value.x, 0, limits.coordinate)
    && isInteger(value.y, 0, limits.coordinate)
    && isInteger(value.width, 1, limits.coordinate)
    && isInteger(value.height, 1, limits.coordinate);
}

function validateSurface(surface, errors, path) {
  if (!hasExactKeys(surface, ["width", "height"])) {
    errors.push(`${path} must contain only width and height.`);
    return;
  }
  if (!isInteger(surface.width, 1, limits.coordinate) || !isInteger(surface.height, 1, limits.coordinate)) {
    errors.push(`${path} dimensions are out of range.`);
  }
}

export function validateUltimateB2ListeningAuthoring(value) {
  const errors = [];
  let payloadBytes = Infinity;
  try {
    payloadBytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    errors.push("Authoring payload must be JSON serializable.");
  }
  if (payloadBytes > limits.payloadBytes) errors.push("Authoring payload is too large.");
  if (!hasExactKeys(value, ["schemaVersion", "activityId", "source", "assets", "staticText", "questionSegments", "karaoke"])) {
    errors.push("Authoring payload has missing or unknown top-level fields.");
    return { ok: false, errors };
  }
  if (value.schemaVersion !== ULTIMATE_B2_LISTENING_SCHEMA_VERSION) errors.push("Unsupported Listening schema version.");
  if (value.activityId !== ULTIMATE_B2_LISTENING_ACTIVITY_ID) errors.push("Unexpected Listening activity ID.");

  if (!hasExactKeys(value.source, ["extractionSchemaVersion", "iwbFiles", "selectedTeacherVariant"])) {
    errors.push("source has missing or unknown fields.");
  } else {
    if (value.source.extractionSchemaVersion !== 1) errors.push("Unsupported extraction schema version.");
    if (value.source.selectedTeacherVariant !== "obj_params.iwb") errors.push("Teacher source variant must be obj_params.iwb.");
    if (!Array.isArray(value.source.iwbFiles) || value.source.iwbFiles.length !== 3) errors.push("Exactly three IWB provenance records are required.");
    else value.source.iwbFiles.forEach((file, index) => {
      if (!hasExactKeys(file, ["name", "sha256"]) || !isText(file.name, 80) || !/^[a-f0-9]{64}$/.test(file.sha256 || "")) {
        errors.push(`source.iwbFiles[${index}] is invalid.`);
      }
    });
  }

  const assetKeys = ["instructionImage", "staticTextImage", "karaokeBackgroundImage", "fullAudio"];
  if (!hasExactKeys(value.assets, assetKeys)) errors.push("assets has missing or unknown fields.");
  else assetKeys.forEach((key) => {
    if (!isText(value.assets[key], 180)) errors.push(`assets.${key} is invalid.`);
  });

  if (!hasExactKeys(value.staticText, ["surface", "highlightColor", "highlightAlpha", "autoScroll"])) {
    errors.push("staticText has missing or unknown fields.");
  } else {
    validateSurface(value.staticText.surface, errors, "staticText.surface");
    if (!/^#[A-F0-9]{6}$/.test(value.staticText.highlightColor || "")) errors.push("staticText.highlightColor is invalid.");
    if (typeof value.staticText.highlightAlpha !== "number" || value.staticText.highlightAlpha < 0 || value.staticText.highlightAlpha > 1) errors.push("staticText.highlightAlpha is invalid.");
    if (typeof value.staticText.autoScroll !== "boolean") errors.push("staticText.autoScroll must be boolean.");
  }

  if (!Array.isArray(value.questionSegments) || value.questionSegments.length < 1 || value.questionSegments.length > limits.segments) {
    errors.push("questionSegments count is out of range.");
  } else {
    const ids = new Set();
    value.questionSegments.forEach((segment, index) => {
      const path = `questionSegments[${index}]`;
      if (!hasExactKeys(segment, ["id", "questionId", "questionNumber", "questionText", "answerLineCount", "audioLogicalKey", "sourceButtonId", "sourceAudioId", "regions"])) {
        errors.push(`${path} has missing or unknown fields.`);
        return;
      }
      if (!isText(segment.id, 80) || ids.has(segment.id)) errors.push(`${path}.id is invalid or duplicated.`);
      ids.add(segment.id);
      if (!isText(segment.questionId, 120) || !isInteger(segment.questionNumber, 1, 20) || !isText(segment.questionText, 500)) errors.push(`${path} question binding is invalid.`);
      if (!isInteger(segment.answerLineCount, 1, 10) || !isText(segment.audioLogicalKey, 180) || !isInteger(segment.sourceButtonId, 1, 100) || !isInteger(segment.sourceAudioId, 1, 100)) errors.push(`${path} metadata is invalid.`);
      if (!Array.isArray(segment.regions) || segment.regions.length < 1 || segment.regions.length > limits.regionsPerSegment) errors.push(`${path}.regions count is out of range.`);
      else segment.regions.forEach((region, regionIndex) => {
        if (!hasExactKeys(region, ["id", "x", "y", "width", "height"]) || !isText(region.id, 80) || !hasValidGeometryFields(region)) errors.push(`${path}.regions[${regionIndex}] is invalid.`);
      });
    });
  }

  if (!hasExactKeys(value.karaoke, ["content", "viewport", "background", "font", "fragments", "cues", "scrollTimeline"])) {
    errors.push("karaoke has missing or unknown fields.");
  } else {
    validateSurface(value.karaoke.content, errors, "karaoke.content");
    if (!isGeometry(value.karaoke.viewport) || !isGeometry(value.karaoke.background)) errors.push("karaoke viewport/background geometry is invalid.");
    if (!hasExactKeys(value.karaoke.font, ["family", "sizePx"]) || !isText(value.karaoke.font.family, 120) || !isInteger(value.karaoke.font.sizePx, 6, 100)) errors.push("karaoke.font is invalid.");
    const fragmentIds = new Set();
    if (!Array.isArray(value.karaoke.fragments) || value.karaoke.fragments.length < 1 || value.karaoke.fragments.length > limits.fragments) errors.push("karaoke.fragments count is out of range.");
    else value.karaoke.fragments.forEach((fragment, index) => {
      const path = `karaoke.fragments[${index}]`;
      if (!hasExactKeys(fragment, ["id", "x", "y", "width", "height", "runs"]) || !isText(fragment.id, 80) || fragmentIds.has(fragment.id) || !hasValidGeometryFields(fragment)) {
        errors.push(`${path} is invalid.`);
        return;
      }
      fragmentIds.add(fragment.id);
      if (!Array.isArray(fragment.runs) || fragment.runs.length < 1 || fragment.runs.length > 30) errors.push(`${path}.runs is invalid.`);
      else fragment.runs.forEach((run, runIndex) => {
        if (!hasExactKeys(run, ["text"], ["style"]) || !isText(run.text, 800) || (run.style !== undefined && !["italic", "bold"].includes(run.style))) errors.push(`${path}.runs[${runIndex}] is invalid.`);
      });
    });
    const cueIds = new Set();
    if (!Array.isArray(value.karaoke.cues) || value.karaoke.cues.length < 1 || value.karaoke.cues.length > limits.cues) errors.push("karaoke.cues count is out of range.");
    else value.karaoke.cues.forEach((cue, index) => {
      const path = `karaoke.cues[${index}]`;
      if (!hasExactKeys(cue, ["id", "startMs", "endMs", "fragmentIds"]) || !isText(cue.id, 80) || cueIds.has(cue.id)) {
        errors.push(`${path} is invalid.`);
        return;
      }
      cueIds.add(cue.id);
      if (!isInteger(cue.startMs, 0, limits.timeMs) || !isInteger(cue.endMs, 1, limits.timeMs) || cue.endMs <= cue.startMs) errors.push(`${path} timing is invalid.`);
      if (index > 0 && cue.startMs < value.karaoke.cues[index - 1].endMs) errors.push(`${path} overlaps the previous cue.`);
      if (!Array.isArray(cue.fragmentIds) || cue.fragmentIds.length < 1 || cue.fragmentIds.some((id) => !fragmentIds.has(id))) errors.push(`${path} references missing fragments.`);
    });
    if (!Array.isArray(value.karaoke.scrollTimeline) || value.karaoke.scrollTimeline.length < 1 || value.karaoke.scrollTimeline.length > limits.scrollEntries) errors.push("karaoke.scrollTimeline count is out of range.");
    else value.karaoke.scrollTimeline.forEach((entry, index) => {
      const path = `karaoke.scrollTimeline[${index}]`;
      if (!hasExactKeys(entry, ["startMs", "endMs", "scrollY", "sourceTimingParts"]) || !isInteger(entry.startMs, 0, limits.timeMs) || !isInteger(entry.endMs, 1, limits.timeMs) || entry.endMs <= entry.startMs || !isInteger(entry.scrollY, 0, limits.coordinate) || !Array.isArray(entry.sourceTimingParts) || entry.sourceTimingParts.some((part) => !isInteger(part, 0, limits.timeMs))) errors.push(`${path} is invalid.`);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function assertUltimateB2ListeningAuthoring(value) {
  const result = validateUltimateB2ListeningAuthoring(value);
  if (!result.ok) throw new Error(`Invalid Ultimate B2 Listening authoring:\n- ${result.errors.join("\n- ")}`);
  return value;
}

export const ultimateB2ListeningAuthoringLimits = limits;
