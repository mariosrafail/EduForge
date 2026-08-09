export function UltimateB2InstructionImage({ visualCapabilities, resolveAsset, alt, className = "ultimate-b2-exercise-instruction" }) {
  const binding = visualCapabilities?.instructionImage;
  const source = binding ? resolveAsset(binding) : null;
  return source ? <img className={className} src={source} alt={alt} draggable="false" /> : null;
}

export function UltimateB2ScrollableTextImage({ visualCapabilities, resolveAsset, alt }) {
  const binding = visualCapabilities?.showText?.enabled ? visualCapabilities.showText.showTextImage : null;
  const source = binding ? resolveAsset(binding) : null;
  if (!source) return null;
  return (
    <section className="ultimate-b2-show-text-shell" aria-label={alt} data-show-text-view="open">
      <div className="ultimate-b2-show-text-viewport">
        <img src={source} alt={alt} draggable="false" />
      </div>
    </section>
  );
}
