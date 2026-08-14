import { createHash } from "node:crypto";
import { createBookAssetStorage } from "../../../lib/book-assets/storage.js";
import { buildBookAssetHostedOpenResponsePublicKey } from "../../../lib/book-assets/object-keys.js";
import { stableBuilderJson } from "../../../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { ultimateB2PublicationCanonicalSeeds, ultimateB2PublicationCompatibility } from "../../../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler.js";
import { assertStudentSafeReleaseProjection, normalizeUltimateB2PublicReleaseProjection, normalizeUltimateB2ReleaseSourceSnapshot, normalizeUltimateB2TeacherReleaseProjection } from "../../../src/data/ultimate-b2/componentPublication.js";
import { hostedTeacherImportAsSolution, normalizeUltimateB2HostedOpenResponseTeacherImport } from "../../../src/data/ultimate-b2/hostedOpenResponseImport.js";
import { json } from "./shared.js";

const SHA256 = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const privateJson = (statusCode, body) => json(statusCode, body, { "Cache-Control": "private, no-store", Vary: "Cookie" });

async function activeReleaseRow(sql, { bookSlug, componentSlug }) {
  const rows = await sql`
    select release.*
    from book_component_publication_heads head
    join book_component_releases release on release.id=head.release_id and release.book_component_id=head.book_component_id
    join book_packages package on package.id=release.book_package_id
    join book_components component on component.id=release.book_component_id and component.book_package_id=package.id
    where package.slug=${bookSlug} and component.slug=${componentSlug} limit 1
  `;
  return rows[0] || null;
}

async function publishedReleaseRow(sql, { bookSlug, componentSlug, releaseId }) {
  const rows = await sql`
    select release.*
    from book_component_releases release
    join book_packages package on package.id=release.book_package_id
    join book_components component on component.id=release.book_component_id and component.book_package_id=package.id
    where package.slug=${bookSlug} and component.slug=${componentSlug} and release.id=${releaseId}
      and exists(select 1 from book_component_publication_events event where event.release_id=release.id and event.book_component_id=release.book_component_id)
    limit 1
  `;
  return rows[0] || null;
}

function verifiedPublicProjection(row) {
  const compatibility = ultimateB2PublicationCompatibility();
  if (row.runtime_compatibility_sha256 !== compatibility) throw new Error("Published release runtime compatibility mismatch");
  const seeds = ultimateB2PublicationCanonicalSeeds();
  const sourceSnapshot = normalizeUltimateB2ReleaseSourceSnapshot(row.source_snapshot, seeds);
  const projection = normalizeUltimateB2PublicReleaseProjection(row.public_projection, seeds);
  const teacherProjection = normalizeUltimateB2TeacherReleaseProjection(row.teacher_projection, seeds);
  assertStudentSafeReleaseProjection(projection);
  if (sha256(stableBuilderJson(sourceSnapshot)) !== row.source_snapshot_sha256
    || sha256(stableBuilderJson(projection)) !== row.public_projection_sha256
    || sha256(stableBuilderJson(teacherProjection)) !== row.teacher_projection_sha256
    || sha256(stableBuilderJson({ compatibility, sourceSnapshot, publicProjection: projection, teacherProjection })) !== row.release_sha256) throw new Error("Published release checksum mismatch");
  return projection;
}

export async function getActiveComponentRelease(sql, query) {
  if (query.bookSlug !== "ultimate-b2" || query.componentSlug !== "ultimate-b2-students-book") return privateJson(404, { error: "Component not found" });
  const row = await activeReleaseRow(sql, query);
  if (!row) return privateJson(404, { error: "no_publication" });
  const projection = verifiedPublicProjection(row);
  return privateJson(200, { releaseId: row.id, releaseNumber: Number(row.release_number), releaseSha256: row.release_sha256, compatibility: row.runtime_compatibility_sha256, projection });
}

export async function getPublishedReleaseAsset(sql, query, { storage = createBookAssetStorage() } = {}) {
  const extension = String(query.extension || "").toLowerCase();
  if (query.bookSlug !== "ultimate-b2" || query.componentSlug !== "ultimate-b2-students-book" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(query.releaseId || "")) || !SHA256.test(String(query.sha256 || "")) || !["png", "jpg", "webp"].includes(extension)) return json(404, { error: "Asset not found" });
  const row = await publishedReleaseRow(sql, query);
  if (!row) return json(404, { error: "Asset not found" });
  const projection = verifiedPublicProjection(row);
  if (!projection.assets.some((asset) => asset.sha256 === query.sha256 && asset.extension === extension)) return json(404, { error: "Asset not found" });
  const objectKey = buildBookAssetHostedOpenResponsePublicKey({ checksum: query.sha256, extension: `.${extension}` });
  return { statusCode: 302, headers: { Location: storage.publicUrl(objectKey), "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" }, body: "" };
}

export async function getPublishedTeacherSolutionOverride(sql, stableActivityId) {
  const row = await activeReleaseRow(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" });
  if (!row) return null;
  verifiedPublicProjection(row);
  const raw = row.teacher_projection?.solutions?.[stableActivityId];
  if (!raw) return null;
  const seed = ultimateB2PublicationCanonicalSeeds()[stableActivityId];
  if (!seed) return null;
  const teacher = normalizeUltimateB2HostedOpenResponseTeacherImport(raw, stableActivityId, seed.questions.map((question) => question.id));
  return hostedTeacherImportAsSolution(teacher, stableActivityId, seed.questions.map((question) => question.id));
}
