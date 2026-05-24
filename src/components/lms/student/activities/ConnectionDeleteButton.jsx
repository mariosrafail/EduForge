import { X } from "lucide-react";

export function ConnectionDeleteButton({ line, leftLabel, rightLabel, disabled = false, onRemove }) {
  return (
    <button
      type="button"
      data-sound-ignore="true"
      className="connection-delete-button"
      style={{ left: line.to.x, top: line.to.y }}
      aria-label={`Remove connection from ${leftLabel} to ${rightLabel}`}
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onRemove(line.leftId);
      }}
    >
      <X size={13} />
    </button>
  );
}
