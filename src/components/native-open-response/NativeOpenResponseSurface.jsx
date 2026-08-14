import "./nativeOpenResponseSurface.css";

export function logicalAreaStyle(area, surface) {
  return {
    left: `${(area.x / surface.width) * 100}%`,
    top: `${(area.y / surface.height) * 100}%`,
    width: `${(area.width / surface.width) * 100}%`,
    height: `${(area.height / surface.height) * 100}%`,
  };
}

function ResponseLines({ region, surface, onActivate, selected }) {
  const { presentation } = region;
  const style = logicalAreaStyle(region.area, surface);
  const content = <>{presentation.linePositions.map((position, index) => <span key={index} className="native-or-line" style={{ left: `${(presentation.paddingX / region.area.width) * 100}%`, top: `${(position / region.area.height) * 100}%`, width: `${(presentation.lineWidth / region.area.width) * 100}%` }} />)}</>;
  if (!onActivate) return <div className="native-or-response" style={style} aria-hidden="true">{content}</div>;
  return <button type="button" className={`native-or-response native-or-selectable ${selected ? "is-selected" : ""}`} style={style} aria-label={region.ariaLabel} onClick={onActivate}>{content}</button>;
}

export function NativeOpenResponseSurface({ document, assetUrl = () => "", onSelect = null, selected = null, children = null, className = "" }) {
  const interaction = document.parts[0].interaction;
  const { surface } = interaction;
  const assets = new Map(document.assets.map((asset) => [asset.slot, asset]));
  return <div className={`native-or-surface ${className}`.trim()} style={{ aspectRatio: `${surface.width} / ${surface.height}` }} data-surface-width={surface.width} data-surface-height={surface.height}>
    {interaction.artwork.map((item) => {
      const reference = assets.get(item.assetSlot);
      return <button key={item.id} type="button" className={`native-or-artwork native-or-selectable ${selected?.type === "artwork" && selected.id === item.id ? "is-selected" : ""}`} style={{ ...logicalAreaStyle(item.area, surface), zIndex: item.order + 1 }} aria-label={item.decorative ? "Decorative artwork" : item.altText || "Artwork"} onClick={() => onSelect?.({ type: "artwork", id: item.id })} disabled={!onSelect}>
        {reference ? <img src={assetUrl(reference.assetId)} alt={item.decorative ? "" : item.altText} style={{ objectFit: item.fit }} /> : null}
      </button>;
    })}
    {interaction.questions.map((question) => <div key={question.id}>
      <button type="button" className={`native-or-prompt native-or-selectable ${selected?.type === "prompt" && selected.id === question.id ? "is-selected" : ""}`} style={{ ...logicalAreaStyle(question.promptArea, surface), fontFamily: question.promptStyle.fontFamily, fontSize: `${(question.promptStyle.fontSize / surface.width) * 100}cqw`, color: question.promptStyle.color, textAlign: question.promptStyle.align }} onClick={() => onSelect?.({ type: "prompt", id: question.id })} disabled={!onSelect}>{question.prompt || "Prompt"}</button>
      <ResponseLines region={question.responseRegion} surface={surface} selected={selected?.type === "response" && selected.id === question.id} onActivate={onSelect ? () => onSelect({ type: "response", id: question.id }) : null} />
    </div>)}
    {children}
  </div>;
}
