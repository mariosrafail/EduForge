import { useEffect, useId } from "react";

const EXCLUSIVE_MEDIA_EVENT = "ultimate-b2:exclusive-media-play";

export function useExclusiveMediaPlayback(mediaRef) {
  const mediaId = useId();

  useEffect(() => {
    const pauseOtherMedia = (event) => {
      if (event.detail?.mediaId !== mediaId) mediaRef.current?.pause();
    };
    const pauseWhenHidden = () => {
      if (document.hidden) mediaRef.current?.pause();
    };
    document.addEventListener(EXCLUSIVE_MEDIA_EVENT, pauseOtherMedia);
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      document.removeEventListener(EXCLUSIVE_MEDIA_EVENT, pauseOtherMedia);
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      mediaRef.current?.pause();
    };
  }, [mediaId, mediaRef]);

  return () => {
    document.dispatchEvent(new CustomEvent(EXCLUSIVE_MEDIA_EVENT, { detail: { mediaId } }));
  };
}
