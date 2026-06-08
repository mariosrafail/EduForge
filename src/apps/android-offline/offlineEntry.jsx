import React from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import AndroidOfflineApp from "./AndroidOfflineApp.jsx";

function hideAndroidSystemBars() {
  if (!Capacitor.isNativePlatform()) return;

  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.hide().catch(() => {});
}

export function renderEduForgeApp(root) {
  hideAndroidSystemBars();

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) hideAndroidSystemBars();
    });
  }

  if (typeof window !== "undefined") {
    window.addEventListener("focus", hideAndroidSystemBars);
    window.addEventListener("pageshow", hideAndroidSystemBars);
    window.addEventListener("resize", hideAndroidSystemBars);
  }

  root.render(<AndroidOfflineApp />);
}
