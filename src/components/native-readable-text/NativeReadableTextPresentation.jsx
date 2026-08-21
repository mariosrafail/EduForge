import { useEffect, useLayoutEffect, useRef, useState } from "react";

import "./nativeReadableText.css";

export function nextNativeReadableTextView(current, commandType, available) {
  return commandType === "toggle-text" && available ? (current === "text" ? "questions" : "text") : current;
}

export function NativeReadableTextPresentation({ document, assetUrl, presentation = null, children }) {
  const available = Boolean(document.readableText);
  const [view, setView] = useState("questions");
  const viewportRef = useRef(null);
  const [overflowing, setOverflowing] = useState(false);
  const lastCommandToken = useRef(presentation?.command?.token);
  const onStateChange = presentation?.onStateChange;

  useEffect(() => {
    setView("questions");
    setOverflowing(false);
    lastCommandToken.current = presentation?.command?.token;
  }, [document.activityId]);

  useEffect(() => {
    const command = presentation?.command;
    if (!command || command.token === lastCommandToken.current) return;
    lastCommandToken.current = command.token;
    setView((current) => nextNativeReadableTextView(current, command.type, available));
  }, [available, presentation?.command]);

  useEffect(() => {
    onStateChange?.({ view: available ? view : "questions", readableTextAvailable: available });
  }, [available, onStateChange, view]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || view !== "text") return undefined;
    const update = () => setOverflowing(viewport.scrollHeight > viewport.clientHeight + 2);
    update();
    globalThis.addEventListener("resize", update);
    if (typeof ResizeObserver === "undefined") return () => globalThis.removeEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => { observer.disconnect(); globalThis.removeEventListener("resize", update); };
  }, [document.activityId, view]);

  const reference = available ? document.assets.find((asset) => asset.slot === document.readableText.assetSlot) : null;
  const effectiveView = available ? view : "questions";
  return <div className="native-readable-text-presentation" data-readable-text-available={available || undefined} data-presentation-view={effectiveView}>
    <div className="native-readable-text-activity-view" hidden={effectiveView === "text"}>{children}</div>
    {effectiveView === "text" && reference ? <section className="native-readable-text-view" aria-label="Readable text">
      <div ref={viewportRef} className="native-readable-text-scroll" tabIndex={0} data-overflowing={overflowing || undefined}>
        <img src={assetUrl(reference.assetId)} alt={document.readableText.altText} width={document.readableText.sourceWidth} height={document.readableText.sourceHeight} onLoad={() => {
          const viewport = viewportRef.current;
          if (viewport) setOverflowing(viewport.scrollHeight > viewport.clientHeight + 2);
        }} />
      </div>
      {overflowing ? <span className="native-readable-text-scroll-affordance" aria-hidden="true">SCROLL ↓</span> : null}
    </section> : null}
  </div>;
}
