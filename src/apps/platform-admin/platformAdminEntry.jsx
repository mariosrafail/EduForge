import React from "react";
import { createRoot } from "react-dom/client";
import PlatformAdminApp from "./PlatformAdminApp.jsx";
import "./platformAdmin.css";

document.documentElement.dataset.appMode = "platform-admin";
createRoot(document.getElementById("platform-admin-root")).render(<PlatformAdminApp />);
