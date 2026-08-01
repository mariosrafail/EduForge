import { useClassroomTools } from "./ClassroomToolsContext.jsx";

export default function ClassroomStageTransform({ surfaceKey, children }) {
  const { getRegionZoom } = useClassroomTools();
  const region = getRegionZoom(surfaceKey);
  const scale = region ? Math.min(6, Math.max(1, Math.min(1 / region.width, 1 / region.height))) : 1;
  const centerX = region ? region.x + region.width / 2 : 0.5;
  const centerY = region ? region.y + region.height / 2 : 0.5;
  const style = region ? {
    transform: `translate3d(${(0.5 - scale * centerX) * 100}%, ${(0.5 - scale * centerY) * 100}%, 0) scale(${scale})`,
  } : undefined;

  return (
    <div className={`classroom-stage-transform ${region ? "region-zoom-active" : ""}`} style={style} data-region-zoom-scale={region ? scale.toFixed(3) : undefined}>
      {children}
    </div>
  );
}
