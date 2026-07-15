import { fetchCourseById, getSql, json, parseBody, sanitizeRequiredText, sanitizeText, validateLessonStatus, validateUuid } from "./_course-utils.js";
import { requireRole, safeServerError } from "./_auth-utils.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };

  try {
    if (event.httpMethod !== "PATCH") return json(405, { error: "Method not allowed" });

    const params = new URLSearchParams(event.rawQuery || "");
    const id = params.get("id");
    const idError = validateUuid(id, "lesson id");
    if (idError) return json(400, { error: idError });

    const body = parseBody(event);
    const statusError = validateLessonStatus(body.status);
    if (statusError) return json(400, { error: statusError });

    const sql = getSql();
    const auth = await requireRole(event, ["admin", "teacher"], sql);
    if (auth.error) return auth.error;
    const existing = await sql`
      select l.id, l.course_id, l.title, l.subtitle, l.instructions, l.status
      from lessons l join courses c on c.id = l.course_id
      where l.id = ${id} and c.school_id = ${auth.currentUser.school_id}
      limit 1
    `;
    if (!existing.length) return json(404, { error: "Lesson not found" });
    const lesson = existing[0];
    const title = body.title === undefined ? lesson.title : sanitizeRequiredText(body.title);
    if (!title) return json(400, { error: "title is required" });

    await sql`
      update lessons
      set title = ${title},
          subtitle = ${body.subtitle === undefined ? lesson.subtitle : sanitizeText(body.subtitle)},
          instructions = ${body.instructions === undefined ? lesson.instructions : sanitizeText(body.instructions)},
          status = ${body.status === undefined ? lesson.status : body.status}
      where id = ${id}
    `;

    return json(200, { course: await fetchCourseById(sql, lesson.course_id, auth.currentUser) });
  } catch (error) {
    return safeServerError(error, "Lesson API failed");
  }
}
