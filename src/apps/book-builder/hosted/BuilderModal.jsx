import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

export function BuilderModal({ open, title, description, busy = false, onClose, returnFocusRef, children, className = "" }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const restoreRef = useRef(null);
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);
  busyRef.current = busy;
  closeRef.current = onClose;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    const timer = setTimeout(() => (dialogRef.current?.querySelector("[autofocus]") || dialogRef.current?.querySelector("button, input, select, textarea, a[href]"))?.focus(), 0);
    const keydown = (event) => {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { clearTimeout(timer); document.removeEventListener("keydown", keydown); (returnFocusRef?.current || restoreRef.current)?.focus?.(); };
  }, [open]);
  return <AnimatePresence>{open ? <motion.div className="builder-modal-backdrop" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduced ? undefined : { opacity: 0 }} transition={{ duration: reduced ? 0 : .18 }} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <motion.section ref={dialogRef} className={`builder-modal ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: 8 }} transition={{ duration: reduced ? 0 : .2 }}>
      <header><div><h2 id={titleId}>{title}</h2>{description ? <p id={descriptionId}>{description}</p> : null}</div><button type="button" className="builder-icon-button" aria-label="Close dialog" title="Close" disabled={busy} onClick={onClose}><X aria-hidden="true" /></button></header>
      {children}
    </motion.section>
  </motion.div> : null}</AnimatePresence>;
}
