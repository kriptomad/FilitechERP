// src/shared/hooks/use-active-modules.ts — Cap. 8.1
import { useQuery } from "@tanstack/react-query";
import { apiFetch, getToken, UnauthorizedError } from "../auth/session";

interface ActiveModulesResponse {
  success: boolean;
  data:
    | {
        userId: string;
        tenantId: string;
        role: string;
        activeModules: string[];
      }
    | null;
}

export function useActiveModules() {
  const hasToken = getToken() !== null;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["active-modules"],
    enabled: hasToken, // sem token nem consulta — vai direto para o login
    queryFn: async (): Promise<string[]> => {
      const res = await apiFetch("/api/auth/me");
      const json: ActiveModulesResponse = await res.json();
      return json.data?.activeModules ?? [];
    },
    staleTime: 5 * 60 * 1000, // TTL 5min — invalidado pelo webhook de billing
    retry: false,
  });

  const modules = data ?? [];
  return {
    modules,
    hasModule: (code: string) => modules.includes(code),
    // Carregando = query habilitada e ainda sem resposta.
    isLoading: hasToken && isLoading,
    // Sem token, ou a API respondeu 401 (apiFetch já limpou e redireciona).
    isUnauthenticated: !hasToken,
    refresh: refetch,
  };
}

export { UnauthorizedError };
