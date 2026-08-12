import React from "react";
import { createRoot } from "react-dom/client";
import { renderApp } from "virtual:app-entry";
import "virtual:app-styles";
import { activeBuildProfile, BUILD_PROFILE_IDS } from "./config/buildProfiles.js";

const root = createRoot(document.getElementById("root"));
const configuredMode = import.meta.env.VITE_APP_MODE;
const appMode = activeBuildProfile.id === BUILD_PROFILE_IDS.INTERACTIVE_HOSTED_REVIEW
  ? "interactive-review"
  : configuredMode === "android-teacher-project"
  ? "android-teacher-project"
  : configuredMode === "android-teacher-offline"
  ? "android-teacher-offline"
  : configuredMode === "android-offline"
    ? "android-offline"
    : "lms";

document.documentElement.dataset.appMode = appMode === "android-teacher-project" || appMode === "interactive-review" ? "android-teacher-offline" : appMode;
if (appMode === "android-teacher-project") document.documentElement.dataset.teacherRuntime = "project";
if (appMode === "interactive-review") document.documentElement.dataset.teacherRuntime = "hosted-review";

root.render(
  <div className="app-loading-screen" role="status" aria-live="polite">
    {appMode === "android-teacher-project" ? "Loading Teacher project..." : appMode === "android-teacher-offline" || appMode === "interactive-review" ? "Loading classroom content..." : appMode === "android-offline" ? "Loading books..." : "Loading..."}
  </div>,
);

try {
  renderApp(root);
} catch (error) {
  console.error("Application failed to start", error);
  root.render(
    <div className="app-loading-screen" role="alert">
      {appMode === "android-teacher-project"
        ? "Teacher project could not start."
        : appMode === "android-teacher-offline" || appMode === "interactive-review"
        ? "Interactive Classroom could not start."
        : appMode === "android-offline"
          ? "Interactive Books could not start."
          : "Application could not start."}
    </div>,
  );
}
