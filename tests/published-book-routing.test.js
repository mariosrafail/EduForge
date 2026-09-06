import assert from "node:assert/strict";
import test from "node:test";
import { routePublishedBookRead } from "../netlify/functions/_book-content/publication-read-routes.js";

const noSql = async () => { throw new Error("Forbidden route must not read publication content"); };
const student = { id: "10000000-0000-4000-8000-000000000001", role: "student" };

test("ordinary hidden-component publication reads reject both bookSlug and legacy packageSlug forms before SQL", async () => {
  for (const identity of ["bookSlug", "packageSlug"]) for (const component of ["ultimate-b2-grammar-book", "ultimate-b2-test-book"]) {
    for (const action of ["published-release-asset", "published-native-teacher", "published-native-answer-asset", "active-component-release"]) {
      const response = await routePublishedBookRead(noSql, student, { httpMethod: "GET" }, { action, [identity]: "ultimate-b2", componentSlug: component });
      assert.equal(response.statusCode, 404);
      assert.equal(response.headers["Cache-Control"], "private, no-store");
      assert.equal(response.headers.Vary, "Cookie");
    }
  }
});

test("Student Teacher-document and answer requests are denied before package/publication reads", async () => {
  for (const action of ["published-native-teacher", "published-native-answer-asset"]) {
    const response = await routePublishedBookRead(noSql, student, { httpMethod: "GET" }, { action, bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" });
    assert.equal(response.statusCode, 403);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
  }
});

test("publication read delegation leaves unrelated actions and mutations to the existing entrypoint", async () => {
  assert.equal(await routePublishedBookRead(noSql, student, { httpMethod: "POST" }, { action: "published-books" }), null);
  assert.equal(await routePublishedBookRead(noSql, student, { httpMethod: "GET" }, { action: "student-grades" }), null);
});
