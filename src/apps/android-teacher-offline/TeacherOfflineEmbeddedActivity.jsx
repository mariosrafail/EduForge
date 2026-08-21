import { useLayoutEffect, useRef, useState } from "react";

import { ACTIVITY_MODES } from "../../components/lms/activities/activityModes.js";
import { activeBuildProfile } from "../../config/buildProfiles.js";
import { NormalizedStudentsBookActivity } from "../../components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";
import { PublishedNativeActivityRunner } from "../../components/lms/activities/ultimate-b2/PublishedNativeActivityRunner.jsx";
import { HostedNativeDraftActivityRunner } from "../../components/lms/activities/ultimate-b2/HostedNativeDraftActivityRunner.jsx";
import { findStudentsBookImplementation } from "../../data/ultimate-b2/studentsBookCatalog.js";
import { resolveEmbeddedActivityFit } from "./embeddedActivityFit.js";
import TeacherOfflineActivityVideoOverlay from "./TeacherOfflineActivityVideoOverlay.jsx";
import multipleChoiceAuthoring from "virtual:ultimate-b2-multiple-choice-presentation";
import { useHostedOpenResponseDraft, useHostedOpenResponseImport } from "virtual:ultimate-b2-hosted-open-response-drafts";
import { usePublishedComponentRelease } from "virtual:component-publication";
import { useHostedNativeDraftActivity } from "virtual:hosted-native-drafts";
import { HOSTED_VIEWER_RUNTIME_MODES, resolveHostedViewerRuntimeContext } from "./hostedReleasePreview.js";

const sourceAuthoredCanvases = Object.freeze({
  "ultimate-b2-sb-u1-p2-o2": Object.freeze({ width: 1280, height: 728 }),
  "ultimate-b2-sb-u1-p2-o3": Object.freeze({ width: 1280, height: 728 }),
  "ultimate-b2-sb-u1-p2-o4": Object.freeze({ width: 1024, height: 582 }),
  "ultimate-b2-sb-u1-p2-o5": Object.freeze({ width: 1024, height: 582 }),
});

export default function TeacherOfflineEmbeddedActivity({ activityId, title, videoOpen = false, onCloseVideo, listeningShowTextCommand = 0, onListeningStateChange, activityPresentationCommand = null, onActivityPresentationStateChange }) {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const [fit, setFit] = useState({ mode: "scale", scale: 1 });
  const hostedOpenResponseDraft = useHostedOpenResponseDraft(activityId);
  const hostedOpenResponseImport = useHostedOpenResponseImport(activityId);
  const publication = usePublishedComponentRelease();
  const publishedNative = publication.kind === "published" ? publication.projection.nativeActivities?.[activityId] : null;
  const runtimeContext = resolveHostedViewerRuntimeContext();
  const nativeDraftCandidate = runtimeContext.kind === HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW && !findStudentsBookImplementation(activityId);
  const teacherPreview = activeBuildProfile.teacherPresentation
    || (activeBuildProfile.authorizedTeacherPreview && resolveHostedViewerRuntimeContext().teacherPreview);
  const hostedNativeDraft = useHostedNativeDraftActivity(nativeDraftCandidate ? activityId : null, { teacherMode: teacherPreview });
  const authoredCanvas = sourceAuthoredCanvases[activityId] || null;
  const activityMode = teacherPreview
    ? ACTIVITY_MODES.TEACHER_PRESENTATION_OFFLINE
    : ACTIVITY_MODES.ANDROID_OFFLINE;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return undefined;
    let active = true;
    let refreshFrame = 0;
    const update = () => {
      if (!active) return;
      const style = getComputedStyle(viewport);
      const availableWidth = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const availableHeight = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const activity = content.firstElementChild;
      const controls = [...content.querySelectorAll("button, input, textarea, audio, video")]
        .filter((element) => {
          const controlStyle = getComputedStyle(element);
          return controlStyle.display !== "none"
            && controlStyle.visibility !== "hidden"
            && !element.matches('input[type="radio"], input[type="checkbox"]');
        });
      const minimumTargetSize = controls.length
        ? Math.min(...controls.map((element) => Math.min(element.offsetWidth, element.offsetHeight)))
        : undefined;
      const measuredFit = resolveEmbeddedActivityFit({
        availableWidth,
        availableHeight,
        contentWidth: authoredCanvas?.width || Math.max(content.offsetWidth, content.scrollWidth, activity?.scrollWidth || 0),
        contentHeight: authoredCanvas?.height || Math.max(content.offsetHeight, content.scrollHeight, activity?.scrollHeight || 0),
        minimumTargetSize,
        allowUpscale: Boolean(authoredCanvas),
      });
      const next = measuredFit;
      setFit((current) => (
        current.mode === next.mode && Math.abs(current.scale - next.scale) < 0.001 ? current : next
      ));
    };
    update();
    const refresh = () => {
      cancelAnimationFrame(refreshFrame);
      refreshFrame = requestAnimationFrame(() => {
        update();
        refreshFrame = requestAnimationFrame(update);
      });
    };
    refresh();
    document.fonts?.ready.then(refresh);
    content.addEventListener("load", refresh, true);
    globalThis.addEventListener("resize", refresh);
    if (typeof ResizeObserver === "undefined") {
      return () => {
        active = false;
        cancelAnimationFrame(refreshFrame);
        content.removeEventListener("load", refresh, true);
        globalThis.removeEventListener("resize", refresh);
      };
    }
    const observer = new ResizeObserver(refresh);
    observer.observe(viewport);
    observer.observe(content);
    if (content.firstElementChild) observer.observe(content.firstElementChild);
    return () => {
      active = false;
      cancelAnimationFrame(refreshFrame);
      observer.disconnect();
      content.removeEventListener("load", refresh, true);
      globalThis.removeEventListener("resize", refresh);
    };
  }, [activityId, authoredCanvas]);

  return (
    <div
      ref={viewportRef}
      className="teacher-offline-embedded-activity"
      data-embedded-activity-id={activityId}
      data-fit-mode={fit.mode}
      data-fit-scale={fit.scale.toFixed(4)}
      data-fit-policy={authoredCanvas ? "source-authored-canvas" : "standard-contain"}
      aria-label={title || "Students Book activity"}
    >
      <div
        ref={contentRef}
        className="teacher-offline-embedded-activity-content"
        style={{
          "--embedded-activity-scale": fit.scale,
          ...(authoredCanvas ? { width: authoredCanvas.width, height: authoredCanvas.height } : {}),
        }}
      >
        {publishedNative ? <PublishedNativeActivityRunner entry={publishedNative} publication={publication} teacherMode={teacherPreview} showMetadataHeader={false} presentation={{ command: activityPresentationCommand, onStateChange: onActivityPresentationStateChange }} /> : nativeDraftCandidate ? <HostedNativeDraftActivityRunner activityId={activityId} state={hostedNativeDraft} teacherMode={teacherPreview} showMetadataHeader={false} presentation={{ command: activityPresentationCommand, onStateChange: onActivityPresentationStateChange }} /> : <NormalizedStudentsBookActivity
          key={activityId}
          activityId={activityId}
          activityPublicDraft={hostedOpenResponseDraft}
          activityPublicImport={hostedOpenResponseImport.publicImport}
          activityTeacherSolution={hostedOpenResponseImport.teacherSolution}
          mode={activityMode}
          listeningPresentation={{ showTextCommand: listeningShowTextCommand, onStateChange: onListeningStateChange }}
          activityPresentation={{
            command: activityPresentationCommand,
            onStateChange: onActivityPresentationStateChange,
            multipleChoiceAuthoring: teacherPreview && activityId === multipleChoiceAuthoring?.activityId ? multipleChoiceAuthoring : null,
          }}
        />}
      </div>
      {videoOpen && <TeacherOfflineActivityVideoOverlay activityId={activityId} onClose={onCloseVideo} />}
    </div>
  );
}
