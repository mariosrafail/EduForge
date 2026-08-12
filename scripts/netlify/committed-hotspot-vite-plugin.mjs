import { execFileSync } from "node:child_process";

const publicId = "virtual:ultimate-b2-hosted-hotspot-data";
const resolvedId = "\0ultimate-b2-hosted-hotspot-data";
const reviewManifestPublicId = "virtual:ultimate-b2-review-pack-manifest";
const reviewManifestResolvedId = "\0ultimate-b2-review-pack-manifest";
const repositoryPath = "src/data/ultimate-b2/authoring/studentsBookHotspots.json";
const packManifestPath = "android-content-packs/ultimate-b2-students-book/manifest.json";

export function committedHotspotVitePlugin({ enabled = false } = {}) {
  return {
    name: "ultimate-b2-committed-hotspot-review",
    resolveId(id) {
      if (!enabled) return null;
      if (id === publicId) return resolvedId;
      if (id === reviewManifestPublicId) return reviewManifestResolvedId;
      return null;
    },
    load(id) {
      if (!enabled) return null;
      if (id === resolvedId) {
        const committed = execFileSync("git", ["show", `HEAD:${repositoryPath}`], { encoding: "utf8" });
        return `export default Object.freeze(${JSON.stringify(JSON.parse(committed))});`;
      }
      if (id === reviewManifestResolvedId) {
        const committed = execFileSync("git", ["show", `HEAD:${packManifestPath}`], { encoding: "utf8" });
        const manifest = JSON.parse(committed);
        const publicFiles = Object.fromEntries(Object.entries(manifest.files || {}).filter(([name]) => name !== "teacher-solutions.json"));
        return `export default Object.freeze(${JSON.stringify({ ...manifest, files: publicFiles })});`;
      }
      return null;
    },
  };
}
