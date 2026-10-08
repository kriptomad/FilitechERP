// src/app/providers/query-client.provider.tsx — Cap. 8.1
import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cap. 8.3 — nunca travar a UI esperando rede.
      networkMode: "offlineFirst",
      retry: 2,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
    mutations: { networkMode: "offlineFirst" },
  },
});

export function QueryClientAppProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
