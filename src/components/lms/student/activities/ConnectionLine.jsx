export function ConnectionLine({ line, draft = false }) {
  const className = `matching-line ${draft ? "draft" : line.state}`;
  const style = line.color && !draft ? { "--line-color": line.color } : undefined;

  return (
    <g>
      <line
        className={`${className} underlay`}
        x1={line.from.x}
        y1={line.from.y}
        x2={line.to.x}
        y2={line.to.y}
      />
      <line
        className={className}
        style={style}
        x1={line.from.x}
        y1={line.from.y}
        x2={line.to.x}
        y2={line.to.y}
      />
    </g>
  );
}
