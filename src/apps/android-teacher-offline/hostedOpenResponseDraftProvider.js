import { useEffect, useState } from "react";

import { ULTIMATE_B2_HOSTED_OPEN_RESPONSE_SCHEMA_VERSION } from "../../data/ultimate-b2/hostedOpenResponseDraft.js";
import { isUltimateB2ConfigurableOpenResponse } from "../../data/ultimate-b2/openResponseActivityRegistry.js";

const routeRoot = "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/open-response";

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function validateHostedOpenResponsePreviewEnvelope(value, activityId) {
  if (!exactKeys(value, ["bookSlug", "componentSlug", "resource", "documentKey", "schemaVersion", "revision", "source", "document"])) throw new Error("Invalid hosted Open Response preview envelope.");
  if (value.bookSlug !== "ultimate-b2" || value.componentSlug !== "ultimate-b2-students-book" || value.resource !== "open-response" || value.documentKey !== activityId) throw new Error("Hosted Open Response preview identity mismatch.");
  if (value.schemaVersion !== ULTIMATE_B2_HOSTED_OPEN_RESPONSE_SCHEMA_VERSION || value.source !== "database" || !Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error("Hosted Open Response preview revision is invalid.");
  if (!value.document || typeof value.document !== "object" || Array.isArray(value.document)) throw new Error("Hosted Open Response preview document is invalid.");
  return value.document;
}

export function useHostedOpenResponseDraft(activityId) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    setDraft(null);
    if (!isUltimateB2ConfigurableOpenResponse(activityId)) return undefined;
    const controller = new AbortController();
    fetch(`${routeRoot}/${encodeURIComponent(activityId)}`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Hosted Open Response preview is unavailable.");
      return validateHostedOpenResponsePreviewEnvelope(await response.json(), activityId);
    }).then((document) => {
      if (!controller.signal.aborted) setDraft(document);
    }).catch(() => {
      if (!controller.signal.aborted) setDraft(null);
    });
    return () => controller.abort();
  }, [activityId]);

  return draft;
}
