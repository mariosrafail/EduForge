import assert from "node:assert/strict";
import test from "node:test";
import {
  downloadSchoolAdoptionCsv,
  getSchoolAdoptionSummary,
  safeDownloadFilename,
} from "../src/services/adoptionReportApi.js";

test("summary client includes credentials, preserves status, and never supplies tenant identity", async (t) => {
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; });
  global.fetch = async (url, options) => {
    assert.equal(url, "/.netlify/functions/school-adoption-report?action=summary");
    assert.deepEqual(options, { credentials: "include" });
    return { ok: true, json: async () => ({ summary: { generatedCodes: 2 } }) };
  };
  assert.equal((await getSchoolAdoptionSummary()).summary.generatedCodes, 2);

  global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: "Forbidden" }) });
  await assert.rejects(getSchoolAdoptionSummary, (error) => error.status === 403 && error.message === "Forbidden");
});

test("download client respects safe server filename, clicks an anchor, removes it, and revokes the Blob URL", async (t) => {
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; });
  const calls = [];
  global.fetch = async (url, options) => {
    assert.equal(url, "/.netlify/functions/school-adoption-report?action=export");
    assert.equal(options.credentials, "include");
    assert.equal(options.body, "{}");
    assert.equal(JSON.stringify(options).includes("school"), false);
    return {
      ok: true,
      headers: { get: () => 'attachment; filename="eduforge-adoption-athens-2026-07-30.csv"' },
      blob: async () => ({ type: "text/csv" }),
    };
  };
  const anchor = { click: () => calls.push("click"), remove: () => calls.push("remove") };
  const documentObject = {
    createElement: () => anchor,
    body: { appendChild: () => calls.push("append") },
  };
  const urlObject = {
    createObjectURL: () => "blob:report",
    revokeObjectURL: (url) => calls.push(`revoke:${url}`),
  };
  const result = await downloadSchoolAdoptionCsv({ documentObject, urlObject });
  assert.equal(result.filename, "eduforge-adoption-athens-2026-07-30.csv");
  assert.equal(anchor.download, result.filename);
  assert.equal(anchor.href, "blob:report");
  assert.deepEqual(calls, ["append", "click", "remove", "revoke:blob:report"]);
});

test("unsafe filenames fall back and failed exports never initiate a browser download", async (t) => {
  assert.equal(safeDownloadFilename('attachment; filename="../../bad.csv"'), "eduforge-adoption-report.csv");
  assert.equal(safeDownloadFilename('attachment; filename="bad\r\n.csv"'), "eduforge-adoption-report.csv");
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; });
  global.fetch = async () => ({
    ok: false,
    status: 409,
    json: async () => ({ error: "No adoption data is available to export" }),
  });
  let created = false;
  await assert.rejects(
    downloadSchoolAdoptionCsv({ documentObject: { createElement: () => { created = true; } }, urlObject: {} }),
    /No adoption data is available to export/,
  );
  assert.equal(created, false);
});
