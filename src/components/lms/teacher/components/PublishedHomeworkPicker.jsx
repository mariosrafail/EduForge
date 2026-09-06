import { useEffect, useState } from "react";
import { listPublishedBooks, publishedTargetKey } from "../../../../services/publishedBooksApi.js";
import { PublishedBookSurface } from "../../books/PublishedBookSurface.jsx";

export function publishedHomeworkOption(hotspot, book, page) {
  const id = publishedTargetKey(hotspot.target);
  return { id, identity: id, targetKind: "published_native", target: hotspot.target, title: hotspot.title,
    label: `${book.packageTitle} / ${book.componentTitle} / ${page.unitTitle} / ${page.printedLabel} / ${hotspot.title} (${hotspot.type})`,
    packageId: book.packageId, packageSlug: book.bookSlug, packageTitle: book.packageTitle,
    component: book.componentTitle, componentTitle: book.componentTitle, componentSlug: book.componentSlug,
    printedLabel: page.printedLabel, unitTitle: page.unitTitle, assignable: hotspot.assignable };
}

export function PublishedHomeworkPicker({ ownerId, selected = [], onToggle, disabled = false }) {
  const [state, setState] = useState({ books: [], loading: true, error: "" });
  const [component, setComponent] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ books: [], loading: true, error: "" });
    listPublishedBooks({ signal: controller.signal }).then((books) => {
      if (controller.signal.aborted) return;
      setState({ books, loading: false, error: "" });
      setComponent((current) => books.some((book) => book.componentSlug === current) ? current : books[0]?.componentSlug || "");
    }).catch((error) => { if (!controller.signal.aborted) setState({ books: [], loading: false, error: error.message }); });
    return () => controller.abort();
  }, [ownerId, revision]);
  const book = state.books.find((item) => item.componentSlug === component);
  return <section className="published-book-picker" aria-label="Choose exercises from published pages">
    <h3>Choose a book and select its exercises</h3>
    {state.loading ? <p role="status">Loading published books…</p> : null}
    {state.error ? <p role="alert">{state.error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Refresh books</button> Your selected exercises are retained.</p> : null}
    {!state.loading && !state.error && !state.books.length ? <p>No published pages are available. Existing book activities remain in the alternative list.</p> : null}
    {book ? <><label>Book <select value={component} disabled={disabled} onChange={(event) => setComponent(event.target.value)}>{state.books.map((item) => <option key={item.componentSlug} value={item.componentSlug}>{item.packageTitle} · {item.componentTitle}</option>)}</select></label>
      <fieldset disabled={disabled}><PublishedBookSurface key={`${ownerId}:${book.releaseId}`} book={book} mode="picker" selected={selected} onToggle={(hotspot, selectedBook, page) => onToggle?.(publishedHomeworkOption(hotspot, selectedBook, page))} /></fieldset></> : null}
  </section>;
}
