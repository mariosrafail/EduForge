import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson, atomicWriteText, readJsonFile } from "../../atomic-json-store.js";
import { isPathWithin } from "../../path-safety.js";
import { sha256Bytes } from "./source-files.js";

function escape(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function aggregate(files) { const hash = createHash("sha256"); for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) hash.update(`${file.path}\0${file.sha256}\n`); return hash.digest("hex"); }
export async function materializeActivityReview({ projectDirectory }) {
  const projectRoot = await fs.realpath(path.resolve(projectDirectory)); const profileRoot = path.join(projectRoot, "profiles", "ultimate-air-v2");
  const student = await readJsonFile(path.join(profileRoot, "student-activity-candidates.json")); const reviews = await readJsonFile(path.join(profileRoot, "activity-review-items.json"));
  const outputRoot = path.join(profileRoot, "review-assets", "activities"); if (!isPathWithin(projectRoot, outputRoot)) throw new Error("Activity materialization output is unsafe");
  const rows = student.candidates.map((item) => `<article><h2>${escape(item.normalizedCandidateType)}</h2><p><code>${escape(item.sourceObjectLocator)}</code></p><dl><dt>Disposition</dt><dd>${escape(item.disposition)}</dd><dt>Support</dt><dd>${escape(item.runtimeSupportStatus)}</dd><dt>Questions</dt><dd>${item.questions.length}</dd></dl>${item.questions.map((q) => `<section><p>${escape(q.prompt || "[raster prompt]")}</p><ol>${q.options.map((o) => `<li>${escape(o.text || "[raster option]")}</li>`).join("")}</ol></section>`).join("")}<p>Review: ${escape(item.reviewItemIds.join(", ") || "none")}</p></article>`).join("\n");
  const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ultimate activity review</title><style>body{font-family:system-ui;margin:24px;background:#f4f6f8;color:#17212b}article{background:#fff;border:1px solid #ccd4dc;border-radius:8px;padding:16px;margin:12px 0}dt{font-weight:700}dd{margin:0 0 6px}</style></head><body><h1>Ultimate activity review</h1><p>Student-safe local authoring review. No answers, scoring, external scripts, or network resources.</p>${rows}</body></html>\n`;
  const metadata = { schemaVersion: "1.0", scope: "activities", audience: "student-safe-authoring", candidateCount: student.candidates.length, reviewItemCount: reviews.summary.total, sourceArtifactDigest: sha256Bytes(Buffer.from(JSON.stringify(student), "utf8")) };
  const metadataPath = path.join(outputRoot, "review-metadata.json"); const htmlPath = path.join(outputRoot, "activity-review.html");
  await atomicWriteJson(metadataPath, metadata, { allowedRoot: outputRoot }); await atomicWriteText(htmlPath, html, { allowedRoot: outputRoot });
  const metadataBytes = await fs.readFile(metadataPath); const htmlBytes = await fs.readFile(htmlPath);
  const files = [{ path: "activity-review.html", sha256: sha256Bytes(htmlBytes), byteSize: htmlBytes.length }, { path: "review-metadata.json", sha256: sha256Bytes(metadataBytes), byteSize: metadataBytes.length }];
  return { outputDirectory: outputRoot, materializedFileCount: files.length, aggregateHash: aggregate(files), reviewHtmlPath: path.join(outputRoot, "activity-review.html"), files };
}
