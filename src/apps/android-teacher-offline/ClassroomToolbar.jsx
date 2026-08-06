import { useState } from "react";

import { ultimateB2TeacherToolbarItems } from "./legacyClassroomAssets.js";

function LegacyTeacherToolButton({ item, selected, onSelect }) {
  return (
    <button
      type="button"
      className="legacy-teacher-tool-button"
      data-teacher-tool={item.id}
      aria-label={item.label}
      aria-pressed={selected}
      title={item.label}
      onClick={() => onSelect(item.id)}
    >
      <span className="legacy-teacher-tool-icon-stack" aria-hidden="true">
        <img className="legacy-teacher-tool-icon legacy-teacher-tool-icon-normal" src={item.normal} alt="" draggable="false" />
        <img className="legacy-teacher-tool-icon legacy-teacher-tool-icon-active" src={item.active} alt="" draggable="false" />
      </span>
    </button>
  );
}

export default function ClassroomToolbar() {
  const [selectedTool, setSelectedTool] = useState("mouse");

  return (
    <div className="legacy-classroom-viewer-toolbar classroom-teaching-toolbar" role="toolbar" aria-label="Classroom teaching tools">
      <div className="classroom-tool-primary legacy-teacher-tool-row">
        {ultimateB2TeacherToolbarItems.map((item) => (
          <LegacyTeacherToolButton
            key={item.id}
            item={item}
            selected={selectedTool === item.id}
            onSelect={setSelectedTool}
          />
        ))}
      </div>
    </div>
  );
}
