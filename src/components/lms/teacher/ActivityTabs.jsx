import { BookOpenCheck, GitBranch, ListChecks } from "lucide-react";

function shortType(type) {
  if (type === "gap-fill") return "Gap Fill";
  if (type === "line-matching") return "Matching";
  if (type === "multiple-choice") return "Multiple Choice";
  return "Activity";
}

function iconFor(type) {
  if (type === "gap-fill") return BookOpenCheck;
  if (type === "line-matching") return GitBranch;
  return ListChecks;
}

export function ActivityTabs({ activities, selectedIndex, onSelect }) {
  return (
    <div className="activity-tab-strip" role="tablist" aria-label="Lesson activities">
      {activities.map((activity, index) => {
        const Icon = iconFor(activity.type);
        const selected = selectedIndex === index;
        return (
          <button
            key={activity.id}
            type="button"
            data-sound-click="nextActivity"
            role="tab"
            aria-selected={selected}
            className={selected ? "selected" : ""}
            onClick={() => onSelect(index)}
          >
            <Icon size={17} />
            <span>Activity {index + 1}: {shortType(activity.type)}</span>
          </button>
        );
      })}
    </div>
  );
}
