const phaseLabels = Object.freeze({
  validating: "Validating content and resolving the latest preview…",
  planning: "Preparing the Viewer asset load plan…",
  "checking-cache": "Checking cached content on this device…",
  "using-cache": "Using cached content…",
});

export default function TeacherViewerStartupStatus({ state, onRetry, hosted = false }) {
  if (state.status === "error") {
    return (
      <main className="teacher-viewer-startup teacher-viewer-startup-error" role="alert">
        <section className="teacher-viewer-startup-card">
          <p className="teacher-viewer-startup-eyebrow">Ultimate B2 Interactive</p>
          <h1>{hosted ? "Viewer could not start" : "Content pack unavailable or damaged"}</h1>
          <p>{state.message}</p>
          <button type="button" className="teacher-viewer-retry" onClick={onRetry}>Retry</button>
        </section>
      </main>
    );
  }

  const progress = state.progress || { completedAssets: 0, totalAssets: 0, percentage: 0 };
  const percentage = Math.min(100, Math.max(0, Number(progress.percentage) || 0));
  const phaseLabel = state.phase === "preparing-updates"
    ? `Preparing ${progress.preparationAssets || 0} updated ${progress.preparationAssets === 1 ? "file" : "files"}…`
    : phaseLabels[state.phase] || "Preparing Viewer…";
  return (
    <main className="teacher-viewer-startup" aria-labelledby="teacher-viewer-startup-title">
      <section className="teacher-viewer-startup-card">
        <p className="teacher-viewer-startup-eyebrow">Hamilton House</p>
        <h1 id="teacher-viewer-startup-title">{hosted ? "Preparing Ultimate B2 Interactive" : "Preparing classroom content"}</h1>
        <p className="teacher-viewer-startup-phase" role="status" aria-live="polite" aria-atomic="true">
          {phaseLabel}
        </p>
        <div
          className="teacher-viewer-progress"
          role="progressbar"
          aria-label="Viewer startup progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={percentage}
          aria-valuetext={`${percentage}% complete`}
        >
          <span style={{ width: `${percentage}%` }} />
        </div>
        <div className="teacher-viewer-progress-copy" aria-hidden="true">
          <strong>{percentage}%</strong>
          {progress.totalAssets > 0 ? (
            <span>
              {progress.cachedAssets > 0 ? `${progress.cachedAssets} cached; ` : ""}
              {progress.completedAssets} of {progress.totalAssets} critical assets ready
            </span>
          ) : <span>Starting…</span>}
        </div>
      </section>
    </main>
  );
}
