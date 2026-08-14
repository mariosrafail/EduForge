export function reviewComponentKey(bookSlug, componentSlug) {
  return `${bookSlug}/${componentSlug}`;
}

export function createReviewComponentRegistry(productCatalog, installedDescriptors, defaultIdentity) {
  const registrations = new Map();
  for (const book of productCatalog || []) {
    for (const component of book.components || []) {
      registrations.set(reviewComponentKey(book.slug, component.slug), Object.freeze({ book, component }));
    }
  }

  const installed = new Map();
  for (const descriptor of installedDescriptors || []) {
    const key = reviewComponentKey(descriptor?.bookSlug, descriptor?.componentSlug);
    const registration = registrations.get(key);
    if (!registration || registration.component.reviewState !== "installed") {
      throw new Error(`Installed review component is not registered as installed: ${key}`);
    }
    if (installed.has(key) || !descriptor.contentPackProvider?.load || !Array.isArray(descriptor.pageUnits)) {
      throw new Error(`Invalid or duplicate installed review component: ${key}`);
    }
    installed.set(key, Object.freeze({ ...descriptor, ...registration, key }));
  }

  const registry = Object.freeze({
    defaultIdentity: Object.freeze({ ...defaultIdentity }),
    registrations,
    installed,
    resolve(bookSlug, componentSlug) {
      const key = reviewComponentKey(bookSlug, componentSlug);
      const registration = registrations.get(key);
      if (!registration) return Object.freeze({ kind: "unknown", bookSlug, componentSlug });
      const runtime = installed.get(key) || null;
      return runtime
        ? Object.freeze({ kind: "installed", registration, runtime })
        : Object.freeze({ kind: "pending", registration, runtime: null });
    },
  });
  if (registry.resolve(defaultIdentity?.bookSlug, defaultIdentity?.componentSlug).kind !== "installed") {
    throw new Error("The default Teacher Review component is not installed.");
  }
  return registry;
}
