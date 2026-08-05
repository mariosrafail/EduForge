import { validateManualActivity } from "./manual-activity-contract.js";
import { validateManualActivitySolution } from "./manual-activity-solutions.js";

export function manualActivityCanResolveReviews(activity, solution, options = {}) {
  if (!activity || activity.status !== "approved" || !activity.replacesCandidateId || activity.stale) return false;
  if (!validateManualActivity(activity, { ...options, requireApproval: true }).valid) return false;
  if (["multiple_choice", "true_false", "typed_gap_fill", "image_backed"].includes(activity.type) && !validateManualActivitySolution(solution, activity, { requireComplete: true }).valid) return false;
  return true;
}

export function effectiveReviewWithManualActivities(review, activities, solutions, options = {}) {
  const candidateId = review.activityCandidateId || review.targetActivityCandidateId;
  const replacement = activities.find((activity) => activity.replacesCandidateId === candidateId && manualActivityCanResolveReviews(activity, solutions.find((item) => item.activityId === activity.activityId), options));
  return replacement ? { ...review, effectiveStatus: "resolved_by_manual_activity", manualActivityId: replacement.activityId } : { ...review, effectiveStatus: review.status || "open", manualActivityId: null };
}
