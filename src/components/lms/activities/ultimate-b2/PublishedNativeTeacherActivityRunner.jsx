import { NativeMarkWordsTeacherSurface } from "../../../native-mark-words/NativeMarkWordsTeacherSurface.jsx";
import { useEffect, useState } from "react";

import { NativeImageLearnerContent, NativeImagePresentation } from "../../../native-image/NativeImageSurface.jsx";
import { NativeOpenResponseTeacherSurface } from "../../../native-open-response/NativeOpenResponseTeacherSurface.jsx";
import { NativeSingleChoiceTeacherSurface } from "../../../native-single-choice/NativeSingleChoiceTeacherSurface.jsx";
import { NativeCompleteSentencesTeacherSurface } from "../../../native-complete-sentences/NativeCompleteSentencesSurface.jsx";
import { NativeReadableTextPresentation } from "../../../native-readable-text/NativeReadableTextPresentation.jsx";
import "./nativeActivityText.css";
import { NativeListeningTeacherSurface } from "../../../native-listening/NativeListeningSurface.jsx";
import { NativeOldschoolListeningTeacherSurface } from "../../../native-oldschool-listening/NativeOldschoolListeningTeacherSurface.jsx";
import { NativeDragDropTeacherSurface } from "../../../native-drag-drop/NativeDragDropTeacherSurface.jsx";
import { loadPublishedNativeTeacherDocument, publishedNativeAssetUrl } from "virtual:component-publication";

const teacherDocumentKinds = new Set(["open-response", "single-choice", "complete-sentences", "listening", "oldschool-listening", "drag-drop", "mark-the-words"]);

export function PublishedNativeTeacherActivityRunner({ entry, publication, showMetadataHeader = true, presentation = null }) {
  const [teacherState, setTeacherState] = useState({ kind: "idle", document: null });
  const document = entry.document;
  useEffect(() => {
    setTeacherState({ kind: "idle", document: null });
    if (!teacherDocumentKinds.has(entry.kind)) return undefined;
    const controller = new AbortController();
    setTeacherState({ kind: "loading", document: null });
    loadPublishedNativeTeacherDocument(publication, document.activityId, { signal: controller.signal })
      .then((teacherDocument) => { if (!controller.signal.aborted) setTeacherState({ kind: "ready", document: teacherDocument }); })
      .catch(() => { if (!controller.signal.aborted) setTeacherState({ kind: "error", document: null }); });
    return () => controller.abort();
  }, [document.activityId, entry.kind, publication.releaseId]);
  const assetUrl = (assetId) => {
    const reference = document.assets.find((asset) => asset.assetId === assetId);
    return publishedNativeAssetUrl(publication, reference);
  };
  const loadingLabel = ["open-response", "listening", "oldschool-listening"].includes(entry.kind) ? "Loading Teacher model answers…" : "Loading Teacher answers…";
  const errorLabel = ["open-response", "listening", "oldschool-listening"].includes(entry.kind) ? "Teacher model answers are unavailable." : "Teacher answers are unavailable.";
  return <NativeReadableTextPresentation document={document} assetUrl={assetUrl} presentation={presentation}>{(activityPresentation, audioHotspotPresentation) => <article className="published-native-activity" data-native-kind={entry.kind} data-release-id={publication.releaseId} data-native-metadata={showMetadataHeader || undefined}>
    {showMetadataHeader ? <header><h2>{document.metadata.title}</h2>{document.metadata.visibleInstructionText ? <p className="native-activity-visible-instruction">{document.metadata.visibleInstructionText}</p> : null}</header> : null}
    {entry.kind === "mark-the-words" && teacherState.document ? <NativeMarkWordsTeacherSurface publicDocument={document} teacherDocument={teacherState.document} assetUrl={assetUrl} identity={publication.releaseId} presentation={activityPresentation} /> : null}
    {entry.kind === "image" ? <NativeImagePresentation document={document} assetUrl={assetUrl} className="native-runtime-surface" audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {entry.kind === "image" && showMetadataHeader ? <NativeImageLearnerContent document={document} /> : null}
    {teacherDocumentKinds.has(entry.kind) && teacherState.kind === "loading" ? <p role="status">{loadingLabel}</p> : null}
    {teacherDocumentKinds.has(entry.kind) && teacherState.kind === "error" ? <p role="alert">{errorLabel}</p> : null}
    {entry.kind === "open-response" && teacherState.document ? <NativeOpenResponseTeacherSurface publicDocument={document} teacherDocument={teacherState.document} assetUrl={assetUrl} presentation={activityPresentation} audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {entry.kind === "single-choice" && teacherState.document ? <NativeSingleChoiceTeacherSurface publicDocument={document} teacherDocument={teacherState.document} assetUrl={assetUrl} presentation={activityPresentation} audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {entry.kind === "complete-sentences" && teacherState.document ? <NativeCompleteSentencesTeacherSurface publicDocument={document} teacherDocument={teacherState.document} assetUrl={assetUrl} presentation={activityPresentation} audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {entry.kind === "listening" && teacherState.document ? <NativeListeningTeacherSurface publicDocument={document} teacherDocument={teacherState.document} assetUrl={assetUrl} presentation={activityPresentation} /> : null}
    {entry.kind === "oldschool-listening" && teacherState.document ? <NativeOldschoolListeningTeacherSurface publicDocument={document} teacherDocument={teacherState.document} assetUrl={assetUrl} presentation={activityPresentation} /> : null}
    {entry.kind === "drag-drop" && teacherState.document ? <NativeDragDropTeacherSurface publicDocument={document} teacherDocument={teacherState.document} assetUrl={assetUrl} presentation={activityPresentation} /> : null}
  </article>}</NativeReadableTextPresentation>;
}

export { PublishedNativeTeacherActivityRunner as PublishedNativeActivityRunner };
