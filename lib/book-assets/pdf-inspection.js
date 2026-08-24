import { createHash } from "node:crypto";

export const MANAGED_PDF_MAXIMUM_BYTES = 25 * 1024 * 1024;

export function inspectManagedPdf(input) {
  const bytes = Buffer.from(input || []);
  if (!bytes.length) throw Object.assign(new Error("empty_pdf"), { code: "empty_pdf" });
  if (bytes.length > MANAGED_PDF_MAXIMUM_BYTES) throw Object.assign(new Error("pdf_file_too_large"), { code: "pdf_file_too_large" });
  if (!/^%PDF-1\.[0-7](?:\r\n|\r|\n|\s)/.test(bytes.subarray(0, 16).toString("ascii")) || !/%%EOF\s*$/.test(bytes.subarray(Math.max(0, bytes.length - 2_048)).toString("latin1"))) {
    throw Object.assign(new Error("invalid_pdf"), { code: "invalid_pdf" });
  }
  return {
    bytes,
    mimeType: "application/pdf",
    extension: ".pdf",
    byteSize: bytes.length,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    width: null,
    height: null,
  };
}
