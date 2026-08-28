import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { buildBuilderPageAssetObjectKey, buildNativeActivityAssetObjectKey, buildUnitExtraAssetObjectKey } from "../lib/book-assets/object-keys.js";
import { freezeComponentPublicationAssetPins, publicationAssetPinFingerprint } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-pins.js";

const bookSlug = "ultimate-b2";
const componentSlug = "ultimate-b2-workbook";
const bucket = "private-fixture";
const checksum = (marker) => marker.repeat(64);

function fixture(role = "managed_page_image") {
  const descriptor = { sha256: checksum(role === "managed_page_image" ? "a" : role === "activity_artwork" ? "b" : "c"), extension: role === "unit_extra_video" ? "mp4" : "png", mediaType: role === "unit_extra_video" ? "video/mp4" : "image/png", role };
  const ownership = role === "managed_page_image"
    ? { publication_page_id: "page-one" }
    : role === "unit_extra_video"
      ? { unit_slug: "unit-1", unit_extra_item_id: "video-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", asset_slot: "video-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
      : { native_activity_id: "ultimate-b2-wb-u1-p1-o1", asset_slot: "background" };
  const objectKey = role === "managed_page_image"
    ? buildBuilderPageAssetObjectKey({ bookSlug, componentSlug, pageId: ownership.publication_page_id, checksum: descriptor.sha256, extension: `.${descriptor.extension}` })
    : role === "unit_extra_video"
      ? buildUnitExtraAssetObjectKey({ bookSlug, componentSlug, unitSlug: ownership.unit_slug, itemId: ownership.unit_extra_item_id, checksum: descriptor.sha256, extension: ".mp4" })
      : buildNativeActivityAssetObjectKey({ bookSlug, componentSlug, activityId: ownership.native_activity_id, assetSlot: ownership.asset_slot, checksum: descriptor.sha256, extension: ".png" });
  return {
    descriptor,
    row: {
      id: randomUUID(), book_slug: bookSlug, component_slug: componentSlug,
      asset_role: role === "managed_page_image" ? "page_image" : role,
      checksum_sha256: descriptor.sha256, byte_size: role === "unit_extra_video" ? 4096 : 68,
      mime_type: descriptor.mediaType, object_key: objectKey, storage_profile: "private", storage_bucket: bucket,
      publication_status: "draft", access_level: "internal", source_metadata: ownership,
    },
  };
}

function storageFor(source, mutateHead = {}) {
  return {
    bucket: () => bucket,
    async head({ objectKey }) {
      assert.equal(objectKey, source.row.object_key);
      return { checksumSha256: source.row.checksum_sha256, byteSize: Number(source.row.byte_size), contentType: source.row.mime_type, ...mutateHead };
    },
    async copyVerifiedImmutable() { throw new Error("CopyObject must never be selected by pin verification"); },
  };
}

function storageForSources(sources, verifiedObjectKeys = []) {
  return {
    bucket: () => bucket,
    async head({ objectKey }) {
      const source = sources.find((candidate) => candidate.row.object_key === objectKey);
      assert.ok(source, "every role-scoped source must be HEAD-verified");
      verifiedObjectKeys.push(objectKey);
      return { checksumSha256: source.row.checksum_sha256, byteSize: Number(source.row.byte_size), contentType: source.row.mime_type };
    },
    async copyVerifiedImmutable() { throw new Error("CopyObject must never be selected by pin verification"); },
  };
}

test("all three private publication roles freeze exact canonical source identities without CopyObject", async () => {
  for (const role of ["managed_page_image", "activity_artwork", "unit_extra_video"]) {
    const source = fixture(role);
    const pins = await freezeComponentPublicationAssetPins(storageFor(source), { bookSlug, componentSlug, assetManifest: [source.descriptor], nativeAssetSources: [source] });
    assert.equal(pins.length, 1);
    assert.equal(pins[0].assetId, source.row.id);
    assert.equal(pins[0].objectKey, source.row.object_key);
    assert.equal(pins[0].pinSha256.length, 64);
    assert.match(publicationAssetPinFingerprint(pins[0]), /^builder-release-asset-pin-v1\n/);
  }
});

test("identical bytes under different legitimate roles produce two independently verified pins", async () => {
  const sharedChecksum = checksum("e");
  const artwork = fixture("activity_artwork");
  const video = fixture("unit_extra_video");
  artwork.descriptor = { sha256: sharedChecksum, extension: "mp4", mediaType: "video/mp4", role: "activity_artwork" };
  artwork.row.checksum_sha256 = sharedChecksum;
  artwork.row.byte_size = video.row.byte_size;
  artwork.row.mime_type = "video/mp4";
  artwork.row.object_key = buildNativeActivityAssetObjectKey({
    bookSlug,
    componentSlug,
    activityId: artwork.row.source_metadata.native_activity_id,
    assetSlot: artwork.row.source_metadata.asset_slot,
    checksum: sharedChecksum,
    extension: ".mp4",
  });
  video.descriptor = { ...video.descriptor, sha256: sharedChecksum };
  video.row.checksum_sha256 = sharedChecksum;
  video.row.object_key = buildUnitExtraAssetObjectKey({
    bookSlug,
    componentSlug,
    unitSlug: video.row.source_metadata.unit_slug,
    itemId: video.row.source_metadata.unit_extra_item_id,
    checksum: sharedChecksum,
    extension: ".mp4",
  });
  const sources = [artwork, video];
  const verifiedObjectKeys = [];
  const pins = await freezeComponentPublicationAssetPins(storageForSources(sources, verifiedObjectKeys), {
    bookSlug,
    componentSlug,
    assetManifest: sources.map((source) => source.descriptor),
    nativeAssetSources: sources,
  });
  assert.deepEqual(verifiedObjectKeys.sort(), sources.map((source) => source.row.object_key).sort());
  assert.deepEqual(pins.map((pin) => pin.role), ["activity_artwork", "unit_extra_video"]);
  assert.equal(new Set(pins.map((pin) => pin.pinSha256)).size, 2);
  for (const source of sources) {
    const pin = pins.find((candidate) => candidate.role === source.descriptor.role);
    const ownerKey = source.descriptor.role === "unit_extra_video"
      ? source.row.source_metadata.unit_extra_item_id
      : source.row.source_metadata.native_activity_id;
    assert.deepEqual({
      assetId: pin.assetId,
      role: pin.role,
      sourceAssetRole: pin.sourceAssetRole,
      ownerKey: pin.ownerKey,
      assetSlot: pin.assetSlot,
      objectKey: pin.objectKey,
    }, {
      assetId: source.row.id,
      role: source.descriptor.role,
      sourceAssetRole: source.row.asset_role,
      ownerKey,
      assetSlot: source.row.source_metadata.asset_slot,
      objectKey: source.row.object_key,
    });
    assert.equal(pin.pinSha256, createHash("sha256").update(publicationAssetPinFingerprint(pin)).digest("hex"));
  }
});

test("source pin diagnostics are bounded and distinguish row, component, role, storage, object, checksum, size, and MIME failures", async () => {
  const scenarios = [
    ["source_asset_row_missing", (source) => { source.row.id = ""; }],
    ["source_component_mismatch", (source) => { source.row.component_slug = "ultimate-b2-grammar-book"; }],
    ["source_role_mismatch", (source) => { source.row.asset_role = "unit_extra_video"; }],
    ["source_storage_identity_invalid", (source) => { source.row.object_key += "-mutable"; }],
    ["source_checksum_mismatch", (_source, head) => { head.checksumSha256 = checksum("d"); }],
    ["source_byte_size_mismatch", (_source, head) => { head.byteSize = 99; }],
    ["source_media_type_mismatch", (_source, head) => { head.contentType = "image/webp"; }],
  ];
  for (const [failureClass, mutate] of scenarios) {
    const source = fixture();
    const head = {};
    mutate(source, head);
    await assert.rejects(
      freezeComponentPublicationAssetPins(storageFor(source, head), { bookSlug, componentSlug, assetManifest: [source.descriptor], nativeAssetSources: [source] }),
      (error) => error.code === "release_asset_unavailable" && error.failureClass === failureClass
        && !JSON.stringify(error).includes(source.row.object_key),
      failureClass,
    );
  }
  const source = fixture();
  await assert.rejects(
    freezeComponentPublicationAssetPins({ bucket: () => bucket, head: async () => { throw new Error("provider secret"); } }, { bookSlug, componentSlug, assetManifest: [source.descriptor], nativeAssetSources: [source] }),
    (error) => error.failureClass === "source_object_missing" && !JSON.stringify(error).includes("provider secret"),
  );
});

test("pin candidates reject duplicate or missing deterministic descriptors", async () => {
  const source = fixture();
  await assert.rejects(
    freezeComponentPublicationAssetPins(storageFor(source), { bookSlug, componentSlug, assetManifest: [source.descriptor, source.descriptor], nativeAssetSources: [source] }),
    (error) => error.failureClass === "source_asset_row_missing",
  );
  await assert.rejects(
    freezeComponentPublicationAssetPins(storageFor(source), { bookSlug, componentSlug, assetManifest: [source.descriptor], nativeAssetSources: [source, structuredClone(source)] }),
    (error) => error.failureClass === "release_pin_conflict",
  );
});
