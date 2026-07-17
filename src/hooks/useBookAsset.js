import { useCallback, useEffect, useState } from "react";
import { requestBookAssetAccess } from "../services/bookAssetsApi.js";

export function useBookAsset(logicalKey, { devFallbackUrl = null } = {}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ url: null, loading: Boolean(logicalKey), error: null });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (!logicalKey) { setState({ url: devFallbackUrl, loading: false, error: null }); return undefined; }
    const controller = new AbortController();
    setState({ url: null, loading: true, error: null });
    requestBookAssetAccess(logicalKey, { signal: controller.signal }).then(({ url }) => setState({ url, loading: false, error: null })).catch((error) => {
      if (error.name === "AbortError") return;
      if (import.meta.env.DEV && devFallbackUrl) setState({ url: devFallbackUrl, loading: false, error });
      else setState({ url: null, loading: false, error });
    });
    return () => controller.abort();
  }, [attempt, devFallbackUrl, logicalKey]);
  return { ...state, retry };
}
