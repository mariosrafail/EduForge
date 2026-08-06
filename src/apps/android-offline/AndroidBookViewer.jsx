import { useEffect, useState } from "react";
import { ArrowLeft, Home } from "lucide-react";
import { BookPackageBrowser } from "../../components/lms/books/BookPackageBrowser.jsx";
import { UltimateB2ActivityRunner } from "../../components/lms/activities/ultimate-b2/UltimateB2ActivityRunner.jsx";
import { getComponentRouteSlug } from "../../utils/hashRoutes.js";
import { buildAndroidPageKey } from "./androidBooks.js";
import ultimateB2StudentsBookMenuBackground from "../../assets/books/ultimate-b2/legacy-source/assets/books/book1/unit/2/parts/HD/parts_BG.png";
import {
  getAndroidOfflineProgress,
  markAndroidOfflinePageComplete,
  setLastOpenedBookLocation,
} from "./androidOfflineStorage.js";

function getInitialLocation() {
  return {
    componentId: "",
    unitId: "",
    pageId: "",
    subview: null,
  };
}

export default function AndroidBookViewer({
  book,
  initialLocation = null,
  initialActivityKey = null,
  initialExercise = null,
  onBackToLibrary,
  onLocationChange,
  onOpenActivity,
}) {
  const [progress, setProgress] = useState(() => getAndroidOfflineProgress());
  const [location, setLocation] = useState(() => initialLocation || getInitialLocation());
  const [activeActivityKey, setActiveActivityKey] = useState(initialActivityKey);
  const [activeExercise, setActiveExercise] = useState(initialExercise);

  const component = location.componentId ? book.components?.find((item) => item.id === location.componentId) || null : null;
  const unit = component?.pageUnits?.find((item) => item.id === location.unitId) || component?.pageUnits?.[0] || null;
  const page = unit?.pages?.find((item) => item.id === location.pageId) || unit?.pages?.[0] || null;
  const hasSelectedPage = Boolean(location.pageId || location.pageNumber);
  const isUltimateB2StudentsBook = Boolean(
    component
    && [book.slug, book.id].some((value) => String(value || "").toLowerCase() === "ultimate-b2")
    && `${component.type || ""} ${component.title || ""}`.toLowerCase().includes("students book"),
  );
  const viewerShellStyle = isUltimateB2StudentsBook
    ? {
        "--ultimate-b2-students-book-menu-bg": `url(${ultimateB2StudentsBookMenuBackground})`,
      }
    : undefined;
  const closeActivity = () => {
    setActiveActivityKey(null);
    setActiveExercise(null);
    onLocationChange?.(location);
  };
  const activityFrame = activeActivityKey ? (
    <div className="android-activity-frame">
      <button className="android-activity-back" type="button" onClick={closeActivity}>
        <ArrowLeft size={20} /> Back to book
      </button>
      <UltimateB2ActivityRunner
        activityKey={activeActivityKey}
        mode="student"
        onBack={closeActivity}
        onSubmit={(result) => {
          setProgress(markAndroidOfflinePageComplete(`activity:${book.slug}:${activeActivityKey}`, {
            ...result,
            activityKey: activeActivityKey,
          }));
        }}
        activity={activeExercise}
        hideBreadcrumb
      />
    </div>
  ) : null;

  useEffect(() => {
    if (!component || !unit || !page || !hasSelectedPage) return;
    setLastOpenedBookLocation(book.slug, {
      componentId: component.id,
      unitId: unit.id,
      pageId: page.id,
    });
  }, [book.slug, component, hasSelectedPage, page, unit]);

  useEffect(() => {
    if (initialLocation) setLocation(initialLocation);
    setActiveActivityKey(initialActivityKey || null);
    setActiveExercise(initialExercise || null);
  }, [initialActivityKey, initialExercise, initialLocation]);

  const updateLocation = (nextLocation) => {
    const resolvedLocation = {
      ...location,
      ...nextLocation,
    };
    setLocation(resolvedLocation);
    setActiveActivityKey(null);
    setActiveExercise(null);
    onLocationChange?.(resolvedLocation);
  };

  const selectComponent = (componentIdOrSlug) => {
    const nextComponent = book.components.find((item) => (
      item.id === componentIdOrSlug ||
      item.slug === componentIdOrSlug ||
      item.routeSlug === componentIdOrSlug ||
      getComponentRouteSlug(item) === componentIdOrSlug
    ));
    updateLocation({
      componentId: nextComponent?.id || componentIdOrSlug || "",
      subview: componentIdOrSlug ? "pages" : null,
      unitId: "",
      pageId: "",
    });
  };

  return (
    <section className="android-book-viewer">
      <header className="android-viewer-header">
        <button type="button" onClick={onBackToLibrary} aria-label="Back to book library">
          <ArrowLeft size={22} /> Library
        </button>
        <div>
          <span className="android-eyebrow">{book.level || "Offline book"}</span>
          <h1>{book.packageTitle}</h1>
        </div>
        {component && (
          <button type="button" onClick={() => selectComponent(null)} aria-label="Back to book home">
            <Home size={20} /> Book home
          </button>
        )}
      </header>

      <div
        className={`android-existing-viewer-shell${isUltimateB2StudentsBook ? " ultimate-b2-students-book-shell" : ""}`}
        style={viewerShellStyle}
      >
        <BookPackageBrowser
          bookPackage={book}
          mode="student"
          selectedComponentId={component ? getComponentRouteSlug(component) : null}
          selectedSubview={location.subview || "pages"}
          selectedPageUnitId={hasSelectedPage ? location.unitId || null : null}
          selectedPageId={hasSelectedPage ? location.pageId || null : null}
          selectedPageNumber={hasSelectedPage ? page?.pageNumber || null : null}
          completedActivities={progress.results || {}}
          classOptions={[]}
          onSelectComponent={selectComponent}
          onSelectSubview={(componentSlug, subview) => {
            const nextComponent = book.components.find((item) => getComponentRouteSlug(item) === componentSlug) || component;
            updateLocation({
              componentId: nextComponent?.id || "",
              subview,
              unitId: "",
              pageId: "",
            });
          }}
          onSelectBookPage={(componentSlug, unitId, pageId) => {
            const nextComponent = book.components.find((item) => getComponentRouteSlug(item) === componentSlug) || component;
            const nextPageKey = buildAndroidPageKey({
              bookSlug: book.slug,
              componentId: nextComponent?.id,
              unitId,
              pageId,
            });
            updateLocation({
              componentId: nextComponent?.id || "",
              subview: "pages",
              unitId,
              pageId,
            });
            setProgress(markAndroidOfflinePageComplete(nextPageKey, {
              score: null,
              maxScore: null,
              note: "Opened in Android offline mode.",
            }));
          }}
          onStartExercise={(exercise) => {
            if (!exercise?.demoActivityKey) return;
            setActiveActivityKey(exercise.demoActivityKey);
            setActiveExercise(exercise);
            onOpenActivity?.(exercise.demoActivityKey, location, exercise);
          }}
        />
        {activeActivityKey && isUltimateB2StudentsBook && activityFrame}
      </div>

      {activeActivityKey && !isUltimateB2StudentsBook && (
        <div className="android-activity-overlay">
          {activityFrame}
        </div>
      )}
    </section>
  );
}
