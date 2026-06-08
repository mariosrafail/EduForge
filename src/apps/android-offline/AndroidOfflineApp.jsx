import { useEffect, useState } from "react";
import AndroidBookList from "./AndroidBookList.jsx";
import AndroidBookViewer from "./AndroidBookViewer.jsx";
import { androidBooks, getAndroidBook } from "./androidBooks.js";
import { getAndroidOfflineProgress, setLastSelectedBook } from "./androidOfflineStorage.js";
import "./androidOffline.css";

export default function AndroidOfflineApp() {
  const [progress, setProgress] = useState(() => getAndroidOfflineProgress());
  const [selectedBookSlug, setSelectedBookSlug] = useState("");
  const [viewerLocation, setViewerLocation] = useState(null);
  const [activeActivityKey, setActiveActivityKey] = useState(null);
  const selectedBook = selectedBookSlug ? getAndroidBook(selectedBookSlug) : null;

  useEffect(() => {
    window.history.replaceState({ androidOffline: true, view: "library" }, "", window.location.pathname);

    const handlePopState = (event) => {
      const state = event.state;
      if (!state?.androidOffline || state.view === "library") {
        setSelectedBookSlug("");
        setViewerLocation(null);
        setActiveActivityKey(null);
        setProgress(getAndroidOfflineProgress());
        return;
      }

      setSelectedBookSlug(state.bookSlug || "");
      setViewerLocation(state.location || null);
      setActiveActivityKey(state.activityKey || null);
      setProgress(getAndroidOfflineProgress());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const openBook = (bookSlug) => {
    setSelectedBookSlug(bookSlug);
    setViewerLocation(null);
    setActiveActivityKey(null);
    setProgress(setLastSelectedBook(bookSlug));
    window.history.pushState({ androidOffline: true, view: "book", bookSlug, location: null }, "", `#book/${bookSlug}`);
  };

  const backToLibrary = () => {
    setSelectedBookSlug("");
    setViewerLocation(null);
    setActiveActivityKey(null);
    setProgress(getAndroidOfflineProgress());
    window.history.pushState({ androidOffline: true, view: "library" }, "", window.location.pathname);
  };

  const updateViewerLocation = (location) => {
    setViewerLocation(location);
    setActiveActivityKey(null);
    window.history.pushState(
      { androidOffline: true, view: "book", bookSlug: selectedBookSlug, location },
      "",
      `#book/${selectedBookSlug}`,
    );
  };

  const openActivity = (activityKey, location) => {
    setViewerLocation(location);
    setActiveActivityKey(activityKey);
    window.history.pushState(
      { androidOffline: true, view: "activity", bookSlug: selectedBookSlug, location, activityKey },
      "",
      `#book/${selectedBookSlug}/activity/${activityKey}`,
    );
  };

  return (
    <main className="android-offline-app">
      {selectedBook ? (
        <AndroidBookViewer
          key={selectedBook.slug}
          book={selectedBook}
          initialLocation={viewerLocation}
          initialActivityKey={activeActivityKey}
          onBackToLibrary={backToLibrary}
          onLocationChange={updateViewerLocation}
          onOpenActivity={openActivity}
        />
      ) : (
        <AndroidBookList books={androidBooks} progress={progress} onOpenBook={openBook} />
      )}
    </main>
  );
}
