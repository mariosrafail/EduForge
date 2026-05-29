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
  return (
    <div className={`portal-shell ${variant}`}>
      <aside className="portal-sidebar" aria-label={`${title} navigation`}>
        <div className="portal-sidebar-card">
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
