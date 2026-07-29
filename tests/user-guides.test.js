import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MULTI_SCHOOL_DEMO_PASSWORD,
  MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD,
} from "../scripts/_multi-school-seed-data.mjs";

const guides = [
  {
    path: "docs/user-guides/student-guide-el.txt",
    title: "Οδηγός Μαθητή EduForge",
  },
  {
    path: "docs/user-guides/teacher-guide-el.txt",
    title: "Οδηγός Εκπαιδευτικού EduForge",
  },
  {
    path: "docs/user-guides/school-admin-guide-el.txt",
    title: "Οδηγός Διαχειριστή Σχολείου EduForge",
  },
];

async function readUtf8(path) {
  const bytes = await readFile(path);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

test("Greek LMS user guides exist, decode as UTF-8, and contain the correct role titles", async () => {
  for (const guide of guides) {
    const content = await readUtf8(guide.path);
    assert.ok(content.trim().length > 500, `${guide.path} must be non-empty and substantive`);
    assert.equal(content.split(/\r?\n/, 1)[0], guide.title);
  }
});

test("Greek LMS user guides contain no credentials, internal URLs, or placeholders", async () => {
  const contents = await Promise.all(guides.map(({ path }) => readUtf8(path)));
  const combined = contents.join("\n");

  for (const credential of [
    MULTI_SCHOOL_DEMO_PASSWORD,
    MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD,
    "Platform-E2E-Ordinary-2026!",
  ]) {
    assert.doesNotMatch(combined, new RegExp(credential.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(combined, /@multi-school|\.dev\.invalid|127\.0\.0\.1|localhost|https?:\/\//i);
  assert.doesNotMatch(combined, /\b(?:TODO|TBD|placeholder)\b/i);
  assert.doesNotMatch(combined, /platform-admin|Platform Admin|Platform Administration/i);
});

test("role guides do not document privileged or unsupported controls", async () => {
  const student = await readUtf8(guides[0].path);
  const schoolAdmin = await readUtf8(guides[2].path);

  assert.doesNotMatch(student, /teacher-only solutions|teacher solutions|λύσεις εκπαιδευτικού|απαντήσεις εκπαιδευτικού/i);
  assert.doesNotMatch(schoolAdmin, /cross-school|πολλαπλά σχολεία|άλλα σχολεία|μεταξύ σχολείων|διασχολ/i);
});
