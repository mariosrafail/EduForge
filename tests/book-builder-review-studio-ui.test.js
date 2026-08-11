import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

test("Ultimate B2 tabbed shell connects the existing Hotspot utility to canonical page assets", async () => {
  const [html, component, entry, plugin, activityEntry] = await Promise.all([
    read("ultimate-b2-builder.html"),
    read("src/apps/ultimate-b2-builder/UltimateB2HotspotBuilder.jsx"),
    read("src/apps/ultimate-b2-builder/builderEntry.jsx"),
    read("scripts/ultimate-b2/hotspot-builder-vite-plugin.mjs"),
    read("src/apps/ultimate-b2-builder/activityBuilderEntry.jsx"),
  ]);
  // Git stores these source files with LF endings, while a fresh Windows
  // worktree may materialize them as CRLF. Hash the canonical Git text so the
  // compatibility guard detects source changes without depending on checkout
  // line-ending policy.
  const sha256 = (value) => createHash("sha256").update(value.replaceAll("\r\n", "\n")).digest("hex");
  assert.match(html, /src\/apps\/ultimate-b2-builder\/activityBuilderEntry\.jsx/);
  assert.match(html, /Ultimate B2 Students Book hotspot builder/);
  assert.match(component, /ultimateB2TeacherAppAssetUrl\(page\.assetBindingId/);
  assert.equal(sha256(entry), "c3504b61206dc0237e20d4553f22e9e3c25f9219c1f8132dacadbab72e12be9c");
  assert.equal(sha256(plugin), "be817d5ad811c17049fd65b19543b7523d44740ff647393a8b5f258543c1b9d7");
  assert.match(activityEntry, /UltimateB2BuilderApp/);
});

test("Review Studio routing is hash-based, path-free and covers every required project view", async () => {
  const router = await read("src/apps/book-builder/bookBuilderRouter.js");
  for (const tab of ["overview", "components", "pages", "menu", "activities", "reviews", "decisions", "diff"]) {
    assert.match(router, new RegExp(`id: "${tab}"`));
  }
  assert.match(router, /#\/projects\/\$\{encodeURIComponent\(projectId\)\}/);
  assert.match(router, /hashchange/);
  assert.doesNotMatch(router, /workspace|filesystem|absolutePath/i);
});

test("legacy local b3 route redirects to the one canonical Ultimate B2 Teacher App editor", async () => {
  const app = await read("src/apps/book-builder/BookBuilderApp.jsx");
  assert.match(app, /route\.projectId === "b3"/);
  assert.match(app, /ultimate-b2-builder\.html#teacher-app/);
  assert.match(app, /route\.kind === "teacher-project" && !redirectsB3/);
});

test("read-only remains default while explicit authoring UI keeps source and menu evidence immutable", async () => {
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
  assert.match(source, /Read-only review/);
  assert.match(source, /Local editing/);
  assert.doesNotMatch(source, /Milestone 4B1/);
  assert.match(source, /Read-only review — start the explicit local authoring command/);
  assert.match(source, /Local editing enabled — durable decisions/);
  assert.match(source, /Central on-menu title/);
  assert.match(source, /Separate startup media evidence/);
  assert.match(source, /does not render or execute GAF, SWF or ActionScript/);
  assert.doesNotMatch(source, />\s*(?:Publish|Export APK|Build package)\s*</i);
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

test("large activity and review views keep pagination and allow only single-item decisions", async () => {
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
  assert.match(activities, /Correct drag\/drop mappings are never available/);
  assert.match(activities, /ContentOverrideDrawer/);
  assert.match(activities, /No existing Student-safe structure is available for manual field overrides/);
  assert.match(reviews, /groupBy/);
  assert.match(reviews, /Activity structural cluster/);
  assert.match(reviews, /<Pagination/);
  assert.match(diff, /changeType/);
  assert.match(diff, /Raw fact payloads are withheld/);
  const source = [activities, reviews, diff].join("\n");
  assert.match(source, /DecisionDrawer/);
  assert.match(source, /Open exact field/);
  assert.doesNotMatch(source, /resolve all|apply to cluster|bulk selection|bulk dismiss|bulk approve/i);
  assert.doesNotMatch(source, /acceptedAnswers|correctAnswers|modelAnswer/i);
});

test("manual content authoring is a separate exact-field plain-text workflow", async () => {
  const [drawer, api, activities, css] = await Promise.all([
    read("src/apps/book-builder/components/ContentOverrideDrawer.jsx"),
    read("src/apps/book-builder/bookBuilderApi.js"),
    read("src/apps/book-builder/views/ActivitiesView.jsx"),
    read("src/apps/book-builder/styles/reviewStudio.css"),
  ]);
  assert.match(drawer, /Manual Student-safe content override/);
  assert.match(drawer, /Existing structure only/);
  assert.match(drawer, /Detected/);
  assert.match(drawer, /Saved manual/);
  assert.match(drawer, /Effective now/);
  assert.match(drawer, /UTF-8 bytes/);
  assert.match(drawer, /textarea/);
  assert.doesNotMatch(drawer, /contentEditable|dangerouslySetInnerHTML|markdown|rich text/i);
  for (const operation of ["previewContentOverride", "applyContentOverride", "removeContentOverride", "reapproveContentOverride"]) assert.match(api, new RegExp(operation));
  assert.match(activities, /Classify activity/);
  assert.match(css, /studio-content-value-grid/);
});

test("normal Vite and Android bundle verifiers explicitly reject Review Studio code", async () => {
  const [vite, webVerifier, studentVerifier, teacherVerifier, builderScript] = await Promise.all([
    read("vite.config.js"),
    read("scripts/verify-web-bundle-safety.mjs"),
    read("scripts/android/verify-student-bundle.mjs"),
    read("scripts/android-teacher/verify-bundle.mjs"),
    read("scripts/book-builder/build-review-studio.mjs"),
  ]);
  assert.doesNotMatch(vite, /book-builder\/bookBuilderEntry|review-studio-api|dist-book-builder/);
  assert.match(webVerifier, /Publisher Review Studio client/);
  assert.match(studentVerifier, /scanWebBundle/);
  assert.match(teacherVerifier, /Publisher Review Studio client/);
  assert.match(builderScript, /configFile: false/);
  assert.match(builderScript, /dist-book-builder/);
  assert.match(builderScript, /builder\.html/);
  assert.doesNotMatch(builderScript, /ultimate-b2-builder\.html|index\.html/);
});
