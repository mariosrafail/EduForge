import { defaultWordSearchDirections, generateWordSearch } from "../../../../utils/wordSearchGenerator.js";

export function normalizeFeedback(feedback = {}, fallbackRevision = "") {
  return {
    correct: feedback.correct || "Good job. You chose the correct answer.",
    wrong: feedback.wrong || "Review the item and try again.",
    revision: feedback.revision || feedback.revisionGuidance || fallbackRevision || "Review the activity before trying again.",
  };
}

export function activityToApiPatch(activity, index) {
  if (activity.type === "gap-fill") {
    const rows = activity.items.map((item) => ({
      prompt: item.prompt || item.prefix || "",
      answer: String(item.answer || "").trim(),
    }));
    const answers = rows.map((row) => row.answer);
    const wordBank = Array.from(new Set(answers.filter(Boolean)));

    return {
      type: "gap_fill",
      title: activity.title,
      instructions: activity.instruction,
      skill: activity.skill,
      position: index + 1,
      content: {
        wordBank,
        prompts: rows.map((row) => row.prompt),
      },
      correct_answers: { answers },
      feedback: normalizeFeedback(activity.feedback, "Review the weekday order before trying again."),
    };
  }

  if (activity.type === "line-matching") {
    return {
      type: "line_matching",
      title: activity.title,
      instructions: activity.instruction,
      skill: activity.skill,
      position: index + 1,
      content: {
        leftItems: activity.leftItems,
        rightItems: activity.rightItems,
        shuffleRightItems: true,
      },
      correct_answers: activity.correctPairs,
      feedback: normalizeFeedback(activity.feedback, activity.revisionGuidance || "Review the seasons and their months before trying again."),
    };
  }

  if (activity.type === "multiple-choice") {
    return {
      type: "multiple_choice",
      title: activity.title,
      instructions: activity.instruction,
      skill: activity.skill,
      position: index + 1,
      content: {
        questions: activity.questions.map(({ id, prompt, options }) => ({ id, prompt, options })),
      },
      correct_answers: Object.fromEntries(activity.questions.map((question) => [question.id, question.answer])),
      feedback: normalizeFeedback(activity.feedback, "Review the vocabulary before trying again."),
    };
  }

  if (activity.type === "word-search") {
    const words = (activity.words || [])
      .map((row) => ({
        id: row.id,
        word: String(row.word || "").trim().toUpperCase(),
        hint: String(row.hint || "").trim(),
      }))
      .filter((row) => row.word);
    const allowedDirections = activity.allowedDirections?.length ? activity.allowedDirections : defaultWordSearchDirections;
    const generatedGrid = activity.generatedGrid || generateWordSearch(words.map((row) => row.word), { directions: allowedDirections, gridSize: activity.gridSize || 12 });
    return {
      type: "word_search",
      title: activity.title,
      instructions: activity.instruction,
      skill: activity.skill,
      position: index + 1,
      content: {
        words,
        directions: allowedDirections,
        allowedDirections,
        gridSize: activity.gridSize || 12,
        generatedGrid,
      },
      correct_answers: Object.fromEntries(words.map((row) => [row.id, row.word])),
      feedback: normalizeFeedback(activity.feedback, "Review the word list and try again."),
    };
  }

  return activity;
}

export function createActivityTemplate(type, orderIndex) {
  const stamp = Date.now();
  if (type === "line-matching") {
    const leftA = `left-${stamp}-1`;
    const leftB = `left-${stamp}-2`;
    const rightA = `right-${stamp}-1`;
    const rightB = `right-${stamp}-2`;
    return {
      id: `line-${stamp}`,
      type: "line-matching",
      title: `Activity ${orderIndex + 1}`,
      instruction: "Drag from one box to another to make a match.",
      skill: "Matching skill",
      leftItems: [
        { id: leftA, label: "new left item 1" },
        { id: leftB, label: "new left item 2" },
      ],
      rightItems: [
        { id: rightA, label: "new right item 1" },
        { id: rightB, label: "new right item 2" },
      ],
      correctPairs: {
        [leftA]: [rightA],
        [leftB]: [rightB],
      },
      feedback: normalizeFeedback({}, "Review the matching pairs and try again."),
    };
  }
  if (type === "multiple-choice") {
    const questionId = `mc-${stamp}`;
    return {
      id: `multiple-choice-${stamp}`,
      type: "multiple-choice",
      title: `Activity ${orderIndex + 1}`,
      instruction: "Choose the best option for each question.",
      skill: "Multiple choice skill",
      questions: [
        {
          id: questionId,
          prompt: "New question prompt",
          options: ["Option A", "Option B", "Option C"],
          answer: "Option A",
        },
      ],
      feedback: normalizeFeedback({}, "Review the question and answer options."),
    };
  }
  if (type === "word-search") {
    const entries = [
      { id: `ws-${stamp}-1`, word: "SPRING", hint: "" },
      { id: `ws-${stamp}-2`, word: "SUMMER", hint: "" },
      { id: `ws-${stamp}-3`, word: "WINTER", hint: "" },
      { id: `ws-${stamp}-4`, word: "SUNNY", hint: "" },
      { id: `ws-${stamp}-5`, word: "CLOUDY", hint: "" },
      { id: `ws-${stamp}-6`, word: "WINDY", hint: "" },
    ];
    const generatedGrid = generateWordSearch(entries.map((item) => item.word), { directions: defaultWordSearchDirections, gridSize: 12 });
    return {
      id: `word-search-${stamp}`,
      type: "word-search",
      title: "Find the weather words",
      instruction: "Find the hidden words in the letter grid.",
      skill: "Weather vocabulary",
      words: entries,
      allowedDirections: [...defaultWordSearchDirections],
      gridSize: 12,
      generatedGrid,
      feedback: normalizeFeedback({}, "Review the hidden words and try again."),
    };
  }
  return {
    id: `gap-fill-${stamp}`,
    type: "gap-fill",
    title: `Activity ${orderIndex + 1}`,
    instruction: "Drag each word into the correct gap.",
    skill: "Gap fill skill",
    wordBank: ["Word 1", "Word 2"],
    items: [
      { id: `gap-${stamp}-1`, prompt: "New clue prompt 1.", answer: "Word 1" },
      { id: `gap-${stamp}-2`, prompt: "New clue prompt 2.", answer: "Word 2" },
    ],
    feedback: normalizeFeedback({}, "Review the clues and words before trying again."),
  };
}
