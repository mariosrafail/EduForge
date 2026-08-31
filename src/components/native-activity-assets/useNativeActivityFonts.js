import { useEffect, useMemo } from "react";

import { nativeActivityFontFamilyAlias } from "../../data/native-activities/nativeActivityFont.js";

export function useNativeActivityFonts(document, assetUrl) {
  const sources = useMemo(() => (document?.assets || [])
    .filter((asset) => asset.role === "activity_font")
    .map((asset) => ({ alias: nativeActivityFontFamilyAlias(asset.assetId), url: assetUrl(asset.assetId) })), [assetUrl, document?.assets]);
  const identity = sources.map((source) => `${source.alias}\u0000${source.url}`).join("\u0001");

  useEffect(() => {
    if (typeof FontFace !== "function" || !globalThis.document?.fonts) return undefined;
    const faces = sources.map(({ alias, url }) => new FontFace(alias, `url(${JSON.stringify(url)}) format("truetype")`));
    faces.forEach((face) => {
      globalThis.document.fonts.add(face);
      face.load().catch(() => {});
    });
    return () => faces.forEach((face) => globalThis.document.fonts.delete(face));
  }, [identity]);
}
