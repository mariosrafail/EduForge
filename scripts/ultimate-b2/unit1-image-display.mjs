export const ULTIMATE_B2_UNIT1_EXERCISE2_DISPLAY_ID = "ultimate-b2-sb-u1-p1-o2";

const publisherObjectRoot = "Contents/Resources/assets/books/book1/unit/1/part1/obj2";

export const unit1Exercise2ImageDisplaySourceActivity = Object.freeze({
  schemaVersion: "1.0",
  id: ULTIMATE_B2_UNIT1_EXERCISE2_DISPLAY_ID,
  aliases: [],
  publisherSourceActivityId: ULTIMATE_B2_UNIT1_EXERCISE2_DISPLAY_ID,
  book: "ultimate-b2",
  component: "students-book",
  unitNumber: 1,
  partNumber: 1,
  physicalPageNumber: 5,
  spread: "5",
  activityOrder: 2,
  activityType: "image",
  publisherInteractionTypes: ["display"],
  title: "Unit 1 / Part 1 / Object 2",
  titleSource: "application-generated-diagnostic",
  instructions: null,
  questions: [],
  answerRecords: [],
  scoringRules: { mode: "none", pointsPerQuestion: 0, maxScore: 0, feedback: { source: "none" } },
  mediaDependencies: [],
  imageDependencies: [{
    id: "b922245ff2396511e430caaa071013a856048fbdec7d0e930d29d708f2b1ce38",
    sourceRelativePath: `${publisherObjectRoot}/image_2.png`,
  }],
  hotspotNavigation: {
    pageId: "ultimate-b2-sb-u1-part-1",
    hotspotIds: [],
    coordinates: [],
    presentation: "overlay-modal",
  },
  sourceProvenance: [`${publisherObjectRoot}/image_2.png`, `${publisherObjectRoot}/obj_params.iwb`],
  extractionConfidence: "confirmed-structural",
  editorialStatus: "manual-review-required",
  publicationStatus: "disabled",
  qualityCategories: ["image-activity"],
  implementationStatus: "not-implemented",
  unsupportedSourceFields: [],
  extractionWarnings: [],
  presentationData: { layout: "image" },
});

export function withUnit1Exercise2ImageDisplayActivity(activities = []) {
  if (activities.some((activity) => activity.id === ULTIMATE_B2_UNIT1_EXERCISE2_DISPLAY_ID)) return activities;
  return [...activities, unit1Exercise2ImageDisplaySourceActivity]
    .sort((left, right) => left.partNumber - right.partNumber || left.activityOrder - right.activityOrder);
}
