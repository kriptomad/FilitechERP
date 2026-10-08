// src/app/providers/theme.provider.tsx — Cap. 8.1 (MUI v5 dark premium)
import { ReactNode } from "react";
import { createTheme, ThemeProvider, CssBaseline } from "@mui/material";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#6366F1" },
    background: { default: "#05060A", paper: "#101114" },
    success: { main: "#10B981" },
    warning: { main: "#F59E0B" },
    error: { main: "#F43F5E" },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: { fontWeight: 700 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { border: "1px solid rgba(39,39,42,0.6)" },
      },
    },
  },
});

export function ThemeAppProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
