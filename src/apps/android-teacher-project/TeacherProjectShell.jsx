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

function UnitColumn({ items, editing }) {
  return (
    <div className="legacy-home-unit-column" aria-label={`${items[0]?.label || "Units"} through ${items.at(-1)?.label || "Units"}`}>
      {items.map((unit) => (
        <button key={unit.id} type="button" className="legacy-home-unit available" data-teacher-control-id={unit.controlId} data-sound-category="button" aria-label={unit.label}>
          <Artwork item={unit} label={unit.label} editing={editing} />
        </button>
      ))}
    </div>
  );
}

export default function TeacherProjectShell({ config, animationsActive = true, editing = false }) {
  const [edition, setEdition] = useState("students-book");
  const surfaceKey = `teacher-project:${config.projectId || "draft"}:shell`;
  return (
    <main
      className="teacher-offline-library teacher-project-shell has-classroom-tools"
      data-teacher-project-shell=""
      data-project-id={config.projectId}
      style={{ "--legacy-classroom-background": config.background ? `url(${config.background})` : "none" }}
    >
      <header className="legacy-home-floating-chrome">
        <img className="legacy-home-publisher-logo" src={hamiltonHouseLogo} alt="Hamilton House — English Language Teaching" />
      </header>
      <section className="legacy-home-classroom-surface" data-classroom-surface-id={surfaceKey} tabIndex={-1} aria-label={`${config.displayName || "Teacher project"} classroom launcher`}>
        <ClassroomStageTransform surfaceKey={surfaceKey}>
          <div className="legacy-home-launcher">
            <UnitColumn items={config.units.slice(0, 5)} editing={editing} />
            <TeacherProjectTitleAnimation bundle={config.titleAnimation} animate={animationsActive} editing={editing} />
            <UnitColumn items={config.units.slice(5)} editing={editing} />
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
                  <Artwork item={edition === item.id ? { ...item, normal: item.active || item.normal } : item} label={item.label} editing={editing} />
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
