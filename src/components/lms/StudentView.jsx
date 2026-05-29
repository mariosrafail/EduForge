import { useState } from "react";
import { Bell, BookOpen, CheckCircle2, Clock3, FileCheck2, Headphones, KeyRound, LockKeyhole, MessageSquare, PenLine, Play, RotateCcw, Send } from "lucide-react";
import { bookUnits, fullTestSections, skillStats, studentExercises } from "../../data/lmsDemoData.js";
import { AssignedActivity } from "./AssignedActivity.jsx";
import { Card, Progress, SectionTitle, Tag } from "./Shared.jsx";

export function StudentView({ brand, activityDemo, activityActions }) {
  const [submitted, setSubmitted] = useState(false);
  const [attemptRequested, setAttemptRequested] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [testStarted, setTestStarted] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [bookUnlocked, setBookUnlocked] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [activeSection, setActiveSection] = useState(fullTestSections[0].title);
  const activeTestSection = fullTestSections.find((section) => section.title === activeSection);

  return (
    <div className="workspace student-workspace">
      <SectionTitle
        eyebrow="Student portal"
        title={`Welcome back to ${brand.schoolName}.`}
        text="Students enter a Hamilton House demo learning area with digital book access, assigned book exercises, notifications, correction feedback, and recommended extra practice."
      />

      <section className="student-grid">
        <Card className="student-home-card">
          <div className="student-brand-band" style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }}>
            <span>{brand.logo}</span>
            <div><strong>{brand.schoolName}</strong><small>Student portal</small></div>
          </div>
          <div className="notification-stack">
            <div><Bell size={18} /><strong>New assignment</strong><span>Unit 2 Reading: Text comprehension is due today.</span></div>
            <div><LockKeyhole size={18} /><strong>Attempts controlled</strong><span>Teacher can unlock more attempts.</span></div>
            <div><MessageSquare size={18} /><strong>Feedback mode</strong><span>Corrections show revision guidance, not direct answers.</span></div>
          </div>
        </Card>

        <Card>
          <span className="eyebrow">Assigned exercises</span>
          <h2>Today</h2>
          <div className="exercise-list">
            {studentExercises.map((exercise) => (
              <article key={exercise.title}>
                <div>
                  <strong>{exercise.title}</strong>
                  <span>{exercise.skill} / {exercise.attempts}</span>
                </div>
                <Tag tone={exercise.status === "New" ? "green" : exercise.status === "Due today" ? "gold" : "blue"}>{exercise.status}</Tag>
              </article>
            ))}
          </div>
        </Card>
      </section>

      <Card className="activation-panel">
        <div>
          <span className="eyebrow"><KeyRound size={15} /> Book activation code</span>
          <h2>Unlock publisher content</h2>
          <p>Printed book activation code connects the student account to the matching Ultimate B2 digital book, units, and assignments.</p>
        </div>
        <div className="activation-form">
          <input value={activationCode} placeholder="ULT-B2-DEMO-2026" onChange={(event) => setActivationCode(event.target.value)} />
          <button className="primary-action" onClick={() => setBookUnlocked(true)}>Activate book</button>
        </div>
        {bookUnlocked && <div className="inline-status success">Ultimate B2 Students Book unlocked. Unit 2 test and practice content are now available.</div>}
      </Card>

      <AssignedActivity
        activities={activityDemo.activities}
        assignments={activityDemo.assignments}
        submissions={activityDemo.submissions}
        onSubmit={activityActions.submitAssignment}
      />

      <Card className="full-test-demo priority-panel">
        <div className="test-overview">
          <div>
            <span className="eyebrow"><FileCheck2 size={15} /> Full Test Demo</span>
            <h2>Ultimate B2: Unit 2 progress test</h2>
            <p>One controlled assessment experience combining reading, listening, grammar, vocabulary, and writing. Feedback shows mistakes and revision guidance only.</p>
          </div>
          <div className="test-meta">
            <div><strong>Attempt limit</strong><span>1 of 2 attempts used</span></div>
            <div><strong>Timer</strong><span><Clock3 size={15} /> 70:00 placeholder</span></div>
            <div><strong>Correction</strong><span>Automatic summary after submit</span></div>
          </div>
        </div>

        <div className="test-actions">
          <button className="primary-action" onClick={() => { setTestStarted(true); setTestSubmitted(false); }}><Play size={17} /> Start test</button>
          <button className="secondary-action" onClick={() => setTestSubmitted(true)}><Send size={17} /> Submit test</button>
          {testStarted && <span className="inline-status">Test opened in demo mode. Section navigation, timer, and attempt controls are active placeholders.</span>}
        </div>

        <div className="test-section-grid">
          {fullTestSections.map((section) => (
            <button
              key={section.title}
              className={`test-section-card ${activeSection === section.title ? "selected" : ""}`}
              onClick={() => setActiveSection(section.title)}
            >
              <strong>{section.title}</strong>
              <span>{section.prompt}</span>
              <small>{section.duration} / {section.status}</small>
            </button>
          ))}
        </div>

        <div className="test-workbench">
          <div>
            <Tag tone={activeTestSection.status === "Ready" ? "blue" : activeTestSection.status === "Audio locked" ? "gold" : "violet"}>{activeTestSection.status}</Tag>
            <h3>{activeTestSection.title}</h3>
            <p>{activeTestSection.prompt}</p>
            {activeSection === "Listening" && (
              <div className="audio-placeholder">
                <Headphones size={18} />
                <span>{audioPlayed ? "Listening sample marked as played" : "Listening audio placeholder"}</span>
                <button onClick={() => setAudioPlayed(true)}>Play 00:38</button>
              </div>
            )}
          </div>
          <div className="demo-answer-box">
            <label>
              Student response draft
              <textarea defaultValue="I found the main idea and added my evidence, but I need to check the tense in my short answer." />
            </label>
            <button className="secondary-action compact-action" onClick={() => setTestStarted(true)}><CheckCircle2 size={16} /> Save progress</button>
          </div>
        </div>

        {testSubmitted && (
          <div className="correction-summary">
            <div>
              <strong>Automatic correction summary</strong>
              <span>Estimated score: 76% / correct answers remain hidden</span>
            </div>
            <div className="revision-grid">
              {fullTestSections.map((section) => (
                <article key={section.title}>
                  <b>{section.title}</b>
                  <p>{section.mistake}</p>
                  <small>{section.revision}</small>
                </article>
              ))}
            </div>
          </div>
        )}
      </Card>

      <section className="student-grid lower">
        <Card>
          <span className="eyebrow"><BookOpen size={15} /> Digital book access</span>
          <h2>Ultimate B2 Students Book</h2>
          <div className="unit-list">
            {bookUnits.map((unit) => (
              <article key={unit.unit}>
                <strong>{unit.unit}: {unit.title}</strong>
                {unit.lessons.map((lesson) => <span key={lesson}>{lesson}</span>)}
              </article>
            ))}
          </div>
        </Card>

        <Card className="exercise-solver priority-panel">
          <div className="card-heading">
            <div><span className="eyebrow">Solve assigned book exercise</span><h2>Unit 2 Reading: Text comprehension</h2></div>
            <Tag tone="gold">Attempt 1/2</Tag>
          </div>
          <div className="reading-passage">
            <strong>Reading text</strong>
            <p>The Unit 2 article explains how careful readers use evidence, context, and reference words before choosing an answer.</p>
          </div>
          <div className="question-set">
            <label className="is-muted"><input type="radio" name="reading" /> Readers should choose answers from memory.</label>
            <label><input type="radio" name="reading" defaultChecked /> Readers should find evidence in the text.</label>
            <label className={submitted ? "is-mistake" : ""}><input type="text" defaultValue="The article has explained the strategy yesterday." /> Short answer</label>
            <label><textarea defaultValue="I think the text shows that evidence is more reliable than guessing." /> Writing note</label>
          </div>
          <div className="audio-placeholder">
            <Headphones size={18} />
            <span>{audioPlayed ? "Listening sample marked as played" : "Listening audio placeholder"}</span>
            <button onClick={() => setAudioPlayed(true)}>00:38</button>
          </div>
          <button className="primary-action" onClick={() => setSubmitted(true)}><CheckCircle2 size={18} /> Submit for automatic correction</button>

          {submitted && (
            <div className="feedback-reveal">
              <strong>Score: 74%</strong>
              <p>Your short answer has a tense problem. Revise Unit 2 Grammar: Opening exercise and reread the paragraph about text evidence.</p>
              <div className="feedback-tags">
                <Tag tone="gold">Mistake highlighted</Tag>
                <Tag tone="violet">Correct answer locked</Tag>
              </div>
              <button className="secondary-action compact-action" onClick={() => setAttemptRequested(true)}><RotateCcw size={16} /> Request another attempt</button>
              {attemptRequested && <div className="inline-status">Request sent. The teacher can unlock another attempt after revision.</div>}
              <small><RotateCcw size={14} /> Teacher can unlock more attempts after revision.</small>
            </div>
          )}
        </Card>

        <Card>
          <span className="eyebrow">Progress by skill</span>
          <h2>Recommended practice</h2>
          <div className="skill-panel">
            {skillStats.map((skill) => (
              <div key={skill.label}>
                <div><strong>{skill.label}</strong><span>{skill.value}%</span></div>
                <Progress value={skill.value} color={skill.accent} />
              </div>
            ))}
          </div>
          <div className="practice-box">
            <PenLine size={20} />
            <div>
              <strong>Extra practice recommended</strong>
              <span>Ultimate B2 Grammar Book: Unit 2 Exercise 4, then Listening Workbook page 20.</span>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
