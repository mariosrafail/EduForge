import { BookOpen, ChevronRight, Library } from "lucide-react";

export default function AndroidBookList({ books, progress, onOpenBook }) {
  if (!books.length) {
    return (
      <section className="android-offline-empty">
        <Library size={44} />
        <h1>No offline books are bundled.</h1>
        <p>Add a local book package in `src/apps/android-offline/androidBooks.js`.</p>
      </section>
    );
  }

  return (
    <section className="android-book-list-screen" aria-label="Offline book library">
      <header className="android-library-header">
        <div>
          <span className="android-eyebrow">Offline Library</span>
          <h1>Interactive Books</h1>
        </div>
        <p>Local classroom books available on this device.</p>
      </header>

      <div className="android-book-grid">
        {books.map((book) => {
          const componentLabels = (book.components || []).map((component) => component.type || component.title).filter(Boolean);
          const isLastBook = progress.lastSelectedBookSlug === book.slug;

          return (
            <article key={book.slug || book.id} className="android-book-card">
              <button type="button" onClick={() => onOpenBook(book.slug)} aria-label={`Open ${book.packageTitle}`}>
                <span className="android-book-cover">
                  {book.components?.[0]?.coverAsset ? <img src={book.components[0].coverAsset} alt="" /> : <BookOpen size={54} />}
                </span>
                <span className="android-book-copy">
                  <span className="android-book-meta">
                    {book.level && <span>{book.level}</span>}
                    {isLastBook && <span>Recent</span>}
                  </span>
                  <strong>{book.packageTitle}</strong>
                  <small>{book.shortDescription}</small>
                  <span className="android-component-chips">
                    {componentLabels.map((label) => <span key={label}>{label}</span>)}
                  </span>
                </span>
                <span className="android-open-book">
                  Open <ChevronRight size={22} />
                </span>
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
