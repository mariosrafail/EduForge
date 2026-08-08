import ClassroomStageTransform from "../android-teacher-offline/ClassroomStageTransform.jsx";
import ClassroomToolOverlay from "../android-teacher-offline/ClassroomToolOverlay.jsx";
import ClassroomToolbar from "../android-teacher-offline/ClassroomToolbar.jsx";
import TeacherProjectNavigation from "./TeacherProjectNavigation.jsx";

function EntryThumbnail({ entry }) {
  const images = entry.layout === "double-pair" ? [entry.leftImage, entry.rightImage] : [entry.image];
  return (
    <span className={`teacher-project-overview-thumb ${entry.layout}`}>
      {images.map((source, index) => source
        ? <img key={`${entry.id}-${index}`} src={source} alt="" loading="lazy" decoding="async" draggable="false" />
        : <span key={`${entry.id}-${index}`} aria-hidden="true">Image missing</span>)}
    </span>
  );
}

export default function TeacherProjectUnitOverview({ config, unit, onOpenEntry, onHome }) {
  const unitNumber = Number(unit.id.slice("unit-".length));
  const surfaceKey = `teacher-project:${config.projectId}:unit:${unit.id}:overview`;
  return (
    <main className="teacher-project-content-screen teacher-project-unit-overview teacher-offline-pages teacher-offline-unit-overview-screen has-classroom-tools" style={{ "--legacy-classroom-background": config.background ? `url(${config.background})` : "none" }}>
      <header className="legacy-page-heading legacy-overview-heading"><div aria-hidden="true" /><div><h2>Unit {unitNumber}</h2></div><div aria-hidden="true" /></header>
      <section className="teacher-project-content-stage" aria-label={`Unit ${unitNumber} page overview`}>
        <div className="teacher-project-overview-panel" data-classroom-surface-id={surfaceKey} tabIndex={-1}>
          <ClassroomStageTransform surfaceKey={surfaceKey}>
            <div className={`teacher-project-overview-grid ${unit.entries.length > 18 ? "is-very-dense" : unit.entries.length > 10 ? "is-dense" : ""}`.trim()} data-entry-count={unit.entries.length}>
              {unit.entries.map((entry) => (
                <button key={entry.id} type="button" className="teacher-project-overview-card" data-overview-entry={entry.id} onClick={() => onOpenEntry(entry.id)} aria-label={`Open ${entry.sectionTitle || "page"}, pg ${entry.pageLabel}`}>
                  <span className="teacher-project-overview-copy">{entry.sectionTitle && <strong>{entry.sectionTitle}</strong>}<b>pg {entry.pageLabel}</b></span>
                  <EntryThumbnail entry={entry} />
                </button>
              ))}
            </div>
            <ClassroomToolOverlay surfaceKey={surfaceKey} />
          </ClassroomStageTransform>
        </div>
      </section>
      <TeacherProjectNavigation onHome={onHome} onBack={onHome} />
      <ClassroomToolbar surfaceKey={surfaceKey} items={config.toolbar} />
    </main>
  );
}
