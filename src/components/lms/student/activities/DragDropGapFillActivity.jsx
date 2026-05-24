import { useMemo, useState } from "react";
import { DraggableChip } from "./DraggableChip.jsx";
import { DropZone } from "./DropZone.jsx";

export function DragDropGapFillActivity({ activity, answers, onChange, submitted, resultMap = {} }) {
  const [selectedChipId, setSelectedChipId] = useState("");
  const displayWordBank = useMemo(() => {
    const savedWordBank = Array.isArray(activity.wordBank) ? activity.wordBank : [];
    const fallbackAnswers = (activity.items || []).map((item) => item.answer);
    return Array.from(new Set([...savedWordBank, ...fallbackAnswers].map((word) => String(word ?? "").trim()).filter(Boolean)));
  }, [activity.items, activity.wordBank]);
  const wordById = useMemo(
    () => Object.fromEntries(displayWordBank.map((word) => [word, word])),
    [displayWordBank],
  );
  const usedWords = new Set(Object.values(answers).filter(Boolean));

  const placeWord = (itemId, word) => {
    const nextAnswers = { ...answers };
    Object.entries(nextAnswers).forEach(([key, value]) => {
      if (value === word) delete nextAnswers[key];
    });
    nextAnswers[itemId] = word;
    onChange(nextAnswers);
    setSelectedChipId("");
  };

  const clearWord = (itemId) => {
    const nextAnswers = { ...answers };
    delete nextAnswers[itemId];
    onChange(nextAnswers);
  };
  const feedbackFor = (result) => {
    if (result.correct) {
      return activity.feedback?.correct || "Good job. You chose the correct answer.";
    }
    return activity.feedback?.wrong || "Review the clue and choose the word that fits it.";
  };

  return (
    <div className="drag-activity">
      <div className="drag-bank" aria-label="Word bank">
        {displayWordBank.map((word) => (
          <DraggableChip
            key={word}
            id={word}
            label={word}
            used={usedWords.has(word)}
            disabled={submitted}
            onPick={setSelectedChipId}
          />
        ))}
      </div>

      <div className="gap-drop-list">
        {activity.items.map((item, index) => {
          const result = resultMap[item.id];
          const state = submitted && result ? (result.correct ? "correct" : "incorrect") : "";
          return (
            <article key={item.id} className={state}>
              <span className="gap-index">{index + 1}</span>
              <p>{item.prompt}</p>
              <DropZone
                id={item.id}
                value={answers[item.id]}
                disabled={submitted}
                state={state}
                selectedChipId={selectedChipId}
                onDropValue={(zoneId, wordId) => placeWord(zoneId, wordById[wordId] || wordId)}
                onClear={clearWord}
              />
              {submitted && result && (
                <div className={`item-feedback-box ${result.correct ? "correct" : "wrong"}`}>
                  {feedbackFor(result)}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
