import { useEffect, useState } from "react";
import { dedupeBookPackages, demoBookPackages, inferPackageSlugFromBookId, replaceDemoBookPackage } from "../../../data/bookPackages.js";
import { useTeacherClasses } from "../../../hooks/useTeacherClasses.js";
import { getBookPackageTreeWithFallback } from "../../../services/bookContentApi.js";
import { buildTeacherSectionHash } from "../../../utils/hashRoutes.js";
import { PortalShell } from "../shared/PortalShell.jsx";
import { teacherNavItems } from "./teacherPortalConfig.js";
import { TeacherAssignments, TeacherBooks, TeacherClasses, TeacherCustomAssignment, TeacherDashboard, TeacherStudents } from "./TeacherPortalSections.jsx";

export function TeacherPortal({ initialSection = "dashboard", initialSelectedBookId = null, initialSelectedPageUnitId = null, initialSelectedPageId = null, initialPreviewActivityKey = null, currentUser = null, ...editorProps }) {
  const { navigateTo } = editorProps;
  const [activeSection, setActiveSection] = useState(initialSection);
  const [selectedPackageSlug, setSelectedPackageSlug] = useState(editorProps.initialSelectedPackageSlug || "ultimate-b2");
  const [selectedBookId, setSelectedBookId] = useState(initialSelectedBookId);
  const [selectedBookSubview, setSelectedBookSubview] = useState(editorProps.initialSelectedBookSubview || null);
  const [selectedPageUnitId, setSelectedPageUnitId] = useState(initialSelectedPageUnitId);
  const [selectedPageId, setSelectedPageId] = useState(initialSelectedPageId);
  const [selectedPageNumber, setSelectedPageNumber] = useState(editorProps.initialSelectedPageNumber || null);
  const [bookPackages, setBookPackages] = useState(demoBookPackages);
  const [bookSourceMessage, setBookSourceMessage] = useState("");
  const {
    classes: teacherClasses,
    classOptions,
    loadingClasses,
    usingDemoClasses,
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
    getBookPackageTreeWithFallback("ultimate-b2").then((packageTree) => {
      if (!mounted) return;
      setBookPackages((current) => dedupeBookPackages(replaceDemoBookPackage(current, packageTree)));
      setBookSourceMessage(packageTree.source === "database" ? "Loaded from book content database." : "Using mock Ultimate B2 fallback.");
    });
    return () => {
      mounted = false;
    };
  }, []);

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
    <div className="workspace teacher-portal-workspace">
      <PortalShell
        title="Teacher portal"
        profile="Paris Georgoulakis (Teacher)"
        subtitle="Ultimate B2 workspace"
        navItems={teacherNavItems}
        activeItem={activeSection === "books" ? "books" : activeSection}
        onNavigate={goToSection}
        variant="teacher-portal-shell"
      >
        {activeSection === "dashboard" && <TeacherDashboard goToSection={goToSection} />}
        {activeSection === "books" && (
          <TeacherBooks
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
            initialPreviewActivityKey={initialPreviewActivityKey}
            navigateTo={navigateTo}
            classOptions={classOptions}
          />
        )}
        {activeSection === "classes" && (
          <TeacherClasses
            currentUser={currentUser}
            bookPackage={bookPackages.find((item) => (item.slug || item.id) === selectedPackageSlug) || bookPackages[0]}
            classes={teacherClasses}
            loadingClasses={loadingClasses}
            usingDemoClasses={usingDemoClasses}
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
            selectedAssignmentId={editorProps.initialSelectedAssignmentId}
            routeAction={editorProps.routeAction}
            navigateTo={navigateTo}
          />
        )}
        {activeSection === "custom-assignment" && <TeacherCustomAssignment {...editorProps} />}
      </PortalShell>
    </div>
  );
}
