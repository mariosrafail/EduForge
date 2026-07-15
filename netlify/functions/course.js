import { databaseNotConfiguredResponse, fetchCourseById, fetchDemoCourse, getSql, isDatabaseNotConfiguredError, json, parseBody, sanitizeRequiredText, sanitizeText, validateCourseStatus } from "./_course-utils.js";
import { requireRole, safeServerError } from "./_auth-utils.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };

  try {
    const sql = getSql();
    const auth = await requireRole(event, ["admin", "teacher", "student"], sql);
    if (auth.error) return auth.error;

    if (event.httpMethod === "GET") {
      const course = await fetchDemoCourse(sql, auth.currentUser);
      if (!course) return json(404, { error: "Demo course not found. Run database/004_course_content.sql." });
      return json(200, { course });
    }

    if (event.httpMethod === "PATCH") {
      if (auth.currentUser.role !== "admin") return json(403, { error: "Forbidden" });
      const body = parseBody(event);
      const current = await fetchDemoCourse(sql, auth.currentUser);
      if (!current) return json(404, { error: "Demo course not found" });
      const currentRows = await sql`
        select id, title, subtitle, book_code, level, status
        from courses
        where id = ${current.id} and school_id = ${auth.currentUser.school_id} and ownership_type = 'official'
        limit 1
      `;
      if (!currentRows.length) return json(404, { error: "Demo course not found" });
      const currentRow = currentRows[0];

      const statusError = validateCourseStatus(body.status);
      if (statusError) return json(400, { error: statusError });

      const title = body.title === undefined ? currentRow.title : sanitizeRequiredText(body.title);
      if (!title) return json(400, { error: "title is required" });

      await sql`
        update courses
        set title = ${title},
            subtitle = ${body.subtitle === undefined ? currentRow.subtitle : sanitizeText(body.subtitle)},
            level = ${body.level === undefined ? currentRow.level : sanitizeText(body.level)},
            book_code = ${body.book_code === undefined ? currentRow.book_code : sanitizeText(body.book_code)},
            status = ${body.status === undefined ? currentRow.status : body.status}
        where id = ${currentRow.id} and school_id = ${auth.currentUser.school_id} and ownership_type = 'official'
      `;

      const course = await fetchCourseById(sql, currentRow.id, auth.currentUser);
      return json(200, { course });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    if (isDatabaseNotConfiguredError(error)) return databaseNotConfiguredResponse();
    return safeServerError(error, "Course API failed");
  }
}
