import { useEffect, useState } from "react";
import { listPublishedBooks } from "../../../services/publishedBooksApi.js";
import { StudentInteractiveRuntimeShell } from "../student/runtime/StudentInteractiveRuntimeShell.jsx";
import { PublishedBookSurface } from "./PublishedBookSurface.jsx";

export function PublishedBookInteractive({ bookSlug, componentSlug, currentUser, mode, pageId, pageNumber, onSelectBookPage, onLegacyActivity }) {
  const [state, setState] = useState({ book: null, loading: true, error: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ book: null, loading: true, error: "" });
    listPublishedBooks({ signal: controller.signal }).then((books) => {
      if (controller.signal.aborted) return;
      const book = books.find((item) => item.bookSlug === bookSlug && item.componentSlug === componentSlug);
      setState({ book, loading: false, error: book ? "" : "No published Interactive is available for this book." });
    }).catch((error) => { if (!controller.signal.aborted) setState({ book: null, loading: false, error: error.message }); });
    return () => controller.abort();
  }, [currentUser?.id, bookSlug, componentSlug, revision]);
  if (state.loading) return <p role="status">Loading Interactive…</p>;
  if (state.error) return <div role="alert"><p>{state.error}</p><button type="button" onClick={() => setRevision((value) => value + 1)}>Refresh book</button></div>;
  const book = state.book;
  const page = pageId ? book.pages.find((item) => item.id === pageId) : pageNumber ? book.pages.find((item) => String(item.printedLabel) === String(pageNumber)) : book.pages[0];
  if ((pageId || pageNumber) && !page) return <p role="alert">This page is not available in the published book.</p>;
  const teacherMode = mode === "teacher" && ["teacher", "admin"].includes(currentUser?.role);
  return <StudentInteractiveRuntimeShell title={book.componentTitle} context={[book.packageTitle]} statusLabel={teacherMode ? "Teacher Interactive" : "Practice"} showSubmitAction={false}>
    <PublishedBookSurface key={`${currentUser?.id}:${book.releaseId}`} book={book} teacherMode={teacherMode} initialLocator={page ? { pageId: page.id } : null} externalPageId={page?.id}
      onLegacyActivity={onLegacyActivity} onPageChange={(next) => onSelectBookPage?.(componentSlug, next.unitId, next.id)} />
  </StudentInteractiveRuntimeShell>;
}
