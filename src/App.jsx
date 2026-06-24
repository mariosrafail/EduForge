import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { AdminView } from "./components/lms/AdminView.jsx";
import { AuthView } from "./components/lms/AuthView.jsx";
import { FullDemoFlow } from "./components/lms/FullDemoFlow.jsx";
import { JoinClassView } from "./components/lms/JoinClassView.jsx";
import { RoleSelection } from "./components/lms/RoleSelection.jsx";
import { Header, PageTransition } from "./components/lms/Shared.jsx";
import { AppIntro } from "./components/lms/shared/AppIntro.jsx";
import { StudentCourseView } from "./components/lms/student/StudentCourseView.jsx";
import { StudentPortal } from "./components/lms/student/StudentPortal.jsx";
import { TeacherPortal } from "./components/lms/teacher/TeacherPortal.jsx";
import houseLogoMark from "./assets/branding/hamilton-house-logo-houseonly.png";
import { brandPresets } from "./data/lmsDemoData.js";
import { useAuth } from "./hooks/useAuth.js";
import { useCourseData } from "./hooks/useCourseData.js";
import { useHashView } from "./hooks/useHashView.js";

const teacherSectionByView = {
  teacher: "dashboard",
  "teacher-books": "books",
  "teacher-classes": "classes",
  "teacher-students": "students",
  "teacher-assignments": "assignments",
  "teacher-custom-assignment": "custom-assignment",
  "teacher-course-editor": "custom-assignment",
};

const studentSectionByView = {
  courses: "books",
  student: "dashboard",
  "student-books": "books",
  "student-assignments": "assignments",
  "student-grades": "grades",
  "student-activity": "activity",
};

const adminSectionByView = {
  admin: "overview",
  "admin-school-setup": "school-setup",
  "admin-users": "users",
  "admin-books-classes": "books-classes",
  "admin-publisher-intelligence": "publisher-intelligence",
  "admin-integrations": "integrations",
};

function transitionGroupForView(view, activityKey = null) {
  if (activityKey) return "student";
  if (view === "courses") return "student";
  if (view === "invalid-route") return "invalid-route";
  if (adminSectionByView[view]) return "admin";
  if (teacherSectionByView[view]) return "teacher";
  if (studentSectionByView[view]) return "student";
  return view;
}

function InvalidRouteView({ attemptedHash, navigateTo }) {
  return (
    <main className="route-fallback-screen">
      <section className="route-fallback-card">
        <AlertTriangle size={30} />
        <span className="eyebrow">Invalid route</span>
        <h1>This page link is not available.</h1>
        <p>{attemptedHash ? `No screen matches #${attemptedHash}.` : "No screen matches this URL."}</p>
        <button className="primary-action" type="button" onClick={() => navigateTo("/courses")} data-sound-click="back">
          <ArrowLeft size={17} /> Back to course list
        </button>
      </section>
    </main>
  );
}

export default function App() {
  const {
    view,
    navigateTo,
    activityKey,
    selectedBookId,
    selectedPackageSlug,
    selectedBookSubview,
    selectedPageUnitId,
    selectedPageId,
    selectedPageNumber,
    selectedAssignmentId,
    selectedClassSlug,
    classSlug,
    attemptedHash,
    routeAction,
    mode: routeMode,
  } = useHashView();
  const auth = useAuth();
  const [brand, setBrand] = useState(brandPresets[0]);
  const courseData = useCourseData();

  const cssVars = useMemo(
    () => ({
      "--brand-primary": brand.primary,
      "--brand-secondary": brand.secondary,
      "--app-watermark-logo": `url(${houseLogoMark})`,
    }),
    [brand],
  );
  const transitionKey = transitionGroupForView(view, activityKey);
  const studentSection = studentSectionByView[view] || (activityKey && routeMode === "student" ? "activity" : null);

  const isRoleView = view !== "home";
  const headerActiveRole = view.startsWith("auth-")
    ? view.replace("auth-", "")
    : view.startsWith("student") || routeMode === "student"
      ? "student"
      : view.startsWith("teacher") || routeMode === "teacher-preview"
        ? "teacher"
        : view.startsWith("admin")
          ? "admin"
          : view;

  const addCourseSubmission = (submission) => {
    courseData.setCourse((current) => ({
      ...current,
      submissions: [submission, ...current.submissions.filter((item) => item.student !== submission.student)],
    }));
  };

  return (
    <div className="eduforge-app" style={cssVars}>
      <AppIntro />
      {isRoleView && (
        <>
          <Header
            activeRole={headerActiveRole}
            brand={brand}
            currentUser={auth.currentUser}
            navigateTo={navigateTo}
            onSignOut={async () => {
              await auth.signOut();
              courseData.resetCourse();
              navigateTo("home");
            }}
            showSignOut={!view.startsWith("auth-")}
          />
        </>
      )}

      <PageTransition pageKey={transitionKey}>
        {view === "home" && <RoleSelection navigateTo={navigateTo} brand={brand} />}
        {view === "invalid-route" && <InvalidRouteView attemptedHash={attemptedHash} navigateTo={navigateTo} />}
        {view.startsWith("auth-") && (
          <AuthView
            role={view.replace("auth-", "")}
            navigateTo={navigateTo}
            currentUser={auth.currentUser}
            authLoading={auth.authLoading}
            authError={auth.authError}
            setAuthError={auth.setAuthError}
            signIn={auth.signIn}
            createSchoolAccount={auth.createSchoolAccount}
            signOut={async () => {
              await auth.signOut();
              courseData.resetCourse();
              navigateTo("home");
            }}
          />
        )}
        {adminSectionByView[view] && (
          <AdminView
            initialSection={adminSectionByView[view]}
            brand={brand}
            setBrand={setBrand}
            navigateTo={navigateTo}
          />
        )}
        {teacherSectionByView[view] && (
          <TeacherPortal
            initialSection={teacherSectionByView[view]}
            initialSelectedPackageSlug={selectedPackageSlug}
            initialSelectedBookId={selectedBookId}
            initialSelectedBookSubview={selectedBookSubview}
            initialSelectedPageUnitId={selectedPageUnitId}
            initialSelectedPageId={selectedPageId}
            initialSelectedPageNumber={selectedPageNumber}
            initialSelectedAssignmentId={selectedAssignmentId}
            initialSelectedClassSlug={selectedClassSlug}
            routeAction={routeAction}
            initialPreviewActivityKey={routeMode === "teacher-preview" ? activityKey : null}
            currentUser={auth.currentUser}
            course={courseData.course}
            onCourseChange={courseData.setCourse}
            navigateTo={navigateTo}
            courseLoading={courseData.loading}
            courseError={courseData.error}
            saveCourse={courseData.saveCourse}
            saveLesson={courseData.saveLesson}
            saveActivity={courseData.saveActivity}
            reloadCourse={courseData.reloadCourse}
          />
        )}
        {studentSection && (
          <StudentPortal
            initialSection={studentSection}
            initialActivityKey={routeMode === "student" ? activityKey : null}
            initialSelectedPackageSlug={selectedPackageSlug}
            initialSelectedBookId={selectedBookId}
            initialSelectedBookSubview={selectedBookSubview}
            initialSelectedPageUnitId={selectedPageUnitId}
            initialSelectedPageId={selectedPageId}
            initialSelectedPageNumber={selectedPageNumber}
            course={courseData.course}
            onSubmission={addCourseSubmission}
            navigateTo={navigateTo}
            currentUser={auth.currentUser}
            courseLoading={courseData.loading}
            courseError={courseData.error}
            submitLesson={courseData.submitCourseLesson}
          />
        )}
        {view === "student-course" && (
          <StudentCourseView
            course={courseData.course}
            onSubmission={addCourseSubmission}
            navigateTo={navigateTo}
            courseLoading={courseData.loading}
            courseError={courseData.error}
            submitLesson={courseData.submitCourseLesson}
          />
        )}
        {view === "student-preview" && (
          <StudentCourseView course={courseData.course} navigateTo={navigateTo} courseError={courseData.error} previewMode />
        )}
        {view === "flow" && <FullDemoFlow navigateTo={navigateTo} />}
        {view === "join-class" && <JoinClassView classSlug={classSlug} currentUser={auth.currentUser} navigateTo={navigateTo} />}
      </PageTransition>
    </div>
  );
}
