import { normalizeNativeOldschoolListeningInteraction } from "./nativeOldschoolListening.js";

export const NATIVE_OLDSCHOOL_LISTENING_JSON_MAXIMUM_BYTES = 1024 * 1024;

export function parseNativeOldschoolListeningJson(input, context = {}) {
  if (typeof input !== "string" || new TextEncoder().encode(input).length > NATIVE_OLDSCHOOL_LISTENING_JSON_MAXIMUM_BYTES) throw new Error("Oldschool Listening JSON is empty or exceeds 1 MiB.");
  let value;
  try { value = JSON.parse(input); } catch { throw new Error("Oldschool Listening JSON is malformed."); }
  return normalizeNativeOldschoolListeningInteraction(value, context);
}

export function serializeNativeOldschoolListeningJson(interaction, context = {}) {
  return `${JSON.stringify(normalizeNativeOldschoolListeningInteraction(interaction, context), null, 2)}\n`;
}
