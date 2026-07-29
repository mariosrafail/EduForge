import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_ELEMENTS = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function PortalShell({
  title,
  profile,
  subtitle,
  navItems,
  activeItem,
  onNavigate,
  children,
  variant = "",
}) {
  const [expanded, setExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeTimerRef = useRef(null);
  const drawerRef = useRef(null);
  const menuTriggerRef = useRef(null);
  const reduceMotion = useReducedMotion();

  const openSidebar = () => {
    window.clearTimeout(closeTimerRef.current);
    setExpanded(true);
  };

  const scheduleClose = () => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setExpanded(false), 250);
  };

  const closeDrawer = ({ restoreFocus = true } = {}) => {
    setDrawerOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
  };

  const handleNavigate = (itemId) => {
    onNavigate(itemId);
    if (drawerOpen) closeDrawer();
  };

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  useEffect(() => {
    if (!drawerOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector(FOCUSABLE_ELEMENTS)?.focus();
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(drawerRef.current?.querySelectorAll(FOCUSABLE_ELEMENTS) || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen]);

  const renderNavigation = (mobile = false) => (
    <nav className={mobile ? "portal-drawer-nav" : "portal-sidebar-nav"} aria-label={`${title} sections`}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeItem === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={isActive ? "active" : ""}
            onClick={() => handleNavigate(item.id)}
            data-sound-click="tab"
            aria-current={isActive ? "page" : undefined}
            title={item.label}
          >
            <span>{Icon && <Icon size={18} />}</span>
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className={`portal-shell ${variant} ${expanded ? "sidebar-expanded" : "sidebar-collapsed"}`}>
      <div className="portal-mobile-bar">
        <button
          ref={menuTriggerRef}
          className="portal-menu-trigger"
          type="button"
          aria-label={`Open ${title} navigation`}
          aria-expanded={drawerOpen}
          aria-controls="portal-mobile-drawer"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={20} />
          <span>Menu</span>
        </button>
        <div>
          <strong>{title}</strong>
          <small>{navItems.find((item) => item.id === activeItem)?.label || "Dashboard"}</small>
        </div>
      </div>
      <aside
        className="portal-sidebar"
        aria-label={`${title} navigation`}
        onMouseEnter={openSidebar}
        onMouseLeave={scheduleClose}
        onFocus={openSidebar}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) scheduleClose();
        }}
      >
        <div className="portal-sidebar-card">
          <span className="portal-rail-avatar" aria-hidden="true">{title?.charAt(0) || "P"}</span>
          <span className="eyebrow">{title}</span>
          <strong>{profile}</strong>
          <small>{subtitle}</small>
          {renderNavigation()}
        </div>
      </aside>
      <main className="portal-main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            className="portal-section-transition"
            key={activeItem}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {drawerOpen && (
            <motion.div
              className="portal-drawer-layer"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.16 }}
            >
              <button className="portal-drawer-backdrop" type="button" aria-label="Close navigation" onClick={() => closeDrawer()} />
              <motion.aside
                ref={drawerRef}
                id="portal-mobile-drawer"
                className="portal-mobile-drawer"
                role="dialog"
                aria-modal="true"
                aria-label={`${title} navigation`}
                initial={reduceMotion ? false : { x: "-100%" }}
                animate={{ x: 0 }}
                exit={reduceMotion ? undefined : { x: "-100%" }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="portal-drawer-header">
                  <div>
                    <span className="eyebrow">{title}</span>
                    <strong>{profile}</strong>
                    <small>{subtitle}</small>
                  </div>
                  <button type="button" aria-label="Close navigation" onClick={() => closeDrawer()}>
                    <X size={20} />
                  </button>
                </div>
                {renderNavigation(true)}
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
