import { Download, Eye, Layers3, Plus, Puzzle, UploadCloud } from "lucide-react";
import BrandLogo from "../brand/BrandLogo";
import Button from "../ui/Button";
import Card from "../ui/Card";

const workflowCards = [
  {
    title: "Ανέβασε υλικό",
    description: "Συγκέντρωσε Word, PDF, εικόνες και ήχους στη βιβλιοθήκη.",
    section: "library",
    icon: UploadCloud,
    tone: "blue",
  },
  {
    title: "Δημιούργησε ενότητες",
    description: "Μετέτρεψε την ύλη σε δομημένα κεφάλαια και στόχους.",
    section: "ai",
    icon: Layers3,
    tone: "indigo",
  },
  {
    title: "Πρόσθεσε δραστηριότητες",
    description: "Χτίσε διαδραστικές ασκήσεις για την τάξη.",
    section: "activities",
    icon: Puzzle,
    tone: "green",
  },
  {
    title: "Κάνε εξαγωγή",
    description: "Προετοίμασε Moodle-ready HTML, PDF ή ZIP πακέτο.",
    section: "exports",
    icon: Download,
    tone: "orange",
  },
];

export default function DashboardHome({ setActiveSection, onNewCourse, onPreview }) {
  return (
    <section className="dashboard-home">
      <Card className="welcome-card branded-welcome" padding="lg">
        <div className="welcome-copy">
          <BrandLogo size="sm" />
          <span className="section-kicker">Course Forge</span>
          <h2>Δημιούργησε ψηφιακά μαθήματα πιο γρήγορα</h2>
          <p>
            Ανέβασε υλικό, οργάνωσε ενότητες, δημιούργησε δραστηριότητες και εξήγαγε έτοιμα πακέτα για Moodle ή standalone HTML.
          </p>
          <div className="welcome-actions">
            <Button variant="primary" size="lg" onClick={onNewCourse}>
              <Plus size={18} />
              Ξεκίνα νέο μάθημα
            </Button>
            <Button variant="outline" size="lg" onClick={onPreview}>
              <Eye size={18} />
              Δες προεπισκόπηση
            </Button>
          </div>
        </div>

        <div className="course-structure-preview" aria-label="Προεπισκόπηση δομής μαθήματος">
          <div className="preview-card-head">
            <span>Course structure</span>
            <strong>72%</strong>
          </div>
          <div className="mini-progress">
            <span style={{ width: "72%" }} />
          </div>
          <div className="structure-list">
            {["Εισαγωγή", "Θεωρία και παραδείγματα", "Δραστηριότητες"].map((item, index) => (
              <div key={item} className="structure-row">
                <span>{index + 1}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
          <div className="activity-chip-row">
            <span>Quiz</span>
            <span>Drag & Drop</span>
            <span>PDF</span>
          </div>
        </div>
      </Card>

      <div className="workflow-grid">
        {workflowCards.map(({ title, description, section, icon: Icon, tone }, index) => (
          <button key={title} className="workflow-card" onClick={() => setActiveSection(section)}>
            <div className={`step-icon ${tone}`}>
              <Icon size={22} />
            </div>
            <span>Βήμα {index + 1}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
