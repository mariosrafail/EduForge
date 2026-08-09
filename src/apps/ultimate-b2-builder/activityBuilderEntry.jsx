import React from "react";
import { createRoot } from "react-dom/client";
import { UltimateB2BuilderApp } from "./UltimateB2BuilderApp.jsx";
import "./ultimateB2HotspotBuilder.css";
import "./ultimateB2ListeningBuilder.css";
import "./ultimateB2MultipleChoiceBuilder.css";
import "./ultimateB2ActivityBuilder.css";
import "../../styles/ultimate-b2-recovered-activities.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <UltimateB2BuilderApp />
  </React.StrictMode>,
);
