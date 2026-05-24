const directionVectors = {
  right: { dx: 1, dy: 0 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  up: { dx: 0, dy: -1 },
  downRight: { dx: 1, dy: 1 },
  downLeft: { dx: -1, dy: 1 },
  upRight: { dx: 1, dy: -1 },
  upLeft: { dx: -1, dy: -1 },
};

export const wordSearchDirections = [
  { value: "right", label: "Left to right" },
  { value: "down", label: "Top to bottom" },
  { value: "left", label: "Right to left" },
  { value: "up", label: "Bottom to top" },
  { value: "downRight", label: "Diagonal down-right" },
  { value: "downLeft", label: "Diagonal down-left" },
  { value: "upRight", label: "Diagonal up-right" },
  { value: "upLeft", label: "Diagonal up-left" },
];

export const defaultWordSearchDirections = ["right", "down"];

function randomLetter() {
  return String.fromCharCode(65 + Math.floor(Math.random() * 26));
}

function normalizeWord(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z]/g, "");
}

function canPlace(grid, word, startX, startY, direction) {
  const vector = directionVectors[direction];
  if (!vector) return false;
  for (let i = 0; i < word.length; i += 1) {
    const x = startX + (vector.dx * i);
    const y = startY + (vector.dy * i);
    if (!grid[y] || grid[y][x] === undefined) return false;
    if (grid[y][x] && grid[y][x] !== word[i]) return false;
  }
  return true;
}

function place(grid, word, startX, startY, direction) {
  const vector = directionVectors[direction];
  for (let i = 0; i < word.length; i += 1) {
    const x = startX + (vector.dx * i);
    const y = startY + (vector.dy * i);
    grid[y][x] = word[i];
  }
}

export function generateWordSearch(words, options = {}) {
  const inputWords = Array.isArray(words) ? words : options.words;
  const normalizedWords = (inputWords || []).map(normalizeWord).filter(Boolean);
  const gridSize = Math.max(6, Math.min(24, Number(options.gridSize) || 12));
  const allowedDirections = (options.directions || defaultWordSearchDirections)
    .filter((direction) => directionVectors[direction]);
  const directions = allowedDirections.length ? allowedDirections : defaultWordSearchDirections;

  const grid = Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => ""));
  const placements = [];
  const sortedWords = [...normalizedWords].sort((a, b) => b.length - a.length);

  for (const word of sortedWords) {
    let placed = false;
    for (let attempt = 0; attempt < 300 && !placed; attempt += 1) {
      const direction = directions[Math.floor(Math.random() * directions.length)];
      const startX = Math.floor(Math.random() * gridSize);
      const startY = Math.floor(Math.random() * gridSize);
      if (!canPlace(grid, word, startX, startY, direction)) continue;
      place(grid, word, startX, startY, direction);
      placements.push({ word, start: { x: startX, y: startY }, direction });
      placed = true;
    }
  }

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      if (!grid[y][x]) grid[y][x] = randomLetter();
    }
  }

  return {
    grid,
    words: sortedWords,
    placements,
    gridSize,
    directions,
  };
}
