import { AlertTriangle, BarChart3, CheckCircle2, ClipboardCheck, Clock3, Gauge, UsersRound } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Card, Tag } from "../../Shared.jsx";
import { metricLabel } from "./analyticsPresentation.js";
import { AccessibleDonutChart, PerformanceTrendChart, ScoreDistributionChart } from "./TeacherAnalyticsCharts.jsx";

export function TeacherAnalyticsFilters({ filters, updateFilter, options = {}, compact = false }) {
  const assignments = (options.assignments || []).filter((item) => !filters.classId || !item.classId || String(item.classId) === String(filters.classId));
  const components = (options.components || []).filter((item) => !filters.packageId || String(item.packageId) === String(filters.packageId));
  return (
    <div className={`teacher-analytics-filters ${compact ? "compact" : ""}`} aria-label="Performance filters">
      <label>Class<select value={filters.classId} onChange={(event) => updateFilter("classId", event.target.value)}><option value="">All accessible classes</option>{(options.classes || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {!compact && <label>Assignment<select value={filters.assignmentId} onChange={(event) => updateFilter("assignmentId", event.target.value)}><option value="">All assignments</option>{assignments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      {!compact && <label>Book<select value={filters.packageId} onChange={(event) => updateFilter("packageId", event.target.value)}><option value="">All books</option>{(options.packages || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      {!compact && <label>Component<select value={filters.componentId} onChange={(event) => updateFilter("componentId", event.target.value)}><option value="">All components</option>{components.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      {!compact && <label>Status<select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>{(options.statuses || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      <label>Time window<select value={filters.window} onChange={(event) => updateFilter("window", event.target.value)}>{(options.windows || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </div>
  );
}

const kpis = [
  { key: "averageScore", label: "Class average", icon: Gauge, suffix: "%" },
  { key: "medianScore", label: "Median score", icon: BarChart3, suffix: "%" },
  { key: "completionRate", label: "Completion", icon: CheckCircle2, suffix: "%" },
  { key: "submitted", label: "Submitted", icon: ClipboardCheck, denominator: "assignedSlots" },
  { key: "awaitingReview", label: "Awaiting review", icon: Clock3 },
  { key: "missing", label: "Missing", icon: AlertTriangle },
];

export function AnalyticsKpis({ overview = {} }) {
  const reducedMotion = useReducedMotion();
  return <section className="teacher-analytics-kpis" aria-label="Performance overview">{kpis.map(({ key, label, icon: Icon, suffix, denominator }, index) => (
    <motion.article key={key} className="panel" initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reducedMotion ? { duration: 0 } : { duration: 0.25, delay: index * 0.035 }}>
      <Icon size={18} aria-hidden="true" /><strong>{denominator ? `${overview[key] || 0}/${overview[denominator] || 0}` : metricLabel(overview[key], suffix)}</strong><span>{label}</span>
    </motion.article>
  ))}</section>;
}

export function TeacherPerformancePanel({ filters, updateFilter, state, hideFilters = false }) {
  const data = state.data;
  if (state.loading && !data) return <Card><div className="teacher-loading-state" role="status">Loading performance analytics…</div></Card>;
  if (state.error && !data) return <Card><div className="inline-status error" role="alert">{state.error}</div></Card>;
  if (!data) return null;
  const overview = data.overview || {};
  return (
    <section className="teacher-performance-panel" aria-label="Performance and progress analytics" aria-busy={state.loading || undefined}>
      {!hideFilters && <Card><div className="teacher-analytics-heading"><div><span className="eyebrow"><UsersRound size={15} /> Performance filters</span><h2>Choose the cohort and work to compare.</h2></div>{state.loading ? <Tag tone="blue">Updating…</Tag> : <Tag tone="green">Live data</Tag>}</div><TeacherAnalyticsFilters filters={filters} updateFilter={updateFilter} options={data.filters?.options} /></Card>}
      {state.error && <div className="inline-status warning" role="alert">Showing the last loaded analytics. {state.error}</div>}
      <AnalyticsKpis overview={overview} />
      <div className="teacher-analytics-chart-grid">
        <AccessibleDonutChart title="Submission status" description={`${overview.submitted || 0} final submissions across ${overview.assignedSlots || 0} assigned slots.`} items={data.statusDistribution} centerValue={`${overview.completionRate || 0}%`} centerLabel="complete" />
        <AccessibleDonutChart title="Score bands" description="Distribution of authoritative numeric scores." items={data.scoreBands} centerValue={overview.scoredCount || 0} centerLabel="scored" />
        <ScoreDistributionChart bands={data.scoreBands} notScored={data.notScored} />
        <PerformanceTrendChart trend={data.trend} />
      </div>
      <Card className="teacher-attention-panel">
        <div className="teacher-analytics-heading"><div><span className="eyebrow"><AlertTriangle size={15} /> Attention</span><h2>Explainable follow-up</h2><p>Based only on missing work, no submissions, or the selected group’s bottom scored quartile.</p></div><Tag tone={data.attention?.length ? "gold" : "green"}>{data.attention?.length || 0} students</Tag></div>
        {!data.attention?.length ? <div className="teacher-analytics-empty">No students meet the attention rules for this selection.</div> : <ul>{data.attention.map((item) => <li key={item.studentId}><strong>{item.name}</strong><span>{item.reasons.join(" · ")}</span></li>)}</ul>}
      </Card>
      <details className="teacher-analytics-definitions"><summary>How these metrics are calculated</summary><dl>{Object.entries(data.definitions || {}).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value}</dd></div>)}</dl></details>
    </section>
  );
}
