import { Suspense, useEffect, useState } from "react";
import { Boxes, FileImage, MapPinned, PanelsTopLeft, Rocket } from "lucide-react";

import {
  findHostedBuilderBook,
  findHostedBuilderComponent,
  hostedBuilderCatalog,
} from "./hostedBuilderCatalog.js";
import { resolveHostedBuilderAdapter } from "./hostedBuilderAdapters.jsx";
import { resolveHostedBuilderTool } from "./hostedBuilderCapabilities.js";
import { HostedBuilderReviewPage } from "./HostedBuilderReviewPage.jsx";
import { hostedBuilderHash, parseHostedBuilderHash } from "./hostedBuilderRouter.js";
import { HostedBuilderRouteTransition } from "./HostedBuilderRouteTransition.jsx";
import "./hostedBuilder.css";
import "./hostedBuilderModern.css";

function useHostedBuilderRoute() {
  const [route, setRoute] = useState(() => parseHostedBuilderHash(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(parseHostedBuilderHash(window.location.hash));
    window.addEventListener("hashchange", update);
    if (!window.location.hash) window.history.replaceState(null, "", hostedBuilderHash());
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}

function Breadcrumbs({ book, component, tool }) {
  const toolLabels = { pages: "Pages", hotspots: "Hotspot Builder", activities: "Activity Builder", ui: "UI Controller", publication: "Publication" };
  return <nav className="hosted-builder-breadcrumbs" aria-label="Breadcrumb">
    <a href={hostedBuilderHash()}>Books</a>
    {book ? <><span aria-hidden="true">/</span><a href={hostedBuilderHash({ bookSlug: book.slug })}>{book.title}</a></> : null}
    {component ? <><span aria-hidden="true">/</span><a href={hostedBuilderHash({ bookSlug: book.slug, componentSlug: component.slug })}>{component.title}</a></> : null}
    {tool ? <><span aria-hidden="true">/</span><span aria-current="page">{toolLabels[tool]}</span></> : null}
  </nav>;
}

function BookLibrary() {
  return <main className="hosted-builder-page" id="main-content">
    <header className="hosted-builder-title"><div><span>Hamilton House</span><h1>Book Builder</h1><p>Choose a publisher title to inspect its authoring components.</p></div><strong>Book Library</strong></header>
    <section className="hosted-builder-book-grid" aria-label="Available books">
      {hostedBuilderCatalog.map((book) => <article className="hosted-builder-book-card" key={book.slug}>
        {book.cover ? <img src={book.cover} alt={`${book.title} cover`} /> : <div className="hosted-builder-cover-placeholder" role="img" aria-label={`${book.title} cover not supplied`}><span>{book.level}</span></div>}
        <div><span className="hosted-builder-status">{book.status}</span><h2>{book.title}</h2><p>Level {book.level}</p><a className="hosted-builder-action" href={hostedBuilderHash({ bookSlug: book.slug })}>Open book</a></div>
      </article>)}
    </section>
  </main>;
}

function ComponentSelection({ book }) {
  return <main className="hosted-builder-page" id="main-content">
    <Breadcrumbs book={book} />
    <header className="hosted-builder-book-heading">{book.cover ? <img src={book.cover} alt="" /> : <div className="hosted-builder-cover-placeholder" aria-hidden="true"><span>{book.level}</span></div>}<div><span>Level {book.level}</span><h1>{book.title}</h1><p>Select a component. Components without a registered adapter remain visible for future authoring setup.</p></div></header>
    <section className="hosted-builder-component-grid" aria-label={`${book.title} components`}>
      {book.components.map((component) => {
        const available = Boolean(resolveHostedBuilderAdapter(book, component));
        return <article className="hosted-builder-component-card" data-available={available || undefined} key={component.slug}>
          {component.cover ? <img src={component.cover} alt="" /> : <div className="hosted-builder-cover-placeholder" aria-hidden="true"><span>{book.level}</span></div>}
          <div><span>{component.type.replaceAll("_", " ")}</span><h2>{component.title}</h2><p>{component.status}</p>{available
            ? <a className="hosted-builder-action" href={hostedBuilderHash({ bookSlug: book.slug, componentSlug: component.slug })}>Open workspace</a>
            : <span className="hosted-builder-unavailable">Authoring adapter pending</span>}</div>
        </article>;
      })}
    </section>
  </main>;
}

function UnavailableComponent({ book, component }) {
  return <main className="hosted-builder-page" id="main-content">
    <Breadcrumbs book={book} component={component} />
    <section className="hosted-builder-notice"><span>Component registered</span><h1>{component.title}</h1><p>{component.status}. No hosted authoring adapter is connected in this read-only milestone.</p><a className="hosted-builder-action" href={hostedBuilderHash({ bookSlug: book.slug })}>Back to {book.title} components</a></section>
  </main>;
}

function Workspace({ book, component, tool }) {
  const adapter = resolveHostedBuilderAdapter(book, component);
  if (!adapter) return <UnavailableComponent book={book} component={component} />;
  if (!resolveHostedBuilderTool(adapter, tool)) return <NotFound />;
  const WorkspaceComponent = adapter.Workspace;
  const tools = [
    { id: "pages", label: "Pages", description: "Manage component pages", capability: "pages", Icon: FileImage },
    { id: "hotspots", label: "Hotspot Builder", description: "Place interactive targets", capability: "hotspots", Icon: MapPinned },
    { id: "activities", label: "Activity Builder", description: "Author learning activities", capability: "activities", Icon: Boxes },
    { id: "ui", label: "UI Controller", description: "Tune teacher controls", capability: "uiController", Icon: PanelsTopLeft },
    { id: "publication", label: "Publication", description: "Review release readiness", capability: "publication", Icon: Rocket },
  ];
  return <main className="hosted-builder-workspace" id="main-content">
    <div className="hosted-builder-workspace-chrome">
      <Breadcrumbs book={book} component={component} tool={tool} />
      <nav className="hosted-builder-tool-tabs" aria-label={`${component.title} tools`}>
        {tools.filter(({ capability }) => adapter.capabilities[capability]?.readable).map(({ id, label, description, capability, Icon }) => <a key={id} aria-current={tool === id ? "page" : undefined} href={hostedBuilderHash({ bookSlug: book.slug, componentSlug: component.slug, tool: id })}><Icon aria-hidden="true" /><span><strong>{label}</strong><small>{description} · {adapter.capabilities[capability].writable ? "Editable" : "Read-only"}</small></span></a>)}
      </nav>
    </div>
    <Suspense fallback={<p className="hosted-builder-loading" role="status">Loading component workspace…</p>}>
      <HostedBuilderRouteTransition routeKey={`${book.slug}/${component.slug}/${tool}`}><WorkspaceComponent tool={tool} capabilities={adapter.capabilities} nativeActivities={adapter.nativeActivities || null} bookSlug={book.slug} componentSlug={component.slug} /></HostedBuilderRouteTransition>
    </Suspense>
  </main>;
}

function NotFound() {
  return <main className="hosted-builder-page" id="main-content"><section className="hosted-builder-notice"><span>Route unavailable</span><h1>Builder location not found</h1><p>The requested book, component, or tool is not registered.</p><a className="hosted-builder-action" href={hostedBuilderHash()}>Return to Book Library</a></section></main>;
}

export function HostedBookBuilderApp() {
  const route = useHostedBuilderRoute();
  if (route.kind === "library") return <HostedBuilderRouteTransition routeKey="library"><BookLibrary /></HostedBuilderRouteTransition>;
  if (route.kind === "not-found") return <HostedBuilderRouteTransition routeKey="not-found"><NotFound /></HostedBuilderRouteTransition>;
  const book = findHostedBuilderBook(route.bookSlug);
  if (!book) return <NotFound />;
  if (route.kind === "book") return <HostedBuilderRouteTransition routeKey={`book/${book.slug}`}><ComponentSelection book={book} /></HostedBuilderRouteTransition>;
  const component = findHostedBuilderComponent(book, route.componentSlug);
  if (!component) return <NotFound />;
  if (route.kind === "review") {
    if (!resolveHostedBuilderAdapter(book, component)) return <UnavailableComponent book={book} component={component} />;
    return <HostedBuilderReviewPage book={book} component={component} intent={route.intent} />;
  }
  return <Workspace book={book} component={component} tool={route.tool} />;
}

export default HostedBookBuilderApp;
