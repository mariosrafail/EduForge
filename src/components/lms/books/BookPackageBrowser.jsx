import { ArrowLeft, BookOpenCheck, CheckSquare, ChevronDown, Copy, Eye, FileText, Layers3, Lock, Play, Send } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import grammarBookCover from "../../../assets/books/ultimate-b2/covers/ultimate_b2_grammar_book.jpg";
import studentsBookCover from "../../../assets/books/ultimate-b2/covers/ultimate_b2_students_book.jpg";
import testBookCover from "../../../assets/books/ultimate-b2/covers/ultimate_b2_test_book.jpg";
import workbookCover from "../../../assets/books/ultimate-b2/covers/ultimate_b2_workbook.jpg";
import englishJourney6Cover from "../../../assets/books/english-journey-6/covers/english_journey_6_students_book.png";
import { ultimateB2Package } from "../../../data/ultimateB2DemoData.js";
import {
  buildActivityHash,
  buildCourseComponentHash,
  buildCoursePageHash,
  getComponentRouteSlug,
  getPackageRouteSlug,
} from "../../../utils/hashRoutes.js";
import { ReadingTextAudioScreen, UltimateB2ActivityRunner, Unit2VideoOnlyScreen } from "../activities/UltimateB2ActivityRunner.jsx";
import { Card, Tag } from "../Shared.jsx";

const coverAssets = {
  "students-book": studentsBookCover,
  students_book: studentsBookCover,
  "ultimate-b2-students-book": studentsBookCover,
  workbook: workbookCover,
  "ultimate-b2-workbook": workbookCover,
  "grammar-book": grammarBookCover,
  grammar_book: grammarBookCover,
  "ultimate-b2-grammar-book": grammarBookCover,
  "test-book": testBookCover,
  test_book: testBookCover,
  "ultimate-b2-test-book": testBookCover,
  "ej6-students-book": englishJourney6Cover,
  "english-journey-6-students-book": englishJourney6Cover,
  "ej6-workbook": englishJourney6Cover,
  "english-journey-6-workbook": englishJourney6Cover,
  "ej6-grammar-book": englishJourney6Cover,
  "english-journey-6-grammar-book": englishJourney6Cover,
  "ej6-test-book": englishJourney6Cover,
  "english-journey-6-test-book": englishJourney6Cover,
  "ej6-video-bank": englishJourney6Cover,
  "english-journey-6-video-bank": englishJourney6Cover,
};

const englishJourneyPageAssets = import.meta.glob("../../../assets/books/english-journey-6/pages/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

function statusTone(status) {
  if (status === "Completed" || status === "Available" || status === "Submitted") return "green";
  if (status === "Assigned") return "gold";
  if (status === "Locked") return "slate";
  return "blue";
}

function exerciseActionLabel(exercise) {
  if (exercise.status === "Completed") return "Review";
  if (exercise.status === "Submitted") return "Review";
  if (exercise.status === "Assigned") return "Continue";
  return "Start";
}

function isExerciseActive(exercise) {
  return Boolean(exercise.demoActivityKey && !exercise.locked && (exercise.availableToStudent || exercise.assignable));
}

function getActiveExercises(component) {
  return component.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.exercises.filter(isExerciseActive)));
}

function copyHashLink(hash) {
  if (typeof window === "undefined") return;
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${hash}`;
  navigator.clipboard?.writeText(url).catch(() => {});
}

function buildBookPackageComponentHash(mode, bookPackage, componentSlug) {
  const packageSlug = getPackageRouteSlug(bookPackage);
  if (mode === "teacher") return `/teacher/books/${packageSlug}/components/${componentSlug}`;
  return buildCourseComponentHash(packageSlug, componentSlug);
}

function resolveCoverAsset(component) {
  const lookupValues = [
    component.id,
    component.slug,
    component.componentType,
    component.component_type,
    component.coverAssetPath,
    component.cover_asset_path,
    component.title,
  ].map((value) => String(value || "").toLowerCase());

  if (lookupValues.some((value) => value.includes("english-journey-6") || value.includes("english journey 6") || value.includes("ej6"))) return englishJourney6Cover;
  if (lookupValues.some((value) => value.includes("students_book") || value.includes("students-book") || value.includes("students book"))) return studentsBookCover;
  if (lookupValues.some((value) => value.includes("workbook"))) return workbookCover;
  if (lookupValues.some((value) => value.includes("grammar"))) return grammarBookCover;
  if (lookupValues.some((value) => value.includes("test"))) return testBookCover;

  return coverAssets[component.id] || coverAssets[component.slug] || coverAssets[component.componentType] || null;
}

function getCanonicalBookId(component) {
  const values = [component.id, component.slug, component.componentType, component.component_type, component.title]
    .map((value) => String(value || "").toLowerCase());

  if (values.some((value) => value.includes("english-journey-6") || value.includes("ej6"))) return component.slug || component.id;
  if (values.some((value) => value.includes("students_book") || value.includes("students-book") || value.includes("students book"))) return "students-book";
  if (values.some((value) => value.includes("workbook"))) return "workbook";
  if (values.some((value) => value.includes("grammar"))) return "grammar-book";
  if (values.some((value) => value.includes("test"))) return "test-book";
  if (values.some((value) => value.includes("video"))) return "video-bank";
  return component.slug || component.id;
}

function isBookMatch(component, selectedBookId) {
  if (!selectedBookId) return false;
  return component.id === selectedBookId || component.slug === selectedBookId || component.routeSlug === selectedBookId || getCanonicalBookId(component) === selectedBookId;
}

function BookCover({ component, bookPackage, size = "compact" }) {
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

function TeacherAssignControl({ exercise, classOptions }) {
  const [selectedClasses, setSelectedClasses] = useState([classOptions[0]]);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggleClass = (className) => {
    setSelectedClasses((current) => (
      current.includes(className) ? current.filter((item) => item !== className) : [...current, className]
    ));
    setMessage("");
  };

  const assignExercise = () => {
    const targets = selectedClasses.length ? selectedClasses : [classOptions[0]];
    setSelectedClasses(targets);
    setMessage(`Exercise assigned to ${targets.join(", ")}.`);
    setOpen(false);
  };

  return (
    <div className="teacher-assign-popover" ref={popoverRef}>
      <button
        className="teacher-assign-toggle"
        type="button"
        aria-expanded={open}
        aria-label={`Assign ${exercise.title} to class`}
        title="Assign to class"
        onClick={() => setOpen((current) => !current)}
        data-sound-click="tab"
      >
        <CheckSquare size={17} />
        <span>Assign</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="teacher-assign-menu" role="dialog" aria-label={`Choose classes for ${exercise.title}`} onClick={(event) => event.stopPropagation()}>
          <strong>Assign to class</strong>
          <div className="book-browser-class-picker">
            {classOptions.map((className) => (
              <label key={className}>
                <input type="checkbox" checked={selectedClasses.includes(className)} onChange={() => toggleClass(className)} />
                <span>{className}</span>
              </label>
            ))}
          </div>
          <button className="primary-action compact-action" type="button" onClick={assignExercise} data-sound-click="submit">
            <Send size={16} /> Assign
          </button>
        </div>
      )}
      {message && <small className="book-browser-success">{message}</small>}
    </div>
  );
}

function DisabledAssignControl() {
  return (
    <div className="teacher-assign-popover">
      <button className="teacher-assign-toggle disabled" type="button" disabled title="Not available in demo">
        <Lock size={16} />
        <span>Locked</span>
      </button>
      <small className="book-browser-muted">Not available in demo</small>
    </div>
  );
}

function LockedUnitRow({ unit }) {
  const lessonCount = unit.lessons.reduce((count, lesson) => count + lesson.exercises.length, 0);

  return (
    <article className="book-locked-unit" aria-disabled="true">
      <span><Lock size={17} /></span>
      <div>
        <strong>{unit.title}</strong>
        <p>{lessonCount} locked lesson{lessonCount === 1 ? "" : "s"} visible in the full digital book.</p>
      </div>
      <Tag tone="slate">Locked demo</Tag>
    </article>
  );
}

function ActiveExerciseRow({ exercise, mode, onStartExercise, onPreviewExercise, classOptions, completedActivities = {} }) {
  const isTeacher = mode === "teacher";
  const completed = !isTeacher && completedActivities[exercise.demoActivityKey];
  const displayExercise = completed
    ? { ...exercise, status: "Submitted", studentProgressLabel: `Submitted / ${completed.score}%` }
    : exercise;
  const canStart = exercise.availableToStudent && typeof onStartExercise === "function";

  return (
    <article className="book-exercise-row active-demo-row">
      <div className="book-exercise-main">
        <strong>{exercise.title}</strong>
        <p>{exercise.description}</p>
        <div className="book-exercise-meta">
          <span>{displayExercise.skill}</span>
          <span>{displayExercise.type}</span>
          <span>{displayExercise.estimatedTime}</span>
        </div>
      </div>
      <div className="book-exercise-status">
        <Tag tone={statusTone(displayExercise.status)}>{displayExercise.status}</Tag>
        <small>{isTeacher ? displayExercise.progressLabel : displayExercise.studentProgressLabel}</small>
      </div>
      {isTeacher ? (
        <div className="book-browser-teacher-actions">
          <button
            className="secondary-action compact-action icon-only-action"
            type="button"
            aria-label={`Copy preview link for ${exercise.title}`}
            title="Copy preview link"
            onClick={() => copyHashLink(buildActivityHash(exercise.demoActivityKey, "teacher-preview"))}
            data-sound-click="tab"
          >
            <Copy size={15} />
          </button>
          <button className="secondary-action compact-action" type="button" onClick={() => onPreviewExercise?.(exercise)} data-sound-click="tab">
            <Eye size={16} /> Preview
          </button>
          {exercise.assignable ? <TeacherAssignControl exercise={exercise} classOptions={classOptions} /> : <Tag tone="slate">Not assignable</Tag>}
        </div>
      ) : (
        <button
          className="secondary-action compact-action"
          type="button"
          disabled={!canStart}
          onClick={() => onStartExercise?.(exercise)}
          data-sound-click="submit"
        >
          <Play size={16} /> {exerciseActionLabel(displayExercise)}
        </button>
      )}
    </article>
  );
}

function LockedExerciseRow({ exercise }) {
  return (
    <article className="book-exercise-row locked-exercise-row" aria-disabled="true">
      <div className="book-exercise-main">
        <strong>{exercise.title}</strong>
        <p>{exercise.description}</p>
        <div className="book-exercise-meta">
          <span>{exercise.skill}</span>
          <span>{exercise.type}</span>
          <span>{exercise.estimatedTime}</span>
        </div>
      </div>
      <div className="book-exercise-status">
        <Tag tone="slate">Locked</Tag>
        <small>{exercise.studentProgressLabel || "Locked for demo"}</small>
      </div>
      <button className="secondary-action compact-action" type="button" disabled>
        <Lock size={16} /> Locked
      </button>
    </article>
  );
}

function TeacherExerciseRow({ exercise, onPreviewExercise, classOptions }) {
  const active = isExerciseActive(exercise);
  const Icon = active ? FileText : Lock;

  return (
    <article className={`teacher-book-exercise-row ${active ? "active" : "locked"}`}>
      <span className="teacher-book-exercise-icon"><Icon size={18} /></span>
      <div className="teacher-book-exercise-main">
        <strong>{exercise.title}</strong>
        <p>{exercise.description}</p>
        <div className="book-exercise-meta">
          <span>{exercise.skill}</span>
          <span>{exercise.type}</span>
          <span>{exercise.estimatedTime}</span>
        </div>
      </div>
      <div className="teacher-book-exercise-status">
        <Tag tone={active ? statusTone(exercise.status) : "slate"}>{active ? exercise.status : "Locked in demo"}</Tag>
        <small>{active ? exercise.progressLabel : "Publisher placeholder"}</small>
      </div>
      <div className="teacher-book-row-actions">
        <button
          className="secondary-action compact-action icon-only-action"
          type="button"
          disabled={!active}
          aria-label={`Copy preview link for ${exercise.title}`}
          title="Copy preview link"
          onClick={() => copyHashLink(buildActivityHash(exercise.demoActivityKey, "teacher-preview"))}
          data-sound-click="tab"
        >
          <Copy size={15} />
        </button>
        <button
          className="secondary-action compact-action teacher-preview-action"
          type="button"
          disabled={!active}
          onClick={() => onPreviewExercise?.(exercise)}
          data-sound-click="tab"
        >
          <Eye size={15} /> Preview
        </button>
        {active && exercise.assignable ? <TeacherAssignControl exercise={exercise} classOptions={classOptions} /> : <DisabledAssignControl />}
      </div>
    </article>
  );
}

function TeacherBookUnitList({ component, onPreviewExercise, classOptions }) {
  return (
    <div className="teacher-book-unit-list">
      {component.units.map((unit) => (
        <section key={unit.id} className="teacher-book-unit">
          <div className="teacher-book-unit-header">
            <div>
              <span>{unit.unit}</span>
              <strong>{unit.title}</strong>
            </div>
            <Tag tone={unit.lessons.some((lesson) => lesson.exercises.some(isExerciseActive)) ? "green" : "slate"}>
              {unit.lessons.some((lesson) => lesson.exercises.some(isExerciseActive)) ? "Demo active" : "Locked"}
            </Tag>
          </div>
          <div className="teacher-book-unit-rows">
            {unit.lessons.flatMap((lesson) => lesson.exercises.map((exercise) => (
              <TeacherExerciseRow key={exercise.id} exercise={exercise} onPreviewExercise={onPreviewExercise} classOptions={classOptions} />
            )))}
          </div>
        </section>
      ))}
    </div>
  );
}

function resolveEnglishJourneyPageAsset(imagePath) {
  const normalizedPath = String(imagePath || "").replace(/^\/src\/assets\//, "../../../assets/");
  return englishJourneyPageAssets[normalizedPath] || null;
}

function resolvePageImage(image) {
  if (!image) return null;
  if (typeof image === "string") return image.startsWith("/src/assets/") ? resolveEnglishJourneyPageAsset(image) : image;
  return image.src || image.imageSrc || image.url || resolveEnglishJourneyPageAsset(image.imagePath || image.path);
}

function normalizeBookPageSections(component = {}) {
  return (component.pageUnits || []).flatMap((unit) => (
    (unit.pages || []).map((page, pageIndex) => {
      const images = (page.images?.length ? page.images : [page.imageSrc || page.imagePath || page.image]).map(resolvePageImage).filter(Boolean);
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
        actions: page.actions || [],
        continuesToVideo: page.continuesToVideo,
      };
    })
  ));
}

function BookPageHotspots({ actions = [], onAction }) {
  if (!actions.length) return null;
  return (
    <div className="reading-spread-hotspots" aria-label="Book page shortcuts">
      {actions.map((action, index) => (
        <motion.button
          key={action.id || action.target || action.label}
          type="button"
          className="reading-spread-hotspot"
          style={{ top: action.top, left: action.left, width: action.width, height: action.height }}
          aria-label={action.ariaLabel || action.label}
          onClick={() => onAction?.(action)}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.28 + index * 0.06, duration: 0.22, ease: "easeOut" }}
          whileHover={{ scale: 1.012 }}
          whileTap={{ scale: 0.985 }}
          data-sound-click="submit"
        >
          <span>{action.label}</span>
        </motion.button>
      ))}
    </div>
  );
}

function BackToPagesButton({ onBack, label = "Back to pages" }) {
  return (
    <button className="secondary-action compact-action back-to-page-spread-button" type="button" onClick={onBack} data-sound-click="back">
      <ArrowLeft size={16} /> {label}
    </button>
  );
}

function BookPageActionExperience({ action, mode = "student", onBack, onAction }) {
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

function BookPagesView({
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
  const activeUnitLabel = activeUnit?.displayLabel || activeUnit?.label || activeUnit?.title || activeUnit?.unit || "Pages";
  const activeUnitHeading = activeUnit?.number && activeUnit?.title
    ? `Unit ${activeUnit.number}, ${activeUnit.title}`
    : activeUnitLabel;
  const showUnitTabs = pageUnits.length > 1;
  const sectionGridColumns = activeUnitSections.length <= 3
    ? Math.max(activeUnitSections.length, 1)
    : activeUnitSections.length <= 4
      ? 2
      : activeUnitSections.length <= 6
        ? 3
        : activeUnitSections.length <= 8
          ? 4
          : 5;

  useEffect(() => {
    const nextUnitId = selectedPageUnitId || selectedSection?.unitId || pageUnits[0]?.id || "";
    if (nextUnitId) setActiveUnitId(nextUnitId);
  }, [pageUnits, selectedPageUnitId, selectedSection?.unitId]);

  useEffect(() => {
    setActiveAction(null);
  }, [selectedPageId, selectedPageNumber]);

  useEffect(() => {
    if (!selectedSection) return undefined;

    const handleViewerKeys = (event) => {
      if (event.key === "Escape") {
        onClearSelectedPage?.();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToSection(selectedSectionIndex + 1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToSection(selectedSectionIndex - 1);
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

  const goToSection = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    setNavigationDirection(nextIndex > selectedSectionIndex ? 1 : -1);
    const nextSection = sections[nextIndex];
    onSelectPage?.(nextSection.unitId, nextSection.pageId, nextSection.pageNumber);
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
    const spreadClass = selectedSection.images.length > 1 ? "two-page-spread" : "single-page-spread";
    const unitSections = sections.filter((section) => section.unitId === selectedSection.unitId);
    const selectedUnitSectionIndex = unitSections.findIndex((section) => section.id === selectedSection.id);
    const isFirstSection = selectedUnitSectionIndex === 0;
    const isLastSection = selectedUnitSectionIndex === unitSections.length - 1;
    const goToUnitSection = (nextUnitIndex) => {
      const nextSection = unitSections[nextUnitIndex];
      if (!nextSection) return;
      const nextGlobalIndex = sections.findIndex((section) => section.id === nextSection.id);
      goToSection(nextGlobalIndex);
    };
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
          className="students-book-gateway book-page-spread-view book-page-selection-gateway"
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
            {selectedSection.continuesToVideo && (
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
          </div>
          <div className="book-page-viewer-shell">
            <motion.button className="book-page-turn-button previous" type="button" onClick={() => goToUnitSection(selectedUnitSectionIndex - 1)} disabled={isFirstSection} aria-label="Previous book section" data-sound-click="tab" whileHover={isFirstSection ? undefined : { x: -3 }} whileTap={isFirstSection ? undefined : { scale: 0.96 }}>
              <ArrowLeft size={18} />
              <span>Previous</span>
            </motion.button>
            <AnimatePresence mode="wait" custom={navigationDirection}>
              <motion.div
                key={selectedSection.id}
                className={`book-page-spread-stage ${spreadClass}`}
                layoutId={`book-page-${selectedSection.id}`}
                custom={navigationDirection}
                variants={pageTurnVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.44, ease: [0.2, 0.9, 0.2, 1] }}
              >
                <div className={`book-page-image-layer ${spreadClass}`}>
                  {selectedSection.images.length ? selectedSection.images.map((image, index) => (
                    <motion.img
                      key={`${selectedSection.id}-${index}`}
                      src={image}
                      alt={`${component.title} ${selectedSection.title} ${selectedSection.pages}${selectedSection.images.length > 1 ? ` page ${index + 1}` : ""}`}
                      initial={{ opacity: 0, y: 14, rotateY: navigationDirection > 0 ? -4 : 4 }}
                      animate={{ opacity: 1, y: 0, rotateY: 0 }}
                      transition={{ delay: index * 0.06, duration: 0.32, ease: "easeOut" }}
                    />
                  )) : (
                    <div className="book-page-missing">Page asset missing</div>
                  )}
                  <BookPageHotspots actions={selectedSection.actions} onAction={setActiveAction} />
                </div>
              </motion.div>
            </AnimatePresence>
            <motion.button className="book-page-turn-button next" type="button" onClick={() => goToUnitSection(selectedUnitSectionIndex + 1)} disabled={isLastSection} aria-label="Next book section" data-sound-click="tab" whileHover={isLastSection ? undefined : { x: 3 }} whileTap={isLastSection ? undefined : { scale: 0.96 }}>
              <span>Next</span>
              <ArrowLeft size={18} />
            </motion.button>
          </div>
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
                <span>{index + 1}</span>
                <small>{section.title}</small>
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

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
      <div className="book-section-grid" style={{ "--book-section-columns": sectionGridColumns }}>
        {activeUnitSections.map((section, index) => (
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

function BookGrid({ bookPackage, mode, onSelectBook }) {
  const role = mode === "teacher" ? "teacher" : "student";

  return (
    <Card>
      <div className="card-heading">
        <div>
          <span className="eyebrow"><BookOpenCheck size={15} /> {bookPackage.level}</span>
          <h2>{bookPackage.packageLabel}</h2>
          <p>{bookPackage.publisher} digital book package for {bookPackage.demoSchool}.</p>
        </div>
        <Tag tone="green">{bookPackage.level} active</Tag>
      </div>

      <div className="book-component-grid book-card-grid">
        {bookPackage.components.map((component) => {
          const activeCount = getActiveExercises(component).length;
          const unitCount = component.units.length;
          const canonicalBookId = getComponentRouteSlug(component);

          return (
            <article key={component.id} className="book-component-card">
              <button type="button" onClick={() => onSelectBook(component.id)} data-sound-click="tab">
                <BookCover component={component} bookPackage={bookPackage} size="large" />
                <span>
                  <strong>{component.title}</strong>
                  <small>{component.subtitle}</small>
                  <em>{unitCount} units / {activeCount} demo item{activeCount === 1 ? "" : "s"} active</em>
                </span>
              </button>
              <button
                className="book-card-copy-link"
                type="button"
                aria-label={`Copy direct link for ${component.title}`}
                title="Copy direct link"
                onClick={() => copyHashLink(buildBookPackageComponentHash(role, bookPackage, canonicalBookId))}
                data-sound-click="tab"
              >
                <Copy size={15} />
              </button>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

export function findBookComponentById(bookPackage = ultimateB2Package, selectedComponentId = null) {
  const activePackage = bookPackage?.components?.length ? bookPackage : ultimateB2Package;
  return activePackage.components.find((component) => isBookMatch(component, selectedComponentId)) || null;
}

export function BookSubpageNavigation({ component, bookPackage, mode = "student", onBack }) {
  if (!component) return null;

  const role = mode === "teacher" ? "teacher" : "student";
  const canonicalBookId = getComponentRouteSlug(component);

  return (
    <div className="book-detail-toolbar subpage-nav">
      <button className="subpage-back-button" type="button" onClick={onBack} data-sound-click="back" aria-label="Back to all books">
        <ArrowLeft size={17} />
      </button>
      <div className="subpage-breadcrumb" aria-label="Book navigation">
        <button type="button" onClick={onBack} data-sound-click="tab">{bookPackage?.packageLabel || "Book package"}</button>
        <span aria-current="page">{component.title}</span>
      </div>
      <div className="book-detail-toolbar-actions">
        <button
          className="secondary-action compact-action"
          type="button"
          onClick={() => copyHashLink(buildBookPackageComponentHash(role, bookPackage, canonicalBookId))}
          data-sound-click="tab"
        >
          <Copy size={15} /> Copy book link
        </button>
        <Tag tone="blue">{mode === "teacher" ? "Teacher preview" : "Student view"}</Tag>
      </div>
    </div>
  );
}

function BookDetailView({ component, bookPackage, mode, onStartExercise, onPreviewExercise, classOptions, completedActivities, selectedSubview, selectedPageUnitId, selectedPageId, selectedPageNumber, onSelectBookPage, onSelectSubview }) {
  const activeCount = getActiveExercises(component).length;
  const [viewMode, setViewMode] = useState((selectedSubview === "pages" || selectedSubview === "flipbook" || selectedPageId || selectedPageNumber) ? "pages" : "contents");
  const canonicalBookId = getComponentRouteSlug(component);
  const showPagesMode = Boolean(component.pageUnits?.length);
  const modeOptions = [
    { id: "contents", label: showPagesMode ? "Contents / Exercises" : "Contents" },
    ...(showPagesMode ? [{ id: "pages", label: "Book pages" }] : []),
  ];

  useEffect(() => {
    if (viewMode === "pages" && !showPagesMode) {
      setViewMode("contents");
    }
  }, [showPagesMode, viewMode]);

  useEffect(() => {
    if ((selectedPageId || selectedPageNumber) && showPagesMode) setViewMode("pages");
  }, [selectedPageId, selectedPageNumber, showPagesMode]);

  useEffect(() => {
    if (selectedSubview === "pages" || selectedSubview === "flipbook") {
      setViewMode("pages");
      return;
    }
    if (selectedSubview === "exercises") setViewMode("contents");
  }, [selectedSubview]);

  return (
    <Card className="book-detail-view">
      <div className="book-detail-hero">
        <BookCover component={component} bookPackage={bookPackage} size="large" />
        <div>
          <span className="eyebrow"><Layers3 size={15} /> {component.type}</span>
          <h2>{component.title}</h2>
          <p>{component.subtitle}</p>
          <div className="book-detail-stats">
            <span>{component.units.length} units visible</span>
            <span>{activeCount} demo item{activeCount === 1 ? "" : "s"} active</span>
            <span>Publisher content placeholders locked</span>
          </div>
          <div className="book-detail-mode-toggle" aria-label="Book view mode">
            {modeOptions.map((option) => (
              <button
                key={option.id}
                className={viewMode === option.id ? "selected" : ""}
                type="button"
                onClick={() => {
                  setViewMode(option.id);
                  onSelectSubview?.(getComponentRouteSlug(component), option.id === "pages" ? "pages" : "exercises");
                }}
                data-sound-click="tab"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === "pages" && showPagesMode ? (
        <BookPagesView
          component={component}
          bookPackage={bookPackage}
          mode={mode}
          selectedPageUnitId={selectedPageUnitId}
          selectedPageId={selectedPageId}
          selectedPageNumber={selectedPageNumber}
          onSelectPage={(pageUnitId, pageId, pageNumber) => onSelectBookPage?.(canonicalBookId, pageUnitId, pageId, pageNumber)}
          onClearSelectedPage={() => onSelectSubview?.(canonicalBookId, "pages")}
        />
      ) : mode === "teacher" ? (
        <TeacherBookUnitList component={component} onPreviewExercise={onPreviewExercise} classOptions={classOptions} />
      ) : (
        <div className="book-unit-list">
        {component.units.map((unit) => {
          const hasActiveExercises = unit.lessons.some((lesson) => lesson.exercises.some(isExerciseActive));

          if (!hasActiveExercises) {
            return <LockedUnitRow key={unit.id} unit={unit} />;
          }

          return (
            <section key={unit.id} className="book-active-unit">
              <div className="book-unit-heading">
                <div>
                  <h3>{unit.title}</h3>
                  <small>{unit.unit}</small>
                </div>
                <Tag tone="green">Demo active</Tag>
              </div>

              {unit.lessons.map((lesson) => (
                <div key={lesson.id} className="book-lesson-block">
                  <div className="book-lesson-heading">
                    <strong>{lesson.title}</strong>
                    <small>{unit.unit}</small>
                  </div>
                  <div className="book-exercise-list">
                    {lesson.exercises.map((exercise) => (
                      isExerciseActive(exercise) ? (
                        <ActiveExerciseRow
                          key={exercise.id}
                          exercise={exercise}
                          mode={mode}
                          onStartExercise={onStartExercise}
                          onPreviewExercise={onPreviewExercise}
                          classOptions={classOptions}
                          completedActivities={completedActivities}
                        />
                      ) : (
                        <LockedExerciseRow key={exercise.id} exercise={exercise} />
                      )
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
        </div>
      )}
    </Card>
  );
}

export function BookPackageBrowser({
  mode = "student",
  onStartExercise,
  onPreviewExercise,
  completedActivities = {},
  classOptions = ultimateB2Package.classes,
  bookPackage = ultimateB2Package,
  selectedComponentId: controlledSelectedComponentId,
  selectedSubview = null,
  selectedPageUnitId = null,
  selectedPageId = null,
  selectedPageNumber = null,
  initialSelectedComponentId = null,
  onSelectComponent,
  onSelectBookPage,
  onSelectSubview,
  onBackToBooks,
}) {
  const activePackage = bookPackage?.components?.length ? bookPackage : ultimateB2Package;
  const [uncontrolledSelectedComponentId, setUncontrolledSelectedComponentId] = useState(initialSelectedComponentId);
  const selectedComponentId = controlledSelectedComponentId !== undefined ? controlledSelectedComponentId : uncontrolledSelectedComponentId;
  const selectedComponent = useMemo(() => findBookComponentById(activePackage, selectedComponentId), [activePackage, selectedComponentId]);

  const selectComponent = (componentId) => {
    if (controlledSelectedComponentId === undefined) {
      setUncontrolledSelectedComponentId(componentId);
    }
    onSelectComponent?.(componentId);
  };

  const backToBooks = () => {
    if (controlledSelectedComponentId === undefined) {
      setUncontrolledSelectedComponentId(null);
    }
    onBackToBooks?.();
  };

  useEffect(() => {
    if (controlledSelectedComponentId !== undefined) return;
    setUncontrolledSelectedComponentId(initialSelectedComponentId);
  }, [controlledSelectedComponentId, initialSelectedComponentId]);

  useEffect(() => {
    if (selectedComponentId && !activePackage.components.some((component) => isBookMatch(component, selectedComponentId))) {
      selectComponent(null);
    }
  }, [activePackage, selectedComponentId]);

  return (
    <section className={`book-package-browser ${mode === "teacher" ? "teacher-mode" : "student-mode"}`}>
      {selectedComponent ? (
        <BookDetailView
          component={selectedComponent}
          bookPackage={activePackage}
          mode={mode}
          onStartExercise={onStartExercise}
          onPreviewExercise={onPreviewExercise}
          classOptions={classOptions}
          completedActivities={completedActivities}
          selectedSubview={selectedSubview}
          selectedPageUnitId={selectedPageUnitId}
          selectedPageId={selectedPageId}
          selectedPageNumber={selectedPageNumber}
          onSelectBookPage={onSelectBookPage}
          onSelectSubview={onSelectSubview}
        />
      ) : (
        <BookGrid
          bookPackage={activePackage}
          mode={mode}
          onSelectBook={(componentId) => {
            const component = activePackage.components.find((item) => item.id === componentId);
            selectComponent(component ? getComponentRouteSlug(component) : componentId);
          }}
        />
      )}
    </section>
  );
}
