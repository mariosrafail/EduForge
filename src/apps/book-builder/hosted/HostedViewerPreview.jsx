import { useEffect, useState } from "react";

import { createHostedViewerPreviewUrl } from "./hostedViewerPreviewUrl.js";

export function HostedViewerPreview({ intent, refreshKey = 0, title, description = "" }) {
  const src = createHostedViewerPreviewUrl(intent);
  const [manualRefresh, setManualRefresh] = useState(0);
  const [frameState, setFrameState] = useState("loading");
  const frameKey = `${src}:${refreshKey}:${manualRefresh}`;

  useEffect(() => setFrameState("loading"), [frameKey]);

  return <section className="hosted-viewer-preview" aria-label={title}>
    <header>
      <div><strong>{title}</strong>{description ? <span>{description}</span> : null}</div>
      <div>
        <button type="button" onClick={() => { setFrameState("loading"); setManualRefresh((value) => value + 1); }}>Refresh Viewer</button>
        <a href={src} target="_blank" rel="noreferrer">Open in Viewer</a>
      </div>
    </header>
    <p className="hosted-viewer-preview-state" role="status" data-state={frameState}>
      {frameState === "loading" ? "Loading canonical Viewer..." : frameState === "error" ? "The canonical Viewer could not be loaded." : "Canonical Viewer loaded."}
    </p>
    <iframe
      key={frameKey}
      src={src}
      title={title}
      referrerPolicy="no-referrer"
      loading="eager"
      onLoad={() => setFrameState("ready")}
      onError={() => setFrameState("error")}
    />
  </section>;
}

export default HostedViewerPreview;
