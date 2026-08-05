import React from "react";
import { createRoot } from "react-dom/client";

import { BookBuilderApp } from "./BookBuilderApp.jsx";
import "./styles/reviewStudio.css";

document.documentElement.dataset.appMode = "book-builder-studio";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BookBuilderApp />
  </React.StrictMode>,
);
