import { useCallback, useEffect, useRef, useState } from "react";

import { requestReviewStudio } from "../bookBuilderApi.js";

export function useStudioResource(pathname, query = null, dependencyKey = "") {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const requestSequence = useRef(0);
  const load = useCallback(() => {
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    setState((current) => ({ ...current, status: "loading", error: null }));
    requestReviewStudio(pathname, { query, signal: controller.signal })
      .then((data) => { if (sequence === requestSequence.current) setState({ status: "ready", data, error: null }); })
      .catch((error) => {
        if (error.name !== "AbortError" && sequence === requestSequence.current) setState({ status: "error", data: null, error });
      });
    return () => controller.abort();
  }, [pathname, dependencyKey]);
  useEffect(() => load(), [load]);
  return { ...state, retry: load };
}
