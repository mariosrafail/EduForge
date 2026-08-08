import { useEffect, useState } from "react";

export const PROJECT_TABS = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "components", label: "Components" },
  { id: "pages", label: "Pages & Hotspots" },
  { id: "menu", label: "Menu & Branding" },
  { id: "activities", label: "Activities" },
  { id: "manual", label: "Manual Activities" },
  { id: "reviews", label: "Review Queue" },
  { id: "decisions", label: "Decisions & History" },
  { id: "diff", label: "Source Diff" },
]);

const projectIdPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export function projectHash(projectId, tab = "overview", query = null) {
  const base = `#/projects/${encodeURIComponent(projectId)}/${tab}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== "" && value !== null && value !== undefined) params.set(key, String(value));
  const suffix = params.toString();
  return suffix ? `${base}?${suffix}` : base;
}

export function teacherProjectHash(projectId) {
  return `#/teacher-projects/${encodeURIComponent(projectId)}`;
}

export function parseBookBuilderHash(hash = window.location.hash) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const parsed = new URL(raw || "/", "http://review-studio.local");
  const segments = parsed.pathname.split("/").filter(Boolean).map((segment) => {
    try { return decodeURIComponent(segment); } catch { return ""; }
  });
  if (!segments.length) return { kind: "dashboard", query: parsed.searchParams };
  if (segments[0] === "teacher-projects" && segments.length === 2 && projectIdPattern.test(segments[1])) {
    return { kind: "teacher-project", projectId: segments[1], query: parsed.searchParams };
  }
  if (segments[0] !== "projects" || segments.length < 2 || !projectIdPattern.test(segments[1])) {
    return { kind: "invalid", query: parsed.searchParams };
  }
  const requestedTab = segments[2] || "overview";
  const tab = PROJECT_TABS.some((candidate) => candidate.id === requestedTab) ? requestedTab : "overview";
  return { kind: "project", projectId: segments[1], tab, redirected: tab !== requestedTab, query: parsed.searchParams };
}

export function useBookBuilderRoute() {
  const [route, setRoute] = useState(() => parseBookBuilderHash());
  useEffect(() => {
    const update = () => setRoute(parseBookBuilderHash());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (route.kind === "invalid") window.location.hash = "/";
    else if (route.redirected) window.history.replaceState(null, "", projectHash(route.projectId, route.tab));
  }, [route]);
  return route;
}
