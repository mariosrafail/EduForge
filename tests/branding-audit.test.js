import test from "node:test";
import assert from "node:assert/strict";
import { findBrandingViolations, isMaintainedTrackedPath } from "../scripts/_branding-audit.mjs";

const retiredName = ["Edu", "Forge"].join("");
const retiredSlug = retiredName.toLowerCase();

test("branding audit reports retired names with exact file and line context", () => {
  const violations = findBrandingViolations([{
    path: "src/example.js",
    content: `current\n${retiredName} visible label`,
  }]);
  assert.deepEqual(violations, [{
    path: "src/example.js",
    line: 2,
    context: `${retiredName} visible label`,
  }]);
});

test("branding audit permits only an enumerated compatibility token in its approved path", () => {
  const token = `${retiredSlug}_migration_history`;
  assert.deepEqual(findBrandingViolations([{
    path: "netlify/functions/_runtime-schema-readiness.js",
    content: `select * from ${token}`,
  }]), []);
  assert.equal(findBrandingViolations([{
    path: "src/example.js",
    content: `select * from ${token}`,
  }]).length, 1);
});

test("branding audit checks filenames and excludes only the tracked comparison build output", () => {
  assert.equal(findBrandingViolations([{
    path: `src/${retiredSlug}-widget.js`,
    content: "export default true;",
  }]).length, 1);
  assert.equal(isMaintainedTrackedPath("dist-sidebar-check/assets/index.js"), false);
  assert.equal(isMaintainedTrackedPath("src/dist-sidebar-check-example.js"), true);
});
