import React from "react";
import { createRoot } from "react-dom/client";

import "../../src/styles/index.css";
import { NormalizedStudentsBookActivity } from "../../src/components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";
import { TeacherPresentationView } from "../../src/components/lms/activities/ultimate-b2/TeacherPresentationView.jsx";

const parameters = new URLSearchParams(globalThis.location.search);
const activityId = parameters.get("activityId") || "ultimate-b2-sb-u1-p2-o2";
const mode = parameters.get("mode") || "student";
const usePresentationShell = parameters.get("shell") === "1";

async function recordSubmission(payload) {
  globalThis.__legacyPilotSubmission = payload;
  return {
    status: payload.status,
    scorePercent: null,
    correctCount: null,
    totalCount: null,
  };
}

function Harness() {
  if (usePresentationShell) {
    return (
      <TeacherPresentationView
        activityKey={activityId}
        navigateTo={(route) => {
          globalThis.__legacyPilotNavigation = route;
        }}
      />
    );
  }
  return (
    <main style={{ padding: 16 }}>
      <NormalizedStudentsBookActivity
        activityId={activityId}
        mode={mode}
        onSubmit={recordSubmission}
      />
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
