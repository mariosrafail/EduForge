import { useMemo, useState } from "react";
import {
  getCellsBetween,
  getDirectionKey,
  getSelectionText,
  isDirectionAllowed,
  normalizeWord,
} from "../../../../utils/wordSearchSelection.js";

function cellKey(cell) {
  return `${cell.row}-${cell.col}`;
}

function cellsFromElement(element) {
  const cellElement = element?.closest?.("[data-word-search-cell]");
  if (!cellElement) return null;
  return {
    row: Number(cellElement.dataset.row),
    col: Number(cellElement.dataset.col),
  };
}

export function WordSearchActivity({ activity, answers, onChange, submitted, resultMap = {} }) {
  const generatedGrid = activity.generatedGrid || {};
  const grid = generatedGrid.grid || [];
  const words = activity.words || [];
  const allowedDirections = activity.content?.directions
    || activity.directions
    || activity.allowedDirections
    || generatedGrid.directions
    || ["right", "down"];
  const [isSelecting, setIsSelecting] = useState(false);
  const [startCell, setStartCell] = useState(null);
  const [currentCell, setCurrentCell] = useState(null);
  const [selectedCells, setSelectedCells] = useState([]);
  const [activeSelectionWord, setActiveSelectionWord] = useState("");
  const foundSelections = answers.__foundSelections || {};
  const selectedCellKeys = useMemo(() => new Set(selectedCells.map(cellKey)), [selectedCells]);
  const foundCellKeys = useMemo(() => {
    const keys = new Set();
    Object.values(foundSelections).forEach((cells) => {
      (cells || []).forEach((cell) => keys.add(cellKey(cell)));
    });
    return keys;
  }, [foundSelections]);
  const foundWordIds = useMemo(() => new Set(words.filter((word) => answers[word.id]).map((word) => word.id)), [answers, words]);

  const updateSelection = (endCell) => {
    if (!startCell || !endCell) return;
    const directionKey = getDirectionKey(startCell, endCell);
    if (!directionKey || !isDirectionAllowed(directionKey, allowedDirections)) {
      setCurrentCell(endCell);
      setSelectedCells([startCell]);
      setActiveSelectionWord(getSelectionText(grid, [startCell]));
      return;
    }

    const nextCells = getCellsBetween(startCell, endCell);
    setCurrentCell(endCell);
    setSelectedCells(nextCells);
    setActiveSelectionWord(getSelectionText(grid, nextCells));
  };

  const startSelection = (event, cell) => {
    if (submitted) return;
    event.preventDefault();
    setIsSelecting(true);
    setStartCell(cell);
    setCurrentCell(cell);
    setSelectedCells([cell]);
    setActiveSelectionWord(getSelectionText(grid, [cell]));
  };

  const finishSelection = () => {
    if (!isSelecting) return;
    const selectedWord = getSelectionText(grid, selectedCells);
    const foundWord = words.find((word) => {
      if (answers[word.id]) return false;
      const normalized = normalizeWord(word.word);
      return normalized === selectedWord;
    });

    if (foundWord) {
      onChange({
        ...answers,
        [foundWord.id]: true,
        __foundSelections: {
          ...foundSelections,
          [foundWord.id]: selectedCells,
        },
      });
    }

    setIsSelecting(false);
    setStartCell(null);
    setCurrentCell(null);
    setSelectedCells([]);
    setActiveSelectionWord("");
  };

  const cancelSelection = () => {
    setIsSelecting(false);
    setStartCell(null);
    setCurrentCell(null);
    setSelectedCells([]);
    setActiveSelectionWord("");
  };

  const handlePointerMove = (event) => {
    if (!isSelecting || submitted) return;
    const cell = cellsFromElement(document.elementFromPoint(event.clientX, event.clientY));
    if (cell) updateSelection(cell);
  };

  return (
    <div className="word-search-student-layout">
      <div className="word-search-grid-wrap">
        <strong>Letter grid</strong>
        <div
          className="word-search-grid"
          style={{ gridTemplateColumns: `repeat(${Math.max(grid[0]?.length || 1, 1)}, 1fr)` }}
          onPointerMove={handlePointerMove}
          onPointerUp={finishSelection}
          onPointerCancel={cancelSelection}
          onPointerLeave={cancelSelection}
        >
          {grid.flatMap((row, rowIndex) => row.map((cell, colIndex) => (
            <button
              key={`ws-cell-${rowIndex}-${colIndex}`}
              type="button"
              className={`word-search-cell ${selectedCellKeys.has(`${rowIndex}-${colIndex}`) ? "selected" : ""} ${foundCellKeys.has(`${rowIndex}-${colIndex}`) ? "found" : ""}`}
              data-word-search-cell="true"
              data-row={rowIndex}
              data-col={colIndex}
              disabled={submitted}
              onPointerDown={(event) => startSelection(event, { row: rowIndex, col: colIndex })}
              onPointerEnter={() => {
                if (isSelecting) updateSelection({ row: rowIndex, col: colIndex });
              }}
              onPointerUp={finishSelection}
            >
              {cell}
            </button>
          )))}
        </div>
        {isSelecting && activeSelectionWord && <small className="word-search-active-selection">{activeSelectionWord}</small>}
      </div>
      <div className="word-search-word-list">
        <strong>Find these words</strong>
        {words.map((row, index) => {
          const result = resultMap[row.id];
          const found = foundWordIds.has(row.id);
          return (
            <div key={row.id} className={`${found ? "found" : ""} ${submitted && result ? (result.correct ? "correct" : "incorrect") : ""}`}>
              <span>{index + 1}. {String(row.word || "").toUpperCase()}</span>
              {row.hint ? <small>{row.hint}</small> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
