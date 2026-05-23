import { BookOpen, Eye, Layers3, Puzzle } from "lucide-react";

export default function StatsOverview({ courses, stats, onPreview }) {
  return (
    <div className="stats-row">
      <div className="stat">
        <BookOpen size={20} />
        <strong>{courses.length}</strong>
        <span>μαθήματα</span>
      </div>
      <div className="stat">
        <Layers3 size={20} />
        <strong>{stats.modules}</strong>
        <span>ενότητες</span>
      </div>
      <div className="stat">
        <Puzzle size={20} />
        <strong>{stats.activities}</strong>
        <span>δραστηριότητες</span>
      </div>
      <button className="stat action-stat" onClick={onPreview}>
        <Eye size={20} />
        <strong>Preview</strong>
        <span>learner mode</span>
      </button>
    </div>
  );
}
