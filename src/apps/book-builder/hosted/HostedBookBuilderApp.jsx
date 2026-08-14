import { Suspense, useEffect, useState } from "react";

import {
  findHostedBuilderBook,
  findHostedBuilderComponent,
  hostedBuilderCatalog,
} from "./hostedBuilderCatalog.js";
import { resolveHostedBuilderAdapter } from "./hostedBuilderAdapters.jsx";
import { resolveHostedBuilderTool } from "./hostedBuilderCapabilities.js";
import { hostedBuilderHash, parseHostedBuilderHash } from "./hostedBuilderRouter.js";
import "./hostedBuilder.css";

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
  const toolLabels = { hotspots: "Hotspot Builder", activities: "Activity Builder", ui: "UI Controller", publication: "Publication" };
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
    { id: "hotspots", label: "Hotspot Builder", capability: "hotspots" },
    { id: "activities", label: "Activity Builder", capability: "activities" },
    { id: "ui", label: "UI Controller", capability: "uiController" },
    { id: "publication", label: "Publication", capability: "publication" },
  ];
  return <main className="hosted-builder-workspace" id="main-content">
    <div className="hosted-builder-workspace-chrome">
      <Breadcrumbs book={book} component={component} tool={tool} />
      <nav className="hosted-builder-tool-tabs" aria-label={`${component.title} tools`}>
        {tools.filter(({ capability }) => adapter.capabilities[capability]?.readable).map(({ id, label, capability }) => <a key={id} aria-current={tool === id ? "page" : undefined} href={hostedBuilderHash({ bookSlug: book.slug, componentSlug: component.slug, tool: id })}><span>{label}</span><small>{adapter.capabilities[capability].writable ? "Editable" : "Read-only"}</small></a>)}
      </nav>
    </div>
    <Suspense fallback={<p className="hosted-builder-loading" role="status">Loading component workspace…</p>}>
      <WorkspaceComponent tool={tool} capabilities={adapter.capabilities} />
    </Suspense>
  </main>;
}

function NotFound() {
  return <main className="hosted-builder-page" id="main-content"><section className="hosted-builder-notice"><span>Route unavailable</span><h1>Builder location not found</h1><p>The requested book, component, or tool is not registered.</p><a className="hosted-builder-action" href={hostedBuilderHash()}>Return to Book Library</a></section></main>;
}

export function HostedBookBuilderApp() {
  const route = useHostedBuilderRoute();
  if (route.kind === "library") return <BookLibrary />;
  if (route.kind === "not-found") return <NotFound />;
  const book = findHostedBuilderBook(route.bookSlug);
  if (!book) return <NotFound />;
  if (route.kind === "book") return <ComponentSelection book={book} />;
  const component = findHostedBuilderComponent(book, route.componentSlug);
  if (!component) return <NotFound />;
  return <Workspace book={book} component={component} tool={route.tool} />;
}

export default HostedBookBuilderApp;
