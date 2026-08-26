import { ultimateB2NativeActivityAdapter } from "../../../src/data/ultimate-b2/nativeActivityAdapter.js";
import { createManagedNativeActivityAdapter } from "./_managed-native-activity-adapter.js";

const adapters = Object.freeze({
  "ultimate-b2/ultimate-b2-students-book": ultimateB2NativeActivityAdapter,
  "ultimate-b2/ultimate-b2-workbook": createManagedNativeActivityAdapter("ultimate-b2-workbook"),
  "ultimate-b2/ultimate-b2-grammar-book": createManagedNativeActivityAdapter("ultimate-b2-grammar-book"),
});

export function resolveNativeActivityAdapter(bookSlug, componentSlug) {
  return adapters[`${bookSlug}/${componentSlug}`] || null;
}

export const nativeActivityAdapters = adapters;
