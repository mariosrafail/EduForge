import { newBuilderClientMutationId } from "./builderContentApi.js";

const root = "/builder/api/native-activities";
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

async function payload(response) { return response.json().catch(() => ({})); }

export async function createNativeActivity({ bookSlug, componentSlug, kind, pageId, title }) {
  for (const value of [bookSlug, componentSlug, kind, pageId]) if (!SAFE_ID.test(String(value || ""))) throw new Error("Invalid native activity creation identity.");
  const response = await fetch(`${root}/books/${encodeURIComponent(bookSlug)}/components/${encodeURIComponent(componentSlug)}/create`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, pageId, title: String(title || ""), clientMutationId: newBuilderClientMutationId() }),
  });
  const value = await payload(response);
  if (!response.ok) throw new Error(value.error || "Native activity could not be created.");
  return value;
}
