export const ADOPTION_CSV_COLUMNS = Object.freeze([
  "generated_at_utc",
  "school_name",
  "publisher_name",
  "book_package_title",
  "book_package_slug",
  "level",
  "codes_generated",
  "codes_redeemed",
  "codes_unused",
  "codes_expired",
  "codes_revoked",
  "active_student_entitlements",
  "active_teacher_entitlements",
  "active_assignments",
  "unique_submitted_assignments",
  "unique_students_submitted",
  "scored_submissions",
  "average_score_percent",
  "last_submission_at_utc",
]);

export function spreadsheetSafeText(value) {
  const text = String(value ?? "");
  return /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
}

export function csvCell(value, textual = false) {
  const text = textual ? spreadsheetSafeText(value) : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function adoptionRowsToCsv(rows, generatedAt) {
  const lines = [ADOPTION_CSV_COLUMNS.join(",")];
  for (const row of rows) {
    const cells = [
      generatedAt,
      row.schoolName,
      row.publisherName,
      row.packageTitle,
      row.packageSlug,
      row.level,
      row.codesGenerated,
      row.codesRedeemed,
      row.codesUnused,
      row.codesExpired,
      row.codesRevoked,
      row.activeStudentEntitlements,
      row.activeTeacherEntitlements,
      row.activeAssignments,
      row.uniqueSubmittedAssignments,
      row.uniqueStudentsSubmitted,
      row.scoredSubmissions,
      row.averageScorePercent ?? "",
      row.lastSubmissionAt || "",
    ];
    lines.push(cells.map((value, index) => csvCell(value, index <= 5 || index === 18)).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function safeAdoptionFilename(schoolName, generatedAt) {
  const schoolSlug = String(schoolName || "school")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "school";
  return `hamilton-house-adoption-${schoolSlug}-${generatedAt.slice(0, 10)}.csv`;
}
