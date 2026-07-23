import unit1Matrix from "../../books/ultimate-b2/generated/editorial/unit-01.implementation-matrix.json" with { type: "json" };
import unit2Matrix from "../../books/ultimate-b2/generated/editorial/unit-02.implementation-matrix.json" with { type: "json" };

const activities = [...(unit1Matrix.activities || []), ...(unit2Matrix.activities || [])];
const activitiesById = new Map(activities.map((activity) => [activity.stableNormalizedId, activity]));

function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/,/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function uniqueAnswers(values = []) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function isEnabled(activity) {
  return Boolean(
    activity
    && activity.availability !== "disabled"
    && activity.implementationMode !== "unsupported-disabled"
    && activity.implementationStatus !== "disabled-editorial-only",
  );
}

function solutionQuestion(question = {}) {
  const acceptedAnswers = uniqueAnswers(question.acceptedAnswers || []);
  const normalizedAccepted = new Set(acceptedAnswers.map(normalizeAnswer));
  const correctOptionIds = (question.options || [])
    .filter((option) => normalizedAccepted.has(normalizeAnswer(option.text)))
    .map((option) => option.id)
    .filter(Boolean);

  return {
    questionId: question.id,
    acceptedAnswers,
    correctOptionIds,
  };
}

export function getUltimateB2TeacherSolutionRecord(activityId) {
  const activity = activitiesById.get(String(activityId || "")) || null;
  if (!isEnabled(activity)) return null;
  return activity;
}

export function buildUltimateB2TeacherSolutionPayload(activityId) {
  const activity = getUltimateB2TeacherSolutionRecord(activityId);
  if (!activity) return null;

  const questions = (activity.runtime?.questions || []).map(solutionQuestion);
  const verifiedQuestions = questions.filter((question) => question.acceptedAnswers.length > 0);
  const openResponse = activity.implementationMode === "teacher-reviewed";
  const solutionAvailability = verifiedQuestions.length > 0
    ? "explicit"
    : openResponse
      ? "open-response"
      : "missing";

  return {
    activityId: activity.stableNormalizedId,
    solutionAvailability,
    solutionType: solutionAvailability === "explicit"
      ? "publisher-answer"
      : solutionAvailability,
    questions: Object.fromEntries(verifiedQuestions.map((question) => [question.questionId, question])),
  };
}

export function isUltimateB2PresentationActivityEnabled(activityId) {
  return Boolean(getUltimateB2TeacherSolutionRecord(activityId));
}
