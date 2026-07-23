import { BookOpen, MonitorPlay } from "lucide-react";
import studentsBookCover from "../../assets/books/ultimate-b2/covers/ultimate_b2_students_book.jpg";

export default function TeacherOfflineLibrary({ pack, onOpenBook }) {
  const manifest = pack.manifest;
  return (
    <main className="teacher-offline-library">
      <header>
        <div>
          <span className="teacher-offline-eyebrow"><MonitorPlay size={18} /> Teacher presentation · Offline</span>
          <h1>Hamilton House Interactive Classroom</h1>
        </div>
        <strong>No internet required</strong>
      </header>
      <section className="teacher-offline-library-grid" aria-label="Installed classroom books">
        <article className="teacher-offline-book-card">
          <img src={studentsBookCover} alt="Ultimate B2 Students Book cover" decoding="async" />
          <div>
            <span className="teacher-offline-eyebrow">Installed classroom content</span>
            <h2>{manifest.bookTitle}</h2>
            <p>Units 1 and 2 · pages, media, interactive activities, and verified teacher solutions.</p>
            <ul>
              <li>{manifest.enabledActivityCount} enabled activities</li>
              <li>{manifest.pageCount} page spreads</li>
              <li>Pack {manifest.contentVersion}</li>
            </ul>
            <button type="button" className="teacher-primary-button" onClick={onOpenBook}>
              <BookOpen size={24} /> Open Students Book
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}
