const textEncoder = new TextEncoder();

export const WORKSHEET_IMAGE_MAXIMUM_BYTES = 10 * 1024 * 1024;
export const WORKSHEET_IMAGE_MAXIMUM_DIMENSION = 8_192;
export const WORKSHEET_PDF_MAXIMUM_BYTES = 25 * 1024 * 1024;
export const WORKSHEET_IMAGE_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);

function ascii(value) { return textEncoder.encode(value); }

function concatenate(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function decimal(value) { return Number(value.toFixed(3)).toString(); }

export function worksheetPdfLayout(imageWidth, imageHeight) {
  if (!Number.isSafeInteger(imageWidth) || !Number.isSafeInteger(imageHeight) || imageWidth < 1 || imageHeight < 1) throw new Error("Worksheet image dimensions are invalid.");
  const portrait = [595.28, 841.89];
  const [pageWidth, pageHeight] = imageWidth > imageHeight ? [portrait[1], portrait[0]] : portrait;
  const margin = 36;
  const scale = Math.min((pageWidth - margin * 2) / imageWidth, (pageHeight - margin * 2) / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  return { pageWidth, pageHeight, drawWidth, drawHeight, x: (pageWidth - drawWidth) / 2, y: (pageHeight - drawHeight) / 2 };
}

export function buildSinglePageImagePdf({ jpegBytes, width, height }) {
  const image = jpegBytes instanceof Uint8Array ? jpegBytes : new Uint8Array(jpegBytes || []);
  if (!image.length) throw new Error("Worksheet JPEG bytes are empty.");
  const layout = worksheetPdfLayout(width, height);
  const mediaBox = `${decimal(layout.pageWidth)} ${decimal(layout.pageHeight)}`;
  const content = ascii(`q\n${decimal(layout.drawWidth)} 0 0 ${decimal(layout.drawHeight)} ${decimal(layout.x)} ${decimal(layout.y)} cm\n/Im0 Do\nQ\n`);
  const bodies = [
    ascii("<< /Type /Catalog /Pages 2 0 R >>"),
    ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${mediaBox}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    concatenate([ascii(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, ascii("\nendstream")]),
    concatenate([ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii("endstream")]),
  ];
  const chunks = [concatenate([ascii("%PDF-1.4\n%"), new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]), ascii("\n")])];
  const offsets = [0];
  let byteLength = chunks[0].length;
  bodies.forEach((body, index) => {
    offsets.push(byteLength);
    const object = concatenate([ascii(`${index + 1} 0 obj\n`), body, ascii("\nendobj\n")]);
    chunks.push(object);
    byteLength += object.length;
  });
  const xrefOffset = byteLength;
  const xref = `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return concatenate([...chunks, ascii(xref)]);
}

function worksheetPdfName(name) {
  const base = String(name || "worksheet").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "worksheet";
  return `${base}.pdf`;
}

async function decodedImage(file) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("The worksheet image cannot be decoded.")); image.src = url; });
    return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => {} };
  } finally { URL.revokeObjectURL(url); }
}

function canvasJpeg(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The worksheet image could not be converted to JPEG.")), "image/jpeg", 0.92));
}

export async function convertWorksheetUploadToPdf(file) {
  if (!file) throw new Error("Choose a worksheet file.");
  if (file.type === "application/pdf") return file;
  if (!WORKSHEET_IMAGE_TYPES.includes(file.type)) throw new Error("Worksheet images must be PNG, JPEG, or WebP.");
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > WORKSHEET_IMAGE_MAXIMUM_BYTES) throw new Error("Worksheet images must be no larger than 10 MiB.");
  let decoded;
  try {
    decoded = await decodedImage(file);
    if (!Number.isSafeInteger(decoded.width) || !Number.isSafeInteger(decoded.height) || decoded.width < 1 || decoded.height < 1
      || decoded.width > WORKSHEET_IMAGE_MAXIMUM_DIMENSION || decoded.height > WORKSHEET_IMAGE_MAXIMUM_DIMENSION
      || decoded.width > Math.floor(WORKSHEET_IMAGE_MAXIMUM_DIMENSION ** 2 / decoded.height)) throw new Error("Worksheet image dimensions exceed the managed raster limit.");
    const canvas = document.createElement("canvas");
    canvas.width = decoded.width; canvas.height = decoded.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Worksheet image conversion is unavailable in this browser.");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(decoded.image, 0, 0);
    const jpeg = new Uint8Array(await (await canvasJpeg(canvas)).arrayBuffer());
    const pdf = buildSinglePageImagePdf({ jpegBytes: jpeg, width: decoded.width, height: decoded.height });
    if (pdf.length > WORKSHEET_PDF_MAXIMUM_BYTES) throw new Error("The converted worksheet PDF exceeds 25 MiB.");
    return new File([pdf], worksheetPdfName(file.name), { type: "application/pdf", lastModified: file.lastModified || Date.now() });
  } catch (error) {
    if (error?.message?.startsWith("Worksheet")) throw error;
    throw new Error("The worksheet image cannot be decoded.");
  } finally { decoded?.close(); }
}
