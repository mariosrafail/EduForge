import assert from "node:assert/strict";
import test from "node:test";
import { listAssignmentTargets } from "../src/services/assignmentsApi.js";

test("authenticated catalog failures retain their identity and never advertise demo data", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "assignment_catalog_unavailable", detail: "Published content could not be verified." }), { status: 503 });
  await assert.rejects(listAssignmentTargets(), (error) => {
    assert.equal(error.status, 503);
    assert.equal(error.code, "assignment_catalog_unavailable");
    assert.equal(error.message, "Published content could not be verified.");
    assert.doesNotMatch(error.message, /demo data/i);
    return true;
  });
});

test("a malformed successful catalog response is unavailable rather than an empty catalog", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const value of ["<html>upstream error</html>", "{}", '{"targets":{}}']) {
    globalThis.fetch = async () => new Response(value, { status: 200 });
    await assert.rejects(listAssignmentTargets(), (error) => error.code === "invalid_assignment_response");
  }
  globalThis.fetch = async () => new Response('{"targets":[]}', { status: 200 });
  assert.deepEqual(await listAssignmentTargets(), []);
});
