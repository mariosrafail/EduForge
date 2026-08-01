import assert from "node:assert/strict";
import test from "node:test";
import { USER_IMPORT_LIMITS } from "../shared/userImport.js";
import { downloadUserImportTemplate, parseUserImportCsv, USER_IMPORT_TEMPLATE } from "../src/utils/userImportCsv.js";

test("user import CSV parses BOM, line endings, quotes, blank lines, aliases, and text values", () => {
  const input = '\uFEFFName,EMAIL,ROLE,LEVEL\r\n"Doe, Jane",JANE@EXAMPLE.INVALID,Teacher,B2\r\n\r\n"John ""Example""",john@example.invalid,Student,\r\n';
  const copy = String(input);
  const rows = parseUserImportCsv(input);
  assert.deepEqual(rows, [
    { rowNumber: 2, fullName: "Doe, Jane", email: "JANE@EXAMPLE.INVALID", role: "Teacher", level: "B2" },
    { rowNumber: 4, fullName: 'John "Example"', email: "john@example.invalid", role: "Student", level: "" },
  ]);
  assert.equal(input, copy);

  const lf = parseUserImportCsv("full_name,email,role\n=Formula,formula@example.invalid,student\n");
  assert.equal(lf[0].fullName, "=Formula");
  assert.equal(USER_IMPORT_TEMPLATE.split(/\r?\n/)[0], "full_name,email,role,level");
  assert.doesNotMatch(USER_IMPORT_TEMPLATE, /(?:^|,)[=+\-@]/m);
});

test("user import CSV rejects unsafe headers and malformed records", () => {
  const cases = [
    ["", /empty/],
    ["full_name,email,role", /at least one user row/],
    ["full_name,role\nName,Student", /Missing required.*email/],
    ["full_name,email,role,status\nName,x@example.invalid,Student,active", /Unknown CSV header/],
    ["full_name,email,email,role\nName,a@x.invalid,a@x.invalid,Student", /duplicate headers/],
    ["name,full_name,email,role\nA,B,a@x.invalid,Student", /either name or full_name/],
    [",email,role\nName,a@x.invalid,Student", /empty header/],
    ["full_name,email,role\nName,a@x.invalid", /inconsistent field count/],
    ['full_name,email,role\n"Name,a@x.invalid,Student', /unclosed quoted field/],
    ['full_name,email,role\n"Name"x,a@x.invalid,Student', /Unexpected character/],
    ["full_name,email,role\nNa\0me,a@x.invalid,Student", /NUL/],
  ];
  for (const [csv, expected] of cases) assert.throws(() => parseUserImportCsv(csv), expected);
});

test("user import CSV enforces browser row and byte limits", () => {
  const rows = Array.from({ length: USER_IMPORT_LIMITS.rows + 1 }, (_, index) => `User ${index},u${index}@example.invalid,Student`).join("\n");
  assert.throws(() => parseUserImportCsv(`full_name,email,role\n${rows}`), /more than 200/);
  assert.throws(
    () => parseUserImportCsv(`full_name,email,role\n${"x".repeat(USER_IMPORT_LIMITS.fileBytes)}`),
    /256 KiB/,
  );
});

test("user import template download uses the exact filename and revokes its Blob URL", () => {
  const clicks = [];
  const revoked = [];
  const anchor = { href: "", download: "", click: () => clicks.push(true) };
  downloadUserImportTemplate(
    { createElement: (name) => { assert.equal(name, "a"); return anchor; } },
    { createObjectURL: (blob) => { assert.equal(blob.type, "text/csv;charset=utf-8"); return "blob:test"; }, revokeObjectURL: (url) => revoked.push(url) },
  );
  assert.equal(anchor.download, "hamilton-house-user-import-template.csv");
  assert.equal(anchor.href, "blob:test");
  assert.equal(clicks.length, 1);
  assert.deepEqual(revoked, ["blob:test"]);
});
