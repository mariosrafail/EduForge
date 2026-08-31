import sharp from "sharp";

export const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==", "base64");
export const secondPixelPng = Buffer.concat([onePixelPng, Buffer.from([0])]);
export const landscapeChoicePng = await sharp({ create: { width: 1200, height: 700, channels: 4, background: { r: 225, g: 239, b: 248, alpha: 1 } } }).png().toBuffer();
export const halfHeightChoicePng = await sharp({ create: { width: 1024, height: 291, channels: 4, background: { r: 225, g: 239, b: 248, alpha: 1 } } }).png().toBuffer();
export const portraitChoicePng = await sharp({ create: { width: 700, height: 1200, channels: 4, background: { r: 245, g: 229, b: 238, alpha: 1 } } }).png().toBuffer();
export const smallFourThreeChoicePng = await sharp({ create: { width: 320, height: 240, channels: 4, background: { r: 235, g: 242, b: 219, alpha: 1 } } }).png().toBuffer();
export const tallReadablePng = await sharp({ create: { width: 1000, height: 1800, channels: 4, background: { r: 247, g: 244, b: 232, alpha: 1 } } }).png().toBuffer();
export const replacementTallReadablePng = Buffer.concat([tallReadablePng, Buffer.from([0])]);
export const hotspotMp3 = (marker) => Buffer.from([0xff, 0xfb, 0x90, 0x64, ...new Array(32).fill(marker)]);
export const worksheetPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
export const replacementWorksheetPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Version /1.4 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
export const oldschoolSrt = `1\n00:00:00,000 --> 00:00:02,000\nThe opening sentence spans two printed lines.\n\n2\n00:00:02,000 --> 00:00:05,000\nThe later sentence appears near the bottom of the page.`;
