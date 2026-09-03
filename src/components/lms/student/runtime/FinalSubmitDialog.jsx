import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef } from "react";

const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function FinalSubmitDialog({ open, pending = false, onCancel, onConfirm, returnFocusRef }) {
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll(focusableSelector) || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef?.current?.focus?.();
    };
  }, [onCancel, open, pending, returnFocusRef]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="student-final-submit-backdrop"
          role="presentation"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0 }}
          onMouseDown={() => !pending && onCancel()}
        >
          <motion.section
            ref={dialogRef}
            className="student-final-submit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-final-submit-title"
            aria-describedby="student-final-submit-description"
            initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="student-final-submit-icon"><AlertTriangle aria-hidden="true" /></div>
            <div>
              <h2 id="student-final-submit-title">Submit this assignment?</h2>
              <p id="student-final-submit-description">This is your final submission. Your saved answers will be locked and you cannot submit a second attempt.</p>
            </div>
            <footer>
              <button ref={cancelRef} className="secondary-action" type="button" disabled={pending} onClick={onCancel}>Cancel</button>
              <button className="primary-action" type="button" disabled={pending} onClick={onConfirm}>{pending ? "Submitting…" : "Submit final answers"}</button>
            </footer>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
