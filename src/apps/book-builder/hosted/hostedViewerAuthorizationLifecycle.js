export const HOSTED_VIEWER_AUTHORIZATION_RENEWAL_MARGIN_MS = 30_000;
const TOKEN = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/;

export function previewAuthorizationRenewalDelay(expiresAt, now = Date.now()) {
  const expiry = Date.parse(String(expiresAt || ""));
  const delay = expiry - Number(now) - HOSTED_VIEWER_AUTHORIZATION_RENEWAL_MARGIN_MS;
  if (!Number.isFinite(expiry) || !Number.isFinite(delay) || delay <= 0) throw new Error("Viewer authorization expiry is invalid or too near.");
  return delay;
}

export function startHostedViewerAuthorizationLifecycle({
  requestAuthorization,
  onAuthorization,
  onError,
  now = Date.now,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  createController = () => new AbortController(),
}) {
  if (typeof requestAuthorization !== "function" || typeof onAuthorization !== "function" || typeof onError !== "function") throw new TypeError("Viewer authorization lifecycle callbacks are required.");
  let disposed = false;
  let renewalTimer = null;
  let controller = null;

  const issue = async () => {
    controller = createController();
    try {
      const value = await requestAuthorization({ signal: controller.signal });
      if (disposed || controller.signal.aborted) return;
      if (!value || !TOKEN.test(String(value.token || ""))) throw new Error("Viewer authorization response is invalid.");
      const delay = previewAuthorizationRenewalDelay(value.expiresAt, now());
      onAuthorization(value.token);
      renewalTimer = setTimer(() => {
        renewalTimer = null;
        void issue();
      }, delay);
    } catch {
      if (disposed || controller?.signal.aborted) return;
      onAuthorization(null);
      onError();
    }
  };

  void issue();
  return () => {
    disposed = true;
    if (renewalTimer !== null) clearTimer(renewalTimer);
    controller?.abort();
  };
}
