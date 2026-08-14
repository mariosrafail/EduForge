const SAFE_CHILD_PREFIX = /^[a-z][a-z0-9]{0,15}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function nativeChildIdFromUuid(prefix, uuid) {
  if (!SAFE_CHILD_PREFIX.test(String(prefix || "")) || !UUID.test(String(uuid || ""))) {
    throw new Error("Native child identity input is invalid.");
  }
  return `${prefix}-${String(uuid).toLowerCase().replaceAll("-", "")}`;
}

export function createNativeChildId(prefix, randomUuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  if (typeof randomUuid !== "function") throw new Error("Secure native child identity generation is unavailable.");
  return nativeChildIdFromUuid(prefix, randomUuid());
}

export function isNativeChildId(value, prefix) {
  return new RegExp(`^${prefix}-[0-9a-f]{32}$`).test(String(value || ""));
}
