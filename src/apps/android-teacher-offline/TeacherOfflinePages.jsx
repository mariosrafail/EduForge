import { ChevronLeft, ChevronRight, MonitorPlay, PlayCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function enabledActivities(page) {
  return (page?.activities || []).filter((activity) => activity.availability === "enabled");
}

function activityIdForAction(page, action) {
  const activities = enabledActivities(page);
  const direct = activities.find((activity) => (
    activity.id === action.activityKey || activity.activityKey === action.activityKey
  ));
  if (direct) return direct.id || direct.activityKey;
  const ordinal = action.target === "text-audio"
    ? 2
    : Number(String(action.target || "").match(/^exercise-(\d+)$/)?.[1]);
  if (ordinal) {
    return activities.find((activity) => String(activity.id).endsWith(`-o${ordinal}`))?.id || null;
  }
  return null;
}

function isPositionedAction(action) {
  return [action.top, action.left, action.width, action.height].every(Boolean);
}

export default function TeacherOfflinePages({
  unit,
  selectedPageId,
  onSelectPage,
  onOpenActivity,
  onOpenMedia,
}) {
  const pages = unit?.pages || [];
  const selectedIndex = Math.max(0, pages.findIndex((page) => page.id === selectedPageId));
  const page = pages[selectedIndex] || null;
  const [assetError, setAssetError] = useState("");

  useEffect(() => {
    setAssetError("");
    if (page && page.id !== selectedPageId) onSelectPage(page.id, { replace: true });
  }, [page, selectedPageId, onSelectPage]);

  const actions = useMemo(() => (page?.actions || []).filter((action) => {
    if (action.availability !== "enabled") return false;
    if (action.logicalKey) return true;
    return Boolean(activityIdForAction(page, action));
  }), [page]);

  if (!page) return <section className="teacher-offline-empty">No local pages are installed for this unit.</section>;
  const image = page.images?.[0] || null;
  const openAction = (action) => {
    const activityId = activityIdForAction(page, action);
    if (activityId) {
      onOpenActivity(activityId);
      return;
    }
    if (action.logicalKey) {
      onOpenMedia({
        logicalKey: action.logicalKey,
        type: action.mediaType || action.classification,
        label: action.label,
      });
    }
  };

  return (
    <section className="teacher-offline-pages">
      <aside aria-label={`${unit.title} pages`}>
        <strong>{unit.title} pages</strong>
        <div>
          {pages.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={candidate.id === page.id ? "selected" : ""}
              onClick={() => onSelectPage(candidate.id)}
            >
              {candidate.label || `Page ${candidate.pageNumber}`}
            </button>
          ))}
        </div>
      </aside>

      <div className="teacher-offline-page-reader">
        <header>
          <button type="button" disabled={selectedIndex === 0} onClick={() => onSelectPage(pages[selectedIndex - 1].id)}>
            <ChevronLeft size={22} /> Previous
          </button>
          <div>
            <span>{page.title}</span>
            <strong>{page.label || `Page ${page.pageNumber}`}</strong>
          </div>
          <button type="button" disabled={selectedIndex === pages.length - 1} onClick={() => onSelectPage(pages[selectedIndex + 1].id)}>
            Next <ChevronRight size={22} />
          </button>
        </header>

        <div className="teacher-offline-page-stage">
          {image && !assetError ? (
            <div className="teacher-offline-page-image">
              <img
                key={page.id}
                src={image}
                alt={`${unit.title}, ${page.title}, ${page.label}`}
                loading="eager"
                decoding="async"
                onError={() => setAssetError("This required page asset is unavailable.")}
              />
              {actions.filter(isPositionedAction).map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="teacher-offline-page-hotspot"
                  style={{ top: action.top, left: action.left, width: action.width, height: action.height }}
                  onClick={() => openAction(action)}
                  aria-label={action.ariaLabel || action.label}
                >
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="teacher-offline-asset-error" role="alert">{assetError || "This required page asset is unavailable."}</div>
          )}
        </div>

        <nav className="teacher-offline-page-actions" aria-label="Page activities and media">
          {actions.map((action) => (
            <button key={action.id} type="button" onClick={() => openAction(action)}>
              {action.classification === "activity" ? <MonitorPlay size={19} /> : <PlayCircle size={19} />}
              {action.label}
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}
