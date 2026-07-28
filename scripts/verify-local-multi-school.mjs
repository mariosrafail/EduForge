import pg from "pg";
import { readFile } from "node:fs/promises";
import {
  MULTI_SCHOOL,
  MULTI_SCHOOL_DEMO_PASSWORD,
  MULTI_SCHOOL_PLATFORM_ADMIN,
} from "./_multi-school-seed-data.mjs";
import { localMultiSchoolDatabaseUrl } from "./_local-multi-school.mjs";

const pool = new pg.Pool({ connectionString: localMultiSchoolDatabaseUrl() });
const failures = [];
const expectEqual = (label, actual, expected) => {
  if (Number(actual) !== Number(expected)) failures.push(`${label}: expected ${expected}, got ${actual}`);
};
const expectTrue = (label, value) => {
  if (!value) failures.push(label);
};

try {
  const counts = (await pool.query(`
    select
      (select count(*) from schools where id=any($1::uuid[])) schools,
      (select count(*) from app_users where school_id=any($1::uuid[])) users,
      (select count(*) from classes where school_id=any($1::uuid[])) classes,
      (select count(*) from activity_assignments where school_id=any($1::uuid[])) assignments,
      (select count(*) from activity_submissions where school_id=any($1::uuid[])) submissions,
      (select count(*) from activation_codes where school_id=any($1::uuid[])) codes
  `, [MULTI_SCHOOL.map((school) => school.id)])).rows[0];
  expectEqual("fictional schools", counts.schools, 3);
  expectEqual("users", counts.users, 33);
  expectEqual("classes", counts.classes, 9);
  expectEqual("assignments", counts.assignments, 12);
  expectEqual("submissions", counts.submissions, 27);
  expectEqual("activation codes", counts.codes, 12);
  const platformAdmins = (await pool.query(`
    select id,email,status from platform_admins where id=$1
  `, [MULTI_SCHOOL_PLATFORM_ADMIN.id])).rows;
  expectEqual("fictional Platform Admins", platformAdmins.length, 1);
  expectTrue("fictional Platform Admin identity", platformAdmins[0]?.email === MULTI_SCHOOL_PLATFORM_ADMIN.email);
  expectTrue("fictional Platform Admin active", platformAdmins[0]?.status === "active");

  const perSchool = (await pool.query(`
    select s.name,
      count(distinct u.id)::int users,
      count(distinct c.id)::int classes,
      count(distinct aa.id)::int assignments
    from schools s
    left join app_users u on u.school_id=s.id
    left join classes c on c.school_id=s.id
    left join activity_assignments aa on aa.school_id=s.id
    where s.id=any($1::uuid[])
    group by s.id order by s.name
  `, [MULTI_SCHOOL.map((school) => school.id)])).rows;
  for (const row of perSchool) {
    expectEqual(`${row.name} users`, row.users, 11);
    expectEqual(`${row.name} classes`, row.classes, 3);
    expectEqual(`${row.name} assignments`, row.assignments, 4);
  }

  const states = (await pool.query(`
    select
      count(*) filter(where s.status='awaiting_review')::int pending,
      count(*) filter(where s.status='reviewed' and s.teacher_feedback <> '')::int reviewed,
      count(*) filter(where s.score_percent >= 90)::int high_scores,
      count(*) filter(where s.score_percent < 50)::int low_scores,
      count(*) filter(where aa.due_at < now())::int expired_deadlines,
      count(*) filter(where aa.due_at > now()+interval '10 days')::int future_deadlines,
      count(*) filter(where s.submitted_at > aa.due_at)::int late_submissions
    from activity_assignments aa
    left join activity_submissions s on s.activity_assignment_id=aa.id
    where aa.school_id=any($1::uuid[])
  `, [MULTI_SCHOOL.map((school) => school.id)])).rows[0];
  for (const [name, value] of Object.entries(states)) expectTrue(`missing scenario state: ${name}`, Number(value) > 0);

  const licensing = (await pool.query(`
    select status, count(*)::int count
    from activation_codes where school_id=any($1::uuid[])
    group by status order by status
  `, [MULTI_SCHOOL.map((school) => school.id)])).rows;
  for (const status of ["unused", "redeemed", "expired", "revoked"]) {
    expectEqual(`activation ${status}`, licensing.find((row) => row.status === status)?.count, 3);
  }
  const accessStates = (await pool.query(`
    select u.email, exists(select 1 from book_access ba where ba.user_id=u.id) has_access
    from app_users u where u.school_id=any($1::uuid[]) and u.role='student'
  `, [MULTI_SCHOOL.map((school) => school.id)])).rows;
  expectEqual("students with access", accessStates.filter((row) => row.has_access).length, 21);
  expectEqual("students without access", accessStates.filter((row) => !row.has_access).length, 3);
  const catalog = (await pool.query(`
    select bp.slug,bp.title,bp.level,bp.status,bp.cover_asset_path,
      count(distinct bc.id)::int component_count,
      count(u.id)::int unit_count
    from book_packages bp
    left join book_components bc on bc.book_package_id=bp.id
    left join units u on u.book_component_id=bc.id
    where bp.slug=any($1::text[])
    group by bp.id
    order by case bp.slug when 'ultimate-b1' then 1 when 'ultimate-b1-plus' then 2 when 'ultimate-b2' then 3 when 'english-journey-6' then 4 end
  `, [["ultimate-b1", "ultimate-b1-plus", "ultimate-b2", "english-journey-6"]])).rows;
  expectEqual("catalog records", catalog.length, 4);
  expectEqual("B1 components", catalog.find((row) => row.slug === "ultimate-b1")?.component_count, 2);
  expectEqual("B1+ components", catalog.find((row) => row.slug === "ultimate-b1-plus")?.component_count, 2);
  expectEqual("B2 preserved database components", catalog.find((row) => row.slug === "ultimate-b2")?.component_count, 4);
  expectEqual("B1 units", catalog.find((row) => row.slug === "ultimate-b1")?.unit_count, 0);
  expectEqual("B1+ units", catalog.find((row) => row.slug === "ultimate-b1-plus")?.unit_count, 0);
  expectTrue("English Journey 6 must be archived", catalog.find((row) => row.slug === "english-journey-6")?.status === "archived");
  const b2Components = (await pool.query(`
    select bc.slug,
      count(distinct u.id)::int unit_count,
      count(distinct l.id)::int lesson_count,
      count(distinct a.id)::int activity_count,
      count(distinct q.id)::int question_count
    from book_components bc
    join book_packages bp on bp.id=bc.book_package_id
    left join units u on u.book_component_id=bc.id
    left join lessons l on l.unit_id=u.id
    left join activities a on a.lesson_id=l.id
    left join questions q on q.activity_id=a.id
    where bp.slug='ultimate-b2'
    group by bc.id
    order by bc.sort_order
  `)).rows;
  expectTrue(
    "B2 component slugs must remain unchanged",
    JSON.stringify(b2Components.map((row) => row.slug)) === JSON.stringify([
      "ultimate-b2-students-book",
      "ultimate-b2-workbook",
      "ultimate-b2-grammar-book",
      "ultimate-b2-test-book",
    ]),
  );
  for (const slug of ["ultimate-b2-grammar-book", "ultimate-b2-test-book"]) {
    const preserved = b2Components.find((row) => row.slug === slug);
    expectTrue(`${slug} units must remain`, Number(preserved?.unit_count) > 0);
    expectTrue(`${slug} lessons must remain`, Number(preserved?.lesson_count) > 0);
    expectTrue(`${slug} activities must remain`, Number(preserved?.activity_count) > 0);
    expectTrue(`${slug} questions must remain`, Number(preserved?.question_count) > 0);
  }

  const staffAccess = (await pool.query(`
    select u.email,count(distinct bp.slug)::int package_count
    from app_users u
    join book_access ba on ba.user_id=u.id
    join book_packages bp on bp.id=ba.book_package_id and bp.status='active'
    where u.school_id=any($1::uuid[]) and u.role in ('admin','teacher')
    group by u.id
  `, [MULTI_SCHOOL.map((school) => school.id)])).rows;
  expectEqual("staff with all Phase 1 packages", staffAccess.filter((row) => row.package_count === 3).length, 9);
  const athensStudentOnePackages = (await pool.query(`
    select bp.slug from book_access ba join book_packages bp on bp.id=ba.book_package_id
    join app_users u on u.id=ba.user_id
    where u.email='student1.athens@multi-school.dev.invalid' and bp.status='active'
    order by case bp.slug when 'ultimate-b1' then 1 when 'ultimate-b1-plus' then 2 when 'ultimate-b2' then 3 end
  `)).rows.map((row) => row.slug);
  expectTrue("Athens student1 must access all Phase 1 packages", JSON.stringify(athensStudentOnePackages) === JSON.stringify(["ultimate-b1", "ultimate-b1-plus", "ultimate-b2"]));
  const studentEightAccess = Number((await pool.query(`
    select count(*)::int count from book_access ba join app_users u on u.id=ba.user_id
    where u.email like 'student8.%@multi-school.dev.invalid'
  `)).rows[0].count);
  expectEqual("student8 no-access accounts", studentEightAccess, 0);

  const databaseModes = (await pool.query(`
    select
      count(*) filter(where a.content_json->>'implementationMode'='auto-scored')::int auto_scored,
      count(*) filter(where a.content_json->>'implementationMode'='teacher-reviewed')::int teacher_reviewed,
      count(*) filter(where a.content_json->>'implementationMode'='unscored-practice')::int unscored,
      count(*) filter(where a.content_json->>'implementationMode'='reading-content')::int reading
    from activities a join lessons l on l.id=a.lesson_id join units u on u.id=l.unit_id
    join book_components bc on bc.id=u.book_component_id join book_packages bp on bp.id=bc.book_package_id
    where bp.slug='ultimate-b2'
  `)).rows[0];
  expectEqual("database auto-scored activities", databaseModes.auto_scored, 50);
  expectEqual("database teacher-reviewed activities", databaseModes.teacher_reviewed, 19);
  expectEqual("database unscored activities", databaseModes.unscored, 7);
  expectEqual("database reading activities", databaseModes.reading, 1);
  const [unit1, unit2] = await Promise.all([
    readFile("books/ultimate-b2/generated/editorial/unit-01.implementation-matrix.json", "utf8").then(JSON.parse),
    readFile("books/ultimate-b2/generated/editorial/unit-02.implementation-matrix.json", "utf8").then(JSON.parse),
  ]);
  const pilotActivities = [...unit1.activities, ...unit2.activities];
  const enabledActivities = pilotActivities.filter((activity) => activity.implementationMode !== "unsupported-disabled").length;
  const disabledActivities = pilotActivities.filter((activity) => activity.implementationMode === "unsupported-disabled").length;
  expectEqual("Ultimate B2 pilot enabled activities", enabledActivities, 77);
  expectEqual("Ultimate B2 pilot disabled activities", disabledActivities, 12);

  const unsafeAnswers = Number((await pool.query(`
    select count(*)::int count from activity_submissions
    where school_id=any($1::uuid[]) and (answers::text ilike '%acceptedAnswers%' or answers::text ilike '%correctAnswers%')
  `, [MULTI_SCHOOL.map((school) => school.id)])).rows[0].count);
  expectEqual("answer-key leakage in seeded submissions", unsafeAnswers, 0);
  const integrity = await pool.query("select table_name, null_school_rows from tenant_integrity_issues where null_school_rows <> 0");
  expectEqual("tenant integrity issues", integrity.rowCount, 0);

  if (failures.length) throw new Error(`Local multi-school verification failed:\n- ${failures.join("\n- ")}`);
  console.table(perSchool);
  console.table([{ ...counts, ...states, enabled_activities: enabledActivities, disabled_activities: disabledActivities }]);
  console.log(`Verified deterministic fictional data, preserved four-component B2 storage, tenant scope, workflows, licensing lifecycle, and answer-key safety.`);
  console.log(`Demo password: ${MULTI_SCHOOL_DEMO_PASSWORD} (development-only)`);
} finally {
  await pool.end();
}
