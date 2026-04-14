import React from "react";
import ReactDOM from "react-dom/client";

import { ThemeProvider } from "@/lib/theme";
import { AdminPage } from "@/pages/admin-page";
import "@/styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AdminPage />
    </ThemeProvider>
  </React.StrictMode>,
);