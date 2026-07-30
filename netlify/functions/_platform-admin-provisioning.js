import { randomUUID } from "node:crypto";
import { emailPattern, hashToken, json, normalizeEmail } from "./_auth-utils.js";
import {
  createAccountToken,
  initialPasswordLifetimeMinutes,
  tokenExpiry,
} from "./_account-lifecycle-utils.js";
import {
  deliverAccountEmail,
  markEmailDelivery,
  recordDeliveryFailureEvent,
} from "./_email-utils.js";
import { safeAuditMetadata } from "./_platform-admin-auth.js";

function cleanColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function validateProvisioning(body) {
  const name = String(body.name || "").trim();
  const fullName = String(body.admin_full_name ?? body.adminFullName ?? "").trim();
  const email = normalizeEmail(body.admin_email ?? body.adminEmail);

  if (name.length < 2 || name.length > 160) {
    return { error: json(400, { error: "School name must be 2-160 characters" }) };
  }
  if (fullName.length < 2 || fullName.length > 160) {
    return { error: json(400, { error: "Administrator name must be 2-160 characters" }) };
  }
  if (!emailPattern.test(email)) {
    return { error: json(400, { error: "A valid administrator email is required" }) };
  }

  return {
    value: {
      name,
      logo: String(body.logo || "").trim().slice(0, 240) || null,
      primaryColor: cleanColor(body.primary_color, "#f97316"),
      secondaryColor: cleanColor(body.secondary_color, "#101828"),
      fullName,
      email,
    },
  };
}

async function withProvisioningTransaction(sql, email, callback) {
  if (typeof sql.schoolProvisioningTransaction === "function") {
    return sql.schoolProvisioningTransaction(email, callback);
  }
  if (typeof sql.transaction === "function") {
    const results = await sql.transaction((transactionSql) => [
      transactionSql`select pg_advisory_xact_lock(hashtextextended(${"school-provisioning:" + email}, 0))`,
      callback(transactionSql),
    ]);
    return results[1];
  }
  throw new Error("School provisioning requires transaction-capable PostgreSQL");
}

function publicSchool(school) {
  return {
    id: school.id,
    name: school.name,
    logo: school.logo,
    primary_color: school.primary_color,
    secondary_color: school.secondary_color,
    status: school.status,
    created_at: school.created_at,
  };
}

function publicAdmin(user) {
  return {
    id: user.id,
    school_id: user.school_id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    level: user.level || null,
    status: user.status,
    created_at: user.created_at,
  };
}

export async function provisionSchool(sql, platformAdmin, body) {
  const validation = validateProvisioning(body);
  if (validation.error) return validation.error;
  const input = validation.value;
  const rawToken = createAccountToken();
  const tokenHash = hashToken(rawToken);
  const tokenId = randomUUID();
  const outboxId = randomUUID();
  const expiresAt = tokenExpiry(initialPasswordLifetimeMinutes);
  const pendingMetadata = safeAuditMetadata({
    initial_admin_role: "admin",
    initial_admin_status: "invited",
    delivery_state: "pending",
    provisioning_source: "platform_admin",
  });

  const rows = await withProvisioningTransaction(sql, input.email, (transactionSql) => transactionSql`
      with candidate as materialized (
        select not exists(
          select 1 from app_users where lower(email) = ${input.email}
        ) available
      ), school as (
        insert into schools(name,logo,primary_color,secondary_color,status)
        select ${input.name},${input.logo},${input.primaryColor},${input.secondaryColor},'active'
        from candidate where available
        returning id,name,logo,primary_color,secondary_color,status,created_at
      ), ordinary_user as (
        insert into app_users(
          school_id,full_name,email,role,level,status,password_hash,auth_provider,invited_at
        )
        select id,${input.fullName},${input.email},'admin','Operations','invited',null,'password',now()
        from school
        returning id,school_id,full_name,email,role,level,status,password_hash,auth_provider,created_at
      ), account_token as (
        insert into account_tokens(id,user_id,purpose,token_hash,expires_at,delivery_reference)
        select ${tokenId},id,'initial_password',${tokenHash},${expiresAt},${outboxId} from ordinary_user
        returning id
      ), outbox as (
        insert into account_email_outbox(
          id,user_id,recipient_email,template_type,template_variables
        )
        select ${outboxId},id,email,'account_invitation',jsonb_build_object('name',full_name)
        from ordinary_user
        returning id
      ), security_event as (
        insert into account_security_events(user_id,school_id,event_type,metadata)
        select id,school_id,'invitation_issued',jsonb_build_object('source','platform_admin')
        from ordinary_user
      ), audit as (
        insert into platform_admin_audit_log(
          platform_admin_id,action,target_type,target_id,target_school_id,metadata
        )
        select ${platformAdmin.id},'school_provisioned','school',school.id::text,school.id,
          ${JSON.stringify(pendingMetadata)}::jsonb
        from school
        cross join (select count(*) from ordinary_user) user_created
        cross join (select count(*) from account_token) token_created
        cross join (select count(*) from outbox) outbox_created
        returning id
      )
      select
        row_to_json(school) school,
        row_to_json(ordinary_user) administrator,
        (select id from audit) audit_id
      from school cross join ordinary_user
    `);
  const created = rows[0] || null;

  if (!created) {
    return json(409, { error: "An account with this email already exists" });
  }

  let delivery;
  try {
    delivery = await deliverAccountEmail({
      recipient: input.email,
      templateType: "account_invitation",
      rawToken,
      outboxId,
      name: input.fullName,
    });
  } catch {
    delivery = { state: "failed", errorCode: "email_configuration_error" };
  }
  await markEmailDelivery(sql, outboxId, delivery);
  if (delivery.state === "failed") {
    await recordDeliveryFailureEvent(sql, {
      userId: created.administrator.id,
      schoolId: created.school.id,
      templateType: "account_invitation",
    });
  }
  const completedMetadata = safeAuditMetadata({
    initial_admin_role: "admin",
    initial_admin_status: "invited",
    delivery_state: delivery.state,
    provisioning_source: "platform_admin",
  });
  await sql`
    update platform_admin_audit_log
    set metadata=${JSON.stringify(completedMetadata)}::jsonb
    where id=${created.audit_id} and platform_admin_id=${platformAdmin.id}
  `;

  return json(201, {
    school: publicSchool(created.school),
    administrator: publicAdmin(created.administrator),
    delivery_status: delivery.state,
    ...(delivery.previewUrl ? { preview_url: delivery.previewUrl } : {}),
  });
}
