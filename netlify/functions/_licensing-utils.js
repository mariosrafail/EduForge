import { createHash, randomBytes, randomUUID } from "node:crypto";

const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function normalizeAccessCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashAccessCode(value) {
  return createHash("sha256").update(normalizeAccessCode(value)).digest("hex");
}

export function maskAccessCode(value) {
  const normalized = normalizeAccessCode(value);
  return `••••-${normalized.slice(-4)}`;
}

export function generateAccessCode(prefix = "BOOK") {
  const bytes = randomBytes(16);
  let body = "";
  for (const byte of bytes) body += codeAlphabet[byte % codeAlphabet.length];
  return `${normalizeAccessCode(prefix).slice(0, 4) || "BOOK"}-${body.match(/.{1,4}/g).join("-")}`;
}

export function generateUniqueAccessCodes(quantity, prefix) {
  const codes = new Set();
  while (codes.size < quantity) codes.add(generateAccessCode(prefix));
  return [...codes].map((code) => ({ id: randomUUID(), code, code_hash: hashAccessCode(code), code_mask: maskAccessCode(code) }));
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function generatedCodesCsv({ batchId, batchLabel, packageTitle, expiresAt, codes }) {
  const rows = [["batch_id", "batch_label", "book_package", "access_code", "expires_at"]];
  for (const code of codes) rows.push([batchId, batchLabel || "", packageTitle, code, expiresAt || ""]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function publicBatch(row = {}) {
  return {
    id: row.id,
    label: row.label || "",
    bookPackageId: row.book_package_id,
    bookPackageTitle: row.book_package_title,
    quantity: Number(row.quantity || 0),
    unusedCount: Number(row.unused_count || 0),
    redeemedCount: Number(row.redeemed_count || 0),
    expiredCount: Number(row.expired_count || 0),
    revokedCount: Number(row.revoked_count || 0),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    initialExportedAt: row.initial_exported_at,
  };
}

