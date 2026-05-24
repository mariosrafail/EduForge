import { useEffect, useState } from "react";
import { BookOpenCheck, CheckCircle2, GitBranch, ListChecks, Plus, TableCellsMerge, X } from "lucide-react";
import { useSoundEffects } from "../../../context/SoundContext.jsx";

const activityOptions = [
  {
    type: "gap-fill",
    title: "Gap Fill",
    description: "Students drag words into missing spaces.",
    icon: BookOpenCheck,
  },
  {
    type: "line-matching",
    title: "Matching",
    description: "Students connect related items.",
    icon: GitBranch,
  },
  {
    type: "multiple-choice",
    title: "Multiple Choice",
    description: "Students choose the correct answer.",
    icon: ListChecks,
  },
  {
    type: "word-search",
    title: "Word Search",
    description: "Students find hidden words in a letter grid.",
    icon: TableCellsMerge,
  },
];

export function AddActivityModal({ onClose, onAdd, adding = false }) {
  const { playSound } = useSoundEffects();
  const [selectedType, setSelectedType] = useState("gap-fill");

  useEffect(() => {
    playSound("modalOpen");
  }, [playSound]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !adding) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [adding, onClose]);

  const close = () => {
    if (adding) return;
    playSound("modalClose");
    onClose();
  };

  return (
    <div className="activity-preview-modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        className="activity-preview-modal add-activity-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choose activity type"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="activity-preview-modal-head">
          <div className="editor-section-heading">
            <Plus size={19} />
            <div>
              <strong>Choose activity type</strong>
              <span>Select the kind of practice activity you want to add to this lesson.</span>
            </div>
          </div>
          <button type="button" data-sound-ignore="true" className="modal-close-button" aria-label="Close add activity modal" onClick={close} disabled={adding}>
            <X size={18} />
          </button>
        </div>

        <div className="add-activity-choice-grid" role="radiogroup" aria-label="Activity type">
          {activityOptions.map((option) => {
            const Icon = option.icon;
            const selected = selectedType === option.type;
            return (
              <button
                key={option.type}
                type="button"
                className={`add-activity-choice ${selected ? "selected" : ""}`}
                role="radio"
                aria-checked={selected}
                onClick={() => setSelectedType(option.type)}
                disabled={adding}
              >
                <span className="add-activity-choice-icon"><Icon size={19} /></span>
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
                {selected && <CheckCircle2 size={18} className="add-activity-selected-icon" />}
              </button>
            );
          })}
        </div>

        <div className="add-activity-modal-actions">
          <button type="button" className="secondary-action" onClick={close} disabled={adding}>Cancel</button>
          <button type="button" className="primary-action" data-sound-ignore="true" onClick={() => onAdd(selectedType)} disabled={adding}>
            <Plus size={17} /> {adding ? "Adding..." : "Add activity"}
          </button>
        </div>
      </section>
    </div>
  );
}
