import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";

export function ImageZoomModal({ title, subtitle, imageSrc, alt, onClose }) {
  const titleId = useId();
  const closeButtonRef = useRef(null);

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
          <button ref={closeButtonRef} className="image-zoom-close-button" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="image-zoom-modal-body">
          <img src={imageSrc} alt={alt} />
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
  const frameStyle = { "--book-image-max-height": maxHeight };

  return (
    <section className={`book-image-section ${className}`.trim()} style={frameStyle}>
      <div className="book-image-section-header">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="book-image-actions">
          <button className="book-image-open-button" type="button" onClick={() => setIsZoomOpen(true)} aria-label={`Open ${zoomTitle} larger`}>
            <Maximize2 size={15} />
            <span>Open larger</span>
          </button>
        </div>
      </div>
      <div className="book-image-scroll-frame">
        <button className="book-image-click-target" type="button" onClick={() => setIsZoomOpen(true)} aria-label={`Open ${zoomTitle} larger`}>
          <img src={imageSrc} alt={alt} />
        </button>
      </div>
      {isZoomOpen && (
        <ImageZoomModal
          title={zoomTitle}
          subtitle={zoomSubtitle}
          imageSrc={imageSrc}
          alt={alt}
          onClose={() => setIsZoomOpen(false)}
        />
      )}
    </section>
  );
}
