import bcrypt from "bcryptjs";
import { createSafePool, withAdvisoryLock } from "./_staging-db.mjs";
import { QA, QA_PASSWORD, QA_SEED_KEY, qaEntityIds } from "./_staging-qa-data.mjs";

const { pool, safeLabel } = createSafePool("staging");
const client = await pool.connect();

try {
  console.log(`Seeding isolated staging QA data: ${safeLabel}`);
  await withAdvisoryLock(client, "eduforge:staging:qa-seed", async () => {
    await client.query("begin");
    try {
      await client.query(`
        create table if not exists staging_qa_registry (
          seed_key text not null,
          entity_type text not null,
          entity_id uuid not null,
          created_at timestamptz not null default now(),
          primary key (seed_key, entity_type, entity_id)
        )
      `);

      for (const school of QA.schools) {
        const conflict = await client.query("select id from schools where (id = $1 or name = $2) and id <> $1", [school.id, school.name]);
        if (conflict.rows.length) throw new Error(`QA school identity conflicts with existing data: ${school.name}`);
        const unregistered = await client.query(
          `select 1 from schools s where s.id = $1 and not exists (
             select 1 from staging_qa_registry r where r.seed_key = $2 and r.entity_type = 'school' and r.entity_id = s.id
           )`,
          [school.id, QA_SEED_KEY],
        );
        if (unregistered.rows.length) throw new Error(`QA school ID already exists without staging registry ownership: ${school.id}`);
      }
      const publisherConflict = await client.query("select id from publishers where (id = $1 or slug = $2) and id <> $1", [QA.publisher.id, QA.publisher.slug]);
      if (publisherConflict.rows.length) throw new Error("QA publisher identity conflicts with existing data");
      const unregisteredPublisher = await client.query(
        `select 1 from publishers p where p.id = $1 and not exists (
           select 1 from staging_qa_registry r where r.seed_key = $2 and r.entity_type = 'publisher' and r.entity_id = p.id
         )`,
        [QA.publisher.id, QA_SEED_KEY],
      );
      if (unregisteredPublisher.rows.length) throw new Error("QA publisher ID exists without staging registry ownership");

      const passwordHash = await bcrypt.hash(QA_PASSWORD, 12);
      await client.query(
        `insert into publishers (id, name, slug) values ($1, $2, $3)
         on conflict (id) do update set name = excluded.name, slug = excluded.slug`,
        [QA.publisher.id, QA.publisher.name, QA.publisher.slug],
      );
      await client.query(
        `insert into book_packages (id, publisher_id, title, slug, level, status)
         values ($1, $2, $3, $4, 'B2', 'active')
         on conflict (id) do update set publisher_id = excluded.publisher_id, title = excluded.title, slug = excluded.slug, level = excluded.level, status = excluded.status`,
        [QA.package.id, QA.publisher.id, QA.package.title, QA.package.slug],
      );
      await client.query(
        `insert into book_components (id, book_package_id, title, slug, component_type, sort_order)
         values ($1, $2, 'QA Students Book', $3, 'students_book', 1)
         on conflict (id) do update set book_package_id = excluded.book_package_id, title = excluded.title, slug = excluded.slug`,
        [QA.component.id, QA.package.id, QA.component.slug],
      );
      await client.query(
        `insert into units (id, book_component_id, title, slug, unit_number, sort_order)
         values ($1, $2, 'QA Unit 1', $3, 1, 1)
         on conflict (id) do update set book_component_id = excluded.book_component_id, title = excluded.title, slug = excluded.slug`,
        [QA.unit.id, QA.component.id, QA.unit.slug],
      );
      await client.query(
        `insert into lessons (id, unit_id, title, slug, lesson_type, sort_order, position, status, ownership_type)
         values ($1, $2, 'QA Shared Book Lesson', $3, 'practice', 1, 1, 'published', 'official')
         on conflict (id) do update set unit_id = excluded.unit_id, title = excluded.title, slug = excluded.slug, status = excluded.status`,
        [QA.bookLesson.id, QA.unit.id, QA.bookLesson.slug],
      );

      for (const school of QA.schools) {
        await client.query(
          `insert into schools (id, name, logo, primary_color, secondary_color)
           values ($1, $2, 'QA', '#1d4ed8', '#0f172a')
           on conflict (id) do update set name = excluded.name`,
          [school.id, school.name],
        );
        for (const user of Object.values(school.users)) {
          await client.query(
            `insert into app_users (id, school_id, full_name, email, role, level, status, password_hash, auth_provider)
             values ($1, $2, $3, $4, $5, 'B2', $6, $7, 'password')
             on conflict (id) do update set school_id = excluded.school_id, full_name = excluded.full_name, email = excluded.email,
               role = excluded.role, status = excluded.status, password_hash = excluded.password_hash, auth_provider = 'password'`,
            [user.id, school.id, user.name, user.email, user.role, user.status, passwordHash],
          );
        }
        for (const classItem of school.classes) {
          const teacherId = school.users[classItem.teacher].id;
          await client.query(
            `insert into classes (id, school_id, teacher_id, name, level, slug, assigned_book, book_package_id, invite_code, status)
             values ($1, $2, $3, $4, 'B2', $5, $6, $7, $8, 'active')
             on conflict (id) do update set school_id = excluded.school_id, teacher_id = excluded.teacher_id, name = excluded.name,
               slug = excluded.slug, assigned_book = excluded.assigned_book, book_package_id = excluded.book_package_id,
               invite_code = excluded.invite_code, status = 'active'`,
            [classItem.id, school.id, teacherId, classItem.name, classItem.slug, QA.package.title, QA.package.id, classItem.invite],
          );
        }
        await client.query(
          `insert into class_students (class_id, student_id, status) values
           ($1, $3, 'active'), ($1, $4, 'active'), ($2, $4, 'active')
           on conflict (class_id, student_id) do update set status = 'active'`,
          [school.classes[0].id, school.classes[1].id, school.users.student1.id, school.users.student2.id],
        );
        for (const user of [school.users.admin, school.users.teacher1, school.users.teacher2, school.users.student1, school.users.student2]) {
          const roleScope = user.role === "admin" ? "school_admin" : user.role;
          await client.query(
            `insert into book_access (user_id, book_package_id, role_scope) values ($1, $2, $3)
             on conflict (user_id, book_package_id, role_scope) do nothing`,
            [user.id, QA.package.id, roleScope],
          );
        }
        await client.query(
          `insert into courses (id, school_id, book_package_id, ownership_type, created_by, title, book_code, level, status)
           values ($1, $2, $3, 'official', $4, $5, $6, 'B2', 'active')
           on conflict (id) do update set school_id = excluded.school_id, book_package_id = excluded.book_package_id,
             title = excluded.title, status = excluded.status`,
          [school.courseId, school.id, QA.package.id, school.users.admin.id, `QA ${school.key.toUpperCase()} Official Course`, `QA-${school.key.toUpperCase()}-COURSE`],
        );
        await client.query(
          `insert into lessons (id, course_id, school_id, ownership_type, created_by, title, position, status)
           values ($1, $2, $3, 'official', $4, $5, 1, 'published')
           on conflict (id) do update set course_id = excluded.course_id, school_id = excluded.school_id, title = excluded.title, status = excluded.status`,
          [school.lessonId, school.courseId, school.id, school.users.admin.id, `QA ${school.key.toUpperCase()} Assigned Lesson`],
        );
        await client.query(
          `insert into lesson_activities (id, lesson_id, school_id, ownership_type, created_by, type, title, content, correct_answers, position)
           values ($1, $3, $4, 'official', $5, 'multiple_choice', 'QA Official Activity', '{"questions":[]}', '{}', 1),
                  ($2, $3, $4, 'custom', $6, 'multiple_choice', 'QA Teacher Custom Activity', '{"questions":[]}', '{}', 2)
           on conflict (id) do update set lesson_id = excluded.lesson_id, school_id = excluded.school_id,
             ownership_type = excluded.ownership_type, created_by = excluded.created_by, title = excluded.title`,
          [school.officialLessonActivityId, school.customLessonActivityId, school.lessonId, school.id, school.users.admin.id, school.users.teacher1.id],
        );
        await client.query(
          `insert into activities (id, school_id, created_by, ownership_type, lesson_id, title, type, slug, activity_type, content, content_json, is_assignable)
           values ($1, $2, $3, 'official', $4, $5, 'multiple_choice', $6, 'multiple_choice', '{}', '{}', true)
           on conflict (id) do update set school_id = excluded.school_id, created_by = excluded.created_by,
             lesson_id = excluded.lesson_id, title = excluded.title, slug = excluded.slug`,
          [school.activityId, school.id, school.users.admin.id, QA.bookLesson.id, `QA ${school.key.toUpperCase()} Book Activity`, `qa-${school.key}-book-activity`],
        );
        await client.query(
          `insert into questions (id, activity_id, question_number, prompt, question_type, sort_order)
           values ($1, $2, 1, 'Choose yes', 'multiple_choice', 1)
           on conflict (id) do update set activity_id = excluded.activity_id, prompt = excluded.prompt`,
          [school.questionId, school.activityId],
        );
        await client.query(
          `insert into question_options (id, question_id, option_label, option_text, is_correct, sort_order) values
           ($1, $3, 'A', 'yes', true, 1), ($2, $3, 'B', 'no', false, 2)
           on conflict (id) do update set question_id = excluded.question_id, option_text = excluded.option_text, is_correct = excluded.is_correct`,
          [school.optionYesId, school.optionNoId, school.questionId],
        );
        await client.query(
          `insert into activity_assignments (id, school_id, activity_id, teacher_id, class_id, student_id, status, title) values
           ($1, $3, $4, $5, $6, null, 'assigned', 'QA Class Assignment'),
           ($2, $3, $4, $5, null, $7, 'assigned', 'QA Direct Assignment')
           on conflict (id) do update set school_id = excluded.school_id, activity_id = excluded.activity_id,
             teacher_id = excluded.teacher_id, class_id = excluded.class_id, student_id = excluded.student_id, status = excluded.status`,
          [school.classAssignmentId, school.directAssignmentId, school.id, school.activityId, school.users.teacher1.id, school.classes[0].id, school.users.student2.id],
        );
        await client.query(
          `insert into activity_submissions (id, school_id, activity_id, activity_assignment_id, student_id, answers, score, score_percent, correct_count, total_count, status, teacher_feedback, reviewed_at, reviewed_by) values
           ($1, $3, $4, $5, $6, '{"answer":"yes"}', 100, 100, 1, 1, 'submitted', 'Reviewed QA work', now(), $8),
           ($2, $3, $4, $7, $9, '{"answer":"no"}', 0, 0, 0, 1, 'submitted', '', null, null)
           on conflict (id) do update set school_id = excluded.school_id, activity_assignment_id = excluded.activity_assignment_id,
             student_id = excluded.student_id, score_percent = excluded.score_percent, teacher_feedback = excluded.teacher_feedback,
             reviewed_at = excluded.reviewed_at, reviewed_by = excluded.reviewed_by`,
          [school.reviewedSubmissionId, school.unreviewedSubmissionId, school.id, school.activityId, school.classAssignmentId,
            school.users.student1.id, school.directAssignmentId, school.users.teacher1.id, school.users.student2.id],
        );
        await client.query(
          `insert into book_page_hotspots (id, package_slug, component_slug, page_id, page_number, label, left_percent, top_percent,
             width_percent, height_percent, action_type, action_payload, created_by, school_id)
           values ($1, $2, $3, 'qa-page-1', 1, 'QA Custom Hotspot', 10, 10, 20, 10, 'none', '{}', $4, $5)
           on conflict (id) do update set created_by = excluded.created_by, school_id = excluded.school_id, label = excluded.label`,
          [school.hotspotId, QA.package.slug, QA.component.slug, school.users.teacher1.id, school.id],
        );
      }

      for (const [entityType, entityId] of qaEntityIds()) {
        await client.query(
          `insert into staging_qa_registry (seed_key, entity_type, entity_id) values ($1, $2, $3)
           on conflict (seed_key, entity_type, entity_id) do nothing`,
          [QA_SEED_KEY, entityType, entityId],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
  console.log("Staging QA seed applied idempotently.");
  console.log(`QA accounts use ${process.env.EDUFORGE_STAGING_QA_PASSWORD ? "the runtime-provided password" : "the documented unsafe staging-only default password"}.`);
} finally {
  client.release();
  await pool.end();
}
