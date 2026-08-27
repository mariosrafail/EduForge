import {
  createHostedBuilderPreviewRuntimeContext,
  exchangeHostedPreviewComponentAuthorization,
  HOSTED_VIEWER_RUNTIME_MODES,
} from "./hostedReleasePreview.js";

export const HOSTED_COMPONENT_AUTHORIZATION_RENEWAL_MARGIN_MS = 30_000;
export const HOSTED_COMPONENT_AUTHORIZATION_MAX_TIMER_MS = 2_147_483_647;

function identityKey({ bookSlug, componentSlug }) {
  return `${bookSlug}:${componentSlug}`;
}

function normalizedIdentity(identity) {
  return Object.freeze({ bookSlug: identity.bookSlug, componentSlug: identity.componentSlug });
}

export function createHostedPreviewComponentAuthorizationSession({
  initialContext,
  initialIdentity,
  exchange = exchangeHostedPreviewComponentAuthorization,
  onChange = () => {},
  onError = () => {},
  now = Date.now,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  if (!initialContext || !initialIdentity?.bookSlug || !initialIdentity?.componentSlug) throw new TypeError("A Viewer authorization session requires an initial context and component identity.");
  const initial = normalizedIdentity(initialIdentity);
  const entries = new Map();
  const pending = new Map();
  const timers = new Map();
  let disposed = false;

  if (initialContext.kind === HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW) {
    entries.set(identityKey(initial), Object.freeze({ ...initial, token: initialContext.authorization, expiresAt: "" }));
  }

  const contextFor = (identity) => {
    if (initialContext.kind !== HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW) return initialContext;
    const entry = entries.get(identityKey(identity));
    return entry?.token
      ? createHostedBuilderPreviewRuntimeContext(entry.token)
      : Object.freeze({ kind: HOSTED_VIEWER_RUNTIME_MODES.INVALID, teacherPreview: false });
  };

  const notify = () => {
    if (!disposed) onChange();
  };

  const schedule = (entry) => {
    const key = identityKey(entry);
    const existing = timers.get(key);
    if (existing !== undefined) clearTimer(existing);
    const expiry = Date.parse(entry.expiresAt);
    const delay = expiry - Number(now()) - HOSTED_COMPONENT_AUTHORIZATION_RENEWAL_MARGIN_MS;
    if (!Number.isFinite(expiry) || !Number.isFinite(delay) || delay <= 0) throw new Error("Component authorization expiry is invalid or too near.");
    const timer = setTimer(() => {
      timers.delete(key);
      void refresh(entry, entry).catch((error) => {
        entries.delete(key);
        notify();
        onError(normalizedIdentity(entry), error);
      });
    }, Math.min(delay, HOSTED_COMPONENT_AUTHORIZATION_MAX_TIMER_MS));
    timers.set(key, timer);
  };

  const refresh = async (source, target) => {
    const targetIdentity = normalizedIdentity(target);
    const key = identityKey(targetIdentity);
    if (disposed) throw new Error("Viewer authorization session is closed.");
    if (pending.has(key)) return pending.get(key);
    const operation = Promise.resolve(exchange({
      sourceBookSlug: source.bookSlug,
      sourceComponentSlug: source.componentSlug,
      targetBookSlug: targetIdentity.bookSlug,
      targetComponentSlug: targetIdentity.componentSlug,
      sourceAuthorization: source.token,
      runtimeContext: createHostedBuilderPreviewRuntimeContext(source.token),
    })).then((value) => {
      if (disposed) throw new Error("Viewer authorization session is closed.");
      const entry = Object.freeze({ ...targetIdentity, token: value.token, expiresAt: value.expiresAt });
      entries.set(key, entry);
      schedule(entry);
      notify();
      return contextFor(targetIdentity);
    }).finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  };

  return Object.freeze({
    contextFor,
    async ensure(identity) {
      const target = normalizedIdentity(identity);
      if (initialContext.kind === HOSTED_VIEWER_RUNTIME_MODES.BARE) return initialContext;
      if (initialContext.kind === HOSTED_VIEWER_RUNTIME_MODES.RELEASE_PREVIEW) {
        if (identityKey(target) !== identityKey(initial)) throw new Error("Release Review cannot exchange component authorization.");
        return initialContext;
      }
      if (initialContext.kind !== HOSTED_VIEWER_RUNTIME_MODES.BUILDER_PREVIEW) throw new Error("Authorized Builder Review is required.");
      const current = entries.get(identityKey(target));
      if (current?.expiresAt && Date.parse(current.expiresAt) - Number(now()) > HOSTED_COMPONENT_AUTHORIZATION_RENEWAL_MARGIN_MS) return contextFor(target);
      const source = current?.token ? current : [...entries.values()].find((entry) => entry.token);
      if (!source) throw new Error("No scoped component authorization is available for exchange.");
      return refresh(source, target);
    },
    snapshot() {
      return Object.freeze(Object.fromEntries([...entries.values()].map((entry) => [entry.componentSlug, Object.freeze({
        bookSlug: entry.bookSlug,
        componentSlug: entry.componentSlug,
        expiresAt: entry.expiresAt,
      })])));
    },
    dispose() {
      disposed = true;
      for (const timer of timers.values()) clearTimer(timer);
      timers.clear();
      pending.clear();
      entries.clear();
    },
  });
}
