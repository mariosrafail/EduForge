export function requireHostedE2EEnvironment(environment = process.env) {
  const required = ["E2E_STAGING_URL", "E2E_STAGING_CONFIRMATION", "E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"];
  const missing = required.filter((name) => !String(environment[name] || "").trim());
  if (missing.length) throw new Error(`Missing hosted E2E variables: ${missing.join(", ")}`);
  if (environment.E2E_STAGING_CONFIRMATION !== "hosted-nonproduction-staging") throw new Error("E2E staging confirmation is invalid");
  const target = new URL(environment.E2E_STAGING_URL);
  if (target.protocol !== "https:") throw new Error("E2E_STAGING_URL must use HTTPS");
  if (["localhost", "127.0.0.1", "::1"].includes(target.hostname)) throw new Error("Hosted staging E2E refuses localhost");
  if (!/(staging|stage|qa|sandbox|preview|test)/i.test(target.hostname)) throw new Error("E2E_STAGING_URL must visibly identify non-production staging");
  if (environment.STAGING_PRODUCTION_APP_URL && target.origin === new URL(environment.STAGING_PRODUCTION_APP_URL).origin) throw new Error("E2E target matches production application URL");
  return target.origin;
}
