import assert from "node:assert/strict";
import test from "node:test";
import { emailPattern } from "../netlify/functions/_auth-utils.js";
import { CEFR_LEVELS, validateUserImportRows } from "../shared/userImport.js";

test("user import validation normalizes supported rows without mutating input", () => {
  const input = [
    { rowNumber: 2, fullName: "  Example Teacher  ", email: " TEACHER@EXAMPLE.INVALID ", role: "Teacher", level: "B2" },
    { rowNumber: 3, full_name: "Example Student", email: "student@example.invalid", role: "STUDENT", level: "" },
  ];
  const copy = structuredClone(input);
  const result = validateUserImportRows(input);
  assert.deepEqual(input, copy);
  assert.equal(result.canImport, true);
  assert.deepEqual(result.rows.map(({ fullName, email, role, level }) => ({ fullName, email, role, level })), [
    { fullName: "Example Teacher", email: "teacher@example.invalid", role: "teacher", level: "B2" },
    { fullName: "Example Student", email: "student@example.invalid", role: "student", level: null },
  ]);
  assert.ok(result.rows.every((row) => emailPattern.test(row.email)));
  assert.deepEqual(CEFR_LEVELS, ["Primary (Pre-A1)", "A1", "A2", "B1", "B1+", "B2", "C1", "C2"]);
});

test("user import validation marks every duplicate and safely marks existing accounts", () => {
  const result = validateUserImportRows([
    { fullName: "Duplicate One", email: "Same@Example.invalid", role: "teacher", level: "C1" },
    { fullName: "Duplicate Two", email: "same@example.invalid", role: "student", level: "A1" },
    { fullName: "Existing", email: "existing@example.invalid", role: "student", level: "" },
  ], ["EXISTING@example.invalid"]);
  assert.equal(result.canImport, false);
  assert.equal(result.summary.duplicateInFile, 2);
  assert.equal(result.summary.existingAccounts, 1);
  assert.ok(result.rows.slice(0, 2).every((row) => row.errors.some((error) => error.code === "duplicate_in_file")));
  assert.deepEqual(result.rows[2].errors, [{ code: "account_exists", message: "An account with this email already exists" }]);
});

test("user import validation rejects names, emails, roles, levels, and control fields", () => {
  const result = validateUserImportRows([
    { fullName: " ", email: "bad", role: "admin", level: "B3", school_id: "foreign" },
  ]);
  assert.equal(result.canImport, false);
  assert.deepEqual(result.rows[0].errors.map((error) => error.code), [
    "unsupported_field",
    "invalid_name",
    "invalid_email",
    "invalid_role",
    "invalid_level",
  ]);
});
