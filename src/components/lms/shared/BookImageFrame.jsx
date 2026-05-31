import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

export function ImageZoomModal({ title, subtitle, imageSrc, alt, onClose, initialOrigin = { x: 50, y: 50 } }) {
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const [zoom, setZoom] = useState(initialOrigin ? 1.7 : 1);
  const [origin, setOrigin] = useState(initialOrigin || { x: 50, y: 50 });

  useEffect(() => {
    closeButtonRef.current?.focus();

    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

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
            <button type="button" onClick={() => setZoom((current) => Math.max(1, current - 0.25))} aria-label="Zoom out">
              <Minus size={17} />
            </button>
            <button type="button" onClick={() => setZoom((current) => Math.min(3, current + 0.25))} aria-label="Zoom in">
              <Plus size={17} />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setOrigin({ x: 50, y: 50 });
              }}
              aria-label="Reset zoom"
            >
              <RotateCcw size={17} />
            </button>
            <button ref={closeButtonRef} className="image-zoom-close-button" type="button" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="image-zoom-modal-body">
          <img
            src={imageSrc}
            alt={alt}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: `${origin.x}% ${origin.y}%`,
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
