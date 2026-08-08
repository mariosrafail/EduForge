import React, { Component } from "react";

import { installTeacherOfflineNetworkGuard } from "../android-teacher-offline/teacherOfflineNetworkGuard.js";
import TeacherProjectApp from "./TeacherProjectApp.jsx";

class TeacherProjectErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { if (import.meta.env.DEV) console.error("Teacher project rendering failed", error); }
  render() {
    if (this.state.failed) return <main className="teacher-offline-status damaged" role="alert"><h1>Teacher project could not open</h1><p>Rebuild the verified project APK.</p></main>;
    return this.props.children;
  }
}

function pauseActiveMedia() {
  document.querySelectorAll("audio, video").forEach((media) => media.pause());
}

export function renderApp(root) {
  document.documentElement.dataset.appMode = "android-teacher-offline";
  document.documentElement.dataset.teacherRuntime = "project";
  installTeacherOfflineNetworkGuard();
  document.title = "Hamilton House LMS Teacher";
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseActiveMedia(); });
  window.addEventListener("pagehide", pauseActiveMedia);
  root.render(<TeacherProjectErrorBoundary><TeacherProjectApp /></TeacherProjectErrorBoundary>);
}
