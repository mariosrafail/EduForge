import { useState } from "react";
import { ClipboardList, Eye, Save, Send, Users } from "lucide-react";
import { Card, MetricCard, SectionTitle, Tag } from "../Shared.jsx";
import { useSoundEffects } from "../../../context/SoundContext.jsx";
import { ActivityEditor } from "./ActivityEditor.jsx";
import { ActivityPreviewPanel } from "./ActivityPreviewPanel.jsx";
import { ActivityTabs } from "./ActivityTabs.jsx";
import { AddActivityModal } from "./AddActivityModal.jsx";
import { LessonEditor } from "./LessonEditor.jsx";
import { TeacherEditorHelp } from "./TeacherEditorHelp.jsx";
import { defaultWordSearchDirections, generateWordSearch } from "../../../utils/wordSearchGenerator.js";

function normalizeFeedback(feedback = {}, fallbackRevision = "") {
  return {
    correct: feedback.correct || "Good job. You chose the correct answer.",
    wrong: feedback.wrong || "Review the item and try again.",
    revision: feedback.revision || feedback.revisionGuidance || fallbackRevision || "Review the activity before trying again.",
  };
}

function LoadingOverlay({ label }) {
  return (
    <div className="editor-loading-overlay" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="puzzle-loader" aria-hidden="true">
        <span className="puzzle-piece piece-1" />
        <span className="puzzle-piece piece-2" />
        <span className="puzzle-piece piece-3" />
        <span className="puzzle-piece piece-4" />
        <span className="puzzle-piece piece-5" />
        <span className="puzzle-piece piece-6" />
        <span className="puzzle-piece piece-7" />
        <span className="puzzle-piece piece-8" />
        <span className="puzzle-piece piece-9" />
        <span className="puzzle-piece piece-10" />
        <span className="puzzle-piece piece-11" />
        <span className="puzzle-piece piece-12" />
        <span className="puzzle-piece piece-13" />
        <span className="puzzle-piece piece-14" />
        <span className="puzzle-piece piece-15" />
        <span className="puzzle-piece piece-16" />
        <span className="puzzle-piece piece-17" />
        <span className="puzzle-piece piece-18" />
        <span className="puzzle-piece piece-19" />
        <span className="puzzle-piece piece-20" />
      </div>
    </div>
  );
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
        shuffleRightItems: true,
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

  if (activity.type === "word-search") {
    const words = (activity.words || [])
      .map((row) => ({
        id: row.id,
        word: String(row.word || "").trim().toUpperCase(),
        hint: String(row.hint || "").trim(),
      }))
      .filter((row) => row.word);
    const allowedDirections = activity.allowedDirections?.length ? activity.allowedDirections : defaultWordSearchDirections;
    const generatedGrid = activity.generatedGrid || generateWordSearch(words.map((row) => row.word), { directions: allowedDirections, gridSize: activity.gridSize || 12 });
    return {
      type: "word_search",
      title: activity.title,
      instructions: activity.instruction,
      skill: activity.skill,
      position: index + 1,
      content: {
        words,
        directions: allowedDirections,
        allowedDirections,
        gridSize: activity.gridSize || 12,
        generatedGrid,
      },
      correct_answers: Object.fromEntries(words.map((row) => [row.id, row.word])),
      feedback: normalizeFeedback(activity.feedback, "Review the word list and try again."),
    };
  }

  return activity;
}

function createActivityTemplate(type, orderIndex) {
  const stamp = Date.now();
  if (type === "line-matching") {
    const leftA = `left-${stamp}-1`;
    const leftB = `left-${stamp}-2`;
    const rightA = `right-${stamp}-1`;
    const rightB = `right-${stamp}-2`;
    return {
      id: `line-${stamp}`,
      type: "line-matching",
      title: `Activity ${orderIndex + 1}`,
      instruction: "Drag from one box to another to make a match.",
      skill: "Matching skill",
      leftItems: [
        { id: leftA, label: "new left item 1" },
        { id: leftB, label: "new left item 2" },
      ],
      rightItems: [
        { id: rightA, label: "new right item 1" },
        { id: rightB, label: "new right item 2" },
      ],
      correctPairs: {
        [leftA]: [rightA],
        [leftB]: [rightB],
      },
      feedback: normalizeFeedback({}, "Review the matching pairs and try again."),
    };
  }
  if (type === "multiple-choice") {
    const questionId = `mc-${stamp}`;
    return {
      id: `multiple-choice-${stamp}`,
      type: "multiple-choice",
      title: `Activity ${orderIndex + 1}`,
      instruction: "Choose the best option for each question.",
      skill: "Multiple choice skill",
      questions: [
        {
          id: questionId,
          prompt: "New question prompt",
          options: ["Option A", "Option B", "Option C"],
          answer: "Option A",
        },
      ],
      feedback: normalizeFeedback({}, "Review the question and answer options."),
    };
  }
  if (type === "word-search") {
    const entries = [
      { id: `ws-${stamp}-1`, word: "SPRING", hint: "" },
      { id: `ws-${stamp}-2`, word: "SUMMER", hint: "" },
      { id: `ws-${stamp}-3`, word: "WINTER", hint: "" },
      { id: `ws-${stamp}-4`, word: "SUNNY", hint: "" },
      { id: `ws-${stamp}-5`, word: "CLOUDY", hint: "" },
      { id: `ws-${stamp}-6`, word: "WINDY", hint: "" },
    ];
    const generatedGrid = generateWordSearch(entries.map((item) => item.word), { directions: defaultWordSearchDirections, gridSize: 12 });
    return {
      id: `word-search-${stamp}`,
      type: "word-search",
      title: "Find the weather words",
      instruction: "Find the hidden words in the letter grid.",
      skill: "Weather vocabulary",
      words: entries,
      allowedDirections: [...defaultWordSearchDirections],
      gridSize: 12,
      generatedGrid,
      feedback: normalizeFeedback({}, "Review the hidden words and try again."),
    };
  }
  return {
    id: `gap-fill-${stamp}`,
    type: "gap-fill",
    title: `Activity ${orderIndex + 1}`,
    instruction: "Drag each word into the correct gap.",
    skill: "Gap fill skill",
    wordBank: ["Word 1", "Word 2"],
    items: [
      { id: `gap-${stamp}-1`, prompt: "New clue prompt 1.", answer: "Word 1" },
      { id: `gap-${stamp}-2`, prompt: "New clue prompt 2.", answer: "Word 2" },
    ],
    feedback: normalizeFeedback({}, "Review the clues and words before trying again."),
  };
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
  const [previewMode, setPreviewMode] = useState(null);
  const [selectedActivityIndex, setSelectedActivityIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [addingActivity, setAddingActivity] = useState(false);
  const [showAddActivityModal, setShowAddActivityModal] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activitySaved, setActivitySaved] = useState(false);
  const selectedActivity = course.lesson.activities[selectedActivityIndex] || course.lesson.activities[0];
  const overlayLabel = saving || addingActivity ? "Saving..." : courseLoading ? "Loading..." : "";

  const moveActivity = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= course.lesson.activities.length) return;
    const activities = [...course.lesson.activities];
    const [item] = activities.splice(index, 1);
    activities.splice(nextIndex, 0, item);
    onCourseChange({ ...course, lesson: { ...course.lesson, activities } });
  };

  const reorderActivitiesByIds = (dragActivityId, targetId) => {
    if (!dragActivityId || !targetId || dragActivityId === targetId) return;
    const activities = [...course.lesson.activities];
    const dragIndex = activities.findIndex((item) => item.id === dragActivityId);
    const targetIndex = activities.findIndex((item) => item.id === targetId);
    if (dragIndex < 0 || targetIndex < 0) return;
    const [dragItem] = activities.splice(dragIndex, 1);
    activities.splice(targetIndex, 0, dragItem);
    onCourseChange({ ...course, lesson: { ...course.lesson, activities } });
    setSelectedActivityIndex(activities.findIndex((item) => item.id === dragItem.id));
  };

  const deleteActivity = (activityId) => {
    const activities = course.lesson.activities.filter((item) => item.id !== activityId);
    onCourseChange({ ...course, lesson: { ...course.lesson, activities } });
    const nextSelected = activities.length ? Math.min(selectedActivityIndex, activities.length - 1) : 0;
    setSelectedActivityIndex(nextSelected);
    setPreviewMode(null);
  };

  const addActivity = async (activityType) => {
    const orderIndex = course.lesson.activities.length;
    const nextActivity = createActivityTemplate(activityType, orderIndex);
    const applyLocalActivity = () => {
      const activities = [...course.lesson.activities, nextActivity];
      onCourseChange({ ...course, lesson: { ...course.lesson, activities } });
      setSelectedActivityIndex(activities.length - 1);
    };

    playSound("submit");
    setAddingActivity(true);
    setActivitySaved(false);
    setSaveError("");
    try {
      const nextCourse = await saveActivity?.(nextActivity.id, activityToApiPatch(nextActivity, orderIndex));
      const persistedActivities = nextCourse?.lesson?.activities || [];
      const createdIndex = persistedActivities.findIndex((item) => item.type === activityType && item.title === nextActivity.title && item.position === orderIndex + 1);

      if (createdIndex >= 0) {
        setSelectedActivityIndex(createdIndex);
      } else {
        applyLocalActivity();
      }

      setShowAddActivityModal(false);
      setPreviewMode(null);
      setActivitySaved(true);
      window.setTimeout(() => setActivitySaved(false), 2600);
    } catch (error) {
      applyLocalActivity();
      setShowAddActivityModal(false);
      setPreviewMode(null);
      setSaveError("Activity added locally. Database save failed.");
    } finally {
      setAddingActivity(false);
    }
  };

  const saveSelectedActivity = async () => {
    if (!selectedActivity) return;
    playSound("submit");
    setSaving(true);
    setActivitySaved(false);
    setSaveError("");
    try {
      await saveActivity?.(selectedActivity.id, activityToApiPatch(selectedActivity, selectedActivityIndex));
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
      {overlayLabel && <LoadingOverlay label={overlayLabel} />}
      <SectionTitle
        eyebrow="Teacher course editor"
        title="Edit the digital book lesson, preview it, and assign it."
        text={`${course.title} / ${course.lesson.title}. The editor is intentionally focused on lesson content and interactive activities.`}
        action={(
          <div className="editor-action-row">
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

            <div className="activity-manager-layout">
              <ActivityTabs
                activities={course.lesson.activities}
                selectedIndex={selectedActivityIndex}
                onSelect={(index, action) => {
                  if (!action) {
                    setSelectedActivityIndex(index);
                    setPreviewMode(null);
                    return;
                  }
                  if (action.type === "reorder") {
                    reorderActivitiesByIds(action.dragActivityId, action.targetId);
                    return;
                  }
                  if (action.type === "delete") {
                    deleteActivity(action.activityId);
                    return;
                  }
                  if (action.type === "add") {
                    setShowAddActivityModal(true);
                  }
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
                    <button className="primary-action" data-sound-ignore="true" onClick={saveSelectedActivity} disabled={saving}>
                      <Save size={17} /> {saving ? "Saving..." : "Save activity"}
                    </button>
                    <div className="preview-action-stack">
                      <span>Preview the selected activity or the full lesson flow before publishing.</span>
                      <button className="secondary-action" data-sound-ignore="true" onClick={() => setPreviewMode("activity")}>
                        <Eye size={17} /> Preview activity
                      </button>
                      <button className="secondary-action" data-sound-ignore="true" onClick={() => setPreviewMode("course")}>
                        <Eye size={17} /> Preview whole course
                      </button>
                    </div>
                  </aside>
                </div>
              )}
              {!selectedActivity && (
                <div className="activity-empty-editor">
                  <strong>No activity selected</strong>
                  <p>Add a new activity from the left list to start editing.</p>
                </div>
              )}
            </div>
          </Card>

          <details className="teacher-optional-panel">
            <summary>Assignment</summary>
            <Card>
              <span className="eyebrow">Assignment</span>
              <h2>Assign lesson</h2>
              <p>Publish this lesson to the selected class with two attempts and automatic feedback.</p>
              <button className="primary-action compact-action" onClick={() => setAssigned(true)}>
                <Send size={17} /> Assign to {course.className}
              </button>
            </Card>
          </details>

          <details className="teacher-optional-panel">
            <summary>Submissions</summary>
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
          </details>

          {previewMode && selectedActivity && (
            <ActivityPreviewPanel
              course={course}
              activity={selectedActivity}
              mode={previewMode}
              onClose={() => setPreviewMode(null)}
            />
          )}

          {showAddActivityModal && (
            <AddActivityModal
              adding={addingActivity}
              onClose={() => setShowAddActivityModal(false)}
              onAdd={addActivity}
            />
          )}
        </main>
      </div>
    </div>
  );
}
