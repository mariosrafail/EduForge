import { useState } from "react";
import { ClipboardList, Eye, Save, Send, Users } from "lucide-react";
import { Card, MetricCard, SectionTitle, Tag } from "../Shared.jsx";
import { useSoundEffects } from "../../../context/SoundContext.jsx";
import { ActivityEditor } from "./ActivityEditor.jsx";
import { ActivityPreviewPanel } from "./ActivityPreviewPanel.jsx";
import { ActivityTabs } from "./ActivityTabs.jsx";
import { LessonEditor } from "./LessonEditor.jsx";
import { StudentPreviewPanel } from "./StudentPreviewPanel.jsx";
import { TeacherEditorHelp } from "./TeacherEditorHelp.jsx";

function normalizeFeedback(feedback = {}, fallbackRevision = "") {
  return {
    correct: feedback.correct || "Good job. You chose the correct answer.",
    wrong: feedback.wrong || "Review the item and try again.",
    revision: feedback.revision || feedback.revisionGuidance || fallbackRevision || "Review the activity before trying again.",
  };
}

function activityToApiPatch(activity, index) {
  if (activity.type === "gap-fill") {
    const rows = activity.items.map((item) => ({
      prompt: item.prompt || item.prefix || "",
      answer: String(item.answer || "").trim(),
    }));
    const answers = rows.map((row) => row.answer);
    const wordBank = Array.from(new Set(answers.filter(Boolean)));

    return {
      type: "gap_fill",
      title: activity.title,
      instructions: activity.instruction,
      skill: activity.skill,
      position: index + 1,
      content: {
        wordBank,
        prompts: rows.map((row) => row.prompt),
      },
      correct_answers: { answers },
      feedback: normalizeFeedback(activity.feedback, "Review the weekday order before trying again."),
    };
  }

  if (activity.type === "line-matching") {
    return {
      type: "line_matching",
      title: activity.title,
      instructions: activity.instruction,
      skill: activity.skill,
      position: index + 1,
      content: {
        leftItems: activity.leftItems,
        rightItems: activity.rightItems,
      },
      correct_answers: activity.correctPairs,
      feedback: normalizeFeedback(activity.feedback, activity.revisionGuidance || "Review the seasons and their months before trying again."),
    };
  }

  if (activity.type === "multiple-choice") {
    return {
      type: "multiple_choice",
      title: activity.title,
      instructions: activity.instruction,
      skill: activity.skill,
      position: index + 1,
      content: {
        questions: activity.questions.map(({ id, prompt, options }) => ({ id, prompt, options })),
      },
      correct_answers: Object.fromEntries(activity.questions.map((question) => [question.id, question.answer])),
      feedback: normalizeFeedback(activity.feedback, "Review the vocabulary before trying again."),
    };
  }

  return activity;
}

function activityGuidance(type) {
  if (type === "gap-fill") {
    return "Edit the word bank, gap prompts, and accepted answers. Keep one accepted answer per gap for this demo.";
  }
  if (type === "line-matching") {
    return "Edit the left and right boxes, then set which pairs are correct.";
  }
  if (type === "multiple-choice") {
    return "Edit the question, answer options, and the correct option. Students will see the selected option as a full answer card.";
  }
  return "Edit the activity content and save when you are ready.";
}

export function TeacherCourseEditor({
  course,
  onCourseChange,
  navigateTo,
  courseLoading = false,
  courseError = "",
  saveCourse,
  saveLesson,
  saveActivity,
  reloadCourse,
}) {
  const { playSound } = useSoundEffects();
  const [saved, setSaved] = useState(false);
  const [assigned, setAssigned] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showActivityPreview, setShowActivityPreview] = useState(false);
  const [selectedActivityIndex, setSelectedActivityIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activitySaved, setActivitySaved] = useState(false);
  const selectedActivity = course.lesson.activities[selectedActivityIndex] || course.lesson.activities[0];

  const moveActivity = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= course.lesson.activities.length) return;
    const activities = [...course.lesson.activities];
    const [item] = activities.splice(index, 1);
    activities.splice(nextIndex, 0, item);
    onCourseChange({ ...course, lesson: { ...course.lesson, activities } });
  };

  const saveSelectedActivity = async () => {
    if (!selectedActivity) return;
    playSound("submit");
    setSaving(true);
    setActivitySaved(false);
    setSaveError("");
    try {
      await saveActivity?.(selectedActivity.id, activityToApiPatch(selectedActivity, selectedActivityIndex));
      await reloadCourse?.();
      setActivitySaved(true);
      window.setTimeout(() => setActivitySaved(false), 2600);
    } catch (error) {
      setSaveError("Activity save failed. Local demo changes remain visible in this session.");
    } finally {
      setSaving(false);
    }
  };

  const saveChanges = async () => {
    playSound("submit");
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      await saveCourse?.({
        title: course.title,
        subtitle: course.subtitle,
        level: course.level,
        book_code: course.book_code || course.bookCode,
      });
      await saveLesson?.(course.lesson.id, {
        title: course.lesson.title,
        subtitle: course.lesson.subtitle || course.lesson.unit,
        instructions: course.lesson.instructions,
        status: course.lesson.status === "Assigned" ? "published" : course.lesson.status || "published",
      });
      await Promise.all(course.lesson.activities.map((activity, index) => saveActivity?.(activity.id, activityToApiPatch(activity, index))));
      await reloadCourse?.();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      setSaveError("Database save failed. Local demo changes remain visible in this session.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="workspace editor-workspace">
      <SectionTitle
        eyebrow="Teacher course editor"
        title="Edit the digital book lesson, preview it, and assign it."
        text={`${course.title} / ${course.lesson.title}. The editor is intentionally focused on lesson content and interactive activities.`}
        action={(
          <div className="editor-action-row">
            <button className="secondary-action" onClick={() => setShowPreview(!showPreview)}>
              <Eye size={17} /> {showPreview ? "Hide preview" : "Preview here"}
            </button>
            <button className="secondary-action" onClick={() => navigateTo("student-preview")}>
              <Eye size={17} /> Open student preview
            </button>
            <button className="primary-action" data-sound-ignore="true" onClick={saveChanges} disabled={saving}>
              <Save size={17} /> {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        )}
      />

      {courseError && <div className="inline-status warning">{courseError}</div>}
      {courseLoading && <div className="inline-status">Loading course content...</div>}
      {saveError && <div className="inline-status warning">{saveError}</div>}

      <section className="metric-grid four">
        <MetricCard label="Course" value="B1" note={course.title} icon={ClipboardList} />
        <MetricCard label="Activities" value={course.lesson.activities.length} note="editable ELT tasks" icon={Save} delay={1} />
        <MetricCard label="Assigned class" value="21" note={course.className} icon={Users} delay={2} />
        <MetricCard label="Submissions" value="2/3" note="demo summary" icon={Send} delay={3} />
      </section>

      {(saved || assigned) && (
        <div className={`inline-status ${assigned ? "success" : ""}`}>
          {assigned ? `${course.lesson.title} assigned to ${course.className}.` : "Saved to course database. Student view updated."}
        </div>
      )}
      {activitySaved && <div className="inline-status success">Activity saved. Student view updated.</div>}

      <div className="teacher-editor-layout">
        <main className="teacher-editor-main">
          <Card className="course-editor-card priority-panel">
            <LessonEditor course={course} onChange={onCourseChange} />
          </Card>

          <TeacherEditorHelp />

          <Card className="course-editor-card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">Activities</span>
                <h2>Build the lesson practice</h2>
                <p>Edit instructions, questions, word bank options, matching pairs, and answer keys.</p>
              </div>
              <Tag tone="green">Live data</Tag>
            </div>

            <ActivityTabs
              activities={course.lesson.activities}
              selectedIndex={selectedActivityIndex}
              onSelect={(index) => {
                setSelectedActivityIndex(index);
                setShowActivityPreview(false);
              }}
            />

            {selectedActivity && (
              <div className="selected-activity-editor-layout">
                <ActivityEditor
                  key={selectedActivity.id}
                  course={course}
                  activity={selectedActivity}
                  index={selectedActivityIndex}
                  onChange={onCourseChange}
                  onMove={moveActivity}
                />
                <aside className="selected-activity-actions">
                  <div className="activity-guidance-box">
                    <strong>Teacher note</strong>
                    <p>{activityGuidance(selectedActivity.type)}</p>
                  </div>
                  <button className="primary-action" data-sound-ignore="true" onClick={saveSelectedActivity} disabled={saving}>
                    <Save size={17} /> {saving ? "Saving..." : "Save activity"}
                  </button>
                  <button className="secondary-action" data-sound-ignore="true" onClick={() => {
                    setShowActivityPreview(!showActivityPreview);
                  }}>
                    <Eye size={17} /> {showActivityPreview ? "Hide preview" : "Preview as student"}
                  </button>
                </aside>
              </div>
            )}
          </Card>

          {showActivityPreview && selectedActivity && (
            <ActivityPreviewPanel
              course={course}
              activity={selectedActivity}
              onClose={() => setShowActivityPreview(false)}
            />
          )}
        </main>

        <aside className="teacher-editor-side">
          <Card>
            <span className="eyebrow">Assignment</span>
            <h2>Assign lesson</h2>
            <p>Publish this lesson to the selected class with two attempts and automatic feedback.</p>
            <button className="primary-action compact-action" onClick={() => setAssigned(true)}>
              <Send size={17} /> Assign to {course.className}
            </button>
          </Card>

          <Card>
            <span className="eyebrow">Submissions</span>
            <h2>Student summary</h2>
            <div className="submission-list compact">
              {course.submissions.map((submission) => (
                <article key={submission.student}>
                  <strong>{submission.student}<span>{submission.score === null ? "-" : `${submission.score}%`}</span></strong>
                  <p>{submission.status} / attempt {submission.attempt}</p>
                  <Tag tone={submission.status === "Submitted" ? "green" : submission.status === "Needs review" ? "gold" : "blue"}>{submission.submittedAt}</Tag>
                </article>
              ))}
            </div>
          </Card>
        </aside>
      </div>

      {showPreview && <StudentPreviewPanel course={course} />}
    </div>
  );
}
