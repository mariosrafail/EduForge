export default function EmptyState({ icon: Icon, title, description, action, children, className = "" }) {
  return (
    <div className={["empty-state", className].filter(Boolean).join(" ")}>
      {Icon && (
        <div className="empty-state-icon">
          <Icon size={22} />
        </div>
      )}
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
      {children && <div className="empty-state-content">{children}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
