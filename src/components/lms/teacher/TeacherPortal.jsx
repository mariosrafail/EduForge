import { useEffect, useReducer, useState } from "react";
import { dedupeBookPackages, inferPackageSlugFromBookId } from "../../../data/bookPackages.js";
import { useTeacherClasses } from "../../../hooks/useTeacherClasses.js";
import { listAuthorizedBookPackageTrees } from "../../../services/bookContentApi.js";
import { getPortalDashboardMetrics } from "../../../services/portalMetricsApi.js";
import { buildTeacherSectionHash } from "../../../utils/hashRoutes.js";
import { PortalShell } from "../shared/PortalShell.jsx";
import { teacherNavItems } from "./teacherPortalConfig.js";
import { TeacherAssignments, TeacherBooks, TeacherClasses, TeacherCustomAssignment, TeacherDashboard, TeacherStudents } from "./TeacherPortalSections.jsx";
import { initialTeacherBooksState, teacherBooksReducer } from "./teacherBooksState.js";

export function TeacherPortal({ initialSection = "dashboard", initialSelectedBookId = null, initialSelectedPageUnitId = null, initialSelectedPageId = null, initialPreviewActivityKey = null, currentUser = null, brand, onSignOut, ...editorProps }) {
  const { navigateTo } = editorProps;
  const [activeSection, setActiveSection] = useState(initialSection);
  const [selectedPackageSlug, setSelectedPackageSlug] = useState(editorProps.initialSelectedPackageSlug || "ultimate-b2");
  const [selectedBookId, setSelectedBookId] = useState(initialSelectedBookId);
  const [selectedBookSubview, setSelectedBookSubview] = useState(editorProps.initialSelectedBookSubview || null);
  const [selectedPageUnitId, setSelectedPageUnitId] = useState(initialSelectedPageUnitId);
  const [selectedPageId, setSelectedPageId] = useState(initialSelectedPageId);
  const [selectedPageNumber, setSelectedPageNumber] = useState(editorProps.initialSelectedPageNumber || null);
  const [teacherBooksState, dispatchTeacherBooks] = useReducer(teacherBooksReducer, initialTeacherBooksState);
  const [metricsState, setMetricsState] = useState({ loading: true, error: "", data: null });
  const currentTeacherId = currentUser?.id || null;
  const bookStateIsCurrent = teacherBooksState.ownerId === currentTeacherId;
  const bookPackages = bookStateIsCurrent ? teacherBooksState.packages : [];
  const {
    classes: teacherClasses,
    classOptions,
    loadingClasses,
    classLoadError,
    addCreatedClass,
  } = useTeacherClasses(currentUser);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setSelectedBookId(initialSelectedBookId);
    setSelectedBookSubview(editorProps.initialSelectedBookSubview || null);
    setSelectedPageUnitId(initialSelectedPageUnitId);
    setSelectedPageId(initialSelectedPageId);
    setSelectedPageNumber(editorProps.initialSelectedPageNumber || null);
    setSelectedPackageSlug(editorProps.initialSelectedPackageSlug || inferPackageSlugFromBookId(initialSelectedBookId));
    if (initialSelectedBookId || initialPreviewActivityKey || editorProps.initialSelectedPackageSlug) setActiveSection("books");
  }, [editorProps.initialSelectedBookSubview, editorProps.initialSelectedPackageSlug, editorProps.initialSelectedPageNumber, initialPreviewActivityKey, initialSelectedBookId, initialSelectedPageId, initialSelectedPageUnitId]);

  useEffect(() => {
    let mounted = true;
    const ownerId = currentUser?.id || null;
    dispatchTeacherBooks({ type: "loading", reset: true, ownerId });
    listAuthorizedBookPackageTrees().then((packageTrees) => {
      if (!mounted) return;
      dispatchTeacherBooks({ type: "loaded", ownerId, packages: dedupeBookPackages(packageTrees) });
    }).catch((error) => {
      if (!mounted) return;
      dispatchTeacherBooks({ type: "failed", error: error.message });
    });
    return () => {
      mounted = false;
    };
  }, [currentUser?.id]);

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
      if (payload.role !== "teacher") throw new Error("Teacher dashboard metrics were unavailable");
      setMetricsState({ loading: false, error: "", data: payload });
    }).catch((error) => {
      if (!active || error.name === "AbortError") return;
      setMetricsState({ loading: false, error: error.message || "Dashboard metrics could not be loaded", data: null });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [activeSection, currentUser?.id]);

  const goToSection = (section) => {
    if (navigateTo) {
      navigateTo(buildTeacherSectionHash(section));
      return;
    }
    setActiveSection(section);
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
      navigateTo(bookId ? `/teacher/books/${nextPackageSlug}/components/${bookId}` : buildTeacherSectionHash("books"));
    }
  };

  const selectPackage = (packageSlug) => {
    setSelectedPackageSlug(packageSlug);
    setSelectedBookId(null);
    setSelectedBookSubview(null);
    setSelectedPageUnitId(null);
    setSelectedPageId(null);
    setSelectedPageNumber(null);
    if (navigateTo) navigateTo(`/teacher/books/${packageSlug}`);
  };

  const selectBookPage = (bookId, pageUnitId, pageId, pageNumber = null) => {
    setSelectedBookId(bookId);
    setSelectedBookSubview("pages");
    setSelectedPageUnitId(pageUnitId);
    setSelectedPageId(pageId);
    setSelectedPageNumber(pageNumber);
    setSelectedPackageSlug(selectedPackageSlug || inferPackageSlugFromBookId(bookId));
    if (navigateTo) navigateTo(`/teacher/books/${selectedPackageSlug || inferPackageSlugFromBookId(bookId)}/components/${bookId}/pages/${pageNumber || pageId}`);
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
    if (navigateTo) navigateTo(`/teacher/books/${nextPackageSlug}/components/${bookId}/${nextSubview}`);
  };

  return (
      <PortalShell
        title="Teacher portal"
        profile={currentUser?.full_name || "Teacher"}
        subtitle="Teaching workspace"
        brand={brand}
        navItems={teacherNavItems}
        activeItem={activeSection === "books" ? "books" : activeSection}
        onNavigate={goToSection}
        navigateTo={navigateTo}
        onSignOut={onSignOut}
        variant="teacher-portal-shell teacher-portal-workspace"
      >
        {activeSection === "dashboard" && <TeacherDashboard goToSection={goToSection} metricsState={metricsState} />}
        {activeSection === "books" && (
          <TeacherBooks
            bookPackages={bookPackages}
            selectedPackageSlug={selectedPackageSlug}
            selectedBookSubview={selectedBookSubview}
            onSelectPackage={selectPackage}
            bookSourceMessage={bookStateIsCurrent ? teacherBooksState.error || (teacherBooksState.loaded ? "Loaded from book content database." : "") : ""}
            loadingBooks={!bookStateIsCurrent || teacherBooksState.loading}
            bookLoadError={bookStateIsCurrent ? teacherBooksState.error : ""}
            booksLoaded={bookStateIsCurrent && teacherBooksState.loaded}
            selectedBookId={selectedBookId}
            selectedPageUnitId={selectedPageUnitId}
            selectedPageId={selectedPageId}
            selectedPageNumber={selectedPageNumber}
            onSelectBook={selectBook}
            onSelectBookPage={selectBookPage}
            onSelectBookSubview={selectBookSubview}
            initialPreviewActivityKey={initialPreviewActivityKey}
            navigateTo={navigateTo}
            classOptions={classOptions}
            classes={teacherClasses}
            currentUser={currentUser}
          />
        )}
        {activeSection === "classes" && (
          <TeacherClasses
            currentUser={currentUser}
            bookPackage={bookPackages.find((item) => (item.slug || item.id) === selectedPackageSlug) || bookPackages[0]}
            classes={teacherClasses}
            loadingClasses={loadingClasses}
            classLoadError={classLoadError}
            selectedClassSlug={editorProps.initialSelectedClassSlug}
            routeAction={editorProps.routeAction}
            navigateTo={navigateTo}
            onClassCreated={addCreatedClass}
          />
        )}
        {activeSection === "students" && <TeacherStudents currentUser={currentUser} classes={teacherClasses} classOptions={classOptions} />}
        {activeSection === "assignments" && (
          <TeacherAssignments
            currentUser={currentUser}
            classes={teacherClasses}
            classOptions={classOptions}
            bookPackages={bookPackages}
            loadingBooks={!bookStateIsCurrent || teacherBooksState.loading}
            booksLoaded={bookStateIsCurrent && teacherBooksState.loaded}
            bookLoadError={bookStateIsCurrent ? teacherBooksState.error : ""}
            selectedAssignmentId={editorProps.initialSelectedAssignmentId}
            routeAction={editorProps.routeAction}
            navigateTo={navigateTo}
          />
        )}
        {activeSection === "custom-assignment" && <TeacherCustomAssignment {...editorProps} />}
      </PortalShell>
  );
}
