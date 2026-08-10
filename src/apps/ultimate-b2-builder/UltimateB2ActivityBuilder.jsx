import { useMemo, useState } from "react";

import { ultimateB2StudentsBookAuthoringActivities } from "../../data/ultimate-b2/studentsBookAuthoringCatalog.js";
import { buildUltimateB2ActivityNavigation } from "./activityBuilderNavigation.js";
import { ultimateB2ActivityEditorMetadata, ultimateB2ActivityEditorRegistry } from "./activityEditorRegistry.js";
import { UltimateB2ActivityNavigation } from "./UltimateB2ActivityNavigation.jsx";

const defaultActivityId = "ultimate-b2-sb-u1-p1-o1";

export function UltimateB2ActivityBuilder() {
  const [selectedActivityId, setSelectedActivityId] = useState(defaultActivityId);
  const groups = useMemo(() => buildUltimateB2ActivityNavigation(ultimateB2StudentsBookAuthoringActivities, ultimateB2ActivityEditorMetadata), []);
  const selectedActivity = ultimateB2StudentsBookAuthoringActivities.find((activity) => activity.activityKey === selectedActivityId) || ultimateB2StudentsBookAuthoringActivities[0];
  const selectedEditor = ultimateB2ActivityEditorRegistry[selectedActivity.activityKey];
  const exerciseLabel = String(selectedActivity.title || "").match(/Exercise\s+\d+/i)?.[0] || selectedActivity.title.split("·").at(-1)?.trim();

  return (
    <main className="activity-builder">
      <UltimateB2ActivityNavigation groups={groups} selectedActivityId={selectedActivityId} onSelect={setSelectedActivityId} />
      <section className="activity-builder-workspace">
        <header className="activity-builder-selection-header">
          <div className="activity-builder-selection-path">
            <span>Unit {selectedActivity.unitNumber}</span><span>{selectedActivity.pageLabel}</span><span>{selectedActivity.sectionTitle}</span><span>{exerciseLabel}</span><strong>{selectedEditor?.label || "Not configurable yet"}</strong>
          </div>
          <div><small>Stable activity ID</small><code>{selectedActivity.activityKey}</code></div>
        </header>
        <div className="activity-builder-editor-stack">
          {Object.entries(ultimateB2ActivityEditorRegistry).map(([activityKey, editor]) => {
            const Editor = editor.component;
            const editorActivity = ultimateB2StudentsBookAuthoringActivities.find((activity) => activity.activityKey === activityKey);
            return <div className="activity-builder-editor" key={activityKey} hidden={selectedActivityId !== activityKey}><Editor activityId={activityKey} activity={editorActivity} /></div>;
          })}
        </div>
      </section>
    </main>
  );
}
