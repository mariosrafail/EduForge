export const EFFECTIVE_REVIEW_STATUSES = new Set(["open", "resolved", "deferred", "not_applicable", "accepted_risk", "stale_resolution"]);

export function effectiveReviewQueue(queue, decisions = []) {
  const generated = Array.isArray(queue?.items) ? queue.items : [];
  const byReview = new Map();
  for (const decision of decisions) {
    if (decision.approvalState !== "approved") continue;
    for (const reviewId of decision.resolvesReviewIds || []) {
      const current = byReview.get(reviewId) || { domain: null, disposition: null, stale: null };
      if (decision.stale) current.stale ||= { status: "stale_resolution", decisionId: decision.id };
      else if (decision.kind === "review_disposition" && EFFECTIVE_REVIEW_STATUSES.has(decision.value)) current.disposition = { status: decision.value, decisionId: decision.id };
      else current.domain = { status: "resolved", decisionId: decision.id };
      byReview.set(reviewId, current);
    }
  }
  const items = generated.map((item) => {
    const candidates = byReview.get(item.id);
    const overlay = candidates?.domain || candidates?.disposition || candidates?.stale || null;
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
