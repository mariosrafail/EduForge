import { BookOpen, CheckCircle2, ListChecks, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dedupeBookPackages, demoBookPackages, normalizeBookPackageKey } from "../../../../data/bookPackages.js";
import { findUltimateB2Exercise } from "../../../../data/ultimateB2DemoData.js";
import { getBookPackageTreeWithFallback } from "../../../../services/bookContentApi.js";
import {
  createAssignment,
  exportAssignmentResultsCsv,
  getAssignmentResults,
  listClassStudents,
  listTeacherAssignments,
  listTeacherStudents,
  reviewSubmission,
} from "../../../../services/assignmentsApi.js";
import { createTeacherClass } from "../../../../services/classApi.js";
import { buildActivityHash, buildBookHash, buildTeacherPresentationHash, buildTeacherSectionHash, slugifyRoute } from "../../../../utils/hashRoutes.js";
import { teacherBooksPresentation } from "../teacherBooksState.js";
import { UltimateB2ActivityRunner } from "../../activities/UltimateB2ActivityRunner.jsx";
import { BookPackageBrowser, BookSubpageNavigation, findBookComponentById } from "../../books/BookPackageBrowser.jsx";
import { Card, Progress, SectionTitle, Tag } from "../../Shared.jsx";
import { TeacherCourseEditor } from "../TeacherCourseEditor.jsx";
import { ClassInviteLink } from "../ClassInviteLink.jsx";
import { classBookOptions, classLevelOptions, teacherSections } from "../teacherPortalConfig.js";
import { dueDateLabel, dueDateTone } from "../teacherPortalUtils.js";

import { ResultsModal } from "../components/TeacherResultsModal.jsx";

export function TeacherAssignments({ currentUser = null, classes = [], classOptions = [], selectedAssignmentId = null, routeAction = null, navigateTo }) {
  const [assignments, setAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [activityOptions, setActivityOptions] = useState([]);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [worksheetLinks, setWorksheetLinks] = useState("");
  const [assigned, setAssigned] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [selectedAssignmentResult, setSelectedAssignmentResult] = useState(null);
  const [selectedAssignmentLiveResults, setSelectedAssignmentLiveResults] = useState(null);
  const visibleAssignments = assignments;

  const loadAssignments = async () => {
    setLoadingAssignments(true);
    setAssignmentError("");
    try {
      const liveAssignments = await listTeacherAssignments(currentUser?.id || "");
      setAssignments(liveAssignments);
    } catch (error) {
      console.warn("Teacher assignments could not be loaded.", error);
      setAssignments([]);
      setAssignmentError(error.message || "Assignments could not be loaded.");
    } finally {
      setLoadingAssignments(false);
    }
  };

  useEffect(() => {
    loadAssignments();
  }, [currentUser?.id]);

  useEffect(() => {
    let mounted = true;
    getBookPackageTreeWithFallback("ultimate-b2").then((packageTree) => {
      if (!mounted) return;
      const options = [];
      for (const component of packageTree.components || []) {
        for (const unit of component.units || []) {
          for (const lesson of unit.lessons || []) {
            for (const exercise of lesson.exercises || []) {
              if (exercise.assignable === false || exercise.isAssignable === false) continue;
              const assignmentActivityId = exercise.assignmentActivityId || exercise.dbActivity?.id;
              if (!assignmentActivityId) continue;
              options.push({
                id: assignmentActivityId,
                stableActivityId: exercise.stableActivityId || exercise.activityKey || exercise.demoActivityKey || exercise.slug,
                title: exercise.title,
                label: `${component.title} / ${unit.title} / ${exercise.title}`,
                component: component.title,
                dbActivity: exercise.dbActivity || exercise,
              });
            }
          }
        }
      }
      setActivityOptions(options);
      setSelectedActivityId((current) => current || options[0]?.id || "");
    }).catch((error) => {
      if (!mounted) return;
      setActivityOptions([]);
      setSelectedActivityId("");
      setAssignmentError(error.message || "Assignable activities could not be loaded.");
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedAssignmentId || selectedAssignmentId === "new") {
      setSelectedAssignmentResult(null);
      setSelectedAssignmentLiveResults(null);
      return;
    }
    const match = visibleAssignments.find((assignment) => (
      slugifyRoute(`${assignment.title}-${assignment.className}`) === slugifyRoute(selectedAssignmentId) ||
      slugifyRoute(assignment.title) === slugifyRoute(selectedAssignmentId)
    ));
    setSelectedAssignmentResult(match || null);
    setSelectedAssignmentLiveResults(null);
  }, [selectedAssignmentId, visibleAssignments]);

  const toggleListItem = (value, list, setter) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
    setAssigned("");
  };

  useEffect(() => {
    setSelectedClasses((currentClasses) => {
      const validClasses = currentClasses.filter((className) => classOptions.includes(className));
      return validClasses.length ? validClasses : classOptions.slice(0, 1);
    });
  }, [classOptions]);

  const createLiveAssignment = async (event) => {
    event.preventDefault();
    setAssigned("");
    setAssignmentError("");
    if (!currentUser?.id) {
      setAssignmentError("Sign in as a teacher before creating assignments.");
      return;
    }
    if (!selectedActivityId) {
      setAssignmentError("Choose an exercise before assigning.");
      return;
    }
    const classIds = classes.filter((classItem) => selectedClasses.includes(classItem.name)).map((classItem) => classItem.id).filter(Boolean);
    if (!classIds.length) {
      setAssignmentError("Choose at least one live class before assigning.");
      return;
    }

    setSavingAssignment(true);
    try {
      const selectedActivity = activityOptions.find((item) => item.id === selectedActivityId);
      await createAssignment({
        activityId: selectedActivityId,
        teacherId: currentUser.id,
        classIds,
        dueAt: dueDate ? `${dueDate}T23:59:00` : null,
        title: assignmentTitle.trim() || selectedActivity?.title || "",
        teacherNotes,
        worksheetLinks,
        attachedFiles: [],
        status: "assigned",
      });
      setAssigned(`Assignment created for ${selectedClasses.join(", ")}.`);
      setAssignmentTitle("");
      setTeacherNotes("");
      setWorksheetLinks("");
      await loadAssignments();
    } catch (error) {
      setAssignmentError(error.message || "Assignment could not be saved.");
    } finally {
      setSavingAssignment(false);
    }
  };

  const openResults = async (assignment) => {
    setSelectedAssignmentResult(assignment);
    setSelectedAssignmentLiveResults(null);
    navigateTo?.(buildTeacherSectionHash("assignments", `${assignment.title}-${assignment.className}`));
    if (!assignment.id) return;
    try {
      const results = await getAssignmentResults(assignment.id);
      setSelectedAssignmentLiveResults(results);
    } catch (error) {
      setAssignmentError(error.message || "Assignment results could not be loaded.");
    }
  };

  const exportResults = async (assignment) => {
    if (!assignment.id) {
      setAssignmentError("Only live assignments can be exported.");
      return;
    }
    try {
      await exportAssignmentResultsCsv(assignment.id);
    } catch (error) {
      setAssignmentError(error.message || "CSV export failed.");
    }
  };

  return (
    <section className="teacher-section-stack">
      <SectionTitle
        eyebrow="Assignments"
        title="Assigned digital book exercises."
        text="Track submit status by class and assign implemented Ultimate B2 exercises."
      />

      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><ListChecks size={15} /> Active assignments</span>
            <h2>Submit status</h2>
          </div>
          <Tag tone={assignmentError ? "gold" : "green"}>{assignmentError ? "Unavailable" : "Database"}</Tag>
        </div>
        {assignmentError && <div className="inline-status error">{assignmentError}</div>}
        {loadingAssignments && <div className="teacher-loading-state">Loading assignments...</div>}
        <div className="teacher-assignment-table">
          {!loadingAssignments && visibleAssignments.length === 0 && <div className="teacher-loading-state">No assignments yet. Create one below.</div>}
          {!loadingAssignments && visibleAssignments.map((assignment) => (
            <article key={assignment.id || `${assignment.title}-${assignment.className}`}>
              <div>
                <strong>{assignment.title}</strong>
                <small>{assignment.component} / {assignment.className}</small>
                <small>Assigned {assignment.assignedDate || (assignment.assignedAt ? new Date(assignment.assignedAt).toLocaleDateString() : "Today")} / Due {assignment.dueDate || assignment.dueAt ? new Date(assignment.dueDate || assignment.dueAt).toLocaleDateString() : "No due date"}</small>
              </div>
              <Tag tone={dueDateTone(assignment.dueDate || assignment.dueAt) === "overdue" ? "red" : dueDateTone(assignment.dueDate || assignment.dueAt) === "soon" ? "gold" : "green"}>
                {dueDateLabel(assignment.dueDate || assignment.dueAt)}
              </Tag>
              <span>{assignment.submitted}/{assignment.total} submitted</span>
              <span>{assignment.averageScore == null ? "Unscored" : `${assignment.averageScore}% average`}</span>
              <button
                className="secondary-action compact-action"
                type="button"
                onClick={() => openResults(assignment)}
                data-sound-click="tab"
              >
                View results
              </button>
              <button className="secondary-action compact-action" type="button" onClick={() => exportResults(assignment)} data-sound-click="submit">Export CSV</button>
            </article>
          ))}
        </div>
      </Card>
      <ResultsModal
        assignment={selectedAssignmentResult}
        liveResults={selectedAssignmentLiveResults}
        currentUser={currentUser}
        label="Assignment results"
        onReviewSaved={() => {
          if (selectedAssignmentResult) openResults(selectedAssignmentResult);
        }}
        onClose={() => {
          setSelectedAssignmentResult(null);
          setSelectedAssignmentLiveResults(null);
          navigateTo?.(buildTeacherSectionHash("assignments"));
        }}
      />

      <Card className="teacher-book-assign-panel">
        <form onSubmit={createLiveAssignment}>
        <div className="card-heading">
          <div>
            <span className="eyebrow"><BookOpen size={15} /> Assign from book</span>
            <h2>Ultimate B2 Unit 2</h2>
            <p>Select an exercise, classes, a due date, and optional worksheet links.</p>
          </div>
          <button className="primary-action" type="submit" disabled={savingAssignment} data-sound-click="submit">{savingAssignment ? "Assigning..." : "Assign selected exercise"}</button>
        </div>

        <div className="teacher-book-assign-grid">
          <label>
            Exercise/activity
            <select value={selectedActivityId} onChange={(event) => { setSelectedActivityId(event.target.value); setAssigned(""); }}>
              {activityOptions.length ? activityOptions.map((activity) => <option key={activity.id} value={activity.id}>{activity.label}</option>) : (
                <option value="">Loading activities...</option>
              )}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); setAssigned(""); }} />
          </label>
          <label>
            Assignment title
            <input type="text" maxLength={240} value={assignmentTitle} placeholder="Use the activity title" onChange={(event) => { setAssignmentTitle(event.target.value); setAssigned(""); }} />
          </label>
          <div className="teacher-checkbox-panel">
            <strong>Classes</strong>
            {classOptions.map((className) => (
              <label key={className}>
                <input type="checkbox" checked={selectedClasses.includes(className)} onChange={() => toggleListItem(className, selectedClasses, setSelectedClasses)} />
                <span>{className}</span>
              </label>
            ))}
            {!classOptions.length && <small>No live classes yet. Create a class first.</small>}
          </div>
          <label>
            Instructions / teacher notes
            <textarea value={teacherNotes} rows={4} placeholder="Focus on text evidence and submit by Friday." onChange={(event) => setTeacherNotes(event.target.value)} />
          </label>
          <label>
            Worksheet/link URLs
            <textarea value={worksheetLinks} rows={4} placeholder="One URL per line, or comma separated" onChange={(event) => setWorksheetLinks(event.target.value)} />
          </label>
        </div>
        {assigned && <div className="inline-status success">{assigned}</div>}
        </form>
      </Card>
    </section>
  );
}
