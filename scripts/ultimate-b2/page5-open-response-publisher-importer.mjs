import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeUltimateB2Page5OpenResponseAuthoring,
  normalizeUltimateB2Page5TeacherAnswers,
  ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
} from "../../src/data/ultimate-b2/page5AuthoringSchema.js";
import { importUltimateB2OpenResponsePublisherBundle } from "./open-response-publisher-importer.mjs";

export const PAGE5_OPEN_RESPONSE_SOURCE_FILES = Object.freeze(["obj_params.xml", "ebook_obj_params.xml", "image_1.png", "image_2.png"]);
export const PAGE5_OPEN_RESPONSE_SOURCE_KIND = "decoded-publisher-iwb";

function layerBySource(genericAuthoring, sourceFile) {
  const layer = genericAuthoring.artworkLayers.find((candidate) => candidate.sourceFile === sourceFile);
  if (!layer) throw new Error(`Page 5 source is missing ${sourceFile}.`);
  return layer;
}

export async function importUltimateB2Page5OpenResponsePublisherSource(sourceDirectory) {
  const files = await Promise.all(PAGE5_OPEN_RESPONSE_SOURCE_FILES.map(async (name) => ({ name, bytes: await readFile(path.join(sourceDirectory, name)) })));
  const generic = await importUltimateB2OpenResponsePublisherBundle({ activityId: ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID, files });
  const quote = layerBySource(generic.publicAuthoring, "image_1.png");
  const instruction = layerBySource(generic.publicAuthoring, "image_2.png");
  const publicAuthoring = normalizeUltimateB2Page5OpenResponseAuthoring({
    schemaVersion: 2,
    activityId: ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
    source: {
      kind: PAGE5_OPEN_RESPONSE_SOURCE_KIND,
      canvas: generic.publicAuthoring.surface,
      files: generic.publicAuthoring.source.files,
    },
    surface: generic.publicAuthoring.surface,
    visualCapabilities: { instructionImage: "unit1.page5.exercise1.instruction", showText: { enabled: false, showTextImage: null } },
    instructionImageAlt: "Read the quote and discuss these questions with a partner.",
    quoteArtworkBinding: "unit1.page5.exercise1.quote",
    artwork: {
      instruction: { binding: "unit1.page5.exercise1.instruction", sourceFile: instruction.sourceFile, naturalSize: instruction.naturalSize, area: instruction.area },
      quote: { binding: "unit1.page5.exercise1.quote", sourceFile: quote.sourceFile, naturalSize: quote.naturalSize, area: quote.area },
    },
    questions: generic.publicAuthoring.questions,
  });
  const teacherAuthoring = normalizeUltimateB2Page5TeacherAnswers(generic.teacherAuthoring);
  return {
    activityId: ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID,
    publicAuthoring,
    teacherAuthoring,
    report: {
      sourceFilesFound: PAGE5_OPEN_RESPONSE_SOURCE_FILES,
      canvas: generic.report.canvas,
      questionCount: generic.report.questionCount,
      responseRegionCount: generic.report.responseRegionCount,
      imageCount: generic.report.imageCount,
      lineCounts: publicAuthoring.questions.map((question) => question.responseRegion.presentation.lineCount),
      validation: generic.report.validation,
    },
  };
}
