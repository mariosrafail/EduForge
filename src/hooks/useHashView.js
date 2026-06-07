import { useCallback, useEffect, useRef, useState } from "react";
import { isSameBookPageRoute, mainHashRoutes, parseHashRoute } from "../utils/hashRoutes.js";

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

function captureScrollPosition() {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const scrollingElement = document.scrollingElement || document.documentElement;
  return {
    x: window.scrollX,
    y: window.scrollY,
    top: scrollingElement?.scrollTop ?? window.scrollY,
    left: scrollingElement?.scrollLeft ?? window.scrollX,
  };
}

function restoreScrollPosition(scrollPosition) {
  if (!scrollPosition || typeof window === "undefined" || typeof document === "undefined") return;
  const scrollingElement = document.scrollingElement || document.documentElement;
  window.scrollTo(scrollPosition.x, scrollPosition.y);
  if (scrollingElement) {
    scrollingElement.scrollTop = scrollPosition.top;
    scrollingElement.scrollLeft = scrollPosition.left;
  }
}

function restoreScrollPositionAfterRouteChange(scrollPosition) {
  if (!scrollPosition || typeof window === "undefined") return;
  const restore = () => restoreScrollPosition(scrollPosition);
  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });
  window.setTimeout(restore, 60);
  window.setTimeout(restore, 180);
  window.setTimeout(restore, 560);
  window.setTimeout(restore, 760);
  window.setTimeout(restore, 1100);
}

export function useHashView() {
  const [route, setRoute] = useState(readHashRoute);
  const previousHashRef = useRef(typeof window === "undefined" ? "" : window.location.hash);
  const pendingScrollRestoreRef = useRef(null);

  useEffect(() => {
    const handleHashChange = () => {
      const previousHash = previousHashRef.current;
      const nextHash = window.location.hash;
      const preserveScroll = isSameBookPageRoute(previousHash, nextHash);
      const scrollPosition = preserveScroll ? (pendingScrollRestoreRef.current || captureScrollPosition()) : null;
      pendingScrollRestoreRef.current = null;

      if (!window.location.hash) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/courses`);
      }
      const nextRoute = readHashRoute();
      normalizeInvalidHash(nextRoute);
      setRoute(nextRoute);
      previousHashRef.current = window.location.hash;
      restoreScrollPositionAfterRouteChange(scrollPosition);
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
    const nextBrowserHash = `#${safeRoute.hash}`;
    const preserveScroll = typeof window !== "undefined" && isSameBookPageRoute(window.location.hash, nextBrowserHash);
    const scrollPosition = preserveScroll ? captureScrollPosition() : null;
    pendingScrollRestoreRef.current = scrollPosition;
    setRoute(safeRoute);

    if (typeof window !== "undefined" && window.location.hash !== nextBrowserHash) {
      window.location.hash = safeRoute.hash;
      restoreScrollPositionAfterRouteChange(scrollPosition);
      return;
    }

    pendingScrollRestoreRef.current = null;
    restoreScrollPositionAfterRouteChange(scrollPosition);
  }, []);

  return { ...route, route, navigateTo };
}
