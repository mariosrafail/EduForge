import { getNormalizedStudentsBookActivity } from "../../../../data/ultimate-b2/normalizedStudentsBookActivities.js";
import { NormalizedInlineChoiceActivity } from "./shared/NormalizedInlineChoiceActivity.jsx";

const activity = getNormalizedStudentsBookActivity("reading-ex4");

export function ReadingExercise4({ mode, onSubmit }) {
  return <NormalizedInlineChoiceActivity activity={activity} mode={mode} onSubmit={onSubmit} />;
}
