import { useState } from "react";
import { activityTypes } from "../../data/mockActivities";
import ActivityEditor from "./ActivityEditor";
import ActivityTypeCard from "./ActivityTypeCard";

export default function ActivityBuilder() {
  const [activeActivity, setActiveActivity] = useState("");

  return (
    <section className="split-layout wide-left">
      <div>
        <div className="section-title">
          <div>
            <span className="section-kicker">Activity Builder</span>
            <h2>Τύποι δραστηριοτήτων</h2>
          </div>
        </div>
        <div className="activity-grid">
          {activityTypes.map((type) => (
            <ActivityTypeCard key={type} type={type} onCreate={setActiveActivity} />
          ))}
        </div>
      </div>
      <ActivityEditor activeActivity={activeActivity} />
    </section>
  );
}
