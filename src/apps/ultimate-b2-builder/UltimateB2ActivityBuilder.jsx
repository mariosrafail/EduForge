import { useMemo, useState } from "react";

import { ultimateB2StudentsBookAuthoringActivities, ultimateB2StudentsBookAuthoringPages } from "../../data/ultimate-b2/studentsBookAuthoringCatalog.js";
import { nextUltimateB2PublisherActivityId } from "../../data/ultimate-b2/publisherCreatedActivities.js";
import { buildUltimateB2ActivityNavigation } from "./activityBuilderNavigation.js";
import { resolveUltimateB2ActivityEditor, ultimateB2ActivityEditorMetadataFor, ultimateB2ActivityEditorRegistry } from "./activityEditorRegistry.js";
import { UltimateB2ActivityNavigation } from "./UltimateB2ActivityNavigation.jsx";

const defaultActivityId = "ultimate-b2-sb-u1-p1-o1";

function mutationId() {
  if (globalThis.crypto?.randomUUID) return `draft:${globalThis.crypto.randomUUID()}`;
  return `draft:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export function UltimateB2ActivityBuilder({ activities = ultimateB2StudentsBookAuthoringActivities, onPublisherActivityCreated = () => undefined }) {
  const [selectedActivityId, setSelectedActivityId] = useState(defaultActivityId);
  const [drafts, setDrafts] = useState([]);
  const allActivities = useMemo(() => [...activities, ...drafts.filter((draft) => !activities.some((activity) => activity.activityKey === draft.activityKey))], [activities, drafts]);
  const groups = useMemo(() => buildUltimateB2ActivityNavigation(allActivities, ultimateB2ActivityEditorMetadataFor), [allActivities]);
  const selectedActivity = allActivities.find((activity) => activity.activityKey === selectedActivityId) || allActivities[0];
  const selectedEditor = ultimateB2ActivityEditorRegistry[selectedActivity?.activityKey] || resolveUltimateB2ActivityEditor(selectedActivity);
  const exerciseLabel = String(selectedActivity?.title || "").match(/Exercise\s+\d+/i)?.[0] || selectedActivity?.title?.split("·").at(-1)?.trim();

  const createDraft = (pageGroup, authoringKind) => {
    const page = ultimateB2StudentsBookAuthoringPages.find((candidate) => candidate.id === pageGroup.pageId);
    if (!page) return;
    const activityKey = nextUltimateB2PublisherActivityId(page, allActivities.map((activity) => activity.activityKey));
    const label = authoringKind === "image" ? "Image" : "Open Response";
    const draft = {
      activityKey,
      unitNumber: page.unitNumber,
      partNumber: page.partNumber,
      pageId: page.id,
      pageNumber: page.pageNumber,
      pageSpread: page.spreadNumber,
      pageLabel: page.pageNumbers.length > 1 ? `Pages ${page.spreadNumber}` : `Page ${page.pageNumber}`,
      sectionTitle: page.sectionTitle,
      title: `${page.sectionTitle} · New ${label}`,
      availability: "draft",
      implementationMode: authoringKind === "image" ? "reading-content" : "teacher-reviewed",
      implementationStatus: "publisher-draft",
      authoringKind,
      publisherCreated: true,
      publisherDraft: true,
      clientMutationId: mutationId(),
    };
    setDrafts((current) => [...current.filter((item) => item.activityKey !== activityKey), draft]);
    setSelectedActivityId(activityKey);
  };

  const created = (record, draftActivityId = selectedActivityId) => {
    onPublisherActivityCreated(record);
    setDrafts((current) => current.filter((draft) => draft.activityKey !== draftActivityId));
    setSelectedActivityId(record.activityId);
  };

  if (!selectedActivity) return <main className="activity-builder"><p>No Ultimate B2 activities were found.</p></main>;
  return (
    <main className="activity-builder">
      <UltimateB2ActivityNavigation groups={groups} selectedActivityId={selectedActivityId} onSelect={setSelectedActivityId} onCreateDraft={createDraft} />
      <section className="activity-builder-workspace">
        <header className="activity-builder-selection-header">
          <div className="activity-builder-selection-path">
            <span>Unit {selectedActivity.unitNumber}</span><span>{selectedActivity.pageLabel}</span><span>{selectedActivity.sectionTitle}</span><span>{exerciseLabel}</span><strong>{selectedEditor?.label || "Not configurable yet"}</strong>
          </div>
          <div><small>Stable activity ID{selectedActivity.publisherDraft ? " · reserved on save" : ""}</small><code>{selectedActivity.activityKey}</code></div>
        </header>
        <div className="activity-builder-editor-stack">
          {allActivities.map((activity) => {
            const editor = ultimateB2ActivityEditorRegistry[activity.activityKey] || resolveUltimateB2ActivityEditor(activity);
            if (!editor) return null;
            const Editor = editor.component;
            return <div className="activity-builder-editor" key={activity.activityKey} hidden={selectedActivityId !== activity.activityKey}><Editor activityId={activity.activityKey} activity={activity} onPublisherActivityCreated={(record) => created(record, activity.activityKey)} /></div>;
          })}
          {!selectedEditor && <div className="inline-status warning">This trusted activity kind has no supported editor.</div>}
        </div>
      </section>
    </main>
  );
}
