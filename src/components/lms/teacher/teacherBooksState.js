export const initialTeacherBooksState = {
  ownerId: null,
  packages: [],
  loading: true,
  error: "",
  loaded: false,
};

export function teacherBooksReducer(state, action) {
  if (action.type === "loading") return action.reset
    ? { ...initialTeacherBooksState, ownerId: action.ownerId || null }
    : { ...state, loading: true, error: "" };
  if (action.type === "loaded") {
    return {
      ownerId: action.ownerId ?? state.ownerId,
      packages: Array.isArray(action.packages) ? action.packages : [],
      loading: false,
      error: "",
      loaded: true,
    };
  }
  if (action.type === "failed") {
    return {
      ...state,
      loading: false,
      error: action.error || "Book packages could not be loaded.",
    };
  }
  return state;
}

export function teacherBooksPresentation({ packages = [], loading = false, error = "", loaded = false } = {}) {
  if (loading && !packages.length) return "loading";
  if (error && !packages.length) return "error";
  if (loaded && !packages.length) return "empty";
  return "ready";
}
