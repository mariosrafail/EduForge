const blankPattern = /_{2,}|\[blank\]/i;

export function splitPromptByBlank(prompt = "") {
  const text = String(prompt || "");
  const match = text.match(blankPattern);

  if (!match) {
    return { before: text, after: "", hasBlank: false };
  }

  return {
    before: text.slice(0, match.index),
    after: text.slice(match.index + match[0].length),
    hasBlank: true,
  };
}

export function getInlineAnswerText(answer = "") {
  return String(answer || "").replace(/^[A-Z][.)]\s+/, "");
}

export function InlineBlankPrompt({ prompt, selectedAnswer = "", submitted = false, isCorrect = false }) {
  const { before, after, hasBlank } = splitPromptByBlank(prompt);
  const displayAnswer = getInlineAnswerText(selectedAnswer);

  if (!hasBlank) return <>{prompt}</>;

  const blankState = submitted ? (isCorrect ? "correct" : "wrong") : displayAnswer ? "filled" : "empty";

  return (
    <span className="choice-inline-prompt">
      <span>{before}</span>
      <span key={displayAnswer || "empty"} className={`choice-inline-blank ${blankState}`}>
        {displayAnswer || "choose"}
      </span>
      <span>{after}</span>
    </span>
  );
}
