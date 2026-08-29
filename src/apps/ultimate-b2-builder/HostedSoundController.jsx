import { Volume2 } from "lucide-react";
import { useEffect, useState } from "react";

import { getBuilderContent } from "../book-builder/hosted/builderContentApi.js";
import { useBuilderReview } from "../book-builder/hosted/HostedPackageReview.jsx";
import { HOSTED_EDITABLE_UI_BINDINGS } from "../../data/ultimate-b2/hostedTeacherUiBindingCatalog.js";
import { normalizeHostedTeacherUiDocument } from "../../data/ultimate-b2/hostedTeacherUiDocument.js";
import { ultimateB2TeacherAppAuthoring } from "../../data/ultimate-b2/teacherAppAuthoring.js";

const identity = Object.freeze({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "ui-controller" });
const sounds = Object.freeze(HOSTED_EDITABLE_UI_BINDINGS.filter((binding) => binding.category === "sounds" && binding.mediaFamily === "audio"));

const filename = (path) => String(path || "").split("/").pop() || "Canonical interface sound";

export function HostedSoundController() {
  const { registerToolContext } = useBuilderReview();
  const [state, setState] = useState({ loading: true, assets: {}, error: "" });
  useEffect(() => { registerToolContext("sounds", { view: "page", dirty: false, refreshKey: 0, release: null }); }, [registerToolContext]);
  useEffect(() => {
    const controller = new AbortController();
    getBuilderContent(identity, { signal: controller.signal }).then((payload) => {
      const document = normalizeHostedTeacherUiDocument(payload.document);
      setState({ loading: false, assets: document.assets, error: "" });
    }).catch((error) => { if (error.name !== "AbortError") setState({ loading: false, assets: {}, error: error.message }); });
    return () => controller.abort();
  }, []);
  return <main className="b2-sound-controller">
    <header><div><span>Ultimate B2 package tools</span><h1>Sound Controller</h1><p>Shared interface sounds currently used throughout the Ultimate B2 Teacher package.</p></div><strong>Read-only</strong></header>
    <p className="b2-sound-controller-notice">Sound authoring will be added in a later milestone.</p>
    {state.error ? <p role="alert">{state.error}</p> : null}
    {state.loading ? <p role="status">Loading sound inventory…</p> : <section aria-label="Interface sound bindings">
      {sounds.map((binding) => {
        const saved = state.assets[binding.id];
        const canonical = ultimateB2TeacherAppAuthoring.assets[binding.id];
        return <article key={binding.id} data-binding-id={binding.id}><Volume2 aria-hidden="true" /><div><strong>{binding.label}</strong><code>{binding.id}</code><span>{saved ? "Saved override" : "Canonical"}</span><small>{saved?.originalFilename || filename(canonical?.repositoryPath)} · {saved?.mediaType || canonical?.mediaType || "audio/mpeg"}</small></div></article>;
      })}
    </section>}
  </main>;
}

export default HostedSoundController;
