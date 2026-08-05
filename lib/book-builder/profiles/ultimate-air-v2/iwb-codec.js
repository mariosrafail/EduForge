import { createHash } from "node:crypto";
import { XMLValidator } from "fast-xml-parser";

const FORBIDDEN_XML = /<!\s*(?:DOCTYPE|ENTITY)\b/i;
const INVALID_XML_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;
const ANSWER_TAGS = new Set(["correct", "answer"]);
const ANSWER_ATTRIBUTES = /^(?:answer|answers|correct|acceptedAnswers?|modelAnswer|score|playAgainPoints)$/i;

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function hasInvalidXmlComment(xml) {
  let cursor = 0;
  while (true) {
    const start = xml.indexOf("<!--", cursor);
    if (start < 0) return false;
    const end = xml.indexOf("-->", start + 4);
    if (end < 0) return true;
    const content = xml.slice(start + 4, end);
    if (content.includes("<!--") || content.includes("--")) return true;
    cursor = end + 3;
  }
}

function plausibleRootName(xml) {
  let cursor = 0;
  if (xml.charCodeAt(0) === 0xfeff) cursor += 1;
  const skipWhitespace = () => { while (/\s/.test(xml[cursor] || "")) cursor += 1; };
  skipWhitespace();
  if (xml.startsWith("<?xml", cursor)) {
    const end = xml.indexOf("?>", cursor + 5);
    if (end < 0) return null;
    cursor = end + 2;
  }
  skipWhitespace();
  while (xml.startsWith("<!--", cursor)) {
    const end = xml.indexOf("-->", cursor + 4);
    if (end < 0) return null;
    cursor = end + 3;
    skipWhitespace();
  }
  return xml.slice(cursor).match(/^<([A-Za-z_][\w:.-]*)\b/)?.[1] || null;
}

export function decodeCanonicalBase64(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  if ([...buffer].some((byte) => byte > 0x7f)) throw new Error("invalid_wrapper: IWB wrapper must be ASCII");
  const raw = buffer.toString("ascii");
  const normalized = raw.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "");
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("invalid_wrapper: malformed Base64 wrapper");
  }
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.toString("base64") !== normalized) throw new Error("invalid_wrapper: non-canonical Base64 wrapper");
  return decoded;
}

export function applyRepeatingXor(bytes, key) {
  const keyBytes = Buffer.from(String(key || ""), "utf8");
  if (!keyBytes.length) throw new Error("IWB XOR key must not be empty");
  const output = Buffer.alloc(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) output[index] = bytes[index] ^ keyBytes[index % keyBytes.length];
  return output;
}

export function parseAttributes(tagSource) {
  const result = {};
  for (const match of String(tagSource).matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) result[match[1]] = match[2] ?? match[3] ?? "";
  return result;
}

export function elementsNamed(xml, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<${escaped}\\b[^>]*>`, "gi");
  const structuralXml = String(xml).replace(/<!--[^]*?-->/g, (value) => " ".repeat(value.length)).replace(/<!\[CDATA\[[^]*?\]\]>/g, (value) => " ".repeat(value.length));
  return [...structuralXml.matchAll(pattern)].map((match) => ({ source: match[0], attributes: parseAttributes(match[0]), offset: match.index }));
}

export function summarizeSafeXml(xml) {
  const tagCounts = {};
  const attributeCounts = {};
  const schema = new Set();
  const answerEvidence = {};
  const exerciseTypes = new Set();
  const exerciseTypeCounts = {};
  const structuralXml = xml.replace(/<!--[^]*?-->/g, "").replace(/<!\[CDATA\[[^]*?\]\]>/g, "");
  for (const match of structuralXml.matchAll(/<([A-Za-z_][\w:.-]*)\b([^<>]*)>/g)) {
    const tag = match[1];
    if (tag.startsWith("?")) continue;
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    const attributes = parseAttributes(match[0]);
    const names = Object.keys(attributes).sort();
    schema.add(`${tag}|${names.join(",")}`);
    for (const name of names) {
      attributeCounts[name] = (attributeCounts[name] || 0) + 1;
      if (ANSWER_ATTRIBUTES.test(name)) answerEvidence[`attribute:${name}`] = (answerEvidence[`attribute:${name}`] || 0) + 1;
    }
    if (ANSWER_TAGS.has(tag.toLowerCase())) answerEvidence[`tag:${tag}`] = (answerEvidence[`tag:${tag}`] || 0) + 1;
    if (tag.toLowerCase() === "exercise" && attributes.type) {
      exerciseTypes.add(attributes.type);
      exerciseTypeCounts[attributes.type] = (exerciseTypeCounts[attributes.type] || 0) + 1;
    }
  }
  const schemaShape = [...schema].sort();
  return {
    tagNameSummary: Object.fromEntries(Object.entries(tagCounts).sort()),
    attributeNameSummary: Object.fromEntries(Object.entries(attributeCounts).sort()),
    schemaFingerprint: sha256(JSON.stringify(schemaShape)),
    exerciseTypeNames: [...exerciseTypes].sort(),
    exerciseTypeCounts: Object.fromEntries(Object.entries(exerciseTypeCounts).sort()),
    answerBearing: Object.keys(answerEvidence).length > 0,
    answerEvidence: Object.fromEntries(Object.entries(answerEvidence).sort()),
    mediaBearing: /<(?:video|audio|karaoke)\b|\b(?:source|media|sound|caption|url)\s*=/i.test(xml),
    geometryBearing: /<(?:button|quad|drag|drop|choice|object)\b|\b(?:x|y|width|height)\s*=/i.test(xml),
  };
}

export function decodeIwb(input, key) {
  let wrapped;
  try { wrapped = decodeCanonicalBase64(input); }
  catch (error) { return { status: "invalid_wrapper", diagnostic: error.message }; }
  const decoded = applyRepeatingXor(wrapped, key);
  let xml;
  try { xml = new TextDecoder("utf-8", { fatal: true }).decode(decoded); }
  catch (error) { return { status: "invalid_utf8", decodedByteSize: decoded.length, diagnostic: error.message }; }
  const root = plausibleRootName(xml);
  if (FORBIDDEN_XML.test(xml)) return { status: "wrong_key_or_non_xml", decodedByteSize: decoded.length, root, diagnostic: "unsafe_xml_declaration" };
  if (!root || new Set(["html", "script"]).has(root.toLowerCase())) return { status: "wrong_key_or_non_xml", decodedByteSize: decoded.length, root, diagnostic: "implausible_xml_root" };
  if (INVALID_XML_CHARACTER.test(xml)) return { status: "malformed_xml_after_valid_decode", decodedByteSize: decoded.length, root, diagnostic: "invalid_xml_character", errorLocation: null };
  if (hasInvalidXmlComment(xml)) return { status: "malformed_xml_after_valid_decode", decodedByteSize: decoded.length, root, diagnostic: "invalid_xml_comment", errorLocation: null };
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (validation !== true) {
    return {
      status: "malformed_xml_after_valid_decode",
      decodedByteSize: decoded.length,
      root,
      diagnostic: validation?.err?.msg || "Malformed XML",
      errorLocation: validation?.err ? { line: validation.err.line, column: validation.err.col } : null,
    };
  }
  return { status: "strict_xml", decodedByteSize: decoded.length, root, safeSummary: summarizeSafeXml(xml), xml };
}

export function keyFingerprint(key) { return sha256(`ultimate-iwb-key\0${key}`); }
