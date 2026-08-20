import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BUILDER_PRIVATE_UPLOAD_BUCKET,
  BUILDER_PRIVATE_UPLOAD_HEADER,
  BUILDER_PRIVATE_UPLOAD_METHOD,
  BUILDER_PRIVATE_UPLOAD_ORIGIN,
  ensureRemoteBuilderPrivateUploadCors,
  isBuilderPrivateUploadRule,
  reconcileBuilderPrivateUploadCors,
  validateBuilderPrivateUploadCorsContract,
  verifyBuilderPrivateUploadCors,
} from "../scripts/cloudflare/builder-private-upload-cors.mjs";

const requiredRule = {
  allowed: {
    origins: [BUILDER_PRIVATE_UPLOAD_ORIGIN],
    methods: [BUILDER_PRIVATE_UPLOAD_METHOD],
    headers: [BUILDER_PRIVATE_UPLOAD_HEADER],
  },
};

test("Builder private-upload CORS contract is exact and DEV-only", () => {
  assert.deepEqual(validateBuilderPrivateUploadCorsContract(), {
    bucketName: "hhplms-book-private-dev",
    origin: "https://builder.hhplms.workers.dev",
    method: "PUT",
    header: "Content-Type",
  });
  assert.throws(() => reconcileBuilderPrivateUploadCors([], "hhplms-book-private-production"), /Refusing R2 CORS access/);
});

test("empty policy receives one narrow deterministic rule without wildcards", () => {
  const first = reconcileBuilderPrivateUploadCors({ rules: [] });
  const second = reconcileBuilderPrivateUploadCors({ rules: [] });
  assert.equal(first.changed, true);
  assert.deepEqual(first.rules, [requiredRule]);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first.rules).includes('"*"'), false);
  assert.deepEqual(verifyBuilderPrivateUploadCors(first.rules), {
    bucketName: BUILDER_PRIVATE_UPLOAD_BUCKET,
    origin: BUILDER_PRIVATE_UPLOAD_ORIGIN,
    method: BUILDER_PRIVATE_UPLOAD_METHOD,
    header: BUILDER_PRIVATE_UPLOAD_HEADER,
    ruleCount: 1,
  });
});

test("correct current policy is idempotent and is not destructively normalized", () => {
  const current = [{ id: "existing-builder-rule", maxAgeSeconds: 900, ...requiredRule }];
  const reconciled = reconcileBuilderPrivateUploadCors({ rules: current });
  assert.equal(reconciled.changed, false);
  assert.deepEqual(reconciled.rules, current);
});

test("unrelated rules and approved exact origins are preserved byte-for-byte", () => {
  const current = [
    { id: "viewer", allowed: { origins: ["https://viewer.example"], methods: ["GET", "HEAD"], headers: ["Range"] }, exposeHeaders: ["Content-Length"] },
    { id: "previous-builder", allowed: { origins: ["https://previous-builder.example"], methods: ["PUT"], headers: ["Content-Type"] } },
  ];
  const reconciled = reconcileBuilderPrivateUploadCors({ rules: current });
  assert.equal(reconciled.changed, true);
  assert.deepEqual(reconciled.rules.slice(0, current.length), current);
  assert.deepEqual(reconciled.rules.at(-1), requiredRule);
});

test("wildcard rules never satisfy the managed exact-origin contract", () => {
  for (const rule of [
    { allowed: { origins: ["*"], methods: ["PUT"], headers: ["Content-Type"] } },
    { allowed: { origins: [BUILDER_PRIVATE_UPLOAD_ORIGIN], methods: ["*"], headers: ["Content-Type"] } },
    { allowed: { origins: [BUILDER_PRIVATE_UPLOAD_ORIGIN], methods: ["PUT"], headers: ["*"] } },
  ]) assert.equal(isBuilderPrivateUploadRule(rule), false);
  assert.equal(isBuilderPrivateUploadRule(requiredRule), true);
});

test("verification fails closed when the exact required capability is missing", () => {
  assert.throws(() => verifyBuilderPrivateUploadCors({ rules: [] }), /does not allow/);
  assert.throws(() => verifyBuilderPrivateUploadCors({ rules: [{ allowed: { origins: [BUILDER_PRIVATE_UPLOAD_ORIGIN], methods: ["GET"], headers: ["Content-Type"] } }] }), /does not allow/);
});

test("remote ensure preserves existing rules, updates once, and re-reads before success", async () => {
  const existing = { id: "keep-me", allowed: { origins: ["https://existing.example"], methods: ["GET"], headers: ["Range"] } };
  let remoteRules = [existing];
  const calls = [];
  const fetchImpl = async (_url, options) => {
    calls.push({ method: options.method, body: options.body || null });
    if (options.method === "PUT") remoteRules = JSON.parse(options.body).rules;
    return new Response(JSON.stringify({ success: true, errors: [], result: options.method === "GET" ? { rules: remoteRules } : {} }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await ensureRemoteBuilderPrivateUploadCors({
    bucketName: BUILDER_PRIVATE_UPLOAD_BUCKET,
    environment: { CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "test-token" },
    fetchImpl,
  });
  assert.deepEqual(result, { bucketName: BUILDER_PRIVATE_UPLOAD_BUCKET, changed: true, ruleCount: 2 });
  assert.deepEqual(calls.map(({ method }) => method), ["GET", "PUT", "GET"]);
  assert.deepEqual(remoteRules[0], existing);
  assert.deepEqual(remoteRules[1], requiredRule);
});

test("remote ensure fails closed when the post-update read does not contain the required rule", async () => {
  const fetchImpl = async (_url, options) => new Response(JSON.stringify({
    success: true,
    errors: [],
    result: options.method === "GET" ? { rules: [] } : {},
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(ensureRemoteBuilderPrivateUploadCors({
    environment: { CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "test-token" },
    fetchImpl,
  }), /does not allow/);
});

test("Cloudflare Builder deployment gates Worker deploy on the private-upload CORS ensure", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const builderStart = workflow.indexOf("  deploy-cloudflare-builder:");
  const lmsStart = workflow.indexOf("  deploy-cloudflare-lms:");
  assert.ok(builderStart >= 0 && lmsStart > builderStart);
  const builderJob = workflow.slice(builderStart, lmsStart);
  const exactSha = builderJob.indexOf("Verify exact workflow commit");
  const build = builderJob.indexOf("npm run build:cloudflare:builder");
  const verify = builderJob.indexOf("npm run verify:cloudflare:builder");
  const media = builderJob.indexOf("npm run sync:cloudflare:builder-media");
  const cors = builderJob.indexOf("npm run ensure:cloudflare:builder-private-upload-cors");
  const deploy = builderJob.indexOf("wrangler deploy --config cloudflare/builder/wrangler.jsonc");
  assert.ok(exactSha < build && build < verify && verify < media && media < cors && cors < deploy);
  assert.match(builderJob.slice(cors, deploy), /CLOUDFLARE_ACCOUNT_ID:[\s\S]*CLOUDFLARE_API_TOKEN:/);
  assert.doesNotMatch(workflow.slice(lmsStart), /builder-private-upload-cors/);
});
