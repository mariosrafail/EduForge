import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUILDER_PRIVATE_UPLOAD_BUCKET = "hhplms-book-private-dev";
export const BUILDER_PRIVATE_UPLOAD_ORIGIN = "https://builder.hhplms.workers.dev";
export const BUILDER_PRIVATE_UPLOAD_METHOD = "PUT";
export const BUILDER_PRIVATE_UPLOAD_HEADER = "Content-Type";

const cloudflareApiRoot = "https://api.cloudflare.com/client/v4";

export function assertBuilderPrivateUploadBucket(bucketName = BUILDER_PRIVATE_UPLOAD_BUCKET) {
  if (bucketName !== BUILDER_PRIVATE_UPLOAD_BUCKET) {
    throw new Error(`Refusing R2 CORS access outside ${BUILDER_PRIVATE_UPLOAD_BUCKET}.`);
  }
  return bucketName;
}

function stringList(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : [];
}

export function isBuilderPrivateUploadRule(rule) {
  const origins = stringList(rule?.allowed?.origins);
  const methods = stringList(rule?.allowed?.methods);
  const headers = stringList(rule?.allowed?.headers);
  return origins.includes(BUILDER_PRIVATE_UPLOAD_ORIGIN)
    && !origins.includes("*")
    && methods.includes(BUILDER_PRIVATE_UPLOAD_METHOD)
    && !methods.includes("*")
    && headers.some((header) => header.toLowerCase() === BUILDER_PRIVATE_UPLOAD_HEADER.toLowerCase())
    && !headers.includes("*");
}

function policyRules(policy) {
  const rules = Array.isArray(policy) ? policy : policy?.rules;
  if (rules === undefined) return [];
  if (!Array.isArray(rules) || rules.some((rule) => !rule || typeof rule !== "object" || Array.isArray(rule))) {
    throw new Error("Cloudflare returned an invalid R2 CORS policy.");
  }
  return structuredClone(rules);
}

export function verifyBuilderPrivateUploadCors(policy, bucketName = BUILDER_PRIVATE_UPLOAD_BUCKET) {
  assertBuilderPrivateUploadBucket(bucketName);
  const rules = policyRules(policy);
  if (!rules.some(isBuilderPrivateUploadRule)) {
    throw new Error(`R2 CORS policy does not allow ${BUILDER_PRIVATE_UPLOAD_ORIGIN} to PUT with ${BUILDER_PRIVATE_UPLOAD_HEADER}.`);
  }
  return { bucketName, origin: BUILDER_PRIVATE_UPLOAD_ORIGIN, method: BUILDER_PRIVATE_UPLOAD_METHOD, header: BUILDER_PRIVATE_UPLOAD_HEADER, ruleCount: rules.length };
}

export function reconcileBuilderPrivateUploadCors(policy, bucketName = BUILDER_PRIVATE_UPLOAD_BUCKET) {
  assertBuilderPrivateUploadBucket(bucketName);
  const rules = policyRules(policy);
  if (rules.some(isBuilderPrivateUploadRule)) return { changed: false, rules };
  rules.push({
    allowed: {
      origins: [BUILDER_PRIVATE_UPLOAD_ORIGIN],
      methods: [BUILDER_PRIVATE_UPLOAD_METHOD],
      headers: [BUILDER_PRIVATE_UPLOAD_HEADER],
    },
  });
  return { changed: true, rules };
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function ruleCounts(rules) {
  const counts = new Map();
  for (const rule of rules) {
    const identity = JSON.stringify(canonicalize(rule));
    counts.set(identity, (counts.get(identity) || 0) + 1);
  }
  return counts;
}

export function verifyCorsRulesPreserved(beforePolicy, afterPolicy) {
  const before = ruleCounts(policyRules(beforePolicy));
  const after = ruleCounts(policyRules(afterPolicy));
  for (const [identity, count] of before) {
    if ((after.get(identity) || 0) < count) throw new Error("Cloudflare R2 CORS update did not preserve every existing rule.");
  }
  return true;
}

function cloudflareCredentials(environment = process.env) {
  const accountId = String(environment.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const apiToken = String(environment.CLOUDFLARE_API_TOKEN || "").trim();
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("CLOUDFLARE_ACCOUNT_ID is required and must be a 32-character account ID.");
  if (!apiToken) throw new Error("CLOUDFLARE_API_TOKEN is required for remote R2 CORS access.");
  return { accountId, apiToken };
}

function apiErrors(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  return errors.map(({ code, message }) => `${code || "unknown"}: ${String(message || "Cloudflare API error")}`).join("; ") || "Cloudflare API request failed";
}

async function cloudflareCorsRequest(method, bucketName, { environment = process.env, fetchImpl = fetch, rules } = {}) {
  assertBuilderPrivateUploadBucket(bucketName);
  const { accountId, apiToken } = cloudflareCredentials(environment);
  const response = await fetchImpl(`${cloudflareApiRoot}/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/cors`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      ...(rules ? { "Content-Type": "application/json" } : {}),
    },
    ...(rules ? { body: JSON.stringify({ rules }) } : {}),
  });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`Cloudflare R2 CORS ${method} returned a non-JSON response (${response.status}).`); }
  if (!response.ok || payload?.success !== true) throw new Error(`Cloudflare R2 CORS ${method} failed (${response.status}): ${apiErrors(payload)}`);
  return payload.result || {};
}

export async function readRemoteBuilderPrivateUploadCors(options = {}) {
  const bucketName = assertBuilderPrivateUploadBucket(options.bucketName);
  const result = await cloudflareCorsRequest("GET", bucketName, options);
  return { rules: policyRules(result) };
}

export async function verifyRemoteBuilderPrivateUploadCors(options = {}) {
  const bucketName = assertBuilderPrivateUploadBucket(options.bucketName);
  const policy = await readRemoteBuilderPrivateUploadCors({ ...options, bucketName });
  return verifyBuilderPrivateUploadCors(policy, bucketName);
}

export async function ensureRemoteBuilderPrivateUploadCors(options = {}) {
  const bucketName = assertBuilderPrivateUploadBucket(options.bucketName);
  const before = await readRemoteBuilderPrivateUploadCors({ ...options, bucketName });
  const reconciled = reconcileBuilderPrivateUploadCors(before, bucketName);
  if (reconciled.changed) await cloudflareCorsRequest("PUT", bucketName, { ...options, rules: reconciled.rules });
  const after = await readRemoteBuilderPrivateUploadCors({ ...options, bucketName });
  verifyBuilderPrivateUploadCors(after, bucketName);
  verifyCorsRulesPreserved(before, after);
  return { bucketName, changed: reconciled.changed, ruleCount: after.rules.length };
}

export function validateBuilderPrivateUploadCorsContract() {
  assert.equal(BUILDER_PRIVATE_UPLOAD_BUCKET, "hhplms-book-private-dev");
  assert.equal(BUILDER_PRIVATE_UPLOAD_ORIGIN, "https://builder.hhplms.workers.dev");
  assert.equal(BUILDER_PRIVATE_UPLOAD_METHOD, "PUT");
  assert.equal(BUILDER_PRIVATE_UPLOAD_HEADER, "Content-Type");
  const reconciled = reconcileBuilderPrivateUploadCors({ rules: [] });
  assert.equal(reconciled.changed, true);
  verifyBuilderPrivateUploadCors(reconciled);
  assert.equal(JSON.stringify(reconciled.rules).includes('"*"'), false);
  return { bucketName: BUILDER_PRIVATE_UPLOAD_BUCKET, origin: BUILDER_PRIVATE_UPLOAD_ORIGIN, method: BUILDER_PRIVATE_UPLOAD_METHOD, header: BUILDER_PRIVATE_UPLOAD_HEADER };
}

function commandLine() {
  const mode = process.argv[2] || "--check";
  const bucketOptionIndex = process.argv.indexOf("--bucket");
  const bucketName = bucketOptionIndex >= 0 ? process.argv[bucketOptionIndex + 1] : BUILDER_PRIVATE_UPLOAD_BUCKET;
  assertBuilderPrivateUploadBucket(bucketName);
  return { mode, bucketName };
}

async function main() {
  const { mode, bucketName } = commandLine();
  if (mode === "--check") console.log(JSON.stringify({ status: "valid", ...validateBuilderPrivateUploadCorsContract() }));
  else if (mode === "--preflight") {
    const policy = await readRemoteBuilderPrivateUploadCors({ bucketName });
    console.log(JSON.stringify({ status: "authorized", bucketName, ruleCount: policy.rules.length, ready: policy.rules.some(isBuilderPrivateUploadRule) }));
  } else if (mode === "--verify") console.log(JSON.stringify({ status: "verified", ...await verifyRemoteBuilderPrivateUploadCors({ bucketName }) }));
  else if (mode === "--ensure") console.log(JSON.stringify({ status: "ensured", ...await ensureRemoteBuilderPrivateUploadCors({ bucketName }) }));
  else throw new Error(`Unknown Builder private-upload CORS mode: ${mode}`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
