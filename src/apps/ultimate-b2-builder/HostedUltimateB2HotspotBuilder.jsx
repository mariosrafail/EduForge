import catalog from "../../../android-content-packs/ultimate-b2-students-book/catalog.json";

import { HostedHotspotBuilder } from "../book-builder/hosted/HostedHotspotBuilder.jsx";
import { ultimateB2StudentsBookPageUnits } from "../../data/ultimate-b2/ultimateB2PageUnits.js";

const studentsPageRows = ultimateB2StudentsBookPageUnits
  .filter((unit) => [1, 2].includes(Number(unit.number)))
  .flatMap((unit) => unit.pages.map((page) => ({ ...page, unitNumber: Number(unit.number) })));

const legacyActivities = (catalog.units || []).flatMap((unit) => (unit.lessons || []).flatMap((lesson) => (
  (lesson.exercises || []).map((activity) => ({
    activityKey: activity.stableActivityId,
    title: activity.title,
    unitNumber: Number(activity.unitNumber),
    pageSpread: String(activity.pageSpread || activity.pageNumber),
    pageLabel: activity.pageLabel,
    pageId: lesson.pageId || lesson.id,
  }))
)));

export function HostedUltimateB2HotspotBuilder({ bookSlug = "ultimate-b2", componentSlug = "ultimate-b2-students-book" }) {
  const managed = componentSlug !== "ultimate-b2-students-book";
  const componentTitle = componentSlug === "ultimate-b2-workbook" ? "Workbook" : componentSlug === "ultimate-b2-grammar-book" ? "Grammar Book" : "Students Book";
  return <HostedHotspotBuilder
    bookSlug={bookSlug}
    componentSlug={componentSlug}
    bookTitle="Ultimate B2"
    componentTitle={componentTitle}
    managed={managed}
    canonicalPageRows={studentsPageRows}
    canonicalActivities={legacyActivities}
  />;
}

export default HostedUltimateB2HotspotBuilder;
