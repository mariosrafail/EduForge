export const analyticsColors = Object.freeze({
  "auto-scored": "var(--analytics-blue)",
  reviewed: "var(--analytics-green)",
  "awaiting-review": "var(--analytics-amber)",
  "unscored-completed": "var(--analytics-violet)",
  missing: "var(--analytics-coral)",
  excellent: "var(--analytics-green)",
  good: "var(--analytics-teal)",
  developing: "var(--analytics-amber)",
  "needs-support": "var(--analytics-coral)",
});

export function chartMotion(reducedMotion) {
  return reducedMotion
    ? { initial: false, transition: { duration: 0 } }
    : { initial: { opacity: 0 }, transition: { duration: 0.45, ease: "easeOut" } };
}

export function metricLabel(value, suffix = "") {
  return value === null || value === undefined ? "Not scored" : `${value}${suffix}`;
}

export function chartPercent(count, total) {
  return total > 0 ? Math.round((Number(count || 0) / total) * 1000) / 10 : 0;
}
