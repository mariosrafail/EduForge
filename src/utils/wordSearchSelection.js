const directionByVector = {
  "0,1": "right",
  "0,-1": "left",
  "1,0": "down",
  "-1,0": "up",
  "1,1": "downRight",
  "1,-1": "downLeft",
  "-1,1": "upRight",
  "-1,-1": "upLeft",
};

function sign(value) {
  if (value === 0) return 0;
  return value > 0 ? 1 : -1;
}

export function normalizeWord(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z]/g, "");
}

export function getDirectionKey(startCell, endCell) {
  if (!startCell || !endCell) return "";
  const rowDelta = endCell.row - startCell.row;
  const colDelta = endCell.col - startCell.col;
  if (rowDelta === 0 && colDelta === 0) return "";

  const isHorizontal = rowDelta === 0;
  const isVertical = colDelta === 0;
  const isDiagonal = Math.abs(rowDelta) === Math.abs(colDelta);
  if (!isHorizontal && !isVertical && !isDiagonal) return "";

  return directionByVector[`${sign(rowDelta)},${sign(colDelta)}`] || "";
}

export function getCellsBetween(startCell, endCell) {
  const directionKey = getDirectionKey(startCell, endCell);
  if (!directionKey) return startCell ? [startCell] : [];

  const rowStep = sign(endCell.row - startCell.row);
  const colStep = sign(endCell.col - startCell.col);
  const length = Math.max(Math.abs(endCell.row - startCell.row), Math.abs(endCell.col - startCell.col));
  const cells = [];

  for (let index = 0; index <= length; index += 1) {
    cells.push({
      row: startCell.row + (rowStep * index),
      col: startCell.col + (colStep * index),
    });
  }

  return cells;
}

export function isDirectionAllowed(directionKey, allowedDirections = []) {
  return Boolean(directionKey && allowedDirections.includes(directionKey));
}

export function getSelectionText(grid, cells = []) {
  return normalizeWord(cells.map((cell) => grid[cell.row]?.[cell.col] || "").join(""));
}
