import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { createNativeOpenResponseQuestion } from "../src/data/native-activities/nativeOpenResponse.js";
import { normalizeNativePedagogicalText, normalizeNativeSingleLineText } from "../src/data/native-activities/nativePedagogicalText.js";

const activityId = "ultimate-b2-sb-u1-p1-o94";
const pageId = "ub2-sb-unit-1-part-1";
const childId = (prefix, suffix) => `${prefix}-${String(suffix).padStart(32, "0")}`;

test("shared pedagogical text canonicalizes line endings before length checks and preserves meaningful layout", () => {
  assert.equal(normalizeNativePedagogicalText("  Line one\r\n\rLine three  ", "Text", 30), "Line one\n\nLine three");
  assert.equal(normalizeNativePedagogicalText("α β\r\nγ", "Text", 7), "α β\nγ");
  assert.equal(normalizeNativePedagogicalText("a\r\nb", "Text", 3), "a\nb", "the canonical length, not the raw CRLF length, is measured");
  assert.throws(() => normalizeNativePedagogicalText("a\r\nb", "Text", 2), /invalid/);
  for (const invalid of ["a\0b", "a\tb", "a\u000bb", "a\u001fb", "a\u007fb", "a<b", "a>b"]) {
    assert.throws(() => normalizeNativePedagogicalText(invalid, "Text", 20), /invalid/, JSON.stringify(invalid));
  }
  assert.throws(() => normalizeNativeSingleLineText("a\nb", "ID-like field", 20), /invalid/);
  assert.throws(() => normalizeNativeSingleLineText("a\rb", "ID-like field", 20), /invalid/);
});

test("the four target native kinds persist canonical multiline pedagogical fields while Complete answers stay single-line", () => {
  const complete = resolveNativeActivityKind("complete-sentences");
  const completePublic = complete.createBlankPublic({ activityId, title: "Complete", placement: { pageId } });
  const completeTeacher = complete.createBlankTeacher({ activityId });
  const itemId = childId("item", 1);
  completePublic.metadata.visibleInstructionText = "First\r\n\rThird";
  completePublic.parts[0].interaction.items = [{ id: itemId, prompt: "Line one\r\n[[blank]]\rline three" }];
  completeTeacher.parts[0].solution.answers = [{ itemId, text: "answer" }];
  const normalizedComplete = complete.normalizePublic(completePublic, activityId);
  assert.equal(normalizedComplete.metadata.visibleInstructionText, "First\n\nThird");
  assert.equal(normalizedComplete.parts[0].interaction.items[0].prompt, "Line one\n[[blank]]\nline three");
  completeTeacher.parts[0].solution.answers[0].text = "answer\nvariant";
  assert.throws(() => complete.normalizeTeacher(completeTeacher, activityId), /answer is invalid/);

  const choice = resolveNativeActivityKind("single-choice");
  const choicePublic = choice.createBlankPublic({ activityId, title: "Choice", placement: { pageId } });
  choicePublic.parts[0].interaction.questions = [{
    id: childId("q", 2), prompt: "Question\r\ncontinued", options: [
      { id: childId("opt", 3), text: "Option\rA" },
      { id: childId("opt", 4), text: "Option B\r\ncontinued" },
    ],
  }];
  const normalizedChoice = choice.normalizePublic(choicePublic, activityId);
  assert.equal(normalizedChoice.parts[0].interaction.questions[0].prompt, "Question\ncontinued");
  assert.deepEqual(normalizedChoice.parts[0].interaction.questions[0].options.map((option) => option.text), ["Option\nA", "Option B\ncontinued"]);

  const open = resolveNativeActivityKind("open-response");
  const openPublic = open.createBlankPublic({ activityId, title: "Open", placement: { pageId } });
  const openTeacher = open.createBlankTeacher({ activityId });
  const questionId = childId("q", 5);
  openPublic.parts[0].interaction.questions = [{ ...createNativeOpenResponseQuestion(questionId, 0), prompt: "Why?\r\nExplain." }];
  openTeacher.parts[0].solution.modelAnswers = [{ questionId, text: "First line\r\n\rSecond paragraph" }];
  assert.equal(open.normalizePublic(openPublic, activityId).parts[0].interaction.questions[0].prompt, "Why?\nExplain.");
  assert.equal(open.normalizeTeacher(openTeacher, activityId).parts[0].solution.modelAnswers[0].text, "First line\n\nSecond paragraph");

  const drag = resolveNativeActivityKind("drag-drop");
  const dragPublic = drag.createBlankPublic({ activityId, title: "Drag", placement: { pageId } });
  dragPublic.parts[0].interaction.words = [{ id: childId("word", 6), text: "up\r\nout" }];
  assert.equal(drag.normalizePublic(dragPublic, activityId).parts[0].interaction.words[0].text, "up\nout");
});

test("multiline domain fields use multiline controls and every relevant runtime has safe wrapping rules", async () => {
  const [choiceEditor, dragEditor, choiceCss, openCss, dragCss, runnerCss] = await Promise.all([
    readFile("src/apps/book-builder/hosted/NativeSingleChoiceEditor.jsx", "utf8"),
    readFile("src/apps/book-builder/hosted/NativeDragDropEditor.jsx", "utf8"),
    readFile("src/components/native-single-choice/nativeSingleChoice.css", "utf8"),
    readFile("src/components/native-open-response/nativeOpenResponseSurface.css", "utf8"),
    readFile("src/components/native-drag-drop/nativeDragDrop.css", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/nativeActivityText.css", "utf8"),
  ]);
  assert.match(choiceEditor, /<textarea rows=\{2\} aria-label=\{`Option/);
  assert.match(dragEditor, /<textarea rows=\{2\} aria-label=\{`Word/);
  for (const source of [choiceCss, openCss, dragCss, runnerCss]) assert.match(source, /white-space:\s*pre-wrap/);
  for (const source of [choiceEditor, dragEditor]) assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});
