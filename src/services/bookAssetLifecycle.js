export const BOOK_ASSET_REFRESH_LEAD_MS = 30_000;

export function getBookAssetRefreshDelay(expiresAt, { now = Date.now(), leadMs = BOOK_ASSET_REFRESH_LEAD_MS } = {}) {
  if (!expiresAt) return null;
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return null;
  const remaining = expiry - now;
  if (remaining <= 1_000) return null;
  const boundedLead = Math.min(Math.max(1_000, leadMs), Math.max(1_000, Math.floor(remaining / 2)));
  return Math.max(1_000, remaining - boundedLead);
}

export class BookAssetUrlLifecycle {
  constructor({ request, onUpdate, onError, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.request = request;
    this.onUpdate = onUpdate;
    this.onError = onError;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.activeController = null;
    this.timer = null;
    this.stopped = false;
    this.inFlight = null;
  }

  start() {
    this.stopped = false;
    return this.refresh("initial");
  }

  schedule(expiresAt) {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    const delay = getBookAssetRefreshDelay(expiresAt, { now: this.now() });
    if (delay === null || this.stopped) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.refresh("scheduled");
    }, delay);
  }

  refresh(reason = "manual") {
    if (this.stopped) return Promise.resolve(null);
    if (this.inFlight) return this.inFlight;
    const controller = new AbortController();
    this.activeController = controller;
    const operation = Promise.resolve()
      .then(() => this.request({ signal: controller.signal, reason }))
      .then((payload) => {
        if (this.stopped || controller.signal.aborted) return null;
        this.onUpdate?.(payload, { reason });
        this.schedule(payload.expiresAt);
        return payload;
      })
      .catch((error) => {
        if (error?.name !== "AbortError" && !this.stopped) this.onError?.(error, { reason });
        return null;
      })
      .finally(() => {
        if (this.activeController === controller) this.activeController = null;
        if (this.inFlight === operation) this.inFlight = null;
      });
    this.inFlight = operation;
    return operation;
  }

  stop() {
    this.stopped = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.activeController?.abort();
    this.activeController = null;
  }
}
