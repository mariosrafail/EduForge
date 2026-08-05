function list(value) { return Array.isArray(value) ? value : []; }

export function manualHierarchyFromOwnership(ownership, { part = null, pageCandidateId = null, hotspotCandidateIds = [] } = {}) {
  if (!ownership?.resolved || !ownership.componentKey || !ownership.unitKey) throw new Error("Detected candidate hierarchy is unresolved");
  return {
    sourceBookRootKey: ownership.sourceBookRootId,
    componentKey: ownership.componentKey,
    effectiveComponentRole: ownership.effectiveRole,
    unitGroupKey: ownership.unitKey,
    unitGroupNumber: ownership.sourceNumber,
    part: Number.isSafeInteger(part) ? part : null,
    ...(pageCandidateId ? { pageCandidateId } : {}),
    hotspotCandidateIds: [...new Set(hotspotCandidateIds)].sort(),
  };
}

export function createManualHierarchyResolver(hierarchy, { pages = [], hotspots = [] } = {}) {
  const components = new Map(list(hierarchy?.components).map((component) => [component.componentKey, component]));
  const pageOwners = new Map(list(pages).map((page) => [page.candidateId, { componentKey: page.hierarchy?.componentKey || page.componentKey, unitKey: page.hierarchy?.unitKey || page.unitKey }]));
  const hotspotOwners = new Map(list(hotspots).map((hotspot) => [hotspot.candidateId || hotspot.id, { componentKey: hotspot.componentKey, unitKey: hotspot.unitKey }]));
  return (binding) => {
    const component = components.get(binding?.componentKey);
    if (!component || component.sourceBookRootId !== binding.sourceBookRootKey || component.effectiveRole !== binding.effectiveComponentRole) return "component does not belong to the selected book root and effective role";
    const unit = list(component.unitGroups).find((item) => item.unitKey === binding.unitGroupKey);
    if (!unit || unit.sourceNumber !== binding.unitGroupNumber) return "Unit/group does not belong to the selected component";
    if (binding.pageCandidateId) { const owner = pageOwners.get(binding.pageCandidateId); if (!owner || owner.componentKey !== component.componentKey || owner.unitKey !== unit.unitKey) return "page does not belong to the selected component and Unit/group"; }
    for (const hotspotId of list(binding.hotspotCandidateIds)) { const owner = hotspotOwners.get(hotspotId); if (!owner || owner.componentKey !== component.componentKey || owner.unitKey !== unit.unitKey) return "hotspot does not belong to the selected component and Unit/group"; }
    return true;
  };
}
