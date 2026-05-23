import { useMemo, useState } from "react";
import { AdminView } from "./components/lms/AdminView.jsx";
import { FullDemoFlow } from "./components/lms/FullDemoFlow.jsx";
import { Header, HeaderTools, PageTransition } from "./components/lms/Shared.jsx";
import { RoleSelection } from "./components/lms/RoleSelection.jsx";
import { StudentView } from "./components/lms/StudentView.jsx";
import { TeacherView } from "./components/lms/TeacherView.jsx";
import { brandPresets } from "./data/lmsDemoData.js";

export default function App() {
  const [view, setView] = useState("home");
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
          <Header activeRole={view} brand={brand} setView={setView} />
          <HeaderTools />
        </>
      )}

      <PageTransition pageKey={view}>
        {view === "home" && <RoleSelection setView={setView} brand={brand} />}
        {view === "admin" && <AdminView brand={brand} setBrand={setBrand} />}
        {view === "teacher" && <TeacherView />}
        {view === "student" && <StudentView brand={brand} />}
        {view === "flow" && <FullDemoFlow setView={setView} />}
      </PageTransition>
    </div>
  );
}
