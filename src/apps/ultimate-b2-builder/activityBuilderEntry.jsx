import React from "react";
import { createRoot } from "react-dom/client";
import { UltimateB2BuilderApp } from "virtual:ultimate-b2-builder-app";
import { BuilderAuthGate } from "../book-builder/BuilderAuthGate.jsx";
import "./ultimateB2HotspotBuilder.css";
import "./ultimateB2ListeningBuilder.css";
import "./ultimateB2MultipleChoiceBuilder.css";
import "./ultimateB2ActivityBuilder.css";
import "./ultimateB2TeacherAppBuilder.css";
import "../android-teacher-offline/teacherOfflineLauncher.css";
import "../android-teacher-offline/legacyTeacherToolbar.css";
import "../android-teacher-offline/classroomTools.css";
import "../android-teacher-project/teacherProjectRoot.css";
import "../../styles/ultimate-b2-recovered-activities.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BuilderAuthGate><UltimateB2BuilderApp /></BuilderAuthGate>
  </React.StrictMode>,
);
