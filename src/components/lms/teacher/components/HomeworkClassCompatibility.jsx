import { homeworkPackageCompatibilityIssue } from "../homeworkUiModel.js";

export function classPackageLabel(item) {
  return item.bookPackageId ? item.bookPackageTitle || "Linked book package" : "No book package linked";
}

export function HomeworkClassCompatibility({ classes, selectedClassIds, selected = [], book = null }) {
  const activities = selected.length ? selected : book ? [{ packageId: book.packageId, title: book.packageTitle }] : [];
  const issue = homeworkPackageCompatibilityIssue(classes, selectedClassIds, activities);
  const packageIds = new Set(activities.map((item) => item.packageId).filter(Boolean));
  return <aside className="homework-class-compatibility" aria-label="Class and book compatibility" aria-live="polite">
    <strong>{book ? `Browsing ${book.packageTitle}` : "Selected exercise packages"}</strong>
    {selected.length ? <p>Selected: {[...new Set(selected.map((item) => item.packageTitle || "Unknown package"))].join(" · ")}</p> : null}
    <ul>{classes.map((item) => <li key={item.id}>{item.name} · {classPackageLabel(item)}{selectedClassIds.includes(item.id) ? " · selected" : ""}{packageIds.size ? packageIds.size === 1 && packageIds.has(item.bookPackageId) ? " · compatible" : " · incompatible" : ""}</li>)}</ul>
    {issue.conflict ? <p role="status">{issue.message} Your exercise selections are retained.</p> : <p>{!selectedClassIds.length ? "Choose at least one class to assign exercises." : !activities.length ? "Choose an exercise or browse a published book to check compatibility." : "Selected classes and exercises use the same book package."}</p>}
    <a href="#/teacher/classes">Choose or create a class linked to the required book package</a>
    <small>Student book access is checked separately. Creating a class does not grant a book entitlement.</small>
  </aside>;
}
