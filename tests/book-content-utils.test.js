import test from "node:test";
import assert from "node:assert/strict";
import { questionRowsToUi } from "../netlify/functions/_book-content-utils.js";

test("database question mapping retains the correct option for authoritative scoring", () => {
  const questions = questionRowsToUi(
    [{ id: "question-1", question_number: 1, prompt: "Choose", question_type: "multiple_choice", feedback_json: {}, sort_order: 1 }],
    [
      { id: "option-1", question_id: "question-1", option_label: "A", option_text: "yes", is_correct: true, sort_order: 1 },
      { id: "option-2", question_id: "question-1", option_label: "B", option_text: "no", is_correct: false, sort_order: 2 },
    ],
  );

  assert.equal(questions[0].answer, "yes");
  assert.equal(questions[0].options[0].correct, true);
});
