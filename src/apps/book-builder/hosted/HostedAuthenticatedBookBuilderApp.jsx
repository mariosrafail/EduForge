import { lazy, Suspense } from "react";

import { BuilderAuthGate } from "../BuilderAuthGate.jsx";

const HostedBookBuilderApp = lazy(() => import("./HostedBookBuilderApp.jsx"));

export function HostedAuthenticatedBookBuilderApp() {
  return <BuilderAuthGate>
    <Suspense fallback={<main className="builder-auth-page"><p role="status">Loading Book Builder…</p></main>}>
      <HostedBookBuilderApp />
    </Suspense>
  </BuilderAuthGate>;
}

export default HostedAuthenticatedBookBuilderApp;
