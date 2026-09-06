import { buildBuilderPageAssetObjectKey } from "../../lib/book-assets/object-keys.js";
import { builderDocumentSha256 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ManagedComponentRelease } from "../../netlify-sites/ultimate-b2-builder/server/_builder-managed-publication-compiler.js";
import { resolveNativeActivityKind } from "../../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { createNativeOpenResponseQuestion } from "../../src/data/native-activities/nativeOpenResponse.js";
import { nativeChildIdFromUuid } from "../../src/data/native-activities/nativeChildIdentity.js";
import { createHash } from "node:crypto";

export const publishedManagedPageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZLsAAAAASUVORK5CYII=", "base64");
export const publishedManagedPageSha256 = createHash("sha256").update(publishedManagedPageBytes).digest("hex");

const source = (payload) => ({ payload, revision: 1, sha256: builderDocumentSha256(payload) });
export function publishedManagedBookFixture(componentSlug = "ultimate-b2-workbook", { checksum = publishedManagedPageSha256, byteSize = publishedManagedPageBytes.length, width = 1, height = 1, title = "Explain your answer", teacherAnswer = "PUBLISHED_BOOK_PRIVATE_TEACHER_SENTINEL" } = {}) {
  const prefix = componentSlug === "ultimate-b2-workbook" ? "wb" : "gb";
  const units = Array.from({ length: 10 }, (_, index) => ({ id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, slug: `unit-${index + 1}`, title: `Unit ${index + 1}`, unit_number: index + 1, sort_order: index + 1 }));
  const pages = [1, 2].map((number) => {
    const pageId = `${prefix}-page-${number}`;
    return { id: `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`, stable_key: `${componentSlug}/pages/${pageId}`,
      label: `Page ${number}`, sort_order: number, source_metadata: { is_active: true, section_title: "Vocabulary", printed_label: String(number + 3) },
      unit_id: units[0].id, unit_slug: "unit-1", unit_title: "Unit 1", unit_number: 1, unit_sort_order: 1,
      asset_id: `30000000-0000-4000-8000-${String(number).padStart(12, "0")}`, asset_role: "page_image",
      object_key: buildBuilderPageAssetObjectKey({ bookSlug: "ultimate-b2", componentSlug, pageId, checksum, extension: ".png" }),
      storage_profile: "private", storage_bucket: "private-assets", publication_status: "draft", access_level: "internal", mime_type: "image/png", byte_size: byteSize, checksum_sha256: checksum, width, height };
  });
  const index = []; const activities = {}; const hotspots = {};
  const kind = resolveNativeActivityKind("open-response");
  for (let number = 1; number <= 2; number += 1) {
    const pageId = `${prefix}-page-${number}`;
    const activityId = `ultimate-b2-${prefix}-unit-1-page-${number}-o1`;
    const questionId = nativeChildIdFromUuid("q", `40000000-0000-4000-8000-${String(number).padStart(12, "0")}`);
    const publicDocument = kind.createBlankPublic({ activityId, title: `${title} ${number}`, placement: { pageId } });
    publicDocument.parts[0].interaction.questions = [{ ...createNativeOpenResponseQuestion(questionId), prompt: `Explain question ${number}.` }];
    const teacherDocument = kind.createBlankTeacher({ activityId });
    teacherDocument.parts[0].solution.modelAnswers = [{ questionId, text: teacherAnswer }];
    const entry = { activityId, kind: "open-response", placement: { pageId }, sortOrder: number };
    index.push(entry); activities[activityId] = { index: entry, public: source(publicDocument), teacher: source(teacherDocument) };
    hotspots[pageId] = [{ id: `${prefix}-hotspot-${number}`, pageId, unitNumber: 1, left: 10, top: 20, width: 35, height: 15,
      label: title, actionType: "normalized_activity", activityKey: activityId }];
  }
  const compiled = compileUltimateB2ManagedComponentRelease({ pages: { revision: 1, units, rows: pages },
    documents: { hotspots: source({ schemaVersion: "1.0", packageSlug: "ultimate-b2", componentSlug, pages: hotspots }), activityLifecycle: null },
    native: { index: source({ schemaVersion: "1.0", activities: index }), activities, assetRows: [] } }, componentSlug);
  return compiled;
}
