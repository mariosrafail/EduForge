import { useCallback, useEffect, useState } from "react";
import { mainHashRoutes, parseHashRoute } from "../utils/hashRoutes.js";

export const validViews = new Set(Object.keys(mainHashRoutes));

function readHashRoute() {
  if (typeof window === "undefined") {
    return parseHashRoute("home");
  }

  return parseHashRoute(window.location.hash);
}

function normalizeInvalidHash(route) {
  if (typeof window === "undefined" || route.valid) {
    return;
  }

  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#home`);
}

export function useHashView() {
  const [route, setRoute] = useState(readHashRoute);

  useEffect(() => {
    const handleHashChange = () => {
      const nextRoute = readHashRoute();
      normalizeInvalidHash(nextRoute);
      setRoute(nextRoute.valid ? nextRoute : parseHashRoute("home"));
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const navigateTo = useCallback((nextHash) => {
    const nextRoute = parseHashRoute(nextHash);
    const safeRoute = nextRoute.valid ? nextRoute : parseHashRoute("home");
    setRoute(safeRoute);

    if (typeof window !== "undefined" && window.location.hash !== `#${safeRoute.hash}`) {
      window.location.hash = safeRoute.hash;
    }
  }, []);

  return { ...route, route, navigateTo };
}
