import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Volume2, VolumeX } from "lucide-react";

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
import TeacherShellChrome from "./TeacherShellChrome.jsx";
import TeacherViewerStartupStatus from "./TeacherViewerStartupStatus.jsx";
import { runInteractiveViewerStartup } from "./interactiveStartupAssets.js";
import { ACTIVE_TEACHER_THEME, useTeacherOfflineSettings } from "./teacherOfflineSettings.js";
import { resolveTeacherBookMenuSkin } from "./teacherBookMenuSkins.js";
import {
  createUltimateB2TeacherRuntimeUiAssets,
  TeacherRuntimeUiAssetsProvider,
} from "./legacyClassroomAssets.js";
import bookMenuSkinSelections from "../../config/bookMenuSkinSelections.json";
import { selectedBookMenuSkinId } from "../../config/bookMenuSkins.js";
import { VIEWER_EXIT_FULLSCREEN_MESSAGE } from "../../shared/viewerPresentationProtocol.js";
import {
  isTeacherOfflinePageLocation,
  resolveTeacherOfflineActivityLocation,
} from "./teacherOfflineActivityLocation.js";
import {
  isHostedViewerPreviewRequest,
  resolveHostedViewerComponentRequest,
  resolveHostedViewerPreviewIntent,
} from "./hostedViewerPreviewIntent.js";
import {
  getDefaultReviewComponent,
  resolveTeacherEditionComponent,
  reviewComponentRegistry,
} from "./reviewComponentRegistry.js";

const defaultLocation = { unitNumber: 1, tab: "pages", pageId: "" };
const initialPackState = Object.freeze({
  status: "loading",
  phase: "validating",
  progress: null,
  pack: null,
  uiManifest: null,
  error: null,
  message: "",
});

function startupErrorMessage(error, hosted) {
  if (error?.code === "LIVE_PREVIEW_UNAVAILABLE") {
    return "Live preview content could not be loaded. Check the connection and try again.";
  }
  if (error?.code === "VIEWER_ASSET_LOAD_FAILED" || error?.code === "VIEWER_ASSET_PLAN_INVALID") {
    return "A required page, interface or audio asset could not be prepared. Check the connection and try again.";
  }
  return hosted
    ? "The verified Viewer content could not be prepared. Try again."
    : "Reinstall the verified classroom application.";
}

const classroomBackdropGradients = Object.freeze({
  contents: "linear-gradient(rgba(21, 79, 120, 0.08), rgba(81, 35, 119, 0.12))",
  "unit-overview": "linear-gradient(180deg, rgba(2, 89, 132, 0.06), rgba(88, 35, 127, 0.1))",
  page: "linear-gradient(180deg, rgba(2, 89, 132, 0.08), rgba(88, 35, 127, 0.08))",
});

function resolveViewportBackdrop({ startupIntroPending, navigation, classroomBackground }) {
  if (startupIntroPending) return { name: "intro", color: "#fefefe", image: "none" };
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

function componentIdentity(runtime) {
  return { bookSlug: runtime.bookSlug, componentSlug: runtime.componentSlug };
}

function libraryState(runtime) {
  return { teacherOffline: true, ...componentIdentity(runtime), view: "library" };
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
  const defaultRuntime = useMemo(() => getDefaultReviewComponent(), []);
  const hosted = defaultRuntime.startupAssets.hosted;
  const componentRequest = useMemo(() => resolveHostedViewerComponentRequest({
    search: globalThis.location?.search || "",
    hosted,
    registry: reviewComponentRegistry,
  }), [hosted]);
  const [activeRuntime, setActiveRuntime] = useState(() => (
    componentRequest.kind === "installed" ? componentRequest.runtime
      : componentRequest.kind === "none" ? defaultRuntime
        : null
  ));
  const [packState, setPackState] = useState(initialPackState);
  const runtimeUiAssets = useMemo(
    () => createUltimateB2TeacherRuntimeUiAssets(packState.uiManifest),
    [packState.uiManifest],
  );
  const classroomSound = useLegacyClassroomSound(runtimeUiAssets);
  const settings = useTeacherOfflineSettings();
  const prefersReducedMotion = usePrefersReducedMotion();
  const animationsActive = settings.graphics.motionEnabled && !prefersReducedMotion;
  const pageUnits = activeRuntime?.pageUnits || [];
  const hostedPreviewRequested = isHostedViewerPreviewRequest(globalThis.location?.search || "", hosted);
  const [startupIntroPending, setStartupIntroPending] = useState(animationsActive && !hostedPreviewRequested);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [navigation, setNavigation] = useState(() => libraryState(activeRuntime || defaultRuntime));
  const [componentFeedback, setComponentFeedback] = useState("");
  const navigationRef = useRef(navigation);
  const settingsOpenRef = useRef(settingsOpen);
  const startupIntroPendingRef = useRef(startupIntroPending);
  navigationRef.current = navigation;
  settingsOpenRef.current = settingsOpen;
  startupIntroPendingRef.current = startupIntroPending;

  useEffect(() => {
    if (!animationsActive || hostedPreviewRequested) setStartupIntroPending(false);
  }, [animationsActive, hostedPreviewRequested]);

  useEffect(() => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = `${16 * settings.graphics.interfaceScale / 100}px`;
    return () => { document.documentElement.style.fontSize = previous; };
  }, [settings.graphics.interfaceScale]);

  useEffect(() => {
    if (!activeRuntime) {
      setPackState({ ...initialPackState, status: "unavailable" });
      return undefined;
    }
    const controller = new AbortController();
    setPackState(initialPackState);
    runInteractiveViewerStartup({
      loadContentPack: () => activeRuntime.contentPackProvider.load(),
      loadUiManifest: (options) => activeRuntime.uiManifestProvider?.load?.(options) || Promise.resolve(null),
      prepareHotspots: () => activeRuntime.hotspotProvider?.prepare?.() || Promise.resolve(),
      startupAssets: activeRuntime.startupAssets,
      signal: controller.signal,
      onState: (state) => setPackState({
        ...state,
        message: state.status === "error" ? startupErrorMessage(state.error, activeRuntime.startupAssets.hosted) : "",
      }),
    }).catch((error) => {
      if (import.meta.env.DEV && !controller.signal.aborted) console.error("Teacher content startup failed", error);
    });
    return () => {
      controller.abort();
    };
  }, [activeRuntime, startupAttempt]);

  useEffect(() => {
    recordTeacherOfflineNavigation(navigation.view);
  }, [navigation.view]);

  useEffect(() => {
    const initial = libraryState(activeRuntime || defaultRuntime);
    window.history.replaceState(initial, "", "#library");
    const onPopState = (event) => setNavigation(event.state?.teacherOffline ? event.state : initial);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [defaultRuntime]);

  const navigate = (state, { replace = false } = {}) => {
    const next = { teacherOffline: true, ...componentIdentity(activeRuntime), ...state };
    setNavigation(next);
    const method = replace ? "replaceState" : "pushState";
    window.history[method](next, "", `#${next.view}`);
  };
  const openBook = (unitNumber = null) => {
    const storedLocation = readTeacherOfflineLocation(activeRuntime) || defaultLocation;
    const location = unitNumber
      ? { ...storedLocation, unitNumber, tab: "pages", pageId: "" }
      : storedLocation;
    writeTeacherOfflineLocation(location, activeRuntime);
    navigate({ view: "book", location });
  };
  const closeApplication = useCallback(async () => {
    if (Capacitor.isNativePlatform()) await App.exitApp();
  }, []);
  const minimizeApplication = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      await App.minimizeApp();
      return;
    }
    if (hosted && globalThis.parent && globalThis.parent !== globalThis) {
      globalThis.parent.postMessage(VIEWER_EXIT_FULLSCREEN_MESSAGE, "*");
    }
  }, [hosted]);
  const updateBookLocation = (location, options) => {
    writeTeacherOfflineLocation(location, activeRuntime);
    navigate({ view: "book", location }, { ...options, replace: true });
  };
  const replaceBookNavigation = (location) => {
    const next = { teacherOffline: true, ...componentIdentity(activeRuntime), view: "book", location };
    writeTeacherOfflineLocation(location, activeRuntime);
    navigationRef.current = next;
    setNavigation(next);
    window.history.replaceState(next, "", "#book");
  };
  const returnToBookPage = () => {
    const location = navigationRef.current.location || defaultLocation;
    replaceBookNavigation({ ...location, tab: "pages" });
  };
  const returnToUnitOverview = () => {
    const location = navigationRef.current.location || defaultLocation;
    replaceBookNavigation({ ...location, tab: "pages", pageId: "" });
  };
  const returnToLibrary = () => {
    const next = libraryState(activeRuntime);
    navigationRef.current = next;
    setNavigation(next);
    window.history.replaceState(next, "", "#library");
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
          returnToBookPage();
          return;
        }
        if (current.view === "book") {
          if (current.location?.pageId || current.location?.tab === "exercises") returnToUnitOverview();
          else returnToLibrary();
          return;
        }
        if (current.view === "media") returnToBookPage();
      });
      if (disposed) await backHandle.remove();
    };
    register();
    return () => {
      disposed = true;
      backHandle?.remove();
    };
  }, []);

  const pack = packState.pack;
  const packReady = packState.status === "ready" && Boolean(pack);
  const hostedPreviewIntent = useMemo(() => resolveHostedViewerPreviewIntent({
    search: globalThis.location?.search || "",
    hosted,
    activities: pack?.activities?.activities || [],
    pageUnits,
    registry: reviewComponentRegistry,
  }), [hosted, pack, pageUnits]);

  useEffect(() => {
    if (!packReady || hostedPreviewIntent.kind !== "valid") return;
    const next = { teacherOffline: true, ...componentIdentity(activeRuntime), ...hostedPreviewIntent.navigation };
    navigationRef.current = next;
    setNavigation(next);
    const hash = next.activityId ? `#book/activity/${encodeURIComponent(next.activityId)}` : `#${next.view}`;
    window.history.replaceState(next, "", hash);
  }, [activeRuntime, hostedPreviewIntent, packReady]);

  const selectedMenuSkinId = packReady ? selectedBookMenuSkinId(bookMenuSkinSelections, pack.manifest.packageId) : "";
  const menuSkin = packReady ? resolveTeacherBookMenuSkin(pack.manifest.packageId, selectedMenuSkinId, runtimeUiAssets) : null;
  const openBookActivity = (activityId, originLocation = null) => {
    if (!packReady) return;
    const resolved = resolveTeacherOfflineActivityLocation({
      activityId,
      activities: pack.activities.activities,
      pageUnits,
      originLocation,
    });
    const nativeHotspotLocation = !resolved && originLocation?.pageId
      ? { unitNumber: Number(originLocation.unitNumber), tab: "pages", pageId: originLocation.pageId }
      : null;
    const activityLocation = resolved?.location || nativeHotspotLocation;
    if (!activityLocation) return;
    const pageState = { teacherOffline: true, ...componentIdentity(activeRuntime), view: "book", location: activityLocation };
    writeTeacherOfflineLocation(activityLocation, activeRuntime);
    if (navigationRef.current.view !== "book"
      || !isTeacherOfflinePageLocation(navigationRef.current.location, activityLocation)) {
      window.history.pushState(pageState, "", "#book");
    }
    const activityState = { ...pageState, activityId };
    setNavigation(activityState);
    window.history.pushState(activityState, "", `#book/activity/${encodeURIComponent(activityId)}`);
  };
  const switchTeacherEdition = (teacherEditionId) => {
    const resolution = resolveTeacherEditionComponent(activeRuntime.bookSlug, teacherEditionId);
    if (resolution.kind !== "installed") {
      const title = resolution.registration?.component?.title || "The requested component";
      setComponentFeedback(`${title} content is registered but not installed for Teacher Review.`);
      return false;
    }
    if (resolution.runtime.key === activeRuntime.key) {
      setComponentFeedback("");
      return true;
    }
    const nextRuntime = resolution.runtime;
    const location = readTeacherOfflineLocation(nextRuntime) || defaultLocation;
    const next = { teacherOffline: true, ...componentIdentity(nextRuntime), view: "book", location };
    setComponentFeedback("");
    setActiveRuntime(nextRuntime);
    navigationRef.current = next;
    setNavigation(next);
    window.history.replaceState(next, "", "#book");
    return true;
  };
  let content;
  if (startupIntroPending) {
    content = <TeacherStartupIntro onFinish={() => setStartupIntroPending(false)} />;
  } else if (componentRequest.kind === "invalid" || componentRequest.kind === "unavailable") {
    content = <main className="teacher-viewer-preview-invalid" role="alert"><h1>Preview unavailable</h1><p>{componentRequest.message}</p></main>;
  } else if (packState.status === "loading") {
    content = activeRuntime.startupAssets.hosted
      ? <TeacherViewerStartupStatus state={packState} hosted />
      : <div className="teacher-offline-pack-wait" aria-hidden="true" />;
  } else if (packState.status === "error") {
    content = <TeacherViewerStartupStatus state={packState} hosted={activeRuntime.startupAssets.hosted} onRetry={() => setStartupAttempt((attempt) => attempt + 1)} />;
  } else if (hostedPreviewIntent.kind === "invalid" || hostedPreviewIntent.kind === "unavailable") {
    content = <main className="teacher-viewer-preview-invalid" role="alert"><h1>Preview unavailable</h1><p>{hostedPreviewIntent.message}</p></main>;
  } else if (navigation.view === "media") {
    content = (
      <TeacherOfflineMedia
        media={navigation.media}
        onBack={returnToBookPage}
        onHome={returnToLibrary}
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
        onCloseActivity={returnToBookPage}
        onOpenMedia={(media) => navigate({ view: "media", media, location: navigation.location || defaultLocation })}
        onBackToLibrary={returnToLibrary}
        viewportProfile={viewport.profile}
        selectedBookId={activeRuntime.component.teacherEditionId}
        onBookSwitch={switchTeacherEdition}
        hotspotProvider={activeRuntime.hotspotProvider}
      />
    );
  } else {
    content = (
      <TeacherOfflineLibrary
        menuSkin={menuSkin}
        onOpenUnit={(editionId, unitNumber) => {
          if (switchTeacherEdition(editionId)) openBook(unitNumber);
        }}
        animationsActive={animationsActive}
      />
    );
  }
  const userInterfaceScale = settings.graphics.interfaceScale / 100;
  const effectiveUiScale = Math.min(1.1, Math.max(0.9, userInterfaceScale));
  const startupSurfacePending = startupIntroPending || packState.status === "loading";
  const activeView = startupIntroPending
    ? "intro"
    : packState.status === "loading" ? "pack-wait"
    : packState.status === "error" ? "pack-error"
      : hostedPreviewIntent.kind === "invalid" ? "preview-invalid"
        : navigation.view;
  const viewportBackdrop = resolveViewportBackdrop({
    startupIntroPending: startupSurfacePending,
    navigation,
    classroomBackground: menuSkin?.background,
  });
  return (
    <TeacherRuntimeUiAssetsProvider value={runtimeUiAssets}>
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
        <div key={activeView} className="teacher-offline-view-transition" data-teacher-view={activeView} data-book-activity={navigation.activityId || undefined}>
          {content}
        </div>
        {componentFeedback ? <p className="teacher-component-feedback" role="status">{componentFeedback}</p> : null}
        {!startupIntroPending && packReady && (
          <TeacherShellChrome
            menuSkin={menuSkin}
            onOpenSettings={() => setSettingsOpen(true)}
            onMinimize={minimizeApplication}
            onClose={closeApplication}
          />
        )}
        {!startupIntroPending && packReady && navigation.view === "media" && <button
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
        {import.meta.env.DEV && packReady && !startupIntroPending ? <TeacherViewportDiagnostics /> : null}
      </div>
      </TeacherFixedStage>
    </ClassroomToolsProvider>
    </TeacherRuntimeUiAssetsProvider>
  );
}
