import { lazy } from "react";

const UltimateB2StudentsBookHostedWorkspace = lazy(() => import(
  "../../ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx"
).then((module) => ({ default: module.UltimateB2StudentsBookHostedWorkspace })));

const adapters = Object.freeze({
  "ultimate-b2-students-book": Object.freeze({
    id: "ultimate-b2-students-book",
    bookSlug: "ultimate-b2",
    componentSlug: "ultimate-b2-students-book",
    capabilities: Object.freeze({
      hotspots: Object.freeze({ readable: true, writable: true }),
      activities: Object.freeze({ readable: true, writable: true }),
      uiController: Object.freeze({ readable: true, writable: false }),
    }),
    Workspace: UltimateB2StudentsBookHostedWorkspace,
  }),
});

export function resolveHostedBuilderAdapter(component) {
  if (!component?.adapterId) return null;
  const adapter = adapters[component.adapterId];
  if (!adapter || adapter.componentSlug !== component.slug) return null;
  return adapter;
}

export const hostedBuilderAdapters = adapters;
