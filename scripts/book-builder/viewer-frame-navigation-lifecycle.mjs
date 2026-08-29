export class SupersededViewerFrameNavigationError extends Error {
  constructor() {
    super("Viewer frame navigation was superseded.");
    this.name = "SupersededViewerFrameNavigationError";
  }
}

export function viewerFrameNavigationIdentity(value) {
  const url = new URL(String(value || ""));
  url.hash = "";
  return url.href;
}

function createNavigation(frame, identity, isCurrent) {
  const controller = new AbortController();
  const superseded = new Promise((resolve) => {
    controller.signal.addEventListener("abort", () => resolve({ kind: "superseded" }), { once: true });
  });

  const wait = async (operation) => {
    const settled = Promise.resolve(operation).then(
      (value) => ({ kind: "value", value }),
      (error) => ({ kind: "error", error }),
    );
    const result = await Promise.race([settled, superseded]);
    if (result.kind === "superseded" || !isCurrent()) throw new SupersededViewerFrameNavigationError();
    if (result.kind === "error") throw result.error;
    return result.value;
  };

  return {
    frame,
    identity,
    signal: controller.signal,
    abort: () => controller.abort(),
    isCurrent,
    wait,
    async click(locator, description) {
      const handle = await wait(locator.elementHandle());
      if (!handle) throw new Error(`${description} is missing from the current Viewer navigation.`);
      try {
        await wait(handle.click());
      } finally {
        if (typeof handle.dispose === "function") await handle.dispose();
      }
    },
  };
}

export function createViewerFrameNavigationLifecycle({ run, onError }) {
  if (typeof run !== "function" || typeof onError !== "function") throw new TypeError("Viewer frame navigation callbacks are required.");
  const currentByFrame = new WeakMap();

  const begin = (frame, identity, { execute = true } = {}) => {
    if (!frame || (typeof frame !== "object" && typeof frame !== "function")) throw new TypeError("Viewer frame identity is required.");
    const normalizedIdentity = String(identity || "");
    const previous = currentByFrame.get(frame);
    if (previous?.identity === normalizedIdentity && !previous.signal.aborted) return previous;

    previous?.abort();
    let navigation;
    navigation = createNavigation(frame, normalizedIdentity, () => currentByFrame.get(frame) === navigation && !navigation.signal.aborted);
    currentByFrame.set(frame, navigation);
    navigation.completion = execute
      ? Promise.resolve().then(() => run(frame, navigation)).then(
        () => navigation.isCurrent() ? { status: "completed" } : { status: "superseded" },
        (error) => {
          if (!navigation.isCurrent()) return { status: "superseded" };
          onError(error);
          return { status: "failed", error };
        },
      )
      : Promise.resolve({ status: "inactive" });
    return navigation;
  };

  return {
    begin,
    supersede(frame, identity) {
      return begin(frame, identity, { execute: false });
    },
    current(frame) {
      return currentByFrame.get(frame) || null;
    },
  };
}
