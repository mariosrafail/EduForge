import { buildReviewTarget } from "../netlify/build-review-target.mjs";

const outputRoot = "dist-cloudflare/builder";
const previousViewerBase = process.env.VITE_HOSTED_VIEWER_BASE_URL;
const previousPlayerMedia = process.env.VITE_CLOUDFLARE_PLAYER_MEDIA;

try {
  process.env.VITE_HOSTED_VIEWER_BASE_URL = "https://builder.hhplms.workers.dev/player/";
  await buildReviewTarget("ultimate-b2-builder", process.env, { outDir: outputRoot });
  process.env.VITE_CLOUDFLARE_PLAYER_MEDIA = "true";
  await buildReviewTarget("ultimate-b2-interactive", process.env, { outDir: `${outputRoot}/player`, base: "/player/" });
} catch (error) {
  console.error(`Cloudflare Builder build failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (previousViewerBase === undefined) delete process.env.VITE_HOSTED_VIEWER_BASE_URL;
  else process.env.VITE_HOSTED_VIEWER_BASE_URL = previousViewerBase;
  if (previousPlayerMedia === undefined) delete process.env.VITE_CLOUDFLARE_PLAYER_MEDIA;
  else process.env.VITE_CLOUDFLARE_PLAYER_MEDIA = previousPlayerMedia;
}
