import { useLayoutEffect, useRef, useState } from "react";

import { ACTIVITY_MODES } from "../../components/lms/activities/activityModes.js";
import { NormalizedStudentsBookActivity } from "../../components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";
import { calculateEmbeddedActivityScale } from "./embeddedActivityFit.js";

export default function TeacherOfflineEmbeddedActivity({ activityId, title }) {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return undefined;
    const update = () => {
      const style = getComputedStyle(viewport);
      const availableWidth = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const availableHeight = viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const next = calculateEmbeddedActivityScale({
        availableWidth,
        availableHeight,
        contentWidth: content.scrollWidth,
        contentHeight: content.scrollHeight,
      });
      setScale((current) => Math.abs(current - next) < 0.001 ? current : next);
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      globalThis.addEventListener("resize", update);
      return () => globalThis.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [activityId]);

  return (
    <div
      ref={viewportRef}
      className="teacher-offline-embedded-activity"
      data-embedded-activity-id={activityId}
      data-fit-scale={scale.toFixed(4)}
      aria-label={title || "Students Book activity"}
    >
      <div
        ref={contentRef}
        className="teacher-offline-embedded-activity-content"
        style={{ "--embedded-activity-scale": scale }}
      >
        <NormalizedStudentsBookActivity
          key={activityId}
          activityId={activityId}
          mode={ACTIVITY_MODES.TEACHER_PRESENTATION_OFFLINE}
        />
      </div>
    </div>
  );
}
