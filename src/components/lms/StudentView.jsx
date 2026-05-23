import { useState } from "react";
import { Bell, BookOpen, CheckCircle2, Headphones, LockKeyhole, MessageSquare, PenLine, RotateCcw } from "lucide-react";
import { bookUnits, skillStats, studentExercises } from "../../data/lmsDemoData.js";
import { Card, Progress, SectionTitle, Tag } from "./Shared.jsx";

export function StudentView({ brand }) {
  const [submitted, setSubmitted] = useState(false);
  const [attemptRequested, setAttemptRequested] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);

  return (
    <div className="workspace student-workspace">
      <SectionTitle
        eyebrow="Student portal"
        title={`Welcome back to ${brand.schoolName}.`}
        text="Students enter a branded learning area with assigned activities, book units, notifications, correction feedback, and recommended extra practice."
      />

      <section className="student-grid">
        <Card className="student-home-card">
          <div className="student-brand-band" style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }}>
            <span>{brand.logo}</span>
            <div><strong>{brand.schoolName}</strong><small>Student portal</small></div>
          </div>
          <div className="notification-stack">
            <div><Bell size={18} /><strong>New assignment</strong><span>Unit 4 Reading Check is due today.</span></div>
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

      <section className="student-grid lower">
        <Card>
          <span className="eyebrow"><BookOpen size={15} /> Virtual English book</span>
          <h2>English Skills B1</h2>
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
            <div><span className="eyebrow">Solve demo exercise</span><h2>Unit 4 Reading Check</h2></div>
            <Tag tone="gold">Attempt 1/2</Tag>
          </div>
          <div className="reading-passage">
            <strong>Reading text</strong>
            <p>Last summer, Emma visited a small island where public transport was limited. She planned each route carefully and kept notes about local customs before each trip.</p>
          </div>
          <div className="question-set">
            <label className="is-muted"><input type="radio" name="reading" /> Emma avoided planning her routes.</label>
            <label><input type="radio" name="reading" defaultChecked /> Emma planned routes and noted local customs.</label>
            <label className={submitted ? "is-mistake" : ""}><input type="text" defaultValue="She has visited the island last summer." /> Short answer</label>
            <label><textarea defaultValue="I think the story shows that preparation makes travel easier." /> Writing note</label>
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
              <p>Your short answer has a tense problem. Revise: Past Simple vs Present Perfect. Review travel vocabulary and reread the paragraph about planning details.</p>
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
              <span>Grammar Booster: Past Simple vs Present Perfect, then Listening detail drill.</span>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
