import { AlertTriangle, Inbox, LoaderCircle, RefreshCw } from "lucide-react";

export function StudioLoading({ label = "Loading review data…" }) {
  return <div className="studio-state" role="status" aria-live="polite"><LoaderCircle className="studio-spin" aria-hidden="true" /><p>{label}</p></div>;
}

export function StudioError({ error, onRetry, title = "This view is unavailable" }) {
  return (
    <div className="studio-state studio-state-error" role="alert">
      <AlertTriangle aria-hidden="true" />
      <h2>{title}</h2>
      <p>{error?.message || "The local review data could not be loaded."}</p>
      {onRetry && <button type="button" className="studio-button secondary" onClick={onRetry}><RefreshCw aria-hidden="true" /> Retry</button>}
    </div>
  );
}

export function StudioEmpty({ title, children }) {
  return <div className="studio-state studio-state-empty"><Inbox aria-hidden="true" /><h2>{title}</h2>{children && <p>{children}</p>}</div>;
}

export function AvailabilityNotice({ children }) {
  return <div className="studio-inline-notice" role="status"><AlertTriangle aria-hidden="true" /><span>{children}</span></div>;
}
