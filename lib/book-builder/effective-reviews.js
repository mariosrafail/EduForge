export const EFFECTIVE_REVIEW_STATUSES = new Set(["open", "resolved", "deferred", "not_applicable", "accepted_risk", "stale_resolution"]);

export function effectiveReviewQueue(queue, decisions = []) {
  const generated = Array.isArray(queue?.items) ? queue.items : [];
  const byReview = new Map();
  for (const decision of decisions) {
    if (decision.approvalState !== "approved") continue;
    for (const reviewId of decision.resolvesReviewIds || []) {
      const status = decision.stale ? "stale_resolution"
        : decision.kind === "review_disposition" ? decision.value : "resolved";
      if (!EFFECTIVE_REVIEW_STATUSES.has(status)) continue;
      byReview.set(reviewId, { status, decisionId: decision.id });
    }
  }
  const items = generated.map((item) => {
    const overlay = byReview.get(item.id);
    return { ...item, generatedStatus: item.status || "open", effectiveStatus: overlay?.status || "open", resolvingDecisionId: overlay?.decisionId || null };
  });
  const count = (status) => items.filter((item) => item.effectiveStatus === status).length;
  return {
    items,
    summary: {
      totalGenerated: items.length,
      open: count("open"),
      resolved: count("resolved"),
      deferred: count("deferred"),
      notApplicable: count("not_applicable"),
      acceptedRisk: count("accepted_risk"),
      stale: count("stale_resolution"),
      blockingOpen: items.filter((item) => item.blocking === true && item.effectiveStatus === "open").length,
    },
  };
}
