import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("builder.html loads the generic Publisher Review Studio entry", async () => {
  const html = await read("builder.html");
  assert.match(html, /Hamilton House Publisher Review Studio/);
  assert.match(html, /src\/apps\/book-builder\/bookBuilderEntry\.jsx/);
  assert.doesNotMatch(html, /ultimate-b2-builder\/builderEntry/);
});

test("Review Studio routing is hash-based, path-free and covers every required project view", async () => {
  const router = await read("src/apps/book-builder/bookBuilderRouter.js");
  for (const tab of ["overview", "components", "pages", "menu", "activities", "reviews", "diff"]) {
    assert.match(router, new RegExp(`id: "${tab}"`));
  }
  assert.match(router, /#\/projects\/\$\{encodeURIComponent\(projectId\)\}/);
  assert.match(router, /hashchange/);
  assert.doesNotMatch(router, /workspace|filesystem|absolutePath/i);
});

test("core project views are read-only and keep the central menu title separate from startup intro", async () => {
  const files = await Promise.all([
    "src/apps/book-builder/BookBuilderApp.jsx",
    "src/apps/book-builder/BookBuilderDashboard.jsx",
    "src/apps/book-builder/BookProjectReview.jsx",
    "src/apps/book-builder/views/OverviewView.jsx",
    "src/apps/book-builder/views/ComponentsView.jsx",
    "src/apps/book-builder/views/PagesView.jsx",
    "src/apps/book-builder/views/MenuView.jsx",
  ].map(read));
  const source = files.join("\n");
  assert.match(source, /Read-only review — approvals and manual corrections are not enabled in Milestone 4A/);
  assert.match(source, /Central on-menu title/);
  assert.match(source, /Separate startup media evidence/);
  assert.match(source, /does not render or execute GAF, SWF or ActionScript/);
  assert.doesNotMatch(source, />\s*(?:Approve|Reject|Save|Publish|Export APK|Build package)\s*</i);
  assert.doesNotMatch(source, /local-source-binding|teacher-solution|answer-evidence|acceptedAnswers|correctAnswers/);
});

test("page previews use the authenticated fetch client instead of exposing artifact paths in image URLs", async () => {
  const [preview, pages] = await Promise.all([
    read("src/apps/book-builder/components/SecurePreview.jsx"),
    read("src/apps/book-builder/views/PagesView.jsx"),
  ]);
  assert.match(preview, /requestReviewStudioPreview/);
  assert.match(preview, /URL\.createObjectURL/);
  assert.match(preview, /URL\.revokeObjectURL/);
  assert.match(pages, /normalizedGeometry|item\.geometry/);
  assert.doesNotMatch(preview, /sourceRelativePath|workspace/);
});

test("Studio styles remain isolated and define responsive diagnostic layouts", async () => {
  const css = await read("src/apps/book-builder/styles/reviewStudio.css");
  assert.match(css, /html\[data-app-mode="book-builder-studio"\]/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /url\(/i);
});

test("large activity and review views use server pagination without mutation controls", async () => {
  const [activities, reviews, diff, shell] = await Promise.all([
    read("src/apps/book-builder/views/ActivitiesView.jsx"),
    read("src/apps/book-builder/views/ReviewQueueView.jsx"),
    read("src/apps/book-builder/views/SourceDiffView.jsx"),
    read("src/apps/book-builder/BookProjectReview.jsx"),
  ]);
  assert.match(shell, /<ActivitiesView/);
  assert.match(shell, /<ReviewQueueView/);
  assert.match(shell, /<SourceDiffView/);
  assert.match(activities, /<Pagination/);
  assert.match(activities, /Student-safe projection/);
  assert.match(activities, /Correct drag\/drop mappings are not available/);
  assert.match(reviews, /groupBy/);
  assert.match(reviews, /Activity structural cluster/);
  assert.match(reviews, /<Pagination/);
  assert.match(diff, /changeType/);
  assert.match(diff, /Raw fact payloads are withheld/);
  const source = [activities, reviews, diff].join("\n");
  assert.doesNotMatch(source, /onClick=\{[^}]*\b(?:approve|reject|save|publish|dismiss|apply)\b/i);
  assert.doesNotMatch(source, /acceptedAnswers|correctAnswers|modelAnswer|scoring/i);
});
