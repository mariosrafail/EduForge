import assert from "node:assert/strict";
import test from "node:test";

import { resolveBuilderContentResource } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";
import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { loadBuilderComponentDocument } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-store.js";
import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { nativeChildIdFromUuid } from "../src/data/native-activities/nativeChildIdentity.js";

const activityId = "ultimate-b2-sb-u1-p1-o98";
const placement = { pageId: "ub2-sb-unit-1-part-1" };
const artworkId = nativeChildIdFromUuid("art", "10000000-0000-4000-8000-000000000001");
const asset = {
  assetId: "10000000-0000-4000-8000-000000000002",
  checksumSha256: "a".repeat(64),
  role: "activity_artwork",
  slot: "legacy-artwork",
};
const kind = resolveNativeActivityKind("open-response");
const publicResource = await resolveBuilderContentResource(
  "ultimate-b2",
  "ultimate-b2-students-book",
  "native-activity-public",
  activityId,
);
const teacherResource = await resolveBuilderContentResource(
  "ultimate-b2",
  "ultimate-b2-students-book",
  "native-activity-teacher",
  activityId,
);
const hotspotResource = await resolveBuilderContentResource(
  "ultimate-b2",
  "ultimate-b2-students-book",
  "hotspots",
);

function publicDocument(locked) {
  const document = kind.createBlankPublic({ activityId, title: "Checksum compatibility", placement });
  document.assets = [asset];
  const artwork = {
    id: artworkId,
    assetSlot: asset.slot,
    area: { x: 10, y: 20, width: 300, height: 180 },
    order: 0,
    altText: "Legacy diagram",
    decorative: false,
    fit: "contain",
  };
  if (locked !== undefined) artwork.locked = locked;
  document.parts[0].interaction.artwork = [artwork];
  return document;
}

function row(payload, resource, overrides = {}) {
  return {
    schema_version: resource.schemaVersion,
    revision: 7,
    payload,
    payload_sha256: builderDocumentSha256(payload),
    ...overrides,
  };
}

async function load(storedRow, resource) {
  return loadBuilderComponentDocument(async () => [storedRow], resource);
}

test("stored legacy native payload is verified as persisted before current normalization", async () => {
  const legacyPayload = publicDocument(undefined);
  const normalized = publicResource.validate(legacyPayload);
  assert.equal("locked" in legacyPayload.parts[0].interaction.artwork[0], false);
  assert.equal(normalized.parts[0].interaction.artwork[0].locked, false);
  assert.notEqual(builderDocumentSha256(legacyPayload), builderDocumentSha256(normalized));

  const storedRow = row(legacyPayload, publicResource);
  const beforeRead = structuredClone(storedRow);
  const loaded = await load(storedRow, publicResource);

  assert.equal(loaded.revision, 7);
  assert.equal(loaded.document.parts[0].interaction.artwork[0].locked, false);
  assert.deepEqual(storedRow, beforeRead);
});

test("current unlocked and locked native payloads retain checksum compatibility", async () => {
  for (const locked of [false, true]) {
    const payload = publicDocument(locked);
    const loaded = await load(row(payload, publicResource), publicResource);
    assert.equal(loaded.revision, 7);
    assert.equal(loaded.document.parts[0].interaction.artwork[0].locked, locked);
  }
});

test("raw checksum corruption still fails closed before normalization", async () => {
  await assert.rejects(
    load(row(publicDocument(undefined), publicResource, { payload_sha256: "0".repeat(64) }), publicResource),
    /checksum is invalid/,
  );
});

test("malformed payload and unsupported schema versions still fail closed", async () => {
  for (const locked of [undefined, false]) {
    const malformed = publicDocument(locked);
    malformed.parts[0].interaction.artwork[0].unknown = true;
    await assert.rejects(load(row(malformed, publicResource), publicResource), /missing or unknown fields/);
  }

  const unsupported = publicDocument(false);
  unsupported.schemaVersion = "2.0";
  await assert.rejects(load(row(unsupported, publicResource), publicResource), /Unsupported native public activity schema version/);
  await assert.rejects(
    load(row(publicDocument(false), publicResource, { schema_version: "2.0" }), publicResource),
    /schema is unsupported/,
  );
});

test("Teacher and non-native documents continue to verify their raw persisted payloads", async () => {
  const teacherDocument = kind.createBlankTeacher({ activityId });
  const teacherLoaded = await load(row(teacherDocument, teacherResource, { revision: 5 }), teacherResource);
  assert.equal(teacherLoaded.revision, 5);
  assert.deepEqual(teacherLoaded.document, teacherDocument);
  await assert.rejects(
    load(row(teacherDocument, teacherResource, { payload_sha256: "f".repeat(64) }), teacherResource),
    /checksum is invalid/,
  );

  const hotspotDocument = hotspotResource.baseline();
  const hotspotLoaded = await load(row(hotspotDocument, hotspotResource, { revision: 3 }), hotspotResource);
  assert.equal(hotspotLoaded.revision, 3);
  assert.deepEqual(hotspotLoaded.document, hotspotResource.validate(hotspotDocument));
});
