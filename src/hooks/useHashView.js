import { useCallback, useEffect, useState } from "react";
import { mainHashRoutes, parseHashRoute } from "../utils/hashRoutes.js";

export const validViews = new Set(Object.keys(mainHashRoutes));

function readHashRoute() {
  if (typeof window === "undefined") {
    return parseHashRoute("/courses");
  }

  return parseHashRoute(window.location.hash);
}

function normalizeInvalidHash(route) {
  return route;
}

export function useHashView() {
  const [route, setRoute] = useState(readHashRoute);

  useEffect(() => {
    const handleHashChange = () => {
      if (!window.location.hash) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/courses`);
      }
      const nextRoute = readHashRoute();
      normalizeInvalidHash(nextRoute);
      setRoute(nextRoute);
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const navigateTo = useCallback((nextHash) => {
    const nextRoute = parseHashRoute(nextHash);
    const safeRoute = nextRoute.valid ? nextRoute : parseHashRoute("/courses");
    setRoute(safeRoute);

    if (typeof window !== "undefined" && window.location.hash !== `#${safeRoute.hash}`) {
      window.location.hash = safeRoute.hash;
    }
  }, []);

  return { ...route, route, navigateTo };
}
