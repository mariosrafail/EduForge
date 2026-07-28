import { randomUUID } from "node:crypto";
import {
  allowedRoles,
  allowedStatuses,
  emailPattern,
  getSql,
  hashToken,
  isValidUuid,
  json,
  normalizeEmail,
  safeServerError,
} from "./_auth-utils.js";
import {
  createAccountToken,
  initialPasswordLifetimeMinutes,
  tokenExpiry,
} from "./_account-lifecycle-utils.js";
import { deliverAccountEmail, markEmailDelivery } from "./_email-utils.js";
import {
  parsePlatformAdminBody,
  requirePlatformAdmin,
  requirePlatformAdminOrigin,
  writePlatformAdminAudit,
} from "./_platform-admin-auth.js";

const phaseOneSlugs = ["ultimate-b1", "ultimate-b1-plus", "ultimate-b2"];
const maximumPageSize = 100;

function query(event) {
  return event.queryStringParameters || Object.fromEntries(new URLSearchParams(event.rawQuery || ""));
}

function pagination(params) {
  const page = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const pageSize = Math.min(maximumPageSize, Math.max(1, Number.parseInt(params.pageSize || "25", 10) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function requiredUuid(value, name) {
  if (!isValidUuid(value)) return json(400, { error: `${name} must be a valid UUID` });
  return null;
}

function publicOrdinaryUser(user) {
  return {
    id: user.id,
    school_id: user.school_id,
    school_name: user.school_name,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    level: user.level || null,
    status: user.status,
    created_at: user.created_at,
  };
}

async function overview(sql) {
  const [schools, users, classes, packages, assignments, reviews] = await Promise.all([
    sql`select count(*)::int total,count(*) filter(where status='active')::int active,count(*) filter(where status='paused')::int paused from schools`,
    sql`select count(*)::int total,count(*) filter(where role='admin')::int admins,count(*) filter(where role='teacher')::int teachers,count(*) filter(where role='student')::int students from app_users`,
    sql`select count(*)::int count from classes`,
    sql`select count(*)::int count from book_packages where status='active' and slug=any(${phaseOneSlugs}::text[])`,
    sql`select count(*)::int count from activity_assignments where status='assigned'`,
    sql`select count(*)::int count from activity_submissions where status='awaiting_review'`,
  ]);
  return json(200, {
    overview: {
      schools: Number(schools[0]?.total || 0),
      activeSchools: Number(schools[0]?.active || 0),
      pausedSchools: Number(schools[0]?.paused || 0),
      schoolAdmins: Number(users[0]?.admins || 0),
      teachers: Number(users[0]?.teachers || 0),
      students: Number(users[0]?.students || 0),
      users: Number(users[0]?.total || 0),
      classes: Number(classes[0]?.count || 0),
      activePhaseOnePackages: Number(packages[0]?.count || 0),
      activeAssignments: Number(assignments[0]?.count || 0),
      awaitingReview: Number(reviews[0]?.count || 0),
    },
  });
}

async function listSchools(sql, params) {
  const { page, pageSize, offset } = pagination(params);
  const search = String(params.search || "").trim();
  const rows = await sql`
    select s.id,s.name,s.logo,s.primary_color,s.secondary_color,s.status,s.created_at,
      count(u.id) filter(where u.role='admin')::int admin_count,
      count(u.id) filter(where u.role='teacher')::int teacher_count,
      count(u.id) filter(where u.role='student')::int student_count,
      (select count(*)::int from classes c where c.school_id=s.id) class_count,
      count(*) over()::int total_count
    from schools s left join app_users u on u.school_id=s.id
    where (${search}='' or s.name ilike ${`%${search}%`})
    group by s.id
    order by s.created_at desc,s.id
    limit ${pageSize} offset ${offset}
  `;
  return json(200, { schools: rows.map(({ total_count, ...row }) => row), page, pageSize, total: Number(rows[0]?.total_count || 0) });
}

async function schoolDetail(sql, params) {
  const idError = requiredUuid(params.id, "id");
  if (idError) return idError;
  const rows = await sql`
    select s.id,s.name,s.logo,s.primary_color,s.secondary_color,s.status,s.created_at,
      count(u.id) filter(where u.role='admin')::int admin_count,
      count(u.id) filter(where u.role='teacher')::int teacher_count,
      count(u.id) filter(where u.role='student')::int student_count,
      (select count(*)::int from classes c where c.school_id=s.id) class_count
    from schools s left join app_users u on u.school_id=s.id
    where s.id=${params.id} group by s.id
  `;
  return rows[0] ? json(200, { school: rows[0] }) : json(404, { error: "School not found" });
}

async function listUsers(sql, params) {
  const { page, pageSize, offset } = pagination(params);
  const schoolId = isValidUuid(params.schoolId) ? params.schoolId : null;
  if (params.schoolId && !schoolId) return json(400, { error: "schoolId must be a valid UUID" });
  const role = String(params.role || "");
  const status = String(params.status || "");
  const search = String(params.search || "").trim();
  if (role && !allowedRoles.has(role)) return json(400, { error: "Invalid role filter" });
  if (status && !allowedStatuses.has(status)) return json(400, { error: "Invalid status filter" });
  const rows = await sql`
    select u.id,u.school_id,s.name school_name,u.full_name,u.email,u.role,u.level,u.status,u.created_at,
      count(*) over()::int total_count
    from app_users u join schools s on s.id=u.school_id
    where (${schoolId}::uuid is null or u.school_id=${schoolId})
      and (${role}='' or u.role=${role})
      and (${status}='' or u.status=${status})
      and (${search}='' or u.full_name ilike ${`%${search}%`} or u.email ilike ${`%${search}%`})
    order by u.created_at desc,u.id
    limit ${pageSize} offset ${offset}
  `;
  return json(200, { users: rows.map(publicOrdinaryUser), page, pageSize, total: Number(rows[0]?.total_count || 0) });
}

async function userDetail(sql, params) {
  const idError = requiredUuid(params.id, "id");
  if (idError) return idError;
  const rows = await sql`
    select u.id,u.school_id,s.name school_name,u.full_name,u.email,u.role,u.level,u.status,u.created_at
    from app_users u join schools s on s.id=u.school_id where u.id=${params.id}
  `;
  return rows[0] ? json(200, { user: publicOrdinaryUser(rows[0]) }) : json(404, { error: "User not found" });
}

async function listClasses(sql, params) {
  const { page, pageSize, offset } = pagination(params);
  const schoolId = isValidUuid(params.schoolId) ? params.schoolId : null;
  if (params.schoolId && !schoolId) return json(400, { error: "schoolId must be a valid UUID" });
  const rows = await sql`
    select c.id,c.school_id,s.name school_name,c.name,c.level,c.status,
      teacher.full_name teacher_name,teacher.id teacher_id,
      count(cs.id) filter(where cs.status='active')::int active_student_count,
      (select count(*)::int from activity_assignments aa where aa.class_id=c.id) assignment_count,
      count(*) over()::int total_count
    from classes c join schools s on s.id=c.school_id
    left join app_users teacher on teacher.id=c.teacher_id
    left join class_students cs on cs.class_id=c.id
    where (${schoolId}::uuid is null or c.school_id=${schoolId})
    group by c.id,s.name,teacher.id
    order by s.name,c.name
    limit ${pageSize} offset ${offset}
  `;
  return json(200, { classes: rows.map(({ total_count, ...row }) => row), page, pageSize, total: Number(rows[0]?.total_count || 0) });
}

async function listAccess(sql, params) {
  const { page, pageSize, offset } = pagination(params);
  const schoolId = isValidUuid(params.schoolId) ? params.schoolId : null;
  const userId = isValidUuid(params.userId) ? params.userId : null;
  if (params.schoolId && !schoolId) return json(400, { error: "schoolId must be a valid UUID" });
  if (params.userId && !userId) return json(400, { error: "userId must be a valid UUID" });
  const slug = String(params.package || "");
  if (slug && !phaseOneSlugs.includes(slug)) return json(400, { error: "Unsupported package filter" });
  const rows = await sql`
    select ba.id,ba.user_id,u.full_name,u.email,u.role,u.school_id,s.name school_name,
      bp.id book_package_id,bp.slug package_slug,bp.title package_title,ba.role_scope,ba.granted_at,
      count(*) over()::int total_count
    from book_access ba
    join app_users u on u.id=ba.user_id join schools s on s.id=u.school_id
    join book_packages bp on bp.id=ba.book_package_id
    where bp.status='active' and bp.slug=any(${phaseOneSlugs}::text[])
      and (${schoolId}::uuid is null or u.school_id=${schoolId})
      and (${userId}::uuid is null or u.id=${userId})
      and (${slug}='' or bp.slug=${slug})
    order by s.name,u.full_name,bp.slug
    limit ${pageSize} offset ${offset}
  `;
  const packages = await sql`select id,slug,title,level from book_packages where status='active' and slug=any(${phaseOneSlugs}::text[]) order by case slug when 'ultimate-b1' then 1 when 'ultimate-b1-plus' then 2 else 3 end`;
  return json(200, { access: rows.map(({ total_count, ...row }) => row), packages, page, pageSize, total: Number(rows[0]?.total_count || 0) });
}

async function listAudit(sql, params) {
  const { page, pageSize, offset } = pagination(params);
  const adminId = isValidUuid(params.platformAdminId) ? params.platformAdminId : null;
  const schoolId = isValidUuid(params.schoolId) ? params.schoolId : null;
  if (params.platformAdminId && !adminId) return json(400, { error: "platformAdminId must be a valid UUID" });
  if (params.schoolId && !schoolId) return json(400, { error: "schoolId must be a valid UUID" });
  const action = String(params.auditAction || "");
  const targetType = String(params.targetType || "");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from || "") ? params.from : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to || "") ? params.to : null;
  const rows = await sql`
    select l.id,l.platform_admin_id,a.full_name platform_admin_name,l.action,l.target_type,l.target_id,
      l.target_school_id,s.name school_name,l.metadata,l.created_at,count(*) over()::int total_count
    from platform_admin_audit_log l
    left join platform_admins a on a.id=l.platform_admin_id left join schools s on s.id=l.target_school_id
    where (${adminId}::uuid is null or l.platform_admin_id=${adminId})
      and (${schoolId}::uuid is null or l.target_school_id=${schoolId})
      and (${action}='' or l.action=${action})
      and (${targetType}='' or l.target_type=${targetType})
      and (${from}::date is null or l.created_at>=${from}::date)
      and (${to}::date is null or l.created_at<${to}::date+interval '1 day')
    order by l.created_at desc
    limit ${pageSize} offset ${offset}
  `;
  const admins = await sql`select id,full_name from platform_admins order by full_name`;
  return json(200, { audit: rows.map(({ total_count, ...row }) => row), platformAdmins: admins, page, pageSize, total: Number(rows[0]?.total_count || 0) });
}

function cleanColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

async function createSchool(sql, admin, body) {
  const name = String(body.name || "").trim();
  if (name.length < 2 || name.length > 160) return json(400, { error: "School name must be 2-160 characters" });
  const logo = String(body.logo || "").trim().slice(0, 240) || null;
  const primary = cleanColor(body.primary_color, "#1d4ed8");
  const secondary = cleanColor(body.secondary_color, "#0f172a");
  const rows = await sql`
    with created as (
      insert into schools(name,logo,primary_color,secondary_color,status)
      values(${name},${logo},${primary},${secondary},'active')
      returning *
    ), audit as (
      insert into platform_admin_audit_log(platform_admin_id,action,target_type,target_id,target_school_id,metadata)
      select ${admin.id},'school_created','school',id::text,id,jsonb_build_object('name',name) from created
    ) select * from created
  `;
  return json(201, { school: rows[0] });
}

async function updateSchool(sql, admin, body) {
  const idError = requiredUuid(body.id, "id");
  if (idError) return idError;
  const current = (await sql`select * from schools where id=${body.id}`)[0];
  if (!current) return json(404, { error: "School not found" });
  const name = body.name === undefined ? current.name : String(body.name).trim();
  if (name.length < 2 || name.length > 160) return json(400, { error: "School name must be 2-160 characters" });
  const logo = body.logo === undefined ? current.logo : String(body.logo || "").trim().slice(0, 240) || null;
  const primary = body.primary_color === undefined ? current.primary_color : cleanColor(body.primary_color, current.primary_color);
  const secondary = body.secondary_color === undefined ? current.secondary_color : cleanColor(body.secondary_color, current.secondary_color);
  const rows = await sql`
    with changed as (
      update schools set name=${name},logo=${logo},primary_color=${primary},secondary_color=${secondary}
      where id=${body.id} returning *
    ), audit as (
      insert into platform_admin_audit_log(platform_admin_id,action,target_type,target_id,target_school_id,metadata)
      select ${admin.id},'school_updated','school',id::text,id,jsonb_build_object('name',name) from changed
    ) select * from changed
  `;
  return json(200, { school: rows[0] });
}

async function setSchoolStatus(sql, admin, body) {
  const idError = requiredUuid(body.id, "id");
  if (idError) return idError;
  const status = String(body.status || "");
  if (!["active", "paused"].includes(status)) return json(400, { error: "status must be active or paused" });
  const rows = await sql`
    with changed as (
      update schools set status=${status} where id=${body.id} and status<>${status}
      returning id,name,status
    ), sessions as (
      delete from auth_sessions using app_users u
      where ${status}='paused' and auth_sessions.user_id=u.id and u.school_id in(select id from changed)
      returning auth_sessions.id
    ), audit as (
      insert into platform_admin_audit_log(platform_admin_id,action,target_type,target_id,target_school_id,metadata)
      select ${admin.id},case when status='paused' then 'school_paused' else 'school_reactivated' end,
        'school',id::text,id,jsonb_build_object('ordinary_sessions_revoked',(select count(*) from sessions))
      from changed
    ) select *, (select count(*)::int from sessions) sessions_revoked from changed
  `;
  if (!rows[0]) {
    const existing = (await sql`select id,name,status from schools where id=${body.id}`)[0];
    return existing ? json(200, { school: existing, sessions_revoked: 0 }) : json(404, { error: "School not found" });
  }
  return json(200, { school: rows[0], sessions_revoked: Number(rows[0].sessions_revoked || 0) });
}

async function createUser(sql, admin, body) {
  const schoolError = requiredUuid(body.school_id, "school_id");
  if (schoolError) return schoolError;
  const fullName = String(body.full_name || "").trim();
  const email = normalizeEmail(body.email);
  const role = String(body.role || "").trim().toLowerCase();
  const level = String(body.level || "").trim() || null;
  if (fullName.length < 2 || !emailPattern.test(email)) return json(400, { error: "A valid full name and email are required" });
  if (!allowedRoles.has(role)) return json(400, { error: "role must be admin, teacher or student" });
  const school = (await sql`select id,status from schools where id=${body.school_id}`)[0];
  if (!school) return json(404, { error: "School not found" });
  const rawToken = createAccountToken();
  const tokenId = randomUUID();
  const outboxId = randomUUID();
  const rows = await sql`
    with created as (
      insert into app_users(school_id,full_name,email,role,level,status,auth_provider,invited_at)
      values(${body.school_id},${fullName},${email},${role},${level},'invited','password',now())
      on conflict((lower(email))) where email is not null and email<>'' do nothing
      returning id,school_id,full_name,email,role,level,status,created_at
    ), token as (
      insert into account_tokens(id,user_id,purpose,token_hash,expires_at)
      select ${tokenId},id,'initial_password',${hashToken(rawToken)},${tokenExpiry(initialPasswordLifetimeMinutes)} from created
    ), outbox as (
      insert into account_email_outbox(id,user_id,recipient_email,template_type,template_variables)
      select ${outboxId},id,email,'account_invitation',jsonb_build_object('name',full_name) from created
    ), audit as (
      insert into platform_admin_audit_log(platform_admin_id,action,target_type,target_id,target_school_id,metadata)
      select ${admin.id},'ordinary_user_invited','ordinary_user',id::text,school_id,
        jsonb_build_object('role',role,'delivery','pending') from created
    ) select * from created
  `;
  if (!rows[0]) return json(409, { error: "An account with this email already exists" });
  let delivery;
  try {
    delivery = await deliverAccountEmail({ recipient: email, templateType: "account_invitation", rawToken, outboxId, name: fullName });
  } catch {
    delivery = { state: "failed", errorCode: "email_configuration_error" };
  }
  await markEmailDelivery(sql, outboxId, delivery);
  return json(201, { user: publicOrdinaryUser({ ...rows[0], school_name: null }), delivery_status: delivery.state, ...(delivery.previewUrl ? { preview_url: delivery.previewUrl } : {}) });
}

async function setUserStatus(sql, admin, body) {
  const idError = requiredUuid(body.id, "id");
  if (idError) return idError;
  const status = String(body.status || "");
  if (!allowedStatuses.has(status)) return json(400, { error: "Invalid user status" });
  const rows = await sql`
    with changed as (
      update app_users set status=${status},updated_at=now() where id=${body.id} and status<>${status}
      returning id,school_id,full_name,email,role,level,status,created_at
    ), sessions as (
      delete from auth_sessions where user_id in(select id from changed) returning id
    ), audit as (
      insert into platform_admin_audit_log(platform_admin_id,action,target_type,target_id,target_school_id,metadata)
      select ${admin.id},case when status='paused' then 'ordinary_user_paused' when status='active' then 'ordinary_user_reactivated' else 'ordinary_user_invited' end,
        'ordinary_user',id::text,school_id,jsonb_build_object('role',role,'ordinary_sessions_revoked',(select count(*) from sessions))
      from changed
    ) select *,(select count(*)::int from sessions) sessions_revoked from changed
  `;
  if (!rows[0]) {
    const existing = (await sql`select id,school_id,full_name,email,role,level,status,created_at from app_users where id=${body.id}`)[0];
    return existing ? json(200, { user: publicOrdinaryUser(existing), sessions_revoked: 0 }) : json(404, { error: "User not found" });
  }
  return json(200, { user: publicOrdinaryUser(rows[0]), sessions_revoked: Number(rows[0].sessions_revoked || 0) });
}

async function revokeUserSessions(sql, admin, body) {
  const idError = requiredUuid(body.id, "id");
  if (idError) return idError;
  const rows = await sql`
    with target as (select id,school_id,role from app_users where id=${body.id}),
    removed as (delete from auth_sessions where user_id in(select id from target) returning id),
    audit as (
      insert into platform_admin_audit_log(platform_admin_id,action,target_type,target_id,target_school_id,metadata)
      select ${admin.id},'ordinary_sessions_revoked','ordinary_user',id::text,school_id,
        jsonb_build_object('role',role,'count',(select count(*) from removed)) from target
    ) select id,(select count(*)::int from removed) count from target
  `;
  return rows[0] ? json(200, { revoked: Number(rows[0].count || 0) }) : json(404, { error: "User not found" });
}

async function changeAccess(sql, admin, body) {
  const userError = requiredUuid(body.user_id, "user_id");
  if (userError) return userError;
  if (!phaseOneSlugs.includes(body.package_slug)) return json(400, { error: "Only active Phase 1 packages are supported" });
  const mode = body.mode === "revoke" ? "revoke" : body.mode === "grant" ? "grant" : "";
  if (!mode) return json(400, { error: "mode must be grant or revoke" });
  const targets = await sql`
    select u.id user_id,u.school_id,u.role,bp.id package_id,bp.slug
    from app_users u cross join book_packages bp
    where u.id=${body.user_id} and bp.slug=${body.package_slug} and bp.status='active'
  `;
  const target = targets[0];
  if (!target) return json(404, { error: "User or package not found" });
  const roleScope = target.role === "admin" ? "school_admin" : target.role;
  if (mode === "grant") {
    await sql`
      insert into book_access(user_id,book_package_id,role_scope)
      values(${target.user_id},${target.package_id},${roleScope})
      on conflict(user_id,book_package_id,role_scope) do nothing
    `;
  } else {
    await sql`delete from book_access where user_id=${target.user_id} and book_package_id=${target.package_id} and role_scope=${roleScope}`;
  }
  await writePlatformAdminAudit(sql, {
    platformAdminId: admin.id,
    action: mode === "grant" ? "package_access_granted" : "package_access_revoked",
    targetType: "ordinary_user",
    targetId: target.user_id,
    targetSchoolId: target.school_id,
    metadata: { package_slug: target.slug, role_scope: roleScope },
  });
  return json(200, { success: true });
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  try {
    const sql = getSql();
    const auth = await requirePlatformAdmin(event, sql);
    if (auth.error) return auth.error;
    const params = query(event);
    const action = params.action || "overview";
    if (event.httpMethod === "GET") {
      if (action === "overview") return overview(sql);
      if (action === "schools") return listSchools(sql, params);
      if (action === "school") return schoolDetail(sql, params);
      if (action === "users") return listUsers(sql, params);
      if (action === "user") return userDetail(sql, params);
      if (action === "classes") return listClasses(sql, params);
      if (action === "access") return listAccess(sql, params);
      if (action === "audit") return listAudit(sql, params);
      return json(404, { error: "Resource not found" });
    }
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    const originError = requirePlatformAdminOrigin(event);
    if (originError) return originError;
    const parsed = parsePlatformAdminBody(event);
    if (parsed.error) return parsed.error;
    if (action === "create-school") return createSchool(sql, auth.platformAdmin, parsed.value);
    if (action === "update-school") return updateSchool(sql, auth.platformAdmin, parsed.value);
    if (action === "school-status") return setSchoolStatus(sql, auth.platformAdmin, parsed.value);
    if (action === "create-user") return createUser(sql, auth.platformAdmin, parsed.value);
    if (action === "user-status") return setUserStatus(sql, auth.platformAdmin, parsed.value);
    if (action === "revoke-user-sessions") return revokeUserSessions(sql, auth.platformAdmin, parsed.value);
    if (action === "package-access") return changeAccess(sql, auth.platformAdmin, parsed.value);
    return json(404, { error: "Resource not found" });
  } catch (error) {
    if (error.code === "23505") return json(409, { error: "The requested record already exists" });
    return safeServerError(error, "Platform Administration request failed");
  }
}
