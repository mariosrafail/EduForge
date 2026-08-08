import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import projectConfig from "virtual:teacher-project-config";
import { ClassroomToolsProvider } from "../android-teacher-offline/ClassroomToolsContext.jsx";
import TeacherFixedStage from "../android-teacher-offline/TeacherFixedStage.jsx";
import TeacherOfflineSettingsDialog from "../android-teacher-offline/TeacherOfflineSettingsDialog.jsx";
import TeacherShellChrome from "../android-teacher-offline/TeacherShellChrome.jsx";
import { ACTIVE_TEACHER_THEME, useTeacherOfflineSettings } from "../android-teacher-offline/teacherOfflineSettings.js";
import { useTeacherViewportProfile } from "../android-teacher-offline/viewportProfiles.js";
import TeacherProjectPresentation from "./TeacherProjectPresentation.jsx";
import { useTeacherProjectSound } from "./teacherProjectSound.js";

function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => globalThis.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = globalThis.matchMedia?.(query);
    if (!media) return undefined;
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export default function TeacherProjectApp() {
  const viewport = useTeacherViewportProfile();
  const settings = useTeacherOfflineSettings();
  useTeacherProjectSound(projectConfig.soundMap);
  const prefersReducedMotion = usePrefersReducedMotion();
  const animationsActive = settings.graphics.motionEnabled && !prefersReducedMotion;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presentationView, setPresentationView] = useState("library");
  const presentationRef = useRef(null);
  const settingsOpenRef = useRef(settingsOpen);
  settingsOpenRef.current = settingsOpen;
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const menuSkin = useMemo(() => ({
    settingsIcon: projectConfig.chrome.settings.image,
    minimizeIcon: projectConfig.chrome.minimize.image,
    closeIcon: projectConfig.chrome.close.image,
  }), []);

  useEffect(() => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = `${16 * settings.graphics.interfaceScale / 100}px`;
    return () => { document.documentElement.style.fontSize = previous; };
  }, [settings.graphics.interfaceScale]);

  const minimize = useCallback(async () => {
    if (Capacitor.isNativePlatform()) await App.minimizeApp();
  }, []);
  const close = useCallback(async () => {
    if (Capacitor.isNativePlatform()) await App.exitApp();
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let handle;
    let disposed = false;
    App.addListener("backButton", async () => {
      if (settingsOpenRef.current) { setSettingsOpen(false); return; }
      if (!presentationRef.current?.back()) await App.exitApp();
    }).then((next) => { handle = next; if (disposed) next.remove(); });
    return () => { disposed = true; handle?.remove(); };
  }, []);
  const userInterfaceScale = settings.graphics.interfaceScale / 100;
  const effectiveUiScale = Math.min(1.1, Math.max(0.9, userInterfaceScale));
  return (
    <ClassroomToolsProvider>
      <TeacherFixedStage viewport={viewport} viewportBackdrop={{ name: presentationView, color: "#064968", image: `url("${projectConfig.background}")` }}>
        <div
          className={`teacher-offline-settings-surface ${settings.graphics.effectsEnabled ? "" : "teacher-effects-off"}`.trim()}
          data-teacher-theme={ACTIVE_TEACHER_THEME}
          data-teacher-motion={animationsActive ? "on" : "off"}
          data-teacher-project-runtime=""
          data-teacher-display-scale={String(Number(viewport.displayScale.toFixed(3)))}
          style={{
            "--teacher-colour-intensity": 0.7 + settings.graphics.colourIntensity * 0.003,
            "--teacher-display-scale": viewport.displayScale,
            "--teacher-user-ui-scale": userInterfaceScale,
            "--teacher-ui-scale": effectiveUiScale,
          }}
        >
          <TeacherProjectPresentation ref={presentationRef} config={projectConfig} animationsActive={animationsActive} onViewChange={setPresentationView} />
          <TeacherShellChrome
            menuSkin={menuSkin}
            soundControlIds={{
              settings: projectConfig.chrome.settings.controlId,
              minimize: projectConfig.chrome.minimize.controlId,
              close: projectConfig.chrome.close.controlId,
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onMinimize={minimize}
            onClose={close}
          />
          <TeacherOfflineSettingsDialog open={settingsOpen} onClose={closeSettings} />
        </div>
      </TeacherFixedStage>
    </ClassroomToolsProvider>
  );
}
