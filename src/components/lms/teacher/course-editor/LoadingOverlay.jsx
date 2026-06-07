export function LoadingOverlay({ label }) {
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
        <span className="puzzle-piece piece-21" />
        <span className="puzzle-piece piece-22" />
        <span className="puzzle-piece piece-23" />
        <span className="puzzle-piece piece-24" />
      </div>
    </div>
  );
}

