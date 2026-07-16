import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { createSafePool, withAdvisoryLock } from "./_staging-db.mjs";
import { MULTI_SCHOOL, MULTI_SCHOOL_CONFIRMATION, MULTI_SCHOOL_DEMO_PASSWORD, MULTI_SCHOOL_SEED_KEY } from "./_multi-school-seed-data.mjs";

if (process.env.NODE_ENV === "production") throw new Error("Multi-school demo seed is forbidden when NODE_ENV=production");
if (process.env.ALLOW_DEMO_SEED !== "true") throw new Error("ALLOW_DEMO_SEED=true is required");
if (process.env.MULTI_SCHOOL_SEED_CONFIRMATION !== MULTI_SCHOOL_CONFIRMATION) throw new Error(`MULTI_SCHOOL_SEED_CONFIRMATION must equal ${MULTI_SCHOOL_CONFIRMATION}`);

const normalize = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashCode = (value) => createHash("sha256").update(normalize(value)).digest("hex");
const maskCode = (value) => `****-${normalize(value).slice(-4)}`;
const { pool, safeLabel } = createSafePool("staging");
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
      const packageRow = (await client.query("select id,title from book_packages where slug='ultimate-b2' and status='active' limit 1")).rows[0];
      if (!packageRow) throw new Error("Ultimate B2 package is required; run production migrations first");
      const activity = (await client.query(`select a.id from activities a join lessons l on l.id=a.lesson_id join units u on u.id=l.unit_id join book_components c on c.id=u.book_component_id where c.book_package_id=$1 and a.is_assignable=true order by a.created_at limit 1`, [packageRow.id])).rows[0];
      if (!activity) throw new Error("An assignable Ultimate B2 activity is required");
      const passwordHash = await bcrypt.hash(process.env.MULTI_SCHOOL_DEMO_PASSWORD || MULTI_SCHOOL_DEMO_PASSWORD, 12);

      for (const school of MULTI_SCHOOL) {
        await client.query(`insert into schools(id,name,logo,primary_color,secondary_color) values($1,$2,'DEV','#1d4ed8','#0f172a') on conflict(id) do update set name=excluded.name`, [school.id, school.name]);
        for (const user of school.users) {
          await client.query(`insert into app_users(id,school_id,full_name,email,role,level,status,password_hash,auth_provider) values($1,$2,$3,$4,$5,'B2','active',$6,'password') on conflict(id) do update set school_id=excluded.school_id,full_name=excluded.full_name,email=excluded.email,role=excluded.role,status='active',password_hash=excluded.password_hash`, [user.id, school.id, user.name, user.email, user.role, passwordHash]);
          if (user.role !== "student") await client.query(`insert into book_access(user_id,book_package_id,role_scope) values($1,$2,$3) on conflict(user_id,book_package_id,role_scope) do nothing`, [user.id, packageRow.id, user.role === "admin" ? "school_admin" : "teacher"]);
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
        for (const [assignmentIndex, assignment] of school.assignments.entries()) {
          await client.query(`insert into activity_assignments(id,school_id,activity_id,teacher_id,class_id,student_id,due_at,status,title,teacher_notes) values($1,$2,$3,$4,$5,null,now()+($6 || ' days')::interval,'assigned',$7,'Fictional multi-school QA assignment') on conflict(id) do update set due_at=excluded.due_at,status='assigned'`, [assignment.id, school.id, activity.id, assignment.teacherId, assignment.classId, assignment.dueDays, `Ultimate B2 practice ${assignmentIndex + 1}`]);
          const members = school.classes[assignmentIndex].studentIds;
          for (const [memberIndex, studentId] of members.entries()) {
            const student = school.users.find((user) => user.id === studentId);
            if (student.profile === "missing") continue;
            const score = student.profile === "strong" ? 96 : student.profile === "weak" ? 42 : 70 + memberIndex * 6;
            const submissionId = `d1700000-0060-4000-8000-${(Number(school.key.length) * 100000 + assignmentIndex * 100 + memberIndex + MULTI_SCHOOL.indexOf(school) * 10000).toString(16).padStart(12, "0")}`;
            await client.query(`insert into activity_submissions(id,school_id,activity_id,activity_assignment_id,student_id,answers,score,score_percent,correct_count,total_count,status,teacher_feedback,reviewed_at,reviewed_by) values($1,$2,$3,$4,$5,'{"seed":"fictional"}',$6,$6,$7,10,'submitted',$8,now(),$9) on conflict(id) do update set score=excluded.score,score_percent=excluded.score_percent,teacher_feedback=excluded.teacher_feedback,reviewed_by=excluded.reviewed_by`, [submissionId, school.id, activity.id, assignment.id, studentId, score, Math.round(score / 10), score >= 85 ? "Excellent command of the target language." : score < 50 ? "Review the unit and retry the practice tasks." : "Good progress; check the marked items.", assignment.teacherId]);
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
