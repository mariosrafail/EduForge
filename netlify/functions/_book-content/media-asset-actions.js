import { badRequest, requestsHiddenPhaseOneComponent, teacherSolutionHeaders, withTeacherSolutionHeaders, teacherSolutionResponse, uuidPattern, isValidUuid, invalidUuidResponse, jsonArray, numericOrNull, studentHiddenAnswerFields, stripStudentAnswerKeys, studentSafeActivityPayload, parseOptionalDeadline, assignmentIdempotencyKey, validateSubmittedAnswers, studentSafePackageTree, normalizeSubmittedAnswer, isSubmittedAnswerCorrect, packageIdForQuery, verifyPackageAccess, supportedBookActivityTypes, supportedBookMediaKinds, supportedHotspotActionTypes, requireText, optionalJson, getUserSchoolId, getUserAccessRow, resolveScopedUserId, getClassAccessRow, getAssignmentAccessRow, getSubmissionAccessRow, canAccessTeacherScopedRow, canAccessStudentScopedRow, verifyClassAccess, verifyAssignmentAccess, verifyStudentAccess, verifyContentEditorReferences, createTeacherClass, enforceInviteRateLimit, findClassByInviteCode, joinClass, listTeacherClasses, publicClassInviteRow, recordInviteAttempt, forbidden, requireAuth, safeServerError, unauthorized, isAdmin, isStudent, isTeacher, requireResourceRole, sameSchool, fetchActivity, fetchBookPackages, fetchPackageTree, databaseNotConfiguredResponse, getSql, isDatabaseNotConfiguredError, json, parseBody, readQuery, getBookAssetAccess, accessiblePackageIds } from "./shared.js";

export function bookMediaAssetRowToUi(row) {
  return {
    id: row.id,
    package_slug: row.package_slug,
    component_slug: row.component_slug,
    page_id: row.page_id,
    file_name: row.file_name,
    original_file_name: row.original_file_name,
    mime_type: row.mime_type,
    file_size_bytes: row.file_size_bytes,
    public_url: row.public_url,
    storage_path: row.storage_path,
    kind: row.kind,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

export async function listBookMediaAssets(sql, query, currentUser) {
  if (!query.packageSlug) return badRequest("packageSlug is required");
  if (!query.componentSlug) return badRequest("componentSlug is required");

  const rows = await sql`
    select *
    from book_media_assets
    where package_slug = ${query.packageSlug}
      and component_slug = ${query.componentSlug}
      and (${query.pageId || null}::text is null or page_id = ${query.pageId || null})
      and (${query.kind || null}::text is null or kind = ${query.kind || null})
      and school_id = ${currentUser.school_id}
    order by created_at desc, file_name asc
  `;

  return json(200, { mediaAssets: rows.map(bookMediaAssetRowToUi) });
}

export async function createBookMediaAsset(sql, body, currentUser) {
  const packageSlug = String(body.packageSlug || body.package_slug || "").trim();
  const componentSlug = String(body.componentSlug || body.component_slug || "").trim();
  const publicUrl = String(body.publicUrl || body.public_url || "").trim();
  const kind = String(body.kind || "other").trim();

  if (!packageSlug) return badRequest("packageSlug is required");
  if (!componentSlug) return badRequest("componentSlug is required");
  if (!publicUrl) return badRequest("publicUrl is required");
  if (!supportedBookMediaKinds.has(kind)) return badRequest(`Unsupported media kind: ${kind}`);

  const fileName = String(body.fileName || body.file_name || publicUrl.split("/").pop() || "media").trim();
  const rows = await sql`
    insert into book_media_assets (
      package_slug,
      component_slug,
      page_id,
      file_name,
      original_file_name,
      mime_type,
      file_size_bytes,
      public_url,
      storage_path,
      kind,
      created_by,
      school_id
    )
    values (
      ${packageSlug},
      ${componentSlug},
      ${body.pageId || body.page_id || null},
      ${fileName},
      ${body.originalFileName || body.original_file_name || fileName},
      ${body.mimeType || body.mime_type || "application/octet-stream"},
      ${body.fileSizeBytes || body.file_size_bytes || null},
      ${publicUrl},
      ${body.storagePath || body.storage_path || null},
      ${kind},
      ${body.createdBy || body.created_by || null},
      ${currentUser.school_id}
    )
    returning *
  `;

  return json(200, { mediaAsset: bookMediaAssetRowToUi(rows[0]) });
}
