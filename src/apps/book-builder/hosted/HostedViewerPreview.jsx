import { useEffect, useRef, useState } from "react";

import { VIEWER_EXIT_FULLSCREEN_MESSAGE } from "../../../shared/viewerPresentationProtocol.js";
import { createHostedViewerPreviewUrl, HOSTED_VIEWER_ORIGIN } from "./hostedViewerPreviewUrl.js";
import { createBuilderPreviewAuthorization, resolveBuilderPreviewAuthorizationIntent } from "./builderPreviewAuthorizationApi.js";
import { startHostedViewerAuthorizationLifecycle } from "./hostedViewerAuthorizationLifecycle.js";

export function HostedViewerPreview({
  intent,
  bookSlug = "ultimate-b2",
  componentSlug = "ultimate-b2-students-book",
  refreshKey = 0,
  title,
  description = "",
  openPlayerHref = "",
  allowFullscreen = false,
}) {
  const iframeRef = useRef(null);
  const [authorization, setAuthorization] = useState(null);
  const [authorizationError, setAuthorizationError] = useState(false);
  const [manualRefresh, setManualRefresh] = useState(0);
  const [frameState, setFrameState] = useState("loading");
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  useEffect(() => {
    setAuthorization(null); setAuthorizationError(false);
    return startHostedViewerAuthorizationLifecycle({
      requestAuthorization: ({ signal }) => createBuilderPreviewAuthorization(resolveBuilderPreviewAuthorizationIntent({ bookSlug, componentSlug, intent }), { signal }),
      onAuthorization: (token, response) => { setAuthorization(token ? { token, ...response } : null); if (token) setAuthorizationError(false); },
      onError: () => setAuthorizationError(true),
      renew: Boolean(intent.productReleaseId),
    });
  }, [bookSlug, componentSlug, intent.view, intent.pageId, intent.activityId, intent.productReleaseId, refreshKey, manualRefresh]);
  const src = authorization ? createHostedViewerPreviewUrl({
    ...intent,
    bookSlug,
    componentSlug,
    previewAuthorization: authorization.token,
    ...(intent.productReleaseId ? {
      productReleaseId: authorization.productReleaseId,
      releaseId: authorization.componentReleaseId,
      memberSha256: authorization.memberSha256,
    } : {}),
  }) : "";
  const frameKey = `${src}:${refreshKey}:${manualRefresh}`;

  useEffect(() => setFrameState("loading"), [frameKey]);

  useEffect(() => {
    const iframeElement = iframeRef.current;
    const available = Boolean(allowFullscreen
      && iframeElement
      && typeof iframeElement.requestFullscreen === "function"
      && typeof document.exitFullscreen === "function");
    setFullscreenAvailable(available);
    if (!available) {
      setIsFullscreen(false);
      return undefined;
    }
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === iframeElement);
      setFullscreenError(false);
    };
    const exitViewerFullscreen = async (event) => {
      if (event.data !== VIEWER_EXIT_FULLSCREEN_MESSAGE
        || event.origin !== HOSTED_VIEWER_ORIGIN
        || event.source !== iframeElement.contentWindow
        || document.fullscreenElement !== iframeElement
        || typeof document.exitFullscreen !== "function") return;
      try {
        await document.exitFullscreen();
      } catch {
        setFullscreenError(true);
      }
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    window.addEventListener("message", exitViewerFullscreen);
    syncFullscreenState();
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      window.removeEventListener("message", exitViewerFullscreen);
    };
  }, [allowFullscreen, src]);

  const toggleFullscreen = async () => {
    const iframeElement = iframeRef.current;
    if (!fullscreenAvailable || !iframeElement) return;
    setFullscreenError(false);
    try {
      if (document.fullscreenElement === iframeElement) await document.exitFullscreen();
      else await iframeElement.requestFullscreen();
    } catch {
      setFullscreenError(true);
    }
  };

  return <section className="hosted-viewer-preview" aria-label={title}>
    <header>
      <div><strong>{title}</strong>{description ? <span>{description}</span> : null}</div>
      <div>
        <button type="button" onClick={() => { setFrameState("loading"); setManualRefresh((value) => value + 1); }}>Refresh Viewer</button>
        {allowFullscreen && fullscreenAvailable ? <button type="button" aria-pressed={isFullscreen} onClick={toggleFullscreen}>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</button> : null}
        {openPlayerHref ? <a href={openPlayerHref} target="_blank" rel="noopener noreferrer">Open Player</a> : null}
      </div>
    </header>
    {fullscreenError ? <p className="hosted-viewer-preview-fullscreen-error" role="status">Fullscreen could not be changed.</p> : null}
    <p className="hosted-viewer-preview-state" role="status" data-state={frameState}>
      {authorizationError ? "Secure Viewer authorization could not be created." : frameState === "loading" ? "Loading canonical Viewer..." : frameState === "error" ? "The canonical Viewer could not be loaded." : "Canonical Viewer loaded."}
    </p>
    {src ? <iframe
      ref={iframeRef}
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
