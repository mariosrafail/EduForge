import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, inflateRawSync, inflateSync } from "node:zlib";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export const IWB_XOR_KEY = "EA3DC7D7-6954-471A-8399-E217B522F5F2";

const XML_PARSER = new XMLParser({
  allowBooleanAttributes: false,
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  trimValues: false,
});

const NORMALIZATION_XML_PARSER = new XMLParser({
  allowBooleanAttributes: false,
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  isArray: (name) => ["answer", "choice", "drag", "drop", "exercise", "question", "sentence"].includes(name),
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  trimValues: false,
});

const MEDIA_EXERCISE_TYPES = new Set(["video", "karaokeScroll", "display"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function calculateEntropy(bytes) {
  if (!bytes.length) return 0;
  const counts = new Uint32Array(256);
  for (const byte of bytes) counts[byte] += 1;
  let entropy = 0;
  for (const count of counts) {
    if (!count) continue;
    const probability = count / bytes.length;
    entropy -= probability * Math.log2(probability);
  }
  return Number(entropy.toFixed(6));
}

function printablePercentage(bytes) {
  if (!bytes.length) return 0;
  const printable = bytes.reduce((count, byte) => count + ((byte >= 0x20 && byte <= 0x7e) || [9, 10, 13].includes(byte) ? 1 : 0), 0);
  return Number(((printable / bytes.length) * 100).toFixed(3));
}

function stringEvidence(bytes, encoding) {
  let text;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return { structurallyValid: false, printablePercentage: 0, sequenceCount: 0, sampleHashes: [] };
  }
  const sequences = text.match(/[\x20-\x7e]{4,}/g) || [];
  const printable = [...text].filter((character) => /[\x20-\x7e\r\n\t]/.test(character)).length;
  return {
    structurallyValid: true,
    printablePercentage: text.length ? Number(((printable / text.length) * 100).toFixed(3)) : 0,
    sequenceCount: sequences.length,
    longestSequenceLength: sequences.reduce((longest, value) => Math.max(longest, value.length), 0),
    sampleHashes: sequences.slice(0, 4).map((value) => sha256(value)),
  };
}

export function decodeBase64Wrapper(input) {
  const normalized = Buffer.isBuffer(input) ? input.toString("ascii").trim() : String(input).trim();
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("Malformed Base64 wrapper");
  }
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.toString("base64") !== normalized) throw new Error("Non-canonical Base64 wrapper");
  return decoded;
}

export function applyRepeatingXor(bytes, key = IWB_XOR_KEY) {
  const keyBytes = Buffer.from(key, "utf8");
  if (!keyBytes.length) throw new Error("The XOR key must not be empty");
  return Buffer.from(bytes.map((byte, index) => byte ^ keyBytes[index % keyBytes.length]));
}

function startsWith(bytes, signature) {
  return bytes.subarray(0, signature.length).equals(Buffer.from(signature));
}

function parserProbe(bytes, parser) {
  try {
    const output = parser(bytes);
    return { success: true, outputBytes: output.length };
  } catch {
    return { success: false };
  }
}

function protobufLike(bytes) {
  let offset = 0;
  let fields = 0;
  while (offset < bytes.length && fields < 128) {
    let key = 0;
    let shift = 0;
    while (offset < bytes.length && shift < 35) {
      const byte = bytes[offset++];
      key |= (byte & 0x7f) << shift;
      if (!(byte & 0x80)) break;
      shift += 7;
    }
    const wire = key & 7;
    const field = key >>> 3;
    if (!field || ![0, 1, 2, 5].includes(wire)) return false;
    if (wire === 0) {
      while (offset < bytes.length && bytes[offset++] & 0x80) {}
    } else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else {
      let length = 0;
      let lengthShift = 0;
      while (offset < bytes.length && lengthShift < 35) {
        const byte = bytes[offset++];
        length |= (byte & 0x7f) << lengthShift;
        if (!(byte & 0x80)) break;
        lengthShift += 7;
      }
      offset += length;
    }
    if (offset > bytes.length) return false;
    fields += 1;
  }
  return offset === bytes.length && fields > 1;
}

export function probeStandardFormats(bytes) {
  const utf8 = stringEvidence(bytes, "utf-8");
  const utf16le = stringEvidence(bytes, "utf-16le");
  const utf16be = stringEvidence(bytes, "utf-16be");
  const text = utf8.structurallyValid ? new TextDecoder("utf-8").decode(bytes).trim() : "";
  const xmlValidation = text.startsWith("<") ? XMLValidator.validate(text, { allowBooleanAttributes: false }) : false;
  let json = false;
  if (/^[\[{]/.test(text)) {
    try { JSON.parse(text); json = true; } catch {}
  }
  return {
    signatures: {
      zip: startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]),
      gzip: startsWith(bytes, [0x1f, 0x8b]),
      bzip2: startsWith(bytes, [0x42, 0x5a, 0x68]),
      lzmaXz: startsWith(bytes, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]),
      sqlite: startsWith(bytes, Buffer.from("SQLite format 3\0")),
      swf: ["FWS", "CWS", "ZWS"].includes(bytes.subarray(0, 3).toString("ascii")),
      javaSerialization: startsWith(bytes, [0xac, 0xed, 0x00, 0x05]),
      dotNetBinaryFormatter: startsWith(bytes, [0x00, 0x01, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff]),
      png: startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]),
      jpeg: startsWith(bytes, [0xff, 0xd8, 0xff]),
      gif: ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii")),
      mp3: startsWith(bytes, Buffer.from("ID3")) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0),
      ogg: startsWith(bytes, Buffer.from("OggS")),
      riff: startsWith(bytes, Buffer.from("RIFF")),
    },
    parsers: {
      gzip: parserProbe(bytes, gunzipSync),
      zlib: parserProbe(bytes, inflateSync),
      rawDeflate: parserProbe(bytes, inflateRawSync),
      xml: xmlValidation === true,
      json,
      plist: xmlValidation === true && /^<\?xml[^>]*>[\s\S]*<plist\b/.test(text),
      utf8Text: utf8.structurallyValid && utf8.printablePercentage >= 80,
      utf16Text: (utf16le.structurallyValid && utf16le.printablePercentage >= 80) || (utf16be.structurallyValid && utf16be.printablePercentage >= 80),
      amf0Indicator: bytes.length > 2 && bytes[0] <= 0x11,
      amf3Indicator: bytes.length > 2 && bytes[0] <= 0x11,
      protobufLike: protobufLike(bytes),
    },
  };
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

function summarizeXml(xml, strict) {
  const root = xml.match(/^\s*(?:<\?xml[^>]*>\s*)?<([\w:-]+)/)?.[1] || "unknown";
  const exercises = [...xml.matchAll(/<exercise\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const exerciseTypes = [...new Set(exercises.map((item) => item.type).filter(Boolean))].sort();
  const questionCount = (xml.match(/<question\b/gi) || []).length;
  const optionCount = (xml.match(/<answer\b/gi) || []).length;
  const correctCount = (xml.match(/<correct\b/gi) || []).length;
  const dropAnswerIndexes = [...xml.matchAll(/<drop\b[^>]*\banswers="([^"]+)"/gi)].map((match) => match[1]);
  const sentenceAnswerIndexes = [...xml.matchAll(/<sentence\b[^>]*\banswer="([^"]+)"/gi)].map((match) => match[1]);
  const answerEvidenceCount = correctCount + dropAnswerIndexes.length + sentenceAnswerIndexes.length;
  const nonMediaTypes = exerciseTypes.filter((type) => !MEDIA_EXERCISE_TYPES.has(type));
  return {
    root,
    strict,
    exerciseTypes,
    exerciseElementCount: exercises.length,
    questionCount,
    optionCount,
    correctAnswerCount: correctCount,
    answerEvidenceCount,
    hasExplicitAnswerEvidence: answerEvidenceCount > 0,
    definiteExercise: questionCount > 0 || nonMediaTypes.length > 0,
    mediaOnly: exerciseTypes.length > 0 && nonMediaTypes.length === 0,
    unit2Comparison: {
      dropAnswerIndexes,
      sentenceAnswerIndexes,
    },
    contentDigest: sha256(xml),
  };
}

function correlateKnownPlaintext(decoded, transformed, fragments) {
  return fragments.map((fragment) => {
    const utf8 = Buffer.from(fragment, "utf8");
    const utf16le = Buffer.from(fragment, "utf16le");
    const utf16be = Buffer.from(utf16le);
    utf16be.swap16();
    const lengthPrefixes = [
      Buffer.concat([Buffer.from([utf8.length]), utf8]),
      Buffer.concat([Buffer.from([utf8.length & 0xff, utf8.length >>> 8]), utf8]),
      Buffer.concat([Buffer.from([0, 0, 0, utf8.length & 0xff]), utf8]),
    ];
    const spaces = { decoded, transformed };
    const matches = [];
    for (const [space, bytes] of Object.entries(spaces)) {
      if (bytes.includes(utf8)) matches.push(`${space}:utf8`);
      if (bytes.includes(utf16le)) matches.push(`${space}:utf16le`);
      if (bytes.includes(utf16be)) matches.push(`${space}:utf16be`);
      lengthPrefixes.forEach((value, index) => { if (bytes.includes(value)) matches.push(`${space}:length-prefix-${[1, 2, 4][index]}`); });
    }
    return { fragmentHash: sha256(fragment), byteLength: utf8.length, matches };
  });
}

export function inspectIwbPayload(input, { knownPlaintext = [] } = {}) {
  const decoded = decodeBase64Wrapper(input);
  const transformed = applyRepeatingXor(decoded);
  const transformedText = new TextDecoder("utf-8", { fatal: false }).decode(transformed);
  const validation = XMLValidator.validate(transformedText, { allowBooleanAttributes: false });
  const looksLikeXml = /^\s*(?:<\?xml[^>]*>\s*)?<[\w:-]+/.test(transformedText);
  const strict = validation === true;
  const classification = strict ? "decoded-structured" : looksLikeXml ? "decoded-partial" : "encrypted-or-key-dependent";
  let parsedRoot = null;
  if (strict) parsedRoot = Object.keys(XML_PARSER.parse(transformedText))[0] || null;
  return {
    binaryStatus: classification,
    encoding: "base64-wrapper",
    transformation: "repeating-xor-utf8-key",
    decodedBytes: decoded.length,
    transformedBytes: transformed.length,
    fingerprint: {
      first64Hex: decoded.subarray(0, 64).toString("hex"),
      last32Hex: decoded.subarray(-32).toString("hex"),
      prefix16Hex: decoded.subarray(0, 16).toString("hex"),
      suffix16Hex: decoded.subarray(-16).toString("hex"),
      entropy: calculateEntropy(decoded),
      printableAsciiPercentage: printablePercentage(decoded),
      utf8: stringEvidence(decoded, "utf-8"),
      utf16le: stringEvidence(decoded, "utf-16le"),
      utf16be: stringEvidence(decoded, "utf-16be"),
    },
    preTransformFormats: probeStandardFormats(decoded),
    postTransformFormats: probeStandardFormats(transformed),
    xml: looksLikeXml ? summarizeXml(transformedText, strict) : null,
    knownPlaintext: correlateKnownPlaintext(decoded, transformed, knownPlaintext),
    parsedRoot,
    validationError: strict ? null : validation?.err?.msg || "Transformed payload is not XML",
  };
}

export function decodeIwbXml(input) {
  const decoded = decodeBase64Wrapper(input);
  const transformed = applyRepeatingXor(decoded);
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(transformed);
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (validation !== true) throw new Error(validation?.err?.msg || "Decoded IWB is not strict XML");
  return {
    document: NORMALIZATION_XML_PARSER.parse(xml),
    xml,
  };
}

export async function inspectIwbFile(sourceRoot, relativePath) {
  const root = path.resolve(sourceRoot);
  const candidate = path.resolve(root, relativePath);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("IWB path escapes source root");
  return inspectIwbPayload(await readFile(candidate));
}

export function buildIwbAnalysis(entries) {
  const countBy = (selector) => {
    const groups = new Map();
    for (const entry of entries) {
      const key = String(selector(entry));
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    return [...groups.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  };
  const classifications = countBy((entry) => entry.inspection.binaryStatus);
  const familyGroups = new Map();
  for (const entry of entries) {
    const filename = path.posix.basename(entry.relativePath);
    const root = entry.inspection.xml?.root || "non-xml";
    const classification = entry.inspection.binaryStatus === "decoded-partial" ? "decoded-partial"
      : ["unit_params.iwb", "part_params.iwb", "highlight_params.iwb"].includes(filename) ? "not-activity-data"
        : entry.inspection.binaryStatus;
    const key = `${filename}|${root}|${classification}`;
    if (!familyGroups.has(key)) familyGroups.set(key, { filename, root, classification, count: 0 });
    familyGroups.get(key).count += 1;
  }
  const formatSuccesses = {};
  for (const stage of ["preTransformFormats", "postTransformFormats"]) {
    formatSuccesses[stage] = {};
    for (const entry of entries) {
      const formats = entry.inspection[stage];
      for (const [name, value] of Object.entries({ ...formats.signatures, ...formats.parsers })) {
        const success = typeof value === "object" ? value.success : value;
        if (success) formatSuccesses[stage][name] = (formatSuccesses[stage][name] || 0) + 1;
      }
    }
  }
  const strictEntries = entries.filter((entry) => entry.inspection.xml?.strict);
  const unit2KnownReferences = entries.filter((entry) => entry.inspection.knownPlaintext?.length).map((entry) => ({
    sourceRelativePath: entry.relativePath,
    fragmentCount: entry.inspection.knownPlaintext.length,
    matchedFragmentCount: entry.inspection.knownPlaintext.filter((item) => item.matches.length).length,
    matches: entry.inspection.knownPlaintext,
    explicitAnswerIndexes: entry.inspection.xml?.unit2Comparison || null,
    existingImplementationCandidateAnswerMatch: entry.relativePath.endsWith("/obj3/obj_params.iwb")
      ? JSON.stringify(entry.inspection.xml?.unit2Comparison.dropAnswerIndexes) === JSON.stringify(["6", "3", "5", "1", "7", "2"])
      : entry.relativePath.endsWith("/obj4/obj_params.iwb")
        ? JSON.stringify(entry.inspection.xml?.unit2Comparison.sentenceAnswerIndexes) === JSON.stringify(["1", "2", "1", "2", "2", "1", "2", "1"])
        : null,
  }));
  return {
    schemaVersion: "1.0",
    decoder: {
      deterministic: true,
      process: ["strict Base64 decode", "repeating XOR with publisher SWF constant", "UTF-8 XML validation"],
      keyProvenance: "Static strings extracted without execution from Contents/Resources/UltimateB2.swf (ZWS/LZMA body)",
      executedPublisherCode: false,
      decodedPayloadsCommitted: false,
    },
    totals: {
      iwbFiles: entries.length,
      strictXml: strictEntries.length,
      partialXml: entries.filter((entry) => entry.inspection.binaryStatus === "decoded-partial").length,
      definiteExerciseObjects: new Set(strictEntries.filter((entry) => entry.inspection.xml.definiteExercise).map((entry) => entry.objectId).filter(Boolean)).size,
      mediaOnlyObjects: new Set(strictEntries.filter((entry) => entry.inspection.xml.mediaOnly).map((entry) => entry.objectId).filter(Boolean)).size,
      objectsWithExplicitAnswerEvidence: new Set(strictEntries.filter((entry) => entry.inspection.xml.hasExplicitAnswerEvidence).map((entry) => entry.objectId).filter(Boolean)).size,
      explicitAnswerRecords: strictEntries.reduce((sum, entry) => sum + entry.inspection.xml.answerEvidenceCount, 0),
      fullyStructuredQuestionBanks: strictEntries.filter((entry) => entry.inspection.xml.questionCount > 0 && entry.inspection.xml.correctAnswerCount === entry.inspection.xml.questionCount).length,
      structuredQuestions: strictEntries.reduce((sum, entry) => sum + entry.inspection.xml.questionCount, 0),
    },
    classifications,
    families: [...familyGroups.values()].sort((a, b) => b.count - a.count || a.filename.localeCompare(b.filename)),
    decodedSignatureClusters: countBy((entry) => entry.inspection.fingerprint.prefix16Hex),
    decodedSuffixClusters: countBy((entry) => entry.inspection.fingerprint.suffix16Hex),
    sizePatterns: countBy((entry) => Math.floor(entry.inspection.decodedBytes / 1024) * 1024),
    directoryRoles: countBy((entry) => entry.role),
    filenames: countBy((entry) => path.posix.basename(entry.relativePath)),
    suspectedActivityTypes: countBy((entry) => entry.inspection.xml?.exerciseTypes.join(",") || "none"),
    unitObjectPositions: countBy((entry) => entry.objectId || `unit-${entry.unitNumber || "none"}-navigation`),
    formatSuccesses,
    knownPlaintextCorrelation: {
      role: "comparison-only; existing implementation was not treated as publisher truth",
      references: unit2KnownReferences,
    },
    malformedPayloads: entries.filter((entry) => entry.inspection.binaryStatus !== "decoded-structured").map((entry) => ({
      sourceRelativePath: entry.relativePath,
      classification: entry.inspection.binaryStatus,
      error: entry.inspection.validationError,
    })),
  };
}
