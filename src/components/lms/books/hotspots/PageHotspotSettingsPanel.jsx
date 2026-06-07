import { Link2Off, Plus, Trash2 } from "lucide-react";

const actionLabels = {
  none: "No action",
  activity: "Activity",
  media_video: "Video",
  media_audio: "Audio",
  text_panel: "Text panel",
  external_url: "External URL",
  existing_activity: "Existing activity",
};

export function HotspotActionSummary({ hotspot }) {
  const label = actionLabels[hotspot?.actionType || "none"] || hotspot?.actionType || "No action";
  if (!hotspot?.actionTargetId && hotspot?.actionType !== "external_url") return <span>{label}</span>;
  return <span>{label} assigned</span>;
}

export function PageHotspotSettingsPanel({ hotspot, onChange, onDelete, onOpenBuilder }) {
  if (!hotspot) {
    return (
      <aside className="page-hotspot-settings-panel">
        <strong>Hotspot settings</strong>
        <p>Select or draw a hotspot to assign an action.</p>
      </aside>
    );
  }

  const update = (patch) => onChange?.({ ...hotspot, ...patch });
  const clearAction = () => update({ actionType: "none", actionTargetId: null, actionPayload: {} });

  return (
    <aside className="page-hotspot-settings-panel">
      <div className="page-hotspot-settings-header">
        <strong>Hotspot settings</strong>
        <button type="button" onClick={onDelete} aria-label="Delete hotspot"><Trash2 size={15} /></button>
      </div>
      <label>Label
        <input value={hotspot.label || ""} onChange={(event) => update({ label: event.target.value })} />
      </label>
      <label>Action
        <select value={hotspot.actionType || "none"} onChange={(event) => update({ actionType: event.target.value, actionTargetId: null, actionPayload: {} })}>
          <option value="none">No action</option>
          <option value="activity">Activity</option>
          <option value="media_video">Video</option>
          <option value="media_audio">Audio</option>
          <option value="text_panel">Text panel</option>
          <option value="external_url">External URL</option>
          <option value="existing_activity">Existing activity</option>
        </select>
      </label>
      {hotspot.actionType === "external_url" && (
        <label>URL
          <input value={hotspot.actionPayload?.url || ""} onChange={(event) => update({ actionPayload: { ...(hotspot.actionPayload || {}), url: event.target.value } })} placeholder="https://..." />
        </label>
      )}
      <div className="hotspot-action-summary">
        <HotspotActionSummary hotspot={hotspot} />
      </div>
      <div className="page-hotspot-settings-actions">
        <button type="button" onClick={() => onOpenBuilder?.("multiple_choice")}><Plus size={14} /> Multiple choice</button>
        <button type="button" onClick={() => onOpenBuilder?.("open_answer")}><Plus size={14} /> Open answer</button>
        <button type="button" onClick={() => onOpenBuilder?.("typed_gap_fill")}><Plus size={14} /> Gap-fill</button>
        <button type="button" onClick={() => onOpenBuilder?.("media_video")}><Plus size={14} /> Video</button>
        <button type="button" onClick={() => onOpenBuilder?.("media_audio")}><Plus size={14} /> Audio</button>
        <button type="button" onClick={() => onOpenBuilder?.("text_panel")}><Plus size={14} /> Text panel</button>
        <button type="button" onClick={() => onOpenBuilder?.("existing_activity_link")}><Plus size={14} /> Link existing</button>
        <button type="button" onClick={clearAction}><Link2Off size={14} /> Clear action</button>
      </div>
    </aside>
  );
}
