import { useState } from "react";

import { UltimateB2HotspotBuilder } from "./UltimateB2HotspotBuilder.jsx";
import { UltimateB2ActivityBuilder } from "./UltimateB2ActivityBuilder.jsx";
import { UltimateB2TeacherAppBuilder } from "./UltimateB2TeacherAppBuilder.jsx";

export function UltimateB2BuilderApp() {
  const [tab, setTab] = useState(() => window.location.hash === "#teacher-app" ? "teacher-app" : window.location.hash === "#activity-builder" ? "activities" : "hotspots");
  const [assetRevision, setAssetRevision] = useState("");
  const selectTab = (nextTab) => {
    setTab(nextTab);
    window.history.replaceState(null, "", nextTab === "teacher-app" ? "#teacher-app" : nextTab === "activities" ? "#activity-builder" : "#hotspot-builder");
  };
  return (
    <div className="ultimate-b2-builder-app">
      <nav className="ultimate-b2-builder-tabs" aria-label="Ultimate B2 authoring tools">
        <button type="button" aria-selected={tab === "hotspots"} onClick={() => selectTab("hotspots")}>Hotspot Builder</button>
        <button type="button" aria-selected={tab === "activities"} onClick={() => selectTab("activities")}>Activity Builder</button>
        <button type="button" aria-selected={tab === "teacher-app"} onClick={() => selectTab("teacher-app")}>UI Controller</button>
      </nav>
      <div hidden={tab !== "hotspots"}><UltimateB2HotspotBuilder assetRevision={assetRevision} /></div>
      <div hidden={tab !== "activities"}><UltimateB2ActivityBuilder /></div>
      <div hidden={tab !== "teacher-app"}><UltimateB2TeacherAppBuilder onSaved={setAssetRevision} /></div>
    </div>
  );
}
