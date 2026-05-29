import { ArrowLeft, BookOpen, CheckCircle2, ClipboardList, Edit3, GraduationCap, KeyRound, ListChecks, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ultimateB2ComponentTitles, ultimateB2Package } from "../../../data/ultimateB2DemoData.js";
import { UltimateB2ActivityRunner } from "../activities/UltimateB2ActivityRunner.jsx";
import { BookPackageBrowser } from "../books/BookPackageBrowser.jsx";
import { Card, Progress, SectionTitle, Tag } from "../Shared.jsx";
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

const classNames = teacherPortalClasses.map((item) => item.name);

const teacherViewBySection = {
  dashboard: "teacher",
  books: "teacher-books",
  classes: "teacher-classes",
  students: "teacher-students",
  assignments: "teacher-assignments",
  "custom-assignment": "teacher-custom-assignment",
};

function TeacherPortalNav({ activeSection, goToSection }) {
  if (activeSection === "dashboard") return null;

  return (
    <div className="teacher-portal-nav">
      <button className="secondary-action compact-action" type="button" onClick={() => goToSection("dashboard")} data-sound-click="back">
        <ArrowLeft size={17} /> Teacher dashboard
      </button>
      <div className="teacher-section-tabs" aria-label="Teacher sections">
        {teacherSections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={activeSection === section.id ? "selected" : ""}
            onClick={() => goToSection(section.id)}
            data-sound-click="tab"
          >
            {section.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function TeacherDashboard({ goToSection }) {
  return (
    <>
      <SectionTitle
        eyebrow="Teacher portal"
        title="Ultimate B2 teaching workspace."
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

function TeacherBooks() {
  const [activationCode, setActivationCode] = useState("");
  const [activated, setActivated] = useState(false);
  const [previewExercise, setPreviewExercise] = useState(null);

  if (previewExercise) {
    return (
      <section className="teacher-section-stack">
        <UltimateB2ActivityRunner
          activityKey={previewExercise.demoActivityKey}
          exerciseId={previewExercise.id}
          mode="teacher-preview"
          onBack={() => setPreviewExercise(null)}
        />
      </section>
    );
  }

  return (
    <section className="teacher-section-stack">
      <SectionTitle
        eyebrow="Books"
        title="Digital book access for the Ultimate B2 package."
        text="Activate publisher book access, browse the B2 package, and assign Unit 2 exercises to class groups."
      />

      <Card className="teacher-activation-card">
        <div>
          <span className="eyebrow"><KeyRound size={15} /> Book activation code</span>
          <h2>Activate teacher book access</h2>
          <p>Use the demo code to unlock the Hamilton House Ultimate B2 package for this teacher portal.</p>
        </div>
        <div className="activation-form">
          <input value={activationCode} placeholder={ultimateB2Package.activationCodeExample} onChange={(event) => setActivationCode(event.target.value)} />
          <button className="primary-action" type="button" onClick={() => setActivated(true)} data-sound-click="submit">Activate book</button>
        </div>
        {activated && <div className="inline-status success">Ultimate B2 package activated for Paris Georgoulakis (Teacher).</div>}
      </Card>
      <BookPackageBrowser mode="teacher" classOptions={classNames} onPreviewExercise={setPreviewExercise} />
    </section>
  );
}

function TeacherClasses() {
  const [selectedClass, setSelectedClass] = useState(teacherPortalClasses[0].name);
  const students = teacherPortalStudents.filter((student) => student.className === selectedClass);

  return (
    <section className="teacher-section-stack">
      <SectionTitle
        eyebrow="Classes"
        title="B2 class progress."
        text="Review Ultimate B2 class groups, completion, and student work."
      />

      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Level B2</span>
            <h2>Ultimate B2 classes</h2>
          </div>
          <Tag tone="green">Class progress</Tag>
        </div>

        <div className="teacher-class-table">
          {teacherPortalClasses.map((classItem) => (
            <article key={classItem.name} className={selectedClass === classItem.name ? "selected" : ""}>
              <div>
                <strong>{classItem.name}</strong>
                <small>{classItem.teacher} / {classItem.students} students / assigned book: {classItem.assignedBook}</small>
              </div>
              <Progress value={classItem.completion} color="linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))" />
              <b>{classItem.completion}%</b>
              <button className="secondary-action compact-action" type="button" onClick={() => setSelectedClass(classItem.name)} data-sound-click="tab">View students</button>
            </article>
          ))}
        </div>
      </Card>

      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><Users size={15} /> {selectedClass}</span>
            <h2>Students</h2>
          </div>
        </div>
        <div className="teacher-student-table compact">
          {students.map((student) => (
            <article key={student.name}>
              <strong>{student.name}</strong>
              <span>{student.completion}% complete</span>
              <span>{student.lastActivity}</span>
              <span>{student.averageScore}% average</span>
              <button className="secondary-action compact-action" type="button" data-sound-click="tab">View work</button>
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
}

function ResultDetailPanel({ student }) {
  if (!student) return null;

  return (
    <Card className="teacher-result-panel">
      <div className="card-heading">
        <div>
          <span className="eyebrow"><CheckCircle2 size={15} /> Student results</span>
          <h2>{student.name}</h2>
          <p>{sampleExerciseResult.exercise} / Score {sampleExerciseResult.score}</p>
        </div>
        <Tag tone="gold">{student.className}</Tag>
      </div>

      <div className="answer-feedback-list">
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
    </Card>
  );
}

function TeacherStudents() {
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("All classes");
  const [selectedStudentName, setSelectedStudentName] = useState(teacherPortalStudents[0].name);

  const visibleStudents = useMemo(() => {
    return teacherPortalStudents.filter((student) => {
      const matchesQuery = student.name.toLowerCase().includes(query.toLowerCase());
      const matchesClass = classFilter === "All classes" || student.className === classFilter;
      return matchesQuery && matchesClass;
    });
  }, [classFilter, query]);
  const selectedStudent = teacherPortalStudents.find((student) => student.name === selectedStudentName) || visibleStudents[0];

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
              {classNames.map((className) => <option key={className}>{className}</option>)}
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
              <button className="secondary-action compact-action" type="button" onClick={() => setSelectedStudentName(student.name)} data-sound-click="tab">View results</button>
            </article>
          ))}
        </div>
      </Card>

      <ResultDetailPanel student={selectedStudent} />
    </section>
  );
}

function TeacherAssignments() {
  const [selectedExercises, setSelectedExercises] = useState(["Unit 2 Reading: Exercise 3"]);
  const [selectedClasses, setSelectedClasses] = useState(["Ultimate B2 A"]);
  const [assigned, setAssigned] = useState(false);
  const exerciseOptions = [
    "Unit 2 Reading: Exercise 3",
    "Unit 2 Reading: Exercise 4",
    "Unit 2 Listening: Workbook page 20",
    "Unit 2 Grammar: Opening exercise",
    "Unit 2 Grammar: Exercise 4",
    "Quiz 2: Timed test",
  ];

  const toggleListItem = (value, list, setter) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
    setAssigned(false);
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
          <Tag tone="green">Grouped by class</Tag>
        </div>
        <div className="teacher-assignment-table">
          {teacherPortalAssignments.map((assignment) => (
            <article key={`${assignment.title}-${assignment.className}`}>
              <div>
                <strong>{assignment.title}</strong>
                <small>{assignment.component} / {assignment.className} / assigned {assignment.assignedDate}</small>
              </div>
              <span>{assignment.submitted}/{assignment.total} submitted</span>
              <span>{assignment.averageScore}% average</span>
              <button className="secondary-action compact-action" type="button" data-sound-click="tab">View results</button>
            </article>
          ))}
        </div>
      </Card>

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
            {classNames.map((className) => (
              <label key={className}>
                <input type="checkbox" checked={selectedClasses.includes(className)} onChange={() => toggleListItem(className, selectedClasses, setSelectedClasses)} />
                <span>{className}</span>
              </label>
            ))}
          </div>
        </div>
        {assigned && <div className="inline-status success">Selected exercises assigned to {selectedClasses.join(", ")}.</div>}
      </Card>
    </section>
  );
}

function TeacherCustomAssignment(props) {
  return (
    <section className="teacher-section-stack teacher-custom-section">
      <SectionTitle
        eyebrow="Custom Assignment"
        title="Create or edit custom interactive activities."
        text="The existing course editor remains available here for custom assignments, previews, and activity authoring."
      />
      <div className="embedded-teacher-editor">
        <TeacherCourseEditor {...props} />
      </div>
    </section>
  );
}

export function TeacherPortal({ initialSection = "dashboard", ...editorProps }) {
  const { navigateTo } = editorProps;
  const [activeSection, setActiveSection] = useState(initialSection);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const goToSection = (section) => {
    const nextView = teacherViewBySection[section] || "teacher";
    if (navigateTo) {
      navigateTo(nextView);
      return;
    }
    setActiveSection(section);
  };

  return (
    <div className="workspace teacher-portal-workspace">
      <TeacherPortalNav activeSection={activeSection} goToSection={goToSection} />
      {activeSection === "dashboard" && <TeacherDashboard goToSection={goToSection} />}
      {activeSection === "books" && <TeacherBooks />}
      {activeSection === "classes" && <TeacherClasses />}
      {activeSection === "students" && <TeacherStudents />}
      {activeSection === "assignments" && <TeacherAssignments />}
      {activeSection === "custom-assignment" && <TeacherCustomAssignment {...editorProps} />}
    </div>
  );
}
