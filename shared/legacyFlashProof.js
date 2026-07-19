import { createHmac, timingSafeEqual } from "node:crypto";

export const LEGACY_FLASH_FLAG = "VITE_ENABLE_LEGACY_FLASH_PLAYER";
export const LEGACY_FLASH_SCOPE = "ultimate-b2-legacy-source";
export const LEGACY_FLASH_TOKEN_TTL_SECONDS = 5 * 60;

export function isLegacyFlashFlagEnabled(env = process.env) {
  return String(env?.[LEGACY_FLASH_FLAG] || "").trim().toLowerCase() === "true";
}

export function isLocalRequestHost(host = "") {
  try {
    const hostname = new URL(`http://${String(host).trim()}`).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function legacyFlashTokenSecret(env = process.env) {
  return String(env.LEGACY_FLASH_PROOF_TOKEN_SECRET || env.ACCOUNT_RATE_LIMIT_SALT || "");
}

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function signature(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createLegacyFlashSourceToken({ userId, now = Date.now(), secret }) {
  if (!secret) throw new Error("Legacy Flash proof token secret is not configured");
  const payload = encode(JSON.stringify({
    exp: Math.floor(now / 1000) + LEGACY_FLASH_TOKEN_TTL_SECONDS,
    scope: LEGACY_FLASH_SCOPE,
    sub: String(userId),
  }));
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyLegacyFlashSourceToken(token, { now = Date.now(), secret } = {}) {
  if (!secret || typeof token !== "string") return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expected = signature(payload, secret);
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (claims.scope !== LEGACY_FLASH_SCOPE || !claims.sub || Number(claims.exp) <= Math.floor(now / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
