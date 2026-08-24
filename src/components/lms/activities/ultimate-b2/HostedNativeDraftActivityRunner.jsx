import { NativeImagePresentation } from "../../../native-image/NativeImageSurface.jsx";
import { NativeOpenResponseStudentSurface } from "../../../native-open-response/NativeOpenResponseStudentSurface.jsx";
import { NativeOpenResponseTeacherSurface } from "../../../native-open-response/NativeOpenResponseTeacherSurface.jsx";
import { NativeSingleChoiceStudentSurface } from "../../../native-single-choice/NativeSingleChoiceStudentSurface.jsx";
import { NativeSingleChoiceTeacherSurface } from "../../../native-single-choice/NativeSingleChoiceTeacherSurface.jsx";
import { NativeCompleteSentencesStudentSurface, NativeCompleteSentencesTeacherSurface } from "../../../native-complete-sentences/NativeCompleteSentencesSurface.jsx";
import { NativeReadableTextPresentation } from "../../../native-readable-text/NativeReadableTextPresentation.jsx";
import { NativeListeningStudentSurface, NativeListeningTeacherSurface } from "../../../native-listening/NativeListeningSurface.jsx";
import { NativeDragDropStudentSurface, NativeDragDropTeacherSurface } from "../../../native-drag-drop/NativeDragDropSurface.jsx";
import { hostedNativeDraftAssetUrl } from "virtual:hosted-native-drafts";

export function HostedNativeDraftActivityRunner({ activityId, state, teacherMode = false, showMetadataHeader = true, presentation = null }) {
  if (state.kind === "loading") return <p role="status">Loading native activity draft…</p>;
  if (state.kind === "unavailable") return <p role="alert">Native activity draft was not found.</p>;
  if (state.kind === "error") return <p role="alert">Native activity draft could not be loaded.</p>;
  if (state.kind !== "ready" || !state.entry) return null;
  const { kind, document } = state.entry;
  const assetUrl = (assetId) => hostedNativeDraftAssetUrl(activityId, assetId);
  return <NativeReadableTextPresentation document={document} assetUrl={assetUrl} presentation={presentation}>{(activityPresentation, audioHotspotPresentation) => <article className="hosted-native-draft-activity" data-native-kind={kind} data-native-draft="true">
    {showMetadataHeader ? <header><h2>{document.metadata.title}</h2>{document.metadata.visibleInstructionText ? <p>{document.metadata.visibleInstructionText}</p> : null}</header> : null}
    {kind === "image" ? <NativeImagePresentation document={document} assetUrl={assetUrl} className="native-runtime-surface" audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {kind === "open-response" && (!teacherMode || state.teacher.kind !== "ready") ? <NativeOpenResponseStudentSurface document={document} assetUrl={assetUrl} audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {kind === "open-response" && teacherMode && state.teacher.kind === "loading" ? <p role="status">Loading Teacher model answers…</p> : null}
    {kind === "open-response" && teacherMode && state.teacher.kind === "error" ? <p role="alert">Teacher model answers are unavailable.</p> : null}
    {kind === "open-response" && teacherMode && state.teacher.entry ? <NativeOpenResponseTeacherSurface publicDocument={document} teacherDocument={state.teacher.entry.document} assetUrl={assetUrl} presentation={activityPresentation} audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {kind === "single-choice" && !teacherMode ? <NativeSingleChoiceStudentSurface document={document} assetUrl={assetUrl} audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {kind === "single-choice" && teacherMode && state.teacher.kind === "loading" ? <p role="status">Loading Teacher answers…</p> : null}
    {kind === "single-choice" && teacherMode && state.teacher.kind === "error" ? <p role="alert">Teacher answers are unavailable.</p> : null}
    {kind === "single-choice" && teacherMode && state.teacher.entry ? <NativeSingleChoiceTeacherSurface publicDocument={document} teacherDocument={state.teacher.entry.document} assetUrl={assetUrl} presentation={activityPresentation} audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {kind === "complete-sentences" && !teacherMode ? <NativeCompleteSentencesStudentSurface document={document} assetUrl={assetUrl} audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {kind === "complete-sentences" && teacherMode && state.teacher.kind === "loading" ? <p role="status">Loading Teacher answers…</p> : null}
    {kind === "complete-sentences" && teacherMode && state.teacher.kind === "error" ? <p role="alert">Teacher answers are unavailable.</p> : null}
    {kind === "complete-sentences" && teacherMode && state.teacher.entry ? <NativeCompleteSentencesTeacherSurface publicDocument={document} teacherDocument={state.teacher.entry.document} assetUrl={assetUrl} presentation={activityPresentation} audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {kind === "listening" && !teacherMode ? <NativeListeningStudentSurface document={document} assetUrl={assetUrl} /> : null}
    {kind === "listening" && teacherMode && state.teacher.kind === "loading" ? <p role="status">Loading Teacher model answers…</p> : null}
    {kind === "listening" && teacherMode && state.teacher.kind === "error" ? <p role="alert">Teacher model answers are unavailable.</p> : null}
    {kind === "listening" && teacherMode && state.teacher.entry ? <NativeListeningTeacherSurface publicDocument={document} teacherDocument={state.teacher.entry.document} assetUrl={assetUrl} presentation={activityPresentation} /> : null}
    {kind === "drag-drop" && !teacherMode ? <NativeDragDropStudentSurface document={document} assetUrl={assetUrl} /> : null}
    {kind === "drag-drop" && teacherMode && state.teacher.kind === "loading" ? <p role="status">Loading Teacher answers…</p> : null}
    {kind === "drag-drop" && teacherMode && state.teacher.kind === "error" ? <p role="alert">Teacher answers are unavailable.</p> : null}
    {kind === "drag-drop" && teacherMode && state.teacher.entry ? <NativeDragDropTeacherSurface publicDocument={document} teacherDocument={state.teacher.entry.document} assetUrl={assetUrl} presentation={activityPresentation} /> : null}
  </article>}</NativeReadableTextPresentation>;
}
