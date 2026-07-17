const metadataCache = new Map();

export function getCachedBookAssetMetadata(logicalKey) { return metadataCache.get(logicalKey) || null; }

function abortableDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => { window.clearTimeout(timeout); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

export async function requestBookAssetAccess(logicalKey, { signal, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`/.netlify/functions/book-content?action=asset-access&logicalKey=${encodeURIComponent(logicalKey)}`, { signal, headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || `Book asset request failed (${response.status})`);
        error.status = response.status;
        throw error;
      }
      metadataCache.set(logicalKey, payload.asset);
      return payload;
    } catch (error) {
      if (error.name === "AbortError") throw error;
      lastError = error;
      if (attempt < retries && (!error.status || error.status >= 500)) { await abortableDelay(150 * (attempt + 1), signal); continue; }
      throw error;
    }
  }
  throw lastError;
}
