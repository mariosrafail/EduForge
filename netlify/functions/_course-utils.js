import { getSql, json } from "./_auth-utils.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const courseStatuses = new Set(["draft", "active", "archived"]);
const lessonStatuses = new Set(["draft", "published", "archived"]);

export { getSql, json, uuidPattern };

export function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

export function sanitizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function sanitizeRequiredText(value) {
  return String(value ?? "").trim();
}

export function validateUuid(id, name = "id") {
  if (!id || !uuidPattern.test(id)) {
    return `${name} must be a valid UUID`;
  }
  return "";
}

export function validateCourseStatus(status) {
  return !status || courseStatuses.has(status) ? "" : "status must be one of: draft, active, archived";
}

export function validateLessonStatus(status) {
  return !status || lessonStatuses.has(status) ? "" : "status must be one of: draft, published, archived";
}

function dbTypeToUi(type) {
  if (type === "gap_fill") return "gap-fill";
  if (type === "line_matching") return "line-matching";
  if (type === "multiple_choice") return "multiple-choice";
  if (type === "word_search") return "word-search";
  return type;
}

function uiTypeToDb(type) {
  if (type === "gap-fill") return "gap_fill";
  if (type === "line-matching") return "line_matching";
  if (type === "multiple-choice") return "multiple_choice";
  if (type === "word-search") return "word_search";
  return type;
}

export { uiTypeToDb };

function uniqueText(values) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function normalizeFeedback(feedback = {}) {
  return {
    ...feedback,
    correct: feedback.correct || "Good job. You chose the correct answer.",
    wrong: feedback.wrong || "Review the item and try again.",
    revision: feedback.revision || feedback.revisionGuidance || "Review the activity before trying again.",
  };
}

export function activityRowToUi(row) {
  const content = row.content || {};
  const correct = row.correct_answers || {};
  const feedback = normalizeFeedback(row.feedback || {});
  const type = dbTypeToUi(row.type);

  if (type === "gap-fill") {
    const prompts = Array.isArray(content.prompts)
      ? content.prompts
      : (content.items || []).map((item) => item.prompt || item.prefix || "");
    const answerList = Array.isArray(correct.answers)
      ? correct.answers
      : prompts.map((_, index) => {
          const legacyItem = content.items?.[index];
          return correct[legacyItem?.id] || legacyItem?.answer || "";
        });
    const wordBank = uniqueText([...(content.wordBank || []), ...answerList]);

    return {
      id: row.id,
      type,
      title: row.title,
      instruction: row.instructions || "",
      skill: row.skill || "",
      wordBank,
      items: prompts.map((prompt, index) => ({
        id: content.items?.[index]?.id || `gap-${index + 1}`,
        prompt,
        answer: String(answerList[index] ?? ""),
      })),
      revisionGuidance: feedback.revision,
      feedback,
      position: row.position,
    };
  }

  if (type === "line-matching") {
    return {
      id: row.id,
      type,
      title: row.title,
      instruction: row.instructions || "",
      skill: row.skill || "",
      revisionGuidance: feedback.revision || feedback.revisionGuidance || "",
      leftItems: content.leftItems || [],
      rightItems: content.rightItems || [],
      correctPairs: correct || {},
      feedback,
      position: row.position,
    };
  }

  if (type === "multiple-choice") {
    return {
      id: row.id,
      type,
      title: row.title,
      instruction: row.instructions || "",
      skill: row.skill || "",
      questions: (content.questions || []).map((question) => ({
        ...question,
        answer: correct[question.id] || question.answer || "",
      })),
      feedback,
      position: row.position,
    };
  }

  if (type === "word-search") {
    return {
      id: row.id,
      type,
      title: row.title,
      instruction: row.instructions || "",
      skill: row.skill || "",
      words: (content.words || []).map((entry, index) => ({
        id: entry.id || `ws-${index + 1}`,
        word: String(entry.word || ""),
        hint: String(entry.hint || ""),
      })),
      allowedDirections: Array.isArray(content.directions)
        ? content.directions
        : Array.isArray(content.allowedDirections) ? content.allowedDirections : ["right", "down"],
      gridSize: Number(content.gridSize) || 12,
      generatedGrid: content.generatedGrid || { grid: [] },
      feedback,
      position: row.position,
    };
  }

  return {
    id: row.id,
    type,
    title: row.title,
    instruction: row.instructions || "",
    skill: row.skill || "",
    content,
    correct_answers: correct,
    feedback,
    position: row.position,
  };
}

export function courseRowsToUi(course, lessonRows, activityRows, submissionRows = []) {
  const lessons = lessonRows.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    subtitle: lesson.subtitle || "",
    unit: lesson.subtitle || "Welcome 2",
    section: lesson.title,
    estimatedTime: "18 min",
    status: lesson.status === "published" ? "Assigned" : lesson.status,
    instructions: lesson.instructions || "",
    objectives: [
      "Use vocabulary accurately in short language tasks.",
      "Match language items with the correct meaning or time.",
      "Choose the best word in context.",
    ],
    activities: activityRows
      .filter((activity) => activity.lesson_id === lesson.id)
      .sort((a, b) => a.position - b.position)
      .map(activityRowToUi),
  }));

  return {
    id: course.id,
    title: course.title,
    subtitle: course.subtitle || "",
    book_code: course.book_code || "",
    bookCode: course.book_code || "",
    level: course.level || "",
    publisher: "Hamilton House Publishers",
    defaultBrand: "Hamilton House ELT Demo",
    className: "B1 Junior A",
    lesson: lessons[0],
    lessons,
    submissions: submissionRows.map((submission) => ({
      student: submission.student_name || "Demo Student",
      score: submission.score === null ? null : Number(submission.score),
      status: "Submitted",
      attempt: "1/2",
      submittedAt: submission.submitted_at || "Submitted",
    })),
  };
}

async function hydrateCourse(sql, course) {
  const lessons = await sql`
    select id, course_id, title, subtitle, position, instructions, status, created_at, updated_at
    from lessons
    where course_id = ${course.id}
    order by position asc, created_at asc
  `;
  const activities = lessons.length
    ? await sql`
        select la.id, la.lesson_id, la.type, la.title, la.instructions, la.position, la.content, la.correct_answers, la.feedback, la.skill, la.created_at, la.updated_at
        from lesson_activities la
        join lessons l on l.id = la.lesson_id
        where l.course_id = ${course.id}
        order by la.position asc, la.created_at asc
      `
    : [];
  const submissions = lessons.length
    ? await sql`
        select s.id, s.lesson_id, s.score, s.submitted_at, u.full_name as student_name
        from lesson_submissions s
        join lessons l on l.id = s.lesson_id
        left join app_users u on u.id = s.student_id
        where l.course_id = ${course.id}
        order by s.submitted_at desc
        limit 8
      `
    : [];

  return courseRowsToUi(course, lessons, activities, submissions);
}

export async function fetchCourseById(sql, courseId) {
  const courses = await sql`
    select id, school_id, title, subtitle, book_code, level, status, created_at, updated_at
    from courses
    where id = ${courseId}
    limit 1
  `;

  if (!courses.length) {
    return null;
  }

  return hydrateCourse(sql, courses[0]);
}

export async function fetchDemoCourse(sql) {
  const courses = await sql`
    select id, school_id, title, subtitle, book_code, level, status, created_at, updated_at
    from courses
    where book_code = 'B1-DEMO-2026' or status = 'active'
    order by case when book_code = 'B1-DEMO-2026' then 0 else 1 end, created_at asc
    limit 1
  `;

  if (!courses.length) {
    return null;
  }

  return hydrateCourse(sql, courses[0]);
}
