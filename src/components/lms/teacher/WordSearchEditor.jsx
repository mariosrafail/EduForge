import { Check, ListPlus, Trash2 } from "lucide-react";
import { defaultWordSearchDirections, generateWordSearch, wordSearchDirections } from "../../../utils/wordSearchGenerator.js";

function makeWordId() {
  return `word-search-word-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function WordSearchEditor({ activity, onUpdate }) {
  const words = activity.words || [];
  const directions = activity.directions || activity.allowedDirections || defaultWordSearchDirections;

  const updateWord = (id, patch) => {
    onUpdate({
      ...activity,
      words: words.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  };

  const addWord = () => {
    onUpdate({
      ...activity,
      words: [...words, { id: makeWordId(), word: "", hint: "" }],
    });
  };

  const removeWord = (id) => {
    onUpdate({
      ...activity,
      words: words.filter((row) => row.id !== id),
    });
  };

  const toggleDirection = (direction) => {
    const next = directions.includes(direction)
      ? directions.filter((value) => value !== direction)
      : [...directions, direction];
    onUpdate({
      ...activity,
      directions: next.length ? next : [...defaultWordSearchDirections],
      allowedDirections: next.length ? next : [...defaultWordSearchDirections],
    });
  };

  const generatePuzzle = () => {
    const generatedGrid = generateWordSearch(words.map((row) => row.word), {
      gridSize: activity.gridSize || 12,
      directions,
    });
    onUpdate({ ...activity, generatedGrid });
  };

  return (
    <>
      <label>
        Title
        <input value={activity.title} onChange={(event) => onUpdate({ ...activity, title: event.target.value })} />
      </label>

      <label>
        Instruction
        <input value={activity.instruction} onChange={(event) => onUpdate({ ...activity, instruction: event.target.value })} />
      </label>

      <div className="inline-editor-list word-search-direction-list">
        <strong>Allowed directions</strong>
        <div className="word-search-direction-grid">
          {wordSearchDirections.map((direction) => {
            const selected = directions.includes(direction.value);
            return (
              <label key={direction.value} className={`word-search-direction-checkbox ${selected ? "selected" : ""}`}>
                <input type="checkbox" checked={selected} onChange={() => toggleDirection(direction.value)} />
                <span className="direction-check" aria-hidden="true">{selected && <Check size={14} strokeWidth={3} />}</span>
                <span>{direction.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <label>
        Grid size
        <input
          type="number"
          min="6"
          max="24"
          value={activity.gridSize || 12}
          onChange={(event) => onUpdate({ ...activity, gridSize: Number(event.target.value) || 12 })}
        />
      </label>

      <div className="inline-editor-list word-search-entry-list">
        <strong>Word list</strong>
        {words.map((row) => (
          <div className="word-search-entry-row" key={row.id}>
            <input placeholder="Word" value={row.word || ""} onChange={(event) => updateWord(row.id, { word: event.target.value })} />
            <input placeholder="Hint (optional)" value={row.hint || ""} onChange={(event) => updateWord(row.id, { hint: event.target.value })} />
            <button data-sound-click="deleteRemove" onClick={() => removeWord(row.id)}><Trash2 size={15} /></button>
          </div>
        ))}
        <button className="secondary-action compact-action" onClick={addWord}>
          <ListPlus size={16} /> Add word
        </button>
      </div>

      <button className="secondary-action compact-action" onClick={generatePuzzle}>Generate puzzle</button>
    </>
  );
}
