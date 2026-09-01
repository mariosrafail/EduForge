const FORBIDDEN_SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f]/;
const FORBIDDEN_MULTILINE_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;

export function normalizeNativeLineEndings(value) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value;
}

export function normalizeNativeText(value, label, maximum, {
  required = false,
  multiline = false,
  forbidMarkup = true,
} = {}) {
  const normalizedLineEndings = normalizeNativeLineEndings(value);
  const forbiddenControl = multiline ? FORBIDDEN_MULTILINE_CONTROL : FORBIDDEN_SINGLE_LINE_CONTROL;
  if (typeof normalizedLineEndings !== "string"
    || normalizedLineEndings.length > maximum
    || forbiddenControl.test(normalizedLineEndings)
    || (forbidMarkup && /[<>]/.test(normalizedLineEndings))) {
    throw new Error(`${label} is invalid.`);
  }
  const normalized = normalizedLineEndings.trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export function normalizeNativePedagogicalText(value, label, maximum, options = {}) {
  return normalizeNativeText(value, label, maximum, { ...options, multiline: true });
}

export function normalizeNativeSingleLineText(value, label, maximum, options = {}) {
  return normalizeNativeText(value, label, maximum, { ...options, multiline: false });
}
