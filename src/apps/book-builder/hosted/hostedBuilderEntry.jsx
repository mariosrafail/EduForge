import React from "react";
import { createRoot } from "react-dom/client";

import HostedAuthenticatedBookBuilderApp from "./HostedAuthenticatedBookBuilderApp.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HostedAuthenticatedBookBuilderApp />
  </React.StrictMode>,
);
