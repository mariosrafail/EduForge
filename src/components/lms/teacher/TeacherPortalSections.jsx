import { BookOpen, CheckCircle2, KeyRound, ListChecks, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dedupeBookPackages, demoBookPackages, normalizeBookPackageKey } from "../../../data/bookPackages.js";
import { findUltimateB2Exercise, ultimateB2Package } from "../../../data/ultimateB2DemoData.js";
import { getBookPackageTreeWithFallback } from "../../../services/bookContentApi.js";
import {
  createAssignment,
  downloadAssignmentResultsCsv,
  exportAssignmentResultsCsv,
  getAssignmentResults,
  listClassStudents,
  listTeacherAssignments,
  listTeacherStudents,
  reviewSubmission,
} from "../../../services/assignmentsApi.js";
import { createTeacherClass } from "../../../services/classApi.js";
import { buildActivityHash, buildBookHash, buildTeacherSectionHash, slugifyRoute } from "../../../utils/hashRoutes.js";
import { UltimateB2ActivityRunner } from "../activities/UltimateB2ActivityRunner.jsx";
import { BookPackageBrowser, BookSubpageNavigation, findBookComponentById } from "../books/BookPackageBrowser.jsx";
import { Card, Progress, SectionTitle, Tag } from "../Shared.jsx";
import { TeacherCourseEditor } from "./TeacherCourseEditor.jsx";
import { ClassInviteLink } from "./ClassInviteLink.jsx";
import { classBookOptions, classLevelOptions, teacherSections } from "./teacherPortalConfig.js";
import { dueDateLabel, dueDateTone } from "./teacherPortalUtils.js";
import { sampleExerciseResult, teacherPortalAssignments, teacherPortalStudents } from "./teacherPortalData.js";

export function TeacherDashboard({ goToSection }) {
  return (
    <>
      <SectionTitle
        eyebrow="Teacher portal"
        title="Teaching workspace."
        text="Choose a section to manage digital book access, class progress, student results, assigned exercises, or custom interactive activities."
      />

      <section className="teacher-dashboard-grid" aria-label="Teacher dashboard sections">
        {teacherSections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              className="teacher-dashboard-card"
              onClick={() => goToSection(section.id)}
              data-sound-click="submit"
            >
              <span className="teacher-dashboard-card-icon"><Icon size={25} /></span>
              <strong>{section.title}</strong>
              <p>{section.description}</p>
              <small>{section.metric}</small>
            </button>
          );
        })}
      </section>
    </>
  );
}

export function BookPackageSelector({ bookPackages, selectedPackageSlug, onSelectPackage }) {
  const visibleBookPackages = useMemo(() => dedupeBookPackages(bookPackages), [bookPackages]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.table(bookPackages.map((bookPackage) => ({
      title: bookPackage.packageTitle || bookPackage.title,
      slug: bookPackage.slug,
      id: bookPackage.id,
      source: bookPackage.source,
      key: normalizeBookPackageKey(bookPackage),
      components: bookPackage.components?.length || 0,
    })));
    console.table(visibleBookPackages.map((bookPackage) => ({
      title: bookPackage.packageTitle || bookPackage.title,
      slug: bookPackage.slug,
      id: bookPackage.id,
      source: bookPackage.source,
      key: normalizeBookPackageKey(bookPackage),
      components: bookPackage.components?.length || 0,
    })));
  }, [bookPackages, visibleBookPackages]);

  return (
    <Card className="book-package-selector">
      <div className="card-heading">
        <div>
          <span className="eyebrow"><BookOpen size={15} /> Activated packages</span>
          <h2>Choose book package</h2>
        </div>
      </div>
      <div className="book-package-selector-grid">
        {visibleBookPackages.map((bookPackage) => {
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

export function TeacherBooks({ bookPackages = demoBookPackages, selectedPackageSlug = "ultimate-b2", selectedBookSubview = null, onSelectPackage, bookSourceMessage, selectedBookId = null, selectedPageUnitId = null, selectedPageId = null, selectedPageNumber = null, onSelectBook, onSelectBookPage, onSelectBookSubview, initialPreviewActivityKey = null, navigateTo, classOptions = [] }) {
  const [activationCode, setActivationCode] = useState("");
  const [activated, setActivated] = useState(false);
  const [previewExercise, setPreviewExercise] = useState(null);
  const visibleBookPackages = useMemo(() => dedupeBookPackages(bookPackages), [bookPackages]);
  const selectedPackageKey = normalizeBookPackageKey({ slug: selectedPackageSlug, packageTitle: selectedPackageSlug });
  const bookPackage = visibleBookPackages.find((item) => normalizeBookPackageKey(item) === selectedPackageKey || item.slug === selectedPackageSlug || item.id === selectedPackageSlug) || visibleBookPackages[0] || ultimateB2Package;

  useEffect(() => {
    if (!initialPreviewActivityKey) {
      setPreviewExercise(null);
      return;
    }

    const match = findUltimateB2Exercise(initialPreviewActivityKey);
    setPreviewExercise(match?.exercise || { title: initialPreviewActivityKey, demoActivityKey: initialPreviewActivityKey });
  }, [initialPreviewActivityKey]);

  const previewActivity = (exercise) => {
    if (navigateTo && exercise.demoActivityKey) {
      navigateTo(buildActivityHash(exercise.demoActivityKey, "teacher-preview"));
      return;
    }
    setPreviewExercise(exercise);
  };

  const closePreview = () => {
    const match = findUltimateB2Exercise(previewExercise?.demoActivityKey || previewExercise?.id);
    if (navigateTo && match?.component?.id) {
      navigateTo(buildBookHash("teacher", match.component.id));
      return;
    }
    setPreviewExercise(null);
  };

  if (previewExercise) {
    return (
      <section className="teacher-section-stack">
        <UltimateB2ActivityRunner
          activityKey={previewExercise.demoActivityKey}
          exerciseId={previewExercise.id}
          activity={previewExercise.dbActivity || previewExercise}
          mode="teacher-preview"
          onBack={closePreview}
          navigateTo={navigateTo}
          onNextActivity={(activityKey) => {
            const next = findUltimateB2Exercise(activityKey);
            if (next?.exercise) setPreviewExercise(next.exercise);
          }}
        />
      </section>
    );
  }

  const selectedComponent = findBookComponentById(bookPackage, selectedBookId);

  return (
    <section className="teacher-section-stack">
      {selectedComponent && (
        <BookSubpageNavigation
          component={selectedComponent}
          bookPackage={bookPackage}
          mode="teacher"
          onBack={() => onSelectBook?.(null)}
        />
      )}
      <SectionTitle
        eyebrow="Books"
        title={`Digital book access for the ${bookPackage.packageTitle} package.`}
        text={`Activate publisher book access, browse ${bookPackage.packageTitle}, and assign available exercises to class groups.`}
      />

      <Card className="teacher-activation-card">
        <div>
          <span className="eyebrow"><KeyRound size={15} /> Book activation code</span>
          <h2>Activate teacher book access</h2>
          <p>Use the demo code to unlock the {bookPackage.packageTitle} package for this teacher portal.</p>
        </div>
        <div className="activation-form">
          <input value={activationCode} placeholder={bookPackage.activationCodeExample || ultimateB2Package.activationCodeExample} onChange={(event) => setActivationCode(event.target.value)} />
          <button className="primary-action" type="button" onClick={() => setActivated(true)} data-sound-click="submit">Activate book</button>
        </div>
        {activated && <div className="inline-status success">{bookPackage.packageTitle} package activated for Paris Georgoulakis (Teacher).</div>}
      </Card>
      {bookSourceMessage && <div className="inline-status">{bookSourceMessage}</div>}
      {!selectedComponent && (
        <BookPackageSelector
          bookPackages={bookPackages}
          selectedPackageSlug={selectedPackageSlug}
          onSelectPackage={onSelectPackage}
        />
      )}
      <BookPackageBrowser
        mode="teacher"
        bookPackage={bookPackage}
        classOptions={classOptions}
        selectedComponentId={selectedBookId}
        selectedSubview={selectedBookSubview}
        selectedPageUnitId={selectedPageUnitId}
        selectedPageId={selectedPageId}
        selectedPageNumber={selectedPageNumber}
        onSelectComponent={onSelectBook}
        onSelectBookPage={onSelectBookPage}
        onSelectSubview={onSelectBookSubview}
        onBackToBooks={() => onSelectBook?.(null)}
        onPreviewExercise={previewActivity}
      />
    </section>
  );
}

export function TeacherClasses({ currentUser = null, bookPackage = null, classes = [], loadingClasses = false, usingDemoClasses = false, selectedClassSlug: routeSelectedClassSlug = null, routeAction = null, navigateTo, onClassCreated }) {
  const [selectedClassSlug, setSelectedClassSlug] = useState(routeSelectedClassSlug || "");
  const [newClassName, setNewClassName] = useState("");
  const [newClassLevel, setNewClassLevel] = useState("B2");
  const [newClassBook, setNewClassBook] = useState("Ultimate B2");
  const [classNameError, setClassNameError] = useState("");
  const [classSaveError, setClassSaveError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [savingClass, setSavingClass] = useState(false);
  const [selectedWorkStudent, setSelectedWorkStudent] = useState(null);
  const [liveStudents, setLiveStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const [usingDemoStudents, setUsingDemoStudents] = useState(false);
  const selectedClass = classes.find((classItem) => classItem.slug === selectedClassSlug) || classes[0];
  const students = usingDemoStudents ? teacherPortalStudents.filter((student) => student.className === selectedClass?.name) : liveStudents;

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
      setUsingDemoStudents(false);
    }).catch((error) => {
      if (!mounted) return;
      console.warn("Using demo class students fallback.", error);
      setLiveStudents([]);
      setUsingDemoStudents(true);
      setStudentsError(error.message || "Backend unavailable. Showing demo students.");
    }).finally(() => {
      if (mounted) setLoadingStudents(false);
    });
    return () => {
      mounted = false;
    };
  }, [selectedClass?.id]);

  const createClass = async (event) => {
    event.preventDefault();
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
        // TODO: make teacherId required once the full auth flow protects the teacher portal.
        teacherId: currentUser?.id || null,
        schoolId: currentUser?.school_id || currentUser?.schoolId || null,
        name: trimmedName,
        level: newClassLevel,
        assignedBook: newClassBook,
        bookPackageId: bookPackage?.id || null,
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
          <Tag tone={usingDemoClasses ? "gold" : "blue"}>{usingDemoClasses ? "Demo fallback" : "Database"}</Tag>
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
            <select value={newClassBook} onChange={(event) => setNewClassBook(event.target.value)}>
              {classBookOptions.map((book) => <option key={book}>{book}</option>)}
            </select>
          </label>
          <button className="primary-action" type="submit" disabled={savingClass} data-sound-click="submit">
            {savingClass ? "Saving..." : "Create class"}
          </button>
        </form>
        {usingDemoClasses && <div className="inline-status warning">Using demo classes because database classes could not be loaded.</div>}
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

function ResultsModal({ student, assignment, liveResults = null, currentUser = null, label = "Student results", onClose, onReviewSaved }) {
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [savingFeedbackId, setSavingFeedbackId] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");

  useEffect(() => {
    if (!student && !assignment) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [assignment, onClose, student]);

  useEffect(() => {
    const drafts = {};
    for (const row of liveResults?.rows || []) {
      if (row.submissionId) drafts[row.submissionId] = row.teacherFeedback || "";
    }
    setFeedbackDrafts(drafts);
    setReviewMessage("");
  }, [liveResults]);

  if (!student && !assignment) return null;

  const title = liveResults?.assignment?.title || assignment?.title || student?.name;
  const summary = assignment
    ? `${liveResults?.assignment?.className || assignment.className} / ${liveResults?.summary?.submittedCount ?? assignment.submitted}/${liveResults?.summary?.totalStudents ?? assignment.total} submitted / ${liveResults?.summary?.averageScore ?? assignment.averageScore}% average`
    : `${sampleExerciseResult.exercise} / Score ${sampleExerciseResult.score}`;
  const tag = assignment ? (liveResults ? "Live results" : "Demo results") : student.className;

  return (
    <div
      className="results-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <Card className="results-modal" role="dialog" aria-modal="true" aria-labelledby="results-modal-title" onClick={(event) => event.stopPropagation()}>
        <button className="results-modal-close" type="button" onClick={onClose} aria-label="Close results"><X size={18} /></button>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><CheckCircle2 size={15} /> {label}</span>
            <h2 id="results-modal-title">{title}</h2>
            <p>{summary}</p>
          </div>
          <Tag tone="gold">{tag}</Tag>
        </div>

        {assignment && liveResults ? (
          <>
            <section className="student-grade-summary">
              <article className="panel"><strong>{liveResults.summary?.totalStudents ?? 0}</strong><span>Total students</span></article>
              <article className="panel"><strong>{liveResults.summary?.submittedCount ?? 0}</strong><span>Submitted</span></article>
              <article className="panel"><strong>{liveResults.summary?.missingCount ?? 0}</strong><span>Missing</span></article>
              <article className="panel"><strong>{liveResults.summary?.averageScore ?? 0}%</strong><span>Average score</span></article>
            </section>
            {reviewMessage && <div className="inline-status success">{reviewMessage}</div>}
            <div className="review-list results-modal-list">
              {(liveResults.rows || []).map((row) => (
                <article key={row.studentId || row.email}>
                  <strong>{row.studentName}<span>{row.score === null || row.score === undefined ? "No score" : `${row.score}%`}</span></strong>
                  <p>{row.email || "No email"} / {row.submittedAt ? `Submitted ${new Date(row.submittedAt).toLocaleString()}` : "Missing submission"}</p>
                  <Tag tone={row.status === "Submitted" ? "green" : "gold"}>{row.status}</Tag>
                  {row.submissionId ? (
                    <label>
                      Teacher feedback
                      <textarea
                        rows={2}
                        value={feedbackDrafts[row.submissionId] || ""}
                        onChange={(event) => setFeedbackDrafts((current) => ({ ...current, [row.submissionId]: event.target.value }))}
                        placeholder="Short feedback note"
                      />
                      <button
                        className="secondary-action compact-action"
                        type="button"
                        disabled={savingFeedbackId === row.submissionId}
                        onClick={async () => {
                          if (!currentUser?.id) {
                            setReviewMessage("Sign in as a teacher before saving feedback.");
                            return;
                          }
                          setSavingFeedbackId(row.submissionId);
                          setReviewMessage("");
                          try {
                            await reviewSubmission({
                              submissionId: row.submissionId,
                              teacherId: currentUser.id,
                              teacherFeedback: feedbackDrafts[row.submissionId] || "",
                            });
                            setReviewMessage("Feedback saved.");
                            onReviewSaved?.();
                          } catch (error) {
                            setReviewMessage(error.message || "Feedback could not be saved.");
                          } finally {
                            setSavingFeedbackId("");
                          }
                        }}
                        data-sound-click="submit"
                      >
                        {savingFeedbackId === row.submissionId ? "Saving..." : "Save feedback"}
                      </button>
                    </label>
                  ) : (
                    <p>Missing students are waiting for submission.</p>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : assignment ? (
          <div className="review-list results-modal-list">
            <article><strong>Anna Georgiou<span>84%</span></strong><p>Strong text evidence. One grammar item needs review.</p><Tag tone="green">Teacher feedback ready</Tag></article>
            <article><strong>Nikos Stavrou<span>76%</span></strong><p>Listening details need a second replay before next attempt.</p><Tag tone="gold">Needs review</Tag></article>
            <article><strong>Maria Ioannou<span>91%</span></strong><p>Accurate answers and clear reading strategy notes.</p><Tag tone="green">Reviewed</Tag></article>
          </div>
        ) : (
          <div className="answer-feedback-list results-modal-list">
            {sampleExerciseResult.answers.map((answer) => (
              <article key={answer.prompt} className={answer.correct ? "correct" : "wrong"}>
                <div>
                  <strong>{answer.prompt}</strong>
                  <span>Student chose: {answer.studentAnswer}</span>
                  {!answer.correct && <small>Correct answer: {answer.correctAnswer}</small>}
                </div>
                <b>{answer.correct ? "Correct" : "Wrong"}</b>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function TeacherStudents({ currentUser = null, classes = [], classOptions = [] }) {
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("All classes");
  const [selectedStudentResult, setSelectedStudentResult] = useState(null);
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const [usingDemoStudents, setUsingDemoStudents] = useState(false);
  const filterOptions = classOptions.length ? classOptions : classes.map((classItem) => classItem.name).filter(Boolean);

  useEffect(() => {
    if (!currentUser?.id) {
      setStudents([]);
      setUsingDemoStudents(false);
      return;
    }
    let mounted = true;
    setLoadingStudents(true);
    setStudentsError("");
    listTeacherStudents(currentUser.id).then((rows) => {
      if (!mounted) return;
      setStudents(rows);
      setUsingDemoStudents(false);
    }).catch((error) => {
      if (!mounted) return;
      console.warn("Using demo teacher students fallback.", error);
      setStudents([]);
      setUsingDemoStudents(true);
      setStudentsError(error.message || "Backend unavailable. Showing demo students.");
    }).finally(() => {
      if (mounted) setLoadingStudents(false);
    });
    return () => {
      mounted = false;
    };
  }, [currentUser?.id]);

  const visibleStudents = useMemo(() => {
    const sourceStudents = usingDemoStudents ? teacherPortalStudents : students;
    return sourceStudents.filter((student) => {
      const matchesQuery = student.name.toLowerCase().includes(query.toLowerCase());
      const matchesClass = classFilter === "All classes" || student.className === classFilter;
      return matchesQuery && matchesClass;
    });
  }, [classFilter, query, students, usingDemoStudents]);
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
          <Tag tone={usingDemoStudents ? "gold" : "blue"}>{usingDemoStudents ? "Demo fallback" : "Database"}</Tag>
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

export function TeacherAssignments({ currentUser = null, classes = [], classOptions = [], selectedAssignmentId = null, routeAction = null, navigateTo }) {
  const [assignments, setAssignments] = useState([]);
  const [usingDemoAssignments, setUsingDemoAssignments] = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [activityOptions, setActivityOptions] = useState([]);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [dueDate, setDueDate] = useState("");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [worksheetLinks, setWorksheetLinks] = useState("");
  const [assigned, setAssigned] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [selectedAssignmentResult, setSelectedAssignmentResult] = useState(null);
  const [selectedAssignmentLiveResults, setSelectedAssignmentLiveResults] = useState(null);
  const visibleAssignments = usingDemoAssignments ? teacherPortalAssignments : assignments;

  const loadAssignments = async () => {
    setLoadingAssignments(true);
    setAssignmentError("");
    try {
      const liveAssignments = await listTeacherAssignments(currentUser?.id || "");
      setAssignments(liveAssignments);
      setUsingDemoAssignments(false);
    } catch (error) {
      console.warn("Using demo assignment fallback.", error);
      setAssignments([]);
      setUsingDemoAssignments(true);
      setAssignmentError(error.message || "Backend unavailable. Showing demo assignments.");
    } finally {
      setLoadingAssignments(false);
    }
  };

  useEffect(() => {
    loadAssignments();
  }, [currentUser?.id]);

  useEffect(() => {
    let mounted = true;
    getBookPackageTreeWithFallback("ultimate-b2").then((packageTree) => {
      if (!mounted) return;
      const options = [];
      for (const component of packageTree.components || []) {
        for (const unit of component.units || []) {
          for (const lesson of unit.lessons || []) {
            for (const exercise of lesson.exercises || []) {
              if (exercise.assignable === false || exercise.isAssignable === false) continue;
              options.push({
                id: exercise.id,
                title: exercise.title,
                label: `${component.title} / ${unit.title} / ${exercise.title}`,
                component: component.title,
                dbActivity: exercise.dbActivity || exercise,
              });
            }
          }
        }
      }
      setActivityOptions(options);
      setSelectedActivityId((current) => current || options[0]?.id || "");
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedAssignmentId || selectedAssignmentId === "new") {
      setSelectedAssignmentResult(null);
      setSelectedAssignmentLiveResults(null);
      return;
    }
    const match = visibleAssignments.find((assignment) => (
      slugifyRoute(`${assignment.title}-${assignment.className}`) === slugifyRoute(selectedAssignmentId) ||
      slugifyRoute(assignment.title) === slugifyRoute(selectedAssignmentId)
    ));
    setSelectedAssignmentResult(match || null);
    setSelectedAssignmentLiveResults(null);
  }, [selectedAssignmentId, visibleAssignments]);

  const toggleListItem = (value, list, setter) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
    setAssigned("");
  };

  useEffect(() => {
    setSelectedClasses((currentClasses) => {
      const validClasses = currentClasses.filter((className) => classOptions.includes(className));
      return validClasses.length ? validClasses : classOptions.slice(0, 1);
    });
  }, [classOptions]);

  const createLiveAssignment = async (event) => {
    event.preventDefault();
    setAssigned("");
    setAssignmentError("");
    if (!currentUser?.id) {
      setAssignmentError("Sign in as a teacher before creating assignments.");
      return;
    }
    if (!selectedActivityId) {
      setAssignmentError("Choose an exercise before assigning.");
      return;
    }
    const classIds = classes.filter((classItem) => selectedClasses.includes(classItem.name)).map((classItem) => classItem.id).filter(Boolean);
    if (!classIds.length) {
      setAssignmentError("Choose at least one live class before assigning.");
      return;
    }

    setSavingAssignment(true);
    try {
      const selectedActivity = activityOptions.find((item) => item.id === selectedActivityId);
      await createAssignment({
        activityId: selectedActivityId,
        teacherId: currentUser.id,
        classIds,
        dueAt: dueDate ? `${dueDate}T23:59:00` : null,
        title: selectedActivity?.title || "",
        teacherNotes,
        worksheetLinks,
        attachedFiles: [],
        status: "assigned",
      });
      setAssigned(`Assignment created for ${selectedClasses.join(", ")}.`);
      setTeacherNotes("");
      setWorksheetLinks("");
      await loadAssignments();
    } catch (error) {
      setAssignmentError(error.message || "Assignment could not be saved.");
    } finally {
      setSavingAssignment(false);
    }
  };

  const openResults = async (assignment) => {
    setSelectedAssignmentResult(assignment);
    setSelectedAssignmentLiveResults(null);
    navigateTo?.(buildTeacherSectionHash("assignments", `${assignment.title}-${assignment.className}`));
    if (usingDemoAssignments || !assignment.id) return;
    try {
      const results = await getAssignmentResults(assignment.id);
      setSelectedAssignmentLiveResults(results);
    } catch (error) {
      setAssignmentError(error.message || "Assignment results could not be loaded.");
    }
  };

  const exportResults = async (assignment) => {
    if (usingDemoAssignments || !assignment.id) {
      downloadAssignmentResultsCsv({
        assignment,
        rows: [
          { studentName: "Anna Georgiou", email: "", className: assignment.className, assignment: assignment.title, status: "Submitted", score: 84, correctCount: "", totalCount: "", submittedAt: "", dueAt: assignment.dueDate },
          { studentName: "Nikos Stavrou", email: "", className: assignment.className, assignment: assignment.title, status: "Submitted", score: 76, correctCount: "", totalCount: "", submittedAt: "", dueAt: assignment.dueDate },
          { studentName: "Maria Ioannou", email: "", className: assignment.className, assignment: assignment.title, status: "Submitted", score: 91, correctCount: "", totalCount: "", submittedAt: "", dueAt: assignment.dueDate },
        ],
      });
      return;
    }
    try {
      await exportAssignmentResultsCsv(assignment.id);
    } catch (error) {
      setAssignmentError(error.message || "CSV export failed.");
    }
  };

  return (
    <section className="teacher-section-stack">
      <SectionTitle
        eyebrow="Assignments"
        title="Assigned digital book exercises."
        text="Track submit status by class and assign selected Unit 2 exercises from the Ultimate B2 package."
      />

      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><ListChecks size={15} /> Active assignments</span>
            <h2>Submit status</h2>
          </div>
          <Tag tone={usingDemoAssignments ? "gold" : "green"}>{usingDemoAssignments ? "Demo fallback" : "Database"}</Tag>
        </div>
        {assignmentError && <div className={`inline-status ${usingDemoAssignments ? "warning" : "error"}`}>{assignmentError}</div>}
        {loadingAssignments && <div className="teacher-loading-state">Loading assignments...</div>}
        <div className="teacher-assignment-table">
          {!loadingAssignments && visibleAssignments.length === 0 && <div className="teacher-loading-state">No assignments yet. Create one below.</div>}
          {!loadingAssignments && visibleAssignments.map((assignment) => (
            <article key={assignment.id || `${assignment.title}-${assignment.className}`}>
              <div>
                <strong>{assignment.title}</strong>
                <small>{assignment.component} / {assignment.className}</small>
                <small>Assigned {assignment.assignedDate || (assignment.assignedAt ? new Date(assignment.assignedAt).toLocaleDateString() : "Today")} / Due {assignment.dueDate || assignment.dueAt ? new Date(assignment.dueDate || assignment.dueAt).toLocaleDateString() : "No due date"}</small>
              </div>
              <Tag tone={dueDateTone(assignment.dueDate || assignment.dueAt) === "overdue" ? "red" : dueDateTone(assignment.dueDate || assignment.dueAt) === "soon" ? "gold" : "green"}>
                {dueDateLabel(assignment.dueDate || assignment.dueAt)}
              </Tag>
              <span>{assignment.submitted}/{assignment.total} submitted</span>
              <span>{assignment.averageScore}% average</span>
              <button
                className="secondary-action compact-action"
                type="button"
                onClick={() => openResults(assignment)}
                data-sound-click="tab"
              >
                View results
              </button>
              <button className="secondary-action compact-action" type="button" onClick={() => exportResults(assignment)} data-sound-click="submit">Export CSV</button>
            </article>
          ))}
        </div>
      </Card>
      <ResultsModal
        assignment={selectedAssignmentResult}
        liveResults={selectedAssignmentLiveResults}
        currentUser={currentUser}
        label={usingDemoAssignments ? "Results preview" : "Assignment results"}
        onReviewSaved={() => {
          if (selectedAssignmentResult) openResults(selectedAssignmentResult);
        }}
        onClose={() => {
          setSelectedAssignmentResult(null);
          setSelectedAssignmentLiveResults(null);
          navigateTo?.(buildTeacherSectionHash("assignments"));
        }}
      />

      <Card className="teacher-book-assign-panel">
        <form onSubmit={createLiveAssignment}>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><BookOpen size={15} /> Assign from book</span>
            <h2>Ultimate B2 Unit 2</h2>
            <p>Select an exercise, classes, a due date, and optional worksheet links.</p>
          </div>
          <button className="primary-action" type="submit" disabled={savingAssignment} data-sound-click="submit">{savingAssignment ? "Assigning..." : "Assign selected exercise"}</button>
        </div>

        <div className="teacher-book-assign-grid">
          <label>
            Exercise/activity
            <select value={selectedActivityId} onChange={(event) => { setSelectedActivityId(event.target.value); setAssigned(""); }}>
              {activityOptions.length ? activityOptions.map((activity) => <option key={activity.id} value={activity.id}>{activity.label}</option>) : (
                <option value="">Loading activities...</option>
              )}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); setAssigned(""); }} />
          </label>
          <div className="teacher-checkbox-panel">
            <strong>Classes</strong>
            {classOptions.map((className) => (
              <label key={className}>
                <input type="checkbox" checked={selectedClasses.includes(className)} onChange={() => toggleListItem(className, selectedClasses, setSelectedClasses)} />
                <span>{className}</span>
              </label>
            ))}
            {!classOptions.length && <small>No live classes yet. Create a class first.</small>}
          </div>
          <label>
            Teacher notes
            <textarea value={teacherNotes} rows={4} placeholder="Focus on text evidence and submit by Friday." onChange={(event) => setTeacherNotes(event.target.value)} />
          </label>
          <label>
            Worksheet/link URLs
            <textarea value={worksheetLinks} rows={4} placeholder="One URL per line, or comma separated" onChange={(event) => setWorksheetLinks(event.target.value)} />
          </label>
        </div>
        {assigned && <div className="inline-status success">{assigned}</div>}
        </form>
      </Card>
    </section>
  );
}

export function TeacherCustomAssignment(props) {
  const steps = [
    ["1", "Choose source", "Pick a book, unit, or component before editing."],
    ["2", "Choose activity", "Select the interactive activity type."],
    ["3", "Edit content", "Update prompts, answers, and feedback."],
    ["4", "Preview and assign", "Check the student view before assigning."],
  ];

  return (
    <section className="teacher-section-stack teacher-custom-section">
      <SectionTitle
        eyebrow="Custom Assignment"
        title="Create or edit custom interactive activities."
        text="The existing course editor remains available here for custom assignments, previews, and activity authoring."
      />
      <div className="custom-assignment-workspace">
        <aside className="custom-assignment-steps" aria-label="Custom assignment steps">
          {steps.map(([number, title, text]) => (
            <article key={title}>
              <b>{number}</b>
              <strong>{title}</strong>
              <span>{text}</span>
            </article>
          ))}
        </aside>
        <div className="embedded-teacher-editor">
          <TeacherCourseEditor {...props} />
        </div>
      </div>
    </section>
  );
}

