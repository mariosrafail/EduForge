import { Images, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const focusable = "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

export default function TeacherProjectPageImagePicker({ open, selectionMode, pageAssets, urls, usage, onSelect, onClose }) {
  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const restoreFocus = useRef(null);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? pageAssets.filter((asset) => asset.originalFilename.toLocaleLowerCase().includes(needle)) : pageAssets;
  }, [pageAssets, query]);
  useEffect(() => {
    if (!open) return undefined;
    restoreFocus.current = document.activeElement;
    setQuery("");
    requestAnimationFrame(() => searchRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = [...(dialogRef.current?.querySelectorAll(focusable) || [])];
      if (!items.length) return;
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); requestAnimationFrame(() => restoreFocus.current?.focus?.()); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="teacher-modal-backdrop teacher-page-library-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="teacher-page-library-dialog" role="dialog" aria-modal="true" aria-labelledby="teacher-page-library-title">
        <header>
          <div><span className="studio-eyebrow">Project assets</span><h2 id="teacher-page-library-title">Page Image Library</h2><p>{selectionMode ? "Choose an image for the current page field." : "Browse the reusable page rasters in this project."}</p></div>
          <button type="button" className="studio-icon-button" aria-label="Close Page Image Library" onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        <label className="teacher-page-library-search"><Search aria-hidden="true" /><span className="sr-only">Filter page images</span><input ref={searchRef} type="search" value={query} placeholder="Filter by filename" onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="teacher-page-library-grid" role={selectionMode ? "listbox" : undefined} aria-label={selectionMode ? "Available page images" : undefined}>
          {filtered.map((asset) => {
            const card = <><span className="teacher-page-library-thumb">{urls[asset.assetId] ? <img src={urls[asset.assetId]} alt="" loading="lazy" /> : <Images aria-hidden="true" />}</span><span className="teacher-page-library-copy"><strong>{asset.originalFilename}</strong><small>{asset.width} × {asset.height}</small><small>{usage.get(asset.assetId)?.length || 0} uses · {Math.ceil(asset.sizeBytes / 1024)} KB</small></span></>;
            return selectionMode
              ? <button type="button" role="option" aria-selected="false" className="teacher-page-library-card" key={asset.assetId} onClick={() => { onSelect(asset.assetId); onClose(); }}>{card}<span className="teacher-page-library-select">Choose</span></button>
              : <article className="teacher-page-library-card" key={asset.assetId}>{card}</article>;
          })}
          {!filtered.length && <div className="teacher-page-library-empty"><Images aria-hidden="true" /><strong>{pageAssets.length ? "No images match this filter" : "No page images imported yet"}</strong></div>}
        </div>
        <footer><span>{filtered.length} of {pageAssets.length} images</span><button type="button" className="studio-button secondary" onClick={onClose}>Close</button></footer>
      </section>
    </div>
  );
}
