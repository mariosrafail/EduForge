function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, allowed, label) {
  const keys = Object.keys(record(value, label));
  const allowedSet = new Set(allowed);
  if (keys.some((key) => !allowedSet.has(key)) || allowed.some((key) => !keys.includes(key))) {
    throw new Error(`${label} has missing or unknown fields.`);
  }
}

function optionalBinding(value, label, allowedBindings) {
  if (value === null) return null;
  if (typeof value !== "string" || !allowedBindings.has(value)) throw new Error(`${label} uses an unknown image binding.`);
  return value;
}

export function normalizeUltimateB2ExerciseVisualCapabilities(input, {
  instructionImages = [],
  showTextImages = [],
} = {}) {
  const value = structuredClone(record(input, "Exercise visual capabilities"));
  exactKeys(value, ["instructionImage", "showText"], "Exercise visual capabilities");
  const showText = record(value.showText, "Exercise Show Text capability");
  exactKeys(showText, ["enabled", "showTextImage"], "Exercise Show Text capability");
  if (typeof showText.enabled !== "boolean") throw new Error("Exercise Show Text enabled must be a boolean.");
  const instructionImage = optionalBinding(value.instructionImage, "instructionImage", new Set(instructionImages));
  const showTextImage = optionalBinding(showText.showTextImage, "showTextImage", new Set(showTextImages));
  if (showText.enabled && !showTextImage) throw new Error("Show Text requires a showTextImage binding when enabled.");
  if (!showText.enabled && showTextImage) throw new Error("showTextImage must be null when Show Text is disabled.");
  return {
    instructionImage,
    showText: { enabled: showText.enabled, showTextImage },
  };
}

export function ultimateB2ExercisePresentationFeatures(authoring) {
  return Object.freeze({
    showTextEnabled: Boolean(authoring?.visualCapabilities?.showText?.enabled),
    internalPartCount: Array.isArray(authoring?.parts) ? authoring.parts.length : 0,
  });
}
