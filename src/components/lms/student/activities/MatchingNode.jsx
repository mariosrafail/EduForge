export function MatchingNode({
  item,
  side,
  active = false,
  dragging = false,
  connected = false,
  submitted = false,
  state = "",
  nodeRef,
  endpointRef,
  onPointerDown,
  onPointerUp,
}) {
  return (
    <article
      ref={nodeRef}
      className={`matching-node ${side} ${active ? "active is-drag-over" : ""} ${dragging ? "is-dragging" : ""} ${connected ? "connected is-dropped" : ""} ${submitted ? state : ""}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <strong>{item.label}</strong>
      <span ref={endpointRef} className={`match-endpoint-anchor ${side}`} aria-hidden="true">
        <span className={`connection-dot ${side === "left" ? "blue-dot" : "orange-dot"}`} />
      </span>
    </article>
  );
}
