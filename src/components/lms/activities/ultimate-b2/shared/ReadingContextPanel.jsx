import { ReadingAudioTextPanel } from "./ReadingAudioTextPanel.jsx";

export function ReadingContextPanel({
  gapAnswers,
  selectedGap,
  selectedOption,
  dragOverGap,
  onGapClick,
  onGapDrop,
  onGapDragOver,
  onGapDragLeave,
  onRemoveGap,
  submittedRows,
  disabled = false,
}) {
  return (
    <div className="reading-context-panel">
      <ReadingAudioTextPanel
        gapAnswers={gapAnswers}
        selectedGap={selectedGap}
        selectedOption={selectedOption}
        dragOverGap={dragOverGap}
        onGapClick={onGapClick}
        onGapDrop={onGapDrop}
        onGapDragOver={onGapDragOver}
        onGapDragLeave={onGapDragLeave}
        onRemoveGap={onRemoveGap}
        submittedRows={submittedRows}
        disabled={disabled}
      />
    </div>
  );
}
