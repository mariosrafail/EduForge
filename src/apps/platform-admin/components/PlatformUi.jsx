import React, { forwardRef } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export const PlatformButton = forwardRef(function PlatformButton({
  children,
  variant = "primary",
  size = "regular",
  icon: Icon,
  iconOnly = false,
  loading = false,
  disabled = false,
  className = "",
  type = "button",
  ...props
}, ref) {
  const label = loading ? "Working…" : children;
  return (
    <button
      type={type}
      ref={ref}
      className={`pa-button pa-button-${variant} pa-button-${size} ${iconOnly ? "pa-button-icon-only" : ""} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="pa-spin" size={17} aria-hidden="true" /> : Icon ? <Icon size={17} aria-hidden="true" /> : null}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
});

export function PlatformAlert({ children, tone = "success", onDismiss }) {
  const reduceMotion = useReducedMotion();
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <motion.div
      className={`pa-alert pa-alert-${tone}`}
      role={tone === "error" ? "alert" : "status"}
      initial={reduceMotion ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{children}</span>
      {onDismiss && (
        <PlatformButton variant="ghost" icon={X} iconOnly aria-label="Dismiss message" onClick={onDismiss} />
      )}
    </motion.div>
  );
}

export function PlatformStatusBadge({ value }) {
  return <span className={`pa-status pa-status-${value}`}>{value}</span>;
}

export function PlatformLoadingState({ label = "Loading…", fullscreen = false }) {
  return (
    <main className={`pa-state pa-loading-state ${fullscreen ? "pa-state-fullscreen" : ""}`} role="status">
      <LoaderCircle className="pa-spin" size={22} aria-hidden="true" />
      <span>{label}</span>
    </main>
  );
}

export function PlatformEmptyState({ icon: Icon, title, children }) {
  return (
    <div className="pa-state pa-empty-state">
      {Icon && <Icon size={26} aria-hidden="true" />}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function PlatformCard({ title, description, actions, children, className = "" }) {
  return (
    <section className={`pa-card ${className}`.trim()}>
      {(title || actions) && (
        <header className="pa-card-header">
          <div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>
          {actions && <div className="pa-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
