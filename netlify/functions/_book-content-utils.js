import { getSql, json, parseBody } from "./_course-utils.js";

export { getSql, json, parseBody };

export function readQuery(event) {
  const params = event.queryStringParameters || {};
  return {
    action: params.action || "tree",
    slug: params.slug || "ultimate-b2",
    packageId: params.packageId || "",
    componentId: params.componentId || "",
    activityId: params.activityId || "",
    activitySlug: params.activitySlug || "",
    userId: params.userId || "",
    studentId: params.studentId || "",
  };
}

function correctOption(options = []) {
  return options.find((option) => option.is_correct) || null;
}

export function questionRowsToUi(questionRows = [], optionRows = []) {
  return questionRows.map((question) => {
    const options = optionRows
      .filter((option) => option.question_id === question.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((option) => ({
        id: option.id,
        label: option.option_label,
        text: option.option_text,
        value: option.option_text,
        correct: option.is_correct,
      }));
    const answerOption = correctOption(options);

    return {
      id: question.id,
      questionNumber: question.question_number,
      question_number: question.question_number,
      prompt: question.prompt,
      question: question.prompt,
      questionType: question.question_type,
      question_type: question.question_type,
      contentJson: question.content_json || {},
      content_json: question.content_json || {},
      feedbackJson: question.feedback_json || {},
      feedback_json: question.feedback_json || {},
      options,
      answer: answerOption?.text || question.feedback_json?.acceptedAnswers?.[0] || "",
      sortOrder: question.sort_order,
    };
  });
}

export function activityRowToUi(row, questions = []) {
  if (!row) return null;
  const content = row.content_json || row.content || {};

  return {
    id: row.id,
    lessonId: row.lesson_id,
    title: row.title,
    slug: row.slug,
    activityType: row.activity_type || row.type,
    activity_type: row.activity_type || row.type,
    instructions: row.instructions || "",
    estimatedMinutes: row.estimated_minutes,
    estimated_minutes: row.estimated_minutes,
    timerSeconds: row.timer_seconds,
    timer_seconds: row.timer_seconds,
    mediaAssetPath: row.media_asset_path,
    media_asset_path: row.media_asset_path,
    contentJson: content,
    content_json: content,
    settingsJson: row.settings_json || {},
    settings_json: row.settings_json || {},
    sortOrder: row.sort_order,
    isAssignable: row.is_assignable,
    is_assignable: row.is_assignable,
    isDemoActive: row.is_demo_active,
    is_demo_active: row.is_demo_active,
    demoActivityKey: content.demoActivityKey || row.slug,
    questions,
  };
}

export async function getPackageRows(sql, { slug = "ultimate-b2", packageId = "" } = {}) {
  const rows = packageId
    ? await sql`
        select bp.*, p.name as publisher_name, p.slug as publisher_slug
        from book_packages bp
        join publishers p on p.id = bp.publisher_id
        where bp.id = ${packageId}
        limit 1
      `
    : await sql`
        select bp.*, p.name as publisher_name, p.slug as publisher_slug
        from book_packages bp
        join publishers p on p.id = bp.publisher_id
        where bp.slug = ${slug}
        limit 1
      `;
  return rows[0] || null;
}

export async function fetchBookPackages(sql) {
  const rows = await sql`
    select bp.id, bp.title, bp.slug, bp.level, bp.description, bp.cover_asset_path, bp.status,
           p.name as publisher_name, p.slug as publisher_slug
    from book_packages bp
    join publishers p on p.id = bp.publisher_id
    order by p.name asc, bp.level asc, bp.title asc
  `;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    level: row.level,
    description: row.description,
    coverAssetPath: row.cover_asset_path,
    status: row.status,
    publisher: row.publisher_name,
    publisherSlug: row.publisher_slug,
  }));
}

export async function fetchPackageTree(sql, query = {}) {
  const pkg = await getPackageRows(sql, query);
  if (!pkg) return null;

  const components = await sql`
    select *
    from book_components
    where book_package_id = ${pkg.id}
    order by sort_order asc, title asc
  `;
  const componentIds = components.map((item) => item.id);
  const units = componentIds.length
    ? await sql`
        select *
        from units
        where book_component_id = any(${componentIds})
        order by sort_order asc, title asc
      `
    : [];
  const unitIds = units.map((item) => item.id);
  const lessons = unitIds.length
    ? await sql`
        select *
        from lessons
        where unit_id = any(${unitIds})
        order by coalesce(sort_order, position, 1) asc, title asc
      `
    : [];
  const lessonIds = lessons.map((item) => item.id);
  const activities = lessonIds.length
    ? await sql`
        select *
        from activities
        where lesson_id = any(${lessonIds})
        order by coalesce(sort_order, 1) asc, title asc
      `
    : [];
  const activityIds = activities.map((item) => item.id);
  const questions = activityIds.length
    ? await sql`
        select *
        from questions
        where activity_id = any(${activityIds})
        order by sort_order asc, question_number asc
      `
    : [];
  const questionIds = questions.map((item) => item.id);
  const options = questionIds.length
    ? await sql`
        select *
        from question_options
        where question_id = any(${questionIds})
        order by sort_order asc, option_label asc
      `
    : [];

  return {
    id: pkg.id,
    title: pkg.title,
    packageTitle: pkg.title,
    packageLabel: `${pkg.title} package`,
    slug: pkg.slug,
    level: pkg.level,
    publisher: pkg.publisher_name,
    publisherSlug: pkg.publisher_slug,
    demoSchool: "Hamilton House ELT Demo",
    description: pkg.description,
    coverAssetPath: pkg.cover_asset_path,
    status: pkg.status,
    components: components.map((component) => ({
      id: component.id,
      title: component.title,
      slug: component.slug,
      type: component.component_type,
      componentType: component.component_type,
      component_type: component.component_type,
      coverAssetPath: component.cover_asset_path,
      sortOrder: component.sort_order,
      units: units
        .filter((unit) => unit.book_component_id === component.id)
        .map((unit) => ({
          id: unit.id,
          title: unit.title,
          slug: unit.slug,
          unit: unit.title,
          unitNumber: unit.unit_number,
          sortOrder: unit.sort_order,
          lessons: lessons
            .filter((lesson) => lesson.unit_id === unit.id)
            .map((lesson) => ({
              id: lesson.id,
              title: lesson.title,
              slug: lesson.slug,
              lessonType: lesson.lesson_type,
              lesson_type: lesson.lesson_type,
              sortOrder: lesson.sort_order || lesson.position,
              exercises: activities
                .filter((activity) => activity.lesson_id === lesson.id)
                .map((activity) => activityRowToUi(
                  activity,
                  questionRowsToUi(
                    questions.filter((question) => question.activity_id === activity.id),
                    options,
                  ),
                )),
            })),
        })),
    })),
  };
}

export async function fetchActivity(sql, query = {}) {
  const rows = query.activityId
    ? await sql`select * from activities where id = ${query.activityId} limit 1`
    : await sql`select * from activities where slug = ${query.activitySlug || query.slug} limit 1`;
  const activity = rows[0] || null;
  if (!activity) return null;

  const questions = await sql`
    select *
    from questions
    where activity_id = ${activity.id}
    order by sort_order asc, question_number asc
  `;
  const questionIds = questions.map((item) => item.id);
  const options = questionIds.length
    ? await sql`
        select *
        from question_options
        where question_id = any(${questionIds})
        order by sort_order asc, option_label asc
      `
    : [];

  return activityRowToUi(activity, questionRowsToUi(questions, options));
}
