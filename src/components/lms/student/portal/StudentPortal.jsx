import { useEffect, useState } from "react";
import { demoBookPackages, inferPackageSlugFromBookId, replaceDemoBookPackage } from "../../../../data/bookPackages.js";
import { findUltimateB2Exercise } from "../../../../data/ultimateB2DemoData.js";
import { getBookPackageTreeWithFallback } from "../../../../services/bookContentApi.js";
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
  const [bookPackages, setBookPackages] = useState(demoBookPackages);
  const [selectedPackageSlug, setSelectedPackageSlug] = useState(initialSelectedPackageSlug || "ultimate-b2");
  const [bookSourceMessage, setBookSourceMessage] = useState("");

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

  useEffect(() => {
    let mounted = true;
    getBookPackageTreeWithFallback("ultimate-b2").then((packageTree) => {
      if (!mounted) return;
      setBookPackages((current) => replaceDemoBookPackage(current, packageTree));
      setBookSourceMessage(packageTree.source === "database" ? "Loaded from book content database." : "Using mock Ultimate B2 fallback.");
    });
    return () => {
      mounted = false;
    };
  }, []);

  const goToSection = (section) => {
    if (section === "books") {
      setSelectedBookId(null);
      setSelectedBookSubview(null);
    }
    if (navigateTo) {
      navigateTo(section === "books" ? buildCourseHash() : buildStudentSectionHash(section));
      return;
    }
    setActiveSection(section);
  };

  const openActivity = (exercise, sourceSection = "books") => {
    setActiveExercise(exercise);
    setPreviousSection(sourceSection);
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
    <div className="workspace student-portal-workspace">
      <PortalShell
        title="Student portal"
        profile="Anna Georgiou (Student)"
        subtitle="Ultimate B2 A"
        navItems={studentNavItems}
        activeItem={activeSection === "activity" ? previousSection : activeSection}
        onNavigate={goToSection}
        variant="student-portal-shell"
      >
        {activeSection === "dashboard" && <StudentDashboard goToSection={goToSection} />}
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
          />
        )}
        {activeSection === "assignments" && <StudentAssignments openActivity={openActivity} />}
        {activeSection === "grades" && <StudentGrades />}
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
          />
        )}
      </PortalShell>
    </div>
  );
}
