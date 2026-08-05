import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  processEntities: false,
  allowBooleanAttributes: false,
  removeNSPrefix: true,
});

export function toArray(value) { return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]; }
export function parseActivityXml(xml) {
  if (typeof xml !== "string" || !xml.trim() || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsafe or empty activity XML");
  return parser.parse(xml);
}
export function plainText(value) {
  const raw = typeof value === "string" ? value : value && typeof value === "object" ? value["#text"] : "";
  const text = typeof raw === "string" ? raw.replaceAll(/\s+/g, " ").trim() : "";
  if (/<\/?(?:script|iframe|object|embed)\b|(?:javascript|data\s*:\s*text\/html)\s*:/i.test(text)) throw new Error("Unsafe structured activity text");
  return text || null;
}
export function collectNamed(value, name, results = []) {
  if (!value || typeof value !== "object") return results;
  for (const [key, child] of Object.entries(value)) {
    if (key === name) results.push(...toArray(child));
    if (child && typeof child === "object") collectNamed(child, name, results);
  }
  return results;
}
export function geometry(node) {
  const result = {};
  for (const key of ["x", "y", "width", "height", "w", "h"]) if (node?.[`@_${key}`] !== undefined) {
    const number = Number(node[`@_${key}`]); if (Number.isFinite(number)) result[key] = number;
  }
  return Object.keys(result).length ? result : null;
}
