import { BookOpenText, Eye, FileText, Film, KeyRound, LayoutPanelTop, Plus } from "lucide-react";

import { StudioButton } from "../../../components/builder-studio/StudioControls.jsx";

export const NATIVE_COMPLETE_SENTENCES_TABS = [
  { id: "content", label: "Content", icon: FileText },
  { id: "visual", label: "Visual", icon: LayoutPanelTop },
  { id: "answer-key", label: "Answer Key", icon: KeyRound },
  { id: "readable-text", label: "Readable Text", icon: BookOpenText },
  { id: "video", label: "Video", icon: Film },
  { id: "preview", label: "Local Preview", icon: Eye },
];

export function NativeCompleteSentencesEditorHeader({ activityId, contentReady, issueCount, placementLabel, title }) {
  return (
    <header className="studio-editor-header">
      <div>
        <span className="studio-eyebrow">{placementLabel} · Complete the Sentences</span>
        <h2>{title}</h2>
        <p>{contentReady ? "Content complete" : `${issueCount} items need attention`}</p>
      </div>
      <details className="builder-technical-details">
        <summary>Technical details</summary>
        <code>{activityId}</code>
      </details>
    </header>
  );
}

export function NativeCompleteSentencesItemNavigation({ authoringSentences, items, maximumItems, onAdd, onSelect, selectedItemId }) {
  return (
    <aside>
      <StudioButton onClick={onAdd} disabled={items.length >= maximumItems}>
        <Plus />
        Add Sentence
      </StudioButton>
      {items.map((item, index) => (
        <button type="button" key={item.id} aria-current={item.id === selectedItemId ? "true" : undefined} onClick={() => onSelect(item.id)}>
          <strong>Sentence {index + 1}</strong>
          <span>{authoringSentences[item.id] || item.prompt || "Untitled"}</span>
          <code>{item.id}</code>
        </button>
      ))}
    </aside>
  );
}
