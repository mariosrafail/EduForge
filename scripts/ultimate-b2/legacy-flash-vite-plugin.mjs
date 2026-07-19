import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isLegacyFlashFlagEnabled,
  isLocalRequestHost,
  legacyFlashTokenSecret,
  verifyLegacyFlashSourceToken,
} from "../../shared/legacyFlashProof.js";

export const RUFFLE_VERSION = "0.4.0";
export const RUFFLE_ROUTE_PREFIX = "/__legacy-ruffle/";
export const SOURCE_ROUTE_PREFIX = "/__legacy-ultimate-b2-source/";

const blockedExtensions = new Set([".app", ".bat", ".cmd", ".dll", ".dylib", ".exe", ".sh", ".so"]);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".flv", "video/x-flv"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".swf", "application/x-shockwave-flash"],
  [".wasm", "application/wasm"],
  [".xml", "application/xml; charset=utf-8"],
]);

const startupPrefixes = [
  "Contents/Resources/assets/audioPlayer/",
  "Contents/Resources/assets/bravo/",
  "Contents/Resources/assets/games/",
  "Contents/Resources/assets/home/",
  "Contents/Resources/assets/naviBar/",
  "Contents/Resources/assets/params/",
  "Contents/Resources/assets/toolbar/",
  "Contents/Resources/assets/topbar/",
  "Contents/Resources/assets/videoPlayer/",
  "Contents/Resources/assets/wordlist/",
  "Contents/Resources/assets/books/book1/book_menu/",
  "Contents/Resources/assets/books/sounds/",
  "Contents/Resources/assets/books/wideMenus/",
];

export function isAllowlistedLegacySourcePath(relativePath) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return false;
  if (path.posix.normalize(normalized) !== normalized || normalized.split("/").includes("..")) return false;
  if (blockedExtensions.has(path.posix.extname(normalized).toLowerCase())) return false;
  if (normalized === "Contents/Resources/UltimateB2.swf") return true;
  if (startupPrefixes.some((prefix) => normalized.startsWith(prefix))) return true;
  return /^Contents\/Resources\/assets\/books\/book1\/[^/]+\/2(?:\/|$)/.test(normalized);
}

export function resolveAllowlistedLegacySourceFile(sourceRoot, relativePath) {
  if (!isAllowlistedLegacySourcePath(relativePath)) throw new Error("Source path is not allowlisted");
  const realRoot = fs.realpathSync(sourceRoot);
  const candidate = path.resolve(realRoot, ...relativePath.split("/"));
  const realCandidate = fs.realpathSync(candidate);
  const relative = path.relative(realRoot, realCandidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Source path escaped the publisher root");
  return realCandidate;
}

function sendFile(req, res, filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error("Requested source is not a file");
  const contentType = contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
  const range = String(req.headers.range || "").match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = stat.size - 1;
  if (range) {
    start = range[1] ? Number(range[1]) : 0;
    end = range[2] ? Number(range[2]) : end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= stat.size) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
  } else {
    res.statusCode = 200;
  }
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Length", String(end - start + 1));
  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

function runtimeFiles(packageRoot) {
  return new Map(fs.readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^(?:ruffle\.js|core\.ruffle\..+\.js|[a-f0-9]+\.wasm)$/.test(entry.name))
    .map((entry) => [entry.name, path.join(packageRoot, entry.name)]));
}

export function legacyFlashProofPlugin(env = process.env) {
  const enabled = isLegacyFlashFlagEnabled(env);
  const sourceRoot = env.ULTIMATE_B2_SOURCE_ROOT;
  const secret = legacyFlashTokenSecret(env);
  const packageJsonPath = enabled ? fileURLToPath(import.meta.resolve("@ruffle-rs/ruffle/package.json")) : null;
  const ruffleFiles = enabled ? runtimeFiles(path.dirname(packageJsonPath)) : new Map();

  return {
    name: "ultimate-b2-legacy-flash-proof",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host || "";
        const pathname = new URL(req.url || "/", `http://${host || "localhost"}`).pathname;
        if (!pathname.startsWith(RUFFLE_ROUTE_PREFIX) && !pathname.startsWith(SOURCE_ROUTE_PREFIX)) return next();
        if (!enabled || !isLocalRequestHost(host) || !["GET", "HEAD"].includes(req.method || "")) {
          res.statusCode = 404;
          return res.end("Not found");
        }
        try {
          if (pathname.startsWith(RUFFLE_ROUTE_PREFIX)) {
            const name = decodeURIComponent(pathname.slice(RUFFLE_ROUTE_PREFIX.length));
            const runtimeFile = ruffleFiles.get(name);
            if (!runtimeFile) throw new Error("Runtime file is not allowlisted");
            return sendFile(req, res, runtimeFile);
          }
          if (!sourceRoot || !secret) throw new Error("Legacy Flash proof is not configured");
          const remainder = pathname.slice(SOURCE_ROUTE_PREFIX.length);
          const slashIndex = remainder.indexOf("/");
          if (slashIndex < 1) throw new Error("Missing scoped source token");
          const token = remainder.slice(0, slashIndex);
          const relativePath = decodeURIComponent(remainder.slice(slashIndex + 1));
          if (!verifyLegacyFlashSourceToken(token, { secret })) {
            throw new Error("Source request is not authorized");
          }
          return sendFile(req, res, resolveAllowlistedLegacySourceFile(sourceRoot, relativePath));
        } catch {
          res.statusCode = 404;
          res.setHeader("Cache-Control", "no-store");
          return res.end("Not found");
        }
      });
    },
  };
}
