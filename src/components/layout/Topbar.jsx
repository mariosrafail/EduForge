import { Eye, Import, Menu, Plus } from "lucide-react";
import Button from "../ui/Button";

const sectionCopy = {
  dashboard: {
    title: "Αρχική",
    subtitle: "Οργάνωσε γρήγορα το ψηφιακό σου μάθημα.",
  },
  courses: {
    title: "Μαθήματα",
    subtitle: "Διαχειρίσου όλα τα courses και τις ενότητές τους.",
  },
  ai: {
    title: "Δημιουργία με AI",
    subtitle: "Μετέτρεψε ύλη, κείμενα και στόχους σε εκπαιδευτικό περιεχόμενο.",
  },
  activities: {
    title: "Δραστηριότητες",
    subtitle: "Δημιούργησε διαδραστικές ασκήσεις για μαθητές και μαθήτριες.",
  },
  library: {
    title: "Βιβλιοθήκη αρχείων",
    subtitle: "Οργάνωσε εικόνες, ήχους, Word αρχεία και πηγές.",
  },
  exports: {
    title: "Εξαγωγές",
    subtitle: "Προετοίμασε το υλικό για Course Forge, HTML, ZIP ή PDF.",
  },
  settings: {
    title: "Ρυθμίσεις",
    subtitle: "Προσαρμογή πλατφόρμας και προτιμήσεων.",
  },
  preview: {
    title: "Προεπισκόπηση μαθητή",
    subtitle: "Δες πώς θα εμφανίζεται το μάθημα στον τελικό χρήστη.",
  },
};

export default function Topbar({ activeSection, onNewCourse, onImportMaterial, onPreview, onMenu }) {
  const copy = sectionCopy[activeSection] || sectionCopy.dashboard;

  return (
    <header className="topbar">
      <div className="topbar-title-wrap">
        <button className="icon-button mobile-menu" onClick={onMenu} aria-label="Άνοιγμα πλοήγησης">
          <Menu size={20} />
        </button>
        <div>
          <h1 className="page-title">{copy.title}</h1>
          <p className="page-subtitle">{copy.subtitle}</p>
        </div>
      </div>
      <div className="topbar-actions">
        <Button variant="primary" onClick={onNewCourse}>
          <Plus size={18} />
          Νέο μάθημα
        </Button>
        <Button onClick={onImportMaterial}>
          <Import size={18} />
          Εισαγωγή υλικού
        </Button>
        <Button variant="outline" onClick={onPreview}>
          <Eye size={18} />
          Προεπισκόπηση
        </Button>
      </div>
    </header>
  );
}
