import { useEffect, useState } from "react";

export const TEACHER_VIEWPORT_PROFILES = Object.freeze({
  COMPACT: "compact-landscape",
  MEDIUM: "medium-landscape",
  EXPANDED: "expanded-classroom",
  LARGE: "large-classroom",
  EXTRA_LARGE: "extra-large-classroom",
});

export function classifyTeacherViewport({ width, height }) {
  if (height < 480) return TEACHER_VIEWPORT_PROFILES.COMPACT;
  if (width < 840 || height < 700) return TEACHER_VIEWPORT_PROFILES.MEDIUM;
  if (width >= 1600 && height >= 900) return TEACHER_VIEWPORT_PROFILES.EXTRA_LARGE;
  if (width >= 1200) return TEACHER_VIEWPORT_PROFILES.LARGE;
  return TEACHER_VIEWPORT_PROFILES.EXPANDED;
}

export function readTeacherViewport() {
  const viewport = globalThis.visualViewport;
  const width = Math.round(viewport?.width || globalThis.innerWidth || 0);
  const height = Math.round(viewport?.height || globalThis.innerHeight || 0);
  return {
    width,
    height,
    innerWidth: Math.round(globalThis.innerWidth || width),
    innerHeight: Math.round(globalThis.innerHeight || height),
    visualWidth: viewport ? Math.round(viewport.width) : null,
    visualHeight: viewport ? Math.round(viewport.height) : null,
    devicePixelRatio: Number(globalThis.devicePixelRatio || 1),
    orientation: width >= height ? "landscape" : "portrait",
    profile: classifyTeacherViewport({ width, height }),
  };
}

function sameViewport(left, right) {
  return left.width === right.width
    && left.height === right.height
    && left.devicePixelRatio === right.devicePixelRatio
    && left.profile === right.profile;
}

export function useTeacherViewportProfile() {
  const [viewport, setViewport] = useState(readTeacherViewport);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readTeacherViewport();
        setViewport((current) => sameViewport(current, next) ? current : next);
      });
    };
    update();
    globalThis.addEventListener("resize", update);
    globalThis.addEventListener("orientationchange", update);
    globalThis.visualViewport?.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      globalThis.removeEventListener("resize", update);
      globalThis.removeEventListener("orientationchange", update);
      globalThis.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.teacherViewport = viewport.profile;
    document.documentElement.style.setProperty("--teacher-viewport-width", `${viewport.width}px`);
    document.documentElement.style.setProperty("--teacher-viewport-height", `${viewport.height}px`);
    globalThis.dispatchEvent(new CustomEvent("teacher:viewport-profile", { detail: viewport }));
  }, [viewport]);

  return viewport;
}
