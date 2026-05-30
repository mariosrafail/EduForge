import { ChevronRight } from "lucide-react";
import { useRef, useState } from "react";

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
  const closeTimerRef = useRef(null);

  const openSidebar = () => {
    window.clearTimeout(closeTimerRef.current);
    setExpanded(true);
  };

  const scheduleClose = () => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setExpanded(false), 250);
  };

  return (
    <div className={`portal-shell ${variant} ${expanded ? "sidebar-expanded" : "sidebar-collapsed"}`}>
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
          <span className="portal-rail-handle" aria-hidden="true"><ChevronRight size={14} /></span>
          <span className="eyebrow">{title}</span>
          <strong>{profile}</strong>
          <small>{subtitle}</small>
          <nav className="portal-sidebar-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeItem === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={isActive ? "active" : ""}
                  onClick={() => onNavigate(item.id)}
                  data-sound-click="tab"
                  aria-current={isActive ? "page" : undefined}
                  title={item.label}
                >
                  <span>{Icon && <Icon size={17} />}</span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>
      <main className="portal-main">
        {children}
      </main>
    </div>
  );
}
