import { Expand, LockKeyhole, Minimize2, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tag } from "../../Shared.jsx";
import { FinalSubmitDialog } from "./FinalSubmitDialog.jsx";
import { deriveStudentRuntimeCapabilities, STUDENT_RUNTIME_MODES } from "./studentRuntimeMode.js";

export function StudentInteractiveRuntimeShell({
  mode = STUDENT_RUNTIME_MODES.PRACTICE,
  title = "Interactive activity",
  context = [],
  statusLabel = "Practice",
  statusTone = "blue",
  submittable = false,
  targetLoaded = true,
  supported = true,
  closed = false,
  expired = false,
  submitted = false,
  lockedMessage = "Submitted and locked · This saved attempt is read-only.",
  pending = false,
  success = "",
  error = "",
  showSubmitAction = true,
  onConfirmSubmit,
  children,
}) {
  const stageRef = useRef(null);
  const submitButtonRef = useRef(null);
  const returnFocusRef = useRef(null);
  const confirmationAttempt = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState("");
  const [confirmation, setConfirmation] = useState({ open: false, payload: null });
  const capabilities = useMemo(() => deriveStudentRuntimeCapabilities({
    mode, submittable, targetLoaded, supported, closed, expired, submitted,
  }), [closed, expired, mode, submitted, submittable, supported, targetLoaded]);

  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    if (!capabilities.canFinalSubmit) setConfirmation({ open: false, payload: null });
  }, [capabilities.canFinalSubmit]);

  const toggleFullscreen = async () => {
    setFullscreenMessage("");
    try {
      if (document.fullscreenElement === stageRef.current) await document.exitFullscreen();
      else if (document.fullscreenEnabled && stageRef.current?.requestFullscreen) await stageRef.current.requestFullscreen();
      else setFullscreenMessage("Fullscreen is not available in this browser.");
    } catch {
      setFullscreenMessage("Fullscreen could not be opened. You can continue in the activity window.");
    }
  };

  const requestFinalSubmit = useCallback((payload = null) => {
    if (!capabilities.canFinalSubmit || pending) return Promise.resolve(false);
    returnFocusRef.current = document.activeElement;
    return new Promise((resolve) => setConfirmation({ open: true, payload, resolve }));
  }, [capabilities.canFinalSubmit, pending]);

  const confirmFinalSubmit = async () => {
    if (!capabilities.canFinalSubmit || pending || confirmationAttempt.current || typeof onConfirmSubmit !== "function") return;
    confirmationAttempt.current = (async () => {
      try {
        const result = await onConfirmSubmit(confirmation.payload);
        confirmation.resolve?.(result ?? true);
        setConfirmation({ open: false, payload: null });
      } catch {
        confirmation.resolve?.(false);
      } finally {
        confirmationAttempt.current = null;
      }
    })();
    await confirmationAttempt.current;
  };

  const cancelFinalSubmit = () => {
    if (pending || confirmationAttempt.current) return;
    confirmation.resolve?.(false);
    setConfirmation({ open: false, payload: null });
  };

  return (
    <section ref={stageRef} className={`student-interactive-runtime mode-${mode} ${isFullscreen ? "is-fullscreen" : ""}`} data-runtime-mode={mode}>
      <header className="student-runtime-header">
        <div>
          {context.length ? <nav aria-label="Activity context">{context.filter(Boolean).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</nav> : null}
          <h2>{title}</h2>
        </div>
        <div className="student-runtime-header-actions">
          <Tag tone={statusTone}>{capabilities.isLocked ? <LockKeyhole size={14} /> : null}{statusLabel}</Tag>
          {capabilities.canEnterFullscreen ? <button className="secondary-action compact-action" type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit activity fullscreen" : "Open activity fullscreen"}>{isFullscreen ? <Minimize2 size={16} /> : <Expand size={16} />}<span>{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</span></button> : null}
        </div>
      </header>

      {mode === STUDENT_RUNTIME_MODES.PRACTICE ? <div className="student-runtime-notice">Practice mode · Your work here is not submitted or graded.</div> : null}
      {capabilities.isLocked ? <div className="student-runtime-notice locked"><LockKeyhole size={16} /> {lockedMessage}</div> : null}
      <div className="student-runtime-stage">
        {typeof children === "function" ? children({ capabilities, requestFinalSubmit }) : children}
      </div>
      {fullscreenMessage ? <div className="inline-status warning" role="status">{fullscreenMessage}</div> : null}
      {success ? <div className="inline-status success" role="status">{success}</div> : null}
      {error ? <div className="inline-status error" role="alert">{error}</div> : null}

      {showSubmitAction && capabilities.canFinalSubmit ? (
        <footer className="student-runtime-submit-bar">
          <span>Ready when you are. Submission is final.</span>
          <button ref={submitButtonRef} className="primary-action" type="button" disabled={pending} onClick={() => requestFinalSubmit(null)}><Send size={17} />{pending ? "Submitting…" : "Submit assignment"}</button>
        </footer>
      ) : null}

      <FinalSubmitDialog
        open={confirmation.open}
        pending={pending}
        onCancel={cancelFinalSubmit}
        onConfirm={confirmFinalSubmit}
        returnFocusRef={returnFocusRef.current ? returnFocusRef : submitButtonRef}
      />
    </section>
  );
}
