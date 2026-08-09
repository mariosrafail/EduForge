const allowedAssets = new Set(["image_1.png", "image_2.png", "image_3.png", "showText.png"]);
const allowedAudio = new Set(Array.from({ length: 6 }, (_, index) => `ultimate-b2.legacy-pilot.unit-1.part-2.obj3.highlight-${index + 1}`));

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function keys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label} contains unsupported field ${key}.`);
}

function string(value, label, maximum = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`${label} must be a non-empty string no longer than ${maximum} characters.`);
  return value.trim();
}

function integer(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

function area(value, label, surface) {
  object(value, label);
  keys(value, ["x", "y", "width", "height"], label);
  const normalized = {
    x: integer(value.x, `${label}.x`, 0, surface.width),
    y: integer(value.y, `${label}.y`, 0, surface.height),
    width: integer(value.width, `${label}.width`, 1, surface.width),
    height: integer(value.height, `${label}.height`, 1, surface.height),
  };
  if (normalized.x + normalized.width > surface.width || normalized.y + normalized.height > surface.height) throw new Error(`${label} must stay inside its surface.`);
  return normalized;
}

export function normalizeMultipleChoiceAuthoring(input) {
  const value = object(structuredClone(input), "authoring");
  keys(value, ["schemaVersion", "activityId", "source", "surface", "textSurface", "assets", "panels", "questions"], "authoring");
  const surface = object(value.surface, "surface");
  const textSurface = object(value.textSurface, "textSurface");
  keys(surface, ["width", "height"], "surface");
  keys(textSurface, ["width", "height"], "textSurface");
  const normalizedSurface = { width: integer(surface.width, "surface.width", 320, 4096), height: integer(surface.height, "surface.height", 240, 4096) };
  const normalizedTextSurface = { width: integer(textSurface.width, "textSurface.width", 320, 4096), height: integer(textSurface.height, "textSurface.height", 240, 4096) };
  const assets = object(value.assets, "assets");
  keys(assets, ["instructionImage", "textImage"], "assets");
  for (const asset of Object.values(assets)) if (!allowedAssets.has(asset)) throw new Error(`Unsupported asset binding ${asset}.`);
  const source = object(value.source, "source");
  keys(source, ["path", "teacherVariant", "totalPages", "files"], "source");
  if (!Array.isArray(source.files) || source.files.length < 2 || source.files.length > 20) throw new Error("source.files must contain 2–20 entries.");
  const normalizedSource = {
    path: string(source.path, "source.path", 200),
    teacherVariant: string(source.teacherVariant, "source.teacherVariant", 80),
    totalPages: integer(source.totalPages, "source.totalPages", 2, 8),
    files: source.files.map((file, index) => {
      object(file, `source.files[${index}]`);
      keys(file, ["name", "sha256", "decodedSha256"], `source.files[${index}]`);
      const normalized = { name: string(file.name, `source.files[${index}].name`, 100), sha256: string(file.sha256, `source.files[${index}].sha256`, 64) };
      if (!/^[a-f0-9]{64}$/.test(normalized.sha256)) throw new Error(`${normalized.name} has an invalid SHA-256.`);
      if (file.decodedSha256 != null) {
        normalized.decodedSha256 = string(file.decodedSha256, `source.files[${index}].decodedSha256`, 64);
        if (!/^[a-f0-9]{64}$/.test(normalized.decodedSha256)) throw new Error(`${normalized.name} has an invalid decoded SHA-256.`);
      }
      return normalized;
    }),
  };
  if (!Array.isArray(value.panels) || value.panels.length < 2 || value.panels.length > 8) throw new Error("panels must contain 2–8 entries.");
  if (!Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > 30) throw new Error("questions must contain 1–30 entries.");
  const panelIds = new Set();
  const panels = value.panels.map((panel, index) => {
    object(panel, `panels[${index}]`);
    keys(panel, ["id", "number", "imageAsset", "imageArea", "instructionArea", "questionIds"], `panels[${index}]`);
    const id = string(panel.id, `panels[${index}].id`, 80);
    if (panelIds.has(id)) throw new Error(`Duplicate panel id ${id}.`);
    panelIds.add(id);
    if (!allowedAssets.has(panel.imageAsset) || panel.imageAsset === "showText.png") throw new Error(`Unsupported panel image ${panel.imageAsset}.`);
    if (!Array.isArray(panel.questionIds)) throw new Error(`panels[${index}].questionIds must be an array.`);
    return {
      id,
      number: integer(panel.number, `panels[${index}].number`, 1, 8),
      imageAsset: panel.imageAsset,
      imageArea: area(panel.imageArea, `panels[${index}].imageArea`, normalizedSurface),
      instructionArea: panel.instructionArea == null ? null : area(panel.instructionArea, `panels[${index}].instructionArea`, normalizedSurface),
      questionIds: panel.questionIds.map((idValue, questionIndex) => string(idValue, `panels[${index}].questionIds[${questionIndex}]`, 100)),
    };
  }).sort((a, b) => a.number - b.number);
  const questionIds = new Set();
  const questions = value.questions.map((question, index) => {
    object(question, `questions[${index}]`);
    keys(question, ["id", "number", "panelId", "prompt", "correctOptionId", "referenceArea", "audioLogicalKey", "persistSolved", "options", "highlightRegions"], `questions[${index}]`);
    const id = string(question.id, `questions[${index}].id`, 100);
    if (questionIds.has(id)) throw new Error(`Duplicate question id ${id}.`);
    questionIds.add(id);
    if (!panelIds.has(question.panelId)) throw new Error(`Unknown panel ${question.panelId}.`);
    if (!allowedAudio.has(question.audioLogicalKey)) throw new Error(`Unsupported audio mapping ${question.audioLogicalKey}.`);
    if (!Array.isArray(question.options) || question.options.length !== 4) throw new Error(`${id} must have exactly four options.`);
    const optionIds = new Set();
    const options = question.options.map((option, optionIndex) => {
      object(option, `${id}.options[${optionIndex}]`);
      keys(option, ["id", "label", "text", "area"], `${id}.options[${optionIndex}]`);
      const optionId = string(option.id, `${id}.options[${optionIndex}].id`, 120);
      if (optionIds.has(optionId)) throw new Error(`Duplicate option id ${optionId}.`);
      optionIds.add(optionId);
      return { id: optionId, label: string(option.label, `${optionId}.label`, 1), text: string(option.text, `${optionId}.text`, 500), area: area(option.area, `${optionId}.area`, normalizedSurface) };
    });
    if (!optionIds.has(question.correctOptionId)) throw new Error(`${id}.correctOptionId must reference one of its options.`);
    if (!Array.isArray(question.highlightRegions) || !question.highlightRegions.length || question.highlightRegions.length > 20) throw new Error(`${id}.highlightRegions must contain 1–20 entries.`);
    return {
      id,
      number: integer(question.number, `${id}.number`, 1, 30),
      panelId: question.panelId,
      prompt: string(question.prompt, `${id}.prompt`, 500),
      correctOptionId: question.correctOptionId,
      referenceArea: area(question.referenceArea, `${id}.referenceArea`, normalizedSurface),
      audioLogicalKey: question.audioLogicalKey,
      persistSolved: question.persistSolved !== false,
      options,
      highlightRegions: question.highlightRegions.map((region, regionIndex) => {
        object(region, `${id}.highlightRegions[${regionIndex}]`);
        keys(region, ["id", "x", "y", "width", "height"], `${id}.highlightRegions[${regionIndex}]`);
        const { id: regionId, ...bounds } = region;
        return { id: string(regionId, `${id}.highlightRegions[${regionIndex}].id`, 80), ...area(bounds, `${id}.highlightRegions[${regionIndex}]`, normalizedTextSurface) };
      }),
    };
  }).sort((a, b) => a.number - b.number);
  for (const panel of panels) for (const id of panel.questionIds) if (!questionIds.has(id)) throw new Error(`Panel ${panel.id} references unknown question ${id}.`);
  return {
    schemaVersion: integer(value.schemaVersion, "schemaVersion", 1, 1),
    activityId: string(value.activityId, "activityId", 100),
    source: normalizedSource,
    surface: normalizedSurface,
    textSurface: normalizedTextSurface,
    assets,
    panels,
    questions,
  };
}

export function parseMultipleChoiceAuthoringJson(text, maximumBytes = 160_000) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > maximumBytes) throw new Error("Multiple-choice authoring payload is too large.");
  return normalizeMultipleChoiceAuthoring(JSON.parse(text));
}
