import path from "node:path";
import { MANAGED_MP3_MAXIMUM_BYTES } from "../../../lib/book-assets/audio-inspection.js";
import { MANAGED_MP4_MAXIMUM_BYTES } from "../../../lib/book-assets/video-inspection.js";
import { MANAGED_PDF_MAXIMUM_BYTES } from "../../../lib/book-assets/pdf-inspection.js";
import { MANAGED_RASTER_MAXIMUM_BYTES, MANAGED_RASTER_TYPES } from "../../../lib/book-assets/raster-inspection.js";
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const safeId = /^[a-z0-9][a-z0-9-]{0,127}$/;
const declaredRasterTypes = new Set(Object.values(MANAGED_RASTER_TYPES));
const extensionTypes = new Map([[".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"], [".mp3", "audio/mpeg"], [".mp4", "video/mp4"], [".pdf", "application/pdf"]]);

export function normalizeAssetDescriptor(input) {
  if (!exact(input, ["name", "size", "type", "assetSlot", "purpose"])) throw new Error("invalid_file_descriptor");
  const name = String(input.name || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._() -]{0,179}$/.test(name) || path.basename(name) !== name || /^(?:[a-z]:|\\\\|\/)|%2f|%5c|[\u0000-\u001f\u007f]/i.test(name)) throw new Error("invalid_filename");
  const extension = path.extname(name).toLowerCase();
  const type = String(input.type || "").toLowerCase();
  const purpose = String(input.purpose || "native-asset");
  const worksheet = purpose === "video-worksheet";
  if (purpose === "teacher-answer" && !declaredRasterTypes.has(type)) throw new Error("declared_mime_mismatch");
  if (!extensionTypes.has(extension) || extensionTypes.get(extension) !== type || (worksheet ? type !== "application/pdf" : !["native-asset", "teacher-answer"].includes(purpose) || (!declaredRasterTypes.has(type) && !["audio/mpeg", "video/mp4"].includes(type)))) throw new Error("declared_mime_mismatch");
  const maximumBytes = type === "audio/mpeg" ? MANAGED_MP3_MAXIMUM_BYTES : type === "video/mp4" ? MANAGED_MP4_MAXIMUM_BYTES : type === "application/pdf" ? MANAGED_PDF_MAXIMUM_BYTES : MANAGED_RASTER_MAXIMUM_BYTES;
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > maximumBytes) throw new Error("declared_file_too_large");
  if (!safeId.test(String(input.assetSlot || ""))) throw new Error("invalid_asset_slot");
  return { name, size: input.size, type, assetSlot: input.assetSlot, purpose };
}
