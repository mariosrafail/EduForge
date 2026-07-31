import bcrypt from "bcryptjs";
import { createSession, emailPattern, getSql, json, normalizeEmail, publicUser, serverError } from "./_auth-utils.js";
import { validatePassword } from "./_account-lifecycle-utils.js";
import { enforceInviteRateLimit, findClassByInviteCode, isValidInviteCode, publicClassInviteRow, recordInviteAttempt } from "./_class-utils.js";
import {
  requireRuntimeSchema,
  schemaFailureResponse,
} from "./_runtime-schema-readiness.js";

function validate(payload) {
  const fullName = String(payload.fullName ?? payload.studentName ?? "").trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password ?? "");
  const classCode = String(payload.classCode ?? payload.inviteCode ?? "").trim().toUpperCase();

  if (!fullName) return { error: "fullName is required" };
  if (!emailPattern.test(email)) return { error: "A valid email is required" };
  const passwordError = validatePassword(password, email);
  if (passwordError) return { error: passwordError };
  if (!isValidInviteCode(classCode) || payload.classSlug || payload.classId) {
    return { error: "A valid class invite code is required for student signup" };
  }

  return { value: { fullName, email, password, classCode } };
}

export function createStudentSignupHandler(dependencies = {}) {
  const database = dependencies.getDatabase || getSql;
  const checkReadiness = dependencies.checkReadiness || requireRuntimeSchema;
  const enforceRateLimit = dependencies.enforceRateLimit || enforceInviteRateLimit;
  const findClass = dependencies.findClass || findClassByInviteCode;
  const recordAttempt = dependencies.recordAttempt || recordInviteAttempt;
  const hashPassword = dependencies.hashPassword || ((password) => bcrypt.hash(password, 12));
  const createAuthSession = dependencies.createAuthSession || createSession;

  return async function studentSignupHandler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Request body must be valid JSON" });
    }
    const validation = validate(payload);
    if (validation.error) return json(400, { error: validation.error });

    const sql = database();
    const readinessError = await checkReadiness(sql);
    if (readinessError) return readinessError;
    const { fullName, email, password, classCode } = validation.value;

    const rateLimitError = await enforceRateLimit(sql, event);
    if (rateLimitError) return rateLimitError;
    const classItem = await findClass(sql, classCode);
    await recordAttempt(sql, event, Boolean(classItem));
    if (!classItem?.schoolId) {
      return json(400, { error: "A valid class invite code is required for student signup" });
    }

    const existing = await sql`select id from app_users where lower(email) = ${email} limit 1`;
    if (existing.length > 0) return json(409, { error: "Email already exists" });

    const passwordHash = await hashPassword(password);
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

    const session = await createAuthSession(sql, users[0].id, event);
    const { school_id: _internalSchoolId, ...signupUser } = publicUser(users[0]);
    return json(201, {
      user: signupUser,
      joinedClass: publicClassInviteRow(classItem),
    }, { "Set-Cookie": session.cookie });
  } catch (error) {
    console.error(error);
    if (error.code === "23505") return json(409, { error: "Email already exists" });
    const schemaError = schemaFailureResponse(error);
    if (schemaError) return schemaError;
    return serverError("Student signup failed. Check database setup and migrations.");
  }
  };
}

export const handler = createStudentSignupHandler();
