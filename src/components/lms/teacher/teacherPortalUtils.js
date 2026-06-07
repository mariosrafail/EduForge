export function dueDateTone(dueDate) {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "neutral";
  const now = new Date("2026-05-31T12:00:00");
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 2) return "soon";
  return "normal";
}

export function dueDateLabel(dueDate) {
  const tone = dueDateTone(dueDate);
  if (tone === "overdue") return "Overdue";
  if (tone === "soon") return "Due soon";
  return "On track";
}
