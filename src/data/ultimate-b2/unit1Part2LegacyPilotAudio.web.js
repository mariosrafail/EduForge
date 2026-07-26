const protectedHighlight = (logicalKey) => ({
  logicalKey,
  localUrl: null,
  devFallbackUrl: import.meta.env.DEV
    ? `/.netlify/functions/ultimate-b2-source-asset?logicalKey=${encodeURIComponent(logicalKey)}`
    : null,
});

export const ultimateB2Unit1Part2LegacyAudio = Object.fromEntries(
  [
    ...[1, 2, 3].map((number) => `ultimate-b2.legacy-pilot.unit-1.part-2.obj2.highlight-${number}`),
    ...[1, 2, 3, 4, 5, 6].map((number) => `ultimate-b2.legacy-pilot.unit-1.part-2.obj3.highlight-${number}`),
  ].map((logicalKey) => [logicalKey, protectedHighlight(logicalKey)]),
);
