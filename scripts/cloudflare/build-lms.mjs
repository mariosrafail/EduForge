import { buildReviewTarget } from "../netlify/build-review-target.mjs";

buildReviewTarget("lms", process.env, { outDir: "dist-cloudflare/lms" }).catch((error) => {
  console.error(`Cloudflare LMS build failed: ${error.message}`);
  process.exitCode = 1;
});
