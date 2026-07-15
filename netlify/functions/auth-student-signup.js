import bcrypt from "bcryptjs";
import { grantBookAccessByCode, validateActivationCodeForUser } from "./_activation-utils.js";
import { createSession, emailPattern, ensureAuthSchema, getSql, json, normalizeEmail, publicUser, serverError } from "./_auth-utils.js";
import { enforceInviteRateLimit, findClassByInviteCode, isValidInviteCode, publicClassInviteRow, recordInviteAttempt } from "./_class-utils.js";

function validate(payload) {
  const fullName = String(payload.fullName ?? payload.studentName ?? "").trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password ?? "");
  const classCode = String(payload.classCode ?? payload.inviteCode ?? "").trim().toUpperCase();
  const bookCode = String(payload.bookCode ?? "").trim();

  if (!fullName) return { error: "fullName is required" };
  if (!emailPattern.test(email)) return { error: "A valid email is required" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (!isValidInviteCode(classCode) || payload.classSlug || payload.classId) {
    return { error: "A valid class invite code is required for student signup" };
  }

  return { value: { fullName, email, password, classCode, bookCode } };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const validation = validate(payload);
    if (validation.error) return json(400, { error: validation.error });

    const sql = getSql();
    await ensureAuthSchema(sql);
    const { fullName, email, password, classCode, bookCode } = validation.value;

    const rateLimitError = await enforceInviteRateLimit(sql, event);
    if (rateLimitError) return rateLimitError;
    const classItem = await findClassByInviteCode(sql, classCode);
    await recordInviteAttempt(sql, event, Boolean(classItem));
    if (!classItem?.schoolId) {
      return json(400, { error: "A valid class invite code is required for student signup" });
    }

    if (bookCode) {
      const activationValidation = await validateActivationCodeForUser(sql, {
        code: bookCode,
        schoolId: classItem.schoolId,
        enforceUsageLimit: true,
      });
      if (activationValidation.error) return activationValidation.error;
    }

    const existing = await sql`select id from app_users where lower(email) = ${email} limit 1`;
    if (existing.length > 0) return json(409, { error: "Email already exists" });

    const passwordHash = await bcrypt.hash(password, 12);
    const users = await sql`
      with inserted_user as (
        insert into app_users (school_id, full_name, email, role, level, status, password_hash, auth_provider)
        values (${classItem.schoolId}, ${fullName}, ${email}, 'student', null, 'active', ${passwordHash}, 'password')
        returning id, school_id, full_name, email, role, status
      ), inserted_membership as (
        insert into class_students (class_id, student_id, joined_at, status)
        select ${classItem.id}, id, now(), 'active' from inserted_user
        returning student_id
      )
      select u.*
      from inserted_user u
      join inserted_membership m on m.student_id = u.id
    `;

    let bookActivated = false;
    let bookPackageTitle = null;
    if (bookCode) {
      const activation = await grantBookAccessByCode(sql, { code: bookCode, userId: users[0].id });
      if (activation.error) return activation.error;
      bookActivated = Boolean(activation.activated);
      bookPackageTitle = activation.bookPackageTitle || null;
    }

    const session = await createSession(sql, users[0].id, event);
    return json(201, {
      user: publicUser(users[0]),
      joinedClass: publicClassInviteRow(classItem),
      bookActivated,
      bookPackageTitle,
    }, { "Set-Cookie": session.cookie });
  } catch (error) {
    console.error(error);
    if (error.code === "23505") return json(409, { error: "Email already exists" });
    return serverError("Student signup failed. Check database setup and migrations.");
  }
}
