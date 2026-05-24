function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function scoreMultipleChoice(activity, answers) {
  const selectedIndex = Number(answers.selectedIndex);
  const isCorrect = selectedIndex === Number(activity.content.correctIndex);

  return {
    scorePercent: isCorrect ? 100 : 0,
    mistakes: isCorrect ? [] : ["Selected option does not match the question focus."],
    revisionGuidance: isCorrect ? ["Keep using evidence from the prompt."] : [activity.feedback?.wrong || "Review the unit notes and try again."],
  };
}

export function scoreFillBlank(activity, answers) {
  const accepted = (activity.content.acceptedAnswers || []).map(normalize);
  const isCorrect = accepted.includes(normalize(answers.blank));

  return {
    scorePercent: isCorrect ? 100 : 0,
    mistakes: isCorrect ? [] : ["The blank response needs revision."],
    revisionGuidance: isCorrect ? ["Good control of the target form."] : [activity.feedback?.wrong || "Review the sentence context and target vocabulary."],
  };
}

export function scoreMatching(activity, answers) {
  const pairs = activity.content.pairs || [];
  const submittedPairs = answers.pairs || {};
  const correctCount = pairs.filter((pair) => normalize(submittedPairs[pair.left]) === normalize(pair.right)).length;
  const scorePercent = pairs.length ? Math.round((correctCount / pairs.length) * 100) : 0;
  const mistakes = pairs
    .filter((pair) => normalize(submittedPairs[pair.left]) !== normalize(pair.right))
    .map((pair) => `Review match for "${pair.left}".`);

  return {
    scorePercent,
    mistakes,
    revisionGuidance: mistakes.length ? [activity.feedback?.wrong || "Review the relationship between each item and its meaning."] : ["All matches are aligned with the unit focus."],
  };
}

export function scoreWordSearch(activity, answers = {}) {
  const words = activity.content?.words || [];
  const total = words.length;
  const matched = words.filter((entry) => Boolean(answers[entry.id])).length;
  const scorePercent = total ? Math.round((matched / total) * 100) : 0;
  const mistakes = words
    .filter((entry) => !answers[entry.id])
    .map((entry) => `Word not found yet: "${entry.word}".`);

  return {
    scorePercent,
    mistakes,
    revisionGuidance: mistakes.length ? [activity.feedback?.wrong || "Scan the grid again and find the remaining words."] : ["Great work. You found all words."],
  };
}

export function scoreActivity(activity, answers) {
  if (activity.type === "multiple_choice") return scoreMultipleChoice(activity, answers);
  if (activity.type === "fill_blank") return scoreFillBlank(activity, answers);
  if (activity.type === "matching") return scoreMatching(activity, answers);
  if (activity.type === "word_search") return scoreWordSearch(activity, answers);

  return {
    scorePercent: null,
    mistakes: ["Writing task submitted for teacher review."],
    revisionGuidance: ["Teacher feedback will focus on structure, accuracy, and vocabulary range."],
    needsTeacherReview: true,
  };
}
