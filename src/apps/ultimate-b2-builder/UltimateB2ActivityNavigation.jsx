import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

export function UltimateB2ActivityNavigation({ groups, selectedActivityId, onSelect }) {
  const selected = groups.flatMap((unit) => unit.pages.flatMap((page) => page.activities)).find((activity) => activity.activityKey === selectedActivityId);
  const selectedPage = groups.flatMap((unit) => unit.pages).find((page) => page.activities.some((activity) => activity.activityKey === selectedActivityId));
  const [expandedUnits, setExpandedUnits] = useState(() => new Set([selected?.unitNumber || 1]));
  const [expandedPages, setExpandedPages] = useState(() => new Set(selectedPage ? [selectedPage.key] : []));

  useEffect(() => {
    if (!selected || !selectedPage) return;
    setExpandedUnits((current) => new Set([...current, selected.unitNumber]));
    setExpandedPages((current) => new Set([...current, selectedPage.key]));
  }, [selected, selectedPage]);

  const toggle = (setter, key) => setter((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <aside className="activity-builder-sidebar" aria-label="Activity Builder book navigation">
      <header><span>Students Book</span><strong>Unit → Page / Spread → Exercise</strong></header>
      <div className="activity-builder-navigation-scroll">
        {groups.map((unit) => {
          const expanded = expandedUnits.has(unit.unitNumber);
          return <section className="activity-builder-unit" key={unit.unitNumber}>
            <button className="activity-builder-unit-toggle" type="button" aria-expanded={expanded} onClick={() => toggle(setExpandedUnits, unit.unitNumber)}>
              {expanded ? <ChevronDown /> : <ChevronRight />}<span>{unit.label}</span>
            </button>
            {expanded && <div className="activity-builder-pages">
              {unit.pages.map((page) => {
                const pageExpanded = expandedPages.has(page.key);
                return <section className="activity-builder-page" key={page.key}>
                  <button className="activity-builder-page-toggle" type="button" aria-expanded={pageExpanded} onClick={() => toggle(setExpandedPages, page.key)}>
                    {pageExpanded ? <ChevronDown /> : <ChevronRight />}
                    <span><strong>{page.pageLabel}</strong><small>{page.sectionTitle}</small></span>
                  </button>
                  {pageExpanded && <div className="activity-builder-exercises">
                    {page.activities.map((activity) => <button
                      type="button"
                      key={activity.activityKey}
                      className="activity-builder-exercise"
                      aria-current={selectedActivityId === activity.activityKey ? "page" : undefined}
                      disabled={!activity.configurable}
                      onClick={() => onSelect(activity.activityKey)}
                    >
                      <span><strong>{activity.exerciseLabel}</strong><small>{activity.editorLabel || (activity.title.split("·").at(-1)?.trim() === activity.exerciseLabel ? "Activity" : activity.title.split("·").at(-1)?.trim())}</small></span>
                      <em>{activity.editorStatus}</em>
                    </button>)}
                  </div>}
                </section>;
              })}
            </div>}
          </section>;
        })}
      </div>
    </aside>
  );
}
