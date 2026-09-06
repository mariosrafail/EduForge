// Internal ASSETS keys live behind the existing Worker-first function prefix.
// They are never public URLs or caller-selected storage paths.
export function lmsCanonicalPageAssetPath(image) {
  const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[image.mimeType];
  if (!extension || !/^[a-f0-9]{64}$/.test(image.checksumSha256)) throw new Error("canonical_page_identity_invalid");
  return `/.netlify/functions/_canonical-pages/${image.checksumSha256}.${extension}`;
}
