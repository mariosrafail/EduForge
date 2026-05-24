import { useRef } from "react";
import { ArrowDown, ArrowUp, ListPlus, Trash2 } from "lucide-react";
import { WordSearchEditor } from "./WordSearchEditor.jsx";

function cloneActivities(course, updater) {
  return {
    ...course,
    lesson: {
      ...course.lesson,
      activities: updater(course.lesson.activities),
    },
  };
}

function activityTypeLabel(type) {
  if (type === "line-matching") return "Line Matching";
  if (type === "gap-fill") return "Drag and Drop Gap Fill";
  if (type === "multiple-choice") return "Multiple Choice";
  if (type === "word-search") return "Word Search";
  return type.replace("-", " ");
}

export function ActivityEditor({ course, activity, index, onChange, onMove }) {
  const wordBankRowIds = useRef([]);
  const nextWordBankRowId = useRef(0);
  const optionRowIdsByQuestion = useRef({});
  const nextOptionRowIdByQuestion = useRef({});

  const ensureWordBankRowIds = () => {
    const wordCount = activity.wordBank?.length || 0;
    while (wordBankRowIds.current.length < wordCount) {
      wordBankRowIds.current.push(`word-bank-row-${activity.id}-${nextWordBankRowId.current}`);
      nextWordBankRowId.current += 1;
    }
    if (wordBankRowIds.current.length > wordCount) {
      wordBankRowIds.current.length = wordCount;
    }
    return wordBankRowIds.current;
  };

  const ensureOptionRowIds = (questionId, optionCount) => {
    if (!optionRowIdsByQuestion.current[questionId]) {
      optionRowIdsByQuestion.current[questionId] = [];
    }
    if (nextOptionRowIdByQuestion.current[questionId] === undefined) {
      nextOptionRowIdByQuestion.current[questionId] = 0;
    }
    const optionIds = optionRowIdsByQuestion.current[questionId];
    while (optionIds.length < optionCount) {
      optionIds.push(`question-option-row-${questionId}-${nextOptionRowIdByQuestion.current[questionId]}`);
      nextOptionRowIdByQuestion.current[questionId] += 1;
    }
    if (optionIds.length > optionCount) {
      optionIds.length = optionCount;
    }
    return optionIds;
  };

  const updateActivity = (nextActivity) => {
    onChange(cloneActivities(course, (activities) => activities.map((item) => (item.id === activity.id ? nextActivity : item))));
  };

  const withDerivedGapWordBank = (nextActivity) => ({
    ...nextActivity,
    wordBank: Array.from(new Set(nextActivity.items.map((item) => String(item.answer || "").trim()).filter(Boolean))),
  });

  const removeActivity = () => {
    onChange(cloneActivities(course, (activities) => activities.filter((item) => item.id !== activity.id)));
  };

  const updateArrayValue = (field, itemIndex, value) => {
    updateActivity({ ...activity, [field]: activity[field].map((item, currentIndex) => (currentIndex === itemIndex ? value : item)) });
  };

  const addWordBankWord = () => {
    wordBankRowIds.current.push(`word-bank-row-${activity.id}-${nextWordBankRowId.current}`);
    nextWordBankRowId.current += 1;
    updateActivity({ ...activity, wordBank: [...activity.wordBank, "New word"] });
  };

  const removeWordBankWord = (wordIndex) => {
    wordBankRowIds.current.splice(wordIndex, 1);
    updateActivity({ ...activity, wordBank: activity.wordBank.filter((_, itemIndex) => itemIndex !== wordIndex) });
  };

  const updateFeedback = (field, value) => {
    const nextFeedback = { ...(activity.feedback || {}), [field]: value };
    updateActivity({
      ...activity,
      feedback: nextFeedback,
      revisionGuidance: field === "revision" ? value : activity.revisionGuidance,
    });
  };

  const addMultipleChoiceQuestion = () => {
    const questionId = `mc-${Date.now()}`;
    updateActivity({
      ...activity,
      questions: [
        ...activity.questions,
        {
          id: questionId,
          prompt: "New question prompt",
          options: ["Option A", "Option B", "Option C"],
          answer: "Option A",
        },
      ],
    });
    optionRowIdsByQuestion.current[questionId] = [
      `question-option-row-${questionId}-0`,
      `question-option-row-${questionId}-1`,
      `question-option-row-${questionId}-2`,
    ];
    nextOptionRowIdByQuestion.current[questionId] = 3;
  };

  const updateQuestion = (questionId, updater) => {
    updateActivity({
      ...activity,
      questions: activity.questions.map((question) => (question.id === questionId ? updater(question) : question)),
    });
  };

  const updateMatchingPair = (pairId, updater) => {
    const currentPair = activity.pairs.find((pair) => pair.id === pairId);
    const nextPairs = activity.pairs.map((pair) => (pair.id === pairId ? updater(pair) : pair));
    const nextPair = nextPairs.find((pair) => pair.id === pairId);
    const nextOptions = activity.options?.map((option) => (option === currentPair?.right ? nextPair?.right : option));
    updateActivity({ ...activity, pairs: nextPairs, options: nextOptions });
  };

  const updateLineLeftItem = (leftId, value) => {
    updateActivity({
      ...activity,
      leftItems: activity.leftItems.map((item) => (item.id === leftId ? { ...item, label: value } : item)),
    });
  };

  const updateLineRightItem = (rightId, value) => {
    updateActivity({
      ...activity,
      rightItems: activity.rightItems.map((item) => (item.id === rightId ? { ...item, label: value } : item)),
    });
  };

  const updateLineCorrectPair = (leftId, rightId) => {
    updateActivity({
      ...activity,
      correctPairs: { ...activity.correctPairs, [leftId]: rightId },
    });
  };

  const addLinePair = () => {
    const stamp = Date.now();
    const leftId = `left-${stamp}`;
    const rightId = `right-${stamp}`;
    updateActivity({
      ...activity,
      leftItems: [...activity.leftItems, { id: leftId, label: "new left item" }],
      rightItems: [...activity.rightItems, { id: rightId, label: "new right item" }],
      correctPairs: { ...activity.correctPairs, [leftId]: rightId },
    });
  };

  const removeLineLeftItem = (leftId) => {
    const nextCorrectPairs = { ...activity.correctPairs };
    delete nextCorrectPairs[leftId];
    updateActivity({
      ...activity,
      leftItems: activity.leftItems.filter((item) => item.id !== leftId),
      correctPairs: nextCorrectPairs,
    });
  };

  const removeMatchingPair = (pairId) => {
    const pair = activity.pairs.find((item) => item.id === pairId);
    updateActivity({
      ...activity,
      pairs: activity.pairs.filter((item) => item.id !== pairId),
      options: activity.options?.filter((option) => option !== pair?.right),
    });
  };

  const addQuestionOption = (questionId) => {
    const nextQuestion = activity.questions.find((item) => item.id === questionId);
    const optionIds = ensureOptionRowIds(questionId, nextQuestion?.options?.length || 0);
    optionIds.push(`question-option-row-${questionId}-${nextOptionRowIdByQuestion.current[questionId]}`);
    nextOptionRowIdByQuestion.current[questionId] += 1;
    updateActivity({
      ...activity,
      questions: activity.questions.map((row) => row.id === questionId ? { ...row, options: [...row.options, "New option"] } : row),
    });
  };

  const removeQuestionOption = (questionId, optionIndex) => {
    const optionIds = ensureOptionRowIds(questionId, activity.questions.find((item) => item.id === questionId)?.options?.length || 0);
    optionIds.splice(optionIndex, 1);
    updateQuestion(questionId, (row) => ({
      ...row,
      options: row.options.filter((_, itemIndex) => itemIndex !== optionIndex),
    }));
  };

  const wordBankIds = ensureWordBankRowIds();

  return (
    <section className="activity-editor-card">
      <div className="activity-editor-head">
        <div>
          <span>Activity {index + 1}</span>
          <strong>{activityTypeLabel(activity.type)}</strong>
        </div>
      </div>

      {activity.type !== "word-search" && (
        <>
          <label>
            Title
            <input value={activity.title} onChange={(event) => updateActivity({ ...activity, title: event.target.value })} />
          </label>

          <label>
            Instruction
            <input value={activity.instruction} onChange={(event) => updateActivity({ ...activity, instruction: event.target.value })} />
          </label>
        </>
      )}

      <div className="inline-editor-list feedback-editor-list">
        <div>
          <strong>Student feedback</strong>
          <span>These messages appear after the student submits the activity.</span>
        </div>
        <label>
          Feedback when correct
          <input
            value={activity.feedback?.correct || ""}
            placeholder="Good job. You chose the correct answer."
            onChange={(event) => updateFeedback("correct", event.target.value)}
          />
        </label>
        <label>
          Feedback when wrong
          <input
            value={activity.feedback?.wrong || ""}
            placeholder="Review the clue and try again."
            onChange={(event) => updateFeedback("wrong", event.target.value)}
          />
        </label>
        <label>
          Revision guidance
          <input
            value={activity.feedback?.revision || activity.feedback?.revisionGuidance || activity.revisionGuidance || ""}
            placeholder="Revise the weekdays and their order."
            onChange={(event) => updateFeedback("revision", event.target.value)}
          />
        </label>
      </div>

      {activity.type === "gap-fill" && (
        <>
          <div className="inline-editor-list">
            <strong>Word bank</strong>
            {activity.wordBank.map((word, wordIndex) => (
              <div key={wordBankIds[wordIndex]}>
                <input value={word} onChange={(event) => updateArrayValue("wordBank", wordIndex, event.target.value)} />
                <button data-sound-click="deleteRemove" onClick={() => removeWordBankWord(wordIndex)}><Trash2 size={15} /></button>
              </div>
            ))}
            <button className="secondary-action compact-action" onClick={addWordBankWord}>
              <ListPlus size={16} /> Add word
            </button>
          </div>
          <div className="inline-editor-list">
            <strong>Gap sentences</strong>
            {activity.items.map((item, itemIndex) => (
              <div className="sentence-editor-row" key={item.id}>
                <input value={item.prompt || item.prefix || ""} onChange={(event) => updateActivity({ ...activity, items: activity.items.map((row) => row.id === item.id ? { ...row, prompt: event.target.value } : row) })} />
                <input
                  value={item.answer}
                  onChange={(event) => updateActivity(withDerivedGapWordBank({
                    ...activity,
                    items: activity.items.map((row) => row.id === item.id ? { ...row, answer: event.target.value } : row),
                  }))}
                />
                <button data-sound-click="deleteRemove" onClick={() => updateActivity(withDerivedGapWordBank({ ...activity, items: activity.items.filter((row) => row.id !== item.id) }))}><Trash2 size={15} /></button>
              </div>
            ))}
            <button className="secondary-action compact-action" onClick={() => updateActivity(withDerivedGapWordBank({ ...activity, items: [...activity.items, { id: `gap-${Date.now()}`, prompt: "New clue prompt", answer: activity.wordBank[0] || "Answer" }] }))}>
              <ListPlus size={16} /> Add gap
            </button>
          </div>
        </>
      )}

      {activity.type === "line-matching" && (
        <>
          <div className="inline-editor-list line-editor-list">
            <strong>Line matching pairs</strong>
            {activity.leftItems.map((leftItem, itemIndex) => (
              <div className="line-pair-editor-row" key={leftItem.id}>
                <input value={leftItem.label} onChange={(event) => updateLineLeftItem(leftItem.id, event.target.value)} />
                <select
                  value={activity.correctPairs[leftItem.id] || ""}
                  onChange={(event) => updateLineCorrectPair(leftItem.id, event.target.value)}
                >
                  <option value="">Choose correct right item</option>
                  {activity.rightItems.map((rightItem) => (
                    <option key={rightItem.id} value={rightItem.id}>{rightItem.label}</option>
                  ))}
                </select>
                <button data-sound-click="deleteRemove" onClick={() => removeLineLeftItem(leftItem.id)}><Trash2 size={15} /></button>
                {activity.rightItems[itemIndex] && (
                  <input
                    className="right-item-editor"
                    value={activity.rightItems[itemIndex].label}
                    onChange={(event) => updateLineRightItem(activity.rightItems[itemIndex].id, event.target.value)}
                  />
                )}
              </div>
            ))}
            <button className="secondary-action compact-action" onClick={addLinePair}>
              <ListPlus size={16} /> Add line pair
            </button>
          </div>
        </>
      )}

      {activity.type === "matching" && (
        <div className="inline-editor-list">
          <strong>Matching pairs</strong>
          {activity.pairs.map((pair) => (
            <div key={pair.id}>
              <input value={pair.left} onChange={(event) => updateMatchingPair(pair.id, (row) => ({ ...row, left: event.target.value }))} />
              <input value={pair.right} onChange={(event) => updateMatchingPair(pair.id, (row) => ({ ...row, right: event.target.value }))} />
              <button data-sound-click="deleteRemove" onClick={() => removeMatchingPair(pair.id)}><Trash2 size={15} /></button>
            </div>
          ))}
          <button className="secondary-action compact-action" onClick={() => updateActivity({
            ...activity,
            pairs: [...activity.pairs, { id: `match-${Date.now()}`, left: "new item", right: "new match" }],
            options: [...(activity.options || activity.pairs.map((pair) => pair.right)), "new match"],
          })}>
            <ListPlus size={16} /> Add pair
          </button>
        </div>
      )}

      {activity.type === "multiple-choice" && (
        <div className="inline-editor-list">
          <strong>Questions</strong>
          {activity.questions.map((question) => {
            const optionRowIds = ensureOptionRowIds(question.id, question.options.length);
            return (
            <div className="question-editor-block" key={question.id}>
              <div className="question-editor-head">
                <strong>Question</strong>
                <button data-sound-click="deleteRemove" onClick={() => {
                  delete optionRowIdsByQuestion.current[question.id];
                  delete nextOptionRowIdByQuestion.current[question.id];
                  updateActivity({ ...activity, questions: activity.questions.filter((row) => row.id !== question.id) });
                }}><Trash2 size={15} /></button>
              </div>
              <input value={question.prompt} onChange={(event) => updateQuestion(question.id, (row) => ({ ...row, prompt: event.target.value }))} />
              <input value={question.answer} onChange={(event) => updateQuestion(question.id, (row) => ({ ...row, answer: event.target.value }))} />
              {question.options.map((option, optionIndex) => (
                <div className="option-editor-row" key={optionRowIds[optionIndex]}>
                  <input
                    value={option}
                    onChange={(event) => updateQuestion(question.id, (row) => ({
                      ...row,
                      options: row.options.map((item, itemIndex) => itemIndex === optionIndex ? event.target.value : item),
                    }))}
                  />
                  <button data-sound-click="deleteRemove" onClick={() => removeQuestionOption(question.id, optionIndex)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button className="secondary-action compact-action" onClick={() => addQuestionOption(question.id)}>
                <ListPlus size={16} /> Add option
              </button>
            </div>
          );
          })}
          <button className="secondary-action compact-action" onClick={addMultipleChoiceQuestion}>
            <ListPlus size={16} /> Add question
          </button>
        </div>
      )}

      {activity.type === "word-search" && (
        <WordSearchEditor activity={activity} onUpdate={updateActivity} />
      )}
    </section>
  );
}
