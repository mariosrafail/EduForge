import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyAssetAccess, canDeliverAsset } from "../lib/book-assets/access.js";
import { normalizeSignedUrlTtl, readBookAssetStorageConfig, signedUrlTtlBounds } from "../lib/book-assets/config.js";
import { validateBookManifestStructure } from "../lib/book-assets/manifest.js";
import { buildBookAssetObjectKey, ensureSourceWithinRoot, normalizeObjectKeySegment, validateObjectKey } from "../lib/book-assets/object-keys.js";
import { S3BookAssetStorage } from "../lib/book-assets/storage.js";
import { getBookAssetAccess } from "../netlify/functions/_book-asset-access.js";

test("object keys normalize segments and include immutable version/checksum identity", () => {
  const key = buildBookAssetObjectKey({ publisherSlug: "Hamilton House", bookSlug: "Ultimate B2", edition: "Current", version: "1.2.0", componentSlug: "Students Book", unitSlug: "Unit 2", pageNumber: 20, role: "page_image", fileName: "Page 20.png", checksum: "a".repeat(64) });
  assert.equal(key, "publishers/hamilton-house/books/ultimate-b2/editions/current/versions/1.2.0/components/students-book/units/unit-2/pages/20/page-20.aaaaaaaaaaaa.png");
  assert.equal(normalizeObjectKeySegment("  Grámmar / Book  "), "grammar-book");
  assert.throws(() => validateObjectKey("books/../secret"), /unsafe/);
  assert.throws(() => validateObjectKey("books//secret"), /unsafe/);
  assert.throws(() => ensureSourceWithinRoot(process.cwd(), "../outside.png"), /escapes/);
});

test("signed URL TTL is short, bounded, and storage configuration remains server named", () => {
  assert.equal(normalizeSignedUrlTtl(undefined), signedUrlTtlBounds.default);
  assert.equal(normalizeSignedUrlTtl(30), 30);
  assert.throws(() => normalizeSignedUrlTtl(29), /integer from/);
  assert.throws(() => normalizeSignedUrlTtl(901), /integer from/);
  const config = readBookAssetStorageConfig({ BOOK_ASSET_STORAGE_PROVIDER: "s3", BOOK_ASSET_S3_ENDPOINT: "https://r2.example/", BOOK_ASSET_S3_REGION: "auto", BOOK_ASSET_S3_ACCESS_KEY_ID: "key", BOOK_ASSET_S3_SECRET_ACCESS_KEY: "secret", BOOK_ASSET_PUBLIC_BUCKET: "public", BOOK_ASSET_PRIVATE_BUCKET: "private", BOOK_ASSET_ARCHIVE_BUCKET: "archive", BOOK_ASSET_PUBLIC_BASE_URL: "https://books.example", BOOK_ASSET_SIGNED_URL_TTL_SECONDS: "90" });
  assert.equal(config.endpoint, "https://r2.example");
  assert.equal(config.signedUrlTtlSeconds, 90);
});

test("storage uploads are conditional and verify checksum metadata", async () => {
  const commands = [];
  let headCalls = 0;
  const client = { send: async (command) => {
    commands.push(command);
    if (command.constructor.name === "HeadObjectCommand") {
      headCalls += 1;
      if (headCalls === 1) { const error = new Error("Not Found"); error.$metadata = { httpStatusCode: 404 }; throw error; }
      return { ContentLength: 3, ContentType: "image/webp", Metadata: { sha256: "a".repeat(64) } };
    }
    return {};
  } };
  const storage = new S3BookAssetStorage({ endpoint: "https://s3.invalid", region: "auto", accessKeyId: "key", secretAccessKey: "secret", publicBucket: "public", privateBucket: "private", archiveBucket: "archive", publicBaseUrl: "https://public.invalid", signedUrlTtlSeconds: 60 }, client);
  const result = await storage.upload({ profile: "private", objectKey: "publishers/test/books/test/file.aaaaaaaaaaaa.webp", body: Buffer.from("abc"), contentType: "image/webp", checksumSha256: "a".repeat(64), byteSize: 3 });
  const put = commands.find((command) => command.constructor.name === "PutObjectCommand");
  assert.equal(put.input.IfNoneMatch, "*");
  assert.equal(result.reused, false);
});

test("public/protected access classification denies non-published and internal assets", () => {
  assert.equal(classifyAssetAccess({ publication_status: "published", access_level: "public" }), "public");
  assert.equal(classifyAssetAccess({ publication_status: "published", access_level: "entitled" }), "protected");
  assert.equal(classifyAssetAccess({ publication_status: "draft", access_level: "public" }), "denied");
  assert.equal(canDeliverAsset({ publication_status: "published", access_level: "entitled" }, false), false);
  assert.equal(canDeliverAsset({ publication_status: "published", access_level: "entitled" }, true), true);
});

test("Ultimate B2 manifest rejects duplicate ids, invalid MIME, bad references, unsafe content, and missing scored answers", async () => {
  const manifest = JSON.parse(await readFile("books/ultimate-b2/ultimate-b2.students-book-unit-2.manifest.json", "utf8"));
  assert.deepEqual(validateBookManifestStructure(manifest), { valid: true, errors: [] });
  const invalid = structuredClone(manifest);
  invalid.assets[1].id = invalid.assets[0].id;
  invalid.assets[1].mimeType = "text/html";
  invalid.assets[1].pageId = "missing-page";
  invalid.components[0].units[0].lessons[0].activities[2].answers = {};
  invalid.components[0].units[0].lessons[0].activities[2].instructions = "<script>alert(1)</script>";
  const result = validateBookManifestStructure(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /duplicates|unsupported|unknown page|no answers|unsafe HTML/i);
});

test("protected asset delivery is entitlement-gated and uses non-disclosing denials", async () => {
  const published = { id: "00000000-0000-4000-8000-000000000001", book_package_id: "00000000-0000-4000-8000-000000000002", package_status: "active", publication_status: "published", access_level: "entitled", storage_profile: "private", object_key: "publishers/test/books/test/file.aaaaaaaaaaaa.webp", stable_logical_key: "book.page-1", asset_role: "page_image", mime_type: "image/webp", byte_size: 10, checksum_sha256: "a".repeat(64), width: 10, height: 10, duration_seconds: null };
  const storage = { config: { signedUrlTtlSeconds: 60 }, signedGetUrl: async () => "https://signed.invalid/private", publicUrl: () => "https://public.invalid/object" };
  let entitled = false;
  const sql = async (strings) => strings.join("?").includes("from book_assets") ? [published] : entitled ? [{ "?column?": 1 }] : [];
  const user = { id: "user-1", school_id: "school-1" };
  let response = await getBookAssetAccess(sql, user, { logicalKey: "book.page-1" }, { storage });
  assert.equal(response.statusCode, 404);
  assert.equal(JSON.parse(response.body).error, "Book asset not found");
  entitled = true;
  response = await getBookAssetAccess(sql, user, { logicalKey: "book.page-1" }, { storage });
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).url, "https://signed.invalid/private");
  const draftSql = async (strings) => strings.join("?").includes("from book_assets") ? [{ ...published, publication_status: "draft" }] : [{ ok: true }];
  assert.equal((await getBookAssetAccess(draftSql, user, { logicalKey: "book.page-1" }, { storage })).statusCode, 404);
});
