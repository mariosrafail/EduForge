import { isUltimateB2ConfigurableOpenResponse } from "./openResponseActivityRegistry.js";

export const ULTIMATE_B2_HOSTED_OPEN_RESPONSE_IMPORT_SCHEMA_VERSION = "1.0";
export const ULTIMATE_B2_HOSTED_OPEN_RESPONSE_TEACHER_SCHEMA_VERSION = "1.0";

const safeAssetPath = /^\/preview\/open-response-assets\/[a-f0-9]{64}\.(?:png|jpg|webp)$/;
const safePublishedAssetPath = /^\/\.netlify\/functions\/book-content\?action=published-release-asset&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book&releaseId=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}&sha256=[a-f0-9]{64}&extension=(?:png|jpg|webp)$/i;
const safeReleasePreviewAssetPath = /^\/preview\/releases\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/assets\/[a-f0-9]{64}\.(?:png|jpg|webp)$/i;
const safeTextPattern = /(?:[<>]|https?:\/\/|file:\/\/|[a-z]:[\\/]|\\\\|(?:^|\s)\.\.[\\/])/i;

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has unsupported fields.`);
}

function finite(value, label, { minimum = 0, maximum = 8192 } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function boundedText(value, label, { allowEmpty = false, maximum = 5_000 } = {}) {
  if (typeof value !== "string" || value.length > maximum || (!allowEmpty && !value.trim()) || safeTextPattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function size(value, label) {
  exactKeys(value, ["width", "height"], label);
  return { width: finite(value.width, `${label}.width`, { minimum: 1 }), height: finite(value.height, `${label}.height`, { minimum: 1 }) };
}

function area(value, label, surface) {
  exactKeys(value, ["x", "y", "width", "height"], label);
  const result = {
    x: finite(value.x, `${label}.x`),
    y: finite(value.y, `${label}.y`),
    width: finite(value.width, `${label}.width`, { minimum: 1 }),
    height: finite(value.height, `${label}.height`, { minimum: 1 }),
  };
  if (result.x + result.width > surface.width || result.y + result.height > surface.height) throw new Error(`${label} exceeds the imported surface.`);
  return result;
}

function textStyle(value, label) {
  exactKeys(value, ["fontFamily", "fontSize", "color", "align"], label);
  if (!/^#[a-f0-9]{6}$/i.test(value.color) || !["left", "center", "right"].includes(value.align)) throw new Error(`${label} is invalid.`);
  return {
    fontFamily: boundedText(value.fontFamily, `${label}.fontFamily`, { maximum: 100 }),
    fontSize: finite(value.fontSize, `${label}.fontSize`, { minimum: 1, maximum: 100 }),
    color: value.color.toLowerCase(),
    align: value.align,
  };
}

function presentation(value, label, surface, responseArea) {
  exactKeys(value, ["paddingX", "paddingY", "lineSpacing", "fontScale", "lineCount", "linePositions", "lineWidth", "fontFamily", "fontSize", "color", "align"], label);
  const lineCount = finite(value.lineCount, `${label}.lineCount`, { minimum: 1, maximum: 20 });
  if (!Number.isInteger(lineCount) || !Array.isArray(value.linePositions) || value.linePositions.length !== lineCount) throw new Error(`${label}.linePositions is invalid.`);
  return {
    paddingX: finite(value.paddingX, `${label}.paddingX`, { maximum: 80 }),
    paddingY: finite(value.paddingY, `${label}.paddingY`, { maximum: 80 }),
    lineSpacing: finite(value.lineSpacing, `${label}.lineSpacing`, { minimum: 1, maximum: 100 }),
    fontScale: finite(value.fontScale, `${label}.fontScale`, { minimum: 0.4, maximum: 2 }),
    lineCount,
    linePositions: value.linePositions.map((item, index) => finite(item, `${label}.linePositions[${index}]`, { maximum: responseArea.height })),
    lineWidth: finite(value.lineWidth, `${label}.lineWidth`, { minimum: 1, maximum: surface.width }),
    ...textStyle({ fontFamily: value.fontFamily, fontSize: value.fontSize, color: value.color, align: value.align }, `${label}.textStyle`),
  };
}

export function normalizeUltimateB2HostedOpenResponseImport(input, expectedActivityId = input?.activityId, expectedQuestionIds = null, { assetPathPolicy = "preview" } = {}) {
  exactKeys(input, ["schemaVersion", "activityId", "surface", "visualCapabilities", "artworkLayers", "questions"], "Hosted Open Response import");
  if (input.schemaVersion !== ULTIMATE_B2_HOSTED_OPEN_RESPONSE_IMPORT_SCHEMA_VERSION) throw new Error("Unsupported hosted Open Response import schema.");
  if (input.activityId !== expectedActivityId || !isUltimateB2ConfigurableOpenResponse(input.activityId)) throw new Error("Hosted Open Response import activity is unsupported.");
  const surface = size(input.surface, "surface");
  exactKeys(input.visualCapabilities, ["instructionImage", "showText"], "visualCapabilities");
  exactKeys(input.visualCapabilities.showText, ["enabled", "showTextImage"], "visualCapabilities.showText");
  if (input.visualCapabilities.instructionImage !== null || input.visualCapabilities.showText.enabled !== false || input.visualCapabilities.showText.showTextImage !== null) throw new Error("Hosted imports cannot introduce auxiliary media.");
  if (!Array.isArray(input.artworkLayers) || input.artworkLayers.length > 32) throw new Error("Hosted import artwork count is invalid.");
  const artworkLayers = input.artworkLayers.map((layer, index) => {
    const label = `artworkLayers[${index}]`;
    exactKeys(layer, ["id", "binding", "assetPath", "sha256", "naturalSize", "area", "order", "altText", "accessibilityStatus"], label);
    const acceptedAssetPath = safeAssetPath.test(layer.assetPath) || (assetPathPolicy === "runtime" && (safePublishedAssetPath.test(layer.assetPath) || safeReleasePreviewAssetPath.test(layer.assetPath)));
    if (layer.id !== `${input.activityId}-artwork-${index + 1}` || layer.order !== index || !acceptedAssetPath || !/^[a-f0-9]{64}$/.test(layer.sha256) || !layer.assetPath.includes(layer.sha256)) throw new Error(`${label} identity is invalid.`);
    if (!new RegExp(`^open-response\\.${input.activityId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.artwork\\.${index + 1}\\.[a-f0-9]{12}$`).test(layer.binding)) throw new Error(`${label}.binding is invalid.`);
    if (!["review-required", "reviewed", "decorative"].includes(layer.accessibilityStatus)) throw new Error(`${label}.accessibilityStatus is invalid.`);
    return { id: layer.id, binding: layer.binding, assetPath: layer.assetPath, sha256: layer.sha256, naturalSize: size(layer.naturalSize, `${label}.naturalSize`), area: area(layer.area, `${label}.area`, surface), order: index, altText: boundedText(layer.altText, `${label}.altText`, { allowEmpty: true, maximum: 2_000 }), accessibilityStatus: layer.accessibilityStatus };
  });
  if (!Array.isArray(input.questions) || !input.questions.length || input.questions.length > 20) throw new Error("Hosted import question count is invalid.");
  const questionIds = expectedQuestionIds || input.questions.map((_, index) => `${input.activityId}-q${index + 1}`);
  if (questionIds.length !== input.questions.length) throw new Error("Hosted import question topology is incompatible.");
  const questions = input.questions.map((question, index) => {
    const label = `questions[${index}]`;
    exactKeys(question, ["id", "prompt", "promptArea", "promptStyle", "responseRegion"], label);
    if (question.id !== questionIds[index]) throw new Error(`${label}.id is incompatible with the selected activity.`);
    exactKeys(question.responseRegion, ["id", "ariaLabel", "area", "presentation"], `${label}.responseRegion`);
    if (question.responseRegion.id !== `${question.id}-response`) throw new Error(`${label}.responseRegion.id is invalid.`);
    const responseArea = area(question.responseRegion.area, `${label}.responseRegion.area`, surface);
    return {
      id: question.id,
      prompt: boundedText(question.prompt, `${label}.prompt`, { maximum: 2_000 }),
      promptArea: area(question.promptArea, `${label}.promptArea`, surface),
      promptStyle: textStyle(question.promptStyle, `${label}.promptStyle`),
      responseRegion: {
        id: question.responseRegion.id,
        ariaLabel: boundedText(question.responseRegion.ariaLabel, `${label}.responseRegion.ariaLabel`, { maximum: 300 }),
        area: responseArea,
        presentation: presentation(question.responseRegion.presentation, `${label}.responseRegion.presentation`, surface, responseArea),
      },
    };
  });
  return { schemaVersion: input.schemaVersion, activityId: input.activityId, surface, visualCapabilities: { instructionImage: null, showText: { enabled: false, showTextImage: null } }, artworkLayers, questions };
}

export function normalizeUltimateB2HostedOpenResponseTeacherImport(input, expectedActivityId = input?.activityId, expectedQuestionIds = null) {
  exactKeys(input, ["schemaVersion", "activityId", "answers"], "Hosted Teacher Open Response import");
  if (input.schemaVersion !== ULTIMATE_B2_HOSTED_OPEN_RESPONSE_TEACHER_SCHEMA_VERSION || input.activityId !== expectedActivityId || !isUltimateB2ConfigurableOpenResponse(input.activityId)) throw new Error("Hosted Teacher Open Response import identity is invalid.");
  if (!Array.isArray(input.answers) || !input.answers.length || input.answers.length > 20) throw new Error("Hosted Teacher answer count is invalid.");
  const questionIds = expectedQuestionIds || input.answers.map((_, index) => `${input.activityId}-q${index + 1}`);
  if (questionIds.length !== input.answers.length) throw new Error("Hosted Teacher answer topology is incompatible.");
  return {
    schemaVersion: input.schemaVersion,
    activityId: input.activityId,
    answers: input.answers.map((answer, index) => {
      exactKeys(answer, ["questionId", "text"], `answers[${index}]`);
      if (answer.questionId !== questionIds[index]) throw new Error(`answers[${index}].questionId is incompatible.`);
      return { questionId: answer.questionId, text: boundedText(answer.text, `answers[${index}].text`) };
    }),
  };
}

export function applyUltimateB2HostedOpenResponseImport(activity, input) {
  if (!activity || !input) return activity;
  const expectedIds = (activity.runtime?.questions || []).map((question) => question.id);
  const imported = normalizeUltimateB2HostedOpenResponseImport(input, activity.stableNormalizedId, expectedIds);
  const prompts = new Map(imported.questions.map((question) => [question.id, question.prompt]));
  return { ...activity, runtime: { ...activity.runtime, questions: activity.runtime.questions.map((question) => ({ ...question, prompt: prompts.get(question.id) })) } };
}

export function hostedTeacherImportAsSolution(input, activityId, expectedQuestionIds) {
  if (!input) return null;
  const teacher = normalizeUltimateB2HostedOpenResponseTeacherImport(input, activityId, expectedQuestionIds);
  return {
    solutionAvailability: "verified",
    questions: Object.fromEntries(teacher.answers.map((answer) => [answer.questionId, { acceptedAnswers: [answer.text] }])),
  };
}
