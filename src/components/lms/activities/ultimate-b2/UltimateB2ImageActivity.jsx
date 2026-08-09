import { getUltimateB2ImageActivity } from "../../../../data/ultimate-b2/unit1Part1Exercise2Image.js";

export function UltimateB2ImageActivity({ activity, display: displayOverride = null }) {
  const display = displayOverride || getUltimateB2ImageActivity(activity);
  if (!display) return null;

  return (
    <section className="ultimate-b2-image-activity" data-image-activity={display.activityId} aria-label={activity.title}>
      <div className="ultimate-b2-image-activity-sheet">
        {display.instructionImage && <img className="ultimate-b2-image-activity-instruction" src={display.instructionImage} alt={display.instructionImageAlt} />}
        <img className="ultimate-b2-image-activity-main" src={display.image} alt={display.mainImageAlt} />
      </div>
    </section>
  );
}
