import { createContext, useContext, useMemo } from "react";

import { TEACHER_STAGE_HEIGHT, TEACHER_STAGE_WIDTH } from "./teacherStageGeometry.js";

const TeacherStageContext = createContext(Object.freeze({
  scale: 1,
  width: TEACHER_STAGE_WIDTH,
  height: TEACHER_STAGE_HEIGHT,
}));

export function useTeacherStage() {
  return useContext(TeacherStageContext);
}

export default function TeacherFixedStage({ viewport, viewportBackdrop = null, children }) {
  const scale = viewport.displayScale;
  const contextValue = useMemo(() => ({
    scale,
    width: TEACHER_STAGE_WIDTH,
    height: TEACHER_STAGE_HEIGHT,
  }), [scale]);

  return (
    <TeacherStageContext.Provider value={contextValue}>
      <div
        className="teacher-fixed-stage-host"
        data-teacher-stage-host=""
        data-viewport-backdrop={viewportBackdrop?.name}
        style={{
          left: `${viewport.offsetLeft}px`,
          top: `${viewport.offsetTop}px`,
          width: `${viewport.width}px`,
          height: `${viewport.height}px`,
          backgroundColor: viewportBackdrop?.color,
          backgroundImage: viewportBackdrop?.image,
          "--teacher-stage-scale": scale,
        }}
      >
        <div
          className="teacher-fixed-stage"
          data-teacher-stage=""
          data-teacher-stage-scale={scale.toFixed(6)}
        >
          {children}
        </div>
      </div>
    </TeacherStageContext.Provider>
  );
}
