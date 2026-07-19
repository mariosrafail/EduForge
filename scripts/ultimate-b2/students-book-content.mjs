const unit2PageIds = new Map([
  [1, "reading-19"],
  [2, "reading-20-21"],
  [3, "vocabulary-22-23"],
  [4, "grammar-24-25"],
  [5, "listening-26"],
  [6, "speaking-27"],
  [7, "writing-28-29"],
  [8, "review-30"],
  [9, "practice-31"],
  [10, "practice-32"],
  [11, "progress-check-33"],
  [12, "progress-check-34"],
]);

const unit2LogicalKeys = new Map([
  [1, "ultimate-b2.students-book.unit-2.page-19"],
  [2, "ultimate-b2.students-book.unit-2.page-20-21"],
  [3, "ultimate-b2.students-book.unit-2.page-22-23"],
  [4, "ultimate-b2.students-book.unit-2.page-24-25"],
  [5, "ultimate-b2.students-book.unit-2.page-26"],
  [6, "ultimate-b2.students-book.unit-2.page-27"],
  [7, "ultimate-b2.students-book.unit-2.page-28-29"],
  [8, "ultimate-b2.students-book.unit-2.page-30"],
  [9, "ultimate-b2.students-book.unit-2.page-31"],
  [10, "ultimate-b2.students-book.unit-2.page-32"],
  [11, "ultimate-b2.students-book.unit-2.page-33"],
  [12, "ultimate-b2.students-book.unit-2.page-34"],
]);

const standardSections = [
  "Unit opener",
  "Reading",
  "Vocabulary in Use",
  "Grammar in Use",
  "Listening",
  "Speaking",
  "Writing",
  "Review",
  "Practice",
  "Practice",
  "Progress check",
  "Progress check",
];

const unit2Sections = [
  "Reading",
  "Reading",
  "Vocabulary in Use",
  "Grammar in Use",
  "Listening",
  "Speaking",
  "Writing",
  "Review 2",
  "Practice 2",
  "Practice 2",
  "Progress check 1",
  "Progress check 1",
];

const allowedClassifications = new Set([
  "page-image",
  "heading",
  "reading-text",
  "instruction",
  "question",
  "activity",
  "audio",
  "video",
  "illustration",
  "navigation",
  "teacher-only",
  "unsupported",
  "unknown",
]);

function safeSourcePath(value) {
  const normalized = String(value || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe source-relative path: ${value}`);
  }
  return normalized;
}

function sourcePathWithoutFragment(value) {
  return safeSourcePath(String(value || "").split("#")[0]);
}

function pageId(unitNumber, partNumber) {
  return unitNumber === 2
    ? unit2PageIds.get(partNumber)
    : `ub2-sb-unit-${unitNumber}-part-${partNumber}`;
}

function pageLogicalKey(unitNumber, partNumber) {
  return unit2LogicalKeys.get(partNumber) && unitNumber === 2
    ? unit2LogicalKeys.get(partNumber)
    : `ultimate-b2.students-book.unit-${unitNumber}.part-${partNumber}.page-image`;
}

function sectionTitle(unitNumber, partNumber) {
  return (unitNumber === 2 ? unit2Sections : standardSections)[partNumber - 1] || `Part ${partNumber}`;
}

function mediaClassification(sourcePath) {
  if (/\.(mp3|m4a|wav|aac)$/i.test(sourcePath)) return "audio";
  if (/\.(mp4|m4v|webm|mov)$/i.test(sourcePath)) return "video";
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(sourcePath)) return "illustration";
  return "unknown";
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function isEnabledActivity(activity, implementation = null) {
  if (implementation) return implementation.implementationMode !== "unsupported-disabled";
  return activity.implementationStatus === "implemented-from-normalized-catalog"
    && activity.qualityCategories?.includes("ready-for-implementation");
}

function activityClassification(activity) {
  if (activity.qualityCategories?.includes("unsupported-interaction")) return "unsupported";
  return "activity";
}

function activityPresentation(activity, implementation = null) {
  const enabled = isEnabledActivity(activity, implementation);
  const activityKey = enabled ? activity.aliases?.[0] || activity.id : null;
  const runtimeQuestions = implementation?.runtime?.questions || activity.questions || [];
  return {
    id: activity.id,
    publisherSourceActivityId: activity.publisherSourceActivityId,
    classification: activityClassification(activity),
    title: implementation?.title || activity.title || null,
    titleSource: implementation ? "unit-02-implementation-matrix" : activity.titleSource || "unavailable",
    instructions: implementation?.visibleInstructionText || activity.instructions || null,
    activityType: activity.activityType,
    activityKey,
    availability: enabled ? "enabled" : "disabled",
    scoring: implementation?.scoringMode || (activity.answerRecords?.length ? "explicit-publisher-evidence" : "not-automatically-scored"),
    ...(implementation ? { implementationMode: implementation.implementationMode } : {}),
    editorialStatus: implementation?.editorialStatus || (enabled ? "implemented-reviewed-slice" : activity.editorialStatus),
    implementationStatus: implementation?.implementationStatus || activity.implementationStatus,
    questionCount: runtimeQuestions.length,
    optionCount: runtimeQuestions.reduce((sum, question) => sum + (question.options?.length || 0), 0),
    sourceProvenance: uniqueSorted((implementation?.sourceProvenance || activity.sourceProvenance || []).map(sourcePathWithoutFragment)),
  };
}

function contentObjectsForActivity(activity) {
  const objects = [{
    id: `${activity.id}-activity`,
    classification: activityClassification(activity),
    activityId: activity.id,
    sourceProvenance: uniqueSorted((activity.sourceProvenance || []).map(sourcePathWithoutFragment)),
  }];
  if (activity.instructions) {
    objects.push({
      id: `${activity.id}-instruction`,
      classification: "instruction",
      text: activity.instructions,
      activityId: activity.id,
      sourceProvenance: uniqueSorted((activity.sourceProvenance || []).map(sourcePathWithoutFragment)),
    });
  }
  for (const question of activity.questions || []) {
    objects.push({
      id: question.id,
      classification: "question",
      activityId: activity.id,
      prompt: question.prompt || null,
      options: (question.options || []).map((option) => ({ id: option.id, value: option.value })),
      sourceProvenance: question.sourcePath ? [sourcePathWithoutFragment(question.sourcePath)] : [],
    });
    if (activity.activityType === "drag-and-drop-matching" && String(question.prompt || "").length >= 160) {
      objects.push({
        id: `${question.id}-reading-text`,
        classification: "reading-text",
        activityId: activity.id,
        questionId: question.id,
        text: question.prompt,
        sourceProvenance: question.sourcePath ? [sourcePathWithoutFragment(question.sourcePath)] : [],
      });
    }
  }
  return objects;
}

function availableUnit2Actions(unitNumber, partNumber, activities) {
  if (unitNumber !== 2) return [];
  return activities.filter((activity) => activity.availability === "enabled").map((activity) => {
    if (activity.id === "ultimate-b2-sb-u2-p2-o1") return { id: `${activity.id}-action`, label: activity.title, classification: "activity", availability: "enabled", target: "normalized-activity", activityKey: activity.activityKey };
    if (activity.id === "ultimate-b2-sb-u2-p2-o2") return { id: "text-audio", label: "Text + Audio", classification: "audio", availability: "enabled", target: "text-audio", activityKey: activity.activityKey };
    if (activity.id === "ultimate-b2-sb-u2-p2-o3") return { id: "exercise-3", label: "Exercise 3", classification: "activity", availability: "enabled", target: "exercise-3", activityKey: "reading-ex3" };
    if (activity.id === "ultimate-b2-sb-u2-p2-o4") return { id: "exercise-4", label: "Exercise 4", classification: "activity", availability: "enabled", target: "exercise-4", activityKey: "reading-ex4" };
    return { id: `${activity.id}-action`, label: activity.title, classification: "activity", availability: "enabled", target: "normalized-activity", activityKey: activity.activityKey };
  });
}

function buildPage(unit, sourcePage, unitActivities, implementationById) {
  const activities = unitActivities
    .filter((activity) => activity.partNumber === sourcePage.partNumber)
    .sort((left, right) => left.activityOrder - right.activityOrder);
  const activitySummaries = activities.map((activity) => activityPresentation(activity, implementationById.get(activity.id)));
  const sourceActivities = unit.activities.filter((activity) => activity.partNumber === sourcePage.partNumber);
  const mediaPaths = uniqueSorted(sourceActivities.flatMap((activity) => activity.media || []).map(sourcePathWithoutFragment));
  const media = mediaPaths.map((sourceRelativePath, index) => ({
    id: `ultimate-b2-sb-u${unit.number}-p${sourcePage.partNumber}-media-${index + 1}`,
    classification: mediaClassification(sourceRelativePath),
    sourceRelativePath,
    availability: "editorial-only",
  }));
  const hdSourceRelativePath = safeSourcePath(sourcePage.pageImage);
  const sdSourceRelativePath = hdSourceRelativePath.replace("/parts/HD/", "/parts/SD/");
  const section = sectionTitle(unit.number, sourcePage.partNumber);
  const id = pageId(unit.number, sourcePage.partNumber);
  const actions = availableUnit2Actions(unit.number, sourcePage.partNumber, activitySummaries);
  const contentObjects = [
    { id: `${id}-heading`, classification: "heading", text: section, sourceProvenance: [`Contents/Resources/assets/books/book1/unit/${unit.number}/unit_params.iwb`] },
    { id: `${id}-navigation`, classification: "navigation", pageNumber: sourcePage.pageNumber, spreadNumber: sourcePage.spreadNumber, sourceProvenance: [`Contents/Resources/assets/books/book1/unit/${unit.number}/unit_params.iwb`] },
    { id: `${id}-page-image`, classification: "page-image", sourceProvenance: [hdSourceRelativePath, sdSourceRelativePath] },
    ...activities.flatMap(contentObjectsForActivity),
    ...media,
  ];
  return {
    id,
    sourcePageId: sourcePage.id,
    unitId: `ultimate-b2-students-book-unit-${String(unit.number).padStart(2, "0")}`,
    unitNumber: unit.number,
    unitTitle: `Unit ${unit.number}`,
    sectionTitle: section,
    partNumber: sourcePage.partNumber,
    physicalPageNumber: sourcePage.pageNumber,
    spreadNumber: sourcePage.spreadNumber,
    pageNumbers: String(sourcePage.spreadNumber).split("-").map(Number),
    navigationOrder: sourcePage.navigationOrder,
    pageImage: {
      identity: pageLogicalKey(unit.number, sourcePage.partNumber),
      classification: "page-image",
      sdSourceRelativePath,
      hdSourceRelativePath,
      localHdAssetPath: `unit/${unit.number}/parts/HD/parts_part_${sourcePage.partNumber}.png`,
    },
    readingTextRelationships: contentObjects.filter((object) => object.classification === "reading-text").map((object) => object.id),
    instructionRelationships: contentObjects.filter((object) => object.classification === "instruction").map((object) => object.id),
    activityIds: activitySummaries.map((activity) => activity.id),
    activities: activitySummaries,
    media,
    illustrationRelationships: uniqueSorted(activities.flatMap((activity) => activity.imageDependencies || []).map((dependency) => dependency.sourceRelativePath).filter(Boolean).map(sourcePathWithoutFragment)),
    actions,
    contentObjects,
    editorialStatus: activitySummaries.some((activity) => activity.availability === "enabled") ? "implemented-slice-available" : "page-ready-activities-review-required",
    sourceProvenance: uniqueSorted([
      hdSourceRelativePath,
      sdSourceRelativePath,
      `Contents/Resources/assets/books/book1/unit/${unit.number}/unit_params.iwb`,
      ...activities.flatMap((activity) => activity.sourceProvenance || []).map(sourcePathWithoutFragment),
    ]),
  };
}

export function validateStudentsBookContentCatalog(catalog) {
  const errors = [];
  const serialized = JSON.stringify(catalog);
  if (/[A-Za-z]:[\\/]/.test(serialized)) errors.push("catalog leaks an absolute path");
  if (/EA3DC7D7-6954-471A-8399-E217B522F5F2|IWB_XOR_KEY/.test(serialized)) errors.push("catalog leaks decoder material");
  if (catalog.units?.length !== 10) errors.push("catalog must contain all 10 units");
  const pages = catalog.units?.flatMap((unit) => unit.pages || []) || [];
  if (!pages.length || pages[0].physicalPageNumber !== 5 || pages.at(-1).pageNumbers.at(-1) !== 154) errors.push("catalog printed page range must be 5-154");
  if (new Set(pages.map((page) => page.id)).size !== pages.length) errors.push("page IDs must be unique");
  if (new Set((catalog.units || []).map((unit) => unit.id)).size !== catalog.units.length) errors.push("unit IDs must be unique");
  if (pages.some((page, index) => index && page.physicalPageNumber <= pages[index - 1].physicalPageNumber)) errors.push("pages must be strictly ordered");
  for (const object of pages.flatMap((page) => page.contentObjects || [])) {
    if (!allowedClassifications.has(object.classification)) errors.push(`unsupported classification ${object.classification}`);
  }
  return { valid: errors.length === 0, errors };
}

export function buildStudentsBookContentCatalog({ structure, activityCatalogs, implementationMatrices = [] }) {
  const activitiesByUnit = new Map(activityCatalogs.map((catalog) => [catalog.unitNumber, catalog.activities || []]));
  const implementationById = new Map(implementationMatrices.flatMap((matrix) => matrix?.activities || []).map((activity) => [activity.stableNormalizedId, activity]));
  const units = structure.units.map((unit) => {
    const pages = unit.pages.map((page) => buildPage(unit, page, activitiesByUnit.get(unit.number) || [], implementationById));
    return {
      id: `ultimate-b2-students-book-unit-${String(unit.number).padStart(2, "0")}`,
      number: unit.number,
      title: `Unit ${unit.number}`,
      printedPageRange: unit.pageRange,
      navigationOrder: unit.number,
      pages,
      sourceProvenance: [`Contents/Resources/assets/books/book1/unit/${unit.number}/unit_params.iwb`],
    };
  });
  const pages = units.flatMap((unit) => unit.pages);
  const activities = pages.flatMap((page) => page.activities);
  const media = pages.flatMap((page) => page.media);
  const catalog = {
    schemaVersion: "1.0",
    bookId: "ultimate-b2",
    componentId: "students-book",
    title: "Ultimate B2 Students Book",
    printedPageRange: "5-154",
    navigation: { type: "ordered-spreads", stableRouteKey: "physicalPageNumber" },
    summary: {
      unitCount: units.length,
      spreadCount: pages.length,
      printedPageCount: 150,
      pageAssetCount: pages.length,
      readingTextObjectCount: pages.flatMap((page) => page.contentObjects).filter((object) => object.classification === "reading-text").length,
      audioObjectCount: media.filter((object) => object.classification === "audio").length,
      videoObjectCount: media.filter((object) => object.classification === "video").length,
      activityCount: activities.length,
      enabledActivityCount: activities.filter((activity) => activity.availability === "enabled").length,
      disabledActivityCount: activities.filter((activity) => activity.availability !== "enabled").length,
    },
    units,
  };
  const validation = validateStudentsBookContentCatalog(catalog);
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  return catalog;
}
