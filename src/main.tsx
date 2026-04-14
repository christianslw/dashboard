import React from "react";
import ReactDOM from "react-dom/client";

import { DashboardPage } from "@/pages/dashboard-page";
import { ThemeProvider } from "@/lib/theme";
import "@/styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <DashboardPage />
    </ThemeProvider>
  </React.StrictMode>,
);