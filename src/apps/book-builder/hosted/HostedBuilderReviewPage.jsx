import { HostedViewerPreview } from "./HostedViewerPreview.jsx";
import { hostedBuilderHash } from "./hostedBuilderRouter.js";

function reviewContext(intent) {
  if (intent.view === "library") return "Book library";
  if (intent.view === "page") return `Unit ${intent.unitNumber} · Page ${intent.pageId}`;
  const page = intent.pageId ? ` · Unit ${intent.unitNumber} · Page ${intent.pageId}` : "";
  return `Activity ${intent.activityId}${page}`;
}

export function HostedBuilderReviewPage({ book, component, intent }) {
  const immutable = Boolean(intent.releaseId);
  const backHref = hostedBuilderHash({ bookSlug: book.slug, componentSlug: component.slug });
  const sourceLabel = immutable ? "Immutable Release" : "Saved Draft";
  return <main className="hosted-builder-review-page" id="main-content">
    <header className="hosted-builder-review-header">
      <div>
        <span>Hamilton House · Book Builder</span>
        <h1>Player Review</h1>
        <p>{book.title} · {component.title}</p>
      </div>
      <a className="hosted-builder-action" href={backHref}>Back to Builder</a>
    </header>
    <section className="hosted-builder-review-identity" aria-label="Review identity">
      <strong>{sourceLabel}</strong>
      <span>{reviewContext(intent)}</span>
      {immutable ? <code>{intent.releaseId}</code> : null}
    </section>
    <HostedViewerPreview
      intent={intent}
      bookSlug={book.slug}
      componentSlug={component.slug}
      allowFullscreen={true}
      title={`Player Review · ${sourceLabel}`}
      description={immutable ? "Pinned to the exact immutable release." : "Shows only the latest successfully saved Builder state."}
    />
  </main>;
}

export default HostedBuilderReviewPage;
