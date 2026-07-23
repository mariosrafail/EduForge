import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BookOpen } from "lucide-react";
import { getUltimateB2Unit2Asset } from "virtual:ultimate-b2-page-assets";
import { Tag } from "../../Shared.jsx";
import { requestBookAssetAccess } from "virtual:book-assets-service";

const unit2PageSections = [
  { id: "reading-19", title: "Reading", pages: "pg 19", images: [getUltimateB2Unit2Asset("19.png")] },
  { id: "reading-20-21", title: "Reading", pages: "pg 20-21", images: [getUltimateB2Unit2Asset("20-21.png")], continuesToVideo: true },
  { id: "vocabulary-22-23", title: "Vocabulary in Use", pages: "pg 22-23", images: [getUltimateB2Unit2Asset("22-23.png")] },
  { id: "grammar-24-25", title: "Grammar in Use", pages: "pg 24-25", images: [getUltimateB2Unit2Asset("24-25.png")] },
  { id: "listening-26", title: "Listening", pages: "pg 26", images: [getUltimateB2Unit2Asset("26.png")] },
  { id: "speaking-27", title: "Speaking", pages: "pg 27", images: [getUltimateB2Unit2Asset("27.png")] },
  { id: "writing-28-29", title: "Writing", pages: "pg 28-29", images: [getUltimateB2Unit2Asset("28-29.png")] },
  { id: "review-30", title: "Review 2", pages: "pg 30", images: [getUltimateB2Unit2Asset("30.png")] },
  { id: "practice-31-32", title: "Practice 2", pages: "pg 31-32", images: [getUltimateB2Unit2Asset("31.png"), getUltimateB2Unit2Asset("32.png")] },
  { id: "progress-check-33-34", title: "Progress check 1", pages: "pg 33-34", images: [getUltimateB2Unit2Asset("33.png"), getUltimateB2Unit2Asset("34.png")] },
];

const readingSpreadHotspots = [
  { id: "video", label: "Video", top: "7%", left: "3.2%", width: "45%", height: "14%", ariaLabel: "Open video activity from page 20" },
  { id: "text-audio", label: "Text + Audio", top: "22%", left: "3.4%", width: "46.2%", height: "66%", ariaLabel: "Open reading text with audio from page 20" },
  { id: "exercise-3", label: "Exercise 3", top: "8%", left: "53.2%", width: "43.5%", height: "38%", ariaLabel: "Open Exercise 3 missing sentences" },
  { id: "exercise-4", label: "Exercise 4", top: "48%", left: "53.3%", width: "43.4%", height: "29%", ariaLabel: "Open Exercise 4 circle the correct words" },
];

function ReadingSpreadHotspots({ onHotspot }) {
  return (
    <div className="reading-spread-hotspots" aria-label="Reading page shortcuts">
      {readingSpreadHotspots.map((hotspot, index) => (
        <motion.button
          key={hotspot.id}
          type="button"
          className="reading-spread-hotspot"
          style={{ top: hotspot.top, left: hotspot.left, width: hotspot.width, height: hotspot.height }}
          aria-label={hotspot.ariaLabel}
          onClick={() => onHotspot?.(hotspot.id)}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.28 + index * 0.06, duration: 0.22, ease: "easeOut" }}
          whileHover={{ scale: 1.012 }}
          whileTap={{ scale: 0.985 }}
          data-sound-click="submit"
        >
          <span>{hotspot.label}</span>
        </motion.button>
      ))}
    </div>
  );
}

export function StudentsBookPageGateway({ onContinue, onTextAudio, onExercise3, onExercise4, initialOpenSectionId = null }) {
  const [activeSectionIndex, setActiveSectionIndex] = useState(null);
  const [navigationDirection, setNavigationDirection] = useState(1);
  const [openingSectionId, setOpeningSectionId] = useState(null);
  const [assetUrls, setAssetUrls] = useState({});
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetError, setAssetError] = useState("");
  const [assetAttempt, setAssetAttempt] = useState(0);
  const selectedSection = activeSectionIndex === null ? null : unit2PageSections[activeSectionIndex];

  useEffect(() => {
    if (!selectedSection) return undefined;
    const controller = new AbortController();
    const currentAssets = selectedSection.images;
    const adjacentAssets = [unit2PageSections[activeSectionIndex - 1], unit2PageSections[activeSectionIndex + 1]].filter(Boolean).flatMap((section) => section.images);
    setAssetLoading(true);
    setAssetError("");
    Promise.all(currentAssets.map(async (asset) => {
      if (typeof asset === "string") return { key: asset, url: asset };
      try { const access = await requestBookAssetAccess(asset.assetLogicalKey, { signal: controller.signal }); return { key: asset.assetLogicalKey, url: access.url }; }
      catch (error) { if (import.meta.env.DEV && asset.devFallbackUrl) return { key: asset.assetLogicalKey, url: asset.devFallbackUrl }; throw error; }
    })).then((items) => {
      setAssetUrls((current) => ({ ...current, ...Object.fromEntries(items.map((item) => [item.key, item.url])) }));
      setAssetLoading(false);
      for (const asset of adjacentAssets) if (asset?.assetLogicalKey) requestBookAssetAccess(asset.assetLogicalKey, { signal: controller.signal, retries: 1 }).then((access) => setAssetUrls((current) => ({ ...current, [asset.assetLogicalKey]: access.url }))).catch(() => {});
    }).catch((error) => { if (error.name !== "AbortError") { setAssetLoading(false); setAssetError(error.message || "Book page unavailable"); } });
    return () => controller.abort();
  }, [activeSectionIndex, assetAttempt, selectedSection]);

  useEffect(() => {
    if (!initialOpenSectionId) return;
    const nextIndex = unit2PageSections.findIndex((section) => section.id === initialOpenSectionId);
    if (nextIndex >= 0) {
      setNavigationDirection(1);
      setActiveSectionIndex(nextIndex);
    }
  }, [initialOpenSectionId]);

  useEffect(() => {
    if (activeSectionIndex === null) return undefined;

    const handleViewerKeys = (event) => {
      if (event.key === "Escape") {
        setActiveSectionIndex(null);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setNavigationDirection(1);
        setActiveSectionIndex((current) => Math.min(unit2PageSections.length - 1, current + 1));
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setNavigationDirection(-1);
        setActiveSectionIndex((current) => Math.max(0, current - 1));
      }
    };
    window.addEventListener("keydown", handleViewerKeys);
    return () => window.removeEventListener("keydown", handleViewerKeys);
  }, [activeSectionIndex]);

  const openSection = (section, index) => {
    setOpeningSectionId(section.id);
    setNavigationDirection(1);
    window.setTimeout(() => {
      setActiveSectionIndex(index);
      setOpeningSectionId(null);
    }, 170);
  };

  const goToSection = (nextIndex) => {
    setNavigationDirection(nextIndex > activeSectionIndex ? 1 : -1);
    setActiveSectionIndex(Math.min(Math.max(nextIndex, 0), unit2PageSections.length - 1));
  };

  const goToPreviousSection = () => {
    if (activeSectionIndex <= 0) return;
    goToSection(activeSectionIndex - 1);
  };

  const goToNextSection = () => {
    if (activeSectionIndex >= unit2PageSections.length - 1) return;
    goToSection(activeSectionIndex + 1);
  };

  const handleReadingHotspot = (hotspotId) => {
    if (hotspotId === "video") onContinue?.();
    if (hotspotId === "text-audio") onTextAudio?.();
    if (hotspotId === "exercise-3") onExercise3?.();
    if (hotspotId === "exercise-4") onExercise4?.();
  };

  if (selectedSection) {
    const selectedImages = selectedSection.images.map((asset) => typeof asset === "string" ? asset : assetUrls[asset.assetLogicalKey]).filter(Boolean);
    const spreadClass = selectedSection.images.length > 1 ? "two-page-spread" : "single-page-spread";
    const isFirstSection = activeSectionIndex === 0;
    const isLastSection = activeSectionIndex === unit2PageSections.length - 1;
    const pageTurnVariants = {
      enter: (direction) => ({
        opacity: 0,
        x: direction > 0 ? 72 : -72,
        scale: 0.965,
        rotateY: direction > 0 ? -10 : 10,
      }),
      center: { opacity: 1, x: 0, scale: 1, rotateY: 0 },
      exit: (direction) => ({
        opacity: 0,
        x: direction > 0 ? -72 : 72,
        scale: 0.965,
        rotateY: direction > 0 ? 10 : -10,
      }),
    };

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="page-open"
          className="students-book-gateway book-page-spread-view"
          initial={{ opacity: 0, y: 22, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.98 }}
          transition={{ duration: 0.34, ease: [0.2, 0.9, 0.2, 1] }}
        >
          <motion.span className="book-page-ambient-orb one" aria-hidden="true" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} />
          <motion.span className="book-page-ambient-orb two" aria-hidden="true" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.08 }} />
          <div className="book-page-spread-toolbar">
            <motion.button className="secondary-action compact-action" type="button" onClick={() => setActiveSectionIndex(null)} data-sound-click="back" aria-label="Back to Unit 2 pages" whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
              <ArrowLeft size={16} /> Back to pages
            </motion.button>
            <div>
              <span className="eyebrow">Students Book Â· Unit 2</span>
              <h2>{selectedSection.title} {selectedSection.pages}</h2>
              <small className="book-page-section-counter">{activeSectionIndex + 1} / {unit2PageSections.length}</small>
            </div>
            {selectedSection.continuesToVideo && (
              <motion.button
                className="primary-action compact-action"
                type="button"
                onClick={onContinue}
                data-sound-click="submit"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                Continue to video
              </motion.button>
            )}
          </div>
          <div className="book-page-viewer-shell">
            <motion.button className="book-page-turn-button previous" type="button" onClick={goToPreviousSection} disabled={isFirstSection} aria-label="Previous book section" data-sound-click="tab" whileHover={isFirstSection ? undefined : { x: -3 }} whileTap={isFirstSection ? undefined : { scale: 0.96 }}>
              <ArrowLeft size={18} />
              <span>Previous</span>
            </motion.button>
            <AnimatePresence mode="wait" custom={navigationDirection}>
              <motion.div
                key={selectedSection.id}
                className={`book-page-spread-stage ${spreadClass}`}
                layoutId={`unit2-page-${selectedSection.id}`}
                custom={navigationDirection}
                variants={pageTurnVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.44, ease: [0.2, 0.9, 0.2, 1] }}
              >
                <div className={`book-page-image-layer ${spreadClass}`}>
                  {selectedImages.map((image, index) => (
                    <motion.img
                      key={`${selectedSection.id}-${index}`}
                      src={image}
                      alt={`Students Book Unit 2 ${selectedSection.title} ${selectedSection.pages}${selectedImages.length > 1 ? ` page ${index + 1}` : ""}`}
                      initial={{ opacity: 0, y: 14, rotateY: navigationDirection > 0 ? -4 : 4 }}
                      animate={{ opacity: 1, y: 0, rotateY: 0 }}
                      transition={{ delay: index * 0.06, duration: 0.32, ease: "easeOut" }}
                    />
                  ))}
                  {assetLoading && !selectedImages.length && <div className="book-page-missing" role="status">Loading protected page...</div>}
                  {assetError && !selectedImages.length && <div className="book-page-missing" role="alert">Page unavailable. <button type="button" className="secondary-action compact-action" onClick={() => setAssetAttempt((value) => value + 1)}>Retry</button></div>}
                  {selectedSection.id === "reading-20-21" && <ReadingSpreadHotspots onHotspot={handleReadingHotspot} />}
                </div>
              </motion.div>
            </AnimatePresence>
            <motion.button className="book-page-turn-button next" type="button" onClick={goToNextSection} disabled={isLastSection} aria-label="Next book section" data-sound-click="tab" whileHover={isLastSection ? undefined : { x: 3 }} whileTap={isLastSection ? undefined : { scale: 0.96 }}>
              <span>Next</span>
              <ArrowLeft size={18} />
            </motion.button>
          </div>
          <div className="book-page-mini-nav" aria-label="Unit 2 page sections">
            {unit2PageSections.map((section, index) => (
              <button
                key={`mini-${section.id}`}
                type="button"
                className={index === activeSectionIndex ? "active" : ""}
                onClick={() => goToSection(index)}
                aria-label={`Open ${section.title} pages ${section.pages.replace(/^pg\s*/i, "")}`}
                aria-current={index === activeSectionIndex ? "page" : undefined}
                data-sound-click="tab"
              >
                <span>{index + 1}</span>
                <small>{section.pages.replace("pg ", "")}</small>
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      className="students-book-gateway"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.2, 0.9, 0.2, 1] }}
    >
      <motion.span className="book-gateway-bg-orb one" aria-hidden="true" animate={{ x: [0, 18, 0], y: [0, -12, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
      <motion.span className="book-gateway-bg-orb two" aria-hidden="true" animate={{ x: [0, -16, 0], y: [0, 14, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
      <div className="students-book-gateway-hero">
        <div>
          <span className="eyebrow"><BookOpen size={15} /> Students Book Â· Unit 2</span>
          <h2>Choose a page section.</h2>
          <p>Open any Unit 2 page section. Reading pg 20-21 continues into the video introduction when you are ready.</p>
        </div>
        <Tag tone="green">All sections available</Tag>
      </div>
      <div className="book-section-grid">
        {unit2PageSections.map((section, index) => (
          <motion.button
            key={section.id}
            type="button"
            className={`book-section-card available ${openingSectionId === section.id ? "opening" : ""}`}
            onClick={() => openSection(section, index)}
            title={`Open ${section.title} ${section.pages}`}
            aria-label={`Open ${section.title} pages ${section.pages.replace(/^pg\s*/i, "")}`}
            data-sound-click="submit"
            initial={{ opacity: 0, y: 22, scale: 0.96, rotateX: 3 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.055, duration: 0.34, ease: [0.2, 0.9, 0.2, 1] }}
            whileHover={{ y: -10, scale: 1.035, rotateX: 2, rotateY: index % 2 === 0 ? -2 : 2 }}
            whileTap={{ scale: 0.975 }}
          >
            <motion.span className="book-section-thumb" layoutId={`unit2-page-${section.id}`}>
              <strong>{section.pages.replace("pg ", "")}</strong>
            </motion.span>
            <span className="book-section-card-copy">
              <strong>{section.title}</strong>
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
