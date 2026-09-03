import { ArrowRight, Clock3 } from "lucide-react";
import { Card, Tag } from "../../Shared.jsx";
import { AccessibleDonutChart, PerformanceTrendChart } from "./TeacherAnalyticsCharts.jsx";
import { TeacherAnalyticsFilters } from "./TeacherPerformancePanel.jsx";
import { useTeacherGradeAnalytics } from "./useTeacherGradeAnalytics.js";

export function TeacherPerformanceSnapshot({ onOpen }) {
  const analytics = useTeacherGradeAnalytics();
  const data = analytics.state.data;
  return (
    <Card className="teacher-performance-snapshot">
      <div className="teacher-analytics-heading"><div><span className="eyebrow">Performance snapshot</span><h2>Class progress at a glance.</h2><p>Numeric statistics use scored final submissions only.</p></div><button className="secondary-action compact-action" type="button" onClick={onOpen}>Open full analytics <ArrowRight size={16} /></button></div>
      {analytics.state.loading && !data && <div className="teacher-loading-state" role="status">Loading performance snapshot…</div>}
      {analytics.state.error && !data && <div className="inline-status warning">{analytics.state.error}</div>}
      {data && <>
        <TeacherAnalyticsFilters compact filters={analytics.filters} updateFilter={analytics.updateFilter} options={data.filters?.options} />
        <div className="teacher-snapshot-grid">
          <AccessibleDonutChart title="Average score" description={`${data.overview.scoredCount} scored final submissions.`} items={data.scoreBands} centerValue={data.overview.averageScore == null ? "—" : `${data.overview.averageScore}%`} centerLabel="average" />
          <AccessibleDonutChart title="Completion" description={`${data.overview.submitted} of ${data.overview.assignedSlots} assigned slots submitted.`} items={data.statusDistribution} centerValue={`${data.overview.completionRate || 0}%`} centerLabel="complete" />
          <div className="teacher-snapshot-review"><Clock3 size={22} /><strong>{data.overview.awaitingReview}</strong><span>Awaiting teacher review</span><Tag tone={data.overview.awaitingReview ? "gold" : "green"}>{data.overview.awaitingReview ? "Action needed" : "Up to date"}</Tag></div>
          <PerformanceTrendChart trend={data.trend} />
        </div>
      </>}
    </Card>
  );
}
