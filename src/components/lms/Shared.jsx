import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Bell, BookOpen, Building2, Download, GraduationCap, KeyRound, LogOut, Search, Settings, ShieldCheck, Sparkles, UserRound } from "lucide-react";

export const roles = {
  student: { label: "Student", icon: UserRound, targetView: "student" },
  teacher: { label: "Teacher", icon: GraduationCap, targetView: "teacher" },
  admin: { label: "School Admin", icon: Building2, targetView: "admin" },
};

export function PageTransition({ children, pageKey }) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function displayRole(role) {
  const normalized = String(role ?? "").toLowerCase();
  if (normalized === "admin") return "School Admin";
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : "User";
}

export function Header({ activeRole, brand, currentUser, navigateTo, onSignOut, showSignOut = true }) {
  const roleLabel = roles[activeRole]?.label ?? "Role selection";

  return (
    <header className="app-header public-app-header">
      <button className="brand-lockup" onClick={() => navigateTo("home")} aria-label="Return to role selection">
        <span className="brand-logo">{brand?.logo || "HH"}</span>
        <span>
          <strong>Hamilton House</strong>
          <small>{brand?.schoolName || "School workspace"}</small>
        </span>
      </button>
      <div className="public-header-context">
        <span className="role-chip">{roleLabel}</span>
        {currentUser && <span className="signed-in-chip">{currentUser.full_name} ({displayRole(currentUser.role)})</span>}
      </div>
      {showSignOut && onSignOut && (
        <div className="public-header-actions">
          {currentUser && (
            <button type="button" onClick={() => navigateTo("account-security")}>
              <KeyRound size={16} /><span>Account security</span>
            </button>
          )}
          <button className="header-logout-button" type="button" onClick={onSignOut} data-sound-click="tab">
            <LogOut size={17} /><span>Sign out</span>
          </button>
        </div>
      )}
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

export function Card({ children, className = "", ...props }) {
  return <section className={`panel ${className}`} {...props}>{children}</section>;
}

export function MetricCard({ label, value, note, icon: Icon = ShieldCheck, delay = 0 }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.article
      className="metric-card"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay * 0.05, duration: reduceMotion ? 0 : 0.28 }}
    >
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </motion.article>
  );
}

export function Progress({ value, color }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="progress-track">
      <motion.span
        initial={reduceMotion ? false : { width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: reduceMotion ? 0 : 0.75, ease: "easeOut" }}
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
              {activeTool && <div className="tool-popover">{activeTool === "search" ? "Demo search is ready for Ultimate B2 books, users, and classes." : activeTool === "notifications" ? "4 Hamilton House demo notifications: assigned book exercises, exports, and portal updates." : "Demo settings are controlled from the school profile panel."}</div>}
    </div>
  );
}

export function PortalPreview({ brand }) {
  const [opened, setOpened] = useState(false);

  return (
    <div className="portal-preview" style={{ "--preview-primary": brand.primary, "--preview-secondary": brand.secondary }}>
      <div className="portal-bar">
        <span className="school-logo" aria-hidden="true">{brand.logo || "HH"}</span>
        <strong>{brand.schoolName}</strong>
      </div>
      <div className="portal-hero">
        <BookOpen size={24} />
        <h3>Ultimate B2 Students Book</h3>
        <p>3 assigned book exercises</p>
      </div>
      <div className="portal-progress"><span /></div>
      <button onClick={() => setOpened(!opened)}>{opened ? "Student portal preview opened" : "Open student portal"}</button>
      {opened && <div className="portal-open-state">Student portal uses this logo, color system, Ultimate B2 package assignment, and notification style.</div>}
    </div>
  );
}
