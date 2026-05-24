import { fetchCourseById, getSql, json, parseBody, validateUuid } from "./_course-utils.js";

function scoreActivity(activity, answers = {}) {
  if (activity.type === "gap-fill") {
    return activity.items.map((item) => ({ id: item.id, correct: answers[item.id] === item.answer }));
  }
  if (activity.type === "line-matching") {
    return activity.leftItems.map((item) => ({ id: item.id, correct: answers[item.id] === activity.correctPairs[item.id] }));
  }
  if (activity.type === "multiple-choice") {
    return activity.questions.map((question) => ({ id: question.id, correct: answers[question.id] === question.answer }));
  }
  if (activity.type === "word-search") {
    return (activity.words || []).map((entry) => ({ id: entry.id, correct: Boolean(answers[entry.id]) }));
  }
  return [];
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = parseBody(event);
    const lessonId = body.lesson_id;
    const idError = validateUuid(lessonId, "lesson_id");
    if (idError) return json(400, { error: idError });

    const sql = getSql();
    const lessonRows = await sql`select id, course_id from lessons where id = ${lessonId} limit 1`;
    if (!lessonRows.length) return json(404, { error: "Lesson not found" });

    const course = await fetchCourseById(sql, lessonRows[0].course_id);
    const lesson = course?.lessons?.find((item) => item.id === lessonId) || null;
    if (!lesson) return json(404, { error: "Lesson not found" });

    const answers = body.answers || {};
    const activityScores = lesson.activities.map((activity) => {
      const results = scoreActivity(activity, answers[activity.id] || {});
      const correct = results.filter((result) => result.correct).length;
      return { activityId: activity.id, correct, total: results.length, results };
    });
    const total = activityScores.reduce((sum, activity) => sum + activity.total, 0);
    const correct = activityScores.reduce((sum, activity) => sum + activity.correct, 0);
    const score = total ? Math.round((correct / total) * 100) : 0;
    const mistakes = activityScores.flatMap((activity) => activity.results.filter((result) => !result.correct).map((result) => ({ activityId: activity.activityId, itemId: result.id })));
    const revisionGuidance = { message: mistakes.length ? "Review highlighted items before trying again." : "Strong work. Continue to the next lesson." };

    const answersJson = JSON.stringify(answers);
    const activityScoresJson = JSON.stringify(activityScores);
    const mistakesJson = JSON.stringify(mistakes);
    const revisionGuidanceJson = JSON.stringify(revisionGuidance);

    await sql`
      insert into lesson_submissions (lesson_id, student_id, answers, score, activity_scores, mistakes, revision_guidance)
      values (${lessonId}, ${body.student_id || null}, ${answersJson}::jsonb, ${score}, ${activityScoresJson}::jsonb, ${mistakesJson}::jsonb, ${revisionGuidanceJson}::jsonb)
    `;

    return json(200, { score, activity_scores: activityScores, mistakes, revision_guidance: revisionGuidance });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Lesson submission failed", detail: error.message });
  }
}
