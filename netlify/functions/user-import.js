import { randomUUID } from "node:crypto";
import {
  getSql,
  hashToken,
  json,
  requireRole,
  requireSameOrigin,
  safeServerError,
} from "./_auth-utils.js";
import {
  createAccountToken,
  initialPasswordLifetimeMinutes,
  lifecycleUser,
  requestFingerprint,
  tokenExpiry,
} from "./_account-lifecycle-utils.js";
import { deliverAccountEmail, markEmailDelivery, recordDeliveryFailureEvent } from "./_email-utils.js";
import { USER_IMPORT_LIMITS, validateUserImportRows } from "../../shared/userImport.js";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const acceptedRowFields = new Set(["rowNumber", "fullName", "full_name", "email", "role", "level"]);

function respond(statusCode, body) {
  return json(statusCode, body, privateHeaders);
}

function privateResponse(response) {
  return { ...response, headers: { ...(response.headers || {}), ...privateHeaders } };
}

function requestedAction(event) {
  const parameters = event.queryStringParameters || {};
  const keys = Object.keys(parameters);
  if (keys.length !== 1 || keys[0] !== "action" || !["preview", "commit"].includes(parameters.action)) return "";
  return parameters.action;
}

function parseRows(event) {
  if (Buffer.byteLength(event.body || "", "utf8") > USER_IMPORT_LIMITS.bodyBytes) {
    return { response: respond(413, { error: "User import request must be 512 KiB or smaller" }) };
  }
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { response: respond(400, { error: "Request body must be valid JSON" }) };
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "rows")) {
    return { response: respond(400, { error: "Only user import rows are accepted" }) };
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return { response: respond(400, { error: "At least one user row is required" }) };
  }
  if (body.rows.length > USER_IMPORT_LIMITS.rows) {
    return { response: respond(413, { error: "User import cannot contain more than 200 rows" }) };
  }
  for (const row of body.rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { response: respond(400, { error: "Each user import row must be an object" }) };
    }
    if (Object.keys(row).some((key) => !acceptedRowFields.has(key)) || ("fullName" in row && "full_name" in row)) {
      return { response: respond(400, { error: "User import rows contain unsupported control fields" }) };
    }
  }
  return { rows: body.rows };
}

async function validateAgainstDatabase(sql, rows) {
  const local = validateUserImportRows(rows);
  const emails = [...new Set(local.rows.map((row) => row.email).filter(Boolean))];
  const existingRows = emails.length
    ? await sql`select lower(email) as email from app_users where lower(email) = any(${emails}::text[])`
    : [];
  return validateUserImportRows(rows, existingRows.map((row) => row.email));
}

function safeConflictPreview(validation) {
  return {
    error: "No accounts were imported. Correct the reported issue and try again.",
    ...validation,
  };
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function createBatch(sql, auth, validation, event) {
  const fingerprint = requestFingerprint(event);
  const prepared = validation.rows.map((row) => {
    const rawToken = createAccountToken();
    return {
      userId: randomUUID(),
      tokenId: randomUUID(),
      outboxId: randomUUID(),
      rawToken,
      tokenHash: hashToken(rawToken),
      expiresAt: tokenExpiry(initialPasswordLifetimeMinutes),
      fullName: row.fullName,
      email: row.email,
      role: row.role,
      level: row.level,
    };
  });
  const databaseInput = prepared.map(({ rawToken, ...row }) => row);
  const teacherCount = prepared.filter((row) => row.role === "teacher").length;
  const studentCount = prepared.length - teacherCount;

  const created = await sql`
    with input as (
      select *
      from jsonb_to_recordset(${JSON.stringify(databaseInput)}::jsonb) as row(
        "userId" uuid,
        "tokenId" uuid,
        "outboxId" uuid,
        "tokenHash" text,
        "expiresAt" timestamptz,
        "fullName" text,
        email text,
        role text,
        level text
      )
    ), created as (
      insert into app_users(
        id, school_id, full_name, email, role, level, status, auth_provider,
        password_hash, invited_at, invited_by
      )
      select "userId", ${auth.currentUser.school_id}, "fullName", email, role, level,
        'invited', 'password', null, now(), ${auth.currentUser.id}
      from input
      returning id, full_name, email, role, level, status
    ), tokens as (
      insert into account_tokens(id, user_id, purpose, token_hash, expires_at, created_by, delivery_reference)
      select input."tokenId", created.id, 'initial_password', input."tokenHash",
        input."expiresAt", ${auth.currentUser.id}, input."outboxId"
      from created join input on input."userId" = created.id
      returning user_id
    ), outboxes as (
      insert into account_email_outbox(
        id, user_id, created_by, recipient_email, template_type, template_variables
      )
      select input."outboxId", created.id, ${auth.currentUser.id}, created.email,
        'account_invitation', jsonb_build_object('name', created.full_name::text)
      from created join input on input."userId" = created.id
      returning id as outbox_id, user_id
    ), invitation_events as (
      insert into account_security_events(
        user_id, actor_user_id, school_id, event_type, request_fingerprint
      )
      select created.id, ${auth.currentUser.id}, ${auth.currentUser.school_id},
        'invitation_issued', ${fingerprint}
      from created
      returning user_id
    ), batch_event as (
      insert into account_security_events(
        user_id, actor_user_id, school_id, event_type, request_fingerprint, metadata
      )
      values (
        ${auth.currentUser.id}, ${auth.currentUser.id}, ${auth.currentUser.school_id},
        'user_csv_import_completed', ${fingerprint},
        jsonb_build_object(
          'requested_row_count', ${prepared.length}::int,
          'created_row_count', ${prepared.length}::int,
          'teacher_count', ${teacherCount}::int,
          'student_count', ${studentCount}::int
        )
      )
      returning id
    )
    select created.*, outboxes.outbox_id
    from created
    join tokens on tokens.user_id = created.id
    join outboxes on outboxes.user_id = created.id
    join invitation_events on invitation_events.user_id = created.id
    cross join batch_event
  `;
  if (created.length !== prepared.length) throw new Error("User import batch was not created completely");
  return { prepared, created, fingerprint };
}

async function deliverBatch(sql, auth, batch) {
  const secretByUser = new Map(batch.prepared.map((row) => [row.userId, row.rawToken]));
  return mapConcurrent(batch.created, 4, async (user) => {
    let delivery;
    try {
      delivery = await deliverAccountEmail({
        recipient: user.email,
        templateType: "account_invitation",
        rawToken: secretByUser.get(user.id),
        outboxId: user.outbox_id,
        name: user.full_name,
      });
    } catch {
      delivery = { state: "failed", errorCode: "email_configuration_error" };
    }
    await markEmailDelivery(sql, user.outbox_id, delivery);
    if (delivery.state === "failed") {
      await recordDeliveryFailureEvent(sql, {
        userId: user.id,
        actorUserId: auth.currentUser.id,
        schoolId: auth.currentUser.school_id,
        fingerprint: batch.fingerprint,
        templateType: "account_invitation",
      });
    }
    return { ...lifecycleUser(user), delivery_status: delivery.state };
  });
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json", ...privateHeaders }, body: "" };
  if (event.httpMethod !== "POST") return respond(405, { error: "Method not allowed" });
  const action = requestedAction(event);
  if (!action) return respond(400, { error: "Action must be preview or commit" });

  try {
    const sql = getSql();
    const auth = await requireRole(event, "admin", sql);
    if (auth.error) return privateResponse(auth.error);
    const originError = requireSameOrigin(event);
    if (originError) return privateResponse(originError);
    if (action === "commit" && String(process.env.ACCOUNT_INVITATIONS_ENABLED || "true").toLowerCase() === "false") {
      return respond(503, { error: "Account invitations are temporarily unavailable" });
    }
    const parsed = parseRows(event);
    if (parsed.response) return parsed.response;
    const validation = await validateAgainstDatabase(sql, parsed.rows);
    if (action === "preview") return respond(200, validation);
    if (!validation.canImport) {
      return respond(validation.summary.existingAccounts ? 409 : 400, safeConflictPreview(validation));
    }

    let batch;
    try {
      batch = await createBatch(sql, auth, validation, event);
    } catch (error) {
      if (error?.code === "23505") {
        return respond(409, { error: "No accounts were imported. An account with one of these emails already exists." });
      }
      throw error;
    }
    const users = await deliverBatch(sql, auth, batch);
    const failedDelivery = users.filter((user) => user.delivery_status === "failed").length;
    return respond(201, {
      summary: {
        created: users.length,
        delivered: users.length - failedDelivery,
        failedDelivery,
      },
      users,
    });
  } catch (error) {
    return privateResponse(safeServerError(error, "User import failed"));
  }
}
