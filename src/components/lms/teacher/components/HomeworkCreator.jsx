import { BookOpen, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createHomework, createHomeworkRequestKey } from "../../../../services/assignmentsApi.js";
import { Card } from "../../Shared.jsx";
import {
  addSelectedHomeworkActivity,
  compatibleHomeworkActivityOptions,
  homeworkPackageCompatibilityIssue,
  homeworkItemRequest,
  removeSelectedHomeworkActivity,
} from "../homeworkUiModel.js";

export function HomeworkCreator({ currentUser, classes = [], activityOptions = [], catalogLoading = false, catalogUnavailable = false, onCreated, onError }) {
  const [title, setTitle] = useState("");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [worksheetLinks, setWorksheetLinks] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState([]);
  const [pickerId, setPickerId] = useState("");
  const [selectedActivities, setSelectedActivities] = useState([]);
  const [requestKey, setRequestKey] = useState(createHomeworkRequestKey);
  const [saving, setSaving] = useState(false);

  const compatibleOptions = useMemo(
    () => compatibleHomeworkActivityOptions(activityOptions, classes, selectedClassIds),
    [activityOptions, classes, selectedClassIds],
  );
  const assignableOptions = compatibleOptions.options;
  const packageIssue = useMemo(
    () => homeworkPackageCompatibilityIssue(classes, selectedClassIds, selectedActivities),
    [classes, selectedActivities, selectedClassIds],
  );
  useEffect(() => setPickerId((current) => (
    assignableOptions.some((item) => item.id === current) ? current : assignableOptions[0]?.id || ""
  )), [assignableOptions]);
  useEffect(() => {
    setSelectedClassIds((current) => {
      const available = new Set(classes.map((item) => item.id));
      const valid = current.filter((id) => available.has(id));
      return valid.length ? valid : classes[0]?.id ? [classes[0].id] : [];
    });
  }, [classes]);

  const changed = () => setRequestKey(createHomeworkRequestKey());
  const update = (setter) => (event) => {
    setter(event.target.value);
    changed();
  };
  const toggleClass = (classId) => {
    setSelectedClassIds((current) => current.includes(classId)
      ? current.filter((id) => id !== classId)
      : [...current, classId]);
    changed();
  };
  const addActivity = () => {
    const option = assignableOptions.find((item) => item.id === pickerId);
    setSelectedActivities((current) => addSelectedHomeworkActivity(current, option));
    changed();
  };
  const removeActivity = (activityId) => {
    setSelectedActivities((current) => removeSelectedHomeworkActivity(current, activityId));
    changed();
  };

  const submit = async (event) => {
    event.preventDefault();
    onError?.("");
    if (!currentUser?.id) return onError?.("Sign in as a teacher before creating Homework.");
    if (!title.trim()) return onError?.("Enter a Homework title.");
    if (!selectedClassIds.length) return onError?.("Choose at least one class.");
    if (catalogUnavailable) return onError?.("Assignable activities are temporarily unavailable.");
    if (packageIssue.conflict) return onError?.(packageIssue.message);
    if (selectedActivities.length < 2) return onError?.("Select at least two activities for this Homework.");
    setSaving(true);
    try {
      const homework = await createHomework({
        idempotencyKey: requestKey,
        teacherId: currentUser.id,
        title: title.trim(),
        teacherNotes,
        worksheetLinks,
        dueAt: dueDate ? `${dueDate}T23:59:00` : null,
        classIds: selectedClassIds,
        items: selectedActivities.map(homeworkItemRequest),
      });
      setTitle("");
      setTeacherNotes("");
      setWorksheetLinks("");
      setDueDate("");
      setSelectedActivities([]);
      setRequestKey(createHomeworkRequestKey());
      await onCreated?.(homework);
    } catch (error) {
      onError?.(error.message || "Homework could not be created.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="teacher-book-assign-panel homework-creator">
      <form onSubmit={submit}>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><BookOpen size={15} /> Create Homework</span>
            <h2>One Homework, multiple activities</h2>
            <p>Select at least two eligible legacy or published-native activities. Selection order becomes the student order.</p>
          </div>
          <button className="primary-action" type="submit" disabled={saving || catalogUnavailable || Boolean(packageIssue.conflict)}>{saving ? "Creating..." : "Create Homework"}</button>
        </div>

        <div className="teacher-book-assign-grid">
          <label>
            Homework title
            <input type="text" maxLength={240} required value={title} onChange={update(setTitle)} placeholder="Unit 2 review" />
          </label>
          <label>
            Due date
            <input type="date" value={dueDate} onChange={update(setDueDate)} />
          </label>
          <div className="homework-activity-picker">
            <label htmlFor="homework-activity-select">Activity</label>
            <div>
              <select id="homework-activity-select" value={pickerId} disabled={catalogUnavailable || catalogLoading || Boolean(compatibleOptions.conflict)} onChange={(event) => setPickerId(event.target.value)}>
                {assignableOptions.length
                  ? assignableOptions.map((activity) => <option key={activity.id} value={activity.id}>{activity.label}</option>)
                  : <option value="">{catalogLoading ? "Loading activities..." : compatibleOptions.message || "No assignable activities for these classes"}</option>}
              </select>
              <button className="secondary-action" type="button" onClick={addActivity} disabled={catalogUnavailable || catalogLoading || !pickerId || selectedActivities.some((item) => item.id === pickerId)}>
                <Plus size={16} /> Add
              </button>
            </div>
          </div>
          <div className="teacher-checkbox-panel">
            <strong>Classes</strong>
            {classes.map((classItem) => (
              <label key={classItem.id}>
                <input type="checkbox" checked={selectedClassIds.includes(classItem.id)} onChange={() => toggleClass(classItem.id)} />
                <span>{classItem.name}</span>
              </label>
            ))}
            {!classes.length && <small>No live classes yet. Create a class first.</small>}
          </div>
          <label>
            Instructions / teacher notes
            <textarea value={teacherNotes} rows={4} maxLength={4000} placeholder="Read each instruction carefully and complete every activity." onChange={update(setTeacherNotes)} />
          </label>
          <label>
            Worksheet/link URLs
            <textarea value={worksheetLinks} rows={4} placeholder="One URL per line, or comma separated" onChange={update(setWorksheetLinks)} />
          </label>
        </div>

        {packageIssue.conflict && <div className="inline-status warning">{packageIssue.message}</div>}

        <div className="homework-selected-activities" aria-live="polite">
          <strong>Selected activities ({selectedActivities.length})</strong>
          {selectedActivities.length === 0 && <p>No activities selected yet.</p>}
          <ol>
            {selectedActivities.map((activity) => (
              <li key={activity.id}>
                <span><b>{activity.title}</b><small>{activity.packageTitle} / {activity.component} · {activity.targetKind === "published_native" ? "Published native" : "Book activity"}</small></span>
                <button type="button" className="danger-action compact-action" onClick={() => removeActivity(activity.id)} aria-label={`Remove ${activity.title}`}>
                  <Trash2 size={15} /> Remove
                </button>
              </li>
            ))}
          </ol>
        </div>
      </form>
    </Card>
  );
}
