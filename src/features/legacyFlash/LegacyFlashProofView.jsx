import { useEffect, useRef, useState } from "react";

const manifestUrl = "/.netlify/functions/legacy-flash-proof";

function elapsed(startedAt) {
  return `${Math.round(performance.now() - startedAt)} ms`;
}

export function installRuffleRuntime() {
  if (window.RufflePlayer?.newest) return Promise.resolve(window.RufflePlayer);
  window.RufflePlayer = window.RufflePlayer || {};
  window.RufflePlayer.config = {
    allowNetworking: "internal",
    allowScriptAccess: false,
    autoplay: "on",
    logLevel: "debug",
    openUrlMode: "deny",
    playerRuntime: "air",
    polyfills: false,
    publicPath: "/__legacy-ruffle/",
    unmuteOverlay: "visible",
    warnOnUnsupportedContent: true,
  };
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/__legacy-ruffle/ruffle.js";
    script.async = true;
    script.dataset.legacyRuffleRuntime = "0.4.0";
    script.onload = () => window.RufflePlayer?.newest ? resolve(window.RufflePlayer) : reject(new Error("Ruffle registered no player API"));
    script.onerror = () => reject(new Error("The self-hosted Ruffle runtime failed to load"));
    document.head.appendChild(script);
  });
}

export default function LegacyFlashProofView({ currentUser, authLoading, navigateTo }) {
  const playerHostRef = useRef(null);
  const [status, setStatus] = useState("Waiting for authenticated entitlement check");
  const [diagnostics, setDiagnostics] = useState([]);
  const [fatalError, setFatalError] = useState("");

  useEffect(() => {
    if (authLoading || !currentUser) return undefined;
    const startedAt = performance.now();
    let cancelled = false;
    const record = (message) => setDiagnostics((items) => [...items, { at: elapsed(startedAt), message }]);
    const onWindowError = (event) => record(`window error: ${event.message || "unknown error"}`);
    const onUnhandledRejection = (event) => record(`unhandled rejection: ${String(event.reason?.message || event.reason || "unknown")}`);
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    (async () => {
      try {
        setStatus("Checking session and Ultimate B2 entitlement");
        const response = await fetch(manifestUrl, { credentials: "same-origin", headers: { Accept: "application/json" } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `Entitlement gateway returned ${response.status}`);
        if (cancelled) return;
        record(`entitlement manifest granted (${body.tokenExpiresInSeconds}s scoped source token)`);
        setStatus("Loading official self-hosted Ruffle 0.4.0");
        await installRuffleRuntime();
        if (cancelled) return;
        record("Ruffle JavaScript runtime registered");
        const player = window.RufflePlayer.newest().createPlayer();
        player.style.width = "100%";
        player.style.height = "min(72vh, 820px)";
        player.addEventListener("loadedmetadata", () => record("SWF metadata loaded"));
        player.addEventListener("error", (event) => record(`player error: ${event.detail || event.message || "unknown"}`));
        playerHostRef.current.replaceChildren(player);
        setStatus("Loading AIR-targeted UltimateB2.swf");
        await player.ruffle().load({
          allowScriptAccess: false,
          base: body.sourceBaseUrl,
          url: body.mainSwfUrl,
        });
        if (cancelled) return;
        record("Ruffle load() resolved; inspect the frame, menu, network requests, and console diagnostics");
        setStatus("Runtime loaded — compatibility remains experimental");
      } catch (error) {
        if (cancelled) return;
        const message = String(error?.message || error);
        record(`fatal: ${message}`);
        setFatalError(message);
        setStatus("Compatibility proof stopped");
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      playerHostRef.current?.replaceChildren();
    };
  }, [authLoading, currentUser]);

  if (authLoading) return <main className="route-fallback-screen"><p>Checking current session…</p></main>;
  if (!currentUser) {
    return (
      <main className="route-fallback-screen">
        <section className="route-fallback-card">
          <span className="eyebrow">Local development proof</span>
          <h1>Sign in before loading publisher source.</h1>
          <p>The server also requires an active Ultimate B2 entitlement.</p>
          <button className="primary-action" type="button" onClick={() => navigateTo("auth-student")}>Student sign in</button>
        </section>
      </main>
    );
  }

  return (
    <main style={{ padding: "1rem", display: "grid", gap: "1rem" }} data-testid="legacy-flash-proof">
      <section className="panel-card" style={{ padding: "1rem" }}>
        <span className="eyebrow">Experimental · localhost only · Ruffle 0.4.0</span>
        <h1>Ultimate English B2 legacy AIR compatibility proof</h1>
        <p>This isolated diagnostic does not replace the React reader and cannot write LMS scores or progress.</p>
        <p><strong>Status:</strong> {status}</p>
        {fatalError && <p role="alert" style={{ color: "#a62b1f" }}>{fatalError}</p>}
      </section>
      <section ref={playerHostRef} style={{ minHeight: "420px", background: "#111", borderRadius: "12px", overflow: "hidden" }} aria-label="Ruffle compatibility player" />
      <section className="panel-card" style={{ padding: "1rem" }}>
        <h2>Runtime diagnostics</h2>
        {diagnostics.length === 0 ? <p>No runtime events yet.</p> : (
          <ol>{diagnostics.map((item, index) => <li key={`${item.at}-${index}`}><code>{item.at}</code> {item.message}</li>)}</ol>
        )}
      </section>
    </main>
  );
}
