import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

import TeacherProjectPageViewer from "./TeacherProjectPageViewer.jsx";
import TeacherProjectShell from "./TeacherProjectShell.jsx";
import TeacherProjectUnitOverview from "./TeacherProjectUnitOverview.jsx";

const library = Object.freeze({ view: "library", unitId: "", entryId: "" });

const TeacherProjectPresentation = forwardRef(function TeacherProjectPresentation({ config, animationsActive = true, editing = false, onViewChange }, ref) {
  const [navigation, setNavigation] = useState(library);
  const navigate = (next, { replace = false } = {}) => {
    setNavigation(next); onViewChange?.(next.view);
    if (!editing && globalThis.history) globalThis.history[replace ? "replaceState" : "pushState"]({ teacherProject: true, ...next }, "", `#${next.view}`);
  };
  const selectedUnit = config.content.studentsBook.units.find((unit) => unit.id === navigation.unitId) || null;
  const entryIndex = selectedUnit?.entries.findIndex((entry) => entry.id === navigation.entryId) ?? -1;
  const home = () => navigate(library, { replace: true });
  const back = () => {
    if (navigation.view === "page" && selectedUnit) { navigate({ view: "overview", unitId: selectedUnit.id, entryId: "" }, { replace: true }); return true; }
    if (navigation.view === "overview") { home(); return true; }
    return false;
  };
  useImperativeHandle(ref, () => ({ back, home, isLibrary: () => navigation.view === "library" }), [navigation, selectedUnit]);
  useEffect(() => {
    if (editing || !globalThis.history) return undefined;
    globalThis.history.replaceState({ teacherProject: true, ...library }, "", "#library");
    const pop = (event) => { const next = event.state?.teacherProject ? event.state : library; setNavigation(next); onViewChange?.(next.view); };
    globalThis.addEventListener("popstate", pop);
    return () => globalThis.removeEventListener("popstate", pop);
  }, [editing]);

  if (navigation.view === "overview" && selectedUnit?.entries.length) {
    return <TeacherProjectUnitOverview config={config} unit={selectedUnit} onHome={home} onOpenEntry={(entryId) => navigate({ view: "page", unitId: selectedUnit.id, entryId })} />;
  }
  if (navigation.view === "page" && selectedUnit && entryIndex >= 0) {
    return <TeacherProjectPageViewer key={selectedUnit.entries[entryIndex].id} config={config} unit={selectedUnit} entryIndex={entryIndex} onHome={home} onBack={back} onSelectIndex={(index) => navigate({ view: "page", unitId: selectedUnit.id, entryId: selectedUnit.entries[index].id })} />;
  }
  return <TeacherProjectShell config={config} animationsActive={animationsActive} editing={editing} onOpenUnit={(editionId, unitId) => {
    if (editionId !== "students-book") return;
    const unit = config.content.studentsBook.units.find((candidate) => candidate.id === unitId);
    if (unit?.entries.length) navigate({ view: "overview", unitId, entryId: "" });
  }} />;
});

export default TeacherProjectPresentation;
