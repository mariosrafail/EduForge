import assert from "node:assert/strict";
import test from "node:test";
import { commitUserImport, previewUserImport } from "../src/services/userImportApi.js";

test("user import browser API sends only parsed rows with credentials and preserves failures", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("commit")) {
      return { ok: false, status: 409, json: async () => ({ error: "Conflict", rows: [{ status: "invalid" }] }) };
    }
    return { ok: true, status: 200, json: async () => ({ canImport: true }) };
  };
  const rows = [{ rowNumber: 2, fullName: "User", email: "user@example.invalid", role: "student", level: "" }];
  assert.deepEqual(await previewUserImport(rows), { canImport: true });
  assert.equal(calls[0].url, "/.netlify/functions/user-import?action=preview");
  assert.equal(calls[0].options.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].options.body), { rows });
  await assert.rejects(
    () => commitUserImport(rows),
    (error) => error.status === 409 && error.payload.rows[0].status === "invalid",
  );
});
