import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("School Admin CSV import uses real preview, confirmation, truthful results, and user reload states", async () => {
  const [admin, usersSection, importer, service, table] = await Promise.all([
    readFile("src/components/lms/admin/AdminView.jsx", "utf8"),
    readFile("src/components/lms/admin/sections/AdminUsersSection.jsx", "utf8"),
    readFile("src/components/lms/admin/components/AdminUserCsvImport.jsx", "utf8"),
    readFile("src/services/userImportApi.js", "utf8"),
    readFile("src/components/lms/admin/components/AdminUserTable.jsx", "utf8"),
  ]);
  assert.doesNotMatch(admin, /onImport=\{\(\) => setUserCreated\(true\)\}/);
  assert.match(admin, /onUsersImported=\{loadUsers\}/);
  assert.match(usersSection, /AdminUserCsvImport/);
  assert.match(importer, /accept="\.csv,text\/csv"/);
  assert.match(importer, /file\.size > USER_IMPORT_LIMITS\.fileBytes/);
  assert.match(importer, /await previewUserImport\(rows\)/);
  assert.match(importer, /await commitUserImport\(state\.rows\)/);
  assert.match(importer, /Import \$\{state\.preview\?\.summary\.valid \|\| 0\} invitation accounts/);
  assert.match(importer, /Creating invitation accounts…/);
  assert.match(importer, /Failed invitations can be resent from the user table/);
  assert.match(importer, /preview: error\.payload\?\.rows \? error\.payload : current\.preview/);
  assert.doesNotMatch(importer, /dangerouslySetInnerHTML/);
  assert.match(service, /credentials: "include"/);
  assert.match(service, /error\.payload = payload/);
  assert.match(table, /invitationDeliveryState/);
});

test("single invitation success stays separate and publisher export remains unresolved", async () => {
  const [admin, usersSection, operations] = await Promise.all([
    readFile("src/components/lms/admin/AdminView.jsx", "utf8"),
    readFile("src/components/lms/admin/sections/AdminUsersSection.jsx", "utf8"),
    readFile("src/components/lms/admin/sections/AdminOperationsSections.jsx", "utf8"),
  ]);
  assert.match(usersSection, /userCreated[\s\S]*Invitation account saved to the database/);
  assert.match(admin, /setUserCreated\(true\)/);
  assert.match(admin, /onImportOpen=\{\(\) =>/);
  assert.match(admin, /onExport=\{\(\) => setExported\(true\)\}/);
  assert.match(operations, /Export adoption data/);
  assert.match(operations, /Adoption export prepared/);
});
