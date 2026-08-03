import assert from "node:assert/strict";
import test from "node:test";
import { handler, hasUltimateB2LegacyProofAccess } from "../netlify/functions/legacy-flash-proof.js";

function resultSql(result) {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return result;
  };
  sql.calls = calls;
  return sql;
}

test("legacy proof entitlement is denied when no active package access exists", async () => {
  assert.equal(await hasUltimateB2LegacyProofAccess(resultSql([]), { id: "s1", school_id: "a", role: "student" }), false);
});

test("student entitlement query binds authenticated user and tenant", async () => {
  const sql = resultSql([{ "?column?": 1 }]);
  assert.equal(await hasUltimateB2LegacyProofAccess(sql, { id: "s1", school_id: "school-a", role: "student" }), true);
  assert.deepEqual(sql.calls[0].values, ["s1", "school-a"]);
  assert.match(sql.calls[0].text, /role_scope = 'student'/);
});

test("teacher entitlement remains limited to owned access or same-school active class", async () => {
  const sql = resultSql([{ "?column?": 1 }]);
  await hasUltimateB2LegacyProofAccess(sql, { id: "t1", school_id: "school-a", role: "teacher" });
  assert.deepEqual(sql.calls[0].values, ["t1", "t1", "school-a"]);
  assert.match(sql.calls[0].text, /c\.school_id/);
});

test("unsupported roles never receive a source grant", async () => {
  assert.equal(await hasUltimateB2LegacyProofAccess(resultSql([{ one: 1 }]), { id: "x", role: "publisher" }), false);
});

test("disabled and non-local function requests fail closed before authentication", async (t) => {
  const previous = process.env.VITE_ENABLE_LEGACY_FLASH_PLAYER;
  t.after(() => {
    if (previous === undefined) delete process.env.VITE_ENABLE_LEGACY_FLASH_PLAYER;
    else process.env.VITE_ENABLE_LEGACY_FLASH_PLAYER = previous;
  });
  delete process.env.VITE_ENABLE_LEGACY_FLASH_PLAYER;
  assert.equal((await handler({ headers: { host: "localhost:8888" }, httpMethod: "GET" })).statusCode, 404);
  process.env.VITE_ENABLE_LEGACY_FLASH_PLAYER = "true";
  assert.equal((await handler({ headers: { host: "hhplms.example" }, httpMethod: "GET" })).statusCode, 404);
});
