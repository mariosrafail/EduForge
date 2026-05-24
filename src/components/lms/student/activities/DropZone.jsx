import { X } from "lucide-react";
import { useState } from "react";
import { useSoundEffects } from "../../../../context/SoundContext.jsx";

export function DropZone({ id, label, value, disabled = false, state = "", onDropValue, onClear, selectedChipId }) {
  const { playSound } = useSoundEffects();
  const [isOver, setIsOver] = useState(false);
  const [dropFeedback, setDropFeedback] = useState("");

  const handleDrop = (event) => {
    event.preventDefault();
    setIsOver(false);
    const droppedId = event.dataTransfer.getData("text/plain");
    if (droppedId) {
      onDropValue(id, droppedId);
      setDropFeedback("drop-success");
      playSound("dropSuccess");
    } else {
      setDropFeedback("drop-invalid");
      playSound("dropInvalid");
    }
    window.setTimeout(() => setDropFeedback(""), 220);
  };

  return (
    <div
      className={`drop-zone ${isOver ? "is-drag-over over" : ""} ${value ? "filled is-dropped" : ""} ${dropFeedback} ${state}`}
      onDragOver={(event) => {
        if (!disabled) {
          event.preventDefault();
          setIsOver(true);
        }
      }}
      onDragLeave={() => setIsOver(false)}
      onDragEnd={() => setIsOver(false)}
      onDrop={disabled ? undefined : handleDrop}
    >
      {label && <span className="drop-zone-label">{label}</span>}
      <button
        type="button"
        data-sound-ignore="true"
        className="drop-zone-target"
        disabled={disabled || !selectedChipId}
        onClick={() => {
          if (selectedChipId) {
            onDropValue(id, selectedChipId);
            setDropFeedback("drop-success");
            playSound("dropSuccess");
            window.setTimeout(() => setDropFeedback(""), 220);
            return;
          }
          playSound("dropInvalid");
          setDropFeedback("drop-invalid");
          window.setTimeout(() => setDropFeedback(""), 220);
        }}
      >
        {value || "Drop answer here"}
      </button>
      {!disabled && value && (
        <button type="button" data-sound-ignore="true" className="drop-zone-clear" onClick={() => {
          playSound("deleteRemove");
          onClear(id);
        }} aria-label="Clear answer">
          <X size={15} />
        </button>
      )}
    </div>
  );
}
