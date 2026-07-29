import React, { forwardRef, useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { createPortal } from "react-dom";

const FOCUSABLE_ELEMENTS = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export const AppChromeButton = forwardRef(function AppChromeButton(
  { children, className = "", icon: Icon, iconOnly = false, tone = "default", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`app-chrome-button app-chrome-button-${tone} ${iconOnly ? "is-icon-only" : ""} ${className}`.trim()}
      {...props}
    >
      {Icon && <Icon size={18} aria-hidden="true" />}
      {children}
    </button>
  );
});

export function AppNavigation({ items, activeItem, onNavigate, mobile = false }) {
  return (
    <nav className={`app-chrome-navigation ${mobile ? "is-mobile" : "is-desktop"}`}>
      {items.map(({ id, label, description, icon: Icon }) => {
        const active = activeItem === id;
        return (
          <button
            key={id}
            type="button"
            className="app-chrome-nav-item"
            aria-label={label}
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(id)}
            title={label}
            data-sound-click="tab"
          >
            <span className="app-chrome-nav-icon">
              {Icon && <Icon size={19} aria-hidden="true" />}
            </span>
            <span className="app-chrome-nav-copy">
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function AppTopbar({
  brand,
  context,
  actions,
  menuButtonRef,
  drawerOpen,
  drawerId,
  onOpenNavigation,
  navigationLabel,
}) {
  const brandContent = (
    <>
      <span className="app-chrome-brand-mark" aria-hidden="true">{brand.mark}</span>
      <span className="app-chrome-brand-copy">
        <strong>{brand.primary}</strong>
        <small>{brand.secondary}</small>
      </span>
    </>
  );

  return (
    <header className="app-chrome-topbar">
      <div className="app-chrome-brand-area">
        <AppChromeButton
          ref={menuButtonRef}
          className="app-chrome-menu-trigger"
          icon={Menu}
          iconOnly
          aria-label={`Open ${navigationLabel}`}
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          onClick={onOpenNavigation}
        />
        {brand.onActivate ? (
          <button
            type="button"
            className="app-chrome-brand"
            aria-label={brand.ariaLabel}
            onClick={brand.onActivate}
          >
            {brandContent}
          </button>
        ) : (
          <div className="app-chrome-brand">{brandContent}</div>
        )}
      </div>
      {context && <div className="app-chrome-topbar-context">{context}</div>}
      {actions && <div className="app-chrome-topbar-actions">{actions}</div>}
    </header>
  );
}

export function AppRail({ context, items, activeItem, onNavigate, onOpen, onScheduleClose }) {
  const ContextIcon = context.icon;
  return (
    <aside
      className="app-chrome-rail"
      aria-label={context.navigationLabel}
      onMouseEnter={onOpen}
      onMouseLeave={onScheduleClose}
      onFocus={onOpen}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onScheduleClose();
      }}
    >
      <div className="app-chrome-rail-context">
        <span className="app-chrome-context-tile" aria-hidden="true">
          {ContextIcon ? <ContextIcon size={18} /> : context.fallback}
        </span>
        <span className="app-chrome-context-copy">
          <strong>{context.title}</strong>
          <span>{context.profile}</span>
          <small>{context.subtitle}</small>
        </span>
      </div>
      <AppNavigation items={items} activeItem={activeItem} onNavigate={onNavigate} />
    </aside>
  );
}

export function AppMobileDrawer({
  drawerRef,
  drawerId,
  title,
  subtitle,
  navigationLabel,
  items,
  activeItem,
  footer,
  onNavigate,
  onClose,
}) {
  return (
    <div className="app-chrome-drawer-layer">
      <button className="app-chrome-drawer-backdrop" type="button" aria-label="Close navigation" onClick={onClose} />
      <aside
        ref={drawerRef}
        id={drawerId}
        className="app-chrome-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={navigationLabel}
      >
        <header className="app-chrome-drawer-header">
          <div>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </div>
          <AppChromeButton icon={X} iconOnly aria-label="Close navigation" onClick={onClose} />
        </header>
        <AppNavigation items={items} activeItem={activeItem} onNavigate={onNavigate} mobile />
        {footer && <footer className="app-chrome-drawer-footer">{footer}</footer>}
      </aside>
    </div>
  );
}

export function AppChrome({
  brand,
  topbarContext,
  topbarActions,
  railContext,
  navItems,
  activeItem,
  onNavigate,
  drawerTitle,
  drawerSubtitle,
  drawerFooter,
  className = "",
  contentClassName = "",
  children,
}) {
  const [expanded, setExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeTimerRef = useRef(null);
  const drawerRef = useRef(null);
  const menuButtonRef = useRef(null);
  const drawerId = `app-chrome-drawer-${useId().replaceAll(":", "")}`;

  const openRail = () => {
    window.clearTimeout(closeTimerRef.current);
    setExpanded(true);
  };
  const scheduleRailClose = () => {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setExpanded(false), 250);
  };
  const closeDrawer = ({ restoreFocus = true } = {}) => {
    setDrawerOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  };
  const navigate = (itemId) => {
    onNavigate(itemId);
    if (drawerOpen) closeDrawer();
  };

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      const initialControl = drawerRef.current?.querySelector("[aria-current='page']")
        || drawerRef.current?.querySelector(FOCUSABLE_ELEMENTS);
      initialControl?.focus();
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

  const navigationLabel = railContext.navigationLabel;
  return (
    <div className={`app-chrome ${expanded ? "is-rail-expanded" : "is-rail-collapsed"} ${className}`.trim()}>
      <AppTopbar
        brand={brand}
        context={topbarContext}
        actions={topbarActions}
        menuButtonRef={menuButtonRef}
        drawerOpen={drawerOpen}
        drawerId={drawerId}
        onOpenNavigation={() => setDrawerOpen(true)}
        navigationLabel={navigationLabel}
      />
      <AppRail
        context={railContext}
        items={navItems}
        activeItem={activeItem}
        onNavigate={navigate}
        onOpen={openRail}
        onScheduleClose={scheduleRailClose}
      />
      <main className="app-chrome-main">
        <div className={`app-chrome-content ${contentClassName}`.trim()}>{children}</div>
      </main>
      {drawerOpen && typeof document !== "undefined" && createPortal(
        <AppMobileDrawer
          drawerRef={drawerRef}
          drawerId={drawerId}
          title={drawerTitle || railContext.title}
          subtitle={drawerSubtitle || railContext.subtitle}
          navigationLabel={navigationLabel}
          items={navItems}
          activeItem={activeItem}
          footer={drawerFooter}
          onNavigate={navigate}
          onClose={() => closeDrawer()}
        />,
        document.body,
      )}
    </div>
  );
}
