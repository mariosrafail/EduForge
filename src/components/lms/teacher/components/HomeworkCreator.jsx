import { BookOpen, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createAssignment, createHomework, createHomeworkRequestKey } from "../../../../services/assignmentsApi.js";
import { PublishedHomeworkPicker } from "./PublishedHomeworkPicker.jsx";
import { Card } from "../../Shared.jsx";
import {
  addSelectedHomeworkActivity,
  compatibleHomeworkActivityOptions,
  homeworkPackageCompatibilityIssue,
  homeworkItemRequest,
  removeSelectedHomeworkActivity,
  moveSelectedHomeworkActivity,
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
  const [search, setSearch] = useState("");

  const compatibleOptions = useMemo(
    () => compatibleHomeworkActivityOptions(activityOptions, classes, selectedClassIds),
    [activityOptions, classes, selectedClassIds],
  );
  const assignableOptions = useMemo(() => compatibleOptions.options.filter((activity) => activity.label.toLowerCase().includes(search.toLowerCase())), [compatibleOptions, search]);
  const packageIssue = useMemo(
    () => homeworkPackageCompatibilityIssue(classes, selectedClassIds, selectedActivities),
    [classes, selectedActivities, selectedClassIds],
  );
  useEffect(() => setPickerId((current) => (
    assignableOptions.some((item) => item.id === current) ? current : assignableOptions[0]?.id || ""
  )), [assignableOptions]);
  useEffect(() => {
    setSelectedClassIds((current) => {
      return current.length ? current : classes[0]?.id ? [classes[0].id] : [];
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
    if (!selectedActivities.length) return onError?.("Select at least one activity.");
    setSaving(true);
    try {
      const request = {
        idempotencyKey: requestKey,
        teacherId: currentUser.id,
        title: title.trim(),
        teacherNotes,
        worksheetLinks,
        dueAt: dueDate ? `${dueDate}T23:59:00` : null,
        classIds: selectedClassIds,
      };
      let homework;
      if (selectedActivities.length === 1) {
        const item = selectedActivities[0];
        await createAssignment({ ...request, ...(item.targetKind === "published_native" ? { target: item.target } : { activityId: item.activityId }) });
        homework = { title: request.title, itemCount: 1, kind: "assignment" };
      } else {
        homework = await createHomework({ ...request, items: selectedActivities.map(homeworkItemRequest) });
      }
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
            <h2>Assign exercises from a book</h2>
            <p>Choose one exercise for an assignment or several for one Homework. Selection order becomes the student order.</p>
          </div>
          <button className="primary-action" type="submit" disabled={saving || !selectedActivities.length || catalogUnavailable || Boolean(packageIssue.conflict)}>{saving ? "Creating..." : selectedActivities.length === 1 ? "Create assignment" : "Create Homework"}</button>
        </div>

        <PublishedHomeworkPicker ownerId={currentUser?.id} selected={selectedActivities} classes={classes} selectedClassIds={selectedClassIds} disabled={saving} onToggle={(option) => {
          setSelectedActivities((current) => current.some((item) => item.id === option.id) ? removeSelectedHomeworkActivity(current, option.id) : addSelectedHomeworkActivity(current, option));
          changed();
        }} />
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
            <label>Search alternative activity list<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label htmlFor="homework-activity-select">Activity</label>
            <div>
              <select id="homework-activity-select" value={pickerId} disabled={catalogUnavailable || catalogLoading || Boolean(compatibleOptions.conflict)} onChange={(event) => setPickerId(event.target.value)}>
                {assignableOptions.length
                  ? assignableOptions.map((activity) => <option key={activity.id} value={activity.id}>{activity.label}</option>)
                  : <option value="">{catalogLoading ? "Loading activities..." : compatibleOptions.message || (compatibleOptions.options.length && search ? "No search results" : "No compatible activities for these classes")}</option>}
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
                <input aria-label={classItem.name} type="checkbox" checked={selectedClassIds.includes(classItem.id)} onChange={() => toggleClass(classItem.id)} />
                <span>{classItem.name}<small> · {classItem.bookPackageId ? classItem.bookPackageTitle || "Linked book package" : "No book package linked"}</small></span>
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
            {selectedActivities.map((activity, index) => (
              <li key={activity.id}>
                <span><b>{activity.title}</b><small>{activity.packageTitle} / {activity.component} · {activity.printedLabel ? `Page ${activity.printedLabel}` : activity.targetKind === "published_native" ? "Published native" : "Book activity"}</small></span>
                <button type="button" disabled={saving || index === 0} aria-label={`Move ${activity.title} up`} onClick={() => { setSelectedActivities((current) => moveSelectedHomeworkActivity(current, index, -1)); changed(); }}>↑</button>
                <button type="button" disabled={saving || index === selectedActivities.length - 1} aria-label={`Move ${activity.title} down`} onClick={() => { setSelectedActivities((current) => moveSelectedHomeworkActivity(current, index, 1)); changed(); }}>↓</button>
                <button type="button" disabled={saving} className="danger-action compact-action" onClick={() => removeActivity(activity.id)} aria-label={`Remove ${activity.title}`}>
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
