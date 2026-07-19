import {
  databaseNotConfiguredResponse,
  forbidden,
  getSql,
  isDatabaseNotConfiguredError,
  json,
  notFound,
  requireAuth,
  safeServerError,
} from "./_auth-utils.js";
import {
  createLegacyFlashSourceToken,
  isLegacyFlashFlagEnabled,
  isLocalRequestHost,
  legacyFlashTokenSecret,
} from "../../shared/legacyFlashProof.js";

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function hasUltimateB2LegacyProofAccess(sql, currentUser) {
  if (currentUser.role === "admin") {
    const rows = await sql`select 1 from book_packages where slug = 'ultimate-b2' and status = 'active' limit 1`;
    return Boolean(rows[0]);
  }
  if (currentUser.role === "teacher") {
    const rows = await sql`
      select 1
      from book_packages bp
      where bp.slug = 'ultimate-b2' and bp.status = 'active'
        and (
          exists (select 1 from book_access ba where ba.book_package_id = bp.id and ba.user_id = ${currentUser.id})
          or exists (
            select 1 from classes c
            where c.book_package_id = bp.id and c.teacher_id = ${currentUser.id}
              and c.school_id = ${currentUser.school_id} and coalesce(c.status, 'active') = 'active'
          )
        )
      limit 1
    `;
    return Boolean(rows[0]);
  }
  if (currentUser.role === "student") {
    const rows = await sql`
      select 1
      from book_access ba
      join book_packages bp on bp.id = ba.book_package_id
      join app_users u on u.id = ba.user_id
      where ba.user_id = ${currentUser.id} and u.school_id = ${currentUser.school_id}
        and ba.role_scope = 'student' and bp.slug = 'ultimate-b2' and bp.status = 'active'
      limit 1
    `;
    return Boolean(rows[0]);
  }
  return false;
}

export async function handler(event) {
  const host = event.headers?.host || event.headers?.Host || "";
  if (!isLegacyFlashFlagEnabled() || !isLocalRequestHost(host) || event.httpMethod !== "GET") {
    return notFound();
  }

  try {
    const sql = getSql();
    const auth = await requireAuth(event, sql);
    if (auth.error) return auth.error;
    if (!(await hasUltimateB2LegacyProofAccess(sql, auth.currentUser))) return forbidden("Ultimate B2 entitlement required");
    const secret = legacyFlashTokenSecret();
    if (!secret) return json(503, { error: "Legacy Flash proof token secret is not configured" }, noStoreHeaders);
    const token = createLegacyFlashSourceToken({ userId: auth.currentUser.id, secret });
    const sourceBaseUrl = `/__legacy-ultimate-b2-source/${token}/Contents/Resources/`;
    return json(200, {
      experiment: "ultimate-b2-legacy-ruffle-proof",
      isolation: "No LMS auth, activity, score, or progress APIs are exposed to the SWF runtime.",
      mainSwfUrl: `${sourceBaseUrl}UltimateB2.swf`,
      ruffleVersion: "0.4.0",
      sourceBaseUrl,
      tokenExpiresInSeconds: 300,
    }, noStoreHeaders);
  } catch (error) {
    if (isDatabaseNotConfiguredError(error)) return databaseNotConfiguredResponse();
    return safeServerError(error, "Legacy Flash compatibility proof failed");
  }
}
