import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

import { requestReviewStudioPreview } from "../bookBuilderApi.js";

export function SecurePreview({ projectId, previewId, alt, className = "" }) {
  const [state, setState] = useState({ status: "loading", url: null });
  useEffect(() => {
    if (!previewId) { setState({ status: "missing", url: null }); return undefined; }
    const controller = new AbortController();
    let objectUrl = null;
    setState({ status: "loading", url: null });
    requestReviewStudioPreview(projectId, previewId, { signal: controller.signal })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setState({ status: "ready", url: objectUrl }); })
      .catch((error) => { if (error.name !== "AbortError") setState({ status: "error", url: null }); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [projectId, previewId]);
  if (state.status === "ready") return <img className={className} src={state.url} alt={alt} />;
  return <div className={`studio-preview-state ${className}`.trim()} role="status"><ImageOff aria-hidden="true" /><span>{state.status === "loading" ? "Loading preview…" : "Preview unavailable"}</span></div>;
}
