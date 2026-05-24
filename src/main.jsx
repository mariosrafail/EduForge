import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { SoundProvider } from "./context/SoundContext.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <SoundProvider>
    <App />
  </SoundProvider>,
);
