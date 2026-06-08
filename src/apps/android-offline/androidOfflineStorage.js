const STORAGE_KEY = "eduforge:android-offline:v2";

const defaultState = {
  lastSelectedBookSlug: "",
  lastLocationByBook: {},
  completed: {},
  answers: {},
  results: {},
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readState() {
  if (!canUseStorage()) return defaultState;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return {
      ...defaultState,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      lastLocationByBook: parsed?.lastLocationByBook || {},
      completed: parsed?.completed || {},
      answers: parsed?.answers || {},
      results: parsed?.results || {},
    };
  } catch {
    return defaultState;
  }
}

function writeState(nextState) {
  if (!canUseStorage()) return nextState;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  return nextState;
}

export function getAndroidOfflineProgress() {
  return readState();
}

export function setLastSelectedBook(bookSlug) {
  const state = readState();
  return writeState({
    ...state,
    lastSelectedBookSlug: bookSlug,
  });
}

export function setLastOpenedBookLocation(bookSlug, location) {
  const state = readState();
  return writeState({
    ...state,
    lastSelectedBookSlug: bookSlug,
    lastLocationByBook: {
      ...state.lastLocationByBook,
      [bookSlug]: {
        ...location,
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

export function saveAndroidOfflineAnswer(key, answer) {
  const state = readState();
  return writeState({
    ...state,
    answers: {
      ...state.answers,
      [key]: {
        answer,
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

export function markAndroidOfflinePageComplete(key, result = {}) {
  const state = readState();
  const completedAt = new Date().toISOString();
  return writeState({
    ...state,
    completed: {
      ...state.completed,
      [key]: completedAt,
    },
    results: {
      ...state.results,
      [key]: {
        ...result,
        completedAt,
      },
    },
  });
}
