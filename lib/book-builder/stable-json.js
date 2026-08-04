import { createHash } from "node:crypto";

export function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortJsonValue(value[key])]),
  );
}

export function stableJson(value, space = 2) {
  return `${JSON.stringify(sortJsonValue(value), null, space)}\n`;
}

export function stableHash(value) {
  return createHash("sha256").update(stableJson(value, 0)).digest("hex");
}
