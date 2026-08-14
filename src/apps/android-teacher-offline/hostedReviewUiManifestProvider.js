import { normalizeHostedTeacherUiPreview } from "../../data/ultimate-b2/hostedTeacherUiDocument.js";

const previewPath = "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/ui-controller";

export const interactiveUiManifestProvider = Object.freeze({
  async load({ signal } = {}) {
    const response = await fetch(previewPath, { method: "GET", cache: "no-store", credentials: "omit", signal });
    if (response.status === 404) return null;
    if (!response.ok) {
      const error = new Error("The saved Teacher interface revision could not be loaded.");
      error.code = "LIVE_PREVIEW_UNAVAILABLE";
      throw error;
    }
    const payload = await response.json();
    return normalizeHostedTeacherUiPreview(payload?.document);
  },
});
