const DEFAULT_STABLE_SAMPLES = 3;
const DEFAULT_MAX_SAMPLES = 120;
const DEFAULT_TOLERANCE = 0.01;

function validSnapshot(snapshot) {
  return snapshot?.ready === true
    && Array.isArray(snapshot.geometry)
    && snapshot.geometry.length > 0
    && snapshot.geometry.every(Number.isFinite)
    && Array.isArray(snapshot.state);
}

export function geometrySnapshotsMatch(previous, current, tolerance = DEFAULT_TOLERANCE) {
  if (!validSnapshot(previous) || !validSnapshot(current)) return false;
  if (previous.geometry.length !== current.geometry.length || previous.state.length !== current.state.length) return false;
  return previous.geometry.every((value, index) => Math.abs(value - current.geometry[index]) <= tolerance)
    && previous.state.every((value, index) => value === current.state[index]);
}

export async function waitForStableGeometrySamples(sample, {
  label = "Rendered geometry",
  stableSamples = DEFAULT_STABLE_SAMPLES,
  maxSamples = DEFAULT_MAX_SAMPLES,
  tolerance = DEFAULT_TOLERANCE,
} = {}) {
  if (!Number.isInteger(stableSamples) || stableSamples < 2) throw new TypeError("stableSamples must be an integer of at least 2");
  if (!Number.isInteger(maxSamples) || maxSamples < stableSamples) throw new TypeError("maxSamples must be an integer no smaller than stableSamples");

  let previous = null;
  let consecutive = 0;
  let latest = null;
  for (let index = 0; index < maxSamples; index += 1) {
    latest = await sample();
    if (!validSnapshot(latest)) {
      previous = null;
      consecutive = 0;
      continue;
    }
    consecutive = geometrySnapshotsMatch(previous, latest, tolerance) ? consecutive + 1 : 1;
    if (consecutive >= stableSamples) return latest;
    previous = latest;
  }
  throw new Error(`${label} did not stabilize across ${stableSamples} consecutive animation-frame samples: ${JSON.stringify(latest)}`);
}

export async function waitForStableGeometry(locator, {
  selectors = [":scope"],
  expectedAttributes = {},
  label,
  stableSamples,
  maxSamples,
  tolerance,
} = {}) {
  await locator.waitFor({ state: "visible" });
  await locator.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  return waitForStableGeometrySamples(
    () => locator.evaluate((root, options) => new Promise((resolve) => {
      requestAnimationFrame(() => {
        const elements = options.selectors.map((selector) => selector === ":scope" ? root : root.querySelector(selector));
        const boxes = elements.map((element) => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        });
        const state = Object.entries(options.expectedAttributes).map(([attribute]) => root.getAttribute(attribute));
        const expectedState = Object.values(options.expectedAttributes);
        resolve({
          ready: root.isConnected
            && boxes.every((box) => box && box.width > 0 && box.height > 0)
            && state.every((value, index) => value === expectedState[index]),
          geometry: boxes.flatMap((box) => box ? [box.left, box.top, box.width, box.height] : []),
          state,
          boxes,
        });
      });
    }), { selectors, expectedAttributes }),
    { label, stableSamples, maxSamples, tolerance },
  );
}
