import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isAndroidOffline = env.VITE_APP_MODE === "android-offline" || process.env.VITE_APP_MODE === "android-offline";
  const androidOfflineServiceStub = path.resolve(process.cwd(), "src/apps/android-offline/androidOfflineServiceStubs.js");

  return {
    plugins: [react()],
    resolve: {
      alias: [
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
