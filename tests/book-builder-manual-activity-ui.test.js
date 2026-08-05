import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, ".."); const read = (file) => fs.readFile(path.join(root, file), "utf8");
test("Manual Activities is a dedicated responsive workspace with all 4D1 editors", async () => {
  const [router, view, editor, content, image, preview, teacher, css] = await Promise.all(["src/apps/book-builder/bookBuilderRouter.js", "src/apps/book-builder/views/ManualActivitiesView.jsx", "src/apps/book-builder/components/ManualActivityEditor.jsx", "src/apps/book-builder/components/ManualActivityContentEditor.jsx", "src/apps/book-builder/components/ImageBackedEditor.jsx", "src/apps/book-builder/components/StudentActivityPreview.jsx", "src/apps/book-builder/components/TeacherSolutionEditor.jsx", "src/apps/book-builder/styles/reviewStudio.css"].map(read)); const source = [view, editor, content, image, preview, teacher].join("\n");
  assert.match(router, /id: "manual"/); for (const type of ["multiple_choice", "true_false", "typed_gap_fill", "open_answer", "media_audio", "media_video", "scrollable_panel", "image_backed"]) assert.match(source, new RegExp(type));
  for (const operation of ["Create from scratch", "detected candidate", "Clone", "Archive", "Remove", "Non-writing Student preview", "Teacher-only"]) assert.match(source, new RegExp(operation, "i"));
  assert.match(image, /normalized/); assert.match(image, /Alt \+ arrow keys/); assert.match(preview, /Student-safe artifact only/); assert.match(css, /studio-scrollable-activity/); assert.match(css, /@media \(max-width: 560px\)/);
  assert.doesNotMatch(preview, /requestManualActivitySolution|correctOptionId|acceptedValues/); assert.doesNotMatch(source, /dangerouslySetInnerHTML|contentEditable|Netlify|book_activities/);
});

test("manual API keeps Student and Teacher routes deliberately separate", async () => {
  const [api, client] = await Promise.all([read("scripts/book-builder/review-studio-manual-activities.mjs"), read("src/apps/book-builder/bookBuilderApi.js")]);
  assert.match(api, /manual-solutions/); assert.match(api, /requireWrite\(request\)/); assert.match(api, /store\.readStudent\(\)/); assert.match(client, /requestManualActivitySolution/); assert.match(client, /requestManualAssetContent/); assert.doesNotMatch(api, /Netlify|book_activities|database/i);
});
