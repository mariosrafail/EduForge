import { BookOpen } from "lucide-react";
import { Card } from "../../../Shared.jsx";

export function ReadingAudioTextPanel({
  gapAnswers = {},
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
  readingContext = [],
  options = [],
}) {
  const renderParts = (paragraph) => {
    const parts = paragraph.parts || [paragraph.text];
    return parts.map((part, index) => {
      if (typeof part === "string") return <span key={`${paragraph.id}-text-${index}`}>{part} </span>;

      const selectedAnswer = gapAnswers[part.gap];
      const selectedOptionData = options.find((option) => option.id === selectedAnswer);
      const submitted = submittedRows?.find((row) => row.gap === part.gap);
      const correctOptionData = options.find((option) => option.id === submitted?.answer);
      const stateClass = [
        submitted ? (submitted.correct ? "correct" : "wrong") : "",
        selectedGap === part.gap ? "selected" : "",
        selectedAnswer ? "filled" : "",
        dragOverGap === part.gap ? "drag-over" : "",
      ].filter(Boolean).join(" ");

      return (
        <button
          key={`${paragraph.id}-gap-${part.gap}`}
          type="button"
          className={`reading-gap-chip ${stateClass}`}
          onClick={() => onGapClick?.(part.gap)}
          onDragOver={(event) => {
            if (disabled || submittedRows) return;
            event.preventDefault();
            onGapDragOver?.(part.gap);
          }}
          onDragLeave={() => onGapDragLeave?.(part.gap)}
          onDrop={(event) => {
            if (disabled || submittedRows) return;
            event.preventDefault();
            onGapDrop?.(part.gap, event.dataTransfer.getData("text/plain"));
          }}
          aria-label={`Gap ${part.gap}`}
          aria-describedby={selectedOption ? "selected-reading-option" : undefined}
          data-sound-click="tab"
        >
          {selectedAnswer ? (
            <>
              <span className="reading-gap-badge">{selectedAnswer}</span>
              <span className="reading-gap-sentence">{selectedOptionData?.text || selectedAnswer}</span>
            </>
          ) : (
            <span className="reading-gap-placeholder">Drop sentence here</span>
          )}
          {selectedAnswer && !submittedRows && !disabled && (
            <em
              role="button"
              tabIndex={0}
              aria-label={`Clear gap ${part.gap}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveGap?.(part.gap);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemoveGap?.(part.gap);
                }
              }}
            >
              x
            </em>
          )}
          {submitted && !submitted.correct && (
            <small className="reading-gap-correction">
              Correct: {submitted.answer}. {correctOptionData?.text}
            </small>
          )}
        </button>
      );
    });
  };

  return (
    <Card className="reading-audio-text-panel">
      <div className="reading-text-heading">
        <span className="eyebrow"><BookOpen size={15} /> Students Book / Unit 2 Reading</span>
        <h2>On a fast track</h2>
      </div>
      <div className="reading-paragraph-stack">
        {readingContext.map((paragraph, index) => (
          <p key={paragraph.id}>
            <b>{index + 1}</b>
            {renderParts(paragraph)}
          </p>
        ))}
      </div>
    </Card>
  );
}
