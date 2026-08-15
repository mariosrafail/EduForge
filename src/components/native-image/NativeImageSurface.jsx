export function NativeImageSurface({ document, assetUrl = () => "" }) {
  const interaction = document.parts[0].interaction;
  const reference = interaction.image ? document.assets.find((asset) => asset.slot === interaction.image.assetSlot) : null;
  return <div className="native-image-surface" data-empty={!reference || undefined}>
    {reference ? <img src={assetUrl(reference.assetId)} alt={interaction.image.decorative ? "" : interaction.altText} style={{ objectFit: interaction.image.fit }} /> : <p>No image uploaded yet.</p>}
  </div>;
}
