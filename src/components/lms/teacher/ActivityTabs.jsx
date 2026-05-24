import { useState } from "react";
import { BookOpenCheck, GitBranch, GripVertical, ListChecks, Plus, TableCellsMerge, Trash2 } from "lucide-react";

function shortType(type) {
  if (type === "gap-fill") return "Gap Fill";
  if (type === "line-matching") return "Matching";
  if (type === "multiple-choice") return "Multiple Choice";
  if (type === "word-search") return "Word Search";
  return "Activity";
}

function iconFor(type) {
  if (type === "gap-fill") return BookOpenCheck;
  if (type === "line-matching") return GitBranch;
  if (type === "word-search") return TableCellsMerge;
  return ListChecks;
}

export function ActivityTabs({ activities, selectedIndex, onSelect }) {
  const [dragActivityId, setDragActivityId] = useState("");
  const [overActivityId, setOverActivityId] = useState("");
  const [newType, setNewType] = useState("gap-fill");

  const handleDrop = (targetId) => {
    if (!dragActivityId || dragActivityId === targetId) return;
    onSelect(selectedIndex, { type: "reorder", dragActivityId, targetId });
    setDragActivityId("");
    setOverActivityId("");
  };

  return (
    <aside className="activity-manager-sidebar" aria-label="Activity manager">
      <div className="activity-manager-head">
        <strong>Activities</strong>
        <span>Drag to reorder</span>
      </div>
      {activities.map((activity, index) => {
        const Icon = iconFor(activity.type);
        const selected = selectedIndex === index;
        return (
          <article
            key={activity.id}
            draggable
            onDragStart={() => setDragActivityId(activity.id)}
            onDragOver={(event) => {
              event.preventDefault();
              setOverActivityId(activity.id);
            }}
            onDragLeave={() => {
              if (overActivityId === activity.id) setOverActivityId("");
            }}
            onDrop={() => handleDrop(activity.id)}
            className={`activity-list-item ${selected ? "selected" : ""} ${overActivityId === activity.id ? "drag-over" : ""}`}
          >
            <button
              type="button"
              data-sound-click="nextActivity"
              role="tab"
              aria-selected={selected}
              className="activity-list-select"
              onClick={() => onSelect(index)}
            >
              <GripVertical size={15} className="drag-handle" />
              <Icon size={17} />
              <span>Activity {index + 1}: {shortType(activity.type)}</span>
            </button>
            <button
              type="button"
              className="activity-list-delete"
              data-sound-click="deleteRemove"
              onClick={() => onSelect(index, { type: "delete", activityId: activity.id })}
              aria-label={`Delete activity ${index + 1}`}
            >
              <Trash2 size={15} />
            </button>
          </article>
        );
      })}
      <div className="activity-add-row">
        <select value={newType} onChange={(event) => setNewType(event.target.value)} aria-label="New activity type">
          <option value="gap-fill">Gap Fill</option>
          <option value="line-matching">Line Matching</option>
          <option value="multiple-choice">Multiple Choice</option>
          <option value="word-search">Word Search</option>
        </select>
        <button
          type="button"
          className="secondary-action compact-action"
          onClick={() => onSelect(selectedIndex, { type: "add", activityType: newType })}
        >
          <Plus size={15} /> Add activity
        </button>
      </div>
    </aside>
  );
}
