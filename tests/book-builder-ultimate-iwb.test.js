import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { buildIwbIndex } from "../lib/book-builder/profiles/ultimate-air-v2/iwb-index.js";
import { applyRepeatingXor, decodeCanonicalBase64, decodeIwb } from "../lib/book-builder/profiles/ultimate-air-v2/iwb-codec.js";
import { discoverIwbKey, IwbKeyDiscoveryError, selectIwbValidationSamples } from "../lib/book-builder/profiles/ultimate-air-v2/iwb-key-discovery.js";
import { findUuidCandidates, inspectStaticSwf, inspectUncompressedSwfBytes, StaticSwfInspectionError } from "../lib/book-builder/profiles/ultimate-air-v2/swf-static-inspection.js";

const roots = [];
test.after(async () => Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true }))));

async function temporaryRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hhplms-ultimate-iwb-"));
  roots.push(root);
  return root;
}

function encodedIwb(xml, key) {
  return applyRepeatingXor(Buffer.from(xml, "utf8"), key).toString("base64");
}

function swf(signature, body) {
  const header = Buffer.alloc(8);
  header.write(signature, 0, "ascii");
  header[3] = 34;
  header.writeUInt32LE(8 + body.length, 4);
  return signature === "CWS" ? Buffer.concat([header, deflateSync(body)]) : Buffer.concat([header, body]);
}

test("static SWF inspection handles FWS/CWS and reports deterministic unique UUID offsets", () => {
  const first = randomUUID().toUpperCase();
  const second = randomUUID().toUpperCase();
  const body = Buffer.from(`prefix-${first}-middle-${first}-end-${second}`, "ascii");
  for (const signature of ["FWS", "CWS"]) {
    const result = inspectUncompressedSwfBytes(swf(signature, body));
    assert.equal(result.sourceSignature, signature);
    assert.deepEqual(result.uuidCandidates.map((item) => item.value), [first, second]);
    assert.equal(result.uuidCandidates[0].offset, 15);
  }
  assert.deepEqual(findUuidCandidates(body).map((item) => item.value), [first, second]);
  assert.throws(() => inspectUncompressedSwfBytes(Buffer.from("BAD-data")), (error) => error instanceof StaticSwfInspectionError && error.code === "unsupported_swf_signature");
  assert.throws(() => inspectUncompressedSwfBytes(Buffer.from("FWS")), /truncated/);
});

test("static SWF inspection preserves UUID case for byte-exact XOR keys", () => {
  const lowercase = "abcdef01-2345-6789-abcd-ef0123456789";
  const inspected = inspectUncompressedSwfBytes(swf("FWS", Buffer.from(`prefix-${lowercase}-suffix`)));
  assert.equal(inspected.uuidCandidates[0].value, lowercase);
});

test("ZWS inspection fails with a structured python-unavailable diagnostic and never executes the SWF", async () => {
  const root = await temporaryRoot();
  const source = path.join(root, "fixture.swf");
  const bytes = Buffer.alloc(17); bytes.write("ZWS", 0, "ascii"); bytes[3] = 34; bytes.writeUInt32LE(8, 4);
  await fs.writeFile(source, bytes);
  await assert.rejects(
    () => inspectStaticSwf(source, {
      helperPath: path.join(root, "helper.py"),
      commandCandidates: [{ command: "missing-python", prefixArgs: [] }],
      execFileImpl: async () => { const error = new Error("missing"); error.code = "ENOENT"; throw error; },
    }),
    (error) => error instanceof StaticSwfInspectionError && error.code === "python_unavailable",
  );
});

test("IWB codec enforces canonical Base64, repeating XOR, UTF-8, XML safety, and malformed classification", () => {
  const key = randomUUID();
  const strict = decodeIwb(encodedIwb('<params><exercise type="fictional"/><correct>redacted</correct><button x="1" y="2"/></params>', key), key);
  assert.equal(strict.status, "strict_xml");
  assert.equal(strict.root, "params");
  assert.equal(strict.safeSummary.answerBearing, true);
  assert.deepEqual(strict.safeSummary.answerEvidence, { "tag:correct": 1 });
  assert.equal(JSON.stringify(strict.safeSummary).includes("redacted"), false);
  assert.equal(decodeIwb("not base64", key).status, "invalid_wrapper");
  assert.throws(() => decodeCanonicalBase64("QQ==\nA"), /invalid_wrapper/);
  assert.equal(decodeIwb(encodedIwb("<params><broken></params>", key), key).status, "malformed_xml_after_valid_decode");
  assert.equal(decodeIwb(encodedIwb('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///secret">]><params/>', key), key).diagnostic, "unsafe_xml_declaration");
  const invalidUtf8 = applyRepeatingXor(Buffer.from([0xff, 0xff]), key).toString("base64");
  assert.equal(decodeIwb(invalidUtf8, key).status, "invalid_utf8");
  assert.equal(decodeIwb(encodedIwb("<html/>", key), key).status, "wrong_key_or_non_xml");
  assert.equal(decodeIwb(encodedIwb("\ufeff<!-- publisher --><questions/>", key), key).status, "strict_xml");
});

async function writeIwbCorpus(root, key) {
  const paths = [
    "Contents/Resources/assets/home/common/home_params.iwb",
    "Contents/Resources/assets/books/book1/book_menu/common/book1_params.iwb",
    "Contents/Resources/assets/books/book1/unit/1/unit_params.iwb",
    "Contents/Resources/assets/books/book1/unit/2/unit_params.iwb",
    "Contents/Resources/assets/books/book1/unit/1/part1/part_params.iwb",
    "Contents/Resources/assets/books/book1/unit/1/part2/part_params.iwb",
    "Contents/Resources/assets/books/book1/unit/1/part1/obj1/obj_params.iwb",
    "Contents/Resources/assets/books/book1/unit/1/part1/obj2/obj_params.iwb",
  ];
  for (const [index, relative] of paths.entries()) {
    const target = path.join(root, ...relative.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, encodedIwb(`<params><button x="${index}"/></params>`, key));
  }
  return paths.map((sourcePath) => ({ path: sourcePath, category: "iwb_metadata" }));
}

test("key discovery uses deterministic multi-family samples and never serializes the key", async () => {
  const root = await temporaryRoot();
  const key = randomUUID().toUpperCase();
  const wrong = randomUUID().toUpperCase();
  const entries = await writeIwbCorpus(root, key);
  assert.equal(selectIwbValidationSamples(entries).length, 8);
  const result = await discoverIwbKey({ sourceRoot: root, inventoryEntries: entries, swfInspection: { uuidCandidates: [
    { value: wrong, offset: 10, discoveryMethod: "fixture" },
    { value: key, offset: 80, discoveryMethod: "fixture" },
  ] } });
  assert.equal(result.key, key);
  assert.equal(result.artifact.acceptedCandidateOffset, 80);
  assert.equal(JSON.stringify(result.artifact).includes(key), false);
  await assert.rejects(
    () => discoverIwbKey({ sourceRoot: root, inventoryEntries: entries, swfInspection: { uuidCandidates: [{ value: wrong, offset: 10 }] } }),
    (error) => error instanceof IwbKeyDiscoveryError && error.code === "iwb_key_not_found",
  );
  await assert.rejects(
    () => discoverIwbKey({ sourceRoot: root, inventoryEntries: entries, swfInspection: { uuidCandidates: [{ value: key, offset: 1 }, { value: wrong, offset: 2 }] }, decode: () => ({ status: "strict_xml" }) }),
    (error) => error instanceof IwbKeyDiscoveryError && error.code === "multiple_valid_iwb_keys",
  );
});

test("safe IWB corpus index is deterministic and excludes decoded content and answer values", async () => {
  const root = await temporaryRoot();
  const key = randomUUID().toUpperCase();
  const entries = await writeIwbCorpus(root, key);
  const answerPath = entries.at(-1).path;
  await fs.writeFile(path.join(root, ...answerPath.split("/")), encodedIwb('<params><text answers="fictional-secret"/></params>', key));
  const first = await buildIwbIndex({ sourceRoot: root, inventoryEntries: entries, key, concurrency: 2 });
  const second = await buildIwbIndex({ sourceRoot: root, inventoryEntries: entries, key, concurrency: 3 });
  assert.deepEqual(first.artifact, second.artifact);
  assert.equal(first.artifact.summary.total, 8);
  assert.equal(first.artifact.summary.strictXml, 8);
  assert.equal(first.artifact.summary.answerBearingDocuments, 1);
  const serialized = JSON.stringify(first.artifact);
  assert.equal(serialized.includes("fictional-secret"), false);
  assert.equal(serialized.includes(key), false);
  assert.equal(first.internalDocuments.get(answerPath).includes("fictional-secret"), true);
});
