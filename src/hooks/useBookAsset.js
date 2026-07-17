import { useCallback, useEffect, useRef, useState } from "react";
import { requestBookAssetAccess } from "../services/bookAssetsApi.js";
import { BookAssetUrlLifecycle } from "../services/bookAssetLifecycle.js";

export function useBookAsset(logicalKey, { devFallbackUrl = null, deferUrlUpdates = false } = {}) {
  const lifecycleRef = useRef(null);
  const pendingAccessRef = useRef(null);
  const [state, setState] = useState({ url: null, expiresAt: null, asset: null, loading: Boolean(logicalKey), error: null });

  const retry = useCallback(() => {
    setState((current) => ({ ...current, loading: !current.url, error: null }));
    lifecycleRef.current?.refresh("manual");
  }, []);

  const recoverExpiredUrl = useCallback(() => {
    if (pendingAccessRef.current) {
      const pending = pendingAccessRef.current;
      pendingAccessRef.current = null;
      setState({ url: pending.url, expiresAt: pending.expiresAt, asset: pending.asset, loading: false, error: null });
      return;
    }
    setState((current) => ({ ...current, loading: !current.url, error: null }));
    lifecycleRef.current?.refresh("expired");
  }, []);

  useEffect(() => {
    lifecycleRef.current?.stop();
    pendingAccessRef.current = null;
    if (!logicalKey) {
      setState({ url: devFallbackUrl, expiresAt: null, asset: null, loading: false, error: null });
      return undefined;
    }
    setState({ url: null, expiresAt: null, asset: null, loading: true, error: null });
    const lifecycle = new BookAssetUrlLifecycle({
      request: ({ signal }) => requestBookAssetAccess(logicalKey, { signal }),
      onUpdate: (access, { reason }) => {
        if (deferUrlUpdates && reason === "scheduled") {
          pendingAccessRef.current = access;
          setState((current) => ({ ...current, error: null }));
          return;
        }
        pendingAccessRef.current = null;
        setState({ url: access.url, expiresAt: access.expiresAt, asset: access.asset, loading: false, error: null });
      },
      onError: (error) => {
        setState((current) => {
          if (current.url) return { ...current, loading: false, error };
          if (import.meta.env.DEV && devFallbackUrl) return { url: devFallbackUrl, expiresAt: null, asset: null, loading: false, error };
          return { ...current, url: null, loading: false, error };
        });
      },
    });
    lifecycleRef.current = lifecycle;
    lifecycle.start();
    return () => {
      lifecycle.stop();
      if (lifecycleRef.current === lifecycle) lifecycleRef.current = null;
    };
  }, [deferUrlUpdates, devFallbackUrl, logicalKey]);
  return { ...state, retry, refresh: retry, recoverExpiredUrl };
}
