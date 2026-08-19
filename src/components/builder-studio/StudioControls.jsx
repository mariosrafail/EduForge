import { useRef } from "react";
import { Check, Minus, Scan, ZoomIn, ZoomOut } from "lucide-react";

export function StudioButton({ variant = "secondary", selected = false, reason = "", className = "", children, ...props }) {
  const title = props.disabled && reason ? reason : props.title;
  return <button {...props} title={title} className={`studio-button studio-button--${variant} ${className}`.trim()} aria-pressed={selected || undefined}>{children}</button>;
}

export function StudioTabs({ value, onChange, tabs, label }) {
  const refs = useRef([]);
  const activate = (index) => { const tab = tabs[index]; if (!tab) return; onChange(tab.id); refs.current[index]?.focus(); };
  return <div className="studio-tabs" role="tablist" aria-label={label} onKeyDown={(event) => {
    const index = tabs.findIndex((tab) => tab.id === value);
    if (event.key === "ArrowRight") { event.preventDefault(); activate((index + 1) % tabs.length); }
    if (event.key === "ArrowLeft") { event.preventDefault(); activate((index - 1 + tabs.length) % tabs.length); }
    if (event.key === "Home") { event.preventDefault(); activate(0); }
    if (event.key === "End") { event.preventDefault(); activate(tabs.length - 1); }
  }}>
    {tabs.map((tab, index) => <button key={tab.id} ref={(node) => { refs.current[index] = node; }} type="button" role="tab" aria-selected={value === tab.id} tabIndex={value === tab.id ? 0 : -1} onClick={() => onChange(tab.id)}>{tab.icon ? <tab.icon aria-hidden="true" /> : null}<span>{tab.label}</span></button>)}
  </div>;
}

export function StudioCanvasToolbar({ zoom, onZoomChange, snap = true, onSnapChange }) {
  return <div className="studio-canvas-toolbar" role="toolbar" aria-label="Canvas controls">
    <StudioButton variant="ghost" aria-label="Zoom out" onClick={() => onZoomChange(Math.max(.5, zoom - .1))}><ZoomOut aria-hidden="true" /></StudioButton>
    <output aria-label="Canvas zoom">{Math.round(zoom * 100)}%</output>
    <StudioButton variant="ghost" aria-label="Zoom in" onClick={() => onZoomChange(Math.min(2, zoom + .1))}><ZoomIn aria-hidden="true" /></StudioButton>
    <StudioButton variant="ghost" onClick={() => onZoomChange(1)}><Scan aria-hidden="true" /> Fit</StudioButton>
    {onSnapChange ? <StudioButton variant="ghost" selected={snap} onClick={() => onSnapChange(!snap)}>{snap ? <Check aria-hidden="true" /> : <Minus aria-hidden="true" />} Snap</StudioButton> : null}
  </div>;
}

export function StudioField({ label, hint, className = "", children }) {
  return <label className={`studio-field ${className}`.trim()}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

export function StudioStatus({ dirty, saving, message }) {
  return <span className="studio-save-status" data-state={saving ? "saving" : dirty ? "dirty" : "saved"} role="status"><span aria-hidden="true" />{saving ? "Saving…" : dirty ? "Unsaved changes" : message}</span>;
}
