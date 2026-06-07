export function normalizeAnswer(value) {
  return String(value || "").trim().toLowerCase();
}

export function answerMatches(value, accepted = []) {
  const normalized = normalizeAnswer(value);
  return accepted.map(normalizeAnswer).includes(normalized);
}
