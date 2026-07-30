import {
  getSql,
  json,
  requireRole,
  requireSameOrigin,
  safeServerError,
} from "./_auth-utils.js";
import {
  loadSchoolAdoptionRows,
  loadSchoolAdoptionSummary,
  recordSchoolAdoptionExport,
} from "./_school-adoption-report.js";
import { adoptionRowsToCsv, safeAdoptionFilename } from "./_csv-utils.js";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

function respond(statusCode, body) {
  return json(statusCode, body, privateHeaders);
}

function privateResponse(response) {
  return { ...response, headers: { ...(response.headers || {}), ...privateHeaders } };
}

function requestedAction(event) {
  const parameters = event.queryStringParameters || {};
  const keys = Object.keys(parameters);
  if (keys.length !== 1 || keys[0] !== "action") return "";
  const rawQuery = String(event.rawQuery || "");
  if (rawQuery) {
    const entries = [...new URLSearchParams(rawQuery).entries()];
    if (entries.length !== 1 || entries[0][0] !== "action" || entries[0][1] !== String(parameters.action || "")) return "";
  }
  return String(parameters.action || "");
}

function validateExportBody(event) {
  if (!String(event.body || "").trim()) return null;
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return respond(400, { error: "Request body must be valid JSON" });
  }
  if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).length) {
    return respond(400, { error: "Adoption export does not accept request fields" });
  }
  return null;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: privateHeaders, body: "" };
  if (!["GET", "POST"].includes(event.httpMethod)) return respond(405, { error: "Method not allowed" });

  const action = requestedAction(event);
  if (!action) return respond(400, { error: "Exactly one action parameter is required" });
  if ((event.httpMethod === "GET" && action !== "summary") || (event.httpMethod === "POST" && action !== "export")) {
    return respond(400, { error: "Unknown adoption report action" });
  }

  try {
    const sql = getSql();
    const auth = await requireRole(event, "admin", sql);
    if (auth.error) return privateResponse(auth.error);

    if (event.httpMethod === "GET") {
      const report = await loadSchoolAdoptionSummary(sql, auth.currentUser.school_id);
      return report ? respond(200, report) : respond(404, { error: "School not found" });
    }

    const originError = requireSameOrigin(event);
    if (originError) return privateResponse(originError);
    const bodyError = validateExportBody(event);
    if (bodyError) return bodyError;

    const rows = await loadSchoolAdoptionRows(sql, auth.currentUser.school_id);
    if (!rows.length) return respond(409, { error: "No adoption data is available to export" });
    const generatedAt = new Date().toISOString();
    const csv = adoptionRowsToCsv(rows, generatedAt);
    const filename = safeAdoptionFilename(rows[0].schoolName, generatedAt);
    await recordSchoolAdoptionExport(sql, auth.currentUser, rows);

    return {
      statusCode: 200,
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: csv,
    };
  } catch (error) {
    return privateResponse(safeServerError(error, "School adoption report failed"));
  }
}
