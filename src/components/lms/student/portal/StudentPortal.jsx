import { useCallback, useEffect, useState } from "react";
import { inferPackageSlugFromBookId } from "../../../../data/bookPackages.js";
import { findUltimateB2Exercise } from "../../../../data/ultimateB2DemoData.js";
import { getBookPackageTreeWithFallback, listBookPackages } from "../../../../services/bookContentApi.js";
import { getPortalDashboardMetrics } from "../../../../services/portalMetricsApi.js";
import {
  buildCourseComponentHash,
  buildCourseComponentsHash,
  buildCourseComponentSubviewHash,
  buildCourseExerciseHash,
  buildCourseHash,
  buildCoursePageHash,
  buildStudentSectionHash,
  getExerciseRouteSlug,
} from "../../../../utils/hashRoutes.js";
import { PortalShell } from "../../shared/PortalShell.jsx";
import { studentNavItems } from "./studentPortalConfig.js";
import { StudentActivitySection, StudentAssignments, StudentBooks, StudentDashboard, StudentGrades } from "./StudentPortalSections.jsx";

export function StudentPortal({
  initialSection = "dashboard",
  initialActivityKey = null,
  initialSelectedPackageSlug = null,
  initialSelectedBookId = null,
  initialSelectedBookSubview = null,
  initialSelectedPageUnitId = null,
  initialSelectedPageId = null,
  initialSelectedPageNumber = null,
  course,
  onSubmission,
  navigateTo,
  courseLoading = false,
  courseError = "",
  submitLesson,
  currentUser = null,
  brand,
  onSignOut,
}) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const [activeExercise, setActiveExercise] = useState(null);
  const [previousSection, setPreviousSection] = useState("books");
  const [selectedBookId, setSelectedBookId] = useState(initialSelectedBookId);
  const [selectedBookSubview, setSelectedBookSubview] = useState(initialSelectedBookSubview);
  const [selectedPageUnitId, setSelectedPageUnitId] = useState(initialSelectedPageUnitId);
  const [selectedPageId, setSelectedPageId] = useState(initialSelectedPageId);
  const [selectedPageNumber, setSelectedPageNumber] = useState(initialSelectedPageNumber);
  const [completedActivities, setCompletedActivities] = useState({});
  const [assignmentRefreshKey, setAssignmentRefreshKey] = useState(0);
  const [assignmentSubmitMessage, setAssignmentSubmitMessage] = useState("");
  const [bookPackages, setBookPackages] = useState([]);
  const [selectedPackageSlug, setSelectedPackageSlug] = useState(initialSelectedPackageSlug || "ultimate-b2");
  const [bookSourceMessage, setBookSourceMessage] = useState("");
  const [metricsState, setMetricsState] = useState({ loading: true, error: "", data: null });

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setSelectedBookId(initialSelectedBookId);
    setSelectedBookSubview(initialSelectedBookSubview);
    setSelectedPageUnitId(initialSelectedPageUnitId);
    setSelectedPageId(initialSelectedPageId);
    setSelectedPageNumber(initialSelectedPageNumber);
    setSelectedPackageSlug(initialSelectedPackageSlug || inferPackageSlugFromBookId(initialSelectedBookId));
    if (initialSelectedBookId || initialSelectedPackageSlug) setActiveSection("books");
  }, [initialSelectedBookId, initialSelectedBookSubview, initialSelectedPackageSlug, initialSelectedPageId, initialSelectedPageNumber, initialSelectedPageUnitId]);

  useEffect(() => {
    if (!initialActivityKey) return;
    const match = findUltimateB2Exercise(initialActivityKey);
    setActiveExercise(match?.exercise || { title: initialActivityKey, demoActivityKey: initialActivityKey });
    if (match?.component?.id) {
      setSelectedPackageSlug("ultimate-b2");
      setSelectedBookId(match.component.id);
      setSelectedBookSubview("exercises");
    }
    setPreviousSection("books");
    setActiveSection("activity");
  }, [initialActivityKey]);

  const reloadBookPackages = useCallback(async () => {
    const available = await listBookPackages();
    const trees = await Promise.all(available.map((item) => getBookPackageTreeWithFallback(item.id)));
    setBookPackages(trees);
    setBookSourceMessage(trees.length ? "Loaded from your activated book access." : "Activate a book code to unlock a package.");
    if (trees.length && !trees.some((item) => (item.slug || item.id) === selectedPackageSlug)) {
      setSelectedPackageSlug(trees[0].slug || trees[0].id);
    }
  }, [selectedPackageSlug]);

  useEffect(() => {
    let mounted = true;
    reloadBookPackages().catch((error) => {
      if (!mounted) return;
      setBookPackages([]);
      setBookSourceMessage(error.message || "Book packages could not be loaded.");
    });
    return () => { mounted = false; };
  }, [reloadBookPackages]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (!currentUser?.id) {
      setMetricsState({ loading: false, error: "Sign in required", data: null });
      return () => {
        active = false;
        controller.abort();
      };
    }
    setMetricsState({ loading: true, error: "", data: null });
    getPortalDashboardMetrics({ signal: controller.signal }).then((payload) => {
      if (!active) return;
      if (payload.role !== "student") throw new Error("Student dashboard metrics were unavailable");
      setMetricsState({ loading: false, error: "", data: payload });
    }).catch((error) => {
      if (!active || error.name === "AbortError") return;
      setMetricsState({ loading: false, error: error.message || "Dashboard metrics could not be loaded", data: null });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [activeSection, assignmentRefreshKey, currentUser?.id]);

  const goToSection = (section) => {
    if (section === "books") {
      setSelectedBookId(null);
      setSelectedBookSubview(null);
    }
    setActiveSection(section);
    if (navigateTo) {
      navigateTo(section === "books" ? buildCourseHash() : buildStudentSectionHash(section));
      return;
    }
  };

  const openActivity = (exercise, sourceSection = "books") => {
    setActiveExercise(exercise);
    setPreviousSection(sourceSection);
    if (sourceSection === "assignments" && exercise.assignmentId) {
      setActiveSection("activity");
      return;
    }
    if (navigateTo && (exercise.demoActivityKey || exercise.id)) {
      if (sourceSection === "books" && selectedPackageSlug && selectedBookId) {
        navigateTo(buildCourseExerciseHash(selectedPackageSlug, selectedBookId, getExerciseRouteSlug(exercise)));
        return;
      }
      navigateTo(`activity-${exercise.demoActivityKey || exercise.id}`);
      return;
    }
    goToSection("activity");
  };

  const selectBook = (bookId) => {
    setSelectedBookId(bookId);
    setSelectedBookSubview(bookId ? "exercises" : null);
    setSelectedPageUnitId(null);
    setSelectedPageId(null);
    setSelectedPageNumber(null);
    const nextPackageSlug = selectedPackageSlug || inferPackageSlugFromBookId(bookId);
    setSelectedPackageSlug(nextPackageSlug);
    if (navigateTo) {
      navigateTo(bookId ? buildCourseComponentHash(nextPackageSlug, bookId) : buildCourseComponentsHash(nextPackageSlug));
    }
  };

  const selectPackage = (packageSlug) => {
    setSelectedPackageSlug(packageSlug);
    setSelectedBookId(null);
    setSelectedBookSubview(null);
    setSelectedPageUnitId(null);
    setSelectedPageId(null);
    setSelectedPageNumber(null);
    if (navigateTo) navigateTo(buildCourseHash(packageSlug));
  };

  const selectBookPage = (bookId, pageUnitId, pageId, pageNumber = null) => {
    setSelectedBookId(bookId);
    setSelectedBookSubview("pages");
    setSelectedPageUnitId(pageUnitId);
    setSelectedPageId(pageId);
    setSelectedPageNumber(pageNumber);
    const nextPackageSlug = selectedPackageSlug || inferPackageSlugFromBookId(bookId);
    setSelectedPackageSlug(nextPackageSlug);
    if (navigateTo) navigateTo(buildCoursePageHash(nextPackageSlug, bookId, pageNumber || pageId));
  };

  const selectBookSubview = (bookId, subview) => {
    const nextSubview = subview || "exercises";
    setSelectedBookId(bookId);
    setSelectedBookSubview(nextSubview);
    setSelectedPageUnitId(null);
    setSelectedPageId(null);
    setSelectedPageNumber(null);
    const nextPackageSlug = selectedPackageSlug || inferPackageSlugFromBookId(bookId);
    setSelectedPackageSlug(nextPackageSlug);
    if (navigateTo) navigateTo(buildCourseComponentSubviewHash(nextPackageSlug, bookId, nextSubview));
  };

  return (
      <PortalShell
        title="Student portal"
        profile={currentUser?.full_name || "Student"}
        subtitle={metricsState.data?.profile?.primaryClassName || "Student workspace"}
        brand={brand}
        navItems={studentNavItems}
        activeItem={activeSection === "activity" ? previousSection : activeSection}
        onNavigate={goToSection}
        navigateTo={navigateTo}
        onSignOut={onSignOut}
        variant="student-portal-shell student-portal-workspace"
      >
        {activeSection === "dashboard" && <StudentDashboard goToSection={goToSection} currentUser={currentUser} metricsState={metricsState} />}
        {activeSection === "books" && (
          <StudentBooks
            openActivity={openActivity}
            completedActivities={completedActivities}
            bookPackages={bookPackages}
            selectedPackageSlug={selectedPackageSlug}
            selectedBookSubview={selectedBookSubview}
            onSelectPackage={selectPackage}
            bookSourceMessage={bookSourceMessage}
            selectedBookId={selectedBookId}
            selectedPageUnitId={selectedPageUnitId}
            selectedPageId={selectedPageId}
            selectedPageNumber={selectedPageNumber}
            onSelectBook={selectBook}
            onSelectBookPage={selectBookPage}
            onSelectBookSubview={selectBookSubview}
            onLicenseActivated={reloadBookPackages}
          />
        )}
        {activeSection === "assignments" && (
          <StudentAssignments
            openActivity={openActivity}
            currentUser={currentUser}
            refreshKey={assignmentRefreshKey}
            submitMessage={assignmentSubmitMessage}
          />
        )}
        {activeSection === "grades" && <StudentGrades currentUser={currentUser} refreshKey={assignmentRefreshKey} metricsState={metricsState} />}
        {activeSection === "activity" && (
          <StudentActivitySection
            activeExercise={activeExercise}
            setActiveExercise={setActiveExercise}
            completedActivities={completedActivities}
            setCompletedActivities={setCompletedActivities}
            previousSection={previousSection}
            selectedPackageSlug={selectedPackageSlug}
            selectedBookId={selectedBookId}
            goToSection={goToSection}
            navigateTo={navigateTo}
            currentUser={currentUser}
            onAssignmentSubmitted={() => {
              setAssignmentRefreshKey((current) => current + 1);
              setAssignmentSubmitMessage("Assignment submission saved.");
            }}
          />
        )}
      </PortalShell>
  );
}
