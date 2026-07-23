import React from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

import TeacherOfflineApp from "./TeacherOfflineApp.jsx";
import { installTeacherOfflineNetworkGuard } from "./teacherOfflineNetworkGuard.js";

function hideAndroidSystemBars() {
  if (!Capacitor.isNativePlatform()) return;
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.hide().catch(() => {});
}

function pauseActiveMedia() {
  document.querySelectorAll("audio, video").forEach((media) => media.pause());
}

export function renderApp(root) {
  installTeacherOfflineNetworkGuard();
  hideAndroidSystemBars();
  document.title = "Hamilton House Interactive Classroom";

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseActiveMedia();
    else hideAndroidSystemBars();
  });
  window.addEventListener("pagehide", pauseActiveMedia);
  window.addEventListener("focus", hideAndroidSystemBars);
  window.addEventListener("pageshow", hideAndroidSystemBars);

  root.render(<TeacherOfflineApp />);
}
