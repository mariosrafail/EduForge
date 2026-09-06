import { ListChecks, LockKeyhole, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  closeAssignment as closeLiveAssignment,
  deleteAssignment as deleteLiveAssignment,
  exportAssignmentResultsCsv,
  getHomework,
  listAssignmentTargets,
  listTeacherAssignments,
  listTeacherHomeworks,
} from "../../../../services/assignmentsApi.js";
import { buildTeacherAssignmentReviewHash } from "../../../../utils/hashRoutes.js";
import Modal from "../../../ui/Modal.jsx";
import { Card, SectionTitle, Tag } from "../../Shared.jsx";
import { assignmentReviewAction } from "../assignmentReviewPresentation.js";
import { buildAssignmentCatalogState } from "../homeworkUiModel.js";
import { HomeworkCreator } from "../components/HomeworkCreator.jsx";
import { HomeworkEditor } from "../components/HomeworkEditor.jsx";
import { TeacherAssignmentReviewWorkspace } from "../components/TeacherAssignmentReviewWorkspace.jsx";
import { TeacherHomeworkList } from "../components/TeacherHomeworkList.jsx";
import { dueDateLabel, dueDateTone } from "../teacherPortalUtils.js";

export function TeacherAssignments({
  currentUser = null,
  classes = [],
  bookPackages = [],
  loadingBooks = false,
  booksLoaded = false,
  bookLoadError = "",
  selectedAssignmentId = null,
  routeAction = null,
  navigateTo,
}) {
  const [homeworks, setHomeworks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [nativeCatalog, setNativeCatalog] = useState({ ownerId: null, targets: [], loading: true, loaded: false, error: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [lifecycleAction, setLifecycleAction] = useState(null);
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [editingHomework, setEditingHomework] = useState(null);

  const loadWork = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextHomeworks, nextAssignments] = await Promise.all([
        listTeacherHomeworks(currentUser?.id || ""),
        listTeacherAssignments(currentUser?.id || ""),
      ]);
      setHomeworks(nextHomeworks);
      setAssignments(nextAssignments);
    } catch (loadError) {
      console.warn("Teacher Homework could not be loaded.", loadError);
      setHomeworks([]);
      setAssignments([]);
      setError(loadError.message || "Homework could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWork(); }, [currentUser?.id]);
  useEffect(() => {
    let mounted = true;
    const ownerId = currentUser?.id || null;
    setNativeCatalog({ ownerId, targets: [], loading: true, loaded: false, error: "" });
    listAssignmentTargets()
      .then((targets) => {
        if (mounted) setNativeCatalog({ ownerId, targets, loading: false, loaded: true, error: "" });
      })
      .catch((loadError) => {
        if (!mounted) return;
        setNativeCatalog({
          ownerId,
          targets: [],
          loading: false,
          loaded: false,
          error: loadError.message || "Published activities could not be loaded.",
        });
      });
    return () => { mounted = false; };
  }, [currentUser?.id]);

  const nativeCatalogIsCurrent = nativeCatalog.ownerId === (currentUser?.id || null);
  const catalog = useMemo(() => buildAssignmentCatalogState({
    packageTrees: bookPackages,
    packageLoading: loadingBooks,
    packageLoaded: booksLoaded,
    packageError: bookLoadError,
    nativeTargets: nativeCatalogIsCurrent ? nativeCatalog.targets : [],
    nativeLoading: !nativeCatalogIsCurrent || nativeCatalog.loading,
    nativeLoaded: nativeCatalogIsCurrent && nativeCatalog.loaded,
    nativeError: nativeCatalogIsCurrent ? nativeCatalog.error : "",
  }), [bookLoadError, bookPackages, booksLoaded, loadingBooks, nativeCatalog, nativeCatalogIsCurrent]);
  const activityOptions = catalog.options;

  const standaloneAssignments = assignments.filter((assignment) => !assignment.homeworkId);
  const openResults = (assignment) => navigateTo?.(buildTeacherAssignmentReviewHash(assignment.id));
  const exportResults = async (assignment) => {
    try {
      await exportAssignmentResultsCsv(assignment.id);
    } catch (exportError) {
      setError(exportError.message || "CSV export failed.");
    }
  };
  const created = async (homework) => {
    setStatus(homework.kind === "assignment" ? `Assignment “${homework.title}” created.` : `Homework “${homework.title}” created with ${homework.itemCount} activities.`);
    await loadWork();
  };
  const openHomeworkEditor = async (homework) => {
    setError("");
    setStatus("");
    try {
      setEditingHomework(await getHomework(homework.id));
    } catch (editError) {
      setError(editError.message || "Homework could not be opened for editing.");
    }
  };
  const saved = async (homework) => {
    setEditingHomework(null);
    setStatus(`Homework “${homework.title}” updated.`);
    await loadWork();
  };

  const confirmLifecycleAction = async () => {
    if (!lifecycleAction?.assignment?.id) return;
    setSavingLifecycle(true);
    setError("");
    setStatus("");
    const { assignment, type } = lifecycleAction;
    try {
      if (type === "delete") {
        await deleteLiveAssignment(assignment.id);
        setAssignments((current) => current.filter((item) => item.id !== assignment.id));
        setStatus("Standalone assignment deleted.");
      } else {
        await closeLiveAssignment(assignment.id);
        setAssignments((current) => current.map((item) => item.id === assignment.id ? { ...item, status: "closed" } : item));
        setStatus("Standalone assignment closed. Existing results were preserved.");
      }
      setLifecycleAction(null);
      await loadWork();
    } catch (lifecycleError) {
      setLifecycleAction(null);
      setError(lifecycleError.message || "Assignment lifecycle action failed.");
      await loadWork();
    } finally {
      setSavingLifecycle(false);
    }
  };

  if (routeAction === "review" && selectedAssignmentId) {
    return <TeacherAssignmentReviewWorkspace assignmentId={selectedAssignmentId} currentUser={currentUser} navigateTo={navigateTo} />;
  }

  return (
    <section className="teacher-section-stack">
      <SectionTitle eyebrow="Class work" title="Assignments" text="Select exercises from book pages, assign them to your classes, and review your students’ work." />
      {error && <div className="inline-status error">{error}</div>}
      {catalog.warning && <div className={`inline-status ${catalog.unavailable ? "error" : "warning"}`}>{catalog.warning}</div>}
      {status && <div className="inline-status success">{status}</div>}

      <HomeworkCreator
        currentUser={currentUser}
        classes={classes}
        activityOptions={activityOptions}
        catalogLoading={catalog.loading}
        catalogUnavailable={catalog.unavailable}
        onCreated={created}
        onError={setError}
      />

      <TeacherHomeworkList homeworks={homeworks} loading={loading} onOpenResults={openResults} onExportResults={exportResults} onEdit={openHomeworkEditor} />

      {editingHomework && (
        <HomeworkEditor
          key={`${editingHomework.id}:${editingHomework.updatedAt}`}
          homework={editingHomework}
          classes={classes}
          activityOptions={activityOptions}
          catalogLoading={catalog.loading}
          catalogUnavailable={catalog.unavailable}
          onSaved={saved}
          onCancel={() => { setEditingHomework(null); setError(""); }}
          onError={setError}
        />
      )}

      <Card>
        <div className="card-heading">
          <div><span className="eyebrow"><ListChecks size={15} /> Standalone assignments</span><h2>Single-exercise assignments</h2></div>
          <Tag tone={error ? "gold" : "green"}>{error ? "Unavailable" : "Compatible"}</Tag>
        </div>
        <div className="teacher-assignment-table">
          {!loading && standaloneAssignments.length === 0 && <div className="teacher-loading-state">No standalone assignments.</div>}
          {standaloneAssignments.map((assignment) => (
            <article key={assignment.id}>
              <div><strong>{assignment.title}</strong><small>{assignment.component} / {assignment.className}</small><small>Due {assignment.dueAt ? new Date(assignment.dueAt).toLocaleDateString() : "No due date"}</small></div>
              {assignment.status === "closed" ? <Tag tone="slate">Closed</Tag> : <Tag tone={dueDateTone(assignment.dueAt) === "overdue" ? "red" : dueDateTone(assignment.dueAt) === "soon" ? "gold" : "green"}>{dueDateLabel(assignment.dueAt)}</Tag>}
              <span>{assignment.submitted}/{assignment.total} submitted</span>
              <span>{assignment.awaitingReviewCount} awaiting · {assignment.reviewedCount} reviewed · {assignment.missingCount} missing</span>
              <button className="secondary-action compact-action" type="button" onClick={() => openResults(assignment)}>{assignmentReviewAction(assignment)}</button>
              <button className="secondary-action compact-action" type="button" onClick={() => exportResults(assignment)}>Export CSV</button>
              {assignment.status !== "closed" && assignment.submittedCount === 0 && <button className="danger-action compact-action" type="button" onClick={() => setLifecycleAction({ type: "delete", assignment })}><Trash2 size={15} /> Delete assignment</button>}
              {assignment.status !== "closed" && assignment.submittedCount > 0 && <button className="warning-action compact-action" type="button" onClick={() => setLifecycleAction({ type: "close", assignment })}><LockKeyhole size={15} /> Close assignment</button>}
            </article>
          ))}
        </div>
      </Card>

      <Modal
        open={Boolean(lifecycleAction)}
        title={lifecycleAction?.type === "delete" ? "Delete assignment?" : "Close assignment?"}
        description={lifecycleAction?.type === "delete" ? "This assignment has no submissions and will be permanently deleted. This cannot be undone." : "Students who have not submitted will no longer be able to submit. Existing submissions, scores and feedback will be preserved."}
        onClose={() => { if (!savingLifecycle) setLifecycleAction(null); }}
        className="assignment-lifecycle-modal"
        backdropClassName="assignment-lifecycle-modal-backdrop"
        footer={<><button className="secondary-action" type="button" disabled={savingLifecycle} onClick={() => setLifecycleAction(null)}>Cancel</button><button className={lifecycleAction?.type === "delete" ? "danger-action" : "warning-action"} type="button" disabled={savingLifecycle} onClick={confirmLifecycleAction}>{savingLifecycle ? "Saving..." : lifecycleAction?.type === "delete" ? "Delete assignment" : "Close assignment"}</button></>}
      ><p><strong>{lifecycleAction?.assignment?.title || "Assignment"}</strong></p></Modal>
    </section>
  );
}
