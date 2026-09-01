import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const editors = {
  openResponse: "src/apps/book-builder/hosted/NativeOpenResponseEditor.jsx",
  image: "src/apps/book-builder/hosted/NativeImageEditor.jsx",
  singleChoice: "src/apps/book-builder/hosted/NativeSingleChoiceEditor.jsx",
  completeSentences: "src/apps/book-builder/hosted/NativeCompleteSentencesEditor.jsx",
  listening: "src/apps/book-builder/hosted/NativeListeningEditor.jsx",
  dragDrop: "src/apps/book-builder/hosted/NativeDragDropEditor.jsx",
  canonicalOpenResponse: "src/apps/ultimate-b2-builder/HostedOpenResponseEditor.jsx",
};

test("shared Studio tabs implement the complete accessible keyboard contract", async () => {
  const controls = await read("src/components/builder-studio/StudioControls.jsx");
  assert.match(controls, /role="tablist"/);
  assert.match(controls, /role="tab"/);
  assert.match(controls, /aria-selected=/);
  assert.match(controls, /aria-controls=/);
  assert.match(controls, /role="tabpanel"/);
  assert.match(controls, /aria-labelledby=/);
  assert.match(controls, /tabIndex=\{value === tab\.id \? 0 : -1\}/);
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) assert.match(controls, new RegExp(`event\\.key === "${key}"`));
});

test("every editable activity exposes only its supported semantic authoring modes", async () => {
  const source = Object.fromEntries(await Promise.all(Object.entries(editors).map(async ([name, path]) => [name, await read(path)])));
  const completeSentencesControls = await read("src/apps/book-builder/hosted/NativeCompleteSentencesEditorControls.jsx");
  const listeningSupport = await read("src/apps/book-builder/hosted/nativeListeningEditorSupport.js");
  const expectLabels = (name, labels) => {
    const labelSource = name === "completeSentences" ? `${source[name]}\n${completeSentencesControls}` : name === "listening" ? `${source[name]}\n${listeningSupport}` : source[name];
    for (const label of labels) assert.match(labelSource, new RegExp(`label: "${label}"`), `${name} must expose ${label}`);
    assert.match(source[name], /StudioTabWorkspace/);
    assert.doesNotMatch(labelSource, /label: "(?:Front|Back)"/);
  };

  expectLabels("openResponse", ["Content", "Layout", "Readable Text", "Video", "Local Preview"]);
  expectLabels("image", ["Content", "Layout", "Readable Text", "Video", "Local Preview"]);
  expectLabels("singleChoice", ["Content", "Visual", "Answer Key", "Readable Text", "Video", "Local Preview"]);
  expectLabels("completeSentences", ["Content", "Visual", "Answer Key", "Readable Text", "Video", "Local Preview"]);
  expectLabels("listening", ["Content", "Audio & Transcript", "Visual", "Answer Key", "Readable Text", "Video", "Local Preview"]);
  for (const label of ["Content", "Visual", "Audio & Timeline", "Page Mapping", "Answer Key", "Readable Text", "Video", "Local Preview"])
    assert.match(listeningSupport, new RegExp(`label: "${label}"`), `oldschool listening must expose ${label}`);
  expectLabels("dragDrop", ["Content", "Layout", "Answer Key", "Local Preview"]);
  expectLabels("canonicalOpenResponse", ["Content", "Publisher Source"]);

  assert.doesNotMatch(source.dragDrop, /label: "(?:Readable Text|Video)"/);
  assert.doesNotMatch(source.canonicalOpenResponse, /label: "Local Preview"/);
  assert.match(source.singleChoice, /mode === "visual" \?/);
  assert.match(source.listening, /tab === "audio-transcript" \?/);
});

test("major authoring surfaces are active-tab rendered and local previews consume in-memory drafts", async () => {
  const source = Object.fromEntries(await Promise.all(Object.entries(editors).map(async ([name, path]) => [name, await read(path)])));
  for (const name of ["openResponse", "image", "singleChoice", "completeSentences", "listening", "dragDrop"]) {
    assert.match(source[name], /(?:tab|mode) === "(?:content|visual|layout|preview|readable-text|video|audio-transcript|answer-key)" \?/);
    assert.match(source[name], /<StudioSaveBar/);
  }
  assert.match(source.openResponse, /NativeOpenResponseStudentSurface document=\{publicDraft\}/);
  assert.match(source.image, /NativeImagePresentation document=\{publicDraft\}/);
  assert.match(source.singleChoice, /NativeSingleChoiceStudentSurface document=\{publicDraft\}/);
  assert.match(source.completeSentences, /NativeCompleteSentencesStudentSurface document=\{publicDraft\}/);
  assert.match(source.listening, /NativeListeningStudentSurface document=\{publicDraft\}/);
  assert.match(source.dragDrop, /NativeDragDropStudentSurface document=\{publicDraft\}/);
});

test("compact Save remains independent from saved-state Review", async () => {
  const [controls, review, css] = await Promise.all([
    read("src/components/builder-studio/StudioControls.jsx"),
    read("src/apps/book-builder/hosted/HostedPackageReview.jsx"),
    read("src/apps/ultimate-b2-builder/studioAuthoring.css"),
  ]);
  assert.match(controls, /Unsaved changes/);
  assert.match(controls, /Save Draft/);
  assert.match(controls, /studio-save-actions/);
  assert.match(css, /\.studio-save-bar \{ position: fixed/);
  assert.match(review, /Unsaved changes are not included in Review\. Save them first\./);
  assert.doesNotMatch(review, /saveNativeActivityPair|saveBuilderContent/);
});
