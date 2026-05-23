import { useMemo, useState } from "react";
import { AdminView } from "./components/lms/AdminView.jsx";
import { AuthView } from "./components/lms/AuthView.jsx";
import { FullDemoFlow } from "./components/lms/FullDemoFlow.jsx";
import { Header, HeaderTools, PageTransition } from "./components/lms/Shared.jsx";
import { StudentView } from "./components/lms/StudentView.jsx";
import { TeacherView } from "./components/lms/TeacherView.jsx";
import { brandPresets } from "./data/lmsDemoData.js";
import { useAuth } from "./hooks/useAuth.js";
import { useHashView } from "./hooks/useHashView.js";

export default function App() {
  const { view, navigateTo } = useHashView();
  const auth = useAuth();
  const [brand, setBrand] = useState(brandPresets[0]);

  const cssVars = useMemo(
    () => ({
      "--brand-primary": brand.primary,
      "--brand-secondary": brand.secondary,
    }),
    [brand],
  );

  const isRoleView = view !== "home";

  return (
    <div className="eduforge-app" style={cssVars}>
      {isRoleView && (
        <>
          <Header
            activeRole={view}
            brand={brand}
            currentUser={auth.currentUser}
            navigateTo={navigateTo}
            onSignOut={async () => {
              await auth.signOut();
              navigateTo("home");
            }}
          />
          <HeaderTools />
        </>
      )}

      <PageTransition pageKey={view}>
        {view === "home" && (
          <AuthView
            navigateTo={navigateTo}
            brand={brand}
            currentUser={auth.currentUser}
            authLoading={auth.authLoading}
            authError={auth.authError}
            setAuthError={auth.setAuthError}
            signIn={auth.signIn}
            createSchoolAccount={auth.createSchoolAccount}
          />
        )}
        {view === "admin" && <AdminView brand={brand} setBrand={setBrand} />}
        {view === "teacher" && <TeacherView />}
        {view === "student" && <StudentView brand={brand} />}
        {view === "flow" && <FullDemoFlow navigateTo={navigateTo} />}
      </PageTransition>
    </div>
  );
}
