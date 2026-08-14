import { ultimateB2NativeActivityAdapter } from "../../../src/data/ultimate-b2/nativeActivityAdapter.js";

const adapters = Object.freeze({
  "ultimate-b2/ultimate-b2-students-book": ultimateB2NativeActivityAdapter,
});

export function resolveNativeActivityAdapter(bookSlug, componentSlug) {
  return adapters[`${bookSlug}/${componentSlug}`] || null;
}

export const nativeActivityAdapters = adapters;
