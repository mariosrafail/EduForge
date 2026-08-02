import React from "react";
import { createRoot } from "react-dom/client";
import { UltimateB2HotspotBuilder } from "./UltimateB2HotspotBuilder.jsx";
import "./ultimateB2HotspotBuilder.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <UltimateB2HotspotBuilder />
  </React.StrictMode>,
);
