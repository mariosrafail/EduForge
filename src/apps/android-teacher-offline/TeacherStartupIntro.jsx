import { useCallback, useRef, useState } from "react";

import startupIntro from "../../assets/books/ultimate-b2/teacher-offline-media/ultimate-b2-startup-intro.mp4";

export default function TeacherStartupIntro({ onFinish }) {
  const finishedRef = useRef(false);
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  const finish = useCallback((reason) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish(reason);
  }, [onFinish]);

  const startPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setPlaybackBlocked(false);
    } catch {
      setPlaybackBlocked(true);
    }
  }, []);

  return (
    <section
      className="teacher-startup-intro"
      data-intro-ready={ready ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-label="Ultimate B2 opening"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        preload="auto"
        src={startupIntro}
        aria-label="Ultimate B2 opening animation"
        onCanPlay={startPlayback}
        onLoadedData={() => setReady(true)}
        onEnded={() => finish("ended")}
        onError={() => finish("error")}
      />
      {!ready && <p className="teacher-startup-intro-loading" role="status">Opening Ultimate B2…</p>}
      {playbackBlocked && (
        <button type="button" className="teacher-startup-intro-play" onClick={startPlayback}>
          Play intro
        </button>
      )}
      <button type="button" className="teacher-startup-intro-skip" onClick={() => finish("skipped")}>
        Skip intro
      </button>
    </section>
  );
}
