'use client';
// apps/web-landing/src/app/app/configuracoes/OpenFinanceConnect.tsx
import { useEffect, useState } from 'react';
import { PluggyConnect } from 'react-pluggy-connect';
import { api, ApiError } from '@/lib/api';
import { Alert, Button, Box, Typography, CircularProgress } from '@mui/material';

interface ConnectTokenResponse {
  accessToken: string;
}

export function OpenFinanceConnect() {
  const [connectToken, setConnectToken] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'connected' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [institutions, setInstitutions] = useState<Array<{ id: string; name: string; logo: string }>>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);

  useEffect(() => {
    loadConnectToken();
    loadInstitutions();
  }, []);

  async function loadConnectToken() {
    setStatus('loading');
    try {
      const res = await api<ConnectTokenResponse>('/api/pluggy/connect-token');
      setConnectToken(res.accessToken);
      setStatus('connected');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao obter token Pluggy');
    }
  }

  async function loadInstitutions() {
    try {
      const apiKey = await fetchPluggyApiKey();
      const res = await fetch('https://api.pluggy.ai/institutions', {
        headers: { 'X-API-KEY': apiKey },
      });
      if (res.ok) {
        const { results } = await res.json();
        setInstitutions(results.map((i: any) => ({ id: i.id, name: i.name, logo: i.logo })));
      }
    } catch (e) {
      console.error('Failed to load institutions:', e);
    } finally {
      setLoadingInstitutions(false);
    }
  }

  async function fetchPluggyApiKey(): Promise<string> {
    const res = await fetch('/api/pluggy/api-key');
    if (!res.ok) throw new Error('Failed to fetch Pluggy API key');
    const { apiKey } = await res.json();
    return apiKey;
  }

  const handleSuccess = (itemData: any) => {
    console.log('Pluggy connected:', itemData);
    // O webhook já trata a sincronização
    // Aqui só atualizamos UI
    setStatus('connected');
  };

  const handleError = (error: any) => {
    console.error('Pluggy connection error:', error);
    setErrorMsg(error?.message ?? 'Erro na conexão');
    setStatus('error');
  };

  const handleExit = () => {
    // Usuário fechou o widget sem conectar
    console.log('Pluggy widget closed');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>Open Finance (Pluggy)</Typography>
      <Typography variant="body2" color="text.secondary">
        Conecte suas contas bancárias e investimentos para conciliação automática.
      </Typography>

      {status === 'error' && (
        <Alert severity="error" onClose={() => setStatus('idle')}>
          {errorMsg}
        </Alert>
      )}

      {status === 'connected' && (
        <Alert severity="success">
          Token de conexão obtido. Abra o widget abaixo para conectar suas contas.
        </Alert>
      )}

      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={true}
          onSuccess={handleSuccess}
          onError={handleError}
        />
      )}

      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Instituições suportadas
        </Typography>
        {loadingInstitutions ? (
          <CircularProgress size={20} />
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
            {institutions.slice(0, 20).map((inst) => (
              <Box
                key={inst.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  minWidth: 180,
                }}
              >
                <img src={inst.logo} alt={inst.name} style={{ width: 24, height: 24 }} />
                <Typography variant="body2" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                  {inst.name}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

interface ConnectTokenResponse {
  accessToken: string;
}