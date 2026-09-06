import { useState } from "react";
import { NativeVideoPlayer } from "../../native-video/NativeVideoPlayer.jsx";
import { publishedBookAssetPath } from "../../../services/publishedBooksApi.js";

export function PublishedBookMedia({ book, page }) {
  const [activeId, setActiveId] = useState(null);
  const active = page.media?.find((entry) => entry.id === activeId);
  if (!page.media?.length) return null;
  return <section aria-label="Page audio and video">
    {page.media.map((entry) => <button type="button" key={entry.id} aria-pressed={entry.id === activeId} onClick={() => setActiveId(entry.id)}>{entry.title}</button>)}
    {active ? <div key={active.id}>
      <button type="button" onClick={() => setActiveId(null)}>Close media</button>
      {active.kind === "video"
        ? <NativeVideoPlayer video={active.video} src={publishedBookAssetPath(book, active.asset)} ariaLabel={active.title} />
        : <audio controls preload="none" src={publishedBookAssetPath(book, active.asset)} aria-label={active.title} />}
    </div> : null}
  </section>;
}
