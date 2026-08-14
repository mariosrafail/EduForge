const DEFAULT_LOCATION = Object.freeze({ unitNumber: 1, tab: "pages", pageId: "" });

export function componentIdentityKey(identity) {
  return `${identity.bookSlug}/${identity.componentSlug}`;
}

export function createTeacherReviewComponentState(runtime, location = DEFAULT_LOCATION) {
  return Object.freeze({
    active: runtime,
    navigation: Object.freeze({ view: "library" }),
    locations: Object.freeze({ [componentIdentityKey(runtime)]: Object.freeze({ ...location }) }),
    feedback: "",
  });
}

export function switchTeacherReviewComponent(state, resolution) {
  if (resolution?.kind !== "installed") {
    const title = resolution?.registration?.component?.title || "The requested component";
    return Object.freeze({ ...state, feedback: `${title} content is registered but not installed for Teacher Review.` });
  }
  const nextRuntime = resolution.runtime;
  const currentKey = componentIdentityKey(state.active);
  const nextKey = componentIdentityKey(nextRuntime);
  if (currentKey === nextKey) return Object.freeze({ ...state, feedback: "" });
  const locations = {
    ...state.locations,
    ...(state.navigation.location ? { [currentKey]: Object.freeze({ ...state.navigation.location }) } : {}),
  };
  const location = locations[nextKey] || DEFAULT_LOCATION;
  return Object.freeze({
    active: nextRuntime,
    navigation: Object.freeze({ view: "book", location: Object.freeze({ ...location }) }),
    locations: Object.freeze(locations),
    feedback: "",
  });
}
