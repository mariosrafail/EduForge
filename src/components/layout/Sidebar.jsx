import {
  BookOpen,
  CheckCircle2,
  Download,
  FolderOpen,
  Home,
  PanelLeftClose,
  Puzzle,
  Settings,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import BrandLogo from "../brand/BrandLogo";

const navItems = [
  { id: "dashboard", label: "Αρχική", icon: Home },
  { id: "courses", label: "Μαθήματα", icon: BookOpen },
  { id: "ai", label: "Δημιουργία με AI", icon: WandSparkles },
  { id: "activities", label: "Δραστηριότητες", icon: Puzzle },
  { id: "library", label: "Βιβλιοθήκη αρχείων", icon: FolderOpen },
  { id: "exports", label: "Εξαγωγές", icon: Download },
  { id: "settings", label: "Ρυθμίσεις", icon: Settings },
];

export default function Sidebar({ activeSection, onSelect, open, onClose }) {
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="sidebar-brand-row">
        <BrandLogo size="md" />
        <span className="sidebar-badge">MVP</span>
        <button className="icon-button mobile-only" onClick={onClose} aria-label="Κλείσιμο πλοήγησης">
          <PanelLeftClose size={18} />
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Κύρια πλοήγηση">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${activeSection === id ? "active" : ""}`}
            onClick={() => {
              onSelect(id);
              onClose();
            }}
            aria-current={activeSection === id ? "page" : undefined}
          >
            <span className="nav-indicator" aria-hidden="true" />
            <Icon size={19} />
            {label}
          </button>
        ))}
      </nav>

      <div className="sidebar-note">
        <ShieldCheck size={18} />
        <div>
          <strong>Έτοιμο για Moodle</strong>
          <p>Εξαγωγή μαθημάτων σε HTML, ZIP και PDF πακέτα.</p>
          <div className="sidebar-chip-row">
            {["HTML", "Moodle", "ZIP", "PDF"].map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
        </div>
        <CheckCircle2 className="sidebar-note-check" size={16} />
      </div>
    </aside>
  );
}
