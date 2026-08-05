export function Badge({ children, tone = "neutral" }) {
  return <span className={`studio-badge ${tone}`}>{children}</span>;
}

export function Metric({ label, value, hint }) {
  return <div className="studio-metric"><span>{label}</span><strong>{value ?? "—"}</strong>{hint && <small>{hint}</small>}</div>;
}

export function Field({ label, children, className = "" }) {
  return <label className={`studio-field ${className}`.trim()}><span>{label}</span>{children}</label>;
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.pageCount <= 1) return null;
  return (
    <nav className="studio-pagination" aria-label="Results pages">
      <button type="button" className="studio-button secondary" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous</button>
      <span>Page <strong>{pagination.page}</strong> of {pagination.pageCount} · {pagination.total.toLocaleString()} items</span>
      <button type="button" className="studio-button secondary" disabled={pagination.page >= pagination.pageCount} onClick={() => onPage(pagination.page + 1)}>Next</button>
    </nav>
  );
}

export function DefinitionList({ items }) {
  return <dl className="studio-definition-list">{items.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value ?? "Unavailable"}</dd></div>)}</dl>;
}
