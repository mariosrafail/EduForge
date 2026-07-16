import { randomUUID } from "node:crypto";
import { getSql, isValidUuid, json, requireRole, safeServerError } from "./_auth-utils.js";
import { requestFingerprint } from "./_account-lifecycle-utils.js";
import { generateUniqueAccessCodes, generatedCodesCsv, hashAccessCode, normalizeAccessCode, publicBatch } from "./_licensing-utils.js";

function queryOf(event) {
  return event.queryStringParameters || Object.fromEntries(new URLSearchParams(event.rawQuery || ""));
}

function bodyOf(event) {
  try { return { value: JSON.parse(event.body || "{}") }; }
  catch { return { error: json(400, { error: "Request body must be valid JSON" }) }; }
}

function forbiddenIdentityFields(body = {}) {
  return ["schoolId", "school_id", "studentId", "student_id", "teacherId", "teacher_id", "createdBy", "created_by"].some((key) => body[key] !== undefined);
}

async function expireCodes(sql) {
  await sql`update activation_codes set status='expired',updated_at=now() where status='unused' and expires_at is not null and expires_at<=now()`;
}

async function auditFailure(sql, currentUser, eventType, failureCode, metadata = {}) {
  await sql`insert into book_license_audit_events(school_id,actor_user_id,event_type,succeeded,failure_code,metadata) values(${currentUser.school_id},${currentUser.id},${eventType},false,${failureCode},${JSON.stringify(metadata)}::jsonb)`;
}

async function overview(sql, currentUser) {
  await expireCodes(sql);
  const [packages, batches, metrics] = await Promise.all([
    sql`select id,title,slug,level from book_packages where status='active' order by title`,
    sql`
      select b.id,b.label,b.book_package_id,b.quantity,b.expires_at,b.created_at,b.initial_exported_at,
        bp.title as book_package_title,
        count(c.id) filter(where c.status='unused')::int unused_count,
        count(c.id) filter(where c.status='redeemed')::int redeemed_count,
        count(c.id) filter(where c.status='expired')::int expired_count,
        count(c.id) filter(where c.status='revoked')::int revoked_count
      from activation_code_batches b
      join book_packages bp on bp.id=b.book_package_id
      left join activation_codes c on c.batch_id=b.id
      where b.school_id=${currentUser.school_id}
      group by b.id,bp.title order by b.created_at desc
    `,
    sql`
      select
        (select count(*)::int from app_users where school_id=${currentUser.school_id} and role='teacher') teacher_count,
        (select count(*)::int from app_users where school_id=${currentUser.school_id} and role='student') student_count,
        (select count(*)::int from classes where school_id=${currentUser.school_id} and status='active') class_count,
        (select count(*)::int from book_access ba join app_users u on u.id=ba.user_id where u.school_id=${currentUser.school_id} and ba.role_scope='student') entitlement_count,
        (select count(*)::int from activity_assignments where school_id=${currentUser.school_id} and status='assigned') assignment_count,
        (select count(*)::int from activity_submissions where school_id=${currentUser.school_id}) submission_count
    `,
  ]);
  return json(200, {
    packages: packages.map((row) => ({ id: row.id, title: row.title, slug: row.slug, level: row.level })),
    batches: batches.map(publicBatch),
    metrics: {
      teachers: Number(metrics[0]?.teacher_count || 0), students: Number(metrics[0]?.student_count || 0),
      classes: Number(metrics[0]?.class_count || 0), entitlements: Number(metrics[0]?.entitlement_count || 0),
      assignments: Number(metrics[0]?.assignment_count || 0), submissions: Number(metrics[0]?.submission_count || 0),
    },
  });
}

async function batchDetails(sql, currentUser, batchId) {
  if (!isValidUuid(batchId)) return json(400, { error: "A valid batch ID is required" });
  await expireCodes(sql);
  const batchRows = await sql`
    select b.*,bp.title book_package_title,
      (select count(*)::int from activation_codes c where c.batch_id=b.id and c.status='unused') unused_count,
      (select count(*)::int from activation_codes c where c.batch_id=b.id and c.status='redeemed') redeemed_count,
      (select count(*)::int from activation_codes c where c.batch_id=b.id and c.status='expired') expired_count,
      (select count(*)::int from activation_codes c where c.batch_id=b.id and c.status='revoked') revoked_count
    from activation_code_batches b join book_packages bp on bp.id=b.book_package_id
    where b.id=${batchId} and b.school_id=${currentUser.school_id} limit 1
  `;
  if (!batchRows[0]) {
    await auditFailure(sql, currentUser, "batch_access_denied", "resource_not_found", { requested_batch_id: batchId });
    return json(404, { error: "Batch not found" });
  }
  const codes = await sql`
    select c.id,c.code_mask,c.status,c.created_at,c.expires_at,c.redeemed_at,c.revoked_at,c.revocation_reason,
      u.id redeemed_by_id,u.full_name redeemed_by_name,u.email redeemed_by_email
    from activation_codes c left join app_users u on u.id=c.redeemed_by
    where c.batch_id=${batchId} and c.school_id=${currentUser.school_id}
    order by c.created_at,c.id
  `;
  return json(200, {
    batch: publicBatch(batchRows[0]),
    codes: codes.map((row) => ({
      id: row.id, maskedCode: row.code_mask, status: row.status, createdAt: row.created_at,
      expiresAt: row.expires_at, redeemedAt: row.redeemed_at, revokedAt: row.revoked_at,
      revocationReason: row.revocation_reason || "",
      redeemedBy: row.redeemed_by_id ? { id: row.redeemed_by_id, name: row.redeemed_by_name, email: row.redeemed_by_email } : null,
    })),
  });
}

async function generateBatch(sql, currentUser, body) {
  if (forbiddenIdentityFields(body)) return json(400, { error: "School and creator are determined by the authenticated session" });
  const bookPackageId = String(body.bookPackageId || "");
  const requestKey = String(body.requestKey || "");
  const quantity = Number(body.quantity);
  const label = String(body.label || "").trim() || null;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (!isValidUuid(bookPackageId)) return json(400, { error: "A valid book package is required" });
  if (!isValidUuid(requestKey)) return json(400, { error: "A valid request key is required" });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) return json(400, { error: "Quantity must be between 1 and 500" });
  if (label && label.length > 120) return json(400, { error: "Batch label must be at most 120 characters" });
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) return json(400, { error: "Expiry must be in the future" });

  const packageRows = await sql`select id,title,slug from book_packages where id=${bookPackageId} and status='active' limit 1`;
  if (!packageRows[0]) return json(404, { error: "Book package not found" });
  const generated = generateUniqueAccessCodes(quantity, packageRows[0].slug || "BOOK");
  const batchId = randomUUID();
  const databaseCodes = generated.map(({ id, code_hash, code_mask }) => ({ id, code_hash, code_mask }));
  const rows = await sql`
    with batch as (
      insert into activation_code_batches(id,school_id,book_package_id,request_key,label,quantity,expires_at,created_by,initial_exported_at)
      values(${batchId},${currentUser.school_id},${bookPackageId},${requestKey},${label},${quantity},${expiresAt?.toISOString() || null},${currentUser.id},now())
      on conflict(school_id,request_key) do nothing returning *
    ), codes as (
      insert into activation_codes(id,code,code_hash,code_mask,batch_id,book_package_id,school_id,max_uses,used_count,status,expires_at,created_by)
      select item.id,null,item.code_hash,item.code_mask,b.id,b.book_package_id,b.school_id,1,0,'unused',b.expires_at,${currentUser.id}
      from batch b cross join jsonb_to_recordset(${JSON.stringify(databaseCodes)}::jsonb) as item(id uuid,code_hash text,code_mask text)
      returning id
    ), generated_event as (
      insert into book_license_audit_events(school_id,actor_user_id,batch_id,event_type,metadata)
      select school_id,${currentUser.id},id,'batch_generated',jsonb_build_object('quantity',quantity,'book_package_id',book_package_id) from batch
    ), export_event as (
      insert into book_license_audit_events(school_id,actor_user_id,batch_id,event_type,metadata)
      select school_id,${currentUser.id},id,'batch_initial_exported',jsonb_build_object('quantity',quantity) from batch
    ) select b.*,${packageRows[0].title}::text book_package_title,(select count(*)::int from codes) inserted_count from batch b
  `;
  if (!rows[0]) return json(409, { error: "This generation request was already processed; full codes cannot be exported again" });
  const rawCodes = generated.map((item) => item.code);
  return json(201, {
    batch: publicBatch({ ...rows[0], unused_count: rows[0].inserted_count }),
    codes: rawCodes,
    csv: generatedCodesCsv({ batchId, batchLabel: label, packageTitle: packageRows[0].title, expiresAt: expiresAt?.toISOString() || "", codes: rawCodes }),
    exportOnce: true,
  });
}

async function revokeUnused(sql, currentUser, body) {
  const batchId = String(body.batchId || "");
  const reason = String(body.reason || "Unused licenses revoked by school administrator").trim().slice(0, 500);
  if (!isValidUuid(batchId)) return json(400, { error: "A valid batch ID is required" });
  const rows = await sql`
    with target as (select id,school_id from activation_code_batches where id=${batchId} and school_id=${currentUser.school_id}),
    revoked as (update activation_codes set status='revoked',revoked_at=now(),revocation_reason=${reason},updated_at=now() where batch_id in(select id from target) and status='unused' returning id),
    audit as (insert into book_license_audit_events(school_id,actor_user_id,batch_id,event_type,metadata) select school_id,${currentUser.id},id,'batch_unused_revoked',jsonb_build_object('count',(select count(*) from revoked),'reason',${reason}::text) from target)
    select (select count(*)::int from target) target_count,(select count(*)::int from revoked) revoked_count
  `;
  if (!rows[0]?.target_count) {
    await auditFailure(sql, currentUser, "batch_revoke_denied", "resource_not_found", { requested_batch_id: batchId });
    return json(404, { error: "Batch not found" });
  }
  return json(200, { revokedCount: Number(rows[0].revoked_count || 0) });
}

async function resetCode(sql, currentUser, body) {
  const codeId = String(body.codeId || "");
  if (!isValidUuid(codeId)) return json(400, { error: "A valid code ID is required" });
  const rows = await sql`
    with target as (select id,school_id from activation_codes where id=${codeId} and school_id=${currentUser.school_id} and status='redeemed' for update),
    removed as (delete from book_access where activation_code_id in(select id from target) returning id),
    reset as (update activation_codes set status='unused',redeemed_at=null,redeemed_by=null,used_count=0,updated_at=now() where id in(select id from target) returning id,school_id),
    audit as (insert into book_license_audit_events(school_id,actor_user_id,code_id,event_type,metadata) select school_id,${currentUser.id},id,'code_reset',jsonb_build_object('entitlements_removed',(select count(*) from removed)) from reset)
    select (select count(*)::int from reset) reset_count
  `;
  if (!rows[0]?.reset_count) {
    await auditFailure(sql, currentUser, "code_reset_denied", "resource_not_found", { requested_code_id: codeId });
    return json(404, { error: "Redeemed code not found" });
  }
  return json(200, { reset: true });
}

async function redemptionLimited(sql, currentUser, fingerprint) {
  const rows = await sql`select count(*)::int count from book_code_redemption_attempts where attempted_at>now()-interval '15 minutes' and (user_id=${currentUser.id} or request_fingerprint=${fingerprint})`;
  return Number(rows[0]?.count || 0) >= 20;
}

async function redeem(sql, currentUser, event, body) {
  if (forbiddenIdentityFields(body)) return json(400, { error: "The student and school are determined by the authenticated session" });
  const normalized = normalizeAccessCode(body.code);
  const codeHash = hashAccessCode(normalized || "invalid");
  const fingerprint = requestFingerprint(event);
  if (await redemptionLimited(sql, currentUser, fingerprint)) {
    await sql`insert into book_code_redemption_attempts(school_id,user_id,request_fingerprint,code_hash,failure_code) values(${currentUser.school_id},${currentUser.id},${fingerprint},${codeHash},'rate_limited')`;
    await auditFailure(sql, currentUser, "code_redemption_failed", "rate_limited");
    return json(429, { error: "Too many activation attempts. Try again later." }, { "Retry-After": "900" });
  }
  if (normalized.length < 12 || normalized.length > 40) {
    await sql`insert into book_code_redemption_attempts(school_id,user_id,request_fingerprint,code_hash,failure_code) values(${currentUser.school_id},${currentUser.id},${fingerprint},${codeHash},'code_unavailable')`;
    return json(400, { error: "This code is invalid, unavailable, or expired" });
  }
  const rows = await sql`
    with expired as (update activation_codes set status='expired',updated_at=now() where status='unused' and expires_at is not null and expires_at<=now() returning id),
    candidate as (
      select c.id,c.book_package_id,c.school_id,bp.title package_title
      from activation_codes c join book_packages bp on bp.id=c.book_package_id
      where c.code_hash=${codeHash} and c.status='unused' and (c.expires_at is null or c.expires_at>now())
        and (c.school_id is null or c.school_id=${currentUser.school_id}) and (select count(*) from expired)>=0
      for update of c
    ), owned as (select ba.id from book_access ba join candidate c on c.book_package_id=ba.book_package_id where ba.user_id=${currentUser.id} and ba.role_scope='student'),
    entitlement as (
      insert into book_access(user_id,book_package_id,activation_code_id,role_scope)
      select ${currentUser.id},c.book_package_id,c.id,'student' from candidate c where not exists(select 1 from owned)
      on conflict(user_id,book_package_id,role_scope) do nothing returning activation_code_id
    ), redeemed as (
      update activation_codes c set status='redeemed',redeemed_at=now(),redeemed_by=${currentUser.id},used_count=1,updated_at=now()
      from entitlement e where c.id=e.activation_code_id returning c.id,c.book_package_id
    ), audit as (
      insert into book_license_audit_events(school_id,actor_user_id,code_id,event_type,metadata)
      select ${currentUser.school_id},${currentUser.id},r.id,'code_redeemed',jsonb_build_object('book_package_id',r.book_package_id) from redeemed r
    ) select (select count(*)::int from candidate) candidate_count,(select count(*)::int from owned) owned_count,
      r.id code_id,r.book_package_id,c.package_title from redeemed r join candidate c on c.id=r.id
  `;
  const result = rows[0];
  if (!result) {
    const owned = await sql`select 1 from activation_codes c join book_access ba on ba.book_package_id=c.book_package_id where c.code_hash=${codeHash} and ba.user_id=${currentUser.id} and ba.role_scope='student' limit 1`;
    const failureCode = owned[0] ? "book_already_owned" : "code_unavailable";
    await sql`insert into book_code_redemption_attempts(school_id,user_id,request_fingerprint,code_hash,failure_code) values(${currentUser.school_id},${currentUser.id},${fingerprint},${codeHash},${failureCode})`;
    await auditFailure(sql, currentUser, "code_redemption_failed", failureCode);
    return owned[0] ? json(409, { error: "This book is already active on your account" }) : json(400, { error: "This code is invalid, unavailable, or expired" });
  }
  await sql`insert into book_code_redemption_attempts(school_id,user_id,request_fingerprint,code_hash,succeeded) values(${currentUser.school_id},${currentUser.id},${fingerprint},${codeHash},true)`;
  return json(200, { activated: true, bookPackage: { id: result.book_package_id, title: result.package_title } });
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { error: "Method not allowed" });
  try {
    const sql = getSql();
    const query = queryOf(event);
    if (event.httpMethod === "GET") {
      const auth = await requireRole(event, "admin", sql);
      if (auth.error) {
        if (auth.currentUser) await auditFailure(sql, auth.currentUser, "licensing_access_denied", "role_forbidden");
        return auth.error;
      }
      if (query.action === "overview") return overview(sql, auth.currentUser);
      if (query.action === "batch") return batchDetails(sql, auth.currentUser, query.batchId);
      return json(400, { error: "Unknown licensing action" });
    }
    const parsed = bodyOf(event); if (parsed.error) return parsed.error;
    if (query.action === "redeem") {
      const auth = await requireRole(event, "student", sql);
      if (auth.error) {
        if (auth.currentUser) await auditFailure(sql, auth.currentUser, "licensing_access_denied", "role_forbidden");
        return auth.error;
      }
      return redeem(sql, auth.currentUser, event, parsed.value);
    }
    const auth = await requireRole(event, "admin", sql);
    if (auth.error) {
      if (auth.currentUser) await auditFailure(sql, auth.currentUser, "licensing_access_denied", "role_forbidden");
      return auth.error;
    }
    if (query.action === "generate-batch") return generateBatch(sql, auth.currentUser, parsed.value);
    if (query.action === "revoke-unused") return revokeUnused(sql, auth.currentUser, parsed.value);
    if (query.action === "reset-code") return resetCode(sql, auth.currentUser, parsed.value);
    return json(400, { error: "Unknown licensing action" });
  } catch (error) {
    return safeServerError(error, "Book licensing request failed");
  }
}
