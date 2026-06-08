import { useEffect, useState } from "react";
import { ArrowLeft, Home } from "lucide-react";
import { BookPackageBrowser } from "../../components/lms/books/BookPackageBrowser.jsx";
import { UltimateB2ActivityRunner } from "../../components/lms/activities/ultimate-b2/UltimateB2ActivityRunner.jsx";
import { getComponentRouteSlug } from "../../utils/hashRoutes.js";
import { buildAndroidPageKey } from "./androidBooks.js";
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
  onBackToLibrary,
  onLocationChange,
  onOpenActivity,
}) {
  const [progress, setProgress] = useState(() => getAndroidOfflineProgress());
  const [location, setLocation] = useState(() => initialLocation || getInitialLocation());
  const [activeActivityKey, setActiveActivityKey] = useState(initialActivityKey);

  const component = location.componentId ? book.components?.find((item) => item.id === location.componentId) || null : null;
  const unit = component?.pageUnits?.find((item) => item.id === location.unitId) || component?.pageUnits?.[0] || null;
  const page = unit?.pages?.find((item) => item.id === location.pageId) || unit?.pages?.[0] || null;
  const hasSelectedPage = Boolean(location.pageId || location.pageNumber);

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
  }, [initialActivityKey, initialLocation]);

  const updateLocation = (nextLocation) => {
    const resolvedLocation = {
      ...location,
      ...nextLocation,
    };
    setLocation(resolvedLocation);
    setActiveActivityKey(null);
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

      <div className="android-existing-viewer-shell">
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
            onOpenActivity?.(exercise.demoActivityKey, location);
          }}
        />
      </div>

      {activeActivityKey && (
        <div className="android-activity-overlay">
          <div className="android-activity-frame">
            <button className="android-activity-back" type="button" onClick={() => {
              setActiveActivityKey(null);
              onLocationChange?.(location);
            }}>
              <ArrowLeft size={20} /> Back to book
            </button>
            <UltimateB2ActivityRunner
              activityKey={activeActivityKey}
              mode="student"
              onBack={() => {
                setActiveActivityKey(null);
                onLocationChange?.(location);
              }}
              onSubmit={(result) => {
                setProgress(markAndroidOfflinePageComplete(`activity:${book.slug}:${activeActivityKey}`, {
                  ...result,
                  activityKey: activeActivityKey,
                }));
              }}
              hideBreadcrumb
            />
          </div>
        </div>
      )}
    </section>
  );
}
