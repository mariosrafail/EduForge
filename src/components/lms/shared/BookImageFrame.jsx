import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function ImageZoomModal({ title, subtitle, imageSrc, alt, onClose, initialOrigin = { x: 50, y: 50 } }) {
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const viewportRef = useRef(null);
  const dragStartRef = useRef(null);
  const [zoom, setZoom] = useState(initialOrigin ? 1.7 : 1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const setZoomAtPoint = (nextZoom, point = null) => {
    const viewport = viewportRef.current;
    const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (!viewport || !point) {
      setZoom(clampedZoom);
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const mouseX = point.clientX - rect.left + viewport.scrollLeft;
    const mouseY = point.clientY - rect.top + viewport.scrollTop;
    const ratio = clampedZoom / zoom;
    setZoom(clampedZoom);
    if (clampedZoom <= 1) setPan({ x: 0, y: 0 });
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = mouseX * ratio - (point.clientX - rect.left);
      viewport.scrollTop = mouseY * ratio - (point.clientY - rect.top);
    });
  };

  const zoomBy = (delta) => {
    setZoomAtPoint(zoom + delta);
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  useEffect(() => {
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomBy(0.25);
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        zoomBy(-0.25);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        resetZoom();
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, zoom]);

  const toggleDoubleClickZoom = (event) => {
    if (zoom <= 1.05) {
      setZoomAtPoint(2.25, event);
      return;
    }
    resetZoom();
  };

  const handlePointerDown = (event) => {
    if (zoom <= 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStartRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: pan.x,
      startY: pan.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event) => {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    setPan({
      x: dragStart.startX + event.clientX - dragStart.pointerX,
      y: dragStart.startY + event.clientY - dragStart.pointerY,
    });
  };

  const stopDragging = (event = {}) => {
    if (!dragStartRef.current || event.pointerId === undefined || dragStartRef.current.pointerId === event.pointerId) {
      dragStartRef.current = null;
      setIsDragging(false);
    }
  };

  const modal = (
    <div
      className="image-zoom-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="image-zoom-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <div className="image-zoom-modal-header">
          <div>
            <span className="eyebrow">Open larger</span>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="image-zoom-modal-actions">
            <button type="button" onClick={() => zoomBy(-0.25)} aria-label="Zoom out">
              <Minus size={17} />
            </button>
            <button type="button" onClick={() => zoomBy(0.25)} aria-label="Zoom in">
              <Plus size={17} />
            </button>
            <button type="button" onClick={resetZoom} aria-label="Reset zoom">
              <RotateCcw size={17} />
            </button>
            <button ref={closeButtonRef} className="image-zoom-close-button" type="button" onClick={onClose} aria-label="Close image viewer">
              <X size={18} />
            </button>
          </div>
        </div>
        <div
          ref={viewportRef}
          className={`image-zoom-modal-body ${zoom > 1 ? "zoomed" : ""} ${isDragging ? "dragging" : ""}`}
          onDoubleClick={toggleDoubleClickZoom}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onLostPointerCapture={stopDragging}
        >
          <span className="image-zoom-hint">{zoom > 1 ? "Double-click to reset / Drag to move" : "Double-click to zoom"}</span>
          <img
            src={imageSrc}
            alt={alt}
            draggable={false}
            style={{
              width: `${zoom * 100}%`,
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
            }}
          />
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}

export function BookImageFrame({
  title,
  subtitle,
  imageSrc,
  alt,
  maxHeight = "460px",
  zoomTitle = title,
  zoomSubtitle = subtitle,
  className = "",
}) {
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const frameStyle = { "--book-image-max-height": maxHeight };
  const openZoomFromEvent = (event) => {
    const image = event.currentTarget.querySelector("img");
    if (image) {
      const rect = image.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      setZoomOrigin({
        x: Math.min(Math.max(x, 0), 100),
        y: Math.min(Math.max(y, 0), 100),
      });
    } else {
      setZoomOrigin({ x: 50, y: 50 });
    }
    setIsZoomOpen(true);
  };

  return (
    <section className={`book-image-section ${className}`.trim()} style={frameStyle}>
      <div className="book-image-section-header">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="book-image-actions">
          <button className="book-image-open-button" type="button" onClick={() => { setZoomOrigin({ x: 50, y: 50 }); setIsZoomOpen(true); }} aria-label={`Open ${zoomTitle} larger`}>
            <Maximize2 size={15} />
            <span>Open larger</span>
          </button>
        </div>
      </div>
      <div className="book-image-scroll-frame">
        <button className="book-image-click-target" type="button" onClick={openZoomFromEvent} aria-label={`Open ${zoomTitle} larger`}>
          <img src={imageSrc} alt={alt} />
        </button>
      </div>
      {isZoomOpen && (
        <ImageZoomModal
          title={zoomTitle}
          subtitle={zoomSubtitle}
          imageSrc={imageSrc}
          alt={alt}
          initialOrigin={zoomOrigin}
          onClose={() => setIsZoomOpen(false)}
        />
      )}
    </section>
  );
}
