import React from "react";
import { Component } from "react";

import TeacherOfflineApp from "./TeacherOfflineApp.jsx";
import { installTeacherOfflineNetworkGuard } from "./teacherOfflineNetworkGuard.js";
import { installTeacherOfflineDiagnostics } from "./teacherOfflineDiagnostics.js";
import { activeBuildProfile, BUILD_PROFILE_IDS } from "../../config/buildProfiles.js";

class TeacherOfflineErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error("Teacher classroom rendering failed", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="teacher-offline-status damaged" role="alert">
          <h1>Classroom application could not open</h1>
          <p>Close and reopen the application. Reinstall it if the problem continues.</p>
        </main>
      );
    }
    return this.props.children;
  }
}

function pauseActiveMedia() {
  document.querySelectorAll("audio, video").forEach((media) => media.pause());
}

export function renderApp(root) {
  installTeacherOfflineNetworkGuard();
  installTeacherOfflineDiagnostics();
  document.title = activeBuildProfile.id === BUILD_PROFILE_IDS.INTERACTIVE_HOSTED_REVIEW
    ? "Hamilton House Viewer"
    : "Hamilton House LMS";

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseActiveMedia();
  });
  window.addEventListener("pagehide", pauseActiveMedia);

  root.render(<TeacherOfflineErrorBoundary><TeacherOfflineApp /></TeacherOfflineErrorBoundary>);
}
