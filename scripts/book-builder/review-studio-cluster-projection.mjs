export function unavailableClusterReviewResponse(summary, pageSize) {
  return {
    available: true,
    clustersAvailable: false,
    summary,
    grouping: "cluster",
    items: [],
    pagination: { page: 1, pageSize, total: 0, pageCount: 1 },
    selectedGroup: null,
  };
}
