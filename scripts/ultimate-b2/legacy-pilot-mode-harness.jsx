import React, { useState } from "react";
import { createRoot } from "react-dom/client";

import "../../src/styles/index.css";
import { NormalizedStudentsBookActivity } from "../../src/components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx";
import { TeacherPresentationView } from "../../src/components/lms/activities/ultimate-b2/TeacherPresentationView.jsx";
import { StudentInteractiveRuntimeShell } from "../../src/components/lms/student/runtime/StudentInteractiveRuntimeShell.jsx";

const parameters = new URLSearchParams(globalThis.location.search);
const activityId = parameters.get("activityId") || "ultimate-b2-sb-u1-p2-o2";
const mode = parameters.get("mode") || "student";
const usePresentationShell = parameters.get("shell") === "1";
const useAssignmentShell = parameters.get("assignmentShell") === "1";
const submissionDelayMs = Number(parameters.get("submissionDelayMs") || 0);
const includeReviewSubmission = parameters.get("review") === "1";

async function recordSubmission(payload) {
  globalThis.__legacyPilotSubmissionCount = (globalThis.__legacyPilotSubmissionCount || 0) + 1;
  globalThis.__legacyPilotSubmission = payload;
  if (submissionDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, submissionDelayMs));
  return {
    status: payload.status,
    scorePercent: null,
    correctCount: null,
    totalCount: null,
  };
}

const reviewSubmission = includeReviewSubmission ? {
  submissionId: "legacy-review-submission",
  submittedAt: "2026-01-01T00:00:00.000Z",
  responsePayload: {
    1: "binge-watching",
    2: "episodes",
    3: "franchise",
    4: "genre",
    5: "Media streaming",
    6: "season",
    7: "sub-plots",
    8: "Tuning in",
  },
  scorePercent: 75,
  correctCount: 6,
  totalCount: 8,
} : null;

function AssignmentHarness() {
  const [pending, setPending] = useState(false);
  return (
    <StudentInteractiveRuntimeShell
      mode="assigned"
      title="Assigned Complete Sentences"
      statusLabel="Assigned"
      statusTone="gold"
      submittable
      pending={pending}
      showSubmitAction={false}
      onConfirmSubmit={async (payload) => {
        setPending(true);
        try { return await recordSubmission(payload); }
        finally { setPending(false); }
      }}
    >
      {({ requestFinalSubmit }) => (
        <NormalizedStudentsBookActivity
          activityId={activityId}
          mode="student"
          onSubmit={requestFinalSubmit}
          submitConfirmationOwner="runtime-shell"
        />
      )}
    </StudentInteractiveRuntimeShell>
  );
}

function Harness() {
  if (useAssignmentShell) return <AssignmentHarness />;
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
        submission={reviewSubmission}
      />
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
