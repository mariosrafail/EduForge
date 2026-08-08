import React from "react";
import { createRoot } from "react-dom/client";
import { renderApp } from "virtual:app-entry";
import "virtual:app-styles";

const root = createRoot(document.getElementById("root"));
const configuredMode = import.meta.env.VITE_APP_MODE;
const appMode = configuredMode === "android-teacher-project"
  ? "android-teacher-project"
  : configuredMode === "android-teacher-offline"
  ? "android-teacher-offline"
  : configuredMode === "android-offline"
    ? "android-offline"
    : "lms";

document.documentElement.dataset.appMode = appMode === "android-teacher-project" ? "android-teacher-offline" : appMode;
if (appMode === "android-teacher-project") document.documentElement.dataset.teacherRuntime = "project";

root.render(
  <div className="app-loading-screen" role="status" aria-live="polite">
    {appMode === "android-teacher-project" ? "Loading Teacher project..." : appMode === "android-teacher-offline" ? "Loading classroom content..." : appMode === "android-offline" ? "Loading books..." : "Loading..."}
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
        : appMode === "android-teacher-offline"
        ? "Interactive Classroom could not start."
        : appMode === "android-offline"
          ? "Interactive Books could not start."
          : "Application could not start."}
    </div>,
  );
}
