import { useState } from "react";
import { ClipboardList, Eye, Save, Send, Users } from "lucide-react";
import { Card, MetricCard, SectionTitle, Tag } from "../../Shared.jsx";
import { useSoundEffects } from "../../../../context/SoundContext.jsx";
import { ActivityEditor } from "../ActivityEditor.jsx";
import { ActivityPreviewPanel } from "../ActivityPreviewPanel.jsx";
import { ActivityTabs } from "../ActivityTabs.jsx";
import { AddActivityModal } from "../AddActivityModal.jsx";
import { LessonEditor } from "../LessonEditor.jsx";
import { TeacherEditorHelp } from "../TeacherEditorHelp.jsx";
import { LoadingOverlay } from "./LoadingOverlay.jsx";
import { activityToApiPatch, createActivityTemplate } from "./courseEditorUtils.js";

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
  const overlayLabel = saving || addingActivity ? "Saving..." : courseLoading ? "Loading..." : "";

  if (!course?.lesson || !Array.isArray(course.lesson.activities)) {
    return (
      <div className="workspace editor-workspace">
        {overlayLabel && <LoadingOverlay label={overlayLabel} />}
        <SectionTitle
          eyebrow="Teacher course editor"
          title={courseLoading ? "Loading course content." : "Course content is unavailable."}
          text={courseLoading
            ? "The editable course and activity data is loading from the server."
            : "This school does not currently have an editable course available for custom assignment authoring."}
        />
        <Card className="course-editor-card priority-panel">
          {courseLoading ? (
            <div className="teacher-loading-state">Loading course content...</div>
          ) : (
            <div className="activity-empty-editor">
              <strong>Custom assignment authoring is unavailable</strong>
              <p>{courseError || "No editable course or activity data was returned for this school."}</p>
              <button className="secondary-action" type="button" onClick={() => reloadCourse?.()}>
                Try again
              </button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const selectedActivity = course.lesson.activities[selectedActivityIndex] || course.lesson.activities[0];

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
        <MetricCard label="Level" value="B2" note={course.title} icon={ClipboardList} />
        <MetricCard label="Activities" value={course.lesson.activities.length} note="assigned book exercises" icon={Save} delay={1} />
        <MetricCard label="Assigned class" value="21" note={course.className} icon={Users} delay={2} />
        <MetricCard label="Submissions" value="2/3" note="demo summary" icon={Send} delay={3} />
      </section>

      {(saved || assigned) && (
        <div className={`inline-status ${assigned ? "success" : ""}`}>
          {assigned ? `${course.lesson.title} assigned to ${course.className}.` : "Saved to digital book platform. Student view updated."}
        </div>
      )}
      {activitySaved && <div className="inline-status success">Assigned book exercise saved. Student view updated.</div>}

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
                <h2>Build the assigned book practice</h2>
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
