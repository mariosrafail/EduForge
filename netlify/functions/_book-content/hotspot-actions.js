import { badRequest, requestsHiddenPhaseOneComponent, teacherSolutionHeaders, withTeacherSolutionHeaders, teacherSolutionResponse, uuidPattern, isValidUuid, invalidUuidResponse, jsonArray, numericOrNull, studentHiddenAnswerFields, stripStudentAnswerKeys, studentSafeActivityPayload, parseOptionalDeadline, assignmentIdempotencyKey, validateSubmittedAnswers, studentSafePackageTree, normalizeSubmittedAnswer, isSubmittedAnswerCorrect, packageIdForQuery, verifyPackageAccess, supportedBookActivityTypes, supportedBookMediaKinds, supportedHotspotActionTypes, requireText, optionalJson, getUserSchoolId, getUserAccessRow, resolveScopedUserId, getClassAccessRow, getAssignmentAccessRow, getSubmissionAccessRow, canAccessTeacherScopedRow, canAccessStudentScopedRow, verifyClassAccess, verifyAssignmentAccess, verifyStudentAccess, verifyContentEditorReferences, createTeacherClass, enforceInviteRateLimit, findClassByInviteCode, joinClass, listTeacherClasses, publicClassInviteRow, recordInviteAttempt, forbidden, requireAuth, safeServerError, unauthorized, isAdmin, isStudent, isTeacher, requireResourceRole, sameSchool, fetchActivity, fetchBookPackages, fetchPackageTree, databaseNotConfiguredResponse, getSql, isDatabaseNotConfiguredError, json, parseBody, readQuery, getBookAssetAccess, accessiblePackageIds } from "./shared.js";

export function normalizePercent(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, 0), 100);
}

export function normalizeHotspotPayload(hotspot = {}) {
  const left = normalizePercent(hotspot.left ?? hotspot.left_percent);
  const top = normalizePercent(hotspot.top ?? hotspot.top_percent);
  const width = normalizePercent(hotspot.width ?? hotspot.width_percent);
  const height = normalizePercent(hotspot.height ?? hotspot.height_percent);
  const safeWidth = Math.min(Math.max(width, 0.0001), 100 - left);
  const safeHeight = Math.min(Math.max(height, 0.0001), 100 - top);

  if (safeWidth <= 0 || safeHeight <= 0 || left + safeWidth > 100 || top + safeHeight > 100) {
    throw new Error("Invalid hotspot coordinates");
  }

  return {
    label: String(hotspot.label || "Clickable area").trim() || "Clickable area",
    left,
    top,
    width: safeWidth,
    height: safeHeight,
    actionType: String(hotspot.actionType || hotspot.action_type || "none").trim() || "none",
    actionTargetId: hotspot.actionTargetId || hotspot.action_target_id || null,
    actionPayload: hotspot.actionPayload || hotspot.action_payload || {},
  };
}

export function pageHotspotRowToUi(row) {
  return {
    id: row.id,
    package_slug: row.package_slug,
    component_slug: row.component_slug,
    page_id: row.page_id,
    page_number: row.page_number,
    label: row.label,
    left_percent: Number(row.left_percent),
    top_percent: Number(row.top_percent),
    width_percent: Number(row.width_percent),
    height_percent: Number(row.height_percent),
    action_type: row.action_type,
    action_target_id: row.action_target_id,
    action_payload: row.action_payload || {},
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listPageHotspots(sql, query, currentUser) {
  if (!query.packageSlug) return badRequest("packageSlug is required");
  if (!query.componentSlug) return badRequest("componentSlug is required");
  if (!query.pageId) return badRequest("pageId is required");

  const rows = await sql`
    select *
    from book_page_hotspots
    where package_slug = ${query.packageSlug}
      and component_slug = ${query.componentSlug}
      and page_id = ${query.pageId}
      and school_id = ${currentUser.school_id}
    order by created_at asc, id asc
  `;

  return json(200, { hotspots: rows.map(pageHotspotRowToUi) });
}

export async function savePageHotspots(sql, body, currentUser) {
  const packageSlug = String(body.packageSlug || body.package_slug || "").trim();
  const componentSlug = String(body.componentSlug || body.component_slug || "").trim();
  const pageId = String(body.pageId || body.page_id || "").trim();
  const pageNumber = body.pageNumber ?? body.page_number ?? null;
  const createdBy = body.createdBy || body.created_by || null;
  const hotspots = Array.isArray(body.hotspots) ? body.hotspots : [];

  if (!packageSlug) return badRequest("packageSlug is required");
  if (!componentSlug) return badRequest("componentSlug is required");
  if (!pageId) return badRequest("pageId is required");

  const normalizedHotspots = hotspots.map(normalizeHotspotPayload);
  const invalidHotspot = normalizedHotspots.find((hotspot) => !supportedHotspotActionTypes.has(hotspot.actionType));
  if (invalidHotspot) return badRequest(`Unsupported hotspot action type: ${invalidHotspot.actionType}`);

  if (isTeacher(currentUser)) {
    const foreignRows = await sql`
      select id from book_page_hotspots
      where package_slug = ${packageSlug} and component_slug = ${componentSlug} and page_id = ${pageId}
        and school_id = ${currentUser.school_id} and created_by is distinct from ${currentUser.id}
      limit 1
    `;
    if (foreignRows.length) return forbidden("Teachers can only modify their own page hotspots");
  }

  await sql`
    delete from book_page_hotspots
    where package_slug = ${packageSlug}
      and component_slug = ${componentSlug}
      and page_id = ${pageId}
      and school_id = ${currentUser.school_id}
      and (${isAdmin(currentUser)} or created_by = ${currentUser.id})
  `;

  const inserted = [];
  for (const hotspot of normalizedHotspots) {
    const rows = await sql`
      insert into book_page_hotspots (
        package_slug,
        component_slug,
        page_id,
        page_number,
        label,
        left_percent,
        top_percent,
        width_percent,
        height_percent,
        action_type,
        action_target_id,
        action_payload,
        created_by,
        school_id
      )
      values (
        ${packageSlug},
        ${componentSlug},
        ${pageId},
        ${pageNumber ? Number(pageNumber) : null},
        ${hotspot.label},
        ${hotspot.left},
        ${hotspot.top},
        ${hotspot.width},
        ${hotspot.height},
        ${hotspot.actionType},
        ${hotspot.actionTargetId},
        ${JSON.stringify(hotspot.actionPayload)}::jsonb,
        ${createdBy},
        ${currentUser.school_id}
      )
      returning *
    `;
    inserted.push(pageHotspotRowToUi(rows[0]));
  }

  return json(200, { hotspots: inserted });
}
