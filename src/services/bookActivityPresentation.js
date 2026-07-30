export function databaseActivityPresentation(activity = {}) {
  const minutes = activity.estimatedMinutes || activity.estimated_minutes;
  return {
    status: "Available",
    estimatedTime: minutes ? `${minutes} min` : "Self-paced",
  };
}
