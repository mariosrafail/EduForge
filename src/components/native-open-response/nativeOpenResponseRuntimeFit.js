import { autoFitNativeOpenResponseAnswer } from "../../data/native-activities/nativeOpenResponseAutoFit.js";

let measurementCanvas = null;

export function nativeOpenResponseBrowserTextMeasurer(fontFamily) {
  if (!globalThis.document?.createElement) return null;
  measurementCanvas ||= globalThis.document.createElement("canvas");
  const context = measurementCanvas.getContext("2d");
  if (!context) return null;
  return (text, fontSize) => {
    context.font = `${fontSize}px ${fontFamily}`;
    return Math.round(context.measureText(String(text)).width * 1_000) / 1_000;
  };
}

export function fitNativeOpenResponseRuntimeAnswer({ text, responseRegion, fontFamily, fontStatus = "default" }) {
  const measureTextWidth = fontStatus === "loading" ? null : nativeOpenResponseBrowserTextMeasurer(fontFamily);
  return autoFitNativeOpenResponseAnswer({ text, responseRegion, ...(measureTextWidth ? { measureTextWidth } : {}) });
}
