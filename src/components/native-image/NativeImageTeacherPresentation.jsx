import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NativeImagePresentation } from "./NativeImageSurface.jsx";
import { NativeScrollControlsHost } from "../native-readable-text/NativeScrollControlsHost.jsx";
import { NativeVerticalScrollViewport } from "../native-readable-text/NativeVerticalScrollViewport.jsx";
import "./nativeImageSampleAnswer.css";

function SampleAnswer({ surfaceRef, image, imageUrl }) {
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const id = useId();
  useEffect(() => {
    let frame;
    const measure = () => {
      const box = surfaceRef.current?.getBoundingClientRect();
      if (box?.width && box?.height) {
        const width = Math.min(150, innerWidth - 16);
        const outside = box.right + 8 + width <= innerWidth - 8;
        const next = { left: outside ? box.right + 8 : Math.max(8, box.right - width), top: Math.max(8, Math.min(innerHeight - 48, outside ? box.bottom - 40 : box.bottom + 8)), visible: box.bottom > 0 && box.top < innerHeight, host: document.fullscreenElement || document.body };
        setPosition((prior) => prior && Object.keys(next).every((key) => prior[key] === next[key]) ? prior : next);
      }
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [surfaceRef]);
  useEffect(() => {
    if (!open) return undefined;
    const escape = (event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [open]);
  if (!position?.visible) return null;
  return createPortal(<>
    <button ref={buttonRef} type="button" className="native-image-sample-answer-toggle" style={{ left: position.left, top: position.top }} aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>Sample answer</button>
    {open ? <NativeScrollControlsHost inherit={false} className="native-image-sample-answer-popup" role="region" aria-label="Sample answer" style={{ left: Math.max(8, Math.min(position.left - 460, innerWidth - Math.min(620, innerWidth - 48) - 28)), top: Math.max(8, Math.min(position.top - Math.min(500, innerHeight - 120), innerHeight - 128)) }}>
      <button type="button" aria-label="Close Sample answer" onClick={() => { setOpen(false); buttonRef.current?.focus(); }}>Close</button>
      <NativeVerticalScrollViewport id={id} className="native-image-sample-answer-viewport" ariaLabel="Scroll Sample answer" resetKey={image.reference.assetId}>
        <img src={imageUrl(image.reference.assetId)} alt={image.altText} width={image.sourceWidth} height={image.sourceHeight} />
      </NativeVerticalScrollViewport>
    </NativeScrollControlsHost> : null}
  </>, position.host);
}

export function NativeImageTeacherPresentation({ teacherDocument, teacherAssetUrl, identity = "", ...props }) {
  const surfaceRef = useRef(null);
  const sample = teacherDocument?.parts[0]?.solution?.sampleAnswer;
  return <>
    <NativeImagePresentation {...props} surfaceRef={surfaceRef} />
    {sample?.enabled && sample.image && teacherAssetUrl ? <SampleAnswer key={`${props.document.activityId}:${identity}:${sample.image.reference.assetId}`} surfaceRef={surfaceRef} image={sample.image} imageUrl={teacherAssetUrl} /> : null}
  </>;
}
