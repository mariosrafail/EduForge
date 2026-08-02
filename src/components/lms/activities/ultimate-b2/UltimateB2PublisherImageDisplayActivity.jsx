import { getUltimateB2PublisherImageDisplay } from "../../../../data/ultimate-b2/unit1Part1Exercise2Display.js";

export function UltimateB2PublisherImageDisplayActivity({ activity }) {
  const display = getUltimateB2PublisherImageDisplay(activity);
  if (!display) return null;

  return (
    <section
      className="ultimate-b2-publisher-image-display"
      data-publisher-image-display-activity={display.activityId}
      aria-label={activity.title}
    >
      <div className="ultimate-b2-publisher-image-display-sheet">
        <img src={display.image} alt={display.imageAlt} />
        <ul>
          {display.lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
    </section>
  );
}
