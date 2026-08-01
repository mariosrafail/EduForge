import nodemailer from "nodemailer";
import { emailPattern } from "./_auth-utils.js";
import { accountActionUrl } from "./_account-lifecycle-utils.js";

let capturedMessages = [];
let testTransport = null;

function isolatedEnvironment() {
  return process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database" || process.env.STAGING_DATABASE_CONFIRMATION === "isolated-staging-database";
}

export function clearCapturedEmailsForTests() {
  if (!isolatedEnvironment()) throw new Error("Email capture requires an explicitly isolated database");
  capturedMessages = [];
}

export function getCapturedEmailsForTests() {
  if (!isolatedEnvironment()) throw new Error("Email capture requires an explicitly isolated database");
  return structuredClone(capturedMessages);
}

export function setEmailTransportForTests(transport) {
  if (!isolatedEnvironment()) throw new Error("SMTP test transport requires an explicitly isolated database");
  testTransport = transport || null;
}

export function escapeEmailHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

export function buildAccountEmail({ templateType, name = "", actionUrl = "" }) {
  const safeName = escapeEmailHtml(name || "there");
  const greeting = `Hello ${name || "there"},`;
  if (templateType === "account_invitation") return {
    subject: "You have been invited to Hamilton House LMS",
    text: `${greeting}\n\nYour Hamilton House LMS account is ready. Set your password using this secure link:\n${actionUrl}\n\nThis link expires in 3 days.`,
    html: `<p>Hello ${safeName},</p><p>Your Hamilton House LMS account is ready.</p><p><a href="${escapeEmailHtml(actionUrl)}">Set your password</a></p><p>This link expires in 3 days.</p>`,
  };
  if (templateType === "password_reset") return {
    subject: "Reset your Hamilton House LMS password",
    text: `${greeting}\n\nReset your Hamilton House LMS password using this secure link:\n${actionUrl}\n\nThis link expires in 30 minutes.`,
    html: `<p>Hello ${safeName},</p><p>We received a request to reset your Hamilton House LMS password.</p><p><a href="${escapeEmailHtml(actionUrl)}">Reset your password</a></p><p>This link expires in 30 minutes.</p>`,
  };
  if (templateType === "password_changed") return {
    subject: "Your Hamilton House LMS password was changed",
    text: `${greeting}\n\nYour Hamilton House LMS password was changed. If you did not make this change, contact your school administrator.`,
    html: `<p>Hello ${safeName},</p><p>Your Hamilton House LMS password was changed.</p><p>If you did not make this change, contact your school administrator.</p>`,
  };
  throw new Error("Unsupported account email template");
}

function smtpConfiguration() {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
  if (required.some((name) => !String(process.env[name] || "").trim())) throw new Error("SMTP configuration is incomplete");
  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT must be a valid port");
  const secureText = String(process.env.SMTP_SECURE || "false").toLowerCase();
  if (!["true", "false"].includes(secureText)) throw new Error("SMTP_SECURE must be true or false");
  const from = String(process.env.SMTP_FROM).trim();
  if (/\r|\n/.test(from) || !emailPattern.test(from.replace(/^.*<([^>]+)>$/, "$1"))) throw new Error("SMTP_FROM must contain a valid email address");
  return { host: process.env.SMTP_HOST, port, secure: secureText === "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, from };
}

export async function deliverAccountEmail({ recipient, templateType, rawToken = "", outboxId, name = "" }) {
  const mode = process.env.ACCOUNT_EMAIL_MODE || (isolatedEnvironment() ? "capture" : "smtp");
  if (!["capture", "preview", "smtp"].includes(mode)) throw new Error("Unknown ACCOUNT_EMAIL_MODE");
  const action = templateType === "account_invitation" ? "accept-invitation" : "reset-password";
  const actionUrl = rawToken ? accountActionUrl(action, rawToken) : "";
  const message = buildAccountEmail({ templateType, name, actionUrl });

  if (mode === "capture") {
    if (!isolatedEnvironment()) throw new Error("Email capture is disabled outside isolated environments");
    capturedMessages.push({ recipient, templateType, actionUrl, outboxId, name, subject: message.subject, text: message.text, html: message.html });
    return { state: "captured", reference: `capture:${outboxId}` };
  }
  if (mode === "preview") {
    if (process.env.STAGING_DATABASE_CONFIRMATION !== "isolated-staging-database") throw new Error("Email preview requires isolated staging confirmation");
    return { state: "preview", reference: `preview:${outboxId}`, previewUrl: actionUrl };
  }

  const smtp = smtpConfiguration();
  const transport = testTransport || nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: smtp.auth, disableFileAccess: true, disableUrlAccess: true });
  try {
    const result = await transport.sendMail({ from: smtp.from, to: recipient, subject: message.subject, text: message.text, html: message.html, disableFileAccess: true, disableUrlAccess: true });
    return { state: "sent", reference: String(result?.messageId || "smtp:accepted") };
  } catch {
    return { state: "failed", reference: null, errorCode: "smtp_delivery_failed" };
  }
}

export async function markEmailDelivery(sql, outboxId, delivery, { retryable = false } = {}) {
  const state = delivery.state === "failed" && retryable ? "retryable" : delivery.state;
  const retryMinutes = Math.min(60, 2 ** Math.max(0, Number(delivery.attempt || 1) - 1));
  await sql`
    update account_email_outbox
    set delivery_state = ${state}, provider_reference = ${delivery.reference || null},
        last_error_code = ${delivery.errorCode || null}, claim_id = null, claimed_at = null,
        attempt_count = attempt_count + 1,
        next_attempt_at = case when ${state} = 'retryable' then now() + (${retryMinutes} * interval '1 minute') else null end,
        delivered_at = case when ${state} = 'sent' then now() else delivered_at end
    where id = ${outboxId}
  `;
}

export async function recordDeliveryFailureEvent(sql, { userId, actorUserId = null, schoolId, fingerprint = null, templateType }) {
  await sql`insert into account_security_events (user_id, actor_user_id, school_id, event_type, request_fingerprint, metadata) values (${userId}, ${actorUserId}, ${schoolId}, 'email_delivery_failed', ${fingerprint}, jsonb_build_object('template_type', ${templateType}::text))`;
}
