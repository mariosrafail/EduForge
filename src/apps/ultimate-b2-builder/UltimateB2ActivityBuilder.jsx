import { UltimateB2ListeningBuilder } from "./UltimateB2ListeningBuilder.jsx";

export function UltimateB2ActivityBuilder() {
  return (
    <main className="activity-builder">
      <aside className="activity-builder-sidebar">
        <span>Activity type</span>
        <button type="button" aria-current="page">Listening</button>
        <small>Reading · Exercise 2</small>
      </aside>
      <UltimateB2ListeningBuilder />
    </main>
  );
}
