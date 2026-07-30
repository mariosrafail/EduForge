import assert from "node:assert/strict";
import test from "node:test";
import { getPortalDashboardMetrics } from "../src/services/portalMetricsApi.js";

test("portal metrics client sends authenticated no-store request and returns live payload", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let request;
  globalThis.fetch = async (...args) => {
    request = args;
    return new Response(JSON.stringify({ role: "teacher", metrics: { activeClasses: 0 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const payload = await getPortalDashboardMetrics();
  assert.equal(request[0], "/.netlify/functions/book-content?action=dashboard-metrics");
  assert.equal(request[1].credentials, "include");
  assert.equal(request[1].cache, "no-store");
  assert.equal(payload.metrics.activeClasses, 0);
});

test("portal metrics client preserves authorization status and never invents fallback data", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const status of [401, 403, 500]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: `failure-${status}` }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
    await assert.rejects(
      getPortalDashboardMetrics(),
      (error) => error.status === status
        && error.message === `failure-${status}`
        && !Object.hasOwn(error, "metrics"),
    );
  }
});
