export const hostedBuilderTools = Object.freeze(["hotspots", "activities", "ui", "publication"]);

export function hostedBuilderHash({ bookSlug, componentSlug, tool } = {}) {
  if (!bookSlug) return "#/books";
  if (!componentSlug) return `#/books/${encodeURIComponent(bookSlug)}`;
  const base = `#/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}`;
  return tool ? `${base}/${encodeURIComponent(tool)}` : base;
}

function decode(segment) {
  try { return decodeURIComponent(segment); } catch { return ""; }
}

export function parseHostedBuilderHash(hash = "") {
  const raw = String(hash || "").replace(/^#/, "");
  const segments = raw.split("?")[0].split("/").filter(Boolean).map(decode);
  if (!segments.length || (segments.length === 1 && segments[0] === "books")) return { kind: "library" };
  if (segments[0] !== "books" || !segments[1]) return { kind: "not-found" };
  if (segments.length === 2) return { kind: "book", bookSlug: segments[1] };
  if (segments[2] !== "components" || !segments[3]) return { kind: "not-found" };
  if (segments.length === 4) return { kind: "workspace", bookSlug: segments[1], componentSlug: segments[3], tool: "hotspots" };
  if (segments.length === 5 && hostedBuilderTools.includes(segments[4])) {
    return { kind: "workspace", bookSlug: segments[1], componentSlug: segments[3], tool: segments[4] };
  }
  return { kind: "not-found" };
}

export function navigateHostedBuilder(route, { replace = false } = {}) {
  const hash = typeof route === "string" ? route : hostedBuilderHash(route);
  if (replace) {
    window.history.replaceState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = hash.slice(1);
  }
}
