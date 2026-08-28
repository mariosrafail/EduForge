import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProductReleaseEnvelope,
  ULTIMATE_B2_LEGACY_PRODUCT_RELEASE_COMPILER_ID,
  ULTIMATE_B2_PRODUCT_RELEASE_COMPILER_ID,
  ULTIMATE_B2_PRODUCT_RELEASE_COMPONENTS,
  ULTIMATE_B2_PRODUCT_RELEASE_SCHEMA_VERSION,
} from "../src/data/ultimate-b2/productPublication.js";
import {
  productReleaseMemberSha256,
  productReleaseSha256,
  productReleaseSourceSha256,
  verifyProductReleaseEnvelope,
} from "../netlify-sites/ultimate-b2-builder/server/_builder-product-publication-domain.js";

const releaseIds = [1, 2, 3].map((value) => `10000000-0000-4000-8000-00000000000${value}`);
const includedMembers = () => ULTIMATE_B2_PRODUCT_RELEASE_COMPONENTS.map((entry, index) => {
  const member = {
    ...entry,
    status: "included",
    componentReleaseId: releaseIds[index],
    compilerId: index ? `${entry.componentSlug}-v1` : "ultimate-b2-students-book-v2",
    releaseSchemaVersion: index ? "1.0" : "2.0",
    releaseSha256: String(index + 1).repeat(64),
    compatibility: String(index + 4).repeat(64),
    unavailableReason: null,
  };
  return { ...member, memberSha256: productReleaseMemberSha256(member) };
});

function family(overrides = {}) {
  const members = overrides.members || includedMembers();
  const base = {
    id: "20000000-0000-4000-8000-000000000001",
    number: 12,
    bookSlug: "ultimate-b2",
    compilerId: ULTIMATE_B2_PRODUCT_RELEASE_COMPILER_ID,
    releaseSchemaVersion: ULTIMATE_B2_PRODUCT_RELEASE_SCHEMA_VERSION,
    releaseNote: "Atomic product release",
    createdAt: "2026-08-28T12:00:00.000Z",
    members,
  };
  const sourceSnapshotSha256 = productReleaseSourceSha256({ bookSlug: base.bookSlug, releaseNumber: base.number, members });
  return { ...base, sourceSnapshotSha256, releaseSha256: productReleaseSha256({ ...base, releaseNumber: base.number, sourceSnapshotSha256, members }), ...overrides };
}

test("product release member order and hashes are deterministic", () => {
  const first = family();
  const second = family();
  assert.deepEqual(first, second);
  assert.deepEqual(normalizeProductReleaseEnvelope(first).members.map((member) => member.componentSlug), ULTIMATE_B2_PRODUCT_RELEASE_COMPONENTS.map((member) => member.componentSlug));
  assert.equal(verifyProductReleaseEnvelope(first).releaseSha256, first.releaseSha256);
});

test("current product releases reject duplicate, reordered, unavailable, or forged members", () => {
  const original = family();
  assert.throws(() => normalizeProductReleaseEnvelope({ ...original, members: [original.members[0], original.members[0], original.members[2]] }), /order|unique/);
  assert.throws(() => normalizeProductReleaseEnvelope({ ...original, members: [original.members[1], original.members[0], original.members[2]] }), /order/);
  const unavailable = { ...original.members[1], status: "unavailable", componentReleaseId: null, compilerId: null, releaseSchemaVersion: null, releaseSha256: null, compatibility: null, unavailableReason: "not_in_legacy_release" };
  unavailable.memberSha256 = productReleaseMemberSha256(unavailable);
  assert.throws(() => normalizeProductReleaseEnvelope(family({ members: [original.members[0], unavailable, original.members[2]] })), /require every member/);
  assert.throws(() => verifyProductReleaseEnvelope({ ...original, releaseSha256: "f".repeat(64) }), /fingerprint/);
});

test("legacy product releases preserve explicit unavailable members", () => {
  const members = includedMembers();
  for (const index of [1, 2]) {
    const unavailable = { ...ULTIMATE_B2_PRODUCT_RELEASE_COMPONENTS[index], status: "unavailable", componentReleaseId: null, compilerId: null, releaseSchemaVersion: null, releaseSha256: null, compatibility: null, unavailableReason: "not_in_legacy_release" };
    members[index] = { ...unavailable, memberSha256: productReleaseMemberSha256(unavailable) };
  }
  const legacy = family({ compilerId: ULTIMATE_B2_LEGACY_PRODUCT_RELEASE_COMPILER_ID, members });
  assert.deepEqual(normalizeProductReleaseEnvelope(legacy).members.map((member) => member.status), ["included", "unavailable", "unavailable"]);
});
