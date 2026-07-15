import { BookOpen, CheckCircle2, ClipboardList, GraduationCap, Play, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { findUltimateB2Exercise } from "../../../../data/ultimateB2DemoData.js";
import { listStudentAssignments, listStudentGrades, submitStudentAssignment } from "../../../../services/assignmentsApi.js";
import { buildCourseComponentsHash, buildCourseComponentSubviewHash } from "../../../../utils/hashRoutes.js";
import { UltimateB2ActivityRunner } from "../../activities/UltimateB2ActivityRunner.jsx";
import { BookPackageBrowser, BookSubpageNavigation, findBookComponentById } from "../../books/BookPackageBrowser.jsx";
import { Card, SectionTitle, Tag } from "../../Shared.jsx";
import { studentDashboardCards } from "../studentPortalData.js";
import { sectionIcons } from "./studentPortalConfig.js";

export function StudentProfileStrip({ currentUser = null }) {
  return (
    <Card className="student-profile-strip">
      <div>
        <span><UserRound size={19} /></span>
        <div>
          <strong>{currentUser?.full_name || "Student"} (Student)</strong>
          <small>Ultimate B2 A / Hamilton House demo</small>
        </div>
      </div>
      <Tag tone="green">B2 active</Tag>
    </Card>
  );
}

export function StudentDashboard({ goToSection, currentUser = null }) {
  const firstName = currentUser?.full_name?.split(" ")?.[0] || "there";
  return (
    <>
      <SectionTitle
        eyebrow="Student portal"
        title={`Welcome back, ${firstName}.`}
        text="Open your Ultimate B2 package, complete assigned exercises, and review corrected work from your teacher."
      />
      <StudentProfileStrip currentUser={currentUser} />
      <section className="student-dashboard-grid" aria-label="Student dashboard sections">
        {studentDashboardCards.map((card) => {
          const Icon = sectionIcons[card.id];
          return (
            <button
              key={card.id}
              type="button"
              className="student-dashboard-card"
              onClick={() => goToSection(card.id)}
              data-sound-click="submit"
            >
              <span><Icon size={25} /></span>
              <strong>{card.title}</strong>
              <p>{card.description}</p>
              <small>{card.metric}</small>
            </button>
          );
        })}
      </section>
    </>
  );
}

export function BookPackageSelector({ bookPackages, selectedPackageSlug, onSelectPackage }) {
  return (
    <Card className="book-package-selector">
      <div className="card-heading">
        <div>
          <span className="eyebrow"><BookOpen size={15} /> Activated packages</span>
          <h2>Choose book package</h2>
        </div>
      </div>
      <div className="book-package-selector-grid">
        {bookPackages.map((bookPackage) => {
          const packageSlug = bookPackage.slug || bookPackage.id || bookPackage.packageTitle;
          const packageKey = packageSlug || `${bookPackage.publisher || "package"}-${bookPackage.level || "level"}`;
          return (
            <button
              key={packageKey}
              type="button"
              className={selectedPackageSlug === packageSlug ? "selected" : ""}
              onClick={() => onSelectPackage(packageSlug)}
              data-sound-click="tab"
            >
              <strong>{bookPackage.packageTitle}</strong>
              <small>{bookPackage.level} / {bookPackage.components.length} components</small>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export function StudentBooks({ openActivity, completedActivities, bookPackages = [], selectedPackageSlug = "ultimate-b2", selectedBookSubview = null, onSelectPackage, bookSourceMessage = "", selectedBookId = null, selectedPageUnitId = null, selectedPageNumber = null, selectedPageId = null, onSelectBook, onSelectBookPage, onSelectBookSubview }) {
  const [activationCode, setActivationCode] = useState("");
  const [activated, setActivated] = useState(false);
  const bookPackage = bookPackages.find((item) => (item.slug || item.id) === selectedPackageSlug) || bookPackages[0] || null;
  const selectedComponent = findBookComponentById(bookPackage, selectedBookId);
  const hasSelectedPage = Boolean(selectedPageId || selectedPageNumber);

  if (!bookPackage) {
    return (
      <section className="student-section-stack">
        <SectionTitle eyebrow="My digital books" title="No book packages loaded." />
        {bookSourceMessage && <div className="inline-status warning">{bookSourceMessage}</div>}
        <Card><p>Your activated book packages could not be loaded.</p></Card>
      </section>
    );
  }

  return (
    <section className="student-section-stack">
      {selectedComponent && (
        <BookSubpageNavigation
          component={selectedComponent}
          bookPackage={bookPackage}
          mode="student"
          onBack={() => onSelectBook?.(null)}
        />
      )}
      {!hasSelectedPage && (
        <SectionTitle
          eyebrow="My digital books"
          title="Explore your books."
          // text="Activate your Hamilton House book code, open Unit 2, and start practice exercises."
        />
      )}



      {bookSourceMessage && !hasSelectedPage && <div className="inline-status">{bookSourceMessage}</div>}
      {!selectedComponent && (
        <BookPackageSelector
          bookPackages={bookPackages}
          selectedPackageSlug={selectedPackageSlug}
          onSelectPackage={onSelectPackage}
        />
      )}
      <BookPackageBrowser
        mode="student"
        bookPackage={bookPackage}
        selectedComponentId={selectedBookId}
        selectedSubview={selectedBookSubview}
        selectedPageUnitId={selectedPageUnitId}
        selectedPageId={selectedPageId}
        selectedPageNumber={selectedPageNumber}
        onSelectComponent={onSelectBook}
        onSelectBookPage={onSelectBookPage}
        onSelectSubview={onSelectBookSubview}
        onBackToBooks={() => onSelectBook?.(null)}
        onStartExercise={(exercise) => openActivity(exercise, "books")}
        completedActivities={completedActivities}
      />
    </section>
  );
}

function formatDueStatus(dueAt) {
  if (!dueAt) return "No due date";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "No due date";
  const diffDays = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays <= 7) return "This week";
  return due.toLocaleDateString();
}

function normalizeStudentAssignment(assignment = {}) {
  const activity = assignment.activity || {};
  return {
    ...assignment,
    title: assignment.title || activity.title || "Untitled assignment",
    component: assignment.componentTitle || assignment.component || assignment.packageTitle || "Ultimate B2",
    className: assignment.className || "Individual",
    dueStatus: assignment.dueStatus || formatDueStatus(assignment.dueAt),
    estimatedTime: assignment.estimatedTime || (activity.estimatedMinutes ? `${activity.estimatedMinutes} min` : "Activity"),
    completionStatus: assignment.completionStatus || (assignment.submittedAt ? "Submitted" : "Not started"),
    demoActivityKey: activity.demoActivityKey === "quiz-1-vocabulary" ? "quiz-1" : activity.demoActivityKey || assignment.demoActivityKey || activity.slug,
    activityId: activity.id || assignment.activityId,
    assignmentId: assignment.assignmentId || assignment.id,
    score: assignment.scorePercent === null || assignment.scorePercent === undefined ? null : assignment.scorePercent,
    dbActivity: {
      ...activity,
      id: activity.id || assignment.activityId,
      title: activity.title || assignment.title,
      demoActivityKey: activity.demoActivityKey || activity.slug,
    },
  };
}

export function StudentAssignments({ openActivity, currentUser = null, refreshKey = 0, submitMessage = "" }) {
  const [liveAssignments, setLiveAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const assignments = liveAssignments;
  const selectedAssignment = assignments.find((assignment) => (assignment.assignmentId || assignment.title) === selectedId) || assignments[0];

  useEffect(() => {
    if (!currentUser?.id) return;
    let mounted = true;
    setLoadingAssignments(true);
    setAssignmentError("");
    listStudentAssignments(currentUser.id).then((rows) => {
      if (!mounted) return;
      const normalized = rows.map(normalizeStudentAssignment);
      setLiveAssignments(normalized);
      setSelectedId((current) => current || normalized[0]?.assignmentId || "");
    }).catch((error) => {
      if (!mounted) return;
      console.warn("Student assignments could not be loaded.", error);
      setLiveAssignments([]);
      setAssignmentError(error.message || "Assignments could not be loaded.");
      setSelectedId("");
    }).finally(() => {
      if (mounted) setLoadingAssignments(false);
    });
    return () => {
      mounted = false;
    };
  }, [currentUser?.id, refreshKey]);

  useEffect(() => {
    if (currentUser?.id) return;
    setLiveAssignments([]);
    setSelectedId("");
  }, [currentUser?.id]);

  if (!currentUser?.id) {
    return (
      <section className="student-section-stack">
        <SectionTitle eyebrow="Assigned exercises" title="Sign in needed." text="Sign in as a student to see live assignments from your classes." />
        <Card><p>No student account is currently signed in.</p></Card>
      </section>
    );
  }

  return (
    <section className="student-section-stack">
      <SectionTitle
        eyebrow="Assigned exercises"
        title="Teacher assignments."
        text="Select an assigned exercise from the left bar, review the details, and start the activity flow."
      />

      <div className="student-assignments-layout">
        <aside className="student-assignment-sidebar">
          <strong>Assignments</strong>
          {loadingAssignments && <small>Loading assignments...</small>}
          {assignmentError && <small>{assignmentError}</small>}
          {!loadingAssignments && assignments.length === 0 && <small>No assignments yet.</small>}
          {assignments.map((assignment) => (
            <button
              key={assignment.assignmentId || assignment.title}
              type="button"
              className={(selectedAssignment?.assignmentId || selectedAssignment?.title) === (assignment.assignmentId || assignment.title) ? "selected" : ""}
              onClick={() => setSelectedId(assignment.assignmentId || assignment.title)}
              data-sound-click="tab"
            >
              <span>{assignment.title}</span>
              <small>{assignment.dueStatus}</small>
            </button>
          ))}
        </aside>

        <Card className="student-assignment-detail">
          {submitMessage && <div className="inline-status success">{submitMessage}</div>}
          {selectedAssignment ? (
            <>
              <span className="eyebrow"><ClipboardList size={15} /> Assignment details</span>
              <h2>{selectedAssignment.title}</h2>
              <div className="student-detail-grid">
                <div><strong>Book/component</strong><span>{selectedAssignment.component}</span></div>
                <div><strong>Class</strong><span>{selectedAssignment.className}</span></div>
                <div><strong>Due status</strong><span>{selectedAssignment.dueStatus}</span></div>
                <div><strong>Estimated time</strong><span>{selectedAssignment.estimatedTime}</span></div>
                <div><strong>Completion</strong><span>{selectedAssignment.completionStatus}</span></div>
                {selectedAssignment.score !== null && selectedAssignment.score !== undefined && <div><strong>Score</strong><span>{selectedAssignment.score}%</span></div>}
              </div>
              {selectedAssignment.teacherNotes && <p>{selectedAssignment.teacherNotes}</p>}
              {selectedAssignment.worksheetLinks?.length > 0 && (
                <div className="student-detail-grid">
                  {selectedAssignment.worksheetLinks.map((link) => <div key={link}><strong>Worksheet</strong><a href={link} target="_blank" rel="noreferrer">{link}</a></div>)}
                </div>
              )}
              <button className="primary-action" type="button" onClick={() => openActivity(selectedAssignment, "assignments")} data-sound-click="submit">
                <Play size={17} /> Start exercise
              </button>
            </>
          ) : (
            <p>No assignments yet.</p>
          )}
        </Card>
      </div>
    </section>
  );
}

export function StudentGrades({ currentUser = null, refreshKey = 0 }) {
  const [grades, setGrades] = useState([]);
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [gradeError, setGradeError] = useState("");
  const [selectedResult, setSelectedResult] = useState("");
  const visibleGrades = grades;
  const submittedGrades = visibleGrades.filter((row) => row.scorePercent !== null && row.scorePercent !== undefined);
  const averageScore = submittedGrades.length
    ? Math.round(submittedGrades.reduce((sum, row) => sum + Number(row.scorePercent || 0), 0) / submittedGrades.length)
    : 0;
  const selectedLiveGrade = visibleGrades.find((row) => (row.id || row.title) === selectedResult || row.title === selectedResult);

  useEffect(() => {
    if (!currentUser?.id) return;
    let mounted = true;
    setLoadingGrades(true);
    setGradeError("");
    listStudentGrades(currentUser.id).then((rows) => {
      if (!mounted) return;
      const normalized = rows.map((row) => ({
        ...row,
        title: row.title || row.activityTitle,
        component: row.componentTitle || row.packageTitle || "Ultimate B2",
        date: row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : "",
        score: row.scorePercent === null || row.scorePercent === undefined ? "No score" : `${Math.round(Number(row.scorePercent))}%`,
        status: row.status || "Submitted",
      }));
      setGrades(normalized);
      setSelectedResult(normalized[0]?.id || "");
    }).catch((error) => {
      if (!mounted) return;
      console.warn("Student grades could not be loaded.", error);
      setGrades([]);
      setSelectedResult("");
      setGradeError(error.message || "Grades could not be loaded.");
    }).finally(() => {
      if (mounted) setLoadingGrades(false);
    });
    return () => {
      mounted = false;
    };
  }, [currentUser?.id, refreshKey]);

  if (!currentUser?.id) {
    return (
      <section className="student-section-stack">
        <SectionTitle eyebrow="My grades" title="Sign in needed." text="Sign in as a student to review live grades and corrected work." />
        <Card><p>No student account is currently signed in.</p></Card>
      </section>
    );
  }

  return (
    <section className="student-section-stack">
      <SectionTitle
        eyebrow="My grades"
        title="Scores, feedback, and corrected work."
        text="Review your latest results and teacher feedback for Ultimate B2 Unit 2."
      />

      <section className="student-grade-summary">
        <Card><strong>{`${averageScore}%`}</strong><span>Overall average score</span></Card>
        <Card><strong>{visibleGrades.length}</strong><span>Completed assignments</span></Card>
        <Card><strong>0</strong><span>Pending assignments</span></Card>
        <Card><strong>{selectedLiveGrade?.teacherFeedback || "No feedback yet."}</strong><span>Latest teacher feedback</span></Card>
      </section>

      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><GraduationCap size={15} /> Results table</span>
            <h2>Corrected exercises</h2>
          </div>
        </div>
        {loadingGrades && <div className="teacher-loading-state">Loading grades...</div>}
        {gradeError && <div className="inline-status warning">{gradeError}</div>}
        <div className="student-grades-table">
          {!loadingGrades && visibleGrades.length === 0 && <div className="teacher-loading-state">No submitted work yet.</div>}
          {visibleGrades.map((row) => (
            <article key={row.id || row.title}>
              <strong>{row.title}</strong>
              <span>{row.component}</span>
              <span>{row.date}</span>
              <span>{row.score}</span>
              <Tag tone="green">{row.status}</Tag>
              <button className="secondary-action compact-action" type="button" onClick={() => setSelectedResult(row.id || row.title)} data-sound-click="tab">View feedback</button>
            </article>
          ))}
        </div>
      </Card>

      <Card className="student-corrected-work">
        <div className="card-heading">
          <div>
            <span className="eyebrow"><CheckCircle2 size={15} /> Corrected work</span>
            <h2>{selectedLiveGrade?.title || selectedResult}</h2>
            <p>Live submitted answer payload from the assignment result.</p>
          </div>
          <Tag tone="gold">Review feedback</Tag>
        </div>
        {selectedLiveGrade?.answers && Object.keys(selectedLiveGrade.answers).length > 0 ? (
          <div className="student-answer-feedback">
            {Object.entries(selectedLiveGrade.answers).map(([questionId, answer]) => (
              <article key={questionId} className="correct">
                <div>
                  <strong>{questionId}</strong>
                  <span>Student answer: {String(answer)}</span>
                </div>
                <b>Submitted</b>
              </article>
            ))}
          </div>
        ) : <div className="teacher-loading-state">No submitted answer payload is available for this result.</div>}
      </Card>
    </section>
  );
}

export function StudentActivitySection({ activeExercise, setActiveExercise, completedActivities, setCompletedActivities, previousSection, selectedPackageSlug, selectedBookId, goToSection, navigateTo, currentUser = null, onAssignmentSubmitted }) {
  const exercise = activeExercise || { title: "Unit 2 Reading: Exercise 3", demoActivityKey: "reading-ex3" };
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const exerciseContext = findUltimateB2Exercise(exercise.demoActivityKey || exercise.id);
  const backToPrevious = () => {
    if (previousSection === "books" && navigateTo) {
      const packageSlug = selectedPackageSlug || "ultimate-b2";
      const componentSlug = selectedBookId || exerciseContext?.component?.id;
      if (componentSlug) {
        navigateTo(buildCourseComponentSubviewHash(packageSlug, componentSlug, "exercises"));
        return;
      }
      navigateTo(buildCourseComponentsHash(packageSlug));
      return;
    }
    goToSection(previousSection || "books");
  };

  return (
    <section className="student-section-stack">
      <UltimateB2ActivityRunner
        activityKey={exercise.demoActivityKey}
        exerciseId={exercise.id}
        activity={exercise.dbActivity || exercise}
        mode="student"
        onBack={backToPrevious}
        onSubmit={async (result) => {
          setCompletedActivities((current) => ({ ...current, [result.activityKey]: result }));
          if (!exercise.assignmentId || !exercise.activityId || !currentUser?.id) return;
          setSubmitError("");
          setSubmitSuccess("");
          try {
            await submitStudentAssignment({
              assignmentId: exercise.assignmentId,
              activityId: exercise.activityId,
              score: result.score,
              result,
            });
            setSubmitSuccess("Assignment submission saved.");
            onAssignmentSubmitted?.();
          } catch (error) {
            setSubmitError(error.message || "Assignment submission could not be saved.");
          }
        }}
        navigateTo={navigateTo}
        onNextActivity={(activityKey) => {
          const next = findUltimateB2Exercise(activityKey);
          if (next?.exercise) {
            setActiveExercise(next.exercise);
            goToSection("activity");
          }
        }}
      />
      {submitSuccess && <div className="inline-status success">{submitSuccess}</div>}
      {submitError && <div className="inline-status error">{submitError}</div>}
    </section>
  );
}

