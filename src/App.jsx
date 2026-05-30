import { useMemo, useState } from "react";
import { AdminView } from "./components/lms/AdminView.jsx";
import { AuthView } from "./components/lms/AuthView.jsx";
import { FullDemoFlow } from "./components/lms/FullDemoFlow.jsx";
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
  if (adminSectionByView[view]) return "admin";
  if (teacherSectionByView[view]) return "teacher";
  if (studentSectionByView[view]) return "student";
  return view;
}

export default function App() {
  const { view, navigateTo, activityKey, selectedBookId, mode: routeMode } = useHashView();
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
              navigateTo("home");
            }}
          />
        </>
      )}

      <PageTransition pageKey={transitionKey}>
        {view === "home" && <RoleSelection navigateTo={navigateTo} brand={brand} />}
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
            initialSelectedBookId={selectedBookId}
            initialPreviewActivityKey={routeMode === "teacher-preview" ? activityKey : null}
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
            initialSelectedBookId={selectedBookId}
            course={courseData.course}
            onSubmission={addCourseSubmission}
            navigateTo={navigateTo}
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
      </PageTransition>
    </div>
  );
}
