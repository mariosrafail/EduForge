export const hostedBuilderCapabilityByTool = Object.freeze({
  pages: "pages",
  hotspots: "hotspots",
  activities: "activities",
  ui: "uiController",
  publication: "publication",
});

export function resolveHostedBuilderTool(adapter, tool) {
  const capability = hostedBuilderCapabilityByTool[tool];
  return capability && adapter?.capabilities?.[capability]?.readable ? capability : null;
}
