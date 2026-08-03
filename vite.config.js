import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { legacyFlashProofPlugin } from "./scripts/ultimate-b2/legacy-flash-vite-plugin.mjs";
import { unit2ProtectedMediaPlugin } from "./scripts/ultimate-b2/unit2-media-vite-plugin.mjs";
import { ultimateB2HotspotBuilderPlugin } from "./scripts/ultimate-b2/hotspot-builder-vite-plugin.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appMode = env.VITE_APP_MODE || process.env.VITE_APP_MODE || "web";
  const isAndroidTeacherOffline = appMode === "android-teacher-offline";
  const isAndroidOffline = appMode === "android-offline" || isAndroidTeacherOffline;
  const webInputs = {
    lms: path.resolve(process.cwd(), "index.html"),
    platformAdmin: path.resolve(process.cwd(), "platform-admin/index.html"),
  };
  const androidOfflineServiceStub = path.resolve(process.cwd(), "src/apps/android-offline/androidOfflineServiceStubs.js");
  const offlineDisabledBookTools = path.resolve(process.cwd(), "src/apps/android-offline/OfflineDisabledBookTools.jsx");
  const bookAuthoringTools = path.resolve(process.cwd(), "src/components/lms/books/BookAuthoringTools.jsx");
  const teacherAnswerUi = path.resolve(process.cwd(), isAndroidTeacherOffline
    ? "src/components/lms/activities/ultimate-b2/TeacherAnswerUi.jsx"
    : isAndroidOffline
      ? "src/apps/android-offline/NoTeacherAnswerUi.jsx"
      : "src/components/lms/activities/ultimate-b2/TeacherAnswerUi.jsx");
  const offlineSolutionProvider = path.resolve(
    process.cwd(),
    isAndroidTeacherOffline
      ? "src/apps/android-teacher-offline/generatedPackProvider.js"
      : "src/apps/android-teacher-offline/noOfflineSolutions.js",
  );
  const bookAssetsService = path.resolve(process.cwd(), isAndroidOffline
    ? "src/apps/android-offline/androidOfflineServiceStubs.js"
    : "src/services/bookAssetsApi.js");
  const bookContentService = path.resolve(process.cwd(), isAndroidOffline
    ? "src/apps/android-offline/androidOfflineServiceStubs.js"
    : "src/services/bookContentApi.js");
  const ultimateB2PageAssets = path.resolve(process.cwd(), isAndroidOffline
    ? isAndroidTeacherOffline
      ? "src/data/ultimate-b2/ultimateB2PageAssets.teacher-offline.js"
      : "src/data/ultimate-b2/ultimateB2PageAssets.offline.js"
    : "src/data/ultimate-b2/ultimateB2PageAssets.web.js");
  const ultimateB2MediaAssets = path.resolve(process.cwd(), isAndroidOffline
    ? isAndroidTeacherOffline
      ? "src/data/ultimate-b2/ultimateB2MediaAssets.teacher-offline.js"
      : "src/data/ultimate-b2/ultimateB2MediaAssets.offline.js"
    : "src/data/ultimate-b2/ultimateB2MediaAssets.web.js");
  const ultimateB2CoverAssets = path.resolve(process.cwd(), isAndroidOffline
    ? "src/data/ultimate-b2/ultimateB2CoverAssets.offline.js"
    : "src/data/ultimate-b2/ultimateB2CoverAssets.web.js");
  const ultimateB2Unit1Part2LegacyPilotAudio = path.resolve(
    process.cwd(),
    isAndroidOffline
      ? "src/data/ultimate-b2/unit1Part2LegacyPilotAudio.offline.js"
      : "src/data/ultimate-b2/unit1Part2LegacyPilotAudio.web.js",
  );
  const ultimateB2LegacyContent = path.resolve(
    process.cwd(),
    "src/components/lms/activities/ultimate-b2/content/webContent.js",
  );

  return {
    server: {
      watch: {
        ignored: ["**/playwright-report/**", "**/test-results/**", "**/staging-artifacts/**"],
      },
    },
    build: {
      sourcemap: false,
      assetsInlineLimit: isAndroidTeacherOffline ? 0 : 4096,
      rollupOptions: {
        input: isAndroidOffline ? path.resolve(process.cwd(), "index.html") : webInputs,
      },
    },
    plugins: [react(), ultimateB2HotspotBuilderPlugin(), unit2ProtectedMediaPlugin({ androidOffline: isAndroidOffline }), legacyFlashProofPlugin({ ...process.env, ...env })].filter(Boolean),
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
          find: "virtual:ultimate-b2-unit1-part2-legacy-pilot-audio",
          replacement: ultimateB2Unit1Part2LegacyPilotAudio,
        },
        {
          find: "virtual:ultimate-b2-legacy-content",
          replacement: ultimateB2LegacyContent,
        },
        {
          find: "virtual:app-entry",
          replacement: isAndroidTeacherOffline
            ? "/src/apps/android-teacher-offline/teacherOfflineEntry.jsx"
            : isAndroidOffline
              ? "/src/apps/android-offline/offlineEntry.jsx"
              : "/src/webEntry.jsx",
        },
        {
          find: "virtual:app-styles",
          replacement: isAndroidTeacherOffline
            ? "/src/apps/android-teacher-offline/teacherOfflineRoot.css"
            : isAndroidOffline
              ? "/src/apps/android-offline/offlineRoot.css"
              : "/src/styles/index.css",
        },
        {
          find: "virtual:teacher-offline-solutions",
          replacement: offlineSolutionProvider,
        },
        {
          find: "virtual:book-assets-service",
          replacement: bookAssetsService,
        },
        {
          find: "virtual:book-content-service",
          replacement: bookContentService,
        },
        {
          find: "virtual:book-authoring-tools",
          replacement: isAndroidOffline ? offlineDisabledBookTools : bookAuthoringTools,
        },
        {
          find: "virtual:teacher-answer-ui",
          replacement: teacherAnswerUi,
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
                find: "../../../../services/bookContentApi.js",
                replacement: androidOfflineServiceStub,
              },
              {
                find: "../../../services/bookPageHotspotsApi.js",
                replacement: androidOfflineServiceStub,
              },
              {
                find: "../../../services/bookAssetsApi.js",
                replacement: androidOfflineServiceStub,
              },
              {
                find: "../services/bookAssetsApi.js",
                replacement: androidOfflineServiceStub,
              },
            ]
          : []),
      ],
    },
  };
});
