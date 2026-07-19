import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { legacyFlashProofPlugin } from "./scripts/ultimate-b2/legacy-flash-vite-plugin.mjs";
import { unit2ProtectedMediaPlugin } from "./scripts/ultimate-b2/unit2-media-vite-plugin.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isAndroidOffline = env.VITE_APP_MODE === "android-offline" || process.env.VITE_APP_MODE === "android-offline";
  const androidOfflineServiceStub = path.resolve(process.cwd(), "src/apps/android-offline/androidOfflineServiceStubs.js");
  const ultimateB2PageAssets = path.resolve(process.cwd(), isAndroidOffline
    ? "src/data/ultimate-b2/ultimateB2PageAssets.offline.js"
    : "src/data/ultimate-b2/ultimateB2PageAssets.web.js");
  const ultimateB2MediaAssets = path.resolve(process.cwd(), isAndroidOffline
    ? "src/data/ultimate-b2/ultimateB2MediaAssets.offline.js"
    : "src/data/ultimate-b2/ultimateB2MediaAssets.web.js");
  const ultimateB2CoverAssets = path.resolve(process.cwd(), isAndroidOffline
    ? "src/data/ultimate-b2/ultimateB2CoverAssets.offline.js"
    : "src/data/ultimate-b2/ultimateB2CoverAssets.web.js");

  return {
    plugins: [react(), unit2ProtectedMediaPlugin({ androidOffline: isAndroidOffline }), legacyFlashProofPlugin({ ...process.env, ...env })].filter(Boolean),
    resolve: {
      alias: [
        {
          find: "virtual:ultimate-b2-page-assets",
          replacement: ultimateB2PageAssets,
        },
        {
          find: "virtual:ultimate-b2-media-assets",
          replacement: ultimateB2MediaAssets,
        },
        {
          find: "virtual:ultimate-b2-cover-assets",
          replacement: ultimateB2CoverAssets,
        },
        {
          find: "virtual:app-entry",
          replacement: isAndroidOffline ? "/src/apps/android-offline/offlineEntry.jsx" : "/src/webEntry.jsx",
        },
        {
          find: "virtual:app-styles",
          replacement: isAndroidOffline ? "/src/apps/android-offline/offlineRoot.css" : "/src/styles/index.css",
        },
        ...(isAndroidOffline
          ? [
              {
                find: "../../../services/bookActivitiesApi.js",
                replacement: androidOfflineServiceStub,
              },
              {
                find: "../../../../services/bookActivitiesApi.js",
                replacement: androidOfflineServiceStub,
              },
              {
                find: "../../../../services/bookMediaAssetsApi.js",
                replacement: androidOfflineServiceStub,
              },
              {
                find: "../../../services/bookPageHotspotsApi.js",
                replacement: androidOfflineServiceStub,
              },
            ]
          : []),
      ],
    },
  };
});
