import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

import { requestManualAssetContent } from "../bookBuilderApi.js";

export function useManualAssetUrl(projectId, assetId) {
  const [state, setState] = useState({ status: "missing", url: null, type: "" });
  useEffect(() => {
    if (!assetId) { setState({ status: "missing", url: null, type: "" }); return undefined; }
    const controller = new AbortController(); let url;
    setState({ status: "loading", url: null, type: "" });
    requestManualAssetContent(projectId, assetId, { signal: controller.signal }).then((blob) => { url = URL.createObjectURL(blob); setState({ status: "ready", url, type: blob.type }); }).catch((error) => { if (error.name !== "AbortError") setState({ status: "error", url: null, type: "" }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [projectId, assetId]);
  return state;
}

export function ManualAssetPreview({ projectId, assetId, alt = "Activity asset", controls = false }) {
  const state = useManualAssetUrl(projectId, assetId);
  if (state.status === "ready" && state.type.startsWith("image/")) return <img className="studio-manual-asset" src={state.url} alt={alt} />;
  if (state.status === "ready" && state.type.startsWith("audio/")) return <audio className="studio-manual-media" src={state.url} controls={controls} />;
  if (state.status === "ready" && state.type.startsWith("video/")) return <video className="studio-manual-media" src={state.url} controls={controls} />;
  return <div className="studio-preview-state" role="status"><ImageOff aria-hidden="true" /><span>{state.status === "loading" ? "Loading approved asset…" : "Asset preview unavailable"}</span></div>;
}
