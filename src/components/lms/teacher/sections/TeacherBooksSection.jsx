import { BookOpen, CheckCircle2, ListChecks, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dedupeBookPackages, demoBookPackages, normalizeBookPackageKey } from "../../../../data/bookPackages.js";
import { findUltimateB2Exercise } from "../../../../data/ultimateB2DemoData.js";
import { getBookPackageTreeWithFallback } from "../../../../services/bookContentApi.js";
import {
  createAssignment,
  exportAssignmentResultsCsv,
  getAssignmentResults,
  listClassStudents,
  listTeacherAssignments,
  listTeacherStudents,
  reviewSubmission,
} from "../../../../services/assignmentsApi.js";
import { createTeacherClass } from "../../../../services/classApi.js";
import { buildActivityHash, buildBookHash, buildTeacherPresentationHash, buildTeacherSectionHash, slugifyRoute } from "../../../../utils/hashRoutes.js";
import { teacherBooksPresentation } from "../teacherBooksState.js";
import { UltimateB2ActivityRunner } from "../../activities/UltimateB2ActivityRunner.jsx";
import { BookPackageBrowser, BookSubpageNavigation, findBookComponentById } from "../../books/BookPackageBrowser.jsx";
import { Card, Progress, SectionTitle, Tag } from "../../Shared.jsx";
import { TeacherCourseEditor } from "../TeacherCourseEditor.jsx";
import { ClassInviteLink } from "../ClassInviteLink.jsx";
import { classBookOptions, classLevelOptions, teacherSections } from "../teacherPortalConfig.js";
import { dueDateLabel, dueDateTone } from "../teacherPortalUtils.js";

import { BookPackageSelector } from "../components/TeacherBookPackageSelector.jsx";

export function TeacherBooks({ bookPackages = demoBookPackages, selectedPackageSlug = "ultimate-b2", selectedBookSubview = null, onSelectPackage, bookSourceMessage, loadingBooks = false, bookLoadError = "", booksLoaded = false, selectedBookId = null, selectedPageUnitId = null, selectedPageId = null, selectedPageNumber = null, onSelectBook, onSelectBookPage, onSelectBookSubview, initialPreviewActivityKey = null, navigateTo, classOptions = [], classes = [], currentUser = null }) {
  const [previewExercise, setPreviewExercise] = useState(null);
  const visibleBookPackages = useMemo(() => dedupeBookPackages(bookPackages), [bookPackages]);
  const presentation = teacherBooksPresentation({ packages: visibleBookPackages, loading: loadingBooks, error: bookLoadError, loaded: booksLoaded });
  const selectedPackageKey = normalizeBookPackageKey({ slug: selectedPackageSlug, packageTitle: selectedPackageSlug });
  const bookPackage = visibleBookPackages.find((item) => normalizeBookPackageKey(item) === selectedPackageKey || item.slug === selectedPackageSlug || item.id === selectedPackageSlug) || visibleBookPackages[0] || null;

  useEffect(() => {
    if (!initialPreviewActivityKey) {
      setPreviewExercise(null);
      return;
    }

    const match = findUltimateB2Exercise(initialPreviewActivityKey);
    setPreviewExercise(match?.exercise || { title: initialPreviewActivityKey, demoActivityKey: initialPreviewActivityKey });
  }, [initialPreviewActivityKey]);

  const previewActivity = (exercise) => {
    if (navigateTo && exercise.demoActivityKey) {
      navigateTo(buildActivityHash(exercise.demoActivityKey, "teacher-preview"));
      return;
    }
    setPreviewExercise(exercise);
  };

  const presentActivity = (exercise) => {
    const activityKey = exercise.stableActivityId || exercise.activityKey || exercise.demoActivityKey || exercise.id;
    if (navigateTo && activityKey) navigateTo(buildTeacherPresentationHash(activityKey, bookPackage?.slug || "ultimate-b2", "students-book"));
  };

  const closePreview = () => {
    const match = findUltimateB2Exercise(previewExercise?.demoActivityKey || previewExercise?.id);
    if (navigateTo && match?.component?.id) {
      navigateTo(buildBookHash("teacher", match.component.id));
      return;
    }
    setPreviewExercise(null);
  };

  if (previewExercise) {
    return (
      <section className="teacher-section-stack">
        <UltimateB2ActivityRunner
          activityKey={previewExercise.demoActivityKey}
          exerciseId={previewExercise.id}
          activity={previewExercise.dbActivity || previewExercise}
          mode="teacher-preview"
          onBack={closePreview}
          navigateTo={navigateTo}
          onNextActivity={(activityKey) => {
            const next = findUltimateB2Exercise(activityKey);
            if (next?.exercise) setPreviewExercise(next.exercise);
          }}
        />
      </section>
    );
  }

  const selectedComponent = findBookComponentById(bookPackage, selectedBookId);

  if (presentation === "loading") {
    return (
      <section className="teacher-section-stack">
        <SectionTitle eyebrow="Books" title="Loading assigned book packages." text="Checking this teacher's package and class entitlements." />
        <Card><p>Loading book access...</p></Card>
      </section>
    );
  }

  if (presentation === "error") {
    return (
      <section className="teacher-section-stack">
        <SectionTitle eyebrow="Books" title="Book packages could not be loaded." text="The book content service returned an error." />
        {bookSourceMessage && <div className="inline-status warning">{bookSourceMessage}</div>}
        <Card><p>Book access could not be checked. Try again after the service is available.</p></Card>
      </section>
    );
  }

  if (presentation === "empty" || !bookPackage) {
    return (
      <section className="teacher-section-stack">
        <SectionTitle eyebrow="Books" title="No book packages are assigned to this teacher or their classes." text="Ask a school administrator to assign a package or link one to an active class." />
      </section>
    );
  }

  return (
    <section className="teacher-section-stack">
      {selectedComponent && (
        <BookSubpageNavigation
          component={selectedComponent}
          bookPackage={bookPackage}
          mode="teacher"
          onBack={() => onSelectBook?.(null)}
        />
      )}
      <SectionTitle
        eyebrow="Books"
        title={`Digital book access for the ${bookPackage.packageTitle} package.`}
        text={`Browse the packages available to this teacher account and assign exercises to permitted class groups.`}
      />
      {bookSourceMessage && <div className="inline-status">{bookSourceMessage}</div>}
      {!selectedComponent && (
        <BookPackageSelector
          bookPackages={bookPackages}
          selectedPackageSlug={selectedPackageSlug}
          onSelectPackage={onSelectPackage}
        />
      )}
      <BookPackageBrowser
        mode="teacher"
        bookPackage={bookPackage}
        classOptions={classOptions}
        classes={classes}
        currentUser={currentUser}
        selectedComponentId={selectedBookId}
        selectedSubview={selectedBookSubview}
        selectedPageUnitId={selectedPageUnitId}
        selectedPageId={selectedPageId}
        selectedPageNumber={selectedPageNumber}
        onSelectComponent={onSelectBook}
        onSelectBookPage={onSelectBookPage}
        onSelectSubview={onSelectBookSubview}
        onBackToBooks={() => onSelectBook?.(null)}
        onPreviewExercise={previewActivity}
        onPresentExercise={presentActivity}
      />
    </section>
  );
}
