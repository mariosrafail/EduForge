import React from "react";
import { createRoot } from "react-dom/client";
import { renderEduForgeApp } from "virtual:eduforge-entry";
import "virtual:eduforge-styles";

const root = createRoot(document.getElementById("root"));
const appMode = import.meta.env.VITE_APP_MODE === "android-offline" ? "android-offline" : "lms";

document.documentElement.dataset.appMode = appMode;

root.render(
  <div className="app-loading-screen" role="status" aria-live="polite">
    Loading...
  </div>,
);

try {
  renderEduForgeApp(root);
} catch (error) {
  console.error("EduForge failed to start", error);
  root.render(
    <div className="app-loading-screen" role="alert">
      EduForge could not start.
    </div>,
  );
}
