import { BookOpen, CheckCircle2, ListChecks, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dedupeBookPackages, demoBookPackages, normalizeBookPackageKey } from "../../../../data/bookPackages.js";
import { findUltimateB2Exercise } from "../../../../data/ultimateB2DemoData.js";
import { getBookPackageTreeWithFallback } from "../../../../services/bookContentApi.js";
import {
  createAssignment,
  exportAssignmentResultsCsv,
  getAssignmentResults,
  listClassStudents,
  listTeacherAssignments,
  listTeacherStudents,
  reviewSubmission,
} from "../../../../services/assignmentsApi.js";
import { createTeacherClass } from "../../../../services/classApi.js";
import { buildActivityHash, buildBookHash, buildTeacherPresentationHash, buildTeacherSectionHash, slugifyRoute } from "../../../../utils/hashRoutes.js";
import { teacherBooksPresentation } from "../teacherBooksState.js";
import { UltimateB2ActivityRunner } from "../../activities/UltimateB2ActivityRunner.jsx";
import { BookPackageBrowser, BookSubpageNavigation, findBookComponentById } from "../../books/BookPackageBrowser.jsx";
import { Card, Progress, SectionTitle, Tag } from "../../Shared.jsx";
import { TeacherCourseEditor } from "../TeacherCourseEditor.jsx";
import { ClassInviteLink } from "../ClassInviteLink.jsx";
import { classBookOptions, classLevelOptions, teacherSections } from "../teacherPortalConfig.js";
import { dueDateLabel, dueDateTone } from "../teacherPortalUtils.js";

import { ResultsModal } from "../components/TeacherResultsModal.jsx";

export function TeacherStudents({ currentUser = null, classes = [], classOptions = [] }) {
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("All classes");
  const [selectedStudentResult, setSelectedStudentResult] = useState(null);
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const filterOptions = classOptions.length ? classOptions : classes.map((classItem) => classItem.name).filter(Boolean);

  useEffect(() => {
    if (!currentUser?.id) {
      setStudents([]);
      return;
    }
    let mounted = true;
    setLoadingStudents(true);
    setStudentsError("");
    listTeacherStudents(currentUser.id).then((rows) => {
      if (!mounted) return;
      setStudents(rows);
    }).catch((error) => {
      if (!mounted) return;
      console.warn("Teacher students could not be loaded.", error);
      setStudents([]);
      setStudentsError(error.message || "Students could not be loaded.");
    }).finally(() => {
      if (mounted) setLoadingStudents(false);
    });
    return () => {
      mounted = false;
    };
  }, [currentUser?.id]);

  const visibleStudents = useMemo(() => {
    return students.filter((student) => {
      const matchesQuery = student.name.toLowerCase().includes(query.toLowerCase());
      const matchesClass = classFilter === "All classes" || student.className === classFilter;
      return matchesQuery && matchesClass;
    });
  }, [classFilter, query, students]);
  return (
    <section className="teacher-section-stack">
      <SectionTitle
        eyebrow="Students"
        title="Student results and submitted work."
        text="Filter B2 students and open a sample result panel with green and red answer feedback."
      />

      <Card>
        <div className="teacher-filter-row">
          <label>
            <Search size={15} /> Search
            <input value={query} placeholder="Student name" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label>
            Class
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option>All classes</option>
              {filterOptions.map((className) => <option key={className}>{className}</option>)}
            </select>
          </label>
          <Tag tone={studentsError ? "gold" : "blue"}>{studentsError ? "Unavailable" : "Database"}</Tag>
        </div>
        {loadingStudents && <div className="teacher-loading-state">Loading students...</div>}
        {studentsError && <div className="inline-status warning">{studentsError}</div>}

        <div className="teacher-student-table">
          {!loadingStudents && visibleStudents.length === 0 && <div className="teacher-loading-state">No students found for these filters.</div>}
          {!loadingStudents && visibleStudents.map((student) => (
            <article key={`${student.studentId || student.name}-${student.className}`}>
              <strong>{student.name}</strong>
              <span>{student.className}</span>
              <span>{student.email || student.level}</span>
              <span>{student.assignedCount !== undefined ? `${student.submittedCount}/${student.assignedCount} submitted` : student.completedExercises}</span>
              <span>{student.averageScore}%</span>
              <span>{student.latestWork || (student.latestSubmittedAt ? new Date(student.latestSubmittedAt).toLocaleDateString() : "No submissions")}</span>
              <button className="secondary-action compact-action" type="button" onClick={() => setSelectedStudentResult(student)} data-sound-click="tab">View results</button>
            </article>
          ))}
        </div>
      </Card>

      <ResultsModal student={selectedStudentResult} onClose={() => setSelectedStudentResult(null)} />
    </section>
  );
}
