import { BookOpen, CheckCircle2, ClipboardList, GraduationCap, KeyRound, Play, UserRound } from "lucide-react";
import { useState } from "react";
import { demoBookPackages } from "../../../../data/bookPackages.js";
import { findUltimateB2Exercise, ultimateB2Package } from "../../../../data/ultimateB2DemoData.js";
import { buildCourseComponentsHash, buildCourseComponentSubviewHash } from "../../../../utils/hashRoutes.js";
import { UltimateB2ActivityRunner } from "../../activities/UltimateB2ActivityRunner.jsx";
import { BookPackageBrowser, BookSubpageNavigation, findBookComponentById } from "../../books/BookPackageBrowser.jsx";
import { Card, SectionTitle, Tag } from "../../Shared.jsx";
import { correctedExercise, studentAssignments, studentDashboardCards, studentGradeRows } from "../studentPortalData.js";
import { sectionIcons } from "./studentPortalConfig.js";

export function StudentProfileStrip() {
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

export function StudentDashboard({ goToSection }) {
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

export function StudentBooks({ openActivity, completedActivities, bookPackages = demoBookPackages, selectedPackageSlug = "ultimate-b2", selectedBookSubview = null, onSelectPackage, bookSourceMessage = "", selectedBookId = null, selectedPageUnitId = null, selectedPageId = null, selectedPageNumber = null, onSelectBook, onSelectBookPage, onSelectBookSubview }) {
  const [activationCode, setActivationCode] = useState("");
  const [activated, setActivated] = useState(false);
  const bookPackage = bookPackages.find((item) => (item.slug || item.id) === selectedPackageSlug) || bookPackages[0] || ultimateB2Package;
  const selectedComponent = findBookComponentById(bookPackage, selectedBookId);
  const hasSelectedPage = Boolean(selectedPageId || selectedPageNumber);

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

export function StudentAssignments({ openActivity }) {
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

export function StudentGrades() {
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

export function StudentActivitySection({ activeExercise, setActiveExercise, completedActivities, setCompletedActivities, previousSection, selectedPackageSlug, selectedBookId, goToSection, navigateTo }) {
  const exercise = activeExercise || { title: "Unit 2 Reading: Exercise 3", demoActivityKey: "reading-ex3" };
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
        onSubmit={(result) => setCompletedActivities((current) => ({ ...current, [result.activityKey]: result }))}
        navigateTo={navigateTo}
        onNextActivity={(activityKey) => {
          const next = findUltimateB2Exercise(activityKey);
          if (next?.exercise) {
            setActiveExercise(next.exercise);
            goToSection("activity");
          }
        }}
      />
    </section>
  );
}

