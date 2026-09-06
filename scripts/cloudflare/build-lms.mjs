import { buildReviewTarget } from "../netlify/build-review-target.mjs";
import { emitLmsPageAssets } from "./lms-page-assets.mjs";

buildReviewTarget("lms", process.env, { outDir: "dist-cloudflare/lms" }).then(() => emitLmsPageAssets("dist-cloudflare/lms")).catch((error) => {
  console.error(`Cloudflare LMS build failed: ${error.message}`);
  process.exitCode = 1;
});
