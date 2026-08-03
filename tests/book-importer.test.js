import test from "node:test";
import assert from "node:assert/strict";
import { detectMimeType, sha256 } from "../scripts/books/file-inspection.mjs";
import { assertCompatibleExistingAssets, cleanupUploadedObjects, executeImport } from "../scripts/books/importer.mjs";

function fixtureManifest() {
  return {
    schemaVersion: "1.0",
    publisher: { id: "fixture-publisher", name: "Fixture Publisher", slug: "fixture-publisher" },
    book: { id: "fixture-book", slug: "fixture-book", title: "Fixture Book", version: "1.0.0" },
    edition: { id: "fixture-edition", identifier: "test-edition" },
    components: [{ id: "fixture-component", slug: "students-book", title: "Students Book", type: "students_book", units: [] }],
    assets: [{ id: "fixture-icon", logicalKey: "fixture-book.cover", role: "cover", source: "public/icon.svg", mimeType: "image/svg+xml", accessLevel: "public", publicationStatus: "published", classification: "preview", componentId: "fixture-component", imageStrategy: "preserve" }],
  };
}

test("checksum calculation is deterministic", () => {
  assert.equal(sha256(Buffer.from("Hamilton House LMS")), "5aa8ae03221ea7d38c9317377ce83de56ddf353c3eb13cbfaae27aba385f5cc6");
});

test("MIME detection uses file signatures rather than extensions alone", () => {
  assert.equal(detectMimeType(Buffer.from("%PDF-1.7\nfixture")), "application/pdf");
  assert.equal(detectMimeType(Buffer.from("not really an image")), null);
});

test("import dry run validates and plans without storage or database credentials", async () => {
  const result = await executeImport({ manifest: fixtureManifest(), rawManifest: "fixture", manifestChecksum: "b".repeat(64), sourceRoot: process.cwd(), dryRun: true });
  assert.equal(result.status, "dry-run");
  assert.equal(result.summary.sourceAssets, 1);
  assert.equal(result.summary.objectVariants, 1);
  assert.equal(result.summary.uploaded, 0);
});

test("idempotent reruns accept identical checksums and require version changes for changed bytes", () => {
  const planned = [{ logicalKey: "fixture.page", checksumSha256: "a".repeat(64) }];
  const existing = [{ stable_logical_key: "fixture.page", checksum_sha256: "a".repeat(64) }];
  assert.equal(assertCompatibleExistingAssets(planned, existing).has("fixture.page"), true);
  assert.throws(() => assertCompatibleExistingAssets([{ ...planned[0], checksumSha256: "b".repeat(64) }], existing), /new manifest book version/);
});

test("interrupted import cleanup removes unpublished delivery objects but retains archives", async () => {
  const deleted = [];
  const storage = { delete: async (item) => { deleted.push(item.objectKey); if (item.objectKey === "private/fail") throw new Error("injected failure"); } };
  const result = await cleanupUploadedObjects(storage, [{ profile: "private", objectKey: "private/ok" }, { profile: "archive", objectKey: "archive/source" }, { profile: "public", objectKey: "private/fail" }]);
  assert.deepEqual(result, { removed: 1, failed: 1, retainedArchive: 1 });
  assert.deepEqual(deleted, ["private/ok", "private/fail"]);
});

test("invalid source traversal fails before any import side effect", async () => {
  const manifest = fixtureManifest();
  manifest.assets[0].source = "../secret.svg";
  await assert.rejects(() => executeImport({ manifest, rawManifest: "fixture", manifestChecksum: "b".repeat(64), sourceRoot: process.cwd(), dryRun: true }), /escapes|unavailable/);
});

test("partial upload failure cleans unpublished objects and never starts publication transaction", async () => {
  const manifest = fixtureManifest();
  manifest.assets.push({ ...manifest.assets[0], id: "fixture-icon-two", logicalKey: "fixture-book.cover-two" });
  const queries = [];
  const client = {
    query: async (text) => {
      queries.push(text);
      if (text.startsWith("insert into publishers")) return { rows: [{ id: "publisher-db" }] };
      if (text.startsWith("insert into book_packages")) return { rows: [{ id: "package-db", status: "draft", publisher_id: "publisher-db" }] };
      if (text.startsWith("insert into book_components")) return { rows: [{ id: "component-db", slug: "students-book" }] };
      if (text.startsWith("select id,status from book_asset_imports")) return { rows: [] };
      if (text.startsWith("insert into book_editions")) return { rows: [{ id: "edition-db" }] };
      if (text.startsWith("insert into book_asset_imports")) return { rows: [{ id: "import-db" }] };
      if (text.startsWith("select stable_logical_key")) return { rows: [] };
      return { rows: [] };
    },
  };
  const deleted = [];
  let uploads = 0;
  const storage = {
    upload: async () => { uploads += 1; if (uploads === 2) throw new Error("injected upload interruption"); },
    delete: async (item) => { deleted.push(item.objectKey); },
  };
  await assert.rejects(() => executeImport({ manifest, rawManifest: "fixture", manifestChecksum: "c".repeat(64), sourceRoot: process.cwd(), environment: "staging", confirmation: "staging", concurrency: 1, storage, client }), /injected upload interruption/);
  assert.equal(deleted.length, 1);
  assert.equal(queries.includes("begin"), false);
  assert.equal(queries.some((query) => query.startsWith("update book_assets set publication_status='published'")), false);
});

test("successful publication archives the prior current version before activating the new import", async () => {
  const queries = [];
  const client = {
    query: async (text) => {
      queries.push(text);
      if (text.startsWith("insert into publishers")) return { rows: [{ id: "publisher-db" }] };
      if (text.startsWith("insert into book_packages")) return { rows: [{ id: "package-db", status: "active", publisher_id: "publisher-db" }] };
      if (text.startsWith("insert into book_components")) return { rows: [{ id: "component-db", slug: "students-book" }] };
      if (text.startsWith("select id,status from book_asset_imports")) return { rows: [] };
      if (text.startsWith("insert into book_editions")) return { rows: [{ id: "edition-db" }] };
      if (text.startsWith("insert into book_asset_imports")) return { rows: [{ id: "import-db" }] };
      if (text.startsWith("select stable_logical_key")) return { rows: [] };
      if (text.startsWith("insert into book_assets")) return { rows: [{ id: "asset-db" }] };
      return { rows: [] };
    },
  };
  const storage = {
    upload: async () => ({ reused: false }),
    bucket: (profile) => `${profile}-bucket`,
    delete: async () => {},
  };
  const result = await executeImport({ manifest: fixtureManifest(), rawManifest: "fixture", manifestChecksum: "d".repeat(64), sourceRoot: process.cwd(), environment: "staging", confirmation: "staging", storage, client });
  assert.equal(result.status, "published");
  const archiveAssets = queries.findIndex((query) => query.startsWith("update book_assets set publication_status='archived'"));
  const publishAssets = queries.findIndex((query) => query.startsWith("update book_assets set publication_status='published'"));
  const archiveImports = queries.findIndex((query) => query.startsWith("update book_asset_imports set status='archived'"));
  const publishImport = queries.findIndex((query) => query.startsWith("update book_asset_imports set status='published'"));
  assert.ok(archiveAssets > queries.indexOf("begin") && archiveAssets < publishAssets);
  assert.ok(archiveImports > queries.indexOf("begin") && archiveImports < publishImport);
  assert.equal(queries.at(-1), "commit");
});
