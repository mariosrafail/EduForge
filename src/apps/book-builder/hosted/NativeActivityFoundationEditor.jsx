import { NativeOpenResponseEditor } from "./NativeOpenResponseEditor.jsx";
import { NativeImageEditor } from "./NativeImageEditor.jsx";

export function NativeActivityFoundationEditor({ bookSlug, componentSlug, activityId, kind, placementLabel, onDirtyChange = () => {} }) {
  if (kind === "open-response") return <NativeOpenResponseEditor {...{ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange }} />;
  return <NativeImageEditor {...{ bookSlug, componentSlug, activityId, placementLabel, onDirtyChange }} />;
}
