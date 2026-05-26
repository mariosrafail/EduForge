import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import hamiltonHouseLogo from "../../assets/branding/hamilton-house-logo.png";
import { Bell, BookOpen, Building2, Download, GraduationCap, LogOut, Menu, Search, Settings, ShieldCheck, Sparkles, UserRound, Volume2, VolumeX, Waves, X } from "lucide-react";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobileNav, setIsMobileNav] = useState(() => (typeof window === "undefined" ? false : window.matchMedia("(max-width: 1100px)").matches));
  const roleLabel = roles[activeRole]?.label ?? "Role selection";

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 1100px)");
    const syncMobileNav = () => {
      setIsMobileNav(mediaQuery.matches);
      if (!mediaQuery.matches) {
        setMobileMenuOpen(false);
      }
    };

    syncMobileNav();
    mediaQuery.addEventListener("change", syncMobileNav);

    return () => {
      mediaQuery.removeEventListener("change", syncMobileNav);
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen || !isMobileNav) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    document.body.classList.add("mobile-nav-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("mobile-nav-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileNav, mobileMenuOpen]);

  const handleNavigate = (nextView) => {
    navigateTo(nextView);
    setMobileMenuOpen(false);
  };

  const testSound = async () => {
    if (muted) {
      enableSound();
    }
    await unlockAudio();
    await playSound("clickConfirm");
  };

  return (
    <>
      <header className="app-header">
        {isMobileNav && (
          <button
            className="mobile-menu-toggle"
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={22} />
          </button>
        )}

        <button className="brand-lockup text-only" onClick={() => handleNavigate("home")} aria-label="Return to role selection">
          <span>
            <strong>Hamilton House Publishers LMS</strong>
            <small>ELT platform demo</small>
          </span>
        </button>

        {!isMobileNav && (
          <>
            <div className="header-context">
              <span className="role-chip">{roleLabel}</span>
              {currentUser && (
                <span className="signed-in-chip">
                  Signed in as {currentUser.full_name} / {displayRole(currentUser.role)}
                </span>
              )}
            </div>

            <nav className="quick-actions desktop-header-actions" aria-label="Demo navigation">
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
                onClick={testSound}
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
          </>
        )}

        {isMobileNav && (
          <button
            className="mobile-sound-status"
            type="button"
            aria-pressed={!muted}
            aria-label={muted ? "Sound Off" : "Sound On"}
            onClick={toggleMuted}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        )}
      </header>

      {isMobileNav && (
        <button
          className={`mobile-menu-backdrop ${mobileMenuOpen ? "open" : ""}`}
          type="button"
          aria-label="Close navigation menu"
          tabIndex={mobileMenuOpen ? 0 : -1}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      {isMobileNav && (
        <aside className={`mobile-nav-drawer ${mobileMenuOpen ? "open" : ""}`} aria-hidden={!mobileMenuOpen}>
        <div className="mobile-nav-header">
          <div>
            <strong>Hamilton House LMS</strong>
            <small>{roleLabel}</small>
          </div>
          <button className="mobile-nav-close" type="button" aria-label="Close navigation menu" onClick={() => setMobileMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="mobile-nav-items" aria-label="Mobile navigation">
          {Object.entries(roles).map(([id, role]) => {
            const Icon = role.icon;
            return (
              <button key={id} className={`mobile-nav-button ${activeRole === id ? "active" : ""}`} onClick={() => handleNavigate(role.targetView || id)}>
                <Icon size={18} />
                <span>{role.label}</span>
              </button>
            );
          })}
          <button className={`mobile-nav-button ${activeRole === "home" ? "active" : ""}`} onClick={() => handleNavigate("home")}>
            <BookOpen size={18} />
            <span>Home</span>
          </button>
          <button className="mobile-nav-button" type="button" aria-pressed={!muted} onClick={toggleMuted}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            <span>{muted ? "Sound Off" : "Sound On"}</span>
          </button>
          <button className="mobile-nav-button" type="button" data-sound-ignore="true" onClick={testSound}>
            <Waves size={18} />
            <span>{audioReady ? "Test Sound" : "Enable Sound"}</span>
          </button>
          <label className="mobile-volume-row">
            <Volume2 size={18} />
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              aria-label="Sound volume"
              onChange={(event) => setVolume(event.target.value)}
            />
            <strong>{Math.round(volume * 100)}%</strong>
          </label>
          {currentUser && (
            <button className="mobile-nav-button" onClick={async () => {
              await onSignOut();
              setMobileMenuOpen(false);
            }}>
              <LogOut size={18} />
              <span>Sign out</span>
            </button>
          )}
        </nav>
      </aside>
      )}
    </>
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
