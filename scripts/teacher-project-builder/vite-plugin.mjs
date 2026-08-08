import fs from "node:fs/promises";
import path from "node:path";

const VIRTUAL_ID = "virtual:teacher-project-config";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

export function teacherProjectVitePlugin({ configPath } = {}) {
  const resolved = configPath ? path.resolve(configPath) : null;
  return {
    name: "hhplms-teacher-project-config",
    enforce: "pre",
    resolveId(id) { return id === VIRTUAL_ID ? RESOLVED_ID : null; },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      if (!resolved) throw new Error("TEACHER_PROJECT_RUNTIME_CONFIG is required for a Teacher Project build.");
      const info = await fs.lstat(resolved).catch(() => null);
      if (!info?.isFile() || info.isSymbolicLink()) throw new Error("Teacher Project runtime configuration is unavailable.");
      const candidate = JSON.parse(await fs.readFile(resolved, "utf8"));
      return `export default ${JSON.stringify(candidate)};`;
    },
  };
}
