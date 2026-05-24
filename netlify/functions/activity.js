import { fetchCourseById, getSql, json, parseBody, sanitizeRequiredText, sanitizeText, validateUuid } from "./_course-utils.js";

const allowedTypes = new Set(["gap_fill", "line_matching", "multiple_choice", "word_search"]);

function uniqueText(values) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function normalizeGapFillPayload(content = {}, correctAnswers = {}) {
  const legacyItems = Array.isArray(content.items) ? content.items : [];
  const { items: _items, ...contentWithoutLegacyItems } = content;
  const prompts = Array.isArray(content.prompts)
    ? content.prompts.map((prompt) => String(prompt ?? ""))
    : legacyItems.map((item) => String(item.prompt || item.prefix || ""));
  const sourceAnswers = Array.isArray(correctAnswers.answers)
    ? correctAnswers.answers
    : legacyItems.map((item) => correctAnswers[item.id] || item.answer || "");
  const answers = prompts.map((_, index) => String(sourceAnswers[index] ?? "").trim());

  return {
    content: {
      ...contentWithoutLegacyItems,
      prompts,
      wordBank: uniqueText(answers),
    },
    correct_answers: { answers },
  };
}

function normalizeActivityPayload(type, rawContent, rawCorrectAnswers) {
  if (type === "gap_fill") {
    return normalizeGapFillPayload(rawContent, rawCorrectAnswers);
  }

  return { content: rawContent || {}, correct_answers: rawCorrectAnswers || {} };
}

function validateActivityType(type) {
  return allowedTypes.has(type) ? "" : "type must be one of: gap_fill, line_matching, multiple_choice, word_search";
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };

  try {
    if (event.httpMethod !== "PATCH" && event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const body = parseBody(event);
    const sql = getSql();

    if (event.httpMethod === "POST") {
      const lessonIdError = validateUuid(body.lesson_id, "lesson_id");
      if (lessonIdError) return json(400, { error: lessonIdError });

      const lessons = await sql`
        select id, course_id
        from lessons
        where id = ${body.lesson_id}
        limit 1
      `;
      if (!lessons.length) return json(404, { error: "Lesson not found" });

      const type = body.type;
      const typeError = validateActivityType(type);
      if (typeError) return json(400, { error: typeError });

      const title = sanitizeRequiredText(body.title);
      if (!title) return json(400, { error: "title is required" });

      const normalizedPayload = normalizeActivityPayload(type, body.content, body.correct_answers);
      const contentJson = JSON.stringify(normalizedPayload.content);
      const correctJson = JSON.stringify(normalizedPayload.correct_answers);
      const feedbackJson = JSON.stringify(body.feedback || {});

      await sql`
        insert into lesson_activities (lesson_id, type, title, instructions, position, content, correct_answers, feedback, skill)
        values (
          ${body.lesson_id},
          ${type},
          ${title},
          ${sanitizeText(body.instructions)},
          ${Number(body.position) || 1},
          ${contentJson}::jsonb,
          ${correctJson}::jsonb,
          ${feedbackJson}::jsonb,
          ${sanitizeText(body.skill)}
        )
      `;

      return json(200, { course: await fetchCourseById(sql, lessons[0].course_id) });
    }

    const params = new URLSearchParams(event.rawQuery || "");
    const id = params.get("id");
    const idError = validateUuid(id, "activity id");
    if (idError) return json(400, { error: idError });

    const existing = await sql`
      select la.id, la.type, la.title, la.instructions, la.position, la.content, la.correct_answers, la.feedback, la.skill, l.course_id
      from lesson_activities la
      join lessons l on l.id = la.lesson_id
      where la.id = ${id}
      limit 1
    `;
    if (!existing.length) return json(404, { error: "Activity not found" });
    const activity = existing[0];

    const type = body.type === undefined ? activity.type : body.type;
    const typeError = validateActivityType(type);
    if (typeError) return json(400, { error: typeError });

    const title = body.title === undefined ? activity.title : sanitizeRequiredText(body.title);
    if (!title) return json(400, { error: "title is required" });

    const rawContent = body.content === undefined ? activity.content : body.content;
    const rawCorrectAnswers = body.correct_answers === undefined ? activity.correct_answers : body.correct_answers;
    const normalizedPayload = normalizeActivityPayload(type, rawContent, rawCorrectAnswers);
    const contentJson = JSON.stringify(normalizedPayload.content);
    const correctJson = JSON.stringify(normalizedPayload.correct_answers);
    const feedbackJson = JSON.stringify(body.feedback === undefined ? activity.feedback : body.feedback);

    await sql`
      update lesson_activities
      set type = ${type},
          title = ${title},
          instructions = ${body.instructions === undefined ? activity.instructions : sanitizeText(body.instructions)},
          position = ${body.position === undefined ? activity.position : Number(body.position) || activity.position},
          content = ${contentJson}::jsonb,
          correct_answers = ${correctJson}::jsonb,
          feedback = ${feedbackJson}::jsonb,
          skill = ${body.skill === undefined ? activity.skill : sanitizeText(body.skill)}
      where id = ${id}
    `;

    return json(200, { course: await fetchCourseById(sql, activity.course_id) });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Activity API failed", detail: error.message });
  }
}
