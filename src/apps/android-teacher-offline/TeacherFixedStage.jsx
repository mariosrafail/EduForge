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

export default function TeacherFixedStage({ viewport, launcherBackdrop = "", children }) {
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
        data-launcher-backdrop={launcherBackdrop ? "" : undefined}
        style={{
          left: `${viewport.offsetLeft}px`,
          top: `${viewport.offsetTop}px`,
          width: `${viewport.width}px`,
          height: `${viewport.height}px`,
          backgroundImage: launcherBackdrop ? `url("${launcherBackdrop}")` : undefined,
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
