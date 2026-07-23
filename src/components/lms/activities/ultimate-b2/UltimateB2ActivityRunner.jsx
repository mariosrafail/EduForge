import { ArrowLeft } from "lucide-react";
import { findUltimateB2Exercise } from "../../../../data/ultimateB2DemoData.js";
import { Card, SectionTitle, Tag } from "../../Shared.jsx";
import { VideoIntroScreen } from "./VideoIntroScreen.jsx";
import { ListeningPage20 } from "./ListeningPage20.jsx";
import { GrammarOpening } from "./GrammarOpening.jsx";
import { QuizActivity } from "./QuizActivity.jsx";
import { DatabaseActivity } from "./DatabaseActivity.jsx";
import { findStudentsBookImplementation, NormalizedStudentsBookActivity } from "./NormalizedStudentsBookActivity.jsx";

function ImportedActivityPlaceholder({ activity }) {
  return (
    <Card className="imported-activity-placeholder">
      <h2>{activity?.title || "Imported activity"}</h2>
      <p>{activity?.description || "Activity data imported, interaction pending."}</p>
      <div className="book-exercise-meta">
        {activity?.pageNumber && <span>Page {activity.pageNumber}</span>}
        {activity?.type && <span>{activity.type}</span>}
        {activity?.skill && <span>{activity.skill}</span>}
      </div>
      <p className="inline-status">Activity data imported, interaction pending.</p>
    </Card>
  );
}

function ActivityBody({ activityKey, activity, mode, onSubmit, onNextActivity }) {
  if (findStudentsBookImplementation(activityKey)) return <NormalizedStudentsBookActivity activityId={activityKey} mode={mode} onSubmit={onSubmit} />;
  if (activity?.questions?.length) {
    return <DatabaseActivity activity={activity} mode={mode} onSubmit={onSubmit} onNextActivity={onNextActivity} />;
  }
  if (activityKey === "video-intro") return <VideoIntroScreen mode={mode} onSubmit={onSubmit} onNextActivity={onNextActivity} />;
  if (activityKey === "listening-page-20") return <ListeningPage20 mode={mode} onSubmit={onSubmit} />;
  if (activityKey === "grammar-opening" || activityKey === "grammar-ex4") return <GrammarOpening activityKey={activityKey} mode={mode} onSubmit={onSubmit} />;
  if (activityKey === "quiz-1" || activityKey === "quiz-2") return <QuizActivity activityKey={activityKey} mode={mode} onSubmit={onSubmit} />;
  if (activity?.imported) return <ImportedActivityPlaceholder activity={activity} />;
  if (activity?.questions?.length || activity?.activityType === "media_video" || activity?.activity_type === "media_video") {
    return <DatabaseActivity activity={activity} mode={mode} onSubmit={onSubmit} onNextActivity={onNextActivity} />;
  }
  return <Card><h2>Demo activity not configured</h2><p>This activity key is ready for future content mapping.</p></Card>;
}

function getBookIdForActivity(activityKey, resolved) {
  if (findStudentsBookImplementation(activityKey)) return "students-book";
  if (activityKey === "listening-page-20") return "workbook";
  if (["grammar-opening", "grammar-ex4"].includes(activityKey)) return "grammar-book";
  if (activityKey === "quiz-1" || activityKey === "quiz-2") return "test-book";
  return resolved?.component?.id || null;
}

function getActivityRouteRole(mode) {
  return mode === "teacher-preview" ? "teacher" : "student";
}

function getBookHashForActivity(activityKey, mode = "student", resolved = null) {
  const bookId = getBookIdForActivity(activityKey, resolved);
  return bookId ? `${getActivityRouteRole(mode)}-book-${bookId}` : `${getActivityRouteRole(mode)}-books`;
}

export function UltimateB2ActivityRunner({ activityKey, exerciseId, activity, mode = "student", onBack, onSubmit, onNextActivity, navigateTo, hideBreadcrumb = false }) {
  const resolved = findUltimateB2Exercise(activityKey || exerciseId);
  const normalized = findStudentsBookImplementation(activityKey || exerciseId);
  const exercise = resolved?.exercise;
  const contentJson = activity?.contentJson || activity?.content_json || {};
  const normalizedKey = normalized?.stableNormalizedId || null;
  const key = normalizedKey || exercise?.stableActivityId || exercise?.activityKey || exercise?.demoActivityKey || activity?.demoActivityKey || contentJson.demoActivityKey || activityKey || exerciseId;
  const studentDenied = mode !== "teacher-preview" && normalized?.availability === "disabled";
  const title = studentDenied ? "Activity unavailable" : activity?.title || exercise?.title || normalized?.title || "Ultimate B2 activity";
  const routeRole = getActivityRouteRole(mode);
  const packageRoute = `${routeRole}-books`;
  const bookRoute = getBookHashForActivity(key, mode, resolved);
  const openRoute = (route) => {
    if (navigateTo) {
      navigateTo(route);
      return;
    }
    onBack?.();
  };
  const backToBook = () => openRoute(bookRoute);

  return (
    <div className="ultimate-activity-runner">
      {!hideBreadcrumb && (
        <nav className="ultimate-activity-nav subpage-nav" aria-label="Activity navigation">
          <button className="ultimate-activity-back subpage-back-button" type="button" onClick={backToBook} data-sound-click="back" aria-label="Back to book">
            <ArrowLeft size={17} />
          </button>
          {resolved && (
            <div className="ultimate-breadcrumb subpage-breadcrumb">
              <button type="button" onClick={() => openRoute(packageRoute)} data-sound-click="tab">Ultimate B2 package</button>
              <button type="button" onClick={() => openRoute(bookRoute)} data-sound-click="tab">{resolved.component.title}</button>
              <button type="button" onClick={() => openRoute(bookRoute)} data-sound-click="tab">{resolved.unit.title}</button>
              <span aria-current="page">{exercise.title}</span>
            </div>
          )}
        </nav>
      )}
      <SectionTitle
        eyebrow={mode === "teacher-preview" ? "Teacher preview" : "Students Book activity"}
        title={title}
        action={<div className="ultimate-runner-tags"><Tag tone="gold">Ultimate B2</Tag><Tag tone="blue">{resolved?.unit.title || `Unit ${normalized?.unitNumber || 2}`}</Tag><Tag tone="green">{mode === "teacher-preview" ? "Preview" : "Student mode"}</Tag></div>}
      />
      {mode === "teacher-preview" && <div className="inline-status">Teacher preview is read-only. Students can submit answers in student mode.</div>}
      <ActivityBody activityKey={key} activity={activity} mode={mode} onSubmit={onSubmit} onNextActivity={onNextActivity} />
    </div>
  );
}

export { ReadingTextAudioScreen } from "./ReadingTextAudioScreen.jsx";
export { Unit2VideoOnlyScreen } from "./Unit2VideoOnlyScreen.jsx";
export { StudentsBookPageGateway } from "./StudentsBookPageGateway.jsx";
export { StudentsBookMediaPlayer } from "./NormalizedStudentsBookActivity.jsx";
