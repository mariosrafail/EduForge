import { useMemo, useState } from "react";
import { AdminView } from "./components/lms/AdminView.jsx";
import { AuthView } from "./components/lms/AuthView.jsx";
import { FullDemoFlow } from "./components/lms/FullDemoFlow.jsx";
import { RoleSelection } from "./components/lms/RoleSelection.jsx";
import { Header, PageTransition } from "./components/lms/Shared.jsx";
import { AppIntro } from "./components/lms/shared/AppIntro.jsx";
import { StudentCourseView } from "./components/lms/student/StudentCourseView.jsx";
import { TeacherCourseEditor } from "./components/lms/teacher/TeacherCourseEditor.jsx";
import houseLogoMark from "./assets/branding/hamilton-house-logo-houseonly.png";
import { brandPresets } from "./data/lmsDemoData.js";
import { useAuth } from "./hooks/useAuth.js";
import { useCourseData } from "./hooks/useCourseData.js";
import { useHashView } from "./hooks/useHashView.js";

export default function App() {
  const { view, navigateTo } = useHashView();
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

  const isRoleView = view !== "home";
  const headerActiveRole = view.startsWith("auth-")
    ? view.replace("auth-", "")
    : view === "student-course" || view === "student-preview"
      ? "student"
      : view === "teacher-course-editor"
        ? "teacher"
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

      <PageTransition pageKey={view}>
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
        {view === "admin" && <AdminView brand={brand} setBrand={setBrand} />}
        {(view === "teacher" || view === "teacher-course-editor") && (
          <TeacherCourseEditor
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
        {(view === "student" || view === "student-course") && (
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
