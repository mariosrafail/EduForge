import React from "react";
import { createRoot } from "react-dom/client";
import { renderApp } from "virtual:app-entry";
import "virtual:app-styles";

const root = createRoot(document.getElementById("root"));
const appMode = import.meta.env.VITE_APP_MODE === "android-offline" ? "android-offline" : "lms";

document.documentElement.dataset.appMode = appMode;

root.render(
  <div className="app-loading-screen" role="status" aria-live="polite">
    {appMode === "android-offline" ? "Loading books..." : "Loading..."}
  </div>,
);

try {
  renderApp(root);
} catch (error) {
  console.error("Application failed to start", error);
  root.render(
    <div className="app-loading-screen" role="alert">
      {appMode === "android-offline" ? "Interactive Books could not start." : "Application could not start."}
    </div>,
  );
}
