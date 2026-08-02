import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BookOpenCheck, Copy, Maximize2, Minimize2, MousePointer2, Save, Scan, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Tag } from "../Shared.jsx";
import { ReadingTextAudioScreen, StudentsBookMediaPlayer, UltimateB2ActivityRunner, Unit2VideoOnlyScreen } from "../activities/UltimateB2ActivityRunner.jsx";
import { BookPageHotspots, EditableHotspotLayer } from "./BookPageImagePanel.jsx";
import { BookPageGrid } from "./BookPageGrid.jsx";
import { copyHashLink } from "./bookBrowserUtils.js";
import { BookActivityBuilderModal } from "./activity-builder/BookActivityBuilderModal.jsx";
import { BookActivityRunner } from "./activity-runner/BookActivityRunner.jsx";
import { PageHotspotSettingsPanel } from "./hotspots/PageHotspotSettingsPanel.jsx";
import { listBookPageHotspots, saveBookPageHotspots } from "../../../services/bookPageHotspotsApi.js";
import { FEATURE_FLAGS } from "../../../config/featureFlags.js";
import { buildCoursePageHash, getComponentRouteSlug, getPackageRouteSlug } from "../../../utils/hashRoutes.js";
import { requestBookAssetAccess } from "virtual:book-assets-service";
import { getUltimateB2StudentsBookHotspotActions } from "../../../data/ultimate-b2/studentsBookHotspots.js";

const enableBookHotspotEditor = FEATURE_FLAGS.ENABLE_BOOK_HOTSPOT_EDITOR;
const enableBookActivityBuilder = FEATURE_FLAGS.ENABLE_BOOK_ACTIVITY_BUILDER;
const SCROLLABLE_OVERFLOW_VALUES = new Set(["auto", "scroll", "overlay"]);

const englishJourneyPageAssets = import.meta.glob("../../../assets/books/english-journey-6/pages/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

export function resolveEnglishJourneyPageAsset(imagePath) {
  const normalizedPath = String(imagePath || "").replace(/^\/src\/assets\//, "../../../assets/");
  return englishJourneyPageAssets[normalizedPath] || null;
}

export function resolvePageImage(image) {
  if (!image) return null;
  if (typeof image === "string") return image.startsWith("/src/assets/") ? resolveEnglishJourneyPageAsset(image) : image;
  if (image.assetLogicalKey) return null;
  return image.src || image.imageSrc || image.url || resolveEnglishJourneyPageAsset(image.imagePath || image.path);
}

export function normalizePageImageAsset(image) {
  if (!image) return null;
  return {
    logicalKey: typeof image === "object" ? image.assetLogicalKey || null : null,
    devFallbackUrl: typeof image === "object" ? image.devFallbackUrl || null : null,
    localUrl: resolvePageImage(image),
  };
}

export function normalizeBookPageSections(component = {}) {
  return (component.pageUnits || []).flatMap((unit) => (
    (unit.pages || []).map((page, pageIndex) => {
      const imageAssets = (page.images?.length ? page.images : [page.imageSrc || page.imagePath || page.image]).map(normalizePageImageAsset).filter(Boolean);
      const images = imageAssets.map((asset) => asset.localUrl || asset.devFallbackUrl).filter(Boolean);
      const pageNumber = page.pageNumber || page.number || pageIndex + 1;
      return {
        id: page.id || `${unit.id}-page-${pageNumber}`,
        unitId: unit.id,
        unitNumber: unit.number,
        unitTitle: unit.title || unit.unit,
        unitDisplayLabel: unit.displayLabel || unit.label || unit.title || unit.unit,
        pageId: page.id,
        pageNumber,
        title: page.title || unit.title || `Page ${pageNumber}`,
        pages: page.label || page.pages || `pg ${pageNumber}`,
        images,
        imageAssets,
        actions: page.actions || [],
        activities: page.activities || [],
        media: page.media || [],
        pageNumbers: page.pageNumbers || [pageNumber],
        spreadNumber: page.spreadNumber || page.label || String(pageNumber),
        editorialStatus: page.editorialStatus || null,
        continuesToVideo: page.continuesToVideo,
      };
    })
  ));
}

export function BackToPagesButton({ onBack, label = "Back to pages" }) {
  return (
    <button className="secondary-action compact-action back-to-page-spread-button" type="button" onClick={onBack} data-sound-click="back">
      <ArrowLeft size={16} /> {label}
    </button>
  );
}

function canScrollVertically(element, deltaY) {
  if (!element || !(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (!SCROLLABLE_OVERFLOW_VALUES.has(style.overflowY)) return false;
  if (element.scrollHeight <= element.clientHeight + 1) return false;
  if (deltaY > 0) return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  if (deltaY < 0) return element.scrollTop > 1;
  return false;
}

function handleBookViewportWheel(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  if (typeof document === "undefined") return;

  let current = event.target;
  while (current && current !== event.currentTarget) {
    if (canScrollVertically(current, event.deltaY)) return;
    current = current.parentElement;
  }

  const scrollingElement = document.scrollingElement || document.documentElement;
  const startScrollTop = scrollingElement.scrollTop;
  const deltaY = event.deltaY;

  window.requestAnimationFrame(() => {
    if (scrollingElement.scrollTop !== startScrollTop) return;

    const maxScrollTop = scrollingElement.scrollHeight - scrollingElement.clientHeight;
    const nextScrollTop = Math.min(Math.max(startScrollTop + deltaY, 0), maxScrollTop);
    if (nextScrollTop !== startScrollTop) scrollingElement.scrollTop = nextScrollTop;
  });
}

function captureWindowScrollPosition() {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const scrollingElement = document.scrollingElement || document.documentElement;
  return {
    x: window.scrollX,
    y: window.scrollY,
    top: scrollingElement?.scrollTop ?? window.scrollY,
    left: scrollingElement?.scrollLeft ?? window.scrollX,
  };
}

function restoreWindowScrollPosition(scrollPosition) {
  if (!scrollPosition || typeof window === "undefined" || typeof document === "undefined") return;
  const scrollingElement = document.scrollingElement || document.documentElement;
  window.scrollTo(scrollPosition.x, scrollPosition.y);
  if (scrollingElement) {
    scrollingElement.scrollTop = scrollPosition.top;
    scrollingElement.scrollLeft = scrollPosition.left;
  }
}

function preserveWindowScrollPosition(callback) {
  const scrollPosition = captureWindowScrollPosition();
  callback();
  if (!scrollPosition || typeof window === "undefined") return;

  const restore = () => restoreWindowScrollPosition(scrollPosition);
  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });
  window.setTimeout(restore, 60);
  window.setTimeout(restore, 180);
}

export function BookPageActionExperience({ action, mode = "student", onBack, onAction }) {
  const runnerMode = mode === "teacher" ? "teacher-preview" : "student";
  const target = action?.target || action?.id;

  if (target === "video") {
    return (
      <div className="student-book-pages-shell">
        <div className="book-hotspot-screen">
          <Unit2VideoOnlyScreen mode={runnerMode} onBack={onBack} onContinue={() => onAction?.({ target: "text-audio", label: "Text + Audio" })} />
        </div>
      </div>
    );
  }

  if (target === "text-audio") {
    return (
      <div className="student-book-pages-shell">
        <div className="book-hotspot-screen">
          <ReadingTextAudioScreen onBack={onBack} onStartExercise3={() => onAction?.({ target: "exercise-3", activityKey: "reading-ex3", label: "Exercise 3" })} />
        </div>
      </div>
    );
  }

  if (target === "protected-media" && action?.logicalKey) {
    return (
      <div className="student-book-pages-shell">
        <div className="book-hotspot-screen">
          <BackToPagesButton onBack={onBack} label="Back to page spread" />
          <StudentsBookMediaPlayer logicalKey={action.logicalKey} type={action.mediaType || action.classification} />
        </div>
      </div>
    );
  }

  if (target === "exercise-3" || target === "exercise-4" || action?.activityKey) {
    const activityKey = action?.activityKey || (target === "exercise-3" ? "reading-ex3" : "reading-ex4");
    return (
      <div className="student-book-pages-shell">
        <div className="book-hotspot-screen">
          <BackToPagesButton onBack={onBack} label="Back to page spread" />
          <UltimateB2ActivityRunner activityKey={activityKey} mode={runnerMode} onBack={onBack} hideBreadcrumb />
        </div>
      </div>
    );
  }

  return null;
}

export function BookPagesView({
  component,
  bookPackage,
  mode = "student",
  selectedPageUnitId = null,
  selectedPageId = null,
  selectedPageNumber = null,
  onSelectPage,
  onClearSelectedPage,
}) {
  const sections = useMemo(() => normalizeBookPageSections(component), [component]);
  const [navigationDirection, setNavigationDirection] = useState(1);
  const [openingSectionId, setOpeningSectionId] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [customHotspotsByPage, setCustomHotspotsByPage] = useState({});
  const [editingHotspots, setEditingHotspots] = useState(false);
  const [draftHotspots, setDraftHotspots] = useState([]);
  const [selectedHotspotId, setSelectedHotspotId] = useState(null);
  const [hotspotMessage, setHotspotMessage] = useState("");
  const [hotspotsLoading, setHotspotsLoading] = useState(false);
  const [hotspotsSaving, setHotspotsSaving] = useState(false);
  const [hotspotLoadError, setHotspotLoadError] = useState("");
  const [hotspotSaveError, setHotspotSaveError] = useState("");
  const [loadedHotspotKeys, setLoadedHotspotKeys] = useState({});
  const [builderType, setBuilderType] = useState(null);
  const [activeBookActivityId, setActiveBookActivityId] = useState(null);
  const [pageAssetUrls, setPageAssetUrls] = useState({});
  const [pageAssetLoading, setPageAssetLoading] = useState(false);
  const [pageAssetError, setPageAssetError] = useState("");
  const [pageAssetAttempt, setPageAssetAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fitToScreen, setFitToScreen] = useState(true);
  const [pageJump, setPageJump] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef(null);
  const pageUnits = component.pageUnits || [];
  const selectedSectionIndex = sections.findIndex((section) => (
    (selectedPageId && section.pageId === selectedPageId) ||
    (selectedPageUnitId && selectedPageNumber && section.unitId === selectedPageUnitId && section.pageNumber === selectedPageNumber) ||
    (selectedPageNumber && section.pageNumber === selectedPageNumber)
  ));
  const selectedSection = selectedSectionIndex >= 0 ? sections[selectedSectionIndex] : null;
  const [activeUnitId, setActiveUnitId] = useState(selectedPageUnitId || selectedSection?.unitId || pageUnits[0]?.id || "");
  const activeUnit = pageUnits.find((unit) => unit.id === activeUnitId) || pageUnits[0] || null;
  const activeUnitSections = activeUnit ? sections.filter((section) => section.unitId === activeUnit.id) : sections;
  const visibleUnitSections = activeUnitSections;
  const activeUnitLabel = activeUnit?.displayLabel || activeUnit?.label || activeUnit?.title || activeUnit?.unit || "Pages";
  const activeUnitHeading = activeUnit?.number && activeUnit?.title
    ? `Unit ${activeUnit.number}, ${activeUnit.title}`
    : activeUnitLabel;
  const showUnitTabs = pageUnits.length > 1;
  const sectionGridColumns = Math.min(5, Math.max(1, Math.ceil(visibleUnitSections.length / 2)));
  const sectionGridMaxWidth = `${(sectionGridColumns * 228) + ((sectionGridColumns - 1) * 14)}px`;
  const packageSlug = getPackageRouteSlug(bookPackage);
  const componentSlug = getComponentRouteSlug(component);
  const selectedPageIdentity = useMemo(() => {
    if (!selectedSection) return null;
    const pageId = selectedSection.pageId || selectedSection.id;
    return {
      pageId,
      pageNumber: selectedSection.pageNumber || null,
      storageKey: `${packageSlug}:${componentSlug}:${pageId}`,
    };
  }, [componentSlug, packageSlug, selectedSection]);

  useEffect(() => {
    if (!selectedSection) return undefined;
    const currentRefs = selectedSection.imageAssets.filter((asset) => asset.logicalKey);
    if (!currentRefs.length) { setPageAssetLoading(false); setPageAssetError(""); return undefined; }
    const controller = new AbortController();
    const prefetchCount = Math.max(0, Math.min(Number(import.meta.env.VITE_BOOK_PAGE_PREFETCH_COUNT || 1), 2));
    const adjacentSections = sections.filter((_, index) => Math.abs(index - selectedSectionIndex) > 0 && Math.abs(index - selectedSectionIndex) <= prefetchCount);
    const adjacentRefs = adjacentSections.flatMap((section) => section.imageAssets.filter((asset) => asset.logicalKey));
    setPageAssetLoading(true);
    setPageAssetError("");
    Promise.all(currentRefs.map(async (asset) => {
      try {
        const access = await requestBookAssetAccess(asset.logicalKey, { signal: controller.signal });
        return { logicalKey: asset.logicalKey, url: access.url, expiresAt: access.expiresAt };
      } catch (error) {
        if (import.meta.env.DEV && asset.devFallbackUrl) return { logicalKey: asset.logicalKey, url: asset.devFallbackUrl, expiresAt: null, fallback: true };
        throw error;
      }
    })).then((resolved) => {
      setPageAssetUrls((current) => ({ ...current, ...Object.fromEntries(resolved.map((item) => [item.logicalKey, item])) }));
      setPageAssetLoading(false);
      for (const asset of adjacentRefs) requestBookAssetAccess(asset.logicalKey, { signal: controller.signal, retries: 1 }).then((access) => {
        setPageAssetUrls((current) => ({ ...current, [asset.logicalKey]: { logicalKey: asset.logicalKey, url: access.url, expiresAt: access.expiresAt } }));
        const image = new Image();
        image.src = access.url;
      }).catch(() => {});
    }).catch((error) => {
      if (error.name === "AbortError") return;
      setPageAssetLoading(false);
      setPageAssetError(error.message || "Book page asset could not be loaded.");
    });
    return () => controller.abort();
  }, [pageAssetAttempt, sections, selectedSection, selectedSectionIndex]);

  useEffect(() => {
    document.body.classList.add("is-book-pages-view");
    return () => {
      document.body.classList.remove("is-book-pages-view");
    };
  }, []);

  useEffect(() => {
    const nextUnitId = selectedPageUnitId || selectedSection?.unitId || pageUnits[0]?.id || "";
    if (nextUnitId) setActiveUnitId(nextUnitId);
  }, [pageUnits, selectedPageUnitId, selectedSection?.unitId]);

  useEffect(() => {
    setActiveAction(null);
    setEditingHotspots(false);
    setDraftHotspots([]);
    setSelectedHotspotId(null);
    setHotspotMessage("");
    setHotspotSaveError("");
    setBuilderType(null);
    setActiveBookActivityId(null);
  }, [selectedPageId, selectedPageNumber]);

  useEffect(() => {
    setPageJump(selectedSection?.pageNumber || "");
  }, [selectedSection?.id, selectedSection?.pageNumber]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    // TODO: Re-enable after DATABASE_URL + backend hotspot/activity system is finalized.
    if (!enableBookHotspotEditor) return undefined;
    if (!selectedPageIdentity || editingHotspots || loadedHotspotKeys[selectedPageIdentity.storageKey]) return undefined;

    let mounted = true;
    setHotspotsLoading(true);
    setHotspotLoadError("");

    listBookPageHotspots({
      packageSlug,
      componentSlug,
      pageId: selectedPageIdentity.pageId,
    }).then((hotspots) => {
      if (!mounted) return;
      setCustomHotspotsByPage((current) => ({ ...current, [selectedPageIdentity.storageKey]: hotspots }));
      setLoadedHotspotKeys((current) => ({ ...current, [selectedPageIdentity.storageKey]: true }));
    }).catch((error) => {
      if (!mounted) return;
      setHotspotLoadError(error.message || "Saved clickable areas could not be loaded.");
      setLoadedHotspotKeys((current) => ({ ...current, [selectedPageIdentity.storageKey]: true }));
    }).finally(() => {
      if (mounted) setHotspotsLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [componentSlug, editingHotspots, loadedHotspotKeys, packageSlug, selectedPageIdentity]);

  useEffect(() => {
    if (!enableBookHotspotEditor) return undefined;
    if (!editingHotspots || !selectedHotspotId) return undefined;

    const deleteSelectedHotspot = (event) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      setDraftHotspots((current) => current.filter((area) => area.id !== selectedHotspotId));
      setSelectedHotspotId(null);
    };

    window.addEventListener("keydown", deleteSelectedHotspot);
    return () => window.removeEventListener("keydown", deleteSelectedHotspot);
  }, [editingHotspots, selectedHotspotId]);

  useEffect(() => {
    if (!selectedSection) return undefined;

    const handleViewerKeys = (event) => {
      if (event.key === "Escape") {
        onClearSelectedPage?.();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToSection(selectedSectionIndex + 1, { preserveScroll: true });
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToSection(selectedSectionIndex - 1, { preserveScroll: true });
      }
    };

    window.addEventListener("keydown", handleViewerKeys);
    return () => window.removeEventListener("keydown", handleViewerKeys);
  }, [selectedSection, selectedSectionIndex]);

  const openSection = (section, index) => {
    setOpeningSectionId(section.id);
    setNavigationDirection(1);
    window.setTimeout(() => {
      onSelectPage?.(section.unitId, section.pageId, section.pageNumber);
      setOpeningSectionId(null);
    }, 170);
  };

  const copySectionLink = (section) => {
    const componentSlug = getComponentRouteSlug(component);
    const pageToken = section.pageNumber || section.pageId;
    const packageSlug = getPackageRouteSlug(bookPackage);
    const hash = mode === "teacher"
      ? `/teacher/books/${packageSlug}/components/${componentSlug}/pages/${pageToken}`
      : buildCoursePageHash(packageSlug, componentSlug, pageToken);
    copyHashLink(hash);
  };

  const goToSection = (nextIndex, { preserveScroll = false } = {}) => {
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    const selectNextSection = () => {
      setNavigationDirection(nextIndex > selectedSectionIndex ? 1 : -1);
      const nextSection = sections[nextIndex];
      onSelectPage?.(nextSection.unitId, nextSection.pageId, nextSection.pageNumber);
    };

    if (preserveScroll) {
      preserveWindowScrollPosition(selectNextSection);
      return;
    }

    selectNextSection();
  };

  const jumpToPrintedPage = (event) => {
    event.preventDefault();
    const target = Number(pageJump);
    if (!Number.isInteger(target)) return;
    const nextIndex = sections.findIndex((section) => section.pageNumbers.includes(target));
    if (nextIndex >= 0) goToSection(nextIndex);
  };

  const toggleFullscreen = async () => {
    if (!viewerRef.current || !document.fullscreenEnabled) return;
    if (document.fullscreenElement === viewerRef.current) await document.exitFullscreen();
    else await viewerRef.current.requestFullscreen();
  };

  const startHotspotEditing = (pageKey) => {
    if (!enableBookHotspotEditor) return;
    setDraftHotspots(customHotspotsByPage[pageKey] || []);
    setSelectedHotspotId(null);
    setHotspotMessage("");
    setHotspotSaveError("");
    setEditingHotspots(true);
  };

  const saveHotspotEditing = async (pageIdentity) => {
    if (!enableBookHotspotEditor) return;
    if (!pageIdentity) return;
    setHotspotsSaving(true);
    setHotspotSaveError("");

    try {
      const savedHotspots = await saveBookPageHotspots({
        packageSlug,
        componentSlug,
        pageId: pageIdentity.pageId,
        pageNumber: pageIdentity.pageNumber,
        hotspots: draftHotspots,
        // TODO: pass the authenticated editor id when page-level editing permissions are wired through this viewer.
        createdBy: null,
      });
      setCustomHotspotsByPage((current) => ({ ...current, [pageIdentity.storageKey]: savedHotspots }));
      setLoadedHotspotKeys((current) => ({ ...current, [pageIdentity.storageKey]: true }));
      setSelectedHotspotId(null);
      setEditingHotspots(false);
    } catch (error) {
      setHotspotSaveError(error.message || "Clickable areas could not be saved.");
    } finally {
      setHotspotsSaving(false);
    }
  };

  const cancelHotspotEditing = () => {
    setDraftHotspots([]);
    setSelectedHotspotId(null);
    setEditingHotspots(false);
  };

  const deleteSelectedHotspot = () => {
    if (!selectedHotspotId) return;
    setDraftHotspots((current) => current.filter((area) => area.id !== selectedHotspotId));
    setSelectedHotspotId(null);
  };

  const updateSelectedHotspot = (nextHotspot) => {
    setDraftHotspots((current) => current.map((area) => (area.id === nextHotspot.id ? nextHotspot : area)));
  };

  const assignSelectedHotspotAction = (activity, action) => {
    if (!enableBookActivityBuilder) return;
    if (!selectedHotspotId) return;
    setDraftHotspots((current) => current.map((area) => (
      area.id === selectedHotspotId
        ? {
          ...area,
          label: area.label === "Clickable area" ? activity.title : area.label,
          actionType: action.actionType,
          actionTargetId: action.actionTargetId,
          actionPayload: action.actionPayload,
        }
        : area
    )));
    setBuilderType(null);
    setHotspotMessage(`${activity.title} assigned`);
  };

  const activateCustomHotspot = (area) => {
    if (!enableBookHotspotEditor) return;
    const actionType = area.actionType || "none";
    if (actionType === "none") {
      setHotspotMessage("No action assigned to this hotspot.");
      return;
    }
    if (actionType === "external_url") {
      const url = area.actionPayload?.url;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setHotspotMessage("No URL assigned to this hotspot.");
      return;
    }
    const activityId = area.actionTargetId || area.actionPayload?.activityId;
    if (activityId) {
      setActiveBookActivityId(activityId);
      return;
    }
    setHotspotMessage("Assigned activity could not be found.");
  };

  if (!sections.length) {
    return (
      <div className="students-book-gateway book-pages-empty-state">
        <div className="students-book-gateway-hero">
          <div>
            <span className="eyebrow"><BookOpenCheck size={15} /> {component.title}</span>
            <h2>No book pages available.</h2>
            <p>This component has no page data yet.</p>
          </div>
          <Tag tone="slate">Empty</Tag>
        </div>
      </div>
    );
  }

  if (activeAction) {
    return <BookPageActionExperience action={activeAction} mode={mode} onBack={() => setActiveAction(null)} onAction={setActiveAction} />;
  }

  if (selectedSection) {
    const selectedImages = selectedSection.imageAssets.map((asset) => asset.logicalKey ? pageAssetUrls[asset.logicalKey]?.url : asset.localUrl).filter(Boolean);
    const spreadClass = selectedSection.imageAssets.length > 1 ? "two-page-spread" : "single-page-spread";
    const unitSections = sections.filter((section) => section.unitId === selectedSection.unitId);
    const selectedUnitSectionIndex = unitSections.findIndex((section) => section.id === selectedSection.id);
    const isFirstSection = selectedSectionIndex === 0;
    const isLastSection = selectedSectionIndex === sections.length - 1;
    const pageHotspotKey = selectedPageIdentity.storageKey;
    const hotspotEditingActive = enableBookHotspotEditor && editingHotspots;
    // TODO: Re-enable custom DB hotspots after the backend hotspot/activity system is finalized.
    const currentCustomHotspots = enableBookHotspotEditor
      ? (hotspotEditingActive ? draftHotspots : customHotspotsByPage[pageHotspotKey] || [])
      : [];
    const authoredHotspotActions = packageSlug === "ultimate-b2" && componentSlug === "students-book"
      ? getUltimateB2StudentsBookHotspotActions({
        pageId: selectedSection.pageId,
        pageNumber: selectedSection.pageNumber,
        unitNumber: selectedSection.unitNumber,
      })
      : [];
    const selectedDraftHotspot = hotspotEditingActive ? draftHotspots.find((area) => area.id === selectedHotspotId) : null;
    const goToUnitSection = (nextUnitIndex, options) => {
      const nextSection = unitSections[nextUnitIndex];
      if (!nextSection) return;
      const nextGlobalIndex = sections.findIndex((section) => section.id === nextSection.id);
      goToSection(nextGlobalIndex, options);
    };
    const visibleActivities = mode === "teacher"
      ? selectedSection.activities
      : selectedSection.activities.filter((activity) => activity.availability === "enabled");
    const availableMediaActions = selectedSection.actions.filter((action) => action.classification === "audio" || action.classification === "video");
    const openCatalogActivity = (activity) => {
      const action = selectedSection.actions.find((candidate) => candidate.activityKey === activity.activityKey || candidate.id === activity.id);
      if (action) setActiveAction(action);
    };
    const pageNavigationVariants = {
      enter: (direction) => ({
        opacity: 0,
        x: direction > 0 ? 72 : -72,
        scale: 0.965,
      }),
      center: { opacity: 1, x: 0, scale: 1 },
      exit: (direction) => ({
        opacity: 0,
        x: direction > 0 ? -72 : 72,
        scale: 0.965,
      }),
    };

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="page-open"
          ref={viewerRef}
          className={`students-book-gateway book-page-spread-view book-page-selection-gateway ${isFullscreen ? "is-fullscreen" : ""}`}
          onWheelCapture={handleBookViewportWheel}
          initial={{ opacity: 0, y: 22, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.98 }}
          transition={{ duration: 0.34, ease: [0.2, 0.9, 0.2, 1] }}
        >
          <motion.span className="book-page-ambient-orb one" aria-hidden="true" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} />
          <motion.span className="book-page-ambient-orb two" aria-hidden="true" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.08 }} />
          <div className="book-page-spread-toolbar">
            <motion.button className="secondary-action compact-action" type="button" onClick={onClearSelectedPage} data-sound-click="back" aria-label="Back to pages" whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
              <ArrowLeft size={16} /> Back to pages
            </motion.button>
            <div>
              <span className="eyebrow">{component.type} · {selectedSection.unitTitle || bookPackage?.packageTitle}</span>
              <h2>{selectedSection.title} {selectedSection.pages}</h2>
              <small className="book-page-section-counter">{selectedUnitSectionIndex + 1} / {unitSections.length}</small>
            </div>
            <div className="page-hotspot-editor-toolbar" aria-label="Book page actions">
              <label className="book-page-unit-select-label">
                <span>Unit</span>
                <select
                  aria-label="Select Students Book unit"
                  value={selectedSection.unitId}
                  onChange={(event) => {
                    const nextIndex = sections.findIndex((section) => section.unitId === event.target.value);
                    if (nextIndex >= 0) goToSection(nextIndex);
                  }}
                >
                  {pageUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.title || unit.displayLabel}</option>)}
                </select>
              </label>
              <form className="book-page-jump" onSubmit={jumpToPrintedPage}>
                <label htmlFor="book-page-jump-input">Page</label>
                <input id="book-page-jump-input" type="number" min="5" max="154" value={pageJump} onChange={(event) => setPageJump(event.target.value)} />
                <button className="secondary-action compact-action" type="submit">Go</button>
              </form>
              <div className="book-page-zoom-controls" aria-label="Page zoom controls">
                <button className="secondary-action compact-action" type="button" onClick={() => { setFitToScreen(false); setZoom((value) => Math.max(0.6, value - 0.2)); }} disabled={zoom <= 0.6} aria-label="Zoom out"><ZoomOut size={16} /></button>
                <button className={`secondary-action compact-action ${fitToScreen ? "selected" : ""}`} type="button" onClick={() => { setFitToScreen(true); setZoom(1); }} aria-label="Fit page to screen"><Scan size={16} /> Fit</button>
                <button className="secondary-action compact-action" type="button" onClick={() => { setFitToScreen(false); setZoom((value) => Math.min(2.4, value + 0.2)); }} disabled={zoom >= 2.4} aria-label="Zoom in"><ZoomIn size={16} /></button>
                {typeof document !== "undefined" && document.fullscreenEnabled && <button className="secondary-action compact-action" type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}>{isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}
              </div>
              {enableBookHotspotEditor && hotspotMessage && <span className="editable-hotspot-click-message">{hotspotMessage}</span>}
              {enableBookHotspotEditor && hotspotsLoading && <span className="editable-hotspot-click-message">Loading areas...</span>}
              {enableBookHotspotEditor && hotspotLoadError && <span className="editable-hotspot-click-message warning">{hotspotLoadError}</span>}
              {enableBookHotspotEditor && hotspotSaveError && <span className="editable-hotspot-click-message warning">{hotspotSaveError}</span>}
              {!hotspotEditingActive && selectedSection.continuesToVideo && (
                <motion.button
                  className="primary-action compact-action"
                  type="button"
                  onClick={() => setActiveAction(selectedSection.actions.find((action) => action.target === "video") || { target: "video", label: "Video" })}
                  data-sound-click="submit"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                >
                  Continue to video
                </motion.button>
              )}
              {enableBookHotspotEditor && (
                !hotspotEditingActive ? (
                  <button className="secondary-action compact-action" type="button" onClick={() => startHotspotEditing(pageHotspotKey)} data-sound-click="tab">
                    <MousePointer2 size={16} /> Edit
                  </button>
                ) : (
                  <>
                    <button className="primary-action compact-action" type="button" onClick={() => saveHotspotEditing(selectedPageIdentity)} disabled={hotspotsSaving} data-sound-click="submit">
                      <Save size={16} /> {hotspotsSaving ? "Saving..." : "Save"}
                    </button>
                    <button className="secondary-action compact-action" type="button" onClick={cancelHotspotEditing} disabled={hotspotsSaving} data-sound-click="back">
                      <X size={16} /> Cancel
                    </button>
                    {selectedHotspotId && (
                      <button className="secondary-action compact-action danger-action" type="button" onClick={deleteSelectedHotspot} disabled={hotspotsSaving} data-sound-click="deleteRemove">
                        <Trash2 size={16} /> Delete selected
                      </button>
                    )}
                  </>
                )
              )}
            </div>
          </div>
          <div className={`book-page-viewer-shell ${hotspotEditingActive ? "with-hotspot-settings" : ""}`}>
            <motion.button className="book-page-turn-button previous" type="button" onClick={() => goToSection(selectedSectionIndex - 1, { preserveScroll: true })} disabled={isFirstSection} aria-label="Previous book section" data-sound-click="tab" whileHover={isFirstSection ? undefined : { x: -3 }} whileTap={isFirstSection ? undefined : { scale: 0.96 }}>
              <ArrowLeft size={18} />
              <span>Previous</span>
            </motion.button>
            <AnimatePresence mode="wait" custom={navigationDirection}>
              <motion.div
                key={selectedSection.id}
                className={`book-page-spread-stage ${spreadClass} ${fitToScreen ? "fit-to-screen" : "manual-zoom"}`}
                layoutId={`book-page-${selectedSection.id}`}
                custom={navigationDirection}
                variants={pageNavigationVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.44, ease: [0.2, 0.9, 0.2, 1] }}
              >
                <div
                  className={`book-page-image-layer ${spreadClass}`}
                  style={{ transform: fitToScreen ? undefined : `scale(${zoom})`, transformOrigin: "center top" }}
                >
                  {selectedImages.length ? selectedImages.map((image, index) => (
                    <motion.img
                      key={`${selectedSection.id}-${index}`}
                      className="book-page-spread-image"
                      src={image}
                      alt={`${component.title} ${selectedSection.title} ${selectedSection.pages}${selectedImages.length > 1 ? ` page ${index + 1}` : ""}`}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.06, duration: 0.32, ease: "easeOut" }}
                    />
                  )) : pageAssetLoading ? (
                    <div className="book-page-missing" role="status">Loading protected page...</div>
                  ) : pageAssetError ? (
                    <div className="book-page-missing" role="alert">Page unavailable. <button type="button" className="secondary-action compact-action" onClick={() => setPageAssetAttempt((value) => value + 1)}>Retry</button></div>
                  ) : (
                    <div className="book-page-missing">Page asset is not available for online delivery.</div>
                  )}
                  <BookPageHotspots actions={selectedSection.actions} onAction={setActiveAction} />
                  <BookPageHotspots actions={authoredHotspotActions} onAction={setActiveAction} className="authored-book-page-hotspots" />
                  {enableBookHotspotEditor && (
                    <EditableHotspotLayer
                      pageId={pageHotspotKey}
                      areas={currentCustomHotspots}
                      editing={hotspotEditingActive}
                      selectedAreaId={selectedHotspotId}
                      onSelectArea={setSelectedHotspotId}
                      onChangeAreas={setDraftHotspots}
                      onActivateArea={(area) => {
                        activateCustomHotspot(area);
                      }}
                    />
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
            {hotspotEditingActive && (
              <PageHotspotSettingsPanel
                hotspot={selectedDraftHotspot}
                onChange={updateSelectedHotspot}
                onDelete={deleteSelectedHotspot}
                onOpenBuilder={setBuilderType}
              />
            )}
            <motion.button className="book-page-turn-button next" type="button" onClick={() => goToSection(selectedSectionIndex + 1, { preserveScroll: true })} disabled={isLastSection} aria-label="Next book section" data-sound-click="tab" whileHover={isLastSection ? undefined : { x: 3 }} whileTap={isLastSection ? undefined : { scale: 0.96 }}>
              <span>Next</span>
              <ArrowLeft size={18} />
            </motion.button>
          </div>
          {(visibleActivities.length > 0 || availableMediaActions.length > 0) && (
            <aside className="book-page-resources" aria-label="Activities and media for this page">
              <div>
                <span className="eyebrow">Page resources</span>
                <h3>Activities and media</h3>
              </div>
              <div className="book-page-resource-list">
                {availableMediaActions.map((action) => (
                  <button key={action.id} type="button" className="book-page-resource available" onClick={() => setActiveAction(action)}>
                    <strong>{action.label}</strong><small>{action.classification}</small>
                  </button>
                ))}
                {visibleActivities.map((activity) => {
                  const enabled = activity.availability === "enabled" && Boolean(activity.activityKey);
                  return (
                    <button key={activity.id} type="button" className={`book-page-resource ${enabled ? "available" : "disabled"}`} disabled={!enabled} onClick={() => openCatalogActivity(activity)}>
                      <strong>{activity.title || `Activity ${activity.id.split("-o").at(-1)}`}</strong>
                      <small>{enabled ? "Ready" : `${activity.activityType} · ${activity.editorialStatus}`}</small>
                    </button>
                  );
                })}
              </div>
            </aside>
          )}
          <div className="book-page-mini-nav" aria-label={`${component.title} page sections`}>
            {unitSections.map((section, index) => (
              <button
                key={`mini-${section.id}`}
                type="button"
                className={section.id === selectedSection.id ? "active" : ""}
                onClick={() => goToUnitSection(index)}
                aria-label={`Open ${section.title} ${section.pages}`}
                aria-current={section.id === selectedSection.id ? "page" : undefined}
                data-sound-click="tab"
              >
                {section.images[0] && <img src={section.images[0]} alt="" loading="lazy" />}
                <span>{section.spreadNumber}</span>
                <small>{section.title}</small>
              </button>
            ))}
          </div>
          {enableBookActivityBuilder && builderType && selectedPageIdentity && (
            <BookActivityBuilderModal
              context={{ packageSlug, componentSlug, pageId: selectedPageIdentity.pageId, pageNumber: selectedPageIdentity.pageNumber }}
              initialType={builderType}
              onClose={() => setBuilderType(null)}
              onActivityCreated={assignSelectedHotspotAction}
              onExistingSelected={(activity, action) => assignSelectedHotspotAction(activity, { ...action, actionType: "existing_activity" })}
            />
          )}
          {enableBookActivityBuilder && activeBookActivityId && <BookActivityRunner activityId={activeBookActivityId} onClose={() => setActiveBookActivityId(null)} />}
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      className="students-book-gateway book-page-selection-gateway"
      onWheelCapture={handleBookViewportWheel}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.2, 0.9, 0.2, 1] }}
    >
      <motion.span className="book-gateway-bg-orb one" aria-hidden="true" animate={{ x: [0, 18, 0], y: [0, -12, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
      <motion.span className="book-gateway-bg-orb two" aria-hidden="true" animate={{ x: [0, -16, 0], y: [0, 14, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
      <div className="students-book-gateway-hero">
        <div>
          <span className="eyebrow"><BookOpenCheck size={15} /> {component.type} · {bookPackage?.packageTitle}</span>
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
