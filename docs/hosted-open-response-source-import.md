# Hosted Open Response publisher-source import

The hosted Ultimate B2 Builder can import publisher source only for an existing Open Response activity registered by the repository. It does not create activities or publish production content.

## Source package

Select these files together:

- exactly one decoded `obj_params.xml`;
- exactly one decoded `ebook_obj_params.xml`;
- every referenced PNG, JPEG, or WebP raster file.

ZIP, PDF, SVG, audio, video, arbitrary media, and encoded IWB inputs are unsupported. The server re-runs the repository's deterministic publisher importer against the uploaded bytes. The pipeline uses no AI, OCR, or image interpretation.

## Hosted storage and persistence boundary

Prepare creates an expiring database-backed upload session and server-controlled object keys. The browser uploads directly to signed, exact-object URLs in the `private` storage profile. Browser filename, MIME, size, hashes, image dimensions, and XML content are not authoritative.

Finalize downloads the exact registered private objects, applies XML/entity/path/raster limits, and validates activity/question identity. A successful import writes content-addressed runtime rasters to `public`, preserves an immutable source/audit snapshot in `archive`, and commits separate public and Teacher projections. Task 5's `open_response` text document remains separate and overlays the imported prompts after it is saved.

Failed or stale imports never replace the last committed revision. Private staging cleanup is best-effort; archive objects and shared content-addressed public assets are not deleted by Task 6. Operational cleanup should remove only expired private session objects using their recorded exact keys.

The existing `BOOK_ASSET_*` server environment variables configure storage. Never expose them through `VITE_*`. Tests use isolated in-memory/local transport and do not require real S3 or R2.

## Object-storage CORS

The private staging bucket must allow authenticated Builder origins to perform `PUT` with `Content-Type` against presigned URLs. It should allow only required methods/headers and should not expose credentials. Repository tests cannot verify an external bucket's CORS, credentials, CDN, or public-base configuration; configure and validate those separately in the non-production hosting environment.

## Review and publication boundary

The public import preview is GET-only, `no-store` JSON and contains no source XML, archive/private keys, or Teacher answers. Imported Teacher answers are returned only by a narrow GET-only projection for the requested supported activity, and the Builder server requires a signed, short-lived `previewAuthorization` (or valid Builder session) with matching action and activity scope. Bare Viewer mode requests neither projection. Exact release preview keeps the public document separate and loads the protected Teacher solution/native Teacher document on demand. This preview boundary is separate from production LMS Teacher authorization.

This workflow saves a draft/review revision. It does not implement Draft → Preview → Publish, production asset metadata publication, catalog changes, or garbage collection.
