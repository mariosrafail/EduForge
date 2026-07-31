import bcrypt from "bcryptjs";
import { createSession, emailPattern, getSql, json, normalizeEmail, publicUser, serverError } from "./_auth-utils.js";
import {
  authLoginDummyPasswordHash,
  authLoginIdentifiers,
  authLoginRateLimitMessage,
  beginAuthLoginAttempt,
  completeAuthLoginAttempt,
} from "./_auth-login-rate-limit.js";
import {
  requireRuntimeSchema,
  schemaFailureResponse,
} from "./_runtime-schema-readiness.js";

function validate(payload) {
  const email = normalizeEmail(payload.email);
  const password = String(payload.password ?? "");

  if (!emailPattern.test(email)) return { error: "A valid email is required" };
  if (!password) return { error: "Password is required" };

  return { value: { email, password } };
}

function rateLimited(result) {
  return json(429, { error: authLoginRateLimitMessage }, { "Retry-After": String(result.retryAfter) });
}

export function createSigninHandler(dependencies = {}) {
  const comparePassword = dependencies.comparePassword || bcrypt.compare;
  const database = dependencies.getDatabase || getSql;
  const checkReadiness = dependencies.checkReadiness || requireRuntimeSchema;
  const beginAttempt = dependencies.beginAttempt || beginAuthLoginAttempt;
  const completeAttempt = dependencies.completeAttempt || completeAuthLoginAttempt;
  const createAuthSession = dependencies.createAuthSession || createSession;

  return async function signinHandler(event) {
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

      if (validation.error) {
        return json(400, { error: validation.error });
      }

      const sql = database();
      const readinessError = await checkReadiness(sql);
      if (readinessError) return readinessError;
      const { email, password } = validation.value;
      const identifiers = authLoginIdentifiers(event, email);
      const attempt = await beginAttempt(sql, identifiers);
      if (attempt.limited) return rateLimited(attempt);

      const users = await sql`
        select u.id, u.school_id, u.full_name, u.email, u.role, u.status, u.password_hash,
          coalesce(s.status, 'active') as school_status
        from app_users u
        join schools s on s.id = u.school_id
        where lower(u.email) = ${email}
        limit 1
      `;

      const user = users[0] || null;
      const validPassword = await comparePassword(password, user?.password_hash || authLoginDummyPasswordHash);
      if (!user || !validPassword) {
        const result = await completeAttempt(sql, {
          ...identifiers,
          attemptId: attempt.attemptId,
          userId: user?.id || null,
          outcome: "invalid_credentials",
        });
        if (result.limited) return rateLimited(result);
        return json(401, { error: "Invalid email or password" });
      }

      if (user.status !== "active" || user.school_status !== "active") {
        await completeAttempt(sql, {
          ...identifiers,
          attemptId: attempt.attemptId,
          userId: user.id,
          outcome: "inactive_account",
        });
        await sql`delete from auth_sessions where user_id = ${user.id}`;
        return json(403, { error: "This account is not active" });
      }

      await completeAttempt(sql, {
        ...identifiers,
        attemptId: attempt.attemptId,
        userId: user.id,
        outcome: "authenticated",
      });
      const updated = await sql`
        update app_users
        set last_login_at = now()
        where id = ${user.id}
        returning id, school_id, full_name, email, role, status
      `;

      const session = await createAuthSession(sql, user.id, event);

      return json(200, { user: publicUser(updated[0]) }, { "Set-Cookie": session.cookie });
    } catch (error) {
      console.error(error);
      const schemaError = schemaFailureResponse(error);
      if (schemaError) return schemaError;
      return serverError("Signin failed. Check database setup and migrations.");
    }
  };
}

export const handler = createSigninHandler();
