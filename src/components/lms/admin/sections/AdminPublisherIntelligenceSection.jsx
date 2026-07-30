import { BarChart3, Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  downloadSchoolAdoptionCsv,
  getSchoolAdoptionSummary,
} from "../../../../services/adoptionReportApi.js";
import { Card } from "../../Shared.jsx";

const cards = [
  ["Redeemed book codes", "redeemedCodes"],
  ["Active learner entitlements", "activeStudentEntitlements"],
  ["Active assignments", "activeAssignments"],
  ["Submitted assignments", "uniqueSubmittedAssignments"],
  ["Average score", "averageScorePercent"],
];

function metricValue(summary, field, phase) {
  if (phase === "loading") return "Loading…";
  if (phase === "error") return "Unavailable";
  const value = summary?.[field];
  if (field === "averageScorePercent") return value === null ? "No scored work" : `${value}%`;
  return String(value ?? 0);
}

export function AdminPublisherIntelligenceSection() {
  const [phase, setPhase] = useState("loading");
  const [report, setReport] = useState(null);
  const [downloadState, setDownloadState] = useState("idle");
  const [detail, setDetail] = useState("");

  const load = useCallback(async () => {
    setPhase("loading");
    setDetail("");
    try {
      setReport(await getSchoolAdoptionSummary());
      setPhase("ready");
    } catch {
      setReport(null);
      setPhase("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const download = async () => {
    if (downloadState === "downloading" || phase !== "ready" || !report?.summary.hasExportableData) return;
    setDownloadState("downloading");
    setDetail("");
    try {
      await downloadSchoolAdoptionCsv();
      setDownloadState("success");
    } catch (error) {
      setDownloadState("error");
      setDetail(error.message || "");
    }
  };

  const summary = report?.summary;
  const exportDisabled = phase !== "ready" || !summary?.hasExportableData || downloadState === "downloading";

  return (
    <section className="admin-section-panel">
      <Card className="publisher-intelligence priority-panel">
        <div className="card-heading">
          <div>
            <span className="eyebrow"><BarChart3 size={15} /> School adoption report</span>
            <h2>Aggregate book adoption data</h2>
            <p>Review activation, entitlement, assignment, submission, and score totals for this school without exporting individual answers.</p>
          </div>
          <button className="secondary-action" type="button" onClick={download} disabled={exportDisabled}>
            <Download size={17} /> {downloadState === "downloading" ? "Preparing CSV…" : "Export adoption data"}
          </button>
        </div>

        {phase === "error" && (
          <div className="inline-status error">
            Adoption data could not be loaded.
            <button className="secondary-action compact-action" type="button" onClick={load}><RefreshCw size={15} /> Retry</button>
          </div>
        )}
        {phase === "ready" && !summary.hasExportableData && (
          <div className="inline-status">No adoption activity has been recorded for this school yet.</div>
        )}
        {downloadState === "success" && <div className="inline-status success">Adoption CSV downloaded.</div>}
        {downloadState === "error" && (
          <div className="inline-status error">
            Adoption CSV could not be downloaded.{detail ? ` ${detail}` : ""}
          </div>
        )}

        <div className="publisher-metric-grid">
          {cards.map(([label, field]) => (
            <article key={field}>
              <small>{label}</small>
              <strong>{metricValue(summary, field, phase)}</strong>
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
}
