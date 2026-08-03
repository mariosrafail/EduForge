import type { CapacitorConfig } from "@capacitor/cli";

const teacherPresentation = process.env.CAPACITOR_BUILD_MODE === "teacher";

const config: CapacitorConfig = {
  appId: "com.eduforge.offlinebooks",
  appName: teacherPresentation
    ? "Hamilton House LMS Teacher"
    : "Hamilton House LMS Student",
  webDir: "dist",
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "#000000",
    },
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
