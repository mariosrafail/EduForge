const RESET_KEYWORDS = [
  "user",
  "auth",
  "login",
  "session",
  "role",
  "student",
  "teacher",
  "admin",
  "progress",
  "submitted",
  "submission",
  "assignment",
  "activity",
  "quiz",
  "test",
  "answer",
  "score",
  "completed",
];

const EXPLICIT_RESET_KEYS = [
  "hh_lms_activity_demo",
  "hh_lms_quiz_1_attempt_completed",
  "hh_lms_quiz_2_attempt_completed",
];

function shouldResetStorageKey(key = "") {
  const normalized = String(key).toLowerCase();
  if (EXPLICIT_RESET_KEYS.includes(key)) return true;
  const hasResetKeyword = RESET_KEYWORDS.some((keyword) => normalized.includes(keyword));
  if (hasResetKeyword) return true;
  return false;
}

function resetStorage(storage) {
  if (!storage) return [];
  const removedKeys = [];
  const keys = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }

  for (const key of keys) {
    if (!shouldResetStorageKey(key)) continue;
    storage.removeItem(key);
    removedKeys.push(key);
  }

  return removedKeys;
}

export function resetDemoProgressAndLogout() {
  if (typeof window === "undefined") return { localStorage: [], sessionStorage: [] };

  return {
    localStorage: resetStorage(window.localStorage),
    sessionStorage: resetStorage(window.sessionStorage),
  };
}
