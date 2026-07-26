const blockedPathPattern = /\/(?:\.netlify\/functions|api\/|auth\/)/i;

function resolvedUrl(input) {
  const raw = typeof input === "string" ? input : input?.url;
  try {
    return new URL(raw, globalThis.location?.href || "https://localhost/");
  } catch {
    return null;
  }
}

export function isAllowedTeacherOfflineUrl(input) {
  const url = resolvedUrl(input);
  if (!url) return false;
  if (["blob:", "data:", "file:", "content:", "capacitor:"].includes(url.protocol)) return true;
  return url.origin === globalThis.location?.origin && !blockedPathPattern.test(url.pathname);
}

function blockedError(input) {
  const url = resolvedUrl(input);
  const error = new Error(`Teacher offline mode blocked a network request: ${url?.pathname || "unknown URL"}`);
  error.code = "TEACHER_OFFLINE_NETWORK_BLOCKED";
  console.warn(error.message);
  return error;
}

export function installTeacherOfflineNetworkGuard() {
  if (globalThis.__teacherOfflineNetworkGuardInstalled) return;
  globalThis.__teacherOfflineNetworkGuardInstalled = true;

  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (originalFetch) {
    globalThis.fetch = (input, init) => (
      isAllowedTeacherOfflineUrl(input)
        ? originalFetch(input, init)
        : Promise.reject(blockedError(input))
    );
  }

  const xhrPrototype = globalThis.XMLHttpRequest?.prototype;
  if (xhrPrototype) {
    const originalOpen = xhrPrototype.open;
    xhrPrototype.open = function guardedOpen(method, url, ...rest) {
      if (!isAllowedTeacherOfflineUrl(url)) throw blockedError(url);
      return originalOpen.call(this, method, url, ...rest);
    };
  }

  if (globalThis.navigator?.sendBeacon) {
    const originalSendBeacon = globalThis.navigator.sendBeacon.bind(globalThis.navigator);
    globalThis.navigator.sendBeacon = (url, data) => (
      isAllowedTeacherOfflineUrl(url) ? originalSendBeacon(url, data) : false
    );
  }

  for (const constructorName of ["WebSocket", "EventSource"]) {
    const OriginalConstructor = globalThis[constructorName];
    if (!OriginalConstructor) continue;
    const GuardedConstructor = function guardedConnection(url, ...rest) {
      if (!isAllowedTeacherOfflineUrl(url)) throw blockedError(url);
      return new OriginalConstructor(url, ...rest);
    };
    GuardedConstructor.prototype = OriginalConstructor.prototype;
    Object.setPrototypeOf(GuardedConstructor, OriginalConstructor);
    globalThis[constructorName] = GuardedConstructor;
  }
}
