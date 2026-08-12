import committedManifest from "virtual:ultimate-b2-hosted-hotspot-data";
import {
  createHostedReviewHotspotRuntime,
  getUltimateB2AuthoredHotspotActivityKey,
  ultimateB2StudentsBookHotspotToAction,
} from "./hostedReviewHotspotRuntime.js";

const runtime = createHostedReviewHotspotRuntime(committedManifest);

export let ultimateB2StudentsBookHotspotManifest = committedManifest;

export async function prepareUltimateB2StudentsBookHotspots(options) {
  const state = await runtime.prepare(options);
  ultimateB2StudentsBookHotspotManifest = runtime.currentManifest();
  return state;
}

export function getUltimateB2StudentsBookHotspots(identity = {}) {
  return runtime.getHotspots(identity);
}

export function getUltimateB2StudentsBookHotspotActions(identity = {}) {
  return runtime.getActions(identity);
}

export {
  getUltimateB2AuthoredHotspotActivityKey,
  ultimateB2StudentsBookHotspotToAction,
};
