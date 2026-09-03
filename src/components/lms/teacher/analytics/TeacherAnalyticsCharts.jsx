import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { analyticsColors, chartMotion, chartPercent } from "./analyticsPresentation.js";

export function AccessibleDonutChart({ title, description, items = [], centerValue, centerLabel }) {
  const titleId = useId();
  const descriptionId = useId();
  const reducedMotion = useReducedMotion();
  const total = items.reduce((sum, item) => sum + Number(item.count || 0), 0);
  let offset = 0;
  const motionSettings = chartMotion(reducedMotion);
  return (
    <section className="teacher-analytics-chart teacher-analytics-donut-card" aria-labelledby={titleId}>
      <div className="teacher-analytics-chart-heading"><h3 id={titleId}>{title}</h3>{description && <p id={descriptionId}>{description}</p>}</div>
      <div className="teacher-analytics-donut-layout">
        <div className="teacher-analytics-donut-wrap">
          <svg viewBox="0 0 120 120" role="img" aria-labelledby={description ? `${titleId} ${descriptionId}` : titleId}>
            <title>{title}</title><desc>{description || `${total} total items`}</desc>
            <circle className="teacher-analytics-donut-track" cx="60" cy="60" r="46" pathLength="100" />
            {total > 0 && items.map((item) => {
              const percent = Number(item.count || 0) / total * 100;
              const segmentOffset = offset;
              offset += percent;
              return (
                <motion.circle
                  key={item.id}
                  className="teacher-analytics-donut-segment"
                  cx="60" cy="60" r="46" pathLength="100"
                  stroke={analyticsColors[item.id] || "var(--analytics-neutral)"}
                  strokeDasharray={`${percent} ${100 - percent}`}
                  strokeDashoffset={-segmentOffset}
                  initial={motionSettings.initial === false ? false : { opacity: 0, strokeDasharray: `0 ${100}` }}
                  animate={{ opacity: 1, strokeDasharray: `${percent} ${100 - percent}` }}
                  transition={motionSettings.transition}
                />
              );
            })}
          </svg>
          <div className="teacher-analytics-donut-center" aria-hidden="true"><strong>{centerValue ?? total}</strong><span>{centerLabel || "total"}</span></div>
        </div>
        <dl className="teacher-analytics-legend">
          {items.map((item) => (
            <div key={item.id}><dt><i style={{ background: analyticsColors[item.id] || "var(--analytics-neutral)" }} />{item.label}</dt><dd>{item.count} <span>({chartPercent(item.count, total)}%)</span></dd></div>
          ))}
        </dl>
      </div>
      {total === 0 && <p className="teacher-analytics-empty">No data is available for this selection.</p>}
    </section>
  );
}

export function ScoreDistributionChart({ bands = [], notScored = 0 }) {
  const titleId = useId();
  const reducedMotion = useReducedMotion();
  const maximum = Math.max(1, ...bands.map((band) => Number(band.count || 0)));
  return (
    <section className="teacher-analytics-chart" aria-labelledby={titleId}>
      <div className="teacher-analytics-chart-heading"><h3 id={titleId}>Score distribution</h3><p>Authoritative scored submissions by presentation band.</p></div>
      <div className="teacher-score-bars" role="img" aria-label={`Score distribution. ${bands.map((band) => `${band.label}: ${band.count}`).join("; ")}. Not scored: ${notScored}.`}>
        {bands.map((band) => (
          <div key={band.id} className="teacher-score-bar-row">
            <span>{band.label}</span>
            <div><motion.i style={{ background: analyticsColors[band.id] }} initial={reducedMotion ? false : { width: 0 }} animate={{ width: `${Number(band.count || 0) / maximum * 100}%` }} transition={reducedMotion ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }} /></div>
            <strong>{band.count}</strong>
          </div>
        ))}
      </div>
      <p className="teacher-analytics-note">Not scored or awaiting review: <strong>{notScored}</strong></p>
    </section>
  );
}

export function PerformanceTrendChart({ trend = { points: [], insufficientData: true } }) {
  const titleId = useId();
  const descriptionId = useId();
  const reducedMotion = useReducedMotion();
  const points = trend.points || [];
  const scoredPoints = points.map((point, index) => ({ ...point, index })).filter((point) => point.averageScore !== null && point.averageScore !== undefined);
  const coordinates = scoredPoints.map((point) => {
    const x = points.length <= 1 ? 210 : 34 + point.index / (points.length - 1) * 352;
    const y = 132 - Number(point.averageScore) * 1.02;
    return { ...point, x, y };
  });
  const pointList = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <section className="teacher-analytics-chart teacher-trend-chart" aria-labelledby={titleId}>
      <div className="teacher-analytics-chart-heading"><h3 id={titleId}>Recent performance</h3><p id={descriptionId}>Weekly scored average and final submissions.</p></div>
      {trend.insufficientData || coordinates.length < 2 ? (
        <div className="teacher-analytics-empty">At least two scored weeks are needed to show a performance trend.</div>
      ) : (
        <>
          <svg viewBox="0 0 420 160" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
            <title>Recent weekly average score trend</title><desc>{coordinates.map((point) => `${point.label}: ${point.averageScore}% average from ${point.scoredCount} scored submissions`).join("; ")}</desc>
            {[0, 25, 50, 75, 100].map((value) => <g key={value}><line x1="34" x2="386" y1={132 - value * 1.02} y2={132 - value * 1.02} /><text x="4" y={136 - value * 1.02}>{value}</text></g>)}
            <motion.polyline points={pointList} initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={reducedMotion ? { duration: 0 } : { duration: 0.55, ease: "easeOut" }} />
            {coordinates.map((point) => <circle key={`${point.periodStart}`} cx={point.x} cy={point.y} r="4"><title>{point.label}: {point.averageScore}%</title></circle>)}
          </svg>
          <ol className="teacher-trend-text-equivalent">
            {points.map((point) => <li key={`${point.periodStart}`}><span>{point.label}</span><strong>{point.averageScore == null ? "No scored work" : `${point.averageScore}% average`}</strong><small>{point.submitted} submitted</small></li>)}
          </ol>
        </>
      )}
    </section>
  );
}
