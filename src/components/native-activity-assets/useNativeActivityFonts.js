import { useEffect, useMemo, useState } from "react";

import { nativeActivityFontFamilyAlias } from "../../data/native-activities/nativeActivityFont.js";
import { subscribeAndSynchronizeNativeActivityFontEntries } from "./nativeActivityFontSubscription.js";

const registeredFaces = new Map();

function fontEnvironment() {
  return typeof globalThis.FontFace === "function" && globalThis.document?.fonts
    ? { FontFace: globalThis.FontFace, fonts: globalThis.document.fonts }
    : null;
}

function notify(entry) {
  for (const subscriber of entry.subscribers) subscriber();
}

function registeredFace(source) {
  const key = `${source.alias}\u0000${source.url}`;
  let entry = registeredFaces.get(key);
  if (entry) return entry;
  entry = { ...source, face: null, status: "idle", subscribers: new Set() };
  registeredFaces.set(key, entry);
  return entry;
}

function beginFontLoad(entry) {
  if (entry.status !== "idle") return;
  const environment = fontEnvironment();
  if (!environment) {
    entry.status = "unsupported";
    notify(entry);
    return;
  }
  entry.status = "loading";
  try {
    entry.face = new environment.FontFace(entry.alias, `url(${JSON.stringify(entry.url)}) format("truetype")`);
    environment.fonts.add(entry.face);
    entry.face.load().then((loadedFace) => {
      if (loadedFace !== entry.face || loadedFace.status !== "loaded") throw new Error("managed_font_not_loaded");
      entry.status = "loaded";
      notify(entry);
    }).catch(() => {
      entry.status = "error";
      notify(entry);
    });
  } catch {
    entry.status = "error";
    notify(entry);
  }
}

function publicState(sources) {
  const fonts = sources.map((source) => {
    const entry = registeredFace(source);
    return { assetId: source.assetId, slot: source.slot, alias: source.alias, status: entry.status };
  });
  return {
    fonts,
    failures: fonts.filter((font) => font.status === "error"),
    status: fonts.some((font) => font.status === "error") ? "error"
      : fonts.some((font) => font.status === "loading" || font.status === "idle") ? "loading"
        : fonts.length && fonts.every((font) => font.status === "loaded") ? "loaded" : "ready",
  };
}

export function useNativeActivityFonts(document, assetUrl) {
  const sources = useMemo(() => (document?.assets || [])
    .filter((asset) => asset.role === "activity_font")
    .map((asset) => ({ assetId: asset.assetId, slot: asset.slot, alias: nativeActivityFontFamilyAlias(asset.assetId), url: assetUrl(asset.assetId) })), [assetUrl, document?.assets]);
  const identity = sources.map((source) => `${source.alias}\u0000${source.url}`).join("\u0001");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const entries = sources.map(registeredFace);
    const update = () => setRevision((current) => current + 1);
    return subscribeAndSynchronizeNativeActivityFontEntries(entries, update, beginFontLoad);
  }, [identity]);

  return useMemo(() => publicState(sources), [identity, revision]);
}

export function nativeActivitySelectedFontState(fontState, document, slot) {
  if (!slot) return { status: "default", alias: null, assetId: null, slot: null };
  const reference = document?.assets?.find((asset) => asset.slot === slot && asset.role === "activity_font");
  if (!reference) return { status: "error", alias: null, assetId: null, slot };
  return fontState?.fonts?.find((font) => font.assetId === reference.assetId)
    || { status: "loading", alias: nativeActivityFontFamilyAlias(reference.assetId), assetId: reference.assetId, slot };
}
