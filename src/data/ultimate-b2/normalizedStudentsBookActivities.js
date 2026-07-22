import studentsBookRuntime from "./generated/students-book.runtime.json" with { type: "json" };
import unit2Runtime from "./generated/unit-02.runtime.json" with { type: "json" };

const aliasesById = new Map();
(studentsBookRuntime.units || []).flatMap((unit) => unit.pages || []).flatMap((page) => page.activities || []).forEach((activity) => {
  if (activity.id && activity.activityKey && activity.activityKey !== activity.id) {
    aliasesById.set(activity.id, [...(aliasesById.get(activity.id) || []), activity.activityKey]);
  }
});
const activities = (unit2Runtime.activities || []).map((activity) => ({
  ...activity,
  id: activity.stableNormalizedId,
  aliases: aliasesById.get(activity.stableNormalizedId) || [],
  questions: (activity.runtime?.questions || []).map((question) => ({
    ...question,
    options: (question.options || []).map((option) => ({ ...option, value: option.text })),
  })),
}));

export function getNormalizedStudentsBookActivity(idOrAlias) {
  return activities.find((activity) => activity.id === idOrAlias || activity.aliases?.includes(idOrAlias)) || null;
}

export function normalizedCorrectOptionIds(activity, question) {
  void activity;
  void question;
  return [];
}

export function scoreNormalizedStudentsBookActivity() {
  throw new Error("Normalized Students Book activities are scored authoritatively by the server.");
}

export function buildNormalizedSubmissionAnswers(activity, answers = {}) {
  const submission = { ...answers };
  (activity?.questions || []).forEach((question, index) => {
    const selected = Array.isArray(answers[question.id]) ? answers[question.id][0] : answers[question.id];
    submission[String(index + 1)] = question.options.find((option) => option.id === selected)?.value || "";
  });
  return submission;
}

export function createNormalizedActivityAttempt() {
  return { answers: {}, submittedRows: null };
}

export function resetNormalizedActivityAttempt() {
  return createNormalizedActivityAttempt();
}

export { activities as normalizedUnit2ReadyActivities };
