import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ALLOWED_PRIMARY_COLORS,
  NEUTRAL_SCHOOL_BRAND,
  contrastWithWhite,
  validateSchoolBrand,
} from "../shared/schoolBranding.js";
import { brandForUser } from "../src/hooks/useSchoolBrand.js";
import {
  brandsMatch,
  changedBrandFields,
} from "../src/components/lms/admin/useSchoolBrandDraft.js";

const saved = { schoolName: "School A", logo: "SA", primary: "#1e3a8a", secondary: "#0f172a" };

test("shared branding policy has approved high-contrast primaries and validates drafts", () => {
  assert.ok(ALLOWED_PRIMARY_COLORS.every(({ value }) => contrastWithWhite(value) >= 4.5));
  assert.equal(validateSchoolBrand(saved), "");
  assert.match(validateSchoolBrand({ ...saved, schoolName: " " }), /2-160/);
  assert.match(validateSchoolBrand({ ...saved, primary: "#123456" }), /approved/);
  assert.match(validateSchoolBrand({ ...saved, secondary: "red" }), /six-digit/);
});

test("brand identity guard immediately replaces previous or missing tenant branding with neutral values", () => {
  const record = { userId: "user-a", brand: saved };
  assert.equal(brandForUser(record, { id: "user-a" }), saved);
  assert.equal(brandForUser(record, { id: "user-b" }), NEUTRAL_SCHOOL_BRAND);
  assert.equal(brandForUser(record, null), NEUTRAL_SCHOOL_BRAND);
  assert.equal(NEUTRAL_SCHOOL_BRAND.schoolName, "School workspace");
});

test("draft comparison and partial payload preserve persisted values until confirmed save", () => {
  assert.equal(brandsMatch(saved, { ...saved }), true);
  const draft = { ...saved, schoolName: "Preview School", secondary: "#112233" };
  assert.equal(brandsMatch(draft, saved), false);
  assert.deepEqual(changedBrandFields(draft, saved), {
    schoolName: "Preview School",
    secondary: "#112233",
  });
});

test("authenticated loading and School Setup expose truthful accessible draft states without fake publisher wiring", async () => {
  const [app, loader, admin, draftHook, setup] = await Promise.all([
    readFile("src/App.jsx", "utf8"),
    readFile("src/hooks/useSchoolBrand.js", "utf8"),
    readFile("src/components/lms/admin/AdminView.jsx", "utf8"),
    readFile("src/components/lms/admin/useSchoolBrandDraft.js", "utf8"),
    readFile("src/components/lms/admin/sections/AdminSchoolSetupSection.jsx", "utf8"),
  ]);
  assert.match(app, /useSchoolBrand\(auth\.currentUser\)/);
  assert.match(loader, /setRecord\(\{ userId, brand: NEUTRAL_SCHOOL_BRAND \}\)/);
  assert.match(loader, /AbortController/);
  assert.match(loader, /controller\.signal\.aborted/);
  assert.match(draftHook, /await updateSchoolProfile/);
  assert.match(draftHook, /onBrandPersisted\?\.\(brand\)/);
  assert.match(draftHook, /error: error\.message/);
  assert.match(setup, /Unsaved preview changes/);
  assert.match(setup, /Saving school profile…/);
  assert.match(setup, /School profile saved\./);
  assert.match(setup, /School profile could not be saved\./);
  assert.match(setup, /Save school profile/);
  assert.match(setup, /Discard changes/);
  assert.match(setup, /type="submit"/);
  assert.match(setup, /type="button"/);
  assert.match(setup, /Preview preset/);
  assert.match(setup, /role="alert"/);
  assert.doesNotMatch(admin, /onImport=\{\(\) => setUserCreated\(true\)\}/);
  assert.doesNotMatch(admin, /onExport|setExported/);
});
