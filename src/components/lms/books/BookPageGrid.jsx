import { motion } from "framer-motion";
import { Copy } from "lucide-react";
import { Tag } from "../Shared.jsx";
import { copyHashLink } from "./bookBrowserUtils.js";
import { buildCoursePageHash, getComponentRouteSlug, getPackageRouteSlug } from "../../../utils/hashRoutes.js";

export function BookPageGrid({ component, bookPackage, mode, sections, pageUnits, activeUnit, activeUnitHeading, visibleUnitSections, sectionGridColumns, sectionGridMaxWidth, openingSectionId, openSection, setActiveUnitId }) {
  const showUnitTabs = pageUnits.length > 1;
  const copySectionLink = (section) => {
    const componentSlug = getComponentRouteSlug(component);
    const pageToken = section.pageNumber || section.pageId;
    const packageSlug = getPackageRouteSlug(bookPackage);
    const hash = mode === "teacher"
      ? `/teacher/books/${packageSlug}/components/${componentSlug}/pages/${pageToken}`
      : buildCoursePageHash(packageSlug, componentSlug, pageToken);
    copyHashLink(hash);
  };

  return (
    <motion.div
      className="students-book-gateway book-page-selection-gateway"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.2, 0.9, 0.2, 1] }}
    >
      <motion.span className="book-gateway-bg-orb one" aria-hidden="true" animate={{ x: [0, 18, 0], y: [0, -12, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
      <motion.span className="book-gateway-bg-orb two" aria-hidden="true" animate={{ x: [0, -16, 0], y: [0, 14, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
      <div className="students-book-gateway-hero">
        <div>
          <span className="eyebrow">{component.type} ?? {bookPackage?.packageTitle}</span>
          <h2>Choose a page section.</h2>
        </div>
        <Tag tone="green">{sections.length} section{sections.length === 1 ? "" : "s"} available</Tag>
      </div>
      {activeUnit && (
        <div className="book-page-unit-heading">
          <h3>{activeUnitHeading}</h3>
        </div>
      )}
      <div className="book-section-grid" style={{ "--book-section-columns": sectionGridColumns, "--book-section-grid-max-width": sectionGridMaxWidth }}>
        {visibleUnitSections.map((section, index) => (
          <motion.article
            key={section.id}
            className={`book-section-card available ${openingSectionId === section.id ? "opening" : ""}`}
            initial={{ opacity: 0, y: 22, scale: 0.96, rotateX: 3 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.055, duration: 0.34, ease: [0.2, 0.9, 0.2, 1] }}
            whileHover={{ y: -10, scale: 1.035, rotateX: 2, rotateY: index % 2 === 0 ? -2 : 2 }}
            whileTap={{ scale: 0.975 }}
          >
            <button
              className="book-section-open-button"
              type="button"
              onClick={() => openSection(section, index)}
              title={`Open ${section.title} ${section.pages}`}
              aria-label={`Open ${section.title} ${section.pages}`}
              data-sound-click="submit"
            >
              <motion.span className="book-section-thumb" layoutId={`book-page-${section.id}`}>
                {section.images.length ? section.images.map((image, imageIndex) => (
                  <img key={`${section.id}-thumb-${imageIndex}`} src={image} alt="" loading="lazy" />
                )) : (
                  <span className="book-page-missing">Missing</span>
                )}
              </motion.span>
              <span className="book-section-card-copy">
                <strong>{section.title}</strong>
              </span>
            </button>
            <button
              className="book-card-copy-link book-section-copy-link"
              type="button"
              aria-label={`Copy direct link for ${section.title} ${section.pages}`}
              title="Copy direct link"
              onClick={() => copySectionLink(section)}
              data-sound-click="tab"
            >
              <Copy size={15} />
            </button>
          </motion.article>
        ))}
      </div>
      {showUnitTabs && (
        <div className="book-page-unit-tabs" role="tablist" aria-label={`${component.title} units`}>
          <span className="book-page-unit-tabs-label">Units</span>
          {pageUnits.map((unit) => {
            const unitLabel = unit.displayLabel || unit.label || unit.title || unit.unit;
            const isSelected = activeUnit?.id === unit.id;

            return (
              <button
                key={unit.id}
                type="button"
                role="tab"
                className={isSelected ? "selected" : ""}
                aria-label={`Open unit ${unitLabel}`}
                aria-selected={isSelected}
                onClick={() => setActiveUnitId(unit.id)}
                data-sound-click="tab"
              >
                <span>{isSelected ? unitLabel : unit.number || unitLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
