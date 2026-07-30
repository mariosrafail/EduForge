import {
  ALLOWED_PRIMARY_COLORS,
  NEUTRAL_SCHOOL_BRAND,
  contrastWithWhite,
  normalizeHexColor,
} from "../../shared/schoolBranding.js";
import {
  getSql,
  json,
  requireAuth,
  requireRole,
  requireSameOrigin,
  safeServerError,
} from "./_auth-utils.js";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
};
const allowedPatchFields = new Set(["name", "logo", "primaryColor", "secondaryColor"]);

function privateResponse(response) {
  return { ...response, headers: { ...response.headers, ...privateHeaders } };
}

function respond(status, body) {
  return privateResponse(json(status, body));
}

function publicSchool(school) {
  return {
    id: school.id,
    name: school.name,
    logo: school.logo || "",
    primaryColor: normalizeHexColor(school.primary_color) || NEUTRAL_SCHOOL_BRAND.primary,
    secondaryColor: normalizeHexColor(school.secondary_color) || NEUTRAL_SCHOOL_BRAND.secondary,
    status: school.status || "active",
  };
}

function requestHasParameters(event) {
  return Object.keys(event.queryStringParameters || {}).length > 0 || Boolean(String(event.rawQuery || "").trim());
}

function parsePatch(event) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { error: respond(400, { error: "Request body must be valid JSON" }) };
  }
  if (!body || Array.isArray(body) || typeof body !== "object") {
    return { error: respond(400, { error: "Request body must be a JSON object" }) };
  }
  const unsupported = Object.keys(body).find((key) => !allowedPatchFields.has(key));
  if (unsupported) return { error: respond(400, { error: `Unsupported field: ${unsupported}` }) };
  return { body };
}

function validatePatch(body, current) {
  const name = body.name === undefined ? current.name : String(body.name ?? "").trim();
  const logo = body.logo === undefined ? current.logo : String(body.logo ?? "").trim() || null;
  const primaryColor = body.primaryColor === undefined
    ? current.primary_color
    : normalizeHexColor(body.primaryColor);
  const secondaryColor = body.secondaryColor === undefined
    ? current.secondary_color
    : normalizeHexColor(body.secondaryColor);

  if (name.length < 2 || name.length > 160) return { error: "School name must be 2-160 characters" };
  if (logo && logo.length > 240) return { error: "School logo must be at most 240 characters" };
  if (body.primaryColor !== undefined) {
    if (!primaryColor) return { error: "Primary color must be a six-digit hexadecimal value" };
    if (contrastWithWhite(primaryColor) < 4.5) return { error: "Primary color must have at least 4.5:1 contrast with white" };
    if (!ALLOWED_PRIMARY_COLORS.some((option) => option.value === primaryColor)) {
      return { error: "Primary color must use an approved palette value" };
    }
  }
  if (body.secondaryColor !== undefined && !secondaryColor) {
    return { error: "Secondary color must be a six-digit hexadecimal value" };
  }

  const changedFields = [
    name !== current.name && "name",
    logo !== current.logo && "logo",
    primaryColor !== current.primary_color && "primary_color",
    secondaryColor !== current.secondary_color && "secondary_color",
  ].filter(Boolean);
  return { value: { name, logo, primaryColor, secondaryColor, changedFields } };
}

async function findSchool(sql, schoolId) {
  const rows = await sql`
    select id,name,logo,primary_color,secondary_color,status
    from schools
    where id=${schoolId}
    limit 1
  `;
  return rows[0] || null;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: privateHeaders, body: "" };
  if (!["GET", "PATCH"].includes(event.httpMethod)) return respond(405, { error: "Method not allowed" });
  if (requestHasParameters(event)) return respond(400, { error: "School profile does not accept query parameters" });

  try {
    const sql = getSql();
    const auth = event.httpMethod === "PATCH"
      ? await requireRole(event, "admin", sql)
      : await requireAuth(event, sql);
    if (auth.error) return privateResponse(auth.error);

    if (event.httpMethod === "GET") {
      const school = await findSchool(sql, auth.currentUser.school_id);
      return school ? respond(200, { school: publicSchool(school) }) : respond(404, { error: "School not found" });
    }

    const originError = requireSameOrigin(event);
    if (originError) return privateResponse(originError);
    const parsed = parsePatch(event);
    if (parsed.error) return parsed.error;
    const current = await findSchool(sql, auth.currentUser.school_id);
    if (!current) return respond(404, { error: "School not found" });
    const validation = validatePatch(parsed.body, current);
    if (validation.error) return respond(400, { error: validation.error });
    const next = validation.value;
    if (!next.changedFields.length) return respond(200, { school: publicSchool(current) });

    const rows = await sql`
      with changed as (
        update schools
        set name=${next.name},logo=${next.logo},primary_color=${next.primaryColor},secondary_color=${next.secondaryColor}
        where id=${auth.currentUser.school_id}
        returning id,name,logo,primary_color,secondary_color,status
      ), audit as (
        insert into account_security_events(user_id,actor_user_id,school_id,event_type,metadata)
        select ${auth.currentUser.id},${auth.currentUser.id},id,'school_branding_updated',
          jsonb_build_object('changed_fields',${next.changedFields}::text[])
        from changed
        returning id
      )
      select changed.* from changed cross join audit
    `;
    if (!rows[0]) return respond(404, { error: "School not found" });
    return respond(200, { school: publicSchool(rows[0]) });
  } catch (error) {
    return privateResponse(safeServerError(error, "School profile request failed"));
  }
}
