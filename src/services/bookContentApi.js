import { ultimateB2Package } from "../data/ultimateB2DemoData.js";

const jsonHeaders = { "Content-Type": "application/json" };

const componentTypeLabels = {
  students_book: "Students Book",
  workbook: "Workbook",
  grammar_book: "Grammar Book",
  test_book: "Test Book",
};

const coverTones = {
  students_book: "orange",
  workbook: "blue",
  grammar_book: "green",
  test_book: "slate",
};

const activityTypeLabels = {
  media_video: "Video",
  reading_multiple_choice: "Multiple choice",
  reading_evidence: "Evidence",
  listening_multiple_choice: "Listening",
  grammar_gap_fill: "Gap fill",
  grammar_multiple_choice: "Grammar",
  timed_quiz: "Timed test",
  writing: "Writing",
  matching: "Matching",
};

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || payload.detail || "Book content API request failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: jsonHeaders,
    ...options,
  });
  return parseJsonResponse(response);
}

function minutesLabel(minutes) {
  return minutes ? `${minutes} min` : "Demo";
}

function normalizeDbActivity(activity, component, unit, lesson) {
  const contentJson = activity.contentJson || activity.content_json || {};
  const activityType = activity.activityType || activity.activity_type;
  const status = activityType === "media_video" ? "Available" : activityType === "reading_evidence" ? "Completed" : "Assigned";

  return {
    id: activity.id,
    slug: activity.slug,
    title: activity.title.replace(/^Unit 2 Reading /, "").replace(/^Workbook page 20 Listening Exercise$/, "Workbook page 20"),
    component: componentTypeLabels[component.componentType || component.component_type] || component.title,
    unit: unit.title,
    lesson: lesson.lessonType || lesson.lesson_type || lesson.title,
    skill: lesson.lessonType || lesson.lesson_type || activityTypeLabels[activityType] || "Activity",
    type: activityTypeLabels[activityType] || activityType,
    activityType,
    activity_type: activityType,
    estimatedTime: minutesLabel(activity.estimatedMinutes || activity.estimated_minutes),
    timerSeconds: activity.timerSeconds || activity.timer_seconds || null,
    mediaAssetPath: activity.mediaAssetPath || activity.media_asset_path || null,
    contentJson,
    content_json: contentJson,
    settingsJson: activity.settingsJson || activity.settings_json || {},
    settings_json: activity.settingsJson || activity.settings_json || {},
    questions: activity.questions || [],
    assignable: activity.isAssignable ?? activity.is_assignable ?? true,
    isAssignable: activity.isAssignable ?? activity.is_assignable ?? true,
    availableToStudent: true,
    status,
    progressLabel: activityType === "timed_quiz" ? "11/16 submitted" : "Assigned to 2 classes",
    studentProgressLabel: status === "Completed" ? "Teacher feedback ready" : status,
    demoActivityKey: contentJson.demoActivityKey || activity.demoActivityKey || activity.slug,
    description: activity.instructions || "Structured digital book exercise from the database-backed content model.",
    dbActivity: activity,
  };
}

export function normalizeBookPackageTree(bookPackage) {
  if (!bookPackage?.components?.length) return ultimateB2Package;

  return {
    ...ultimateB2Package,
    id: bookPackage.id,
    slug: bookPackage.slug,
    packageTitle: bookPackage.packageTitle || bookPackage.title,
    packageLabel: bookPackage.packageLabel || `${bookPackage.title} package`,
    level: bookPackage.level,
    publisher: bookPackage.publisher,
    description: bookPackage.description,
    source: "database",
    components: bookPackage.components.map((component) => ({
      id: component.id,
      slug: component.slug,
      title: component.title,
      subtitle: `${componentTypeLabels[component.componentType || component.component_type] || "Book component"} / structured activities`,
      type: componentTypeLabels[component.componentType || component.component_type] || component.componentType || component.component_type,
      componentType: component.componentType || component.component_type,
      coverTone: coverTones[component.componentType || component.component_type] || "orange",
      coverAssetPath: component.coverAssetPath || component.cover_asset_path,
      units: (component.units || []).map((unit) => ({
        id: unit.id,
        slug: unit.slug,
        title: unit.title === "Unit 2" && component.componentType === "students_book" ? "Unit 2 Reading" : unit.title,
        unit: unit.title,
        lessons: (unit.lessons || []).map((lesson) => ({
          id: lesson.id,
          slug: lesson.slug,
          title: lesson.title,
          lessonType: lesson.lessonType || lesson.lesson_type,
          exercises: (lesson.exercises || []).map((activity) => normalizeDbActivity(activity, component, unit, lesson)),
        })),
      })),
    })),
  };
}

export async function listBookPackages() {
  const payload = await request("/.netlify/functions/book-content?action=list");
  return payload.bookPackages || [];
}

export async function getBookPackage(slugOrId = "ultimate-b2") {
  return getBookPackageTree(slugOrId);
}

export async function getBookComponent(componentIdOrSlug, packageSlug = "ultimate-b2") {
  const tree = await getBookPackageTree(packageSlug);
  return tree.components.find((component) => component.id === componentIdOrSlug || component.slug === componentIdOrSlug) || null;
}

export async function getBookPackageTree(slugOrId = "ultimate-b2") {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slugOrId);
  const query = isUuid ? `packageId=${encodeURIComponent(slugOrId)}` : `slug=${encodeURIComponent(slugOrId)}`;
  const payload = await request(`/.netlify/functions/book-content?action=tree&${query}`);
  return normalizeBookPackageTree(payload.bookPackage);
}

export async function getBookPackageTreeWithFallback(slugOrId = "ultimate-b2") {
  try {
    return await getBookPackageTree(slugOrId);
  } catch (error) {
    console.warn("Using mock Ultimate B2 package fallback.", error);
    return { ...ultimateB2Package, source: "mock-fallback" };
  }
}

export async function getActivity(activityIdOrSlug) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activityIdOrSlug);
  const query = isUuid ? `activityId=${encodeURIComponent(activityIdOrSlug)}` : `activitySlug=${encodeURIComponent(activityIdOrSlug)}`;
  const payload = await request(`/.netlify/functions/book-content?action=activity&${query}`);
  return payload.activity;
}

export async function activateBookCode(code, userId) {
  return request("/.netlify/functions/book-content?action=activate", {
    method: "POST",
    body: JSON.stringify({ code, userId }),
  });
}

export async function listUserBookAccess(userId) {
  const payload = await request(`/.netlify/functions/book-content?action=access&userId=${encodeURIComponent(userId)}`);
  return payload.bookAccess || [];
}

export async function assignActivityToClass(activityId, classId, teacherId) {
  const payload = await request("/.netlify/functions/book-content?action=assign", {
    method: "POST",
    body: JSON.stringify({ activityId, classId, teacherId }),
  });
  return payload.assignment;
}

export async function listAssignmentsForStudent(studentId) {
  const payload = await request(`/.netlify/functions/book-content?action=assignments&studentId=${encodeURIComponent(studentId)}`);
  return payload.assignments || [];
}

export async function submitActivity(activityId, studentId, answers, assignmentId = null) {
  const payload = await request("/.netlify/functions/book-content?action=submit", {
    method: "POST",
    body: JSON.stringify({ activityId, studentId, answers, assignmentId }),
  });
  return payload.submission;
}

export async function getStudentGrades(studentId) {
  const payload = await request(`/.netlify/functions/book-content?action=grades&studentId=${encodeURIComponent(studentId)}`);
  return payload.grades || [];
}
