import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createLegacyFlashSourceToken,
  isLegacyFlashFlagEnabled,
  isLocalRequestHost,
  verifyLegacyFlashSourceToken,
} from "../shared/legacyFlashProof.js";
import { isAllowlistedLegacySourcePath, resolveAllowlistedLegacySourceFile } from "../scripts/ultimate-b2/legacy-flash-vite-plugin.mjs";
import { isLegacyFlashProofEnabled, isLegacyFlashProofHash } from "../src/features/legacyFlash/legacyFlashConfig.js";

test("legacy proof is default-off and requires Vite development mode", () => {
  assert.equal(isLegacyFlashProofEnabled({ DEV: true }), false);
  assert.equal(isLegacyFlashProofEnabled({ DEV: false, VITE_ENABLE_LEGACY_FLASH_PLAYER: "true" }), false);
  assert.equal(isLegacyFlashProofEnabled({ DEV: true, VITE_ENABLE_LEGACY_FLASH_PLAYER: "true" }), true);
  assert.equal(isLegacyFlashFlagEnabled({}), false);
});

test("only the exact hidden development hash is recognized", () => {
  assert.equal(isLegacyFlashProofHash("#/dev/ultimate-b2-legacy-player"), true);
  assert.equal(isLegacyFlashProofHash("#/student/dev/ultimate-b2-legacy-player"), false);
});

test("gateway host guard accepts loopback hosts only", () => {
  assert.equal(isLocalRequestHost("localhost:8888"), true);
  assert.equal(isLocalRequestHost("127.0.0.1:8888"), true);
  assert.equal(isLocalRequestHost("[::1]:8888"), true);
  assert.equal(isLocalRequestHost("eduforge.example"), false);
});

test("scoped source tokens reject tampering and expiry", () => {
  const secret = "test-secret-that-is-long-enough";
  const token = createLegacyFlashSourceToken({ userId: "student-1", now: 1_000_000, secret });
  assert.equal(verifyLegacyFlashSourceToken(token, { now: 1_001_000, secret }).sub, "student-1");
  assert.equal(verifyLegacyFlashSourceToken(`${token}x`, { now: 1_001_000, secret }), null);
  assert.equal(verifyLegacyFlashSourceToken(token, { now: 1_400_000, secret }), null);
});

test("publisher source allowlist permits startup and Unit 2 only", () => {
  assert.equal(isAllowlistedLegacySourcePath("Contents/Resources/UltimateB2.swf"), true);
  assert.equal(isAllowlistedLegacySourcePath("Contents/Resources/assets/home/menu.xml"), true);
  assert.equal(isAllowlistedLegacySourcePath("Contents/Resources/assets/books/book1/unit/2/part1/page.swf"), true);
  assert.equal(isAllowlistedLegacySourcePath("Contents/Resources/assets/books/book1/unit/3/part1/page.swf"), false);
  assert.equal(isAllowlistedLegacySourcePath("Contents/Resources/Ultimate English B2.exe"), false);
  assert.equal(isAllowlistedLegacySourcePath("Contents/Resources/assets/keyboard/keyboard.bat"), false);
  assert.equal(isAllowlistedLegacySourcePath("../.env"), false);
  assert.equal(isAllowlistedLegacySourcePath("C:/Windows/system.ini"), false);
});

test("source resolution rejects a symlink that escapes the publisher root", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eduforge-legacy-proof-"));
  t.after(() => fs.rmSync(temporaryRoot, { force: true, recursive: true }));
  const sourceRoot = path.join(temporaryRoot, "source");
  const allowedDirectory = path.join(sourceRoot, "Contents/Resources/assets/home");
  fs.mkdirSync(allowedDirectory, { recursive: true });
  const outsideDirectory = path.join(temporaryRoot, "outside");
  fs.mkdirSync(outsideDirectory);
  fs.writeFileSync(path.join(outsideDirectory, "menu.xml"), "outside");
  fs.symlinkSync(outsideDirectory, path.join(allowedDirectory, "linked"), "junction");
  assert.throws(() => resolveAllowlistedLegacySourceFile(sourceRoot, "Contents/Resources/assets/home/linked/menu.xml"), /escaped/);
});

test("publisher binaries are ignored and never tracked", () => {
  const ignore = fs.readFileSync(path.resolve(".gitignore"), "utf8");
  assert.match(ignore, /^Ultimate English B2\.app\/$/m);
  const trackedPublisherFiles = execFileSync("git", ["ls-files", "Ultimate English B2.app"], { encoding: "utf8" }).trim();
  assert.equal(trackedPublisherFiles, "");
});

test("normal application source excludes the proof component and route", () => {
  const app = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");
  const routes = fs.readFileSync(path.resolve("src/utils/hashRoutes.js"), "utf8");
  assert.doesNotMatch(app, /LegacyFlashProofView|legacy-flash-proof/);
  assert.doesNotMatch(routes, /LEGACY_FLASH_PROOF_ROUTE|legacy-flash-proof|ultimate-b2-legacy-player/);
  assert.doesNotMatch(fs.readFileSync(path.resolve("src/components/lms/Shared.jsx"), "utf8"), /ultimate-b2-legacy-player/);
});

test("proof code and reports do not leak an absolute publisher path", () => {
  const files = [
    "books/ultimate-b2/generated/legacy-flash/compatibility-input.json",
    "books/ultimate-b2/generated/legacy-flash/compatibility-result.json",
    "netlify/functions/legacy-flash-proof.js",
    "scripts/ultimate-b2/legacy-flash-vite-plugin.mjs",
    "src/features/legacyFlash/LegacyFlashProofView.jsx",
  ];
  const combined = files.map((file) => fs.readFileSync(path.resolve(file), "utf8")).join("\n");
  assert.doesNotMatch(combined, /[A-Za-z]:\\Users\\/);
  assert.doesNotMatch(combined, /Nextcloud[\\/]EduForge[\\/]Ultimate English B2\.app/);
});
