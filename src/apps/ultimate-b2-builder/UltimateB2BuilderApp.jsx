import { useState } from "react";

import { UltimateB2HotspotBuilder } from "./UltimateB2HotspotBuilder.jsx";
import { UltimateB2ActivityBuilder } from "./UltimateB2ActivityBuilder.jsx";

export function UltimateB2BuilderApp() {
  const [tab, setTab] = useState("hotspots");
  return (
    <div className="ultimate-b2-builder-app">
      <nav className="ultimate-b2-builder-tabs" aria-label="Ultimate B2 authoring tools">
        <button type="button" aria-selected={tab === "hotspots"} onClick={() => setTab("hotspots")}>Hotspot Builder</button>
        <button type="button" aria-selected={tab === "activities"} onClick={() => setTab("activities")}>Activity Builder</button>
      </nav>
      <div hidden={tab !== "hotspots"}><UltimateB2HotspotBuilder /></div>
      <div hidden={tab !== "activities"}><UltimateB2ActivityBuilder /></div>
    </div>
  );
}
