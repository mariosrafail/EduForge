import { useEffect, useRef, useState } from "react";

import { readTeacherViewport } from "./viewportProfiles.js";

const diagnosticsKey = "teacher-offline-viewport-diagnostics";

function enabled() {
  if (!import.meta.env.DEV) return false;
  const query = new URLSearchParams(globalThis.location?.search || "");
  try {
    return query.get("teacherDiagnostics") === "1" || globalThis.localStorage?.getItem(diagnosticsKey) === "1";
  } catch {
    return query.get("teacherDiagnostics") === "1";
  }
}

export default function TeacherViewportDiagnostics() {
  const probeRef = useRef(null);
  const [visible] = useState(enabled);
  const [viewport, setViewport] = useState(readTeacherViewport);
  const [page, setPage] = useState(null);
  const [safeArea, setSafeArea] = useState({ top: 0, right: 0, bottom: 0, left: 0 });

  useEffect(() => {
    if (!visible) return undefined;
    const updateViewport = (event) => setViewport(event.detail || readTeacherViewport());
    const updatePage = (event) => setPage(event.detail);
    globalThis.addEventListener("teacher:viewport-profile", updateViewport);
    globalThis.addEventListener("teacher:page-metrics", updatePage);
    const styles = getComputedStyle(probeRef.current);
    setSafeArea({
      top: parseFloat(styles.paddingTop) || 0,
      right: parseFloat(styles.paddingRight) || 0,
      bottom: parseFloat(styles.paddingBottom) || 0,
      left: parseFloat(styles.paddingLeft) || 0,
    });
    return () => {
      globalThis.removeEventListener("teacher:viewport-profile", updateViewport);
      globalThis.removeEventListener("teacher:page-metrics", updatePage);
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <aside className="teacher-viewport-diagnostics" aria-label="Development viewport diagnostics">
      <div ref={probeRef} className="teacher-safe-area-probe" />
      <strong>{viewport.profile}</strong>
      <span>inner {viewport.innerWidth} x {viewport.innerHeight}</span>
      <span>visual {viewport.visualWidth ?? "n/a"} x {viewport.visualHeight ?? "n/a"}</span>
      <span>DPR {viewport.devicePixelRatio} / {viewport.orientation}</span>
      <span>safe {safeArea.top}/{safeArea.right}/{safeArea.bottom}/{safeArea.left}</span>
      {page && (
        <>
          <span>stage {page.stageWidth} x {page.stageHeight}</span>
          <span>{page.fitMode} / {page.zoomPercent}%</span>
          <span>page {page.renderedWidth} x {page.renderedHeight}</span>
        </>
      )}
    </aside>
  );
}
