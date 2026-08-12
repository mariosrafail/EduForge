import committedManifest from "virtual:ultimate-b2-hosted-hotspot-data";

export const ultimateB2StudentsBookHotspotManifest = committedManifest;

export function getUltimateB2StudentsBookHotspots({ pageId, pageNumber, unitNumber } = {}) {
  const hotspots = committedManifest.pages?.[String(pageId || "")] || [];
  return hotspots.filter((hotspot) => (
    (!Number.isFinite(Number(pageNumber)) || Number(hotspot.pageNumber) === Number(pageNumber))
    && (!Number.isFinite(Number(unitNumber)) || Number(hotspot.unitNumber) === Number(unitNumber))
  ));
}

export function ultimateB2StudentsBookHotspotToAction(hotspot) {
  if (!hotspot || hotspot.actionType !== "normalized_activity" || !hotspot.activityKey) return null;
  return {
    id: hotspot.id,
    label: hotspot.label,
    ariaLabel: hotspot.label || "Open Students Book activity",
    target: "normalized-activity",
    classification: "activity",
    availability: "enabled",
    activityKey: hotspot.activityKey,
    authoredHotspot: true,
    top: `${hotspot.top}%`, left: `${hotspot.left}%`, width: `${hotspot.width}%`, height: `${hotspot.height}%`,
  };
}

export function getUltimateB2AuthoredHotspotActivityKey(action) {
  if (!action?.authoredHotspot || action.target !== "normalized-activity" || !action.activityKey) return null;
  return String(action.activityKey);
}

export function getUltimateB2StudentsBookHotspotActions(identity = {}) {
  return getUltimateB2StudentsBookHotspots(identity).map(ultimateB2StudentsBookHotspotToAction).filter(Boolean);
}
