import studentsBookRuntime from "./generated/students-book.runtime.json" with { type: "json" };
import unit1Runtime from "./generated/unit-01.runtime.json" with { type: "json" };
import unit2Runtime from "./generated/unit-02.runtime.json" with { type: "json" };

const implementedUnitNumbers = new Set([1, 2]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const studentsBookImplementationModeLabels = Object.freeze({
  "auto-scored": "Auto-scored",
  "teacher-reviewed": "Teacher review",
  "unscored-practice": "Practice",
  "reading-content": "Reading content",
  "unsupported-disabled": "Editorially disabled",
});

const runtimeActivities = [...(unit1Runtime.activities || []), ...(unit2Runtime.activities || [])];
const runtimeById = new Map(runtimeActivities.map((activity) => [activity.stableNormalizedId, activity]));
const aliasesToStableId = new Map([["video-intro", "ultimate-b2-sb-u2-p2-o1"]]);
const activityContexts = new Map();

for (const unit of studentsBookRuntime.units || []) {
  if (!implementedUnitNumbers.has(Number(unit.number))) continue;
  for (const page of unit.pages || []) {
    for (const activity of page.activities || []) {
      if (!runtimeById.has(activity.id)) continue;
      if (activity.activityKey && activity.activityKey !== activity.id) aliasesToStableId.set(activity.activityKey, activity.id);
      activityContexts.set(activity.id, { unit, page, activity });
    }
  }
}

export function resolveStudentsBookStableId(identifier) {
  return aliasesToStableId.get(identifier) || identifier || "";
}

function normalizeImplementation(runtimeActivity, context) {
  if (!runtimeActivity || !context) return null;
  const { unit, page, activity } = context;
  return {
    ...runtimeActivity,
    stableNormalizedId: activity.id,
    unitNumber: Number(unit.number),
    partNumber: Number(page.partNumber),
    printedPage: page.physicalPageNumber,
    printedSpread: page.spreadNumber,
    sectionTitle: page.sectionTitle,
    title: activity.title || runtimeActivity.title,
    visibleInstructionText: activity.instructions || runtimeActivity.visibleInstructionText || "",
    activityType: runtimeActivity.activityType || activity.activityType,
    implementationMode: activity.implementationMode || runtimeActivity.implementationMode,
    scoringMode: activity.scoring || runtimeActivity.scoringMode,
    availability: activity.availability,
    implementationStatus: activity.implementationStatus || runtimeActivity.implementationStatus,
    editorialStatus: activity.editorialStatus || runtimeActivity.editorialStatus,
    mediaDependencies: runtimeActivity.mediaDependencies || [],
    aliases: [...aliasesToStableId.entries()]
      .filter(([, stableId]) => stableId === activity.id)
      .map(([alias]) => alias),
  };
}

const implementations = runtimeActivities
  .map((activity) => normalizeImplementation(activity, activityContexts.get(activity.stableNormalizedId)))
  .filter(Boolean);
const implementationById = new Map(implementations.map((activity) => [activity.stableNormalizedId, activity]));

export function findStudentsBookImplementation(identifier) {
  return implementationById.get(resolveStudentsBookStableId(identifier)) || null;
}

export function isStudentsBookActivityEnabled(activity) {
  return Boolean(
    activity
    && activity.availability === "enabled"
    && activity.implementationMode !== "unsupported-disabled"
    && activity.implementationStatus !== "disabled-editorial-only",
  );
}

function readableActivityType(value = "") {
  const labels = {
    media_video: "Video",
    media_audio: "Audio",
    "publisher-image-display": "Publisher image",
    image: "Image",
    multiple_choice: "Multiple choice",
    normalized_students_book: "Interactive exercise",
    teacher_reviewed_response: "Written response",
    typed_gap_fill: "Typed gap-fill",
    typed_short_answer: "Short answer",
    unscored_practice: "Practice",
    writing: "Written response",
  };
  if (labels[value]) return labels[value];
  return String(value || "Activity")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pageLabel(page) {
  const pages = page.pageNumbers || [];
  if (pages.length > 1) return `Pages ${page.spreadNumber || pages.join("–")}`;
  return `Page ${page.physicalPageNumber || pages[0]}`;
}

function flattenDatabaseExercises(databaseUnits = []) {
  return databaseUnits.flatMap((unit) => (
    (unit.lessons || []).flatMap((lesson) => (
      (lesson.exercises || []).map((exercise) => ({ unit, lesson, exercise }))
    ))
  ));
}

function databaseExerciseKeys(exercise = {}) {
  const content = exercise.contentJson || exercise.content_json || {};
  return [
    exercise.stableActivityId,
    exercise.activityKey,
    exercise.demoActivityKey,
    exercise.slug,
    content.publisherSourceActivityId,
    content.demoActivityKey,
  ].filter(Boolean);
}

function databaseActivitiesByStableId(databaseUnits = []) {
  const records = new Map();
  for (const record of flattenDatabaseExercises(databaseUnits)) {
    for (const key of databaseExerciseKeys(record.exercise)) {
      const stableId = resolveStudentsBookStableId(key);
      if (implementationById.has(stableId)) {
        records.set(stableId, record);
        break;
      }
    }
  }
  return records;
}

function exerciseFromActivity(implementation, page, databaseRecord = null) {
  const enabled = isStudentsBookActivityEnabled(implementation);
  const implementationModeLabel = studentsBookImplementationModeLabels[implementation.implementationMode] || readableActivityType(implementation.implementationMode);
  const databaseExercise = databaseRecord?.exercise || null;
  const databaseId = databaseExercise?.dbActivity?.id || databaseExercise?.id || null;
  const assignmentActivityId = uuidPattern.test(String(databaseId || "")) ? databaseId : null;

  return {
    id: implementation.stableNormalizedId,
    stableActivityId: implementation.stableNormalizedId,
    activityKey: implementation.stableNormalizedId,
    demoActivityKey: implementation.stableNormalizedId,
    aliases: implementation.aliases || [],
    title: implementation.title,
    description: implementation.visibleInstructionText,
    instructions: implementation.visibleInstructionText,
    component: "Students Book",
    unit: `Unit ${implementation.unitNumber}`,
    unitNumber: implementation.unitNumber,
    lesson: implementation.sectionTitle,
    sectionTitle: implementation.sectionTitle,
    skill: implementation.sectionTitle,
    type: readableActivityType(implementation.activityType),
    activityType: implementation.activityType,
    implementationMode: implementation.implementationMode,
    implementationModeLabel,
    scoringMode: implementation.scoringMode,
    availability: enabled ? "enabled" : "disabled",
    implementationStatus: implementation.implementationStatus,
    editorialStatus: implementation.editorialStatus,
    pageNumber: implementation.printedPage,
    pageSpread: implementation.printedSpread,
    pageLabel: pageLabel(page),
    mediaDependencies: implementation.mediaDependencies || [],
    assignable: enabled,
    isAssignable: enabled,
    availableToStudent: enabled,
    status: enabled ? "Available" : "Editorially disabled",
    locked: !enabled,
    disabledReason: enabled ? "" : "Unsupported recovered interaction",
    assignmentActivityId,
    assignmentReady: Boolean(enabled && assignmentActivityId),
    dbActivity: databaseExercise?.dbActivity || databaseExercise || null,
  };
}

export function catalogStatsFromUnits(units = []) {
  const exercises = units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.exercises || []));
  const activeExercises = exercises.filter(isStudentsBookActivityEnabled);
  return {
    unitCount: units.filter((unit) => unit.lessons.some((lesson) => lesson.exercises.some(isStudentsBookActivityEnabled))).length,
    activityCount: activeExercises.length,
    disabledActivityCount: exercises.length - activeExercises.length,
    uniqueActivityCount: new Set(activeExercises.map((exercise) => exercise.stableActivityId)).size,
  };
}

export function buildStudentsBookCatalog({ includeDisabled = false, databaseUnits = [] } = {}) {
  const databaseByStableId = databaseActivitiesByStableId(databaseUnits);
  const units = (studentsBookRuntime.units || [])
    .filter((unit) => implementedUnitNumbers.has(Number(unit.number)))
    .map((unit) => {
      const lessons = (unit.pages || []).map((page) => {
        const exercises = (page.activities || [])
          .map((activity) => findStudentsBookImplementation(activity.id))
          .filter(Boolean)
          .filter((activity) => includeDisabled || isStudentsBookActivityEnabled(activity))
          .map((activity) => exerciseFromActivity(activity, page, databaseByStableId.get(activity.stableNormalizedId)));
        return {
          id: `${unit.id}-${page.id}-activities`,
          title: page.sectionTitle,
          sectionTitle: page.sectionTitle,
          pageLabel: pageLabel(page),
          pageNumber: page.physicalPageNumber,
          pageSpread: page.spreadNumber,
          navigationOrder: page.navigationOrder,
          exercises,
        };
      }).filter((lesson) => lesson.exercises.length);

      return {
        id: `sb-unit-${unit.number}`,
        runtimeId: unit.id,
        title: unit.title,
        unit: unit.title,
        unitNumber: Number(unit.number),
        printedPageRange: unit.printedPageRange,
        navigationOrder: unit.navigationOrder,
        lessons,
      };
    }).filter((unit) => unit.lessons.length);

  return {
    units,
    stats: catalogStatsFromUnits(units),
  };
}

export function applyStudentsBookCatalog(component, databaseUnits = component?.units || []) {
  const studentCatalog = buildStudentsBookCatalog({ databaseUnits });
  const teacherCatalog = buildStudentsBookCatalog({ includeDisabled: true, databaseUnits });
  return {
    ...component,
    catalogKind: "recovered-students-book",
    units: studentCatalog.units,
    teacherUnits: teacherCatalog.units,
    catalogStats: {
      ...studentCatalog.stats,
      disabledActivityCount: teacherCatalog.stats.disabledActivityCount,
    },
  };
}

export const ultimateB2StudentsBookCatalog = buildStudentsBookCatalog();
export const ultimateB2StudentsBookTeacherCatalog = buildStudentsBookCatalog({ includeDisabled: true });

export function enabledStudentsBookActivitySequence(catalog = ultimateB2StudentsBookCatalog) {
  return (catalog?.units || []).flatMap((unit) => (
    (unit.lessons || []).flatMap((lesson) => (
      (lesson.exercises || [])
        .filter(isStudentsBookActivityEnabled)
        .map((exercise) => ({
          ...exercise,
          unitTitle: unit.title,
          unitNumber: unit.unitNumber,
          sectionTitle: lesson.sectionTitle || lesson.title,
          pageLabel: exercise.pageLabel || lesson.pageLabel,
        }))
    ))
  ));
}

export function adjacentEnabledStudentsBookActivity(activityId, direction, catalog = ultimateB2StudentsBookCatalog) {
  const sequence = enabledStudentsBookActivitySequence(catalog);
  const index = sequence.findIndex((exercise) => exercise.stableActivityId === resolveStudentsBookStableId(activityId));
  if (index < 0) return null;
  return sequence[index + Math.sign(direction)] || null;
}
