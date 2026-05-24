export function DragTrail({ points }) {
  if (!points.length) return null;

  return (
    <div className="drag-trail-layer" aria-hidden="true">
      {points.map((point, index) => (
        <span
          key={`${point.id}-streak`}
          className={`drag-trail-streak ${index % 2 === 0 ? "orange" : "warm"}`}
          style={{
            left: point.x - point.dx * (1 + index * 0.35),
            top: point.y - point.dy * (1 + index * 0.35),
            width: Math.max(72, point.width * 1.32),
            height: Math.max(8, point.height * 0.28),
            "--trail-angle": `${Math.atan2(point.dy || 0, point.dx || 1) * (180 / Math.PI)}deg`,
          }}
        />
      ))}
      {points.map((point, index) => (
        <span
          key={point.id}
          className={`drag-trail-ghost ${index % 2 === 0 ? "orange" : "blue"}`}
          style={{
            left: point.x - point.dx * 0.5,
            top: point.y - point.dy * 0.5,
            width: Math.max(56, point.width * 0.84),
            height: Math.max(18, point.height * 0.62),
            "--trail-angle": `${Math.atan2(point.dy || 0, point.dx || 1) * (180 / Math.PI)}deg`,
          }}
        />
      ))}
    </div>
  );
}
