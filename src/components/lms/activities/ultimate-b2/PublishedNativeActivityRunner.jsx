import { useEffect, useState } from "react";

import { NativeImageSurface } from "../../../native-image/NativeImageSurface.jsx";
import { NativeOpenResponseStudentSurface } from "../../../native-open-response/NativeOpenResponseStudentSurface.jsx";
import { NativeOpenResponseTeacherSurface } from "../../../native-open-response/NativeOpenResponseTeacherSurface.jsx";
import { NativeSingleChoiceStudentSurface } from "../../../native-single-choice/NativeSingleChoiceStudentSurface.jsx";
import { NativeSingleChoiceTeacherSurface } from "../../../native-single-choice/NativeSingleChoiceTeacherSurface.jsx";
import { loadPublishedNativeTeacherDocument, publishedNativeAssetUrl } from "virtual:component-publication";

export function PublishedNativeActivityRunner({ entry, publication, teacherMode = false, responses = null, initialResponses = null, onResponsesChange = null, readOnly = false, showMetadataHeader = true }) {
  const [teacherState, setTeacherState] = useState({ kind: "idle", document: null });
  const document = entry.document;
  useEffect(() => {
    setTeacherState({ kind: "idle", document: null });
    if (!teacherMode || !["open-response", "single-choice"].includes(entry.kind)) return undefined;
    const controller = new AbortController();
    setTeacherState({ kind: "loading", document: null });
    loadPublishedNativeTeacherDocument(publication, document.activityId, { signal: controller.signal })
      .then((teacherDocument) => { if (!controller.signal.aborted) setTeacherState({ kind: "ready", document: teacherDocument }); })
      .catch(() => { if (!controller.signal.aborted) setTeacherState({ kind: "error", document: null }); });
    return () => controller.abort();
  }, [document.activityId, entry.kind, publication.releaseId, teacherMode]);
  const assetUrl = (assetId) => {
    const reference = document.assets.find((asset) => asset.assetId === assetId);
    return publishedNativeAssetUrl(publication, reference);
  };
  return <article className="published-native-activity" data-native-kind={entry.kind} data-release-id={publication.releaseId}>
    {showMetadataHeader ? <header><h2>{document.metadata.title}</h2>{document.metadata.visibleInstructionText ? <p>{document.metadata.visibleInstructionText}</p> : null}</header> : null}
    {entry.kind === "image" ? <NativeImageSurface document={document} assetUrl={assetUrl} className="native-runtime-surface" /> : null}
    {entry.kind === "open-response" && !teacherMode ? <NativeOpenResponseStudentSurface document={document} assetUrl={assetUrl} responses={responses} initialResponses={initialResponses} onResponsesChange={onResponsesChange} readOnly={readOnly} /> : null}
    {entry.kind === "open-response" && teacherMode && teacherState.kind === "loading" ? <p role="status">Loading Teacher model answers…</p> : null}
    {entry.kind === "open-response" && teacherMode && teacherState.kind === "error" ? <p role="alert">Teacher model answers are unavailable.</p> : null}
    {entry.kind === "open-response" && teacherMode && teacherState.document ? <NativeOpenResponseTeacherSurface publicDocument={document} teacherDocument={teacherState.document} assetUrl={assetUrl} /> : null}
    {entry.kind === "single-choice" && !teacherMode ? <NativeSingleChoiceStudentSurface document={document} assetUrl={assetUrl} responses={responses} initialResponses={initialResponses} onResponsesChange={onResponsesChange} readOnly={readOnly} /> : null}
    {entry.kind === "single-choice" && teacherMode && teacherState.kind === "loading" ? <p role="status">Loading Teacher answers…</p> : null}
    {entry.kind === "single-choice" && teacherMode && teacherState.kind === "error" ? <p role="alert">Teacher answers are unavailable.</p> : null}
    {entry.kind === "single-choice" && teacherMode && teacherState.document ? <NativeSingleChoiceTeacherSurface publicDocument={document} teacherDocument={teacherState.document} /> : null}
  </article>;
}
