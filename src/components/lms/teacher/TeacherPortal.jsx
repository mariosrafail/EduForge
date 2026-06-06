import { BookOpen, CheckCircle2, ClipboardList, Copy, Edit3, GraduationCap, Home, KeyRound, Link2, ListChecks, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { demoBookPackages, inferPackageSlugFromBookId, replaceDemoBookPackage } from "../../../data/bookPackages.js";
import { englishJourney6ComponentTitles } from "../../../data/englishJourney6DemoData.js";
import { findUltimateB2Exercise, ultimateB2ComponentTitles, ultimateB2Package } from "../../../data/ultimateB2DemoData.js";
import { useTeacherClasses } from "../../../hooks/useTeacherClasses.js";
import { getBookPackageTreeWithFallback } from "../../../services/bookContentApi.js";
import { createTeacherClass } from "../../../services/classApi.js";
import { buildActivityHash, buildBookHash, buildBookPageHash, buildClassInviteUrl } from "../../../utils/hashRoutes.js";
import { UltimateB2ActivityRunner } from "../activities/UltimateB2ActivityRunner.jsx";
import { BookPackageBrowser, BookSubpageNavigation, findBookComponentById } from "../books/BookPackageBrowser.jsx";
import { Card, Progress, SectionTitle, Tag } from "../Shared.jsx";
import { PortalShell } from "../shared/PortalShell.jsx";
import { TeacherCourseEditor } from "./TeacherCourseEditor.jsx";
import {
  sampleExerciseResult,
  teacherPortalAssignments,
  teacherPortalClasses,
  teacherPortalStudents,
} from "./teacherPortalData.js";

const teacherSections = [
  {
    id: "books",
    title: "Books",
    icon: BookOpen,
    description: "Browse activated Ultimate B2 books and assign exercises.",
    metric: "4 active components",
  },
  {
    id: "classes",
    title: "Classes",
    icon: GraduationCap,
    description: "Manage B2 class groups and view class progress.",
    metric: "3 B2 classes",
  },
  {
    id: "students",
    title: "Students",
    icon: Users,
    description: "Review student progress, answers, and results.",
    metric: "55 demo students",
  },
  {
    id: "assignments",
    title: "Assignments",
    icon: ClipboardList,
    description: "Track assigned book exercises and completion.",
    metric: "4 active assignments",
  },
  {
    id: "custom-assignment",
    title: "Custom Assignment",
    icon: Edit3,
    description: "Create or edit custom interactive activities.",
    metric: "Editor available",
  },
];

const teacherNavItems = [
  { id: "dashboard", label: "Dashboard", description: "Overview", icon: Home },
  { id: "books", label: "Books", description: "Digital book access", icon: BookOpen },
  { id: "classes", label: "Classes", description: "B2 groups", icon: GraduationCap },
  { id: "students", label: "Students", description: "Results", icon: Users },
  { id: "assignments", label: "Assignments", description: "Assigned exercises", icon: ClipboardList },
  { id: "custom-assignment", label: "Custom Assignment", description: "Activity editor", icon: Edit3 },
];

const classLevelOptions = ["A1", "A2", "B1", "B2", "C1", "C2"];
const classBookOptions = Array.from(new Set(["Ultimate B2", ...ultimateB2ComponentTitles, "English Journey 6", ...englishJourney6ComponentTitles]));

function CopyInviteLink({ classItem }) {
  const [copied, setCopied] = useState(false);
  const inviteUrl = buildClassInviteUrl(classItem);

  const copyInvite = async () => {
    try {
      await navigator.clipboard?.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setCopied(true);
    }
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="class-invite-link">
      <Link2 size={15} />
      <code>{inviteUrl}</code>
      <button className="secondary-action compact-action" type="button" onClick={copyInvite} data-sound-click="tab">
        <Copy size={15} /> {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}

function dueDateTone(dueDate) {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "neutral";
  const now = new Date("2026-05-31T12:00:00");
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 2) return "soon";
  return "normal";
}

function dueDateLabel(dueDate) {
  const tone = dueDateTone(dueDate);
  if (tone === "overdue") return "Overdue";
  if (tone === "soon") return "Due soon";
  return "On track";
}

const teacherViewBySection = {
  dashboard: "teacher",
  books: "teacher-books",
  classes: "teacher-classes",
  students: "teacher-students",
  assignments: "teacher-assignments",
  "custom-assignment": "teacher-custom-assignment",
};

function TeacherDashboard({ goToSection }) {
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

function BookPackageSelector({ bookPackages, selectedPackageSlug, onSelectPackage }) {
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
          const packageSlug = bookPackage.slug || bookPackage.id;
          return (
            <button
              key={packageSlug}
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

function TeacherBooks({ bookPackages = demoBookPackages, selectedPackageSlug = "ultimate-b2", onSelectPackage, bookSourceMessage, selectedBookId = null, selectedPageUnitId = null, selectedPageId = null, onSelectBook, onSelectBookPage, initialPreviewActivityKey = null, navigateTo, classOptions = [] }) {
  const [activationCode, setActivationCode] = useState("");
  const [activated, setActivated] = useState(false);
  const [previewExercise, setPreviewExercise] = useState(null);
  const bookPackage = bookPackages.find((item) => (item.slug || item.id) === selectedPackageSlug) || bookPackages[0] || ultimateB2Package;

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
        selectedPageUnitId={selectedPageUnitId}
        selectedPageId={selectedPageId}
        onSelectComponent={onSelectBook}
        onSelectBookPage={onSelectBookPage}
        onBackToBooks={() => onSelectBook?.(null)}
        onPreviewExercise={previewActivity}
      />
    </section>
  );
}

function TeacherClasses({ currentUser = null, bookPackage = null, classes = [], loadingClasses = false, usingDemoClasses = false, onClassCreated }) {
  const [selectedClassSlug, setSelectedClassSlug] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [newClassLevel, setNewClassLevel] = useState("B2");
  const [newClassBook, setNewClassBook] = useState("Ultimate B2");
  const [classNameError, setClassNameError] = useState("");
  const [classSaveError, setClassSaveError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [savingClass, setSavingClass] = useState(false);
  const [selectedWorkStudent, setSelectedWorkStudent] = useState(null);
  const selectedClass = classes.find((classItem) => classItem.slug === selectedClassSlug) || classes[0];
  const students = teacherPortalStudents.filter((student) => student.className === selectedClass?.name);

  useEffect(() => {
    setSelectedClassSlug((currentSlug) => {
      if (classes.some((classItem) => classItem.slug === currentSlug)) return currentSlug;
      return classes[0]?.slug || "";
    });
  }, [classes]);

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
                <CopyInviteLink classItem={classItem} />
              </div>
              <div className="teacher-class-progress">
                <span>Progress</span>
                <Progress value={classItem.completion} color="linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))" />
              </div>
              <b>{classItem.completion}%</b>
              <button className="secondary-action compact-action" type="button" onClick={() => setSelectedClassSlug(classItem.slug)} data-sound-click="tab">View students</button>
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
        {!selectedClass ? (
          <div className="teacher-empty-class-state">
            <p>Create a class or select one from the list to view students.</p>
          </div>
        ) : students.length > 0 ? (
          <div className="teacher-student-table compact">
            {students.map((student) => (
              <article key={student.name}>
                <strong>{student.name}</strong>
                <span>{student.completion}% complete</span>
                <span>{student.lastActivity}</span>
                <span>{student.averageScore}% average</span>
                <button className="secondary-action compact-action" type="button" onClick={() => setSelectedWorkStudent(student)} data-sound-click="tab">View work</button>
              </article>
            ))}
          </div>
        ) : (
          <div className="teacher-empty-class-state">
            <p>No students have joined this class yet. Copy the invite link and share it with students.</p>
            {selectedClass && <CopyInviteLink classItem={selectedClass} />}
          </div>
        )}
      </Card>
      <ResultsModal student={selectedWorkStudent} label="Selected student work" onClose={() => setSelectedWorkStudent(null)} />
    </section>
  );
}

function ResultsModal({ student, assignment, label = "Student results", onClose }) {
  useEffect(() => {
    if (!student && !assignment) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [assignment, onClose, student]);

  if (!student && !assignment) return null;

  const title = assignment?.title || student?.name;
  const summary = assignment
    ? `${assignment.className} / ${assignment.submitted}/${assignment.total} submitted / ${assignment.averageScore}% average`
    : `${sampleExerciseResult.exercise} / Score ${sampleExerciseResult.score}`;
  const tag = assignment ? "Mock results" : student.className;

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

        {assignment ? (
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

function TeacherStudents({ classOptions = [] }) {
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("All classes");
  const [selectedStudentResult, setSelectedStudentResult] = useState(null);

  const visibleStudents = useMemo(() => {
    return teacherPortalStudents.filter((student) => {
      const matchesQuery = student.name.toLowerCase().includes(query.toLowerCase());
      const matchesClass = classFilter === "All classes" || student.className === classFilter;
      return matchesQuery && matchesClass;
    });
  }, [classFilter, query]);
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
              {classOptions.map((className) => <option key={className}>{className}</option>)}
            </select>
          </label>
          <Tag tone="blue">Sort: average score</Tag>
        </div>

        <div className="teacher-student-table">
          {visibleStudents.map((student) => (
            <article key={student.name}>
              <strong>{student.name}</strong>
              <span>{student.className}</span>
              <span>{student.level}</span>
              <span>{student.completedExercises}</span>
              <span>{student.averageScore}%</span>
              <span>{student.latestWork}</span>
              <button className="secondary-action compact-action" type="button" onClick={() => setSelectedStudentResult(student)} data-sound-click="tab">View results</button>
            </article>
          ))}
        </div>
      </Card>

      <ResultsModal student={selectedStudentResult} onClose={() => setSelectedStudentResult(null)} />
    </section>
  );
}

function TeacherAssignments({ classOptions = [] }) {
  const [selectedExercises, setSelectedExercises] = useState(["Unit 2 Reading: Exercise 3"]);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [dueDate, setDueDate] = useState("2026-06-04");
  const [assigned, setAssigned] = useState(false);
  const [selectedAssignmentResult, setSelectedAssignmentResult] = useState(null);
  const exerciseOptions = [
    "Unit 2 Reading: Exercise 3",
    "Unit 2 Reading: Exercise 4",
    "Unit 2 Listening: Workbook page 20",
    "Unit 2 Grammar: Opening exercise",
    "Unit 2 Grammar: Exercise 4",
    "Quiz 1: Reading and Vocabulary",
    "Quiz 2: Timed test",
  ];

  const toggleListItem = (value, list, setter) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
    setAssigned(false);
  };

  useEffect(() => {
    setSelectedClasses((currentClasses) => {
      const validClasses = currentClasses.filter((className) => classOptions.includes(className));
      return validClasses.length ? validClasses : classOptions.slice(0, 1);
    });
  }, [classOptions]);

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
          <Tag tone="green">Grouped by class</Tag>
        </div>
        <div className="teacher-assignment-table">
          {teacherPortalAssignments.map((assignment) => (
            <article key={`${assignment.title}-${assignment.className}`}>
              <div>
                <strong>{assignment.title}</strong>
                <small>{assignment.component} / {assignment.className}</small>
                <small>Assigned {assignment.assignedDate} / Due {assignment.dueDate}</small>
              </div>
              <Tag tone={dueDateTone(assignment.dueDate) === "overdue" ? "red" : dueDateTone(assignment.dueDate) === "soon" ? "gold" : "green"}>
                {dueDateLabel(assignment.dueDate)}
              </Tag>
              <span>{assignment.submitted}/{assignment.total} submitted</span>
              <span>{assignment.averageScore}% average</span>
              <button className="secondary-action compact-action" type="button" onClick={() => setSelectedAssignmentResult(assignment)} data-sound-click="tab">View results</button>
            </article>
          ))}
        </div>
      </Card>
      <ResultsModal assignment={selectedAssignmentResult} label="Results preview" onClose={() => setSelectedAssignmentResult(null)} />

      <Card className="teacher-book-assign-panel">
        <div className="card-heading">
          <div>
            <span className="eyebrow"><BookOpen size={15} /> Assign from book</span>
            <h2>Ultimate B2 Unit 2</h2>
            <p>Select exercises and classes. This is mock UI for the demo workflow.</p>
          </div>
          <button className="primary-action" type="button" onClick={() => setAssigned(true)} data-sound-click="submit">Assign selected exercises</button>
        </div>

        <div className="teacher-book-assign-grid">
          <label>
            Book/component
            <select defaultValue="Ultimate B2 Students Book">
              {ultimateB2ComponentTitles.map((book) => <option key={book}>{book}</option>)}
            </select>
          </label>
          <label>
            Unit 2 lesson
            <select defaultValue="Reading">
              <option>Reading</option>
              <option>Listening</option>
              <option>Grammar</option>
              <option>Test</option>
            </select>
          </label>
          <div className="teacher-checkbox-panel">
            <strong>Exercises</strong>
            {exerciseOptions.map((exercise) => (
              <label key={exercise}>
                <input type="checkbox" checked={selectedExercises.includes(exercise)} onChange={() => toggleListItem(exercise, selectedExercises, setSelectedExercises)} />
                <span>{exercise}</span>
              </label>
            ))}
          </div>
          <div className="teacher-checkbox-panel">
            <strong>Classes</strong>
            {classOptions.map((className) => (
              <label key={className}>
                <input type="checkbox" checked={selectedClasses.includes(className)} onChange={() => toggleListItem(className, selectedClasses, setSelectedClasses)} />
                <span>{className}</span>
              </label>
            ))}
          </div>
          <label>
            Due date
            <input type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); setAssigned(false); }} />
          </label>
        </div>
        {assigned && <div className="inline-status success">Selected exercises assigned to {selectedClasses.join(", ")}. Due {new Date(`${dueDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.</div>}
      </Card>
    </section>
  );
}

function TeacherCustomAssignment(props) {
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

export function TeacherPortal({ initialSection = "dashboard", initialSelectedBookId = null, initialSelectedPageUnitId = null, initialSelectedPageId = null, initialPreviewActivityKey = null, currentUser = null, ...editorProps }) {
  const { navigateTo } = editorProps;
  const [activeSection, setActiveSection] = useState(initialSection);
  const [selectedBookId, setSelectedBookId] = useState(initialSelectedBookId);
  const [selectedPageUnitId, setSelectedPageUnitId] = useState(initialSelectedPageUnitId);
  const [selectedPageId, setSelectedPageId] = useState(initialSelectedPageId);
  const [bookPackages, setBookPackages] = useState(demoBookPackages);
  const [selectedPackageSlug, setSelectedPackageSlug] = useState("ultimate-b2");
  const [bookSourceMessage, setBookSourceMessage] = useState("");
  const {
    classes: teacherClasses,
    classOptions,
    loadingClasses,
    usingDemoClasses,
    addCreatedClass,
  } = useTeacherClasses(currentUser);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setSelectedBookId(initialSelectedBookId);
    setSelectedPageUnitId(initialSelectedPageUnitId);
    setSelectedPageId(initialSelectedPageId);
    setSelectedPackageSlug(inferPackageSlugFromBookId(initialSelectedBookId));
    if (initialSelectedBookId || initialPreviewActivityKey) setActiveSection("books");
  }, [initialPreviewActivityKey, initialSelectedBookId, initialSelectedPageId, initialSelectedPageUnitId]);

  useEffect(() => {
    let mounted = true;
    getBookPackageTreeWithFallback("ultimate-b2").then((packageTree) => {
      if (!mounted) return;
      setBookPackages((current) => replaceDemoBookPackage(current, packageTree));
      setBookSourceMessage(packageTree.source === "database" ? "Loaded from book content database." : "Using mock Ultimate B2 fallback.");
    });
    return () => {
      mounted = false;
    };
  }, []);

  const goToSection = (section) => {
    const nextView = teacherViewBySection[section] || "teacher";
    if (navigateTo) {
      navigateTo(nextView);
      return;
    }
    setActiveSection(section);
  };

  const selectBook = (bookId) => {
    setSelectedBookId(bookId);
    setSelectedPageUnitId(null);
    setSelectedPageId(null);
    setSelectedPackageSlug(inferPackageSlugFromBookId(bookId));
    if (navigateTo) {
      navigateTo(bookId ? buildBookHash("teacher", bookId) : "teacher-books");
    }
  };

  const selectPackage = (packageSlug) => {
    setSelectedPackageSlug(packageSlug);
    setSelectedBookId(null);
    setSelectedPageUnitId(null);
    setSelectedPageId(null);
    if (navigateTo) navigateTo("teacher-books");
  };

  const selectBookPage = (bookId, pageUnitId, pageId) => {
    setSelectedBookId(bookId);
    setSelectedPageUnitId(pageUnitId);
    setSelectedPageId(pageId);
    setSelectedPackageSlug(inferPackageSlugFromBookId(bookId));
    if (navigateTo) navigateTo(buildBookPageHash("teacher", bookId, pageUnitId, pageId));
  };

  return (
    <div className="workspace teacher-portal-workspace">
      <PortalShell
        title="Teacher portal"
        profile="Paris Georgoulakis (Teacher)"
        subtitle="Ultimate B2 workspace"
        navItems={teacherNavItems}
        activeItem={activeSection === "books" ? "books" : activeSection}
        onNavigate={goToSection}
        variant="teacher-portal-shell"
      >
        {activeSection === "dashboard" && <TeacherDashboard goToSection={goToSection} />}
        {activeSection === "books" && (
          <TeacherBooks
            bookPackages={bookPackages}
            selectedPackageSlug={selectedPackageSlug}
            onSelectPackage={selectPackage}
            bookSourceMessage={bookSourceMessage}
            selectedBookId={selectedBookId}
            selectedPageUnitId={selectedPageUnitId}
            selectedPageId={selectedPageId}
            onSelectBook={selectBook}
            onSelectBookPage={selectBookPage}
            initialPreviewActivityKey={initialPreviewActivityKey}
            navigateTo={navigateTo}
            classOptions={classOptions}
          />
        )}
        {activeSection === "classes" && (
          <TeacherClasses
            currentUser={currentUser}
            bookPackage={bookPackages.find((item) => (item.slug || item.id) === selectedPackageSlug) || bookPackages[0]}
            classes={teacherClasses}
            loadingClasses={loadingClasses}
            usingDemoClasses={usingDemoClasses}
            onClassCreated={addCreatedClass}
          />
        )}
        {activeSection === "students" && <TeacherStudents classOptions={classOptions} />}
        {activeSection === "assignments" && <TeacherAssignments classOptions={classOptions} />}
        {activeSection === "custom-assignment" && <TeacherCustomAssignment {...editorProps} />}
      </PortalShell>
    </div>
  );
}
