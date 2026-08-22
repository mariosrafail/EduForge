import { NativeOpenResponseEditor } from "./NativeOpenResponseEditor.jsx";
import { NativeImageEditor } from "./NativeImageEditor.jsx";
import { NativeSingleChoiceEditor } from "./NativeSingleChoiceEditor.jsx";
import { NativeCompleteSentencesEditor } from "./NativeCompleteSentencesEditor.jsx";

export function NativeActivityFoundationEditor({ bookSlug, componentSlug, activityId, kind, placementLabel, onDirtyChange = () => {}, onSaved = () => {} }) {
  if (kind === "open-response") return <NativeOpenResponseEditor {...{ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange, onSaved }} />;
  if (kind === "image") return <NativeImageEditor {...{ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange, onSaved }} />;
  if (kind === "single-choice") return <NativeSingleChoiceEditor {...{ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange, onSaved }} />;
  if (kind === "complete-sentences") return <NativeCompleteSentencesEditor {...{ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange, onSaved }} />;
  return <section className="native-activity-foundation" role="alert">Unsupported native activity kind.</section>;
}
