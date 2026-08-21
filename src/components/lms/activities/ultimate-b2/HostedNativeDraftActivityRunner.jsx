import { NativeImageSurface } from "../../../native-image/NativeImageSurface.jsx";
import { NativeOpenResponseStudentSurface } from "../../../native-open-response/NativeOpenResponseStudentSurface.jsx";
import { NativeOpenResponseTeacherSurface } from "../../../native-open-response/NativeOpenResponseTeacherSurface.jsx";
import { NativeSingleChoiceStudentSurface } from "../../../native-single-choice/NativeSingleChoiceStudentSurface.jsx";
import { NativeSingleChoiceTeacherSurface } from "../../../native-single-choice/NativeSingleChoiceTeacherSurface.jsx";
import { hostedNativeDraftAssetUrl } from "virtual:hosted-native-drafts";

export function HostedNativeDraftActivityRunner({ activityId, state, teacherMode = false, showMetadataHeader = true }) {
  if (state.kind === "loading") return <p role="status">Loading native activity draft…</p>;
  if (state.kind === "unavailable") return <p role="alert">Native activity draft was not found.</p>;
  if (state.kind === "error") return <p role="alert">Native activity draft could not be loaded.</p>;
  if (state.kind !== "ready" || !state.entry) return null;
  const { kind, document } = state.entry;
  const assetUrl = (assetId) => hostedNativeDraftAssetUrl(activityId, assetId);
  return <article className="hosted-native-draft-activity" data-native-kind={kind} data-native-draft="true">
    {showMetadataHeader ? <header><h2>{document.metadata.title}</h2>{document.metadata.visibleInstructionText ? <p>{document.metadata.visibleInstructionText}</p> : null}</header> : null}
    {kind === "image" ? <NativeImageSurface document={document} assetUrl={assetUrl} className="native-runtime-surface" /> : null}
    {kind === "open-response" && (!teacherMode || state.teacher.kind !== "ready") ? <NativeOpenResponseStudentSurface document={document} assetUrl={assetUrl} /> : null}
    {kind === "open-response" && teacherMode && state.teacher.kind === "loading" ? <p role="status">Loading Teacher model answers…</p> : null}
    {kind === "open-response" && teacherMode && state.teacher.kind === "error" ? <p role="alert">Teacher model answers are unavailable.</p> : null}
    {kind === "open-response" && teacherMode && state.teacher.entry ? <NativeOpenResponseTeacherSurface publicDocument={document} teacherDocument={state.teacher.entry.document} assetUrl={assetUrl} /> : null}
    {kind === "single-choice" && !teacherMode ? <NativeSingleChoiceStudentSurface document={document} assetUrl={assetUrl} /> : null}
    {kind === "single-choice" && teacherMode && state.teacher.kind === "loading" ? <p role="status">Loading Teacher answers…</p> : null}
    {kind === "single-choice" && teacherMode && state.teacher.kind === "error" ? <p role="alert">Teacher answers are unavailable.</p> : null}
    {kind === "single-choice" && teacherMode && state.teacher.entry ? <NativeSingleChoiceTeacherSurface publicDocument={document} teacherDocument={state.teacher.entry.document} /> : null}
  </article>;
}
