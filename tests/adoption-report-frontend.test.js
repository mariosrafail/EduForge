import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Publisher Intelligence uses live adoption APIs and truthful loading, empty, error, and download states", async () => {
  const component = await readFile("src/components/lms/admin/sections/AdminPublisherIntelligenceSection.jsx", "utf8");
  const admin = await readFile("src/components/lms/admin/AdminView.jsx", "utf8");
  const demoData = await readFile("src/data/lmsDemoData.js", "utf8");
  const operations = await readFile("src/components/lms/admin/sections/AdminOperationsSections.jsx", "utf8");
  assert.match(component, /getSchoolAdoptionSummary/);
  assert.match(component, /downloadSchoolAdoptionCsv/);
  assert.match(component, /Loading…/);
  assert.match(component, /Unavailable/);
  assert.match(component, /No scored work/);
  assert.match(component, /No adoption activity has been recorded/);
  assert.match(component, /Preparing CSV…/);
  assert.match(component, /Adoption CSV downloaded\./);
  assert.match(component, /Adoption CSV could not be downloaded\./);
  assert.match(component, /downloadState === "downloading"/);
  assert.match(component, /hasExportableData/);
  assert.doesNotMatch(admin, /exported|setExported|onExport/);
  assert.doesNotMatch(demoData, /publisherIntelligence|3,842|58% average across partner schools/);
  assert.doesNotMatch(operations, /Adoption export prepared|publisherIntelligence/);
  assert.doesNotMatch(component, /full_name|studentEmail|teacherEmail|studentName|teacherName|answerPayload/);
});
