import { useEffect, useMemo, useState } from "react";

import { UltimateB2HotspotBuilder } from "./UltimateB2HotspotBuilder.jsx";
import { UltimateB2ActivityBuilder } from "./UltimateB2ActivityBuilder.jsx";
import { UltimateB2TeacherAppBuilder } from "./UltimateB2TeacherAppBuilder.jsx";
import { mergeUltimateB2StudentsBookAuthoringActivities } from "../../data/ultimate-b2/studentsBookAuthoringCatalog.js";
import { ultimateB2PublisherCreatedActivities } from "../../data/ultimate-b2/publisherCreatedActivities.js";

const publisherActivityEndpoint = "/__hhplms/ultimate-b2-publisher-activities";

export function UltimateB2BuilderApp() {
  const [tab, setTab] = useState(() => window.location.hash === "#teacher-app" ? "teacher-app" : window.location.hash === "#activity-builder" ? "activities" : "hotspots");
  const [assetRevision, setAssetRevision] = useState("");
  const [publisherActivities, setPublisherActivities] = useState(ultimateB2PublisherCreatedActivities);
  const activities = useMemo(() => mergeUltimateB2StudentsBookAuthoringActivities(publisherActivities), [publisherActivities]);
  useEffect(() => {
    let active = true;
    fetch(publisherActivityEndpoint, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Publisher activity catalog could not be loaded.");
      return payload;
    }).then((payload) => { if (active) setPublisherActivities(payload.activities); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const publisherActivityCreated = (record) => setPublisherActivities((current) => [...current.filter((activity) => activity.activityId !== record.activityId), record]);
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
      <div hidden={tab !== "hotspots"}><UltimateB2HotspotBuilder assetRevision={assetRevision} activities={activities} /></div>
      <div hidden={tab !== "activities"}><UltimateB2ActivityBuilder activities={activities} onPublisherActivityCreated={publisherActivityCreated} /></div>
      <div hidden={tab !== "teacher-app"}><UltimateB2TeacherAppBuilder onSaved={setAssetRevision} /></div>
    </div>
  );
}

export default UltimateB2BuilderApp;
