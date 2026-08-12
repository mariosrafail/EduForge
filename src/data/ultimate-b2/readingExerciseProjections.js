import {
  normalizeUltimateB2CompleteSentencesAuthoring,
  normalizeUltimateB2DebateClubAuthoring,
  ULTIMATE_B2_COMPLETE_SENTENCES_ID,
  ULTIMATE_B2_DEBATE_CLUB_ID,
} from "./readingExerciseAuthoringSchema.js";

function clone(value) {
  return structuredClone(value);
}

function projectArtwork(value) {
  const { sourceFile: _sourcePrivateFilename, ...studentArtwork } = value;
  return clone(studentArtwork);
}

function projectCompleteSentencesStudent(authoring) {
  const value = normalizeUltimateB2CompleteSentencesAuthoring(authoring);
  const wordBank = value.blanks
    .map((blank) => blank.revealedWord)
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }))
    .map((text, index) => ({ id: `word-${index + 1}`, text }));

  return {
    schemaVersion: 1,
    activityId: value.activityId,
    interactionType: "word-bank-placement",
    surface: clone(value.surface),
    visualCapabilities: clone(value.visualCapabilities),
    instruction: projectArtwork(value.instruction),
    example: clone(value.example),
    sentences: clone(value.sentences),
    blanks: value.blanks.map(({ revealedWord: _privateAnswer, ...blank }) => clone(blank)),
    wordBank,
  };
}

function projectCompleteSentencesTeacher(authoring) {
  const value = normalizeUltimateB2CompleteSentencesAuthoring(authoring);
  return {
    schemaVersion: 1,
    activityId: value.activityId,
    solutionType: "complete-sentences",
    blanks: Object.fromEntries(value.blanks.map((blank) => [blank.id, blank.revealedWord])),
  };
}

function projectDebateClubStudent(authoring) {
  const value = normalizeUltimateB2DebateClubAuthoring(authoring);
  return {
    schemaVersion: 1,
    activityId: value.activityId,
    interactionType: "open-response",
    surface: clone(value.surface),
    visualCapabilities: clone(value.visualCapabilities),
    instructionImageAlt: value.instructionImageAlt,
    artwork: Object.fromEntries(Object.entries(value.artwork).map(([key, artwork]) => [key, projectArtwork(artwork)])),
    parts: value.parts.map((part) => ({
      id: part.id,
      number: part.number,
      prompt: part.prompt,
      promptArea: clone(part.promptArea),
      promptStyle: clone(part.promptStyle),
      partImageAlt: part.partImageAlt,
      visualObjects: Object.fromEntries(Object.entries(part.visualObjects).map(([key, artwork]) => [key, projectArtwork(artwork)])),
      responseRegion: {
        id: part.responseRegion.id,
        area: clone(part.responseRegion.area),
        ariaLabel: `Part ${part.number} learner response`,
        presentation: clone(part.responseRegion.presentation),
      },
    })),
  };
}

function projectDebateClubTeacher(authoring) {
  const value = normalizeUltimateB2DebateClubAuthoring(authoring);
  return {
    schemaVersion: 1,
    activityId: value.activityId,
    solutionType: "publisher-model-response",
    parts: Object.fromEntries(value.parts.map((part) => [part.id, part.responseRegion.revealText])),
  };
}

export function projectStudentReadingActivity(authoring) {
  if (authoring?.activityId === ULTIMATE_B2_COMPLETE_SENTENCES_ID) return projectCompleteSentencesStudent(authoring);
  if (authoring?.activityId === ULTIMATE_B2_DEBATE_CLUB_ID) return projectDebateClubStudent(authoring);
  throw new Error("Unknown Reading exercise activity ID.");
}

export function projectTeacherReadingSolution(authoring) {
  if (authoring?.activityId === ULTIMATE_B2_COMPLETE_SENTENCES_ID) return projectCompleteSentencesTeacher(authoring);
  if (authoring?.activityId === ULTIMATE_B2_DEBATE_CLUB_ID) return projectDebateClubTeacher(authoring);
  throw new Error("Unknown Reading exercise activity ID.");
}
