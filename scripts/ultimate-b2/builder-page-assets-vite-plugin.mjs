import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import manifest from "../../src/data/ultimate-b2/generated/students-book-page-assets.json" with { type: "json" };

const PUBLIC_ROOT = "/page-library/ultimate-b2/ultimate-b2-students-book";

function extension(page) {
  return page.mimeType === "image/jpeg" ? ".jpg" : page.mimeType === "image/webp" ? ".webp" : ".png";
}

export function ultimateB2BuilderPageAssetPublicPath(page) {
  return `${PUBLIC_ROOT}/${page.pageId}${extension(page)}`;
}

async function verifiedBytes(page) {
  const bytes = await readFile(path.resolve(page.repositoryPath));
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== page.byteSize || checksum !== page.checksumSha256) {
    throw new Error(`Students Book page asset changed without regenerating its manifest: ${page.pageId}`);
  }
  return bytes;
}

export function ultimateB2BuilderPageAssetsPlugin({ enabled = false } = {}) {
  if (!enabled) return null;
  const pagesByPath = new Map(manifest.pages.map((page) => [ultimateB2BuilderPageAssetPublicPath(page), page]));
  return {
    name: "ultimate-b2-builder-page-assets",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || "/", "http://builder.local").pathname;
        const page = pagesByPath.get(pathname);
        if (!page) return next();
        try {
          const bytes = await verifiedBytes(page);
          response.statusCode = 200;
          response.setHeader("Content-Type", page.mimeType);
          response.setHeader("Content-Length", String(bytes.length));
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("X-Content-Type-Options", "nosniff");
          if (request.method === "HEAD") return response.end();
          if (request.method !== "GET") {
            response.statusCode = 405;
            return response.end();
          }
          return response.end(bytes);
        } catch (error) {
          return next(error);
        }
      });
    },
    async generateBundle() {
      for (const page of manifest.pages) {
        this.emitFile({
          type: "asset",
          fileName: ultimateB2BuilderPageAssetPublicPath(page).slice(1),
          source: await verifiedBytes(page),
        });
      }
    },
  };
}
