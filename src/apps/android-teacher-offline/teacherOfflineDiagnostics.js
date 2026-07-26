let lastNavigationAt = 0;

export function installTeacherOfflineDiagnostics() {
  if (!import.meta.env.DEV || globalThis.__teacherOfflineDiagnosticsInstalled) return;
  globalThis.__teacherOfflineDiagnosticsInstalled = true;
  lastNavigationAt = performance.now();
  console.debug("[teacher-offline] development performance diagnostics enabled");

  if ("PerformanceObserver" in globalThis) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          console.debug("[teacher-offline] long task", {
            durationMs: Math.round(entry.duration),
            startedAtMs: Math.round(entry.startTime),
          });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      globalThis.__teacherOfflineLongTaskObserver = observer;
    } catch {
      // Older WebViews may not expose the long-task entry type.
    }
  }
}

export function recordTeacherOfflineNavigation(view) {
  if (!import.meta.env.DEV) return;
  const now = performance.now();
  console.debug("[teacher-offline] navigation", {
    view,
    elapsedSincePreviousViewMs: Math.round(now - lastNavigationAt),
    heapMiB: performance.memory?.usedJSHeapSize
      ? Number((performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1))
      : null,
  });
  lastNavigationAt = now;
}
