import { useEffect, useMemo, useState } from "react";
import { ultimateB2Package } from "../../../data/ultimateB2DemoData.js";
import { BookPackageComponentGrid } from "./BookPackageComponentGrid.jsx";
import { BookComponentDetail } from "./BookComponentDetail.jsx";
import { getComponentRouteSlug } from "../../../utils/hashRoutes.js";
import { findBookComponentById, isBookMatch } from "./bookBrowserUtils.js";

export function BookPackageBrowser({
  mode = "student",
  onStartExercise,
  onPreviewExercise,
  onPresentExercise,
  completedActivities = {},
  classOptions = ultimateB2Package.classes,
  classes = [],
  currentUser = null,
  bookPackage = ultimateB2Package,
  selectedComponentId: controlledSelectedComponentId,
  selectedSubview = null,
  selectedPageUnitId = null,
  selectedPageId = null,
  selectedPageNumber = null,
  initialSelectedComponentId = null,
  onSelectComponent,
  onSelectBookPage,
  onSelectSubview,
  onBackToBooks,
  highlightedActivityKey = null,
}) {
  const activePackage = bookPackage || ultimateB2Package;
  const [uncontrolledSelectedComponentId, setUncontrolledSelectedComponentId] = useState(initialSelectedComponentId);
  const selectedComponentId = controlledSelectedComponentId !== undefined ? controlledSelectedComponentId : uncontrolledSelectedComponentId;
  const selectedComponent = useMemo(() => findBookComponentById(activePackage, selectedComponentId), [activePackage, selectedComponentId]);

  const selectComponent = (componentId) => {
    if (controlledSelectedComponentId === undefined) {
      setUncontrolledSelectedComponentId(componentId);
    }
    onSelectComponent?.(componentId);
  };

  const backToBooks = () => {
    if (controlledSelectedComponentId === undefined) {
      setUncontrolledSelectedComponentId(null);
    }
    onBackToBooks?.();
  };

  useEffect(() => {
    if (controlledSelectedComponentId !== undefined) return;
    setUncontrolledSelectedComponentId(initialSelectedComponentId);
  }, [controlledSelectedComponentId, initialSelectedComponentId]);

  useEffect(() => {
    if (selectedComponentId && !activePackage.components.some((component) => isBookMatch(component, selectedComponentId))) {
      selectComponent(null);
    }
  }, [activePackage, selectedComponentId]);

  return (
    <section className={`book-package-browser ${mode === "teacher" ? "teacher-mode" : "student-mode"}`}>
      {selectedComponent ? (
        <BookComponentDetail
          component={selectedComponent}
          bookPackage={activePackage}
          mode={mode}
          onStartExercise={onStartExercise}
          onPreviewExercise={onPreviewExercise}
          onPresentExercise={onPresentExercise}
          classOptions={classOptions}
          classes={classes}
          currentUser={currentUser}
          completedActivities={completedActivities}
          selectedSubview={selectedSubview}
          selectedPageUnitId={selectedPageUnitId}
          selectedPageId={selectedPageId}
          selectedPageNumber={selectedPageNumber}
          onSelectBookPage={onSelectBookPage}
          onSelectSubview={onSelectSubview}
          highlightedActivityKey={highlightedActivityKey}
        />
      ) : (
        <BookPackageComponentGrid
          bookPackage={activePackage}
          mode={mode}
          onSelectBook={(componentId) => {
            const component = activePackage.components.find((item) => item.id === componentId);
            selectComponent(component ? getComponentRouteSlug(component) : componentId);
          }}
        />
      )}
    </section>
  );
}

export { BookSubpageNavigation } from "./BookSubpageNavigation.jsx";
export { findBookComponentById, buildBookPackageComponentHash } from "./bookBrowserUtils.js";
export { coverAssets } from "./bookCoverAssets.js";
