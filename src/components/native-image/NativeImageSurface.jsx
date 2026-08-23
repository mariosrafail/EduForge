import { logicalAreaStyle } from "../native-open-response/NativeOpenResponseSurface.jsx";
import { NativeAudioTextHotspotButtons } from "../native-readable-text/NativeAudioTextHotspots.jsx";
import "./nativeImage.css";

export function NativeImagePresentation(props) {
  const contentText = props.document.parts[0].interaction.contentText;
  const surface = <NativeImageSurface {...props} />;
  if (!contentText) return surface;
  return <div className="native-image-presentation">
    {surface}
    <div className="native-image-content-text" aria-label="Activity content">{contentText}</div>
  </div>;
}

export function NativeImageSurface({ document, assetUrl = () => "", onSelect = null, selectedId = null, children = null, className = "", audioHotspotPresentation = null }) {
  const interaction = document.parts[0].interaction;
  const assets = new Map(document.assets.map((asset) => [asset.slot, asset]));
  return <div className={`native-or-surface native-image-surface ${className}`.trim()} style={{ aspectRatio: `${interaction.surface.width} / ${interaction.surface.height}` }} data-studio-stage data-empty={!interaction.images.length || undefined} data-surface-width={interaction.surface.width} data-surface-height={interaction.surface.height}>
    {interaction.images.map((item) => {
      const reference = assets.get(item.assetSlot);
      const authoringLocked = Boolean(onSelect && item.locked);
      const content = reference ? <img src={assetUrl(reference.assetId)} alt={item.decorative ? "" : item.altText} style={{ objectFit: item.fit }} /> : null;
      const style = { ...logicalAreaStyle(item.area, interaction.surface), zIndex: item.order + 1 };
      if (!onSelect) return <div key={item.id} className="native-or-artwork" style={{ ...style, position: "absolute", pointerEvents: "none" }}>{content}</div>;
      return <button key={item.id} type="button" className={`native-or-artwork native-or-selectable ${selectedId === item.id ? "is-selected" : ""}`} style={{ ...style, pointerEvents: authoringLocked ? "none" : undefined }} aria-label={`${item.decorative ? "Decorative image" : item.altText || "Image"}${authoringLocked ? " (locked)" : ""}`} data-locked={authoringLocked || undefined} onClick={() => onSelect(item.id)}>
        {content}
      </button>;
    })}
    {!interaction.images.length ? <p>No images added yet.</p> : null}
    <NativeAudioTextHotspotButtons surface={interaction.surface} presentation={audioHotspotPresentation} />
    {children}
  </div>;
}
