import { scoreActivity } from "../utils/activityScoring.js";

const storageKey = "hh_lms_activity_demo";

function makeId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const activityTypeLabels = {
  multiple_choice: "Multiple Choice",
  fill_blank: "Fill in the blanks",
  matching: "Matching",
  writing: "Writing task",
  word_search: "Word Search",
};

export const activityTypes = [
  { value: "multiple_choice", label: activityTypeLabels.multiple_choice },
  { value: "fill_blank", label: activityTypeLabels.fill_blank },
  { value: "matching", label: activityTypeLabels.matching },
  { value: "writing", label: activityTypeLabels.writing },
  { value: "word_search", label: activityTypeLabels.word_search },
];

export const seedActivity = {
  id: "demo-activity-travel-collocations",
  title: "Unit 4 Travel Collocations Check",
  type: "multiple_choice",
  skill: "Vocabulary",
  book_title: "English Skills B1",
  unit_title: "Unit 4: Travel Stories",
  content: {
    question: "Choose the strongest collocation for a holiday plan.",
    options: ["make a journey", "do a journey", "take a decision", "go a plan"],
    correctIndex: 0,
  },
  feedback: {
    wrong: "Review Unit 4 travel collocations and focus on verb-noun combinations.",
    revision: "Revise travel collocations before the next attempt. Correct answers remain locked.",
  },
  created_at: new Date().toISOString(),
};

export const seedAssignment = {
  id: "demo-assignment-travel-collocations",
  activity_id: seedActivity.id,
  target_type: "class",
  target_label: "B1 Junior A",
  due_date: "2026-05-29",
  allowed_attempts: 2,
  status: "published",
  created_at: new Date().toISOString(),
};

export function defaultActivityDemoState() {
  return {
    activities: [seedActivity],
    assignments: [seedAssignment],
    submissions: [],
  };
}

export function loadActivityDemoState() {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) : defaultActivityDemoState();
  } catch {
    return defaultActivityDemoState();
  }
}

export function saveActivityDemoState(state) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Local storage is optional for this frontend-only demo.
  }
}

export function createActivity(state, activityInput) {
  const activity = {
    ...activityInput,
    id: makeId("activity"),
    created_at: new Date().toISOString(),
  };

  return {
    state: {
      ...state,
      activities: [activity, ...state.activities],
    },
    activity,
  };
}

export function createAssignment(state, assignmentInput) {
  const assignment = {
    ...assignmentInput,
    id: makeId("assignment"),
    status: "published",
    created_at: new Date().toISOString(),
  };

  return {
    state: {
      ...state,
      assignments: [assignment, ...state.assignments],
    },
    assignment,
  };
}

export function submitAssignment(state, assignmentId, answers) {
  const assignment = state.assignments.find((item) => item.id === assignmentId);
  const activity = state.activities.find((item) => item.id === assignment?.activity_id);

  if (!assignment || !activity) {
    throw new Error("Assignment activity was not found");
  }

  const previousAttempts = state.submissions.filter((item) => item.assignment_id === assignmentId).length;
  const scoring = scoreActivity(activity, answers);
  const submission = {
    id: makeId("submission"),
    assignment_id: assignmentId,
    activity_id: activity.id,
    student_name: "Anna Georgiou",
    activity_title: activity.title,
    activity_type: activity.type,
    answers,
    score: scoring.scorePercent,
    mistakes: scoring.mistakes,
    revision_guidance: scoring.revisionGuidance,
    needs_teacher_review: Boolean(scoring.needsTeacherReview),
    attempt_number: previousAttempts + 1,
    submitted_at: new Date().toISOString(),
  };

  return {
    state: {
      ...state,
      submissions: [submission, ...state.submissions],
    },
    submission,
  };
}
