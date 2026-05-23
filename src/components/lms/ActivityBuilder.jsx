import { useMemo, useState } from "react";
import { CheckCircle2, Eye, Save, Send } from "lucide-react";
import { bookUnits, books, classes, demoStudents, skillStats } from "../../data/lmsDemoData.js";
import { activityTypes } from "../../services/activitiesApi.js";
import { ActivityPreview } from "./ActivityPreview.jsx";
import { Card, Tag } from "./Shared.jsx";

const baseActivity = {
  title: "Unit 4 Travel Collocations Check",
  type: "multiple_choice",
  skill: "Vocabulary",
  book_title: books[0],
  unit_title: `${bookUnits[0].unit}: ${bookUnits[0].title}`,
  feedbackWrong: "Review Unit 4 vocabulary and try again before the next attempt.",
  revision: "Revise the target skill. Correct answers remain locked.",
  question: "Choose the strongest collocation for a holiday plan.",
  options: ["make a journey", "do a journey", "take a decision", "go a plan"],
  correctIndex: "0",
  sentence: "Emma decided to ____ a journey across the island.",
  acceptedAnswer: "make",
  matchLeft: "book a ticket\nmiss a train\npack a suitcase",
  matchRight: "reserve travel\narrive too late\nprepare luggage",
  writingPrompt: "Write a short travel review using sequencing language.",
};

const baseAssignment = {
  targetType: "class",
  targetLabel: classes[0].name,
  dueDate: "2026-05-29",
  allowedAttempts: "2",
};

function lines(value) {
  return String(value).split("\n").map((item) => item.trim()).filter(Boolean);
}

function toActivity(form) {
  const common = {
    title: form.title,
    type: form.type,
    skill: form.skill,
    book_title: form.book_title,
    unit_title: form.unit_title,
    feedback: {
      wrong: form.feedbackWrong,
      revision: form.revision,
    },
  };

  if (form.type === "multiple_choice") {
    return {
      ...common,
      content: {
        question: form.question,
        options: form.options,
        correctIndex: Number(form.correctIndex),
      },
    };
  }

  if (form.type === "fill_blank") {
    return {
      ...common,
      content: {
        sentence: form.sentence,
        acceptedAnswers: [form.acceptedAnswer],
      },
    };
  }

  if (form.type === "matching") {
    const left = lines(form.matchLeft);
    const right = lines(form.matchRight);
    return {
      ...common,
      content: {
        prompt: form.question,
        pairs: left.map((item, index) => ({ left: item, right: right[index] || "" })),
      },
    };
  }

  return {
    ...common,
    content: {
      prompt: form.writingPrompt,
    },
  };
}

export function ActivityBuilder({ onCreateActivity, onCreateAssignment }) {
  const [form, setForm] = useState(baseActivity);
  const [assignment, setAssignment] = useState(baseAssignment);
  const [savedActivity, setSavedActivity] = useState(null);
  const [previewActivity, setPreviewActivity] = useState(null);
  const [status, setStatus] = useState("");

  const draftActivity = useMemo(() => toActivity(form), [form]);

  const updateOption = (index, value) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => optionIndex === index ? value : option),
    }));
  };

  const saveActivity = () => {
    const activity = onCreateActivity(draftActivity);
    setSavedActivity(activity);
    setPreviewActivity(activity);
    setStatus("Activity saved. It is ready to preview or assign.");
  };

  const previewAsStudent = () => {
    setPreviewActivity(savedActivity || draftActivity);
    setStatus("Student preview opened. Correct answers remain locked.");
  };

  const assignActivity = () => {
    const activity = savedActivity || onCreateActivity(draftActivity);
    setSavedActivity(activity);
    onCreateAssignment({
      activity_id: activity.id,
      target_type: assignment.targetType,
      target_label: assignment.targetLabel,
      due_date: assignment.dueDate,
      allowed_attempts: Number(assignment.allowedAttempts),
    });
    setStatus(`Published to ${assignment.targetLabel}. Student activity panel is ready.`);
  };

  return (
    <Card className="activity-authoring priority-panel">
      <div className="card-heading">
        <div>
          <span className="eyebrow"><CheckCircle2 size={15} /> Interactive Activity Builder</span>
          <h2>Interactive activity authoring</h2>
          <p>Create book-based practice for Multiple Choice, Fill in the blanks, Matching, or teacher-reviewed Writing tasks.</p>
        </div>
        <Tag tone={savedActivity ? "green" : "violet"}>{savedActivity ? "Saved activity" : "Draft activity"}</Tag>
      </div>

      <div className="activity-builder-layout">
        <div className="activity-author-fields">
          <label>
            Activity title
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label>
            Activity type
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {activityTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label>
            Book
            <select value={form.book_title} onChange={(event) => setForm({ ...form, book_title: event.target.value })}>
              {books.map((book) => <option key={book}>{book}</option>)}
            </select>
          </label>
          <label>
            Unit
            <select value={form.unit_title} onChange={(event) => setForm({ ...form, unit_title: event.target.value })}>
              {bookUnits.map((unit) => <option key={unit.unit}>{unit.unit}: {unit.title}</option>)}
            </select>
          </label>
          <label>
            Skill tag
            <select value={form.skill} onChange={(event) => setForm({ ...form, skill: event.target.value })}>
              {skillStats.map((skill) => <option key={skill.label}>{skill.label}</option>)}
            </select>
          </label>

          {form.type === "multiple_choice" && (
            <>
              <label className="wide-field">
                Question
                <input value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} />
              </label>
              {form.options.map((option, index) => (
                <label key={index}>
                  Option {index + 1}
                  <input value={option} onChange={(event) => updateOption(index, event.target.value)} />
                </label>
              ))}
              <label>
                Correct option
                <select value={form.correctIndex} onChange={(event) => setForm({ ...form, correctIndex: event.target.value })}>
                  {form.options.map((option, index) => <option key={index} value={index}>Option {index + 1}</option>)}
                </select>
              </label>
            </>
          )}

          {form.type === "fill_blank" && (
            <>
              <label className="wide-field">
                Sentence with blank
                <input value={form.sentence} onChange={(event) => setForm({ ...form, sentence: event.target.value })} />
              </label>
              <label>
                Accepted answer
                <input value={form.acceptedAnswer} onChange={(event) => setForm({ ...form, acceptedAnswer: event.target.value })} />
              </label>
            </>
          )}

          {form.type === "matching" && (
            <>
              <label className="wide-field">
                Prompt
                <input value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} />
              </label>
              <label>
                Left items
                <textarea value={form.matchLeft} onChange={(event) => setForm({ ...form, matchLeft: event.target.value })} />
              </label>
              <label>
                Right items
                <textarea value={form.matchRight} onChange={(event) => setForm({ ...form, matchRight: event.target.value })} />
              </label>
            </>
          )}

          {form.type === "writing" && (
            <label className="wide-field">
              Writing prompt
              <textarea value={form.writingPrompt} onChange={(event) => setForm({ ...form, writingPrompt: event.target.value })} />
            </label>
          )}

          <label>
            Feedback when wrong
            <input value={form.feedbackWrong} onChange={(event) => setForm({ ...form, feedbackWrong: event.target.value })} />
          </label>
          <label>
            Revision guidance
            <input value={form.revision} onChange={(event) => setForm({ ...form, revision: event.target.value })} />
          </label>
        </div>

        <div className="activity-assignment-box">
          <h3>Assign to class or student</h3>
          <label>
            Target type
            <select value={assignment.targetType} onChange={(event) => setAssignment({ ...assignment, targetType: event.target.value, targetLabel: event.target.value === "class" ? classes[0].name : demoStudents[0] })}>
              <option value="class">Class</option>
              <option value="student">Individual student</option>
            </select>
          </label>
          <label>
            Target
            <select value={assignment.targetLabel} onChange={(event) => setAssignment({ ...assignment, targetLabel: event.target.value })}>
              {(assignment.targetType === "class" ? classes.map((item) => item.name) : demoStudents).map((target) => <option key={target}>{target}</option>)}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={assignment.dueDate} onChange={(event) => setAssignment({ ...assignment, dueDate: event.target.value })} />
          </label>
          <label>
            Allowed attempts
            <select value={assignment.allowedAttempts} onChange={(event) => setAssignment({ ...assignment, allowedAttempts: event.target.value })}>
              <option>1</option>
              <option>2</option>
              <option>3</option>
            </select>
          </label>
          <div className="activity-action-row">
            <button className="secondary-action" onClick={saveActivity}><Save size={17} /> Save activity</button>
            <button className="secondary-action" onClick={previewAsStudent}><Eye size={17} /> Preview as student</button>
            <button className="primary-action" onClick={assignActivity}><Send size={17} /> Assign activity</button>
          </div>
          {status && <div className="inline-status success">{status}</div>}
          <ActivityPreview activity={previewActivity} />
        </div>
      </div>
    </Card>
  );
}
