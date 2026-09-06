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
import { classLevelOptions, teacherSections } from "../teacherPortalConfig.js";
import { dueDateLabel, dueDateTone } from "../teacherPortalUtils.js";

import { ResultsModal } from "../components/TeacherResultsModal.jsx";

export function TeacherClasses({ currentUser = null, bookPackages = [], loadingBooks = false, bookLoadError = "", classes = [], loadingClasses = false, classLoadError = "", selectedClassSlug: routeSelectedClassSlug = null, routeAction = null, navigateTo, onClassCreated }) {
  const [selectedClassSlug, setSelectedClassSlug] = useState(routeSelectedClassSlug || "");
  const [newClassName, setNewClassName] = useState("");
  const [newClassLevel, setNewClassLevel] = useState("B2");
  const [newClassPackageId, setNewClassPackageId] = useState("");
  const selectedPackage = bookPackages.find((item) => item.id === newClassPackageId);
  const packageUnavailable = loadingBooks || Boolean(bookLoadError) || !selectedPackage;
  const [classNameError, setClassNameError] = useState("");
  const [classSaveError, setClassSaveError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [savingClass, setSavingClass] = useState(false);
  const [selectedWorkStudent, setSelectedWorkStudent] = useState(null);
  const [liveStudents, setLiveStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const selectedClass = classes.find((classItem) => classItem.slug === selectedClassSlug) || classes[0];
  const students = liveStudents;

  useEffect(() => {
    setSelectedClassSlug((currentSlug) => {
      if (routeSelectedClassSlug && classes.some((classItem) => classItem.slug === routeSelectedClassSlug)) return routeSelectedClassSlug;
      if (classes.some((classItem) => classItem.slug === currentSlug)) return currentSlug;
      return classes[0]?.slug || "";
    });
  }, [classes, routeSelectedClassSlug]);

  useEffect(() => {
    if (!selectedClass?.id) {
      setLiveStudents([]);
      return;
    }
    let mounted = true;
    setLoadingStudents(true);
    setStudentsError("");
    listClassStudents(selectedClass.id).then((rows) => {
      if (!mounted) return;
      setLiveStudents(rows);
    }).catch((error) => {
      if (!mounted) return;
      console.warn("Class students could not be loaded.", error);
      setLiveStudents([]);
      setStudentsError(error.message || "Class students could not be loaded.");
    }).finally(() => {
      if (mounted) setLoadingStudents(false);
    });
    return () => {
      mounted = false;
    };
  }, [selectedClass?.id]);

  const createClass = async (event) => {
    event.preventDefault();
    if (packageUnavailable) { setClassSaveError("Choose an available book package before creating the class."); return; }
    const trimmedName = newClassName.trim();
    if (!trimmedName) {
      setClassNameError("Enter a class name before creating the class.");
      setClassSaveError("");
      setSuccessMessage("");
      return;
    }

    setSavingClass(true);
    setClassSaveError("");
    setSuccessMessage("");

    try {
      const createdClass = await createTeacherClass({
        teacherId: currentUser?.id || null,
        schoolId: currentUser?.school_id || currentUser?.schoolId || null,
        name: trimmedName,
        level: newClassLevel,
        assignedBook: selectedPackage.packageTitle || selectedPackage.title,
        bookPackageId: selectedPackage.id,
      });

      onClassCreated?.(createdClass);
      setSelectedClassSlug(createdClass.slug);
      navigateTo?.(buildTeacherSectionHash("classes", createdClass.slug));
      setSelectedWorkStudent(null);
      setNewClassName("");
      setClassNameError("");
      setSuccessMessage("Class created. Share the invite link with students.");
    } catch (error) {
      setClassSaveError(error.message || "Class could not be saved. Try again.");
    } finally {
      setSavingClass(false);
    }
  };

  return (
    <section className="teacher-section-stack">
      <SectionTitle
        eyebrow="Classes"
        title="B2 class progress."
        text="Review Ultimate B2 class groups, completion, and student work."
      />

      <Card className="teacher-create-class-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">New class group</span>
            <h2>Create new class</h2>
          </div>
          <Tag tone={classLoadError ? "gold" : "blue"}>{classLoadError ? "Unavailable" : "Database"}</Tag>
        </div>
        <form className="teacher-create-class-form" onSubmit={createClass}>
          <label>
            Class name
            <input
              value={newClassName}
              placeholder="B2 Monday 18:00"
              onChange={(event) => {
                setNewClassName(event.target.value);
                if (classNameError) setClassNameError("");
              }}
              aria-invalid={classNameError ? "true" : "false"}
            />
            {classNameError && <span className="field-error">{classNameError}</span>}
          </label>
          <label>
            Level
            <select value={newClassLevel} onChange={(event) => setNewClassLevel(event.target.value)}>
              {classLevelOptions.map((level) => <option key={level}>{level}</option>)}
            </select>
          </label>
          <label>
            Assigned book
            <select value={selectedPackage ? newClassPackageId : ""} disabled={loadingBooks || Boolean(bookLoadError) || savingClass} onChange={(event) => setNewClassPackageId(event.target.value)}>
              <option value="">{loadingBooks ? "Loading book packages…" : "Choose a book package"}</option>
              {bookPackages.map((book) => <option key={book.id} value={book.id}>{book.packageTitle || book.title}</option>)}
            </select>
            {bookLoadError ? <span role="alert">Book packages are unavailable. Refresh the page and try again.</span> : !loadingBooks && !bookPackages.length ? <span>No authorized book packages are available.</span> : newClassPackageId && !selectedPackage ? <span role="alert">The selected package is no longer available. Choose again.</span> : null}
          </label>
          <button className="primary-action" type="submit" disabled={savingClass || packageUnavailable} data-sound-click="submit">
            {savingClass ? "Saving..." : "Create class"}
          </button>
        </form>
        {classLoadError && <div className="inline-status warning">{classLoadError}</div>}
        {classSaveError && <div className="inline-status error">{classSaveError}</div>}
        {successMessage && <div className="inline-status success">{successMessage}</div>}
      </Card>

      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Class groups</span>
            <h2>Ultimate B2 classes</h2>
          </div>
          <Tag tone="green">Class progress</Tag>
        </div>

        <div className="teacher-class-table">
          {loadingClasses && <div className="teacher-loading-state">Loading classes...</div>}
          {!loadingClasses && classes.length === 0 && <div className="teacher-loading-state">No classes have been created yet.</div>}
          {!loadingClasses && classes.map((classItem) => (
            <article key={classItem.id || classItem.slug} className={selectedClassSlug === classItem.slug ? "selected" : ""}>
              <div className="teacher-class-summary">
                <div className="teacher-class-title-row">
                  <strong>{classItem.name}</strong>
                  <span className="class-level-pill">{classItem.level || "B2"}</span>
                </div>
                <small>{classItem.teacher}</small>
                <small>{classItem.students} students / assigned book: {classItem.assignedBook}</small>
                <ClassInviteLink classItem={classItem} />
              </div>
              <div className="teacher-class-progress">
                <span>Progress</span>
                <Progress value={classItem.completion} color="linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))" />
              </div>
              <b>{classItem.completion}%</b>
              <button
                className="secondary-action compact-action"
                type="button"
                onClick={() => {
                  setSelectedClassSlug(classItem.slug);
                  navigateTo?.(buildTeacherSectionHash("classes", classItem.slug));
                }}
                data-sound-click="tab"
              >
                View students
              </button>
            </article>
          ))}
        </div>
      </Card>

      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><Users size={15} /> {selectedClass?.name || "No class selected"}</span>
            <h2>Students</h2>
          </div>
        </div>
        {studentsError && <div className="inline-status warning">{studentsError}</div>}
        {loadingStudents && <div className="teacher-loading-state">Loading class students...</div>}
        {!loadingStudents && !selectedClass ? (
          <div className="teacher-empty-class-state">
            <p>Create a class or select one from the list to view students.</p>
          </div>
        ) : !loadingStudents && students.length > 0 ? (
          <div className="teacher-student-table compact">
            {students.map((student) => (
              <article key={student.studentId || student.name}>
                <strong>{student.name}</strong>
                <span>{student.email || "No email"}</span>
                <span>{student.completionPercent ?? student.completion ?? 0}% complete</span>
                <span>{student.submittedCount !== undefined ? `${student.submittedCount}/${student.assignedCount} submitted` : student.lastActivity}</span>
                <span>{student.averageScore}% average</span>
                <button className="secondary-action compact-action" type="button" onClick={() => setSelectedWorkStudent(student)} data-sound-click="tab">View work</button>
              </article>
            ))}
          </div>
        ) : !loadingStudents && (
          <div className="teacher-empty-class-state">
            <p>No students have joined this class yet. Copy the invite link and share it with students.</p>
            {selectedClass && <ClassInviteLink classItem={selectedClass} />}
          </div>
        )}
      </Card>
      <ResultsModal student={selectedWorkStudent} label="Selected student work" onClose={() => setSelectedWorkStudent(null)} />
    </section>
  );
}
