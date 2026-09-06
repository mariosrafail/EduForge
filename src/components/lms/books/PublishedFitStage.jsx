import { useLayoutEffect, useRef, useState } from "react";

export function usePublishedStageSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    const measure = () => {
      const style = getComputedStyle(node);
      const width = Math.max(0, node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      const height = Math.max(0, node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
      setSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    window.addEventListener("resize", schedule);
    document.addEventListener("fullscreenchange", schedule);
    measure();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedule); document.removeEventListener("fullscreenchange", schedule); };
  }, [ref]);
  return size;
}

export function PublishedPageStage({ image, zoom, children }) {
  const stage = useRef(null);
  const size = usePublishedStageSize(stage);
  const scale = Math.min(size.width / image.width, size.height / image.height);
  useLayoutEffect(() => { if (zoom === 1) stage.current?.scrollTo(0, 0); }, [zoom, image, size]);
  return <div ref={stage} className="published-page-scroll" data-fit={zoom === 1}>
    <div className="published-page" style={{ width: image.width * scale * zoom, height: image.height * scale * zoom, aspectRatio: `${image.width} / ${image.height}` }}>{children}</div>
  </div>;
}

// Fit fixed artwork as one measured rectangle. Long text remains in its normal
// scrolling flow; this wrapper does not modify native reading-focus scrolling.
export function PublishedPreviewStage({ children, fixed }) {
  const stage = useRef(null), content = useRef(null);
  const size = usePublishedStageSize(stage);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (!fixed || !content.current) return;
    const measure = () => setHeight((current) => current === content.current.offsetHeight ? current : content.current.offsetHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(content.current); measure();
    return () => observer.disconnect();
  }, [fixed]);
  const scale = fixed && height ? Math.min(1, size.height / height) : 1;
  return <div ref={stage} className="published-preview-stage" data-fixed={fixed}>
    <div className="published-preview-fit" style={fixed ? { width: `${scale * 100}%`, height: height * scale } : undefined}>
      <div ref={content} className="published-preview-content" style={fixed ? { width: size.width || "100%", transform: `scale(${scale})`, transformOrigin: "top left" } : undefined}>{children}</div>
    </div>
  </div>;
}
