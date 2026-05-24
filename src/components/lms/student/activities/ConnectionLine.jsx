export function ConnectionLine({ line, draft = false }) {
  return (
    <path
      className={`matching-line ${draft ? "draft" : line.state}`}
      d={`M ${line.from.x} ${line.from.y} C ${line.from.x + 80} ${line.from.y}, ${line.to.x - 80} ${line.to.y}, ${line.to.x} ${line.to.y}`}
    />
  );
}
