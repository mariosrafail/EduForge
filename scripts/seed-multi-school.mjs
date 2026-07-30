import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { withAdvisoryLock } from "./_staging-db.mjs";
import { createMultiSchoolPool } from "./_multi-school-db.mjs";
import {
  MULTI_SCHOOL,
  MULTI_SCHOOL_CONFIRMATION,
  MULTI_SCHOOL_DEMO_PASSWORD,
  MULTI_SCHOOL_PLATFORM_ADMIN,
  MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD,
  MULTI_SCHOOL_SEED_KEY,
} from "./_multi-school-seed-data.mjs";

if (process.env.NODE_ENV === "production") throw new Error("Multi-school demo seed is forbidden when NODE_ENV=production");
if (process.env.ALLOW_DEMO_SEED !== "true") throw new Error("ALLOW_DEMO_SEED=true is required");
if (process.env.MULTI_SCHOOL_SEED_CONFIRMATION !== MULTI_SCHOOL_CONFIRMATION) throw new Error(`MULTI_SCHOOL_SEED_CONFIRMATION must equal ${MULTI_SCHOOL_CONFIRMATION}`);

const normalize = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashCode = (value) => createHash("sha256").update(normalize(value)).digest("hex");
const maskCode = (value) => `****-${normalize(value).slice(-4)}`;
const { pool, safeLabel } = createMultiSchoolPool();
const client = await pool.connect();

try {
  console.log(`Seeding fictional multi-school data into isolated target: ${safeLabel}`);
  await withAdvisoryLock(client, "eduforge:multi-school-seed", async () => {
    await client.query("begin");
    try {
      await client.query(`create table if not exists multi_school_seed_registry(seed_key text not null,entity_type text not null,entity_id uuid not null,created_at timestamptz not null default now(),primary key(seed_key,entity_type,entity_id))`);
      for (const school of MULTI_SCHOOL) {
        const owned = (await client.query(`select exists(select 1 from multi_school_seed_registry where seed_key=$1 and entity_type='school' and entity_id=$2) owned`, [MULTI_SCHOOL_SEED_KEY, school.id])).rows[0].owned;
        const existing = (await client.query("select name from schools where id=$1", [school.id])).rows[0];
        if (existing && !owned) throw new Error(`Deterministic school ID is not owned by this seed: ${school.id}`);
        if (existing && existing.name !== school.name) throw new Error(`Seed school identity mismatch: ${school.id}`);
      }
      const packageRows = (await client.query(`
        select id,title,slug from book_packages
        where slug=any($1::text[]) and status='active'
        order by case slug when 'ultimate-b1' then 1 when 'ultimate-b1-plus' then 2 when 'ultimate-b2' then 3 end
      `, [["ultimate-b1", "ultimate-b1-plus", "ultimate-b2"]])).rows;
      if (packageRows.length !== 3) throw new Error("All Phase 1 Ultimate English packages are required; run production migrations first");
      const packageRow = packageRows.find((row) => row.slug === "ultimate-b2");
      if (!packageRow) throw new Error("Ultimate B2 package is required; run production migrations first");
      const activityRows = (await client.query(`
        select a.id, a.slug, a.content_json->>'implementationMode' implementation_mode
        from activities a
        join lessons l on l.id=a.lesson_id join units u on u.id=l.unit_id join book_components c on c.id=u.book_component_id
        where c.book_package_id=$1 and a.is_assignable=true
        order by a.sort_order, a.created_at
      `, [packageRow.id])).rows;
      const autoActivity = activityRows.find((row) => row.implementation_mode === "auto-scored");
      const reviewActivity = activityRows.find((row) => row.implementation_mode === "teacher-reviewed");
      if (!autoActivity || !reviewActivity) throw new Error("Assignable auto-scored and teacher-reviewed Ultimate B2 activities are required");
      const passwordHash = await bcrypt.hash(process.env.MULTI_SCHOOL_DEMO_PASSWORD || MULTI_SCHOOL_DEMO_PASSWORD, 12);
      const platformAdminPasswordHash = await bcrypt.hash(
        process.env.MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD || MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD,
        12,
      );
      const existingPlatformAdmin = (await client.query(
        "select email from platform_admins where id=$1",
        [MULTI_SCHOOL_PLATFORM_ADMIN.id],
      )).rows[0];
      const platformAdminOwned = (await client.query(`
        select exists(
          select 1 from multi_school_seed_registry
          where seed_key=$1 and entity_type='platform_admin' and entity_id=$2
        ) owned
      `, [MULTI_SCHOOL_SEED_KEY, MULTI_SCHOOL_PLATFORM_ADMIN.id])).rows[0].owned;
      if (existingPlatformAdmin && !platformAdminOwned) throw new Error("Deterministic Platform Admin ID is not owned by this seed");
      if (existingPlatformAdmin && existingPlatformAdmin.email !== MULTI_SCHOOL_PLATFORM_ADMIN.email) throw new Error("Platform Admin seed identity mismatch");
      await client.query(`
        insert into platform_admins(id,full_name,email,password_hash,status,password_changed_at)
        values($1,$2,$3,$4,'active',now())
        on conflict(id) do update
        set full_name=excluded.full_name,email=excluded.email,password_hash=excluded.password_hash,
          status='active',password_changed_at=now()
      `, [
        MULTI_SCHOOL_PLATFORM_ADMIN.id,
        MULTI_SCHOOL_PLATFORM_ADMIN.fullName,
        MULTI_SCHOOL_PLATFORM_ADMIN.email,
        platformAdminPasswordHash,
      ]);
      await client.query("select revoke_platform_admin_sessions($1)", [MULTI_SCHOOL_PLATFORM_ADMIN.id]);
      await client.query(
        "delete from platform_admin_login_attempts where platform_admin_id=$1 or email_hash=$2",
        [MULTI_SCHOOL_PLATFORM_ADMIN.id, createHash("sha256").update(MULTI_SCHOOL_PLATFORM_ADMIN.email).digest("hex")],
      );
      await client.query(`
        insert into platform_admin_audit_log(platform_admin_id,action,target_type,target_id,metadata)
        values($1,'demo_account_seeded','platform_admin',$2,'{"source":"isolated_local_multi_school"}'::jsonb)
      `, [MULTI_SCHOOL_PLATFORM_ADMIN.id, MULTI_SCHOOL_PLATFORM_ADMIN.id]);
      await client.query(`
        insert into multi_school_seed_registry(seed_key,entity_type,entity_id)
        values($1,'platform_admin',$2) on conflict do nothing
      `, [MULTI_SCHOOL_SEED_KEY, MULTI_SCHOOL_PLATFORM_ADMIN.id]);

      for (const school of MULTI_SCHOOL) {
        await client.query(
          `insert into schools(id,name,logo,primary_color,secondary_color)
           values($1,$2,$3,$4,$5)
           on conflict(id) do update
           set name=excluded.name,logo=excluded.logo,primary_color=excluded.primary_color,secondary_color=excluded.secondary_color`,
          [school.id, school.name, school.branding.logo, school.branding.primary, school.branding.secondary],
        );
        for (const user of school.users) {
          await client.query(`insert into app_users(id,school_id,full_name,email,role,level,status,password_hash,auth_provider) values($1,$2,$3,$4,$5,'B2','active',$6,'password') on conflict(id) do update set school_id=excluded.school_id,full_name=excluded.full_name,email=excluded.email,role=excluded.role,status='active',password_hash=excluded.password_hash`, [user.id, school.id, user.name, user.email, user.role, passwordHash]);
          if (user.role !== "student") {
            for (const catalogPackage of packageRows) {
              await client.query(`insert into book_access(user_id,book_package_id,role_scope) values($1,$2,$3) on conflict(user_id,book_package_id,role_scope) do nothing`, [user.id, catalogPackage.id, user.role === "admin" ? "school_admin" : "teacher"]);
            }
          } else if (user.profile !== "expired-code" && user.profile !== "redeemed") {
            await client.query(`insert into book_access(user_id,book_package_id,role_scope) values($1,$2,'student') on conflict(user_id,book_package_id,role_scope) do update set activation_code_id=null`, [user.id, packageRow.id]);
          }
          const isAthensStudentOne = school.key === "athens" && user.email === "student1.athens@multi-school.dev.invalid";
          if (user.role === "student" && isAthensStudentOne) {
            for (const catalogPackage of packageRows.filter((item) => item.slug !== "ultimate-b2")) {
              await client.query(`insert into book_access(user_id,book_package_id,role_scope) values($1,$2,'student') on conflict(user_id,book_package_id,role_scope) do update set activation_code_id=null`, [user.id, catalogPackage.id]);
            }
          } else if (user.role === "student") {
            await client.query(`
              delete from book_access
              where user_id=$1 and book_package_id=any($2::uuid[])
            `, [user.id, packageRows.filter((item) => item.slug !== "ultimate-b2").map((item) => item.id)]);
          }
        }
        for (const classItem of school.classes) {
          await client.query(`insert into classes(id,school_id,teacher_id,name,level,slug,assigned_book,book_package_id,invite_code,status) values($1,$2,$3,$4,'B2',$5,$6,$7,$8,'active') on conflict(id) do update set school_id=excluded.school_id,teacher_id=excluded.teacher_id,name=excluded.name,book_package_id=excluded.book_package_id,status='active'`, [classItem.id, school.id, classItem.teacherId, classItem.name, classItem.slug, packageRow.title, packageRow.id, classItem.invite]);
          for (const studentId of classItem.studentIds) await client.query(`insert into class_students(class_id,student_id,status) values($1,$2,'active') on conflict(class_id,student_id) do update set status='active'`, [classItem.id, studentId]);
        }
        const admin = school.users.find((user) => user.role === "admin");
        await client.query(`insert into activation_code_batches(id,school_id,book_package_id,request_key,label,quantity,expires_at,initial_exported_at,created_by) values($1,$2,$3,$4,$5,4,now()+interval '90 days',now(),$6) on conflict(id) do update set label=excluded.label`, [school.batchId, school.id, packageRow.id, school.requestKey, `${school.name} development licenses`, admin.id]);
        for (const code of school.codes) {
          const revoked = code.status === "revoked";
          const redeemed = code.status === "redeemed";
          const expiresAt = code.status === "expired" ? new Date(Date.now() - 86400000) : new Date(Date.now() + 90 * 86400000);
          await client.query(`insert into activation_codes(id,code,code_hash,code_mask,batch_id,book_package_id,school_id,max_uses,used_count,status,expires_at,redeemed_at,redeemed_by,revoked_at,revocation_reason,created_by) values($1,null,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$11,$12,$13,$14) on conflict(id) do update set status=excluded.status,expires_at=excluded.expires_at,redeemed_at=excluded.redeemed_at,redeemed_by=excluded.redeemed_by,revoked_at=excluded.revoked_at,revocation_reason=excluded.revocation_reason,used_count=excluded.used_count`, [code.id, hashCode(code.value), maskCode(code.value), school.batchId, packageRow.id, school.id, redeemed ? 1 : 0, code.status, expiresAt, redeemed ? new Date() : null, code.redeemedBy, revoked ? new Date() : null, revoked ? "Fictional development revocation" : null, admin.id]);
          if (redeemed) await client.query(`insert into book_access(user_id,book_package_id,activation_code_id,role_scope) values($1,$2,$3,'student') on conflict(user_id,book_package_id,role_scope) do update set activation_code_id=excluded.activation_code_id`, [code.redeemedBy, packageRow.id, code.id]);
        }
        const scenarioClass = school.classes[0];
        const scenarios = [
          { id: school.assignments[0].id, activity: autoActivity, title: "Auto-scored benchmark — high, low, missing", dueDays: 7, kind: "auto" },
          { id: school.assignments[1].id, activity: reviewActivity, title: "Teacher review — pending and reviewed", dueDays: 5, kind: "review" },
          { id: school.assignments[2].id, activity: autoActivity, title: "Expired deadline — late and blocked", dueDays: -2, kind: "expired" },
          { id: school.assignments[3].id, activity: autoActivity, title: "Future assignment — not started", dueDays: 14, kind: "future" },
        ];
        for (const [scenarioIndex, scenario] of scenarios.entries()) {
          await client.query(`
            insert into activity_assignments(id,school_id,activity_id,teacher_id,class_id,student_id,due_at,status,title,teacher_notes,idempotency_key)
            values($1,$2,$3,$4,$5,null,now()+($6 || ' days')::interval,'assigned',$7,'Fictional multi-school demo state',$8)
            on conflict(id) do update set activity_id=excluded.activity_id,due_at=excluded.due_at,status='assigned',title=excluded.title,teacher_notes=excluded.teacher_notes
          `, [scenario.id, school.id, scenario.activity.id, scenarioClass.teacherId, scenarioClass.id, scenario.dueDays, scenario.title, `multi-school-${school.key}-${scenario.kind}`]);
          if (scenario.kind === "future") continue;
          for (const [memberIndex, studentId] of scenarioClass.studentIds.entries()) {
            const student = school.users.find((user) => user.id === studentId);
            if (student.profile === "missing") continue;
            let status = "submitted";
            let score = student.profile === "strong" ? 96 : student.profile === "weak" ? 42 : 78;
            let feedback = score >= 85 ? "Excellent command of the target language." : score < 50 ? "Review the unit and retry the practice tasks." : "Good progress; check the marked items.";
            let reviewedAt = null;
            let reviewedBy = null;
            if (scenario.kind === "review") {
              if (student.profile === "strong") {
                status = "awaiting_review";
                score = null;
                feedback = "";
              } else {
                status = "reviewed";
                score = student.profile === "weak" ? 64 : 88;
                feedback = student.profile === "weak" ? "Add clearer evidence and review the target form." : "Well-supported response.";
                reviewedAt = new Date();
                reviewedBy = scenarioClass.teacherId;
              }
            }
            const submissionId = `d1700000-0060-4000-8000-${(MULTI_SCHOOL.indexOf(school) * 10000 + scenarioIndex * 100 + memberIndex + 1).toString(16).padStart(12, "0")}`;
            await client.query(`
              insert into activity_submissions(id,school_id,activity_id,activity_assignment_id,student_id,answers,score,score_percent,correct_count,total_count,status,teacher_feedback,reviewed_at,reviewed_by,submission_slot,submitted_at)
              values($1,$2,$3,$4,$5,'{"demoResponse":"Fictional learner response"}',$6,$6,$7,$8,$9,$10,$11,$12,1,case when $13 then now()-interval '1 day' else now() end)
              on conflict(id) do update set activity_id=excluded.activity_id,activity_assignment_id=excluded.activity_assignment_id,answers=excluded.answers,score=excluded.score,score_percent=excluded.score_percent,correct_count=excluded.correct_count,total_count=excluded.total_count,status=excluded.status,teacher_feedback=excluded.teacher_feedback,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,submission_slot=1,submitted_at=excluded.submitted_at
            `, [submissionId, school.id, scenario.activity.id, scenario.id, studentId, score, score === null ? null : Math.round(score / 10), score === null ? null : 10, status, feedback, reviewedAt, reviewedBy, scenario.kind === "expired"]);
          }
        }
        await client.query(`insert into multi_school_seed_registry(seed_key,entity_type,entity_id) values($1,'school',$2) on conflict do nothing`, [MULTI_SCHOOL_SEED_KEY, school.id]);
      }
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
  });
  console.table(MULTI_SCHOOL.flatMap((school) => school.users.map((user) => ({ school: school.name, role: user.role, name: user.name, email: user.email, classes: school.classes.filter((item) => item.teacherId === user.id || item.studentIds.includes(user.id)).map((item) => item.name).join(", ") }))));
  console.log("Development password is runtime MULTI_SCHOOL_DEMO_PASSWORD or the documented development-only default.");
  console.log("Seeded development codes:", MULTI_SCHOOL.flatMap((school) => school.codes.map((code) => `${school.key}:${code.status}:${code.value}`)).join(" | "));
} finally { client.release(); await pool.end(); }
