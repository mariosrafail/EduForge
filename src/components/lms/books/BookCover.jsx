import { resolveCoverAsset } from "./bookCoverAssets.js";

export function BookCover({ component, bookPackage, size = "compact" }) {
  const coverAsset = resolveCoverAsset(component);
  if (coverAsset) {
    return (
      <span className={`book-cover-placeholder book-cover-image ${size === "large" ? "large-cover" : ""}`}>
        <img src={coverAsset} alt={`${component.title} cover`} loading="lazy" />
      </span>
    );
  }

  return (
    <span className={`book-cover-placeholder cover-${component.coverTone || "orange"} ${size === "large" ? "large-cover" : ""}`}>
      <b>{bookPackage.level}</b>
      <strong>{component.title}</strong>
      <small>{component.type}</small>
      <em>{bookPackage.demoSchool}</em>
    </span>
  );
}
