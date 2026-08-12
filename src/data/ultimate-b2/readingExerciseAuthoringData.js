// Compatibility only. Runtime callers should use readingExerciseRuntimeData.js so
// it is explicit that this module no longer exposes full publisher authoring.
export {
  getUltimateB2ReadingExerciseRuntime as getUltimateB2ReadingExerciseAuthoring,
  getUltimateB2ReadingExercisePresentationFeatures,
} from "./readingExerciseRuntimeData.js";
