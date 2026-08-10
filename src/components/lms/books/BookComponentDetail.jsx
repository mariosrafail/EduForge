import { useEffect, useState } from "react";
import { Layers3 } from "lucide-react";
import { Card, Tag } from "../Shared.jsx";
import { BookCover } from "./BookCover.jsx";
import { ActiveExerciseRow } from "./BookExerciseRow.jsx";
import { TeacherBookUnitList } from "./BookExerciseList.jsx";
import { LockedExerciseRow, LockedUnitRow } from "./LockedRows.jsx";
import { BookPagesView } from "./BookPageViewer.jsx";
import { getActiveExercises, isExerciseActive } from "./bookBrowserUtils.js";
import { BookActivityRunner } from "virtual:book-authoring-tools";
import { listBookActivities } from "../../../services/bookActivitiesApi.js";
import { FEATURE_FLAGS } from "../../../config/featureFlags.js";
import { getComponentRouteSlug, getPackageRouteSlug } from "../../../utils/hashRoutes.js";

const enableBookActivityBuilder = FEATURE_FLAGS.ENABLE_BOOK_ACTIVITY_BUILDER;

function CustomBookActivitySection({ activities, loading, error, mode, onOpenActivity }) {
  if (loading) {
    return <p className="custom-book-activities-message">Loading custom activities...</p>;
  }

  if (error) {
    return <p className="custom-book-activities-message warning">{error}</p>;
  }

  if (!activities.length) return null;

  return (
    <section className="custom-book-activities-section">
      <div className="book-unit-heading">
        <div>
          <h3>Custom activities</h3>
          <small>Created from page hotspots</small>
        </div>
        <Tag tone="green">{activities.length} item{activities.length === 1 ? "" : "s"}</Tag>
      </div>
      <div className="book-exercise-list">
        {activities.map((activity) => (
          <article key={activity.id} className="book-exercise-row custom-book-activity-row">
            <div className="book-exercise-main">
              <strong>{activity.title}</strong>
              <p>{activity.instructions || "Custom book activity."}</p>
              <div className="book-exercise-meta">
                <span>{activity.type}</span>
                {activity.pageNumber && <span>Page {activity.pageNumber}</span>}
                <span>{activity.status}</span>
              </div>
            </div>
            <div className="book-exercise-status">
              <Tag tone={activity.status === "published" ? "green" : "slate"}>{activity.status}</Tag>
              <small>{activity.pageId ? "Linked to book page" : "Component activity"}</small>
            </div>
            <button className="secondary-action compact-action" type="button" onClick={() => onOpenActivity?.(activity)}>
              {mode === "teacher" ? "Preview" : "Start"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function BookComponentDetail({ component, bookPackage, mode, onStartExercise, onPreviewExercise, onPresentExercise, classOptions, classes, currentUser, completedActivities, selectedSubview, selectedPageUnitId, selectedPageId, selectedPageNumber, onSelectBookPage, onSelectSubview, highlightedActivityKey = null, disableHighlightedActivityLaunch = false }) {
  const activeCount = getActiveExercises(component).length;
  const recoveredStudentsBook = component.catalogKind === "recovered-students-book";
  const visibleUnitCount = component.units.filter((unit) => unit.lessons.some((lesson) => lesson.exercises.some(isExerciseActive))).length;
  const [viewMode, setViewMode] = useState((selectedSubview === "pages" || selectedSubview === "flipbook" || selectedPageId || selectedPageNumber) ? "pages" : "contents");
  const [customActivities, setCustomActivities] = useState([]);
  const [customActivitiesLoading, setCustomActivitiesLoading] = useState(false);
  const [customActivitiesError, setCustomActivitiesError] = useState("");
  const [openCustomActivity, setOpenCustomActivity] = useState(null);
  const canonicalBookId = getComponentRouteSlug(component);
  const packageSlug = getPackageRouteSlug(bookPackage);
  const componentSlug = getComponentRouteSlug(component);
  const showPagesMode = Boolean(component.pageUnits?.length);
  const hasSelectedPage = Boolean(selectedPageId || selectedPageNumber);
  const modeOptions = [
    { id: "contents", label: showPagesMode ? "Contents / Exercises" : "Contents" },
    ...(showPagesMode ? [{ id: "pages", label: "Book pages" }] : []),
  ];

  useEffect(() => {
    if (viewMode === "pages" && !showPagesMode) {
      setViewMode("contents");
    }
  }, [showPagesMode, viewMode]);

  useEffect(() => {
    if ((selectedPageId || selectedPageNumber) && showPagesMode) setViewMode("pages");
  }, [selectedPageId, selectedPageNumber, showPagesMode]);

  useEffect(() => {
    if (selectedSubview === "pages" || selectedSubview === "flipbook") {
      setViewMode("pages");
      return;
    }
    if (selectedSubview === "exercises") setViewMode("contents");
  }, [selectedSubview]);

  useEffect(() => {
    // TODO: Re-enable after DATABASE_URL + backend hotspot/activity system is finalized.
    if (!enableBookActivityBuilder) {
      setCustomActivities([]);
      setCustomActivitiesLoading(false);
      setCustomActivitiesError("");
      setOpenCustomActivity(null);
      return undefined;
    }
    if (viewMode !== "contents" || !packageSlug || !componentSlug) return undefined;
    let mounted = true;
    setCustomActivitiesLoading(true);
    setCustomActivitiesError("");
    listBookActivities({ packageSlug, componentSlug })
      .then((activities) => {
        if (mounted) setCustomActivities(activities);
      })
      .catch((error) => {
        if (mounted) setCustomActivitiesError(error.message || "Custom activities could not be loaded.");
      })
      .finally(() => {
        if (mounted) setCustomActivitiesLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [componentSlug, packageSlug, viewMode]);

  return (
    <Card className={`book-detail-view ${viewMode === "pages" ? "book-detail-pages-mode" : ""} ${hasSelectedPage ? "selected-page-detail" : ""}`}>
      {!hasSelectedPage && (
        <div className="book-detail-hero">
          <BookCover component={component} bookPackage={bookPackage} size="large" />
          <div>
            <span className="eyebrow"><Layers3 size={15} /> {component.type}</span>
            <h2>{component.title}</h2>
            <p>{component.subtitle}</p>
            <div className="book-detail-stats">
              <span>{recoveredStudentsBook ? visibleUnitCount : component.units.length} units visible</span>
              <span>{recoveredStudentsBook ? `${activeCount} activities available` : `${activeCount} demo item${activeCount === 1 ? "" : "s"} active`}</span>
              {recoveredStudentsBook
                ? mode === "teacher" && component.catalogStats?.disabledActivityCount > 0 && <span>{component.catalogStats.disabledActivityCount} unsupported editorial records disabled</span>
                : <span>Publisher content placeholders locked</span>}
            </div>
            <div className="book-detail-mode-toggle" aria-label="Book view mode">
              {modeOptions.map((option) => (
                <button
                  key={option.id}
                  className={viewMode === option.id ? "selected" : ""}
                  type="button"
                  onClick={() => {
                    setViewMode(option.id);
                    onSelectSubview?.(getComponentRouteSlug(component), option.id === "pages" ? "pages" : "exercises");
                  }}
                  data-sound-click="tab"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {viewMode === "pages" && showPagesMode ? (
        <BookPagesView
          component={component}
          bookPackage={bookPackage}
          mode={mode}
          selectedPageUnitId={selectedPageUnitId}
          selectedPageId={selectedPageId}
          selectedPageNumber={selectedPageNumber}
          onSelectPage={(pageUnitId, pageId, pageNumber) => onSelectBookPage?.(canonicalBookId, pageUnitId, pageId, pageNumber)}
          onClearSelectedPage={() => onSelectSubview?.(canonicalBookId, "pages")}
          highlightedActivityKey={highlightedActivityKey}
          disableHighlightedActivityLaunch={disableHighlightedActivityLaunch}
        />
      ) : mode === "teacher" ? (
        <>
          {!component.units.length ? (
            <p className="custom-book-activities-message">Content will be added when the publisher files are available.</p>
          ) : <TeacherBookUnitList
            component={component}
            onPreviewExercise={onPreviewExercise}
            onPresentExercise={recoveredStudentsBook ? onPresentExercise : undefined}
            classOptions={classOptions}
            classes={classes}
            currentUser={currentUser}
          />}
          {enableBookActivityBuilder && (
            <>
              <CustomBookActivitySection activities={customActivities} loading={customActivitiesLoading} error={customActivitiesError} mode={mode} onOpenActivity={setOpenCustomActivity} />
              {openCustomActivity && <BookActivityRunner activity={openCustomActivity} onClose={() => setOpenCustomActivity(null)} />}
            </>
          )}
        </>
      ) : (
        <>
          {!component.units.length ? (
            <p className="custom-book-activities-message">Content will be added when the publisher files are available.</p>
          ) : <div className="book-unit-list">
          {component.units.map((unit) => {
            const hasActiveExercises = unit.lessons.some((lesson) => lesson.exercises.some(isExerciseActive));

            if (!hasActiveExercises) {
              return <LockedUnitRow key={unit.id} unit={unit} />;
            }

            const UnitContainer = recoveredStudentsBook ? "details" : "section";
            const HeadingContainer = recoveredStudentsBook ? "summary" : "div";
            const unitActivityCount = unit.lessons.flatMap((lesson) => lesson.exercises).filter(isExerciseActive).length;

            return (
              <UnitContainer key={unit.id} className={`book-active-unit ${recoveredStudentsBook ? "recovered-book-unit" : ""}`} open={recoveredStudentsBook ? true : undefined}>
                <HeadingContainer className="book-unit-heading">
                  <div>
                    <h3>{unit.title}</h3>
                    <small>{unit.printedPageRange ? `Pages ${unit.printedPageRange}` : unit.unit}</small>
                  </div>
                  <Tag tone="green">{recoveredStudentsBook ? `${unitActivityCount} activities` : "Demo active"}</Tag>
                </HeadingContainer>

                {unit.lessons.map((lesson) => (
                  <div key={lesson.id} className="book-lesson-block">
                    <div className="book-lesson-heading">
                      <strong>{lesson.title}</strong>
                      <small>{lesson.pageLabel || unit.unit}</small>
                    </div>
                    <div className="book-exercise-list">
                      {lesson.exercises.map((exercise) => (
                        isExerciseActive(exercise) ? (
                          <ActiveExerciseRow
                            key={exercise.id}
                            exercise={exercise}
                            mode={mode}
                            onStartExercise={onStartExercise}
                            onPreviewExercise={onPreviewExercise}
                            onPresentExercise={recoveredStudentsBook ? onPresentExercise : undefined}
                            classOptions={classOptions}
                            classes={classes}
                            currentUser={currentUser}
                            completedActivities={completedActivities}
                          />
                        ) : (
                          <LockedExerciseRow key={exercise.id} exercise={exercise} />
                        )
                      ))}
                    </div>
                  </div>
                ))}
              </UnitContainer>
            );
          })}
          </div>}
          {enableBookActivityBuilder && (
            <>
              <CustomBookActivitySection activities={customActivities} loading={customActivitiesLoading} error={customActivitiesError} mode={mode} onOpenActivity={setOpenCustomActivity} />
              {openCustomActivity && <BookActivityRunner activity={openCustomActivity} onClose={() => setOpenCustomActivity(null)} />}
            </>
          )}
        </>
      )}
    </Card>
  );
}
