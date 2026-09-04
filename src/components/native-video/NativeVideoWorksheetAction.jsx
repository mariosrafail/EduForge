import { Capacitor } from "@capacitor/core";
import { Download } from "lucide-react";

import { PdfSaver } from "./pdfSaverPlugin.js";

export async function openNativeVideoWorksheet({ video, worksheetSrc }) {
  if (!video?.worksheet || !worksheetSrc) throw new Error("Video Worksheet is unavailable.");
  if (Capacitor.isNativePlatform()) {
    await PdfSaver.savePdf({ assetPath: new URL(worksheetSrc, globalThis.location.href).pathname, filename: video.worksheet.fileName });
    return;
  }
  const link = document.createElement("a");
  link.href = worksheetSrc;
  link.download = video.worksheet.fileName;
  link.type = "application/pdf";
  link.rel = "noopener";
  link.click();
}

export function NativeVideoWorksheetAction({ video, worksheetSrc, onError = () => {} }) {
  if (!video?.worksheet || !worksheetSrc) return null;
  return <button type="button" className="native-video-worksheet-action" onClick={() => openNativeVideoWorksheet({ video, worksheetSrc }).catch(() => onError("Video Worksheet could not be saved."))}><Download aria-hidden="true" /><span>Video Worksheet</span></button>;
}
