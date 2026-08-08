import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Volume2, VolumeX } from "lucide-react";

import { ultimateB2StudentsBookPageUnits } from "../../data/ultimate-b2/ultimateB2PageUnits.js";
import { teacherContentPackProvider } from "./generatedPackProvider.js";
import { readTeacherOfflineLocation, writeTeacherOfflineLocation } from "./teacherOfflineStorage.js";
import TeacherOfflineBook from "./TeacherOfflineBook.jsx";
import TeacherOfflineLibrary from "./TeacherOfflineLibrary.jsx";
import TeacherOfflineMedia from "./TeacherOfflineMedia.jsx";
import TeacherViewportDiagnostics from "./TeacherViewportDiagnostics.jsx";
import { recordTeacherOfflineNavigation } from "./teacherOfflineDiagnostics.js";
import { useTeacherViewportProfile } from "./viewportProfiles.js";
import { useLegacyClassroomSound } from "./legacyClassroomSound.js";
import { ClassroomToolsProvider } from "./ClassroomToolsContext.jsx";
import TeacherOfflineSettingsDialog from "./TeacherOfflineSettingsDialog.jsx";
import TeacherStartupIntro from "./TeacherStartupIntro.jsx";
import TeacherFixedStage from "./TeacherFixedStage.jsx";
import { ACTIVE_TEACHER_THEME, useTeacherOfflineSettings } from "./teacherOfflineSettings.js";
import { resolveTeacherBookMenuSkin } from "./teacherBookMenuSkins.js";
import bookMenuSkinSelections from "../../config/bookMenuSkinSelections.json";
import { selectedBookMenuSkinId } from "../../config/bookMenuSkins.js";
import {
  isTeacherOfflinePageLocation,
  resolveTeacherOfflineActivityLocation,
} from "./teacherOfflineActivityLocation.js";

const defaultLocation = { unitNumber: 1, tab: "pages", pageId: "" };

const classroomBackdropGradients = Object.freeze({
  contents: "linear-gradient(rgba(21, 79, 120, 0.08), rgba(81, 35, 119, 0.12))",
  "unit-overview": "linear-gradient(180deg, rgba(2, 89, 132, 0.06), rgba(88, 35, 127, 0.1))",
  page: "linear-gradient(180deg, rgba(2, 89, 132, 0.08), rgba(88, 35, 127, 0.08))",
});

function resolveViewportBackdrop({ startupIntroPending, navigation, classroomBackground }) {
  if (startupIntroPending) return { name: "intro", color: "#fff", image: "none" };
  if (navigation.view === "library") {
    return {
      name: "library",
      color: "#064968",
      image: classroomBackground ? `url("${classroomBackground}")` : "none",
    };
  }
  if (navigation.view === "media") {
    return {
      name: "media",
      color: "#7abbd7",
      image: "linear-gradient(145deg, #e7f7ff, #b9deef 54%, #7abbd7)",
    };
  }

  const location = navigation.location || defaultLocation;
  const name = location.tab === "exercises" ? "contents" : location.pageId ? "page" : "unit-overview";
  const gradient = classroomBackdropGradients[name] || classroomBackdropGradients.contents;
  return {
    name,
    color: "#064968",
    image: classroomBackground ? `${gradient}, url("${classroomBackground}")` : gradient,
  };
}

function libraryState() {
  return { teacherOffline: true, view: "library" };
}

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

export default function TeacherOfflineApp() {
  const viewport = useTeacherViewportProfile();
  const classroomSound = useLegacyClassroomSound();
  const settings = useTeacherOfflineSettings();
  const prefersReducedMotion = usePrefersReducedMotion();
  const animationsActive = settings.graphics.motionEnabled && !prefersReducedMotion;
  const [startupIntroPending, setStartupIntroPending] = useState(animationsActive);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const [packState, setPackState] = useState({ status: "loading", pack: null, error: "" });
  const [navigation, setNavigation] = useState(libraryState);
  const navigationRef = useRef(navigation);
  const settingsOpenRef = useRef(settingsOpen);
  const startupIntroPendingRef = useRef(startupIntroPending);
  navigationRef.current = navigation;
  settingsOpenRef.current = settingsOpen;
  startupIntroPendingRef.current = startupIntroPending;

  useEffect(() => {
    if (!animationsActive) setStartupIntroPending(false);
  }, [animationsActive]);

  useEffect(() => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = `${16 * settings.graphics.interfaceScale / 100}px`;
    return () => { document.documentElement.style.fontSize = previous; };
  }, [settings.graphics.interfaceScale]);

  useEffect(() => {
    let active = true;
    teacherContentPackProvider.load()
      .then((pack) => {
        if (active) setPackState({ status: "ready", pack, error: "" });
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.error("Teacher content validation failed", error);
        if (active) setPackState({ status: "error", pack: null, error: "Reinstall the verified classroom application." });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    recordTeacherOfflineNavigation(navigation.view);
  }, [navigation.view]);

  useEffect(() => {
    window.history.replaceState(libraryState(), "", "#library");
    const onPopState = (event) => setNavigation(event.state?.teacherOffline ? event.state : libraryState());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const pageUnits = useMemo(() => ultimateB2StudentsBookPageUnits.filter((unit) => [1, 2].includes(Number(unit.number))), []);
  const navigate = (state, { replace = false } = {}) => {
    const next = { teacherOffline: true, ...state };
    setNavigation(next);
    const method = replace ? "replaceState" : "pushState";
    window.history[method](next, "", `#${next.view}`);
  };
  const openBook = (unitNumber = null) => {
    const storedLocation = readTeacherOfflineLocation() || defaultLocation;
    const location = unitNumber
      ? { ...storedLocation, unitNumber, tab: "pages", pageId: "" }
      : storedLocation;
    writeTeacherOfflineLocation(location);
    navigate({ view: "book", location });
  };
  const closeApplication = useCallback(async () => {
    if (Capacitor.isNativePlatform()) await App.exitApp();
  }, []);
  const updateBookLocation = (location, options) => {
    writeTeacherOfflineLocation(location);
    navigate({ view: "book", location }, { ...options, replace: true });
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let disposed = false;
    let backHandle;
    const register = async () => {
      backHandle = await App.addListener("backButton", async () => {
        if (startupIntroPendingRef.current) {
          return;
        }
        if (settingsOpenRef.current) {
          setSettingsOpen(false);
          return;
        }
        if (document.fullscreenElement) {
          await document.exitFullscreen().catch(() => {});
          return;
        }
        const current = navigationRef.current;
        if (current.view === "library") {
          await App.exitApp();
          return;
        }
        if (current.view === "book" && current.activityId) {
          window.history.back();
          return;
        }
        if (current.view === "book") {
          const next = libraryState();
          window.history.replaceState(next, "", "#library");
          setNavigation(next);
          return;
        }
        window.history.back();
      });
      if (disposed) await backHandle.remove();
    };
    register();
    return () => {
      disposed = true;
      backHandle?.remove();
    };
  }, []);

  if (packState.status === "loading") {
    return <main className="teacher-offline-status" role="status"><h1>Checking classroom content…</h1></main>;
  }
  if (packState.status === "error") {
    return (
      <main className="teacher-offline-status damaged" role="alert">
        <h1>Content pack unavailable or damaged</h1>
        <p>{packState.error || "Reinstall the verified classroom application."}</p>
      </main>
    );
  }

  const pack = packState.pack;
  const selectedMenuSkinId = selectedBookMenuSkinId(bookMenuSkinSelections, pack.manifest.packageId);
  const menuSkin = resolveTeacherBookMenuSkin(pack.manifest.packageId, selectedMenuSkinId);
  const openBookActivity = (activityId, originLocation = null) => {
    const resolved = resolveTeacherOfflineActivityLocation({
      activityId,
      activities: pack.activities.activities,
      pageUnits,
      originLocation,
    });
    if (!resolved) return;
    const pageState = { teacherOffline: true, view: "book", location: resolved.location };
    writeTeacherOfflineLocation(resolved.location);
    if (navigationRef.current.view !== "book"
      || !isTeacherOfflinePageLocation(navigationRef.current.location, resolved.location)) {
      window.history.pushState(pageState, "", "#book");
    }
    const activityState = { ...pageState, activityId };
    setNavigation(activityState);
    window.history.pushState(activityState, "", `#book/activity/${encodeURIComponent(activityId)}`);
  };
  let content;
  if (startupIntroPending) {
    content = <TeacherStartupIntro onFinish={() => setStartupIntroPending(false)} />;
  } else if (navigation.view === "media") {
    content = (
      <TeacherOfflineMedia
        media={navigation.media}
        onBack={() => window.history.back()}
      />
    );
  } else if (navigation.view === "book") {
    content = (
      <TeacherOfflineBook
        pack={pack}
        pageUnits={pageUnits}
        location={navigation.location || defaultLocation}
        activityId={navigation.activityId || ""}
        onLocationChange={updateBookLocation}
        onOpenActivity={openBookActivity}
        onCloseActivity={() => window.history.back()}
        onOpenMedia={(media) => navigate({ view: "media", media, location: navigation.location || defaultLocation })}
        onBackToLibrary={() => navigate(libraryState(), { replace: true })}
        viewportProfile={viewport.profile}
      />
    );
  } else {
    content = (
      <TeacherOfflineLibrary
        menuSkin={menuSkin}
        onOpenBook={openBook}
        onOpenSettings={() => setSettingsOpen(true)}
        onCloseApplication={closeApplication}
        animationsActive={animationsActive}
      />
    );
  }
  const userInterfaceScale = settings.graphics.interfaceScale / 100;
  const effectiveUiScale = Math.min(1.1, Math.max(0.9, userInterfaceScale));
  const viewportBackdrop = resolveViewportBackdrop({
    startupIntroPending,
    navigation,
    classroomBackground: menuSkin?.background,
  });
  return (
    <ClassroomToolsProvider>
      <TeacherFixedStage
        viewport={viewport}
        viewportBackdrop={viewportBackdrop}
      >
      <div
        className={`teacher-offline-settings-surface ${settings.graphics.effectsEnabled ? "" : "teacher-effects-off"}`.trim()}
        data-teacher-theme={ACTIVE_TEACHER_THEME}
        data-teacher-motion={animationsActive ? "on" : "off"}
        data-teacher-motion-preference={settings.graphics.motionEnabled ? "on" : "off"}
        data-teacher-reduced-motion={prefersReducedMotion ? "reduce" : "no-preference"}
        data-teacher-display-scale={String(Number(viewport.displayScale.toFixed(3)))}
        data-teacher-display-profile={viewport.profile}
        style={{
          "--teacher-colour-intensity": 0.7 + settings.graphics.colourIntensity * 0.003,
          "--teacher-display-scale": viewport.displayScale,
          "--teacher-user-ui-scale": userInterfaceScale,
          "--teacher-ui-scale": effectiveUiScale,
        }}
      >
        <div key={startupIntroPending ? "intro" : navigation.view} className="teacher-offline-view-transition" data-teacher-view={startupIntroPending ? "intro" : navigation.view} data-book-activity={navigation.activityId || undefined}>
          {content}
        </div>
        {!startupIntroPending && navigation.view === "media" && <button
          type="button"
          className="legacy-classroom-sound-toggle"
          aria-label={classroomSound.enabled ? "Mute classroom interface sounds" : "Enable classroom interface sounds"}
          aria-pressed={classroomSound.enabled}
          title={classroomSound.enabled ? "Mute interface sounds" : "Enable interface sounds"}
          onClick={() => classroomSound.setEnabled(!classroomSound.enabled)}
        >
          {classroomSound.enabled ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </button>}
        <TeacherOfflineSettingsDialog open={settingsOpen} onClose={closeSettings} />
        {import.meta.env.DEV ? <TeacherViewportDiagnostics /> : null}
      </div>
      </TeacherFixedStage>
    </ClassroomToolsProvider>
  );
}
