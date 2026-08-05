import { GitBranch } from "lucide-react";

import { Field } from "./StudioPrimitives.jsx";

export function HierarchyNavigator({ filters, component, unit, onComponentChange, onUnitChange, compact = true }) {
  const componentOptions = filters.componentOptions || [];
  const unitOptions = filters.unitOptions || [];
  const selectedComponent = componentOptions.find((item) => item.value === component) || null;
  return <section className={`studio-hierarchy-navigator${compact ? " compact" : ""}`} aria-label="Book hierarchy navigation">
    <div className="studio-hierarchy-title"><GitBranch aria-hidden="true" /><div><span className="studio-eyebrow">Book hierarchy</span><strong>Component first, then Unit or group</strong></div></div>
    <Field label="Component / book section"><select value={component} onChange={(event) => onComponentChange(event.target.value)}><option value="">All components (Unit filter disabled)</option>{componentOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
    <Field label="Unit / group"><select value={unit} disabled={!filters.unitFilterEnabled} onChange={(event) => onUnitChange(event.target.value)}><option value="">{selectedComponent ? `All ${selectedComponent.groupingKind === "numbered_units" ? "Units" : "groups"}` : "Select a component first"}</option>{unitOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
    <div className="studio-hierarchy-context">{selectedComponent ? <><strong>{selectedComponent.label}</strong><span>Raw source: {selectedComponent.sourceComponentName}</span><span>{selectedComponent.effectiveRole || "unresolved role"} · {selectedComponent.groupingKind.replaceAll("_", " ")} · {selectedComponent.decisionState.replaceAll("_", " ")}{selectedComponent.stale ? " · stale" : ""}</span></> : <span>Select a component to scope its independent Unit/group identities.</span>}</div>
  </section>;
}
