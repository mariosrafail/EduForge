export const LEGACY_FLASH_PROOF_ROUTE = "/dev/ultimate-b2-legacy-player";

export function isLegacyFlashProofEnabled(env = {}) {
  return env?.DEV === true && String(env?.VITE_ENABLE_LEGACY_FLASH_PLAYER || "").trim().toLowerCase() === "true";
}

export function isLegacyFlashProofHash(hash = "") {
  const cleaned = String(hash).trim().replace(/^#/, "").split("?")[0].replace(/\/$/, "");
  return cleaned === LEGACY_FLASH_PROOF_ROUTE;
}
