import { ArrowDown, ArrowUp, BookOpen, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { updateHomework } from "../../../../services/assignmentsApi.js";
import { Card } from "../../Shared.jsx";
import { PublishedHomeworkPicker } from "./PublishedHomeworkPicker.jsx";
import {
  addSelectedHomeworkActivity,
  compatibleHomeworkActivityOptions,
  homeworkDueDateInputValue,
  homeworkItemRequest,
  homeworkItemSelection,
  homeworkPackageCompatibilityIssue,
  moveSelectedHomeworkActivity,
  removeSelectedHomeworkActivity,
} from "../homeworkUiModel.js";

export function HomeworkEditor({ homework, classes = [], activityOptions = [], catalogLoading = false, catalogUnavailable = false, onSaved, onCancel, onError }) {
  const structureLocked = Boolean(homework.structureLocked);
  const [title, setTitle] = useState(homework.title || "");
  const [teacherNotes, setTeacherNotes] = useState(homework.teacherNotes || "");
  const [worksheetLinks, setWorksheetLinks] = useState((homework.worksheetLinks || []).join("\n"));
  const [dueDate, setDueDate] = useState(homeworkDueDateInputValue(homework.dueAt));
  const [selectedClassIds, setSelectedClassIds] = useState((homework.classes || []).map((item) => item.id));
  const [selectedActivities, setSelectedActivities] = useState(() => (
    (homework.items || []).map((item) => homeworkItemSelection(item, activityOptions))
  ));
  const compatibleOptions = useMemo(
    () => compatibleHomeworkActivityOptions(activityOptions, classes, selectedClassIds),
    [activityOptions, classes, selectedClassIds],
  );
  const assignableOptions = compatibleOptions.options;
  const packageIssue = useMemo(
    () => homeworkPackageCompatibilityIssue(classes, selectedClassIds, selectedActivities),
    [classes, selectedActivities, selectedClassIds],
  );
  const structureChanged = useMemo(() => {
    const originalClasses = (homework.classes || []).map((item) => String(item.id)).sort().join("\0");
    const selectedClasses = [...selectedClassIds].map(String).sort().join("\0");
    const originalItems = (homework.items || []).map((item) => item.targetKind === "published_native"
      ? `published_native:${item.nativeReleaseId}:${item.nativeActivityId}`
      : `legacy_activity:${item.activityId}`).join("\0");
    return originalClasses !== selectedClasses || originalItems !== selectedActivities.map((item) => item.id).join("\0");
  }, [homework.classes, homework.items, selectedActivities, selectedClassIds]);
  const [pickerId, setPickerId] = useState(assignableOptions[0]?.id || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setPickerId((current) => (
    assignableOptions.some((item) => item.id === current) ? current : assignableOptions[0]?.id || ""
  )), [assignableOptions]);

  const toggleClass = (classId) => setSelectedClassIds((current) => current.includes(classId)
    ? current.filter((id) => id !== classId)
    : [...current, classId]);
  const addActivity = () => {
    const option = assignableOptions.find((item) => item.id === pickerId);
    setSelectedActivities((current) => addSelectedHomeworkActivity(current, option));
  };

  const submit = async (event) => {
    event.preventDefault();
    onError?.("");
    if (!title.trim()) return onError?.("Enter a Homework title.");
    if (!selectedClassIds.length) return onError?.("Choose at least one class.");
    if (!structureLocked && structureChanged && packageIssue.conflict) return onError?.(packageIssue.message);
    if (!structureLocked && structureChanged && catalogUnavailable) return onError?.("Assignable activities are temporarily unavailable.");
    if (selectedActivities.length < 2) return onError?.("Select at least two activities for this Homework.");
    setSaving(true);
    try {
      const updated = await updateHomework({
        homeworkId: homework.id,
        expectedUpdatedAt: homework.updatedAt,
        title: title.trim(),
        teacherNotes,
        worksheetLinks,
        dueAt: dueDate ? `${dueDate}T23:59:00` : null,
        classIds: selectedClassIds,
        items: selectedActivities.map(homeworkItemRequest),
      });
      await onSaved?.(updated);
    } catch (error) {
      if (error.status === 409 && error.payload?.conflict === "homework-stale-edit") {
        onError?.("This Homework changed after you opened it. Reload the list and reopen Edit before saving.");
      } else if (error.status === 409 && error.payload?.conflict === "homework-structure-locked") {
        onError?.("Learner work now exists. Reload and reopen Edit; exercises, order, and classes are locked.");
      } else {
        onError?.(error.message || "Homework changes could not be saved.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="teacher-book-assign-panel homework-editor">
      <form onSubmit={submit}>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><BookOpen size={15} /> Edit Homework</span>
            <h2>{homework.title}</h2>
            <p>Update Homework details{structureLocked ? ". Learner work exists, so structure is protected." : ", activities, order, and classes."}</p>
          </div>
          <div className="homework-editor-actions">
            <button className="secondary-action" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
            <button className="primary-action" type="submit" disabled={saving || (!structureLocked && structureChanged && (catalogUnavailable || Boolean(packageIssue.conflict)))}>{saving ? "Saving..." : "Save changes"}</button>
          </div>
        </div>

        {structureLocked && <div className="inline-status">Learner work already exists. Exercises, activity order, and classes are read-only to protect submissions and results.</div>}

        {!structureLocked && <PublishedHomeworkPicker ownerId={homework.teacherId} selected={selectedActivities} disabled={saving} onToggle={(option) => setSelectedActivities((current) => current.some((item) => item.id === option.id) ? removeSelectedHomeworkActivity(current, option.id) : addSelectedHomeworkActivity(current, option))} />}

        <div className="teacher-book-assign-grid">
          <label>Homework title<input type="text" maxLength={240} required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <div className="homework-activity-picker">
            <label htmlFor={`homework-edit-activity-${homework.id}`}>Activity</label>
            <div>
              <select id={`homework-edit-activity-${homework.id}`} value={pickerId} disabled={structureLocked || catalogUnavailable || catalogLoading || Boolean(compatibleOptions.conflict)} onChange={(event) => setPickerId(event.target.value)}>
                {assignableOptions.length
                  ? assignableOptions.map((activity) => <option key={activity.id} value={activity.id}>{activity.label}</option>)
                  : <option value="">{catalogLoading ? "Loading activities..." : compatibleOptions.message || "No assignable activities for these classes"}</option>}
              </select>
              <button className="secondary-action" type="button" onClick={addActivity} disabled={structureLocked || catalogUnavailable || catalogLoading || !pickerId || selectedActivities.some((item) => item.id === pickerId)}><Plus size={16} /> Add</button>
            </div>
          </div>
          <div className="teacher-checkbox-panel">
            <strong>Classes</strong>
            {classes.map((classItem) => (
              <label key={classItem.id}>
                <input type="checkbox" disabled={structureLocked} checked={selectedClassIds.includes(classItem.id)} onChange={() => toggleClass(classItem.id)} />
                <span>{classItem.name}</span>
              </label>
            ))}
          </div>
          <label>Instructions / teacher notes<textarea value={teacherNotes} rows={4} maxLength={4000} onChange={(event) => setTeacherNotes(event.target.value)} /></label>
          <label>Worksheet/link URLs<textarea value={worksheetLinks} rows={4} onChange={(event) => setWorksheetLinks(event.target.value)} /></label>
        </div>

        {!structureLocked && structureChanged && packageIssue.conflict && <div className="inline-status warning">{packageIssue.message}</div>}

        <div className="homework-selected-activities" aria-live="polite">
          <strong>Selected activities ({selectedActivities.length})</strong>
          <ol>
            {selectedActivities.map((activity, index) => (
              <li key={activity.id}>
                <span><b>{activity.title}</b><small>{activity.packageTitle} / {activity.component} · {activity.targetKind === "published_native" ? "Published native" : "Book activity"}</small></span>
                <span className="homework-editor-actions">
                  <button type="button" className="secondary-action compact-action" disabled={structureLocked || index === 0} onClick={() => setSelectedActivities((current) => moveSelectedHomeworkActivity(current, index, -1))}><ArrowUp size={15} /> Up</button>
                  <button type="button" className="secondary-action compact-action" disabled={structureLocked || index === selectedActivities.length - 1} onClick={() => setSelectedActivities((current) => moveSelectedHomeworkActivity(current, index, 1))}><ArrowDown size={15} /> Down</button>
                  <button type="button" className="danger-action compact-action" disabled={structureLocked} onClick={() => setSelectedActivities((current) => removeSelectedHomeworkActivity(current, activity.id))}><Trash2 size={15} /> Remove</button>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </form>
    </Card>
  );
}
