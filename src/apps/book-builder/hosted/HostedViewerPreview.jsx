import { useEffect, useState } from "react";

import { createHostedViewerPreviewUrl } from "./hostedViewerPreviewUrl.js";
import { createBuilderPreviewAuthorization } from "./builderPreviewAuthorizationApi.js";
import { startHostedViewerAuthorizationLifecycle } from "./hostedViewerAuthorizationLifecycle.js";

export function HostedViewerPreview({
  intent,
  bookSlug = "ultimate-b2",
  componentSlug = "ultimate-b2-students-book",
  refreshKey = 0,
  title,
  description = "",
}) {
  const [authorization, setAuthorization] = useState(null);
  const [authorizationError, setAuthorizationError] = useState(false);
  const [manualRefresh, setManualRefresh] = useState(0);
  const [frameState, setFrameState] = useState("loading");
  useEffect(() => {
    setAuthorization(null); setAuthorizationError(false);
    return startHostedViewerAuthorizationLifecycle({
      requestAuthorization: ({ signal }) => createBuilderPreviewAuthorization({ bookSlug, componentSlug, view: intent.view, activityId: intent.view === "activity" ? intent.activityId : null, releaseId: intent.releaseId || null }, { signal }),
      onAuthorization: (token) => { setAuthorization(token); if (token) setAuthorizationError(false); },
      onError: () => setAuthorizationError(true),
    });
  }, [bookSlug, componentSlug, intent.view, intent.activityId, intent.releaseId, refreshKey, manualRefresh]);
  const src = authorization ? createHostedViewerPreviewUrl({ ...intent, bookSlug, componentSlug, previewAuthorization: authorization }) : "";
  const frameKey = `${src}:${refreshKey}:${manualRefresh}`;

  useEffect(() => setFrameState("loading"), [frameKey]);

  return <section className="hosted-viewer-preview" aria-label={title}>
    <header>
      <div><strong>{title}</strong>{description ? <span>{description}</span> : null}</div>
      <div>
        <button type="button" onClick={() => { setFrameState("loading"); setManualRefresh((value) => value + 1); }}>Refresh Viewer</button>
        {src ? <a href={src} target="_blank" rel="noreferrer">Open in Viewer</a> : null}
      </div>
    </header>
    <p className="hosted-viewer-preview-state" role="status" data-state={frameState}>
      {authorizationError ? "Secure Viewer authorization could not be created." : frameState === "loading" ? "Loading canonical Viewer..." : frameState === "error" ? "The canonical Viewer could not be loaded." : "Canonical Viewer loaded."}
    </p>
    {src ? <iframe
      key={frameKey}
      src={src}
      title={title}
      referrerPolicy="no-referrer"
      loading="eager"
      onLoad={() => setFrameState("ready")}
      onError={() => setFrameState("error")}
    /> : null}
  </section>;
}

export default HostedViewerPreview;
