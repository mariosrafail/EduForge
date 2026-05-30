import {
  fetchActivity,
  fetchBookPackages,
  fetchPackageTree,
  getPackageRows,
  getSql,
  json,
  parseBody,
  readQuery,
} from "./_book-content-utils.js";

function badRequest(message) {
  return json(400, { error: message });
}

async function activateBookCode(sql, body) {
  const code = String(body.code || "").trim();
  if (!code) return badRequest("code is required");

  const rows = await sql`
    select ac.*, bp.title as package_title
    from activation_codes ac
    join book_packages bp on bp.id = ac.book_package_id
    where ac.code = ${code}
    limit 1
  `;
  const activationCode = rows[0];
  if (!activationCode) return json(404, { error: "Activation code not found" });
  if (activationCode.status !== "active") return badRequest("Activation code is not active");
  if (activationCode.max_uses !== null && activationCode.used_count >= activationCode.max_uses) return badRequest("Activation code usage limit reached");

  if (body.userId) {
    const userRows = await sql`select id, role from app_users where id = ${body.userId} limit 1`;
    const user = userRows[0];
    if (!user) return json(404, { error: "User not found" });
    const roleScope = user.role === "admin" ? "school_admin" : user.role;

    await sql`
      insert into book_access (user_id, book_package_id, activation_code_id, role_scope)
      values (${user.id}, ${activationCode.book_package_id}, ${activationCode.id}, ${roleScope})
      on conflict (user_id, book_package_id, role_scope) do update
      set activation_code_id = excluded.activation_code_id,
          granted_at = now()
    `;
  }

  await sql`
    update activation_codes
    set used_count = used_count + 1
    where id = ${activationCode.id}
  `;

  return json(200, {
    activated: true,
    bookPackageId: activationCode.book_package_id,
    bookPackageTitle: activationCode.package_title,
  });
}

async function listUserBookAccess(sql, userId) {
  if (!userId) return [];
  const rows = await sql`
    select ba.id, ba.role_scope, ba.granted_at, bp.id as book_package_id, bp.title, bp.slug, bp.level, p.name as publisher
    from book_access ba
    join book_packages bp on bp.id = ba.book_package_id
    join publishers p on p.id = bp.publisher_id
    where ba.user_id = ${userId}
    order by ba.granted_at desc
  `;
  return rows.map((row) => ({
    id: row.id,
    roleScope: row.role_scope,
    grantedAt: row.granted_at,
    bookPackage: {
      id: row.book_package_id,
      title: row.title,
      slug: row.slug,
      level: row.level,
      publisher: row.publisher,
    },
  }));
}

async function assignActivityToClass(sql, body) {
  if (!body.activityId) return badRequest("activityId is required");
  if (!body.teacherId && !body.classId && !body.studentId) return badRequest("teacherId, classId, or studentId is required");

  const rows = await sql`
    insert into activity_assignments (activity_id, teacher_id, class_id, student_id, due_at, status)
    values (${body.activityId}, ${body.teacherId || null}, ${body.classId || null}, ${body.studentId || null}, ${body.dueAt || null}, 'assigned')
    returning *
  `;

  return json(200, { assignment: rows[0] });
}

async function listAssignmentsForStudent(sql, studentId) {
  if (!studentId) return [];
  const rows = await sql`
    select aa.id, aa.assigned_at, aa.due_at, aa.status,
           a.id as activity_id, a.title as activity_title, a.slug as activity_slug, a.activity_type,
           l.title as lesson_title, u.title as unit_title, bc.title as component_title, bp.title as package_title
    from activity_assignments aa
    join activities a on a.id = aa.activity_id
    left join lessons l on l.id = a.lesson_id
    left join units u on u.id = l.unit_id
    left join book_components bc on bc.id = u.book_component_id
    left join book_packages bp on bp.id = bc.book_package_id
    where aa.student_id = ${studentId}
       or aa.class_id in (select class_id from class_students where student_id = ${studentId})
    order by aa.assigned_at desc
  `;

  return rows.map((row) => ({
    id: row.id,
    assignedAt: row.assigned_at,
    dueAt: row.due_at,
    status: row.status,
    activity: {
      id: row.activity_id,
      title: row.activity_title,
      slug: row.activity_slug,
      activityType: row.activity_type,
    },
    lessonTitle: row.lesson_title,
    unitTitle: row.unit_title,
    componentTitle: row.component_title,
    packageTitle: row.package_title,
  }));
}

async function submitActivity(sql, body) {
  if (!body.activityId) return badRequest("activityId is required");
  if (!body.studentId) return badRequest("studentId is required");

  const activity = await fetchActivity(sql, { activityId: body.activityId });
  if (!activity) return json(404, { error: "Activity not found" });

  const answers = body.answers || {};
  const rows = activity.questions.map((question) => {
    const answer = answers[question.id] ?? answers[question.questionNumber] ?? "";
    const correctText = question.answer || "";
    const isCorrect = String(answer).trim().toLowerCase() === String(correctText).trim().toLowerCase();
    return { question, answer, correctText, isCorrect };
  });
  const correctCount = rows.filter((row) => row.isCorrect).length;
  const totalCount = rows.length;
  const scorePercent = totalCount ? Math.round((correctCount / totalCount) * 100) : null;

  const submissions = await sql`
    insert into activity_submissions (
      activity_assignment_id,
      activity_id,
      student_id,
      answers,
      score,
      score_percent,
      correct_count,
      total_count,
      status,
      submitted_at
    )
    values (
      ${body.assignmentId || null},
      ${body.activityId},
      ${body.studentId},
      ${JSON.stringify(answers)}::jsonb,
      ${scorePercent},
      ${scorePercent},
      ${correctCount},
      ${totalCount},
      'submitted',
      now()
    )
    returning *
  `;
  const submission = submissions[0];

  for (const row of rows) {
    await sql`
      insert into student_answers (submission_id, question_id, answer_text, is_correct, feedback_text)
      values (${submission.id}, ${row.question.id}, ${String(row.answer)}, ${row.isCorrect}, ${row.isCorrect ? "Correct" : `Correct answer: ${row.correctText}`})
      on conflict (submission_id, question_id) do update
      set answer_text = excluded.answer_text,
          is_correct = excluded.is_correct,
          feedback_text = excluded.feedback_text
    `;
  }

  return json(200, {
    submission: {
      id: submission.id,
      status: submission.status,
      scorePercent,
      correctCount,
      totalCount,
    },
  });
}

async function getStudentGrades(sql, studentId) {
  if (!studentId) return [];
  const rows = await sql`
    select s.id, s.submitted_at, s.score_percent, s.correct_count, s.total_count, s.status,
           a.title as activity_title, a.slug as activity_slug, bc.title as component_title, bp.title as package_title
    from activity_submissions s
    join activities a on a.id = s.activity_id
    left join lessons l on l.id = a.lesson_id
    left join units u on u.id = l.unit_id
    left join book_components bc on bc.id = u.book_component_id
    left join book_packages bp on bp.id = bc.book_package_id
    where s.student_id = ${studentId}
    order by s.submitted_at desc
  `;

  return rows.map((row) => ({
    id: row.id,
    submittedAt: row.submitted_at,
    scorePercent: row.score_percent,
    correctCount: row.correct_count,
    totalCount: row.total_count,
    status: row.status,
    activityTitle: row.activity_title,
    activitySlug: row.activity_slug,
    componentTitle: row.component_title,
    packageTitle: row.package_title,
  }));
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };

  try {
    const sql = getSql();
    const query = readQuery(event);

    if (event.httpMethod === "GET") {
      if (query.action === "list") return json(200, { bookPackages: await fetchBookPackages(sql) });
      if (query.action === "activity") {
        const activity = await fetchActivity(sql, query);
        return activity ? json(200, { activity }) : json(404, { error: "Activity not found" });
      }
      if (query.action === "component") {
        const tree = await fetchPackageTree(sql, query);
        const component = tree?.components.find((item) => item.id === query.componentId || item.slug === query.slug);
        return component ? json(200, { component }) : json(404, { error: "Component not found" });
      }
      if (query.action === "access") return json(200, { bookAccess: await listUserBookAccess(sql, query.userId) });
      if (query.action === "assignments") return json(200, { assignments: await listAssignmentsForStudent(sql, query.studentId) });
      if (query.action === "grades") return json(200, { grades: await getStudentGrades(sql, query.studentId) });

      const tree = await fetchPackageTree(sql, query);
      return tree ? json(200, { bookPackage: tree }) : json(404, { error: "Book package not found. Run database/006_book_content_platform.sql." });
    }

    if (event.httpMethod === "POST") {
      const body = parseBody(event);
      if (query.action === "activate") return activateBookCode(sql, body);
      if (query.action === "assign") return assignActivityToClass(sql, body);
      if (query.action === "submit") return submitActivity(sql, body);
      return badRequest("Unsupported POST action");
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Book content API failed", detail: error.message });
  }
}
