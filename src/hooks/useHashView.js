import { useCallback, useEffect, useState } from "react";

export const validViews = new Set([
  "home",
  "auth-admin",
  "auth-teacher",
  "auth-student",
  "admin",
  "teacher",
  "student",
  "student-course",
  "teacher-course-editor",
  "student-preview",
  "flow",
]);

function readHashView() {
  if (typeof window === "undefined") {
    return "home";
  }

  const hashView = window.location.hash.slice(1).trim();
  return validViews.has(hashView) ? hashView : "home";
}

function normalizeInvalidHash() {
  if (typeof window === "undefined") {
    return;
  }

  const hashView = window.location.hash.slice(1).trim();

  if (hashView && !validViews.has(hashView)) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#home`);
  }
}

export function useHashView() {
  const [view, setView] = useState(readHashView);

  useEffect(() => {
    const handleHashChange = () => {
      normalizeInvalidHash();
      setView(readHashView());
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const navigateTo = useCallback((nextView) => {
    const safeView = validViews.has(nextView) ? nextView : "home";
    setView(safeView);

    if (typeof window !== "undefined" && window.location.hash !== `#${safeView}`) {
      window.location.hash = safeView;
    }
  }, []);

  return { view, navigateTo };
}
