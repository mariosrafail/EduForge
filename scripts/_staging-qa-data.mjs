export const QA_SEED_KEY = "eduforge-staging-qa-v1";
export const QA_PASSWORD = process.env.EDUFORGE_STAGING_QA_PASSWORD || "StagingOnly!2026";

export const QA = {
  publisher: { id: "e0f10000-0000-4000-8000-000000001000", name: "EduForge QA Publisher", slug: "eduforge-qa-publisher" },
  package: { id: "e0f10000-0000-4000-8000-000000001001", title: "EduForge QA Book", slug: "eduforge-qa-book" },
  component: { id: "e0f10000-0000-4000-8000-000000001002", slug: "qa-students-book" },
  unit: { id: "e0f10000-0000-4000-8000-000000001003", slug: "qa-unit-1" },
  bookLesson: { id: "e0f10000-0000-4000-8000-000000001004", slug: "qa-book-lesson" },
  schools: [
    {
      key: "a", id: "e0f1a000-0000-4000-8000-000000000001", name: "EduForge QA School A",
      users: {
        admin: { id: "e0f1a001-0000-4000-8000-000000000001", email: "qa.a.admin@eduforge.invalid", name: "QA A Admin", role: "admin", status: "active" },
        teacher1: { id: "e0f1a002-0000-4000-8000-000000000001", email: "qa.a.teacher1@eduforge.invalid", name: "QA A Teacher One", role: "teacher", status: "active" },
        teacher2: { id: "e0f1a003-0000-4000-8000-000000000001", email: "qa.a.teacher2@eduforge.invalid", name: "QA A Teacher Two", role: "teacher", status: "active" },
        student1: { id: "e0f1a004-0000-4000-8000-000000000001", email: "qa.a.student1@eduforge.invalid", name: "QA A Student One", role: "student", status: "active" },
        student2: { id: "e0f1a005-0000-4000-8000-000000000001", email: "qa.a.student2@eduforge.invalid", name: "QA A Student Two", role: "student", status: "active" },
        paused: { id: "e0f1a006-0000-4000-8000-000000000001", email: "qa.a.paused@eduforge.invalid", name: "QA A Paused", role: "student", status: "paused" },
      },
      classes: [
        { id: "e0f1a101-0000-4000-8000-000000000001", name: "QA A Class One", slug: "qa-a-class-one", invite: "QASCHA01", teacher: "teacher1" },
        { id: "e0f1a102-0000-4000-8000-000000000001", name: "QA A Class Two", slug: "qa-a-class-two", invite: "QASCHA02", teacher: "teacher2" },
      ],
      courseId: "e0f1a201-0000-4000-8000-000000000001",
      lessonId: "e0f1a202-0000-4000-8000-000000000001",
      officialLessonActivityId: "e0f1a203-0000-4000-8000-000000000001",
      customLessonActivityId: "e0f1a204-0000-4000-8000-000000000001",
      activityId: "e0f1a301-0000-4000-8000-000000000001",
      questionId: "e0f1a302-0000-4000-8000-000000000001",
      optionYesId: "e0f1a303-0000-4000-8000-000000000001",
      optionNoId: "e0f1a304-0000-4000-8000-000000000001",
      classAssignmentId: "e0f1a401-0000-4000-8000-000000000001",
      directAssignmentId: "e0f1a402-0000-4000-8000-000000000001",
      reviewedSubmissionId: "e0f1a501-0000-4000-8000-000000000001",
      unreviewedSubmissionId: "e0f1a502-0000-4000-8000-000000000001",
      hotspotId: "e0f1a601-0000-4000-8000-000000000001",
    },
    {
      key: "b", id: "e0f1b000-0000-4000-8000-000000000001", name: "EduForge QA School B",
      users: {
        admin: { id: "e0f1b001-0000-4000-8000-000000000001", email: "qa.b.admin@eduforge.invalid", name: "QA B Admin", role: "admin", status: "active" },
        teacher1: { id: "e0f1b002-0000-4000-8000-000000000001", email: "qa.b.teacher1@eduforge.invalid", name: "QA B Teacher One", role: "teacher", status: "active" },
        teacher2: { id: "e0f1b003-0000-4000-8000-000000000001", email: "qa.b.teacher2@eduforge.invalid", name: "QA B Teacher Two", role: "teacher", status: "active" },
        student1: { id: "e0f1b004-0000-4000-8000-000000000001", email: "qa.b.student1@eduforge.invalid", name: "QA B Student One", role: "student", status: "active" },
        student2: { id: "e0f1b005-0000-4000-8000-000000000001", email: "qa.b.student2@eduforge.invalid", name: "QA B Student Two", role: "student", status: "active" },
        paused: { id: "e0f1b006-0000-4000-8000-000000000001", email: "qa.b.paused@eduforge.invalid", name: "QA B Paused", role: "student", status: "paused" },
      },
      classes: [
        { id: "e0f1b101-0000-4000-8000-000000000001", name: "QA B Class One", slug: "qa-b-class-one", invite: "QASCHB01", teacher: "teacher1" },
        { id: "e0f1b102-0000-4000-8000-000000000001", name: "QA B Class Two", slug: "qa-b-class-two", invite: "QASCHB02", teacher: "teacher2" },
      ],
      courseId: "e0f1b201-0000-4000-8000-000000000001",
      lessonId: "e0f1b202-0000-4000-8000-000000000001",
      officialLessonActivityId: "e0f1b203-0000-4000-8000-000000000001",
      customLessonActivityId: "e0f1b204-0000-4000-8000-000000000001",
      activityId: "e0f1b301-0000-4000-8000-000000000001",
      questionId: "e0f1b302-0000-4000-8000-000000000001",
      optionYesId: "e0f1b303-0000-4000-8000-000000000001",
      optionNoId: "e0f1b304-0000-4000-8000-000000000001",
      classAssignmentId: "e0f1b401-0000-4000-8000-000000000001",
      directAssignmentId: "e0f1b402-0000-4000-8000-000000000001",
      reviewedSubmissionId: "e0f1b501-0000-4000-8000-000000000001",
      unreviewedSubmissionId: "e0f1b502-0000-4000-8000-000000000001",
      hotspotId: "e0f1b601-0000-4000-8000-000000000001",
    },
  ],
};

export function qaEntityIds() {
  const rows = [
    ["publisher", QA.publisher.id], ["book_package", QA.package.id], ["book_component", QA.component.id],
    ["unit", QA.unit.id], ["book_lesson", QA.bookLesson.id],
  ];
  for (const school of QA.schools) {
    rows.push(["school", school.id]);
    for (const user of Object.values(school.users)) rows.push(["app_user", user.id]);
    for (const item of school.classes) rows.push(["class", item.id]);
    for (const [type, id] of [
      ["course", school.courseId], ["lesson", school.lessonId],
      ["lesson_activity", school.officialLessonActivityId], ["lesson_activity", school.customLessonActivityId],
      ["activity", school.activityId], ["question", school.questionId],
      ["question_option", school.optionYesId], ["question_option", school.optionNoId],
      ["activity_assignment", school.classAssignmentId], ["activity_assignment", school.directAssignmentId],
      ["activity_submission", school.reviewedSubmissionId], ["activity_submission", school.unreviewedSubmissionId],
      ["book_page_hotspot", school.hotspotId],
    ]) rows.push([type, id]);
  }
  return rows;
}
