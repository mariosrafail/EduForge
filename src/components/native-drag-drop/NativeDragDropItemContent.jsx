export function NativeDragDropItemContent({ word, document, assetUrl, shortLabel = false }) {
  if (!word.image) return shortLabel ? word.shortLabel : word.text;
  const reference = document.assets.find((asset) => asset.slot === word.image.assetSlot);
  return <span className="native-drag-drop-image-content" style={{ width: word.image.displayWidth, height: word.image.displayHeight }}>
    {reference ? <img src={assetUrl(reference.assetId)} alt={word.text} width={word.image.sourceWidth} height={word.image.sourceHeight} draggable={false} /> : null}
    {word.image.caption ? <span className="native-drag-drop-image-caption">{word.image.caption}</span> : null}
  </span>;
}
