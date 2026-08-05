import { nestedCandidateId } from "./activity-candidate-contract.js";
import { collectNamed, geometry, parseActivityXml, plainText } from "./activity-xml.js";

export function parseDragAndDrop({ xml, activityCandidateId, sourceRelativePath, sourceSha256 }) {
  const document = parseActivityXml(xml); const sourceDrags = collectNamed(document, "drag"); const sourceDrops = collectNamed(document, "drop");
  const draggables = sourceDrags.map((drag, index) => ({ id: nestedCandidateId("drag", activityCandidateId, drag?.["@_id"] ?? `drag-${index + 1}`), publisherId: drag?.["@_id"] === undefined ? null : String(drag["@_id"]), label: plainText(drag), labelAvailability: plainText(drag) ? "structured" : "raster-only-or-missing", geometry: geometry(drag), sourceEvidence: [{ sourceRelativePath, sourceSha256 }] }));
  const targets = sourceDrops.map((drop, index) => ({ id: nestedCandidateId("target", activityCandidateId, drop?.["@_id"] ?? `drop-${index + 1}`), publisherId: drop?.["@_id"] === undefined ? null : String(drop["@_id"]), label: plainText(drop), labelAvailability: plainText(drop) ? "structured" : "raster-only-or-missing", geometry: geometry(drop), sourceEvidence: [{ sourceRelativePath, sourceSha256 }] }));
  const dragByPublisherId = new Map(draggables.filter((item) => item.publisherId !== null).map((item) => [item.publisherId, item])); const mappings = []; const issues = [];
  sourceDrops.forEach((drop, index) => {
    if (drop?.["@_answers"] === undefined) return;
    const raw = String(drop["@_answers"]); const publisherIds = raw.includes("|") ? raw.split("|") : [raw]; const unresolvedPublisherIds = publisherIds.filter((id) => !dragByPublisherId.has(id));
    mappings.push({ targetId: targets[index].id, publisherRawValue: raw, acceptedDraggableIds: publisherIds.map((id) => dragByPublisherId.get(id)?.id).filter(Boolean), multipleAccepted: publisherIds.length > 1, orderingSignificant: false, unresolvedPublisherIds, confidence: unresolvedPublisherIds.length ? 0 : 1, sourceEvidence: [{ sourceRelativePath, sourceSha256 }] });
    if (unresolvedPublisherIds.length) issues.push({ reasonCode: "unresolved_answer_reference", targetId: targets[index].id, sourceRelativePath, evidence: { unresolvedReferenceCount: unresolvedPublisherIds.length } });
  });
  for (const item of draggables.filter((entry) => entry.labelAvailability !== "structured")) issues.push({ reasonCode: "raster_drag_label_missing", draggableId: item.id, sourceRelativePath });
  for (const item of targets.filter((entry) => entry.labelAvailability !== "structured")) issues.push({ reasonCode: "raster_target_label_missing", targetId: item.id, sourceRelativePath });
  return { draggables, targets, mappings, issues, summary: { draggableCount: draggables.length, targetCount: targets.length, mappingCount: mappings.length, multiTargetCount: mappings.filter((item) => item.multipleAccepted).length, unresolvedReferenceCount: mappings.reduce((sum, item) => sum + item.unresolvedPublisherIds.length, 0), rasterLabelCount: draggables.filter((item) => item.labelAvailability !== "structured").length } };
}
