import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css"; // Tailwind (Cap. 8.1)
import { AppRoutes } from "./app/routes";
import { QueryClientAppProvider } from "./app/providers/query-client.provider";
import { ThemeAppProvider } from "./app/providers/theme.provider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientAppProvider>
      <ThemeAppProvider>
        <AppRoutes />
      </ThemeAppProvider>
    </QueryClientAppProvider>
  </React.StrictMode>,
);
