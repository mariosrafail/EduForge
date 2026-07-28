import { ultimateB2CoverAssets } from "virtual:ultimate-b2-cover-assets";
import { useBookAsset } from "../../../hooks/useBookAsset.js";
import { getCanonicalBookId, resolveCoverAsset } from "./bookCoverAssets.js";

export function BookCover({ component, bookPackage, size = "compact" }) {
  const canonicalBookId = getCanonicalBookId(component);
  const packageIdentity = `${bookPackage?.slug || ""} ${bookPackage?.packageTitle || bookPackage?.title || ""}`.toLowerCase();
  const componentIdentity = `${component?.slug || ""} ${component?.id || ""}`.toLowerCase();
  const isUltimateB2 = packageIdentity.includes("ultimate-b2") || packageIdentity.includes("ultimate b2") || componentIdentity.includes("ultimate-b2");
  const ultimateCover = isUltimateB2 ? ultimateB2CoverAssets[canonicalBookId] || null : null;
  const remoteCover = useBookAsset(ultimateCover?.logicalKey || null, { devFallbackUrl: ultimateCover?.devFallbackUrl || ultimateCover?.localUrl || null });
  const coverAsset = ultimateCover ? remoteCover.url : resolveCoverAsset(component, bookPackage);
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
      <small>Cover coming soon</small>
    </span>
  );
}
