import { ArrowLeft, BookOpen, CheckCircle2, ClipboardList, GraduationCap, Home, KeyRound, Play, Star, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { ultimateB2Package } from "../../../data/ultimateB2DemoData.js";
import { UltimateB2ActivityRunner } from "../activities/UltimateB2ActivityRunner.jsx";
import { BookPackageBrowser } from "../books/BookPackageBrowser.jsx";
import { Card, SectionTitle, Tag } from "../Shared.jsx";
import { PortalShell } from "../shared/PortalShell.jsx";
import {
  correctedExercise,
  studentAssignments,
  studentDashboardCards,
  studentGradeRows,
} from "./studentPortalData.js";

const sectionIcons = {
  books: BookOpen,
  assignments: ClipboardList,
  grades: Star,
};

const studentNavItems = [
  { id: "dashboard", label: "Dashboard", description: "Overview", icon: Home },
  { id: "books", label: "Books", description: "My digital books", icon: BookOpen },
  { id: "assignments", label: "Assignments", description: "Pending work", icon: ClipboardList },
  { id: "grades", label: "Grades", description: "Feedback", icon: Star },
];

const studentViewBySection = {
  dashboard: "student",
  books: "student-books",
  assignments: "student-assignments",
  grades: "student-grades",
  activity: "student-activity",
};

function StudentProfileStrip() {
  return (
    <Card className="student-profile-strip">
      <div>
        <span><UserRound size={19} /></span>
        <div>
          <strong>Anna Georgiou (Student)</strong>
          <small>Ultimate B2 A / Hamilton House demo</small>
        </div>
      </div>
      <Tag tone="green">B2 active</Tag>
    </Card>
  );
}

function StudentDashboard({ goToSection }) {
  return (
    <>
      <SectionTitle
        eyebrow="Student portal"
        title="Welcome back, Anna."
        text="Open your Ultimate B2 package, complete assigned exercises, and review corrected work from your teacher."
      />
      <StudentProfileStrip />
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

function StudentBooks({ openActivity, completedActivities }) {
  const [activationCode, setActivationCode] = useState("");
  const [activated, setActivated] = useState(false);

  return (
    <section className="student-section-stack">
      <SectionTitle
        eyebrow="My digital books"
        title="Ultimate B2 package."
        text="Activate your Hamilton House book code, open Unit 2, and start practice exercises."
      />

      <Card className="student-activation-card">
        <div>
          <span className="eyebrow"><KeyRound size={15} /> Book activation code</span>
          <h2>Activate your book</h2>
          <p>Your book activation code connects this student account to the Ultimate B2 package.</p>
        </div>
        <div className="activation-form">
          <input value={activationCode} placeholder={ultimateB2Package.activationCodeExample} onChange={(event) => setActivationCode(event.target.value)} />
          <button className="primary-action" type="button" onClick={() => setActivated(true)} data-sound-click="submit">Activate book</button>
        </div>
        {activated && <div className="inline-status success">Ultimate B2 package activated for Anna Georgiou (Student).</div>}
      </Card>
      <BookPackageBrowser mode="student" onStartExercise={(exercise) => openActivity(exercise, "books")} completedActivities={completedActivities} />
    </section>
  );
}

function StudentAssignments({ openActivity }) {
  const [selectedTitle, setSelectedTitle] = useState(studentAssignments[0].title);
  const selectedAssignment = studentAssignments.find((assignment) => assignment.title === selectedTitle) || studentAssignments[0];

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
          {studentAssignments.map((assignment) => (
            <button
              key={assignment.title}
              type="button"
              className={selectedTitle === assignment.title ? "selected" : ""}
              onClick={() => setSelectedTitle(assignment.title)}
              data-sound-click="tab"
            >
              <span>{assignment.title}</span>
              <small>{assignment.dueStatus}</small>
            </button>
          ))}
        </aside>

        <Card className="student-assignment-detail">
          <span className="eyebrow"><ClipboardList size={15} /> Assignment details</span>
          <h2>{selectedAssignment.title}</h2>
          <div className="student-detail-grid">
            <div><strong>Book/component</strong><span>{selectedAssignment.component}</span></div>
            <div><strong>Class</strong><span>{selectedAssignment.className}</span></div>
            <div><strong>Due status</strong><span>{selectedAssignment.dueStatus}</span></div>
            <div><strong>Estimated time</strong><span>{selectedAssignment.estimatedTime}</span></div>
            <div><strong>Completion</strong><span>{selectedAssignment.completionStatus}</span></div>
          </div>
          <button className="primary-action" type="button" onClick={() => openActivity(selectedAssignment, "assignments")} data-sound-click="submit">
            <Play size={17} /> Start exercise
          </button>
        </Card>
      </div>
    </section>
  );
}

function StudentGrades() {
  const [selectedResult, setSelectedResult] = useState(studentGradeRows[0].title);

  return (
    <section className="student-section-stack">
      <SectionTitle
        eyebrow="My grades"
        title="Scores, feedback, and corrected work."
        text="Review your latest results and teacher feedback for Ultimate B2 Unit 2."
      />

      <section className="student-grade-summary">
        <Card><strong>78%</strong><span>Overall average score</span></Card>
        <Card><strong>18/24</strong><span>Completed exercises</span></Card>
        <Card><strong>3</strong><span>Pending assignments</span></Card>
        <Card><strong>Revise text evidence in Reading Exercise 4.</strong><span>Latest teacher feedback</span></Card>
      </section>

      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><GraduationCap size={15} /> Results table</span>
            <h2>Corrected exercises</h2>
          </div>
        </div>
        <div className="student-grades-table">
          {studentGradeRows.map((row) => (
            <article key={row.title}>
              <strong>{row.title}</strong>
              <span>{row.component}</span>
              <span>{row.date}</span>
              <span>{row.score}</span>
              <Tag tone="green">{row.status}</Tag>
              <button className="secondary-action compact-action" type="button" onClick={() => setSelectedResult(row.title)} data-sound-click="tab">View feedback</button>
            </article>
          ))}
        </div>
      </Card>

      <Card className="student-corrected-work">
        <div className="card-heading">
          <div>
            <span className="eyebrow"><CheckCircle2 size={15} /> Corrected work</span>
            <h2>{selectedResult}</h2>
            <p>Sample corrected work for the Hamilton House demo. Replace with live submitted answers when backend results are connected.</p>
          </div>
          <Tag tone="gold">Review feedback</Tag>
        </div>
        <div className="student-answer-feedback">
          {correctedExercise.rows.map((row) => (
            <article key={row.question} className={row.correct ? "correct" : "wrong"}>
              <div>
                <strong>{row.question}</strong>
                <span>Student answer: {row.studentAnswer}</span>
                <small>Correct answer: {row.correctAnswer}</small>
                <p>{row.feedback}</p>
              </div>
              <b>{row.correct ? "Correct" : "Wrong"}</b>
            </article>
          ))}
        </div>
        <div className="student-writing-feedback">
          <strong>{correctedExercise.writing.prompt}</strong>
          <p>Student answer: {correctedExercise.writing.studentAnswer}</p>
          <p>Teacher comment: {correctedExercise.writing.teacherComment}</p>
          <p>Suggested improvement: {correctedExercise.writing.suggestedImprovement}</p>
          <Tag tone="blue">Final score {correctedExercise.writing.finalScore}</Tag>
        </div>
      </Card>
    </section>
  );
}

function StudentActivitySection({ activeExercise, completedActivities, setCompletedActivities, previousSection, goToSection }) {
  const exercise = activeExercise || { title: "Unit 2 Reading: Exercise 3", demoActivityKey: "reading-ex3" };
  return (
    <section className="student-section-stack">
      <div className="student-activity-return">
        <button className="secondary-action compact-action" type="button" onClick={() => goToSection("dashboard")} data-sound-click="back">
          <ArrowLeft size={17} /> Student dashboard
        </button>
        <Tag tone="gold">{exercise.title}</Tag>
        {completedActivities[exercise.demoActivityKey] && <Tag tone="green">Submitted</Tag>}
      </div>
      <UltimateB2ActivityRunner
        activityKey={exercise.demoActivityKey}
        exerciseId={exercise.id}
        mode="student"
        onBack={() => goToSection(previousSection || "books")}
        onSubmit={(result) => setCompletedActivities((current) => ({ ...current, [result.activityKey]: result }))}
      />
    </section>
  );
}

export function StudentPortal({
  initialSection = "dashboard",
  course,
  onSubmission,
  navigateTo,
  courseLoading = false,
  courseError = "",
  submitLesson,
}) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const [activeExercise, setActiveExercise] = useState(null);
  const [previousSection, setPreviousSection] = useState("books");
  const [completedActivities, setCompletedActivities] = useState({});

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const goToSection = (section) => {
    const nextView = studentViewBySection[section] || "student";
    if (navigateTo) {
      navigateTo(nextView);
      return;
    }
    setActiveSection(section);
  };

  const openActivity = (exercise, sourceSection = "books") => {
    setActiveExercise(exercise);
    setPreviousSection(sourceSection);
    goToSection("activity");
  };

  return (
    <div className="workspace student-portal-workspace">
      <PortalShell
        title="Student portal"
        profile="Anna Georgiou (Student)"
        subtitle="Ultimate B2 A"
        navItems={studentNavItems}
        activeItem={activeSection === "activity" ? previousSection : activeSection}
        onNavigate={goToSection}
        variant="student-portal-shell"
      >
        {activeSection === "dashboard" && <StudentDashboard goToSection={goToSection} />}
        {activeSection === "books" && <StudentBooks openActivity={openActivity} completedActivities={completedActivities} />}
        {activeSection === "assignments" && <StudentAssignments openActivity={openActivity} />}
        {activeSection === "grades" && <StudentGrades />}
        {activeSection === "activity" && (
          <StudentActivitySection
            activeExercise={activeExercise}
            completedActivities={completedActivities}
            setCompletedActivities={setCompletedActivities}
            previousSection={previousSection}
            goToSection={goToSection}
          />
        )}
      </PortalShell>
    </div>
  );
}
