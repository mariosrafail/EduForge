import { NativeImagePresentation } from "../../../native-image/NativeImageSurface.jsx";
import { NativeOpenResponseStudentSurface } from "../../../native-open-response/NativeOpenResponseStudentSurface.jsx";
import { NativeSingleChoiceStudentSurface } from "../../../native-single-choice/NativeSingleChoiceStudentSurface.jsx";
import { NativeCompleteSentencesStudentSurface } from "../../../native-complete-sentences/NativeCompleteSentencesSurface.jsx";
import { NativeReadableTextPresentation } from "../../../native-readable-text/NativeReadableTextPresentation.jsx";
import { NativeListeningStudentSurface } from "../../../native-listening/NativeListeningSurface.jsx";
import { NativeDragDropStudentSurface } from "../../../native-drag-drop/NativeDragDropSurface.jsx";
import { publishedNativeAssetUrl } from "virtual:component-publication";

export function PublishedNativeStudentActivityRunner({ entry, publication, responses = null, initialResponses = null, onResponsesChange = null, readOnly = false, showMetadataHeader = true, presentation = null }) {
  const document = entry.document;
  const assetUrl = (assetId) => {
    const reference = document.assets.find((asset) => asset.assetId === assetId);
    return publishedNativeAssetUrl(publication, reference);
  };
  return <NativeReadableTextPresentation document={document} assetUrl={assetUrl} presentation={presentation}>{(activityPresentation, audioHotspotPresentation) => <article className="published-native-activity" data-native-kind={entry.kind} data-release-id={publication.releaseId}>
    {showMetadataHeader ? <header><h2>{document.metadata.title}</h2>{document.metadata.visibleInstructionText ? <p>{document.metadata.visibleInstructionText}</p> : null}</header> : null}
    {entry.kind === "image" ? <NativeImagePresentation document={document} assetUrl={assetUrl} className="native-runtime-surface" audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {entry.kind === "open-response" ? <NativeOpenResponseStudentSurface document={document} assetUrl={assetUrl} responses={responses} initialResponses={initialResponses} onResponsesChange={onResponsesChange} readOnly={readOnly} audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {entry.kind === "single-choice" ? <NativeSingleChoiceStudentSurface document={document} assetUrl={assetUrl} responses={responses} initialResponses={initialResponses} onResponsesChange={onResponsesChange} readOnly={readOnly} audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {entry.kind === "complete-sentences" ? <NativeCompleteSentencesStudentSurface document={document} assetUrl={assetUrl} responses={responses} initialResponses={initialResponses} onResponsesChange={onResponsesChange} readOnly={readOnly} audioHotspotPresentation={audioHotspotPresentation} /> : null}
    {entry.kind === "listening" ? <NativeListeningStudentSurface document={document} assetUrl={assetUrl} responses={responses} initialResponses={initialResponses} onResponsesChange={onResponsesChange} readOnly={readOnly} presentation={activityPresentation} /> : null}
    {entry.kind === "drag-drop" ? <NativeDragDropStudentSurface document={document} assetUrl={assetUrl} responses={responses} initialResponses={initialResponses} onResponsesChange={onResponsesChange} readOnly={readOnly} /> : null}
  </article>}</NativeReadableTextPresentation>;
}

export { PublishedNativeStudentActivityRunner as PublishedNativeActivityRunner };
