import React, { useEffect, useRef, useState } from "react";
import { LockKeyhole, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { platformSections } from "../platformAdminNavigation.js";
import { PlatformButton } from "./PlatformUi.jsx";

function NavigationItems({ activeSection, onNavigate }) {
  return platformSections.map(({ id, label, description, icon: Icon }) => (
    <button
      key={id}
      type="button"
      className="pa-nav-item"
      aria-label={label}
      aria-current={activeSection === id ? "page" : undefined}
      onClick={() => onNavigate(id)}
      title={label}
    >
      <span className="pa-nav-icon"><Icon size={19} aria-hidden="true" /></span>
      <span className="pa-nav-copy"><strong>{label}</strong><small>{description}</small></span>
    </button>
  ));
}

export function PlatformAdminShell({ admin, activeSection, onNavigate, onSignOut, children }) {
  const [expanded, setExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeTimer = useRef(null);
  const menuButton = useRef(null);
  const drawer = useRef(null);

  const openRail = () => {
    clearTimeout(closeTimer.current);
    setExpanded(true);
  };
  const closeRail = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setExpanded(false), 250);
  };
  const navigateMobile = (next) => {
    onNavigate(next);
    setDrawerOpen(false);
  };

  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        menuButton.current?.focus();
      }
      if (event.key === "Tab" && drawer.current) {
        const controls = [...drawer.current.querySelectorAll("button:not(:disabled)")];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => drawer.current?.querySelector("[aria-current='page']")?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen]);

  return (
    <div className={`pa-shell ${expanded ? "pa-rail-expanded" : "pa-rail-collapsed"}`}>
      <header className="pa-topbar">
        <div className="pa-topbar-brand">
          <PlatformButton ref={menuButton} className="pa-menu-button" variant="ghost" icon={Menu} iconOnly aria-label="Open navigation" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} />
          <div className="pa-brand-mark" aria-hidden="true">E</div>
          <div><strong>EduForge</strong><span>Platform Administration</span></div>
        </div>
        <div className="pa-identity">
          <span className="pa-privileged-badge"><ShieldCheck size={15} /> Restricted operator area</span>
          <strong>{admin.full_name}</strong>
          <PlatformButton variant="secondary" icon={LogOut} onClick={onSignOut}>Sign out</PlatformButton>
        </div>
      </header>
      <aside
        className="pa-sidebar"
        aria-label="Platform Administration navigation"
        onMouseEnter={openRail}
        onMouseLeave={closeRail}
        onFocus={openRail}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) closeRail(); }}
      >
        <div className="pa-sidebar-context">
          <span><LockKeyhole size={18} /></span>
          <div><strong>Privileged area</strong><small>Cross-school controls</small></div>
        </div>
        <nav><NavigationItems activeSection={activeSection} onNavigate={onNavigate} /></nav>
      </aside>
      {drawerOpen && (
        <div className="pa-mobile-nav-layer">
          <button className="pa-nav-backdrop" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} />
          <aside ref={drawer} className="pa-mobile-nav" aria-label="Mobile Platform Administration navigation">
            <header>
              <div><strong>Platform Administration</strong><span>Restricted operator area</span></div>
              <PlatformButton variant="ghost" icon={X} iconOnly aria-label="Close navigation" onClick={() => setDrawerOpen(false)} />
            </header>
            <nav><NavigationItems activeSection={activeSection} onNavigate={navigateMobile} /></nav>
            <footer>
              <strong>{admin.full_name}</strong>
              <PlatformButton variant="secondary" icon={LogOut} onClick={onSignOut}>Sign out</PlatformButton>
            </footer>
          </aside>
        </div>
      )}
      <main className="pa-main">{children}</main>
    </div>
  );
}
