const trackedMediaPaths = new Set([
  "/src/assets/books/ultimate-b2/media/unit_2_reading_video.mp4",
  "/src/assets/books/ultimate-b2/media/unit_2_reading_on_a_fast_track.mp3",
]);

export function isProtectedUnit2SourcePath(url = "") {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  } catch {
    return false;
  }
  return trackedMediaPaths.has(pathname)
    || pathname.startsWith("/Ultimate English B2.app/Contents/Resources/assets/");
}

export function unit2ProtectedMediaPlugin({ androidOffline = false } = {}) {
  if (androidOffline) return null;
  return {
    name: "hhplms-unit2-protected-media",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!isProtectedUnit2SourcePath(request.url || "")) return next();
        response.statusCode = 404;
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end("Not found");
      });
    },
  };
}
