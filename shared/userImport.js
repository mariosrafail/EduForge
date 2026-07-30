export const USER_IMPORT_LIMITS = Object.freeze({
  fileBytes: 256 * 1024,
  bodyBytes: 512 * 1024,
  rows: 200,
  fullName: 160,
  email: 320,
  role: 32,
  level: 32,
});

export const CEFR_LEVELS = Object.freeze([
  "Primary (Pre-A1)",
  "A1",
  "A2",
  "B1",
  "B1+",
  "B2",
  "C1",
  "C2",
]);

export const USER_IMPORT_HEADERS = Object.freeze(["full_name", "email", "role", "level"]);
export const USER_IMPORT_ROLES = Object.freeze(["teacher", "student"]);

const importEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rowFields = new Set(["rowNumber", "fullName", "full_name", "email", "role", "level"]);

function rowError(code, message) {
  return { code, message };
}

function normalizeRow(row, index) {
  const fallbackNumber = index + 2;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return {
      rowNumber: fallbackNumber,
      fullName: "",
      email: "",
      role: "",
      level: null,
      status: "invalid",
      errors: [rowError("invalid_row", "Each row must be an object")],
    };
  }

  const errors = [];
  const unknown = Object.keys(row).filter((key) => !rowFields.has(key));
  if (unknown.length || ("fullName" in row && "full_name" in row)) {
    errors.push(rowError("unsupported_field", "Rows contain unsupported control fields"));
  }
  const rawName = String(row.fullName ?? row.full_name ?? "");
  const rawEmail = String(row.email ?? "");
  const rawRole = String(row.role ?? "");
  const rawLevel = String(row.level ?? "");
  const fullName = rawName.trim();
  const email = rawEmail.trim().toLowerCase();
  const role = rawRole.trim().toLowerCase();
  const level = rawLevel.trim() || null;

  if (rawName.length > USER_IMPORT_LIMITS.fullName || fullName.length < 2 || fullName.length > USER_IMPORT_LIMITS.fullName) {
    errors.push(rowError("invalid_name", "Full name must be 2-160 characters"));
  }
  if (rawEmail.length > USER_IMPORT_LIMITS.email || !importEmailPattern.test(email)) {
    errors.push(rowError("invalid_email", "A valid email is required"));
  }
  if (rawRole.length > USER_IMPORT_LIMITS.role || !USER_IMPORT_ROLES.includes(role)) {
    errors.push(rowError("invalid_role", "Role must be Teacher or Student"));
  }
  if (rawLevel.length > USER_IMPORT_LIMITS.level || (level && !CEFR_LEVELS.includes(level))) {
    errors.push(rowError("invalid_level", "Level must be a supported CEFR value or blank"));
  }

  return {
    rowNumber: Number.isSafeInteger(row.rowNumber) && row.rowNumber > 0 ? row.rowNumber : fallbackNumber,
    fullName,
    email,
    role,
    level,
    status: errors.length ? "invalid" : "valid",
    errors,
  };
}

function withSummary(rows) {
  const invalid = rows.filter((row) => row.status === "invalid").length;
  return {
    rows,
    summary: {
      total: rows.length,
      valid: rows.length - invalid,
      invalid,
      duplicateInFile: rows.filter((row) => row.errors.some((error) => error.code === "duplicate_in_file")).length,
      existingAccounts: rows.filter((row) => row.errors.some((error) => error.code === "account_exists")).length,
    },
    canImport: rows.length > 0 && invalid === 0,
  };
}

export function validateUserImportRows(inputRows, existingEmails = []) {
  const rows = inputRows.map(normalizeRow);
  const counts = new Map();
  for (const row of rows) {
    if (row.email) counts.set(row.email, (counts.get(row.email) || 0) + 1);
  }
  const existing = new Set(existingEmails.map((email) => String(email).trim().toLowerCase()));
  for (const row of rows) {
    if (row.email && counts.get(row.email) > 1) {
      row.errors.push(rowError("duplicate_in_file", "Duplicate email in this CSV"));
    }
    if (row.email && existing.has(row.email)) {
      row.errors.push(rowError("account_exists", "An account with this email already exists"));
    }
    row.status = row.errors.length ? "invalid" : "valid";
  }
  return withSummary(rows);
}
