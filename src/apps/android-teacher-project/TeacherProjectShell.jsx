import { useState } from "react";

import hamiltonHouseLogo from "../../assets/teacher-shell/hamilton-house-logo.png";
import ClassroomStageTransform from "../android-teacher-offline/ClassroomStageTransform.jsx";
import ClassroomToolOverlay from "../android-teacher-offline/ClassroomToolOverlay.jsx";
import ClassroomToolbar from "../android-teacher-offline/ClassroomToolbar.jsx";
import TeacherProjectTitleAnimation from "./TeacherProjectTitleAnimation.jsx";

function Artwork({ item, label, editing }) {
  if (!item?.normal) return editing ? <span className="teacher-project-asset-placeholder">{label}</span> : null;
  return (
    <span className="legacy-menu-button-art" aria-hidden="true">
      <img className="normal" src={item.normal} alt="" draggable="false" />
      {item.active && <img className="hover-pressed" src={item.active} alt="" draggable="false" />}
    </span>
  );
}

function UnitColumn({ items, editing, editionId, onOpenUnit, position }) {
  return (
    <div className={`legacy-home-unit-column is-${position}`} aria-label={`${items[0]?.label || "Units"} through ${items.at(-1)?.label || "Units"}`}>
      {items.map((unit) => (
        <button key={unit.id} type="button" className="legacy-home-unit available" data-teacher-control-id={unit.controlId} data-sound-category="button" aria-label={unit.label} onClick={() => onOpenUnit?.(editionId, unit.id)}>
          <Artwork item={unit} label={unit.label} editing={editing} />
        </button>
      ))}
    </div>
  );
}

function ExtrasColumn({ items, editing, position }) {
  return (
    <div className={`legacy-home-extras-column is-${position}`} aria-label={`Extras ${position} column`}>
      {items.map((item) => (
        <button key={item.id} type="button" className="legacy-home-extra-button" data-teacher-control-id={item.controlId} data-sound-category="button" aria-label={item.label} aria-disabled={item.destination ? undefined : "true"}>
          <Artwork item={item} label={item.label} editing={editing} />
        </button>
      ))}
    </div>
  );
}

export default function TeacherProjectShell({ config, animationsActive = true, editing = false, onOpenUnit }) {
  const [edition, setEdition] = useState(() => config.editions.find((item) => item.id === "students-book")?.id || config.editions[0]?.id || "");
  const surfaceKey = `teacher-project:${config.projectId || "draft"}:shell`;
  const extras = config.extras || [];
  const showExtras = extras.length > 0 && edition === "extras";
  const showUnits = !showExtras;
  const extrasLeft = extras.filter((item) => item.column === "left").sort((left, right) => left.order - right.order);
  const extrasRight = extras.filter((item) => item.column === "right").sort((left, right) => left.order - right.order);
  return (
    <main
      className="teacher-offline-library teacher-project-shell has-classroom-tools"
      data-teacher-project-shell=""
      data-project-id={config.projectId}
      style={{ "--legacy-classroom-background": config.background ? `url(${config.background})` : "none" }}
    >
      <header className="legacy-home-floating-chrome">
        <img className="legacy-home-publisher-logo" src={config.publisherLogo || hamiltonHouseLogo} alt="Hamilton House — English Language Teaching" />
      </header>
      <section className="legacy-home-classroom-surface" data-classroom-surface-id={surfaceKey} tabIndex={-1} aria-label={`${config.displayName || "Teacher project"} classroom launcher`}>
        <ClassroomStageTransform surfaceKey={surfaceKey}>
          <div className="legacy-home-launcher">
            {showUnits ? <UnitColumn items={config.units.slice(0, 5)} editing={editing} editionId={edition} onOpenUnit={onOpenUnit} position="left" />
              : showExtras ? <ExtrasColumn items={extrasLeft} editing={editing} position="left" />
                : <div className="legacy-home-empty-column" aria-hidden="true" />}
            <TeacherProjectTitleAnimation bundle={config.titleAnimation} animate={animationsActive} editing={editing} />
            {showUnits ? <UnitColumn items={config.units.slice(5)} editing={editing} editionId={edition} onOpenUnit={onOpenUnit} position="right" />
              : showExtras ? <ExtrasColumn items={extrasRight} editing={editing} position="right" />
                : <div className="legacy-home-empty-column" aria-hidden="true" />}
            <div className="legacy-home-book-row teacher-project-edition-row" aria-label="Book editions">
              {config.editions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="legacy-home-book-button"
                  data-teacher-control-id={item.controlId}
                  data-sound-category="button"
                  aria-label={item.label}
                  aria-pressed={edition === item.id}
                  onClick={() => setEdition(item.id)}
                >
                  <Artwork item={item} label={item.label} editing={editing} />
                </button>
              ))}
            </div>
          </div>
          <ClassroomToolOverlay surfaceKey={surfaceKey} />
        </ClassroomStageTransform>
      </section>
      <ClassroomToolbar surfaceKey={surfaceKey} items={config.toolbar} />
    </main>
  );
}
