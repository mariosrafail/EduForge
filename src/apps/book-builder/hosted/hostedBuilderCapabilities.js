export const hostedBuilderCapabilityByTool = Object.freeze({
  hotspots: "hotspots",
  activities: "activities",
  ui: "uiController",
});

export function resolveHostedBuilderTool(adapter, tool) {
  const capability = hostedBuilderCapabilityByTool[tool];
  return capability && adapter?.capabilities?.[capability]?.readable ? capability : null;
}
