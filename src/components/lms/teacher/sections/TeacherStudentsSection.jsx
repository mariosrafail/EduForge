import { useState } from "react";
import { SectionTitle } from "../../Shared.jsx";
import { TeacherPerformancePanel } from "../analytics/TeacherPerformancePanel.jsx";
import { TeacherStudentProgressTable } from "../analytics/TeacherStudentProgressTable.jsx";
import { useTeacherGradeAnalytics } from "../analytics/useTeacherGradeAnalytics.js";
import { ResultsModal } from "../components/TeacherResultsModal.jsx";

export function TeacherStudents() {
  const analytics = useTeacherGradeAnalytics();
  const [selectedStudentResult, setSelectedStudentResult] = useState(null);
  return (
    <section className="teacher-section-stack">
      <SectionTitle eyebrow="Students" title="Performance & progress." text="Explore completion, score distribution, recent performance, and explainable follow-up using authoritative final submissions." />
      <TeacherPerformancePanel filters={analytics.filters} updateFilter={analytics.updateFilter} state={analytics.state} />
      {analytics.state.data && <TeacherStudentProgressTable students={analytics.state.data.students} onSelectStudent={setSelectedStudentResult} />}
      <ResultsModal student={selectedStudentResult} onClose={() => setSelectedStudentResult(null)} />
    </section>
  );
}
