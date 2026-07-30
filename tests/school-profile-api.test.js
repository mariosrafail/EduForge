import assert from "node:assert/strict";
import test from "node:test";
import { getSchoolProfile, updateSchoolProfile } from "../src/services/schoolProfileApi.js";

const serverSchool = {
  id: "school-a",
  name: "School A",
  logo: "SA",
  primaryColor: "#1e3a8a",
  secondaryColor: "#0f172a",
  status: "active",
};

test("school profile client loads and maps authenticated persisted branding", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let request;
  globalThis.fetch = async (...args) => {
    request = args;
    return new Response(JSON.stringify({ school: serverSchool }), { status: 200 });
  };
  const result = await getSchoolProfile();
  assert.equal(request[0], "/.netlify/functions/school-profile");
  assert.equal(request[1].credentials, "include");
  assert.equal(request[1].cache, "no-store");
  assert.deepEqual(result.brand, {
    schoolName: "School A",
    logo: "SA",
    primary: "#1e3a8a",
    secondary: "#0f172a",
  });
});

test("school profile client PATCH sends only branding fields and no tenant identity", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let request;
  globalThis.fetch = async (...args) => {
    request = args;
    return new Response(JSON.stringify({ school: { ...serverSchool, name: "Updated" } }), { status: 200 });
  };
  const result = await updateSchoolProfile({ schoolName: "Updated", primary: "#166534" });
  assert.equal(request[1].method, "PATCH");
  assert.deepEqual(JSON.parse(request[1].body), { name: "Updated", primaryColor: "#166534" });
  assert.doesNotMatch(request[1].body, /school.?id|user.?id/i);
  assert.equal(result.brand.schoolName, "Updated");
});

test("school profile client preserves status and safe validation or server failures", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const status of [400, 401, 403, 500]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: `safe-${status}` }), { status });
    await assert.rejects(
      updateSchoolProfile({ schoolName: "Draft" }),
      (error) => error.status === status && error.message === `safe-${status}`,
    );
  }
});
