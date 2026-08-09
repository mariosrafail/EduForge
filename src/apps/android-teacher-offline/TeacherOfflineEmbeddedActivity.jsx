import { useLayoutEffect, useRef, useState } from "react";

import { ACTIVITY_MODES } from "../../components/lms/activities/activityModes.js";
import { NormalizedStudentsBookActivity } from "../../components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";
import { resolveEmbeddedActivityFit } from "./embeddedActivityFit.js";
import TeacherOfflineActivityVideoOverlay from "./TeacherOfflineActivityVideoOverlay.jsx";

export default function TeacherOfflineEmbeddedActivity({ activityId, title, videoOpen = false, onCloseVideo, listeningShowTextCommand = 0, onListeningStateChange }) {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const [fit, setFit] = useState({ mode: "scale", scale: 1 });

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
        contentWidth: Math.max(content.offsetWidth, content.scrollWidth, activity?.scrollWidth || 0),
        contentHeight: Math.max(content.offsetHeight, content.scrollHeight, activity?.scrollHeight || 0),
        minimumTargetSize,
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
  }, [activityId]);

  return (
    <div
      ref={viewportRef}
      className="teacher-offline-embedded-activity"
      data-embedded-activity-id={activityId}
      data-fit-mode={fit.mode}
      data-fit-scale={fit.scale.toFixed(4)}
      aria-label={title || "Students Book activity"}
    >
      <div
        ref={contentRef}
        className="teacher-offline-embedded-activity-content"
        style={{ "--embedded-activity-scale": fit.scale }}
      >
        <NormalizedStudentsBookActivity
          key={activityId}
          activityId={activityId}
          mode={ACTIVITY_MODES.TEACHER_PRESENTATION_OFFLINE}
          listeningPresentation={{ showTextCommand: listeningShowTextCommand, onStateChange: onListeningStateChange }}
        />
      </div>
      {videoOpen && <TeacherOfflineActivityVideoOverlay activityId={activityId} onClose={onCloseVideo} />}
    </div>
  );
}
