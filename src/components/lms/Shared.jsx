import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import hamiltonHouseLogo from "../../assets/branding/hamilton-house-logo.png";
import { Bell, BookOpen, Building2, Download, GraduationCap, Layers3, LogOut, Search, Settings, ShieldCheck, Sparkles, UserRound, Volume2, VolumeX, Waves } from "lucide-react";
import { useSoundEffects } from "../../context/SoundContext.jsx";

export const roles = {
  student: { label: "Student", icon: UserRound, targetView: "student-course" },
  teacher: { label: "Teacher", icon: GraduationCap, targetView: "teacher-course-editor" },
  admin: { label: "Admin", icon: Building2, targetView: "admin" },
};

export function PageTransition({ children, pageKey }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function displayRole(role) {
  const normalized = String(role ?? "").toLowerCase();
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : "User";
}

export function Header({ activeRole, brand, currentUser, navigateTo, onSignOut }) {
  const { muted, audioReady, volume, toggleMuted, enableSound, setVolume, unlockAudio, playSound } = useSoundEffects();
  const roleLabel = roles[activeRole]?.label ?? "Role selection";

  return (
    <header className="app-header">
      <button className="brand-lockup" onClick={() => navigateTo("home")} aria-label="Return to role selection">
        <span className="brand-logo image-logo">
          <img src={hamiltonHouseLogo} alt="Hamilton House Publishers LMS logo" />
        </span>
        <span>
          <strong>Hamilton House Publishers LMS</strong>
          <small>ELT platform demo</small>
        </span>
      </button>

      <div className="header-context">
        <span className="role-chip">{roleLabel}</span>
        {currentUser && (
          <span className="signed-in-chip">
            Signed in as {currentUser.full_name} / {displayRole(currentUser.role)}
          </span>
        )}
      </div>

      <nav className="quick-actions" aria-label="Demo navigation">
        {Object.entries(roles).map(([id, role]) => {
          const Icon = role.icon;
          return (
            <button key={id} className={activeRole === id ? "is-active" : ""} onClick={() => navigateTo(role.targetView || id)}>
              <Icon size={17} />
              <span>{role.label}</span>
            </button>
          );
        })}
        <button className="nav-secondary-link" onClick={() => navigateTo("home")}>Home</button>
        <button className="nav-secondary-link" onClick={() => navigateTo("flow")}><Layers3 size={15} /> Flow</button>
        <button
          className="nav-secondary-link sound-toggle-button"
          type="button"
          aria-pressed={!muted}
          aria-label={muted ? "Sound Off" : "Sound On"}
          onClick={toggleMuted}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          <span>{muted ? "Sound Off" : "Sound On"}</span>
        </button>
        <button
          className="nav-secondary-link sound-test-button"
          type="button"
          data-sound-ignore="true"
          onClick={async () => {
            if (muted) {
              enableSound();
            }
            await unlockAudio();
            await playSound("clickConfirm");
          }}
          title={audioReady ? "Test UI sound" : "Enable audio and test"}
        >
          <Waves size={16} />
          <span>{audioReady ? "Test Sound" : "Enable Sound"}</span>
        </button>
        <label className="sound-volume-control" title="Sound volume">
          <Volume2 size={15} />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            aria-label="Sound volume"
            onChange={(event) => setVolume(event.target.value)}
          />
          <span>{Math.round(volume * 100)}%</span>
        </label>
        {currentUser && <button onClick={onSignOut} title="Sign out"><LogOut size={17} /><span>Logout</span></button>}
      </nav>
    </header>
  );
}

export function SectionTitle({ eyebrow, title, text, action }) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span className="eyebrow"><Sparkles size={15} /> {eyebrow}</span>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function MetricCard({ label, value, note, icon: Icon = ShieldCheck, delay = 0 }) {
  return (
    <motion.article
      className="metric-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.05, duration: 0.28 }}
    >
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </motion.article>
  );
}

export function Progress({ value, color }) {
  return (
    <div className="progress-track">
      <motion.span
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.75, ease: "easeOut" }}
        style={{ background: color }}
      />
    </div>
  );
}

export function Tag({ children, tone = "blue" }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function ExportButton({ rows }) {
  const [exported, setExported] = useState(false);

  const exportCsv = () => {
    const csv = [
      "Student,Score,Mistakes,Recommendation",
      ...rows.map((row) => `${row.student},${row.score},"${row.mistakes}","${row.recommendation}"`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "hamilton-house-student-performance.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setExported(true);
  };

  return (
    <div className="action-with-status">
      <button className="primary-action" onClick={exportCsv}>
        <Download size={18} /> Export student data
      </button>
      {exported && <small>CSV generated with grades, mistakes, and recommendations.</small>}
    </div>
  );
}

export function HeaderTools() {
  const [activeTool, setActiveTool] = useState("");

  return (
    <div className="header-tools">
      <button title="Search" onClick={() => setActiveTool(activeTool === "search" ? "" : "search")} className={activeTool === "search" ? "active-tool" : ""}><Search size={18} /></button>
      <button title="Notifications" onClick={() => setActiveTool(activeTool === "notifications" ? "" : "notifications")} className={`notification-button ${activeTool === "notifications" ? "active-tool" : ""}`}><Bell size={18} /><span>4</span></button>
      <button title="Settings" onClick={() => setActiveTool(activeTool === "settings" ? "" : "settings")} className={activeTool === "settings" ? "active-tool" : ""}><Settings size={18} /></button>
      {activeTool && <div className="tool-popover">{activeTool === "search" ? "Demo search is ready for books, users, and classes." : activeTool === "notifications" ? "4 demo notifications: assignments, exports, and portal updates." : "Demo settings are controlled from the admin profile panel."}</div>}
    </div>
  );
}

export function PortalPreview({ brand }) {
  const [opened, setOpened] = useState(false);

  return (
    <div className="portal-preview" style={{ "--preview-primary": brand.primary, "--preview-secondary": brand.secondary }}>
      <div className="portal-bar">
        <span className="school-logo image-school-logo">
          <img src={hamiltonHouseLogo} alt="Hamilton House Publishers LMS logo" />
        </span>
        <strong>{brand.schoolName}</strong>
      </div>
      <div className="portal-hero">
        <BookOpen size={24} />
        <h3>English Skills B1</h3>
        <p>3 assigned activities</p>
      </div>
      <div className="portal-progress"><span /></div>
      <button onClick={() => setOpened(!opened)}>{opened ? "Student portal preview opened" : "Open student portal"}</button>
      {opened && <div className="portal-open-state">Student portal uses this logo, color system, book assignment, and notification style.</div>}
    </div>
  );
}
