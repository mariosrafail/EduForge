import { json } from "./_book-content-utils.js";

function badRequest(message) {
  return json(400, { error: message });
}

function sameId(left, right) {
  return String(left || "") === String(right || "");
}

export function roleScopeForUser(user = {}) {
  return user.role === "admin" ? "school_admin" : user.role;
}

export async function validateActivationCodeForUser(sql, { code, schoolId, userId = "", enforceUsageLimit = false }) {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) return { error: badRequest("code is required") };

  const rows = await sql`
    select ac.*, bp.title as package_title
    from activation_codes ac
    join book_packages bp on bp.id = ac.book_package_id
    where ac.code = ${normalizedCode}
    limit 1
  `;
  const activationCode = rows[0];
  if (!activationCode) return { error: json(404, { error: "Activation code not found" }) };
  if (activationCode.status !== "active") return { error: badRequest("Activation code is not active") };
  if (activationCode.expires_at && new Date(activationCode.expires_at).getTime() < Date.now()) {
    return { error: badRequest("Activation code has expired") };
  }
  if (activationCode.school_id && !sameId(activationCode.school_id, schoolId)) {
    return { error: json(403, { error: "Activation code is not available for this school" }) };
  }
  if (activationCode.user_id && userId && !sameId(activationCode.user_id, userId)) {
    return { error: json(403, { error: "Activation code is assigned to another user" }) };
  }
  if (activationCode.user_id && !userId) {
    return { error: json(403, { error: "Activation code is assigned to another user" }) };
  }
  if (enforceUsageLimit && activationCode.max_uses !== null && Number(activationCode.used_count) >= Number(activationCode.max_uses)) {
    return { error: badRequest("Activation code usage limit reached") };
  }
  return { activationCode };
}

export async function grantBookAccessByCode(sql, { code, userId }) {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) return { error: badRequest("code is required") };
  if (!userId) return { error: badRequest("userId is required") };

  const userRows = await sql`
    select id, school_id, role
    from app_users
    where id = ${userId}
    limit 1
  `;
  const user = userRows[0];
  if (!user) return { error: json(404, { error: "User not found" }) };
  const validation = await validateActivationCodeForUser(sql, { code: normalizedCode, schoolId: user.school_id, userId: user.id });
  if (validation.error) return validation;
  const activationCode = validation.activationCode;

  const roleScope = roleScopeForUser(user);
  const existingRows = await sql`
    select id, activation_code_id
    from book_access
    where user_id = ${user.id}
      and book_package_id = ${activationCode.book_package_id}
      and role_scope = ${roleScope}
    limit 1
  `;
  const existing = existingRows[0] || null;
  const alreadyActivatedWithThisCode = existing && sameId(existing.activation_code_id, activationCode.id);

  if (alreadyActivatedWithThisCode) {
    return {
      activated: true,
      alreadyActivated: true,
      incrementedUsage: false,
      bookPackageId: activationCode.book_package_id,
      bookPackageTitle: activationCode.package_title,
    };
  }

  if (activationCode.max_uses !== null && Number(activationCode.used_count) >= Number(activationCode.max_uses)) {
    return { error: badRequest("Activation code usage limit reached") };
  }

  await sql`
    insert into book_access (user_id, book_package_id, activation_code_id, role_scope)
    values (${user.id}, ${activationCode.book_package_id}, ${activationCode.id}, ${roleScope})
    on conflict (user_id, book_package_id, role_scope) do update
    set activation_code_id = excluded.activation_code_id,
        granted_at = now()
  `;

  // Count only genuine new uses of this activation code. Re-clicks for the
  // same user/book/role/code return success above without inflating used_count.
  await sql`
    update activation_codes
    set used_count = used_count + 1
    where id = ${activationCode.id}
  `;

  return {
    activated: true,
    alreadyActivated: false,
    incrementedUsage: true,
    bookPackageId: activationCode.book_package_id,
    bookPackageTitle: activationCode.package_title,
  };
}
