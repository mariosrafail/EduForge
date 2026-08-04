import fs from "node:fs/promises";
import path from "node:path";
import { AIR_DESCRIPTOR_RELATIVE_PATH, readAirDescriptor } from "./air-descriptor.js";
import { portablePath } from "./path-safety.js";

export class AppRootResolutionError extends Error {
  constructor(code, message, diagnostics = []) {
    super(message);
    this.name = "AppRootResolutionError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

async function descriptorExists(directory) {
  try { return (await fs.lstat(path.join(directory, ...AIR_DESCRIPTOR_RELATIVE_PATH.split("/")))).isFile(); }
  catch { return false; }
}

export async function resolveApplicationRoot(selectedPath, { maxDepth = 5, maxDirectories = 2_000 } = {}) {
  const selectedAbsolutePath = path.resolve(selectedPath);
  let selectedStat;
  try { selectedStat = await fs.lstat(selectedAbsolutePath); } catch (error) {
    if (error.code === "ENOENT") throw new AppRootResolutionError("missing_source", "Selected source folder does not exist");
    throw error;
  }
  if (!selectedStat.isDirectory()) throw new AppRootResolutionError("source_not_directory", "Selected source must be a directory");
  const selectedRealPath = await fs.realpath(selectedAbsolutePath);
  const queue = [{ directory: selectedRealPath, depth: 0 }];
  const candidates = [];
  const diagnostics = [];
  let visited = 0;
  while (queue.length) {
    const current = queue.shift();
    if (++visited > maxDirectories) throw new AppRootResolutionError("resolver_directory_limit", `Application-root search exceeded ${maxDirectories} directories`, diagnostics);
    if (await descriptorExists(current.directory)) {
      try {
        candidates.push({ directory: current.directory, parsed: await readAirDescriptor(current.directory) });
      } catch (error) {
        diagnostics.push({ code: "invalid_air_candidate", path: portablePath(path.relative(selectedRealPath, current.directory)), message: error.message });
      }
      continue;
    }
    if (current.depth >= maxDepth) continue;
    for (const entry of await fs.readdir(current.directory, { withFileTypes: true })) {
      const child = path.join(current.directory, entry.name);
      if (entry.isSymbolicLink()) {
        diagnostics.push({ code: "symlink_skipped", path: portablePath(path.relative(selectedRealPath, child)) });
      } else if (entry.isDirectory()) queue.push({ directory: child, depth: current.depth + 1 });
    }
  }
  candidates.sort((left, right) => left.directory.localeCompare(right.directory));
  if (candidates.length > 1) {
    throw new AppRootResolutionError("multiple_app_roots", "Multiple valid AIR application roots were found", candidates.map((candidate) => ({ code: "valid_air_candidate", path: portablePath(path.relative(selectedRealPath, candidate.directory)) })));
  }
  if (candidates.length === 1) {
    const candidate = candidates[0];
    return {
      kind: "air_application",
      selectedAbsolutePath,
      selectedRealPath,
      canonicalAppRoot: candidate.directory,
      canonicalAppRelativePath: portablePath(path.relative(selectedRealPath, candidate.directory)),
      outerWrapper: candidate.directory !== selectedRealPath,
      descriptor: candidate.parsed.descriptor,
      descriptorAbsolutePath: candidate.parsed.descriptorAbsolutePath,
      mainSwfAbsolutePath: candidate.parsed.mainSwfAbsolutePath,
      mainSwfRelativePath: candidate.parsed.mainSwfRelativePath,
      diagnostics,
    };
  }
  if (path.basename(selectedRealPath).toLowerCase().endsWith(".app") || diagnostics.some((item) => item.code === "invalid_air_candidate")) {
    throw new AppRootResolutionError("no_valid_app_root", "No valid AIR application root was found", diagnostics);
  }
  return {
    kind: "generic_source",
    selectedAbsolutePath,
    selectedRealPath,
    canonicalAppRoot: selectedRealPath,
    canonicalAppRelativePath: ".",
    outerWrapper: false,
    descriptor: null,
    descriptorAbsolutePath: null,
    mainSwfAbsolutePath: null,
    mainSwfRelativePath: null,
    diagnostics: [...diagnostics, { code: "no_air_descriptor", path: "." }],
  };
}
