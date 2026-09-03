export const STUDENT_SUBMIT_CONFIRMATION_OWNERS = Object.freeze({
  ACTIVITY: "activity",
  RUNTIME_SHELL: "runtime-shell",
});

export function activityOwnsSubmitConfirmation(owner = STUDENT_SUBMIT_CONFIRMATION_OWNERS.ACTIVITY) {
  return owner !== STUDENT_SUBMIT_CONFIRMATION_OWNERS.RUNTIME_SHELL;
}

export function persistedStudentAnswers(activity, submission) {
  const payload = submission?.responsePayload || submission?.response_payload || submission?.answers;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return Object.fromEntries((activity?.runtime?.questions || []).map((question, index) => [
    question.id,
    payload[question.id] ?? payload[String(question.number ?? index + 1)] ?? "",
  ]));
}
