import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { TextDecoder } from "node:util";
import { findBrandingViolations, isMaintainedTrackedPath } from "./_branding-audit.mjs";

const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter(isMaintainedTrackedPath);
const decoder = new TextDecoder("utf-8", { fatal: true });
const entries = [];

for (const path of paths) {
  const bytes = await readFile(path);
  if (bytes.includes(0)) continue;
  try {
    entries.push({ path, content: decoder.decode(bytes) });
  } catch {
    // Non-UTF-8 tracked assets are binary for this maintained-text audit.
  }
}

const violations = findBrandingViolations(entries);
if (violations.length) {
  for (const violation of violations) {
    const location = violation.line ? `${violation.path}:${violation.line}` : violation.path;
    console.error(`FAIL ${location}: forbidden retired brand: ${violation.context}`);
  }
  process.exitCode = 1;
} else {
  console.log(`PASS branding audit: ${entries.length} maintained tracked text files checked`);
}
