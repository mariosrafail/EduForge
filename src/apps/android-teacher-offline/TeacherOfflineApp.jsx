import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

import { ultimateB2StudentsBookPageUnits } from "../../data/ultimate-b2/ultimateB2PageUnits.js";
import { teacherContentPackProvider } from "./generatedPackProvider.js";
import { readTeacherOfflineLocation, writeTeacherOfflineLocation } from "./teacherOfflineStorage.js";
import TeacherOfflineBook from "./TeacherOfflineBook.jsx";
import TeacherOfflineLibrary from "./TeacherOfflineLibrary.jsx";
import TeacherOfflineMedia from "./TeacherOfflineMedia.jsx";
import TeacherOfflinePresentation from "./TeacherOfflinePresentation.jsx";
import TeacherViewportDiagnostics from "./TeacherViewportDiagnostics.jsx";
import { recordTeacherOfflineNavigation } from "./teacherOfflineDiagnostics.js";
import { useTeacherViewportProfile } from "./viewportProfiles.js";

const defaultLocation = { unitNumber: 1, tab: "pages", pageId: "" };

function libraryState() {
  return { teacherOffline: true, view: "library" };
}

export default function TeacherOfflineApp() {
  const viewport = useTeacherViewportProfile();
  const [packState, setPackState] = useState({ status: "loading", pack: null, error: "" });
  const [navigation, setNavigation] = useState(libraryState);
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;

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
  const openBook = () => {
    const location = readTeacherOfflineLocation() || defaultLocation;
    navigate({ view: "book", location });
  };
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
        if (document.fullscreenElement) {
          await document.exitFullscreen().catch(() => {});
          return;
        }
        const current = navigationRef.current;
        if (current.view === "library") {
          await App.exitApp();
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
  let content;
  if (navigation.view === "activity") {
    content = (
      <TeacherOfflinePresentation
        key={navigation.activityId}
        activityId={navigation.activityId}
        activities={pack.activities.activities}
        onBack={() => window.history.back()}
        onNavigate={(activityId) => navigate({ ...navigation, activityId }, { replace: true })}
        viewportProfile={viewport.profile}
      />
    );
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
        onLocationChange={updateBookLocation}
        onOpenActivity={(activityId) => navigate({ view: "activity", activityId, location: navigation.location || defaultLocation })}
        onOpenMedia={(media) => navigate({ view: "media", media, location: navigation.location || defaultLocation })}
        onBackToLibrary={() => navigate(libraryState(), { replace: true })}
        viewportProfile={viewport.profile}
      />
    );
  } else {
    content = <TeacherOfflineLibrary pack={pack} onOpenBook={openBook} />;
  }
  return <>{content}{import.meta.env.DEV ? <TeacherViewportDiagnostics /> : null}</>;
}
