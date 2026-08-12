import {
  normalizeUltimateB2Page5ImageAuthoring,
  normalizeUltimateB2Page5OpenResponseAuthoring,
} from "./page5AuthoringSchema.js";

function projectArtwork(value) {
  const { sourceFile: _privateSourceFilename, ...runtime } = value;
  return structuredClone(runtime);
}

export function projectUltimateB2Page5OpenResponseRuntime(authoring) {
  const value = normalizeUltimateB2Page5OpenResponseAuthoring(authoring);
  return {
    schemaVersion: 2,
    activityId: value.activityId,
    surface: structuredClone(value.surface),
    visualCapabilities: structuredClone(value.visualCapabilities),
    instructionImageAlt: value.instructionImageAlt,
    quoteArtworkBinding: value.quoteArtworkBinding,
    artwork: Object.fromEntries(Object.entries(value.artwork).map(([key, artwork]) => [key, projectArtwork(artwork)])),
    questions: value.questions.map((question, index) => ({
      ...structuredClone(question),
      responseRegion: {
        ...structuredClone(question.responseRegion),
        ariaLabel: `Write a response for question ${index + 1}`,
      },
    })),
  };
}

export function projectUltimateB2Page5ImageRuntime(authoring) {
  const value = normalizeUltimateB2Page5ImageAuthoring(authoring);
  return {
    schemaVersion: 1,
    activityId: value.activityId,
    visualCapabilities: structuredClone(value.visualCapabilities),
    instructionImageAlt: value.instructionImageAlt,
    mainImage: value.mainImage,
    mainImageAlt: value.mainImageAlt,
  };
}
