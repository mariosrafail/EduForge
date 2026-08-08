import { CheckCircle2, Volume2, XCircle } from "lucide-react";

function qaItems(shell) {
  return [
    ...Object.entries(shell.chrome).map(([id, item]) => ({ id, label: id[0].toUpperCase() + id.slice(1), ...item })),
    ...shell.units,
    ...shell.editions,
    ...shell.toolbar,
  ];
}

export default function TeacherProjectQaPanel({ shell, urls, focusId, onFocus }) {
  const test = (assetId) => { if (urls[assetId]) new Audio(urls[assetId]).play().catch(() => {}); };
  return <div className="teacher-qa-panel"><p>Select a control to highlight it in the shared runtime preview. Browser window actions are never triggered.</p><div className="teacher-qa-list">{qaItems(shell).map((item) => {
    const image = item.image || item.normal;
    return <article className={focusId === item.id ? "is-focused" : ""} key={item.id}><button type="button" onClick={() => onFocus(focusId === item.id ? "" : item.id)}><strong>{item.label}</strong><span>{image ? <CheckCircle2 aria-label="Normal artwork assigned" /> : <XCircle aria-label="Normal artwork missing" />} Normal</span>{"active" in item && <span>{item.active ? <CheckCircle2 aria-label="Active artwork assigned" /> : <XCircle aria-label="Active artwork missing" />} Active</span>}<span>{item.sound ? <CheckCircle2 aria-label="Sound assigned" /> : <XCircle aria-label="Sound missing" />} Sound</span></button><button type="button" className="studio-icon-button" aria-label={`Test ${item.label} sound`} disabled={!item.sound || !urls[item.sound]} onClick={() => test(item.sound)}><Volume2 aria-hidden="true" /></button></article>;
  })}</div></div>;
}
