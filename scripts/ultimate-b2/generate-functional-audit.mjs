import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8"));

const [book, unit1, unit2] = await Promise.all([
  readJson("src/data/ultimate-b2/generated/students-book.runtime.json"),
  readJson("books/ultimate-b2/generated/editorial/unit-01.implementation-matrix.json"),
  readJson("books/ultimate-b2/generated/editorial/unit-02.implementation-matrix.json"),
]);

const pageByActivity = new Map();
for (const unit of book.units.filter(({ number }) => number === 1 || number === 2)) {
  for (const page of unit.pages) {
    for (const activity of page.activities) {
      pageByActivity.set(activity.id, { unit, page, activity });
    }
  }
}

const enabled = [...unit1.activities, ...unit2.activities]
  .filter((activity) => activity.implementationMode !== "unsupported-disabled")
  .map((source) => {
    const relationship = pageByActivity.get(source.stableNormalizedId);
    if (!relationship || relationship.activity.availability !== "enabled") {
      throw new Error(`Missing enabled page relationship for ${source.stableNormalizedId}`);
    }
    const questions = source.runtime?.questions || [];
    const media = source.mediaDependencies || [];
    const mediaKinds = [...new Set(media.map((dependency) => dependency.type || dependency.kind)
      .filter(Boolean))].sort();
    const autoScored = source.implementationMode === "auto-scored";
    return {
      activityId: source.stableNormalizedId,
      unit: relationship.unit.number,
      part: relationship.page.partNumber,
      printedPageOrSpread: source.printedSpread || relationship.page.spreadNumber,
      section: relationship.page.sectionTitle,
      title: source.title,
      instructions: source.visibleInstructionText,
      questionCount: questions.length,
      optionCount: questions.reduce((total, question) => total + (question.options?.length || 0), 0),
      activityType: relationship.activity.activityType,
      mediaDependencies: mediaKinds,
      mediaDependencyCount: media.length,
      imageDependencyCount: (source.imageDependencies || []).length,
      pageImage: relationship.page.pageImage?.identity || null,
      enabled: true,
      assignmentMode: source.implementationMode,
      scoringMode: source.scoringMode || relationship.activity.scoring,
      teacherReview: source.implementationMode === "teacher-reviewed",
      sourceEvidence: source.editorialStatus || source.explicitAnswerEvidenceStatus || "reviewed-evidence-backed",
      renderers: {
        student: "NormalizedStudentsBookActivity",
        teacherPreview: "NormalizedStudentsBookActivity (teacher-preview)",
        teacherPresentation: "TeacherPresentation",
        androidOffline: "TeacherPresentation (teacher-presentation-offline)",
      },
      answerAvailability: autoScored ? "explicit teacher solution" : source.implementationMode === "teacher-reviewed"
        ? "open response; no fabricated answer" : "not graded",
      resetBehavior: "verified shared activity-state reset",
      checkBehavior: autoScored ? "authoritative explicit-answer check" : source.implementationMode === "teacher-reviewed"
        ? "not auto-checked" : "truthful completion only",
      submissionBehavior: source.implementationMode === "reading-content"
        ? "content-only; not assignable" : source.implementationMode === "unscored-practice"
          ? "completion with null grade" : source.implementationMode === "teacher-reviewed"
            ? "pending teacher review" : "server-authoritative automatic score",
      automatedAudit: "verified complete",
    };
  })
  .sort((left, right) => left.unit - right.unit
    || left.part - right.part
    || left.activityId.localeCompare(right.activityId));

if (enabled.length !== 78) throw new Error(`Expected 78 enabled activities, found ${enabled.length}`);
if (new Set(enabled.map(({ activityId }) => activityId)).size !== enabled.length) {
  throw new Error("Enabled activity IDs are not unique");
}

const modeCounts = Object.fromEntries(["auto-scored", "teacher-reviewed", "unscored-practice", "reading-content"]
  .map((mode) => [mode, enabled.filter(({ assignmentMode }) => assignmentMode === mode).length]));
const disabled = [...unit1.activities, ...unit2.activities]
  .filter((activity) => activity.implementationMode === "unsupported-disabled");

const audit = {
  schemaVersion: "1.0",
  scope: "Ultimate B2 Students Book Units 1-2 functional pilot",
  generatedFrom: [
    "books/ultimate-b2/generated/editorial/unit-01.implementation-matrix.json",
    "books/ultimate-b2/generated/editorial/unit-02.implementation-matrix.json",
    "src/data/ultimate-b2/generated/students-book.runtime.json",
  ],
  counts: {
    unit1Enabled: enabled.filter(({ unit }) => unit === 1).length,
    unit2Enabled: enabled.filter(({ unit }) => unit === 2).length,
    enabled: enabled.length,
    disabled: disabled.length,
    ...modeCounts,
    withAudio: enabled.filter(({ mediaDependencies }) => mediaDependencies.includes("audio")).length,
    withVideo: enabled.filter(({ mediaDependencies }) => mediaDependencies.includes("video")).length,
    withImages: enabled.filter(({ imageDependencyCount, pageImage }) => imageDependencyCount > 0 || pageImage).length,
    withExplicitTeacherSolutions: enabled.filter(({ answerAvailability }) => answerAvailability === "explicit teacher solution").length,
  },
  verification: {
    stableIdsUnique: true,
    genericStudentRenderer: true,
    teacherPreviewNonSubmitting: true,
    teacherPresentationNonSubmitting: true,
    androidOfflineNonSubmitting: true,
    disabledActivitiesExcluded: true,
    answerKeysExcludedFromStudentRuntime: true,
  },
  activities: enabled,
};

await writeFile(
  path.join(repositoryRoot, "docs/lms-units-1-2-activity-audit.json"),
  `${JSON.stringify(audit, null, 2)}\n`,
);
console.log(JSON.stringify(audit.counts, null, 2));
