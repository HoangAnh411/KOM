import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { ClientErrorBoundary } from "./ClientErrorBoundary.js";
import { installGlobalDiagnosticCapture } from "./diagnostics.js";
import "./styles.css";

installGlobalDiagnosticCapture(window);

createRoot(document.getElementById("root")!).render(
  <StrictMode><ClientErrorBoundary><App /></ClientErrorBoundary></StrictMode>,
);
