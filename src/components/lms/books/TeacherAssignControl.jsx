import { useEffect, useRef, useState } from "react";
import { CheckSquare, ChevronDown, Lock, Send } from "lucide-react";
import { createAssignment, createAssignmentRequestKey } from "../../../services/assignmentsApi.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function TeacherAssignControl({ exercise, classOptions = [], classes = [], currentUser = null }) {
  const liveClasses = classes.filter((classItem) => classItem?.id && classItem?.name);
  const [selectedClassIds, setSelectedClassIds] = useState([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);
  const databaseActivityId = exercise.assignmentActivityId
    || exercise.dbActivity?.id
    || (uuidPattern.test(String(exercise.id || "")) ? exercise.id : null);
  const assignmentReady = Boolean(
    exercise.assignable
    && uuidPattern.test(String(databaseActivityId || ""))
    && currentUser?.id
    && liveClasses.length,
  );

  useEffect(() => {
    setSelectedClassIds((current) => {
      const valid = current.filter((id) => liveClasses.some((classItem) => classItem.id === id));
      return valid.length ? valid : liveClasses.slice(0, 1).map((classItem) => classItem.id);
    });
  }, [classes]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggleClass = (classId) => {
    setSelectedClassIds((current) => (
      current.includes(classId) ? current.filter((item) => item !== classId) : [...current, classId]
    ));
    setMessage("");
  };

  const assignExercise = async () => {
    if (!assignmentReady) {
      setMessage(databaseActivityId ? "A live teacher account and class are required." : "This activity needs its database migration before assignment.");
      return;
    }
    const classIds = selectedClassIds.length ? selectedClassIds : liveClasses.slice(0, 1).map((classItem) => classItem.id);
    if (!classIds.length) {
      setMessage("Choose at least one live class.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await createAssignment({
        idempotencyKey: createAssignmentRequestKey(),
        activityId: databaseActivityId,
        teacherId: currentUser.id,
        classIds,
        title: exercise.title,
        status: "assigned",
      });
      const names = liveClasses.filter((classItem) => classIds.includes(classItem.id)).map((classItem) => classItem.name);
      setSelectedClassIds(classIds);
      setMessage(`Assigned to ${names.join(", ")}.`);
      setOpen(false);
    } catch (error) {
      setMessage(error.message || "Assignment could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="teacher-assign-popover" ref={popoverRef}>
      <button
        className="teacher-assign-toggle"
        type="button"
        aria-expanded={open}
        aria-label={`Assign ${exercise.title} to class`}
        title={assignmentReady ? "Assign to class" : "Database activity and live class required"}
        disabled={!assignmentReady}
        onClick={() => setOpen((current) => !current)}
        data-sound-click="tab"
      >
        <CheckSquare size={17} />
        <span>Assign</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="teacher-assign-menu" role="dialog" aria-label={`Choose classes for ${exercise.title}`} onClick={(event) => event.stopPropagation()}>
          <strong>Assign to class</strong>
          <div className="book-browser-class-picker">
            {liveClasses.map((classItem) => (
              <label key={classItem.id}>
                <input type="checkbox" checked={selectedClassIds.includes(classItem.id)} onChange={() => toggleClass(classItem.id)} />
                <span>{classItem.name}</span>
              </label>
            ))}
          </div>
          <button className="primary-action compact-action" type="button" disabled={saving || !selectedClassIds.length} onClick={assignExercise} data-sound-click="submit">
            <Send size={16} /> {saving ? "Assigning…" : "Assign"}
          </button>
        </div>
      )}
      {message && <small className="book-browser-success">{message}</small>}
    </div>
  );
}

export function DisabledAssignControl({ label = "Not assignable" }) {
  return (
    <div className="teacher-assign-popover">
      <button className="teacher-assign-toggle disabled" type="button" disabled title={label}>
        <Lock size={16} />
        <span>Unavailable</span>
      </button>
      <small className="book-browser-muted">{label}</small>
    </div>
  );
}
