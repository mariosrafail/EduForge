import { lazy } from "react";

import { NATIVE_ACTIVITY_KINDS } from "../../../data/native-activities/nativeActivityKinds.js";
import { ultimateB2NativeActivityPlacements } from "../../../data/ultimate-b2/nativeActivityAdapter.js";

const UltimateB2StudentsBookHostedWorkspace = lazy(() => import(
  "../../ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx"
).then((module) => ({ default: module.UltimateB2StudentsBookHostedWorkspace })));

const adapters = Object.freeze({
  "ultimate-b2-students-book": Object.freeze({
    id: "ultimate-b2-students-book",
    bookSlug: "ultimate-b2",
    componentSlug: "ultimate-b2-students-book",
    nativeActivities: Object.freeze({ enabled: true, kinds: NATIVE_ACTIVITY_KINDS, placements: ultimateB2NativeActivityPlacements }),
    capabilities: Object.freeze({
      hotspots: Object.freeze({ readable: true, writable: true }),
      activities: Object.freeze({ readable: true, writable: true }),
      uiController: Object.freeze({ readable: true, writable: true }),
      publication: Object.freeze({ readable: true, writable: true }),
    }),
    Workspace: UltimateB2StudentsBookHostedWorkspace,
  }),
});

export function resolveHostedBuilderAdapter(book, component) {
  if (!component?.adapterId) return null;
  const adapter = adapters[component.adapterId];
  if (!adapter || adapter.bookSlug !== book?.slug || adapter.componentSlug !== component.slug) return null;
  return adapter;
}

export const hostedBuilderAdapters = adapters;
