import { BookOpen, Copy, Download, Eye, FilePenLine, GraduationCap, Layers3, MoreHorizontal, Package, Puzzle, Settings, Zap } from "lucide-react";
import { useState } from "react";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Card from "../ui/Card";

const iconMap = {
  book: BookOpen,
  zap: Zap,
  scroll: FilePenLine,
  settings: Settings,
  leaf: GraduationCap,
};

const moreOptions = [
  { label: "Μετονομασία", icon: FilePenLine },
  { label: "Αντιγραφή", icon: Copy },
  { label: "Εξαγωγή", icon: Download },
  { label: "Αρχειοθέτηση", icon: Package },
];

function formatDate(value) {
  return new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export default function CourseCard({ course, selected, onOpen, onPreview }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const Icon = iconMap[course.iconType] || BookOpen;
  const modulesCount = course.modulesCount ?? course.modules ?? 0;
  const activitiesCount = course.activitiesCount ?? course.activities ?? 0;
  const progress = course.progress ?? 0;

  return (
    <Card as="article" interactive className={`course-card course-card-${course.accentColor || "blue"} ${selected ? "selected" : ""}`}>
      <div className="course-card-top">
        <div className="course-subject-icon">
          <Icon size={20} />
        </div>
        <Badge>{course.status}</Badge>
      </div>

      <div className="course-main">
        <h3>{course.title}</h3>
        <p>{course.description}</p>
      </div>

      <div className="course-tags">
        <span>{course.subject}</span>
        <span>{course.level}</span>
      </div>

      <div className="course-stats-row">
        <span>
          <Layers3 size={15} />
          {modulesCount} ενότητες
        </span>
        <span>
          <Puzzle size={15} />
          {activitiesCount} δραστηριότητες
        </span>
      </div>

      <div className="course-progress-block">
        <div>
          <span>Πρόοδος</span>
          <strong>{progress}%</strong>
        </div>
        <div className="course-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="course-footer">
        <span>Ενημερώθηκε {formatDate(course.updatedAt)}</span>
      </div>

      <div className="card-actions course-actions">
        <Button size="sm" onClick={() => onOpen(course)}>
          <BookOpen size={16} />
          Άνοιγμα
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onPreview(course)}>
          <Eye size={16} />
          Προεπισκόπηση
        </Button>
        <div className="course-more">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMenuOpen((current) => !current)}
            aria-expanded={menuOpen}
            aria-label={`Περισσότερες επιλογές για ${course.title}`}
          >
            <MoreHorizontal size={16} />
            Περισσότερα
          </Button>
          {menuOpen && (
            <div className="course-menu">
              {moreOptions.map(({ label, icon: OptionIcon }) => (
                <button key={label} onClick={() => setMenuOpen(false)}>
                  <OptionIcon size={15} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
