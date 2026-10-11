'use client';

import { useEffect, useState } from 'react';
import { Box, Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem, Alert, CircularProgress, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';;;;
import { Refresh, PlayArrow, Visibility } from '@mui/icons-material';
import { apiAdmin, ApiError } from '../../api/apiAdmin';

interface IntegrationCredential {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  provider: string;
  environment: string;
  active: boolean;
  lastTestedAt: string | null;
  lastTestSuccess: boolean | null;
  lastTestMessage: string | null;
}

interface CredentialsResponse {
  credentials: IntegrationCredential[];
}

interface TestResult {
  success: boolean;
  httpStatus?: number;
  message: string;
  latencyMs: number;
}

export function IntegrationsPage() {
  const [creds, setCreds] = useState<IntegrationCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testDialog, setTestDialog] = useState<{ open: boolean; cred: IntegrationCredential | null; result: TestResult | null }>({ open: false, cred: null, result: null });
  const [filterProvider, setFilterProvider] = useState('');
  const [filterTenant, setFilterTenant] = useState('');
  const [filterEnv, setFilterEnv] = useState('');

  const fetchCreds = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        ...(filterProvider && { provider: filterProvider }),
        ...(filterTenant && { tenantId: filterTenant }),
        ...(filterEnv && { environment: filterEnv }),
      });
      const data = await apiAdmin<CredentialsResponse>(`/platform-admin/integrations?${params}`);
      setCreds(data.credentials);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar integrações');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCreds(); }, [filterProvider, filterTenant, filterEnv]);

  const openTest = (cred: IntegrationCredential) => {
    setTestDialog({ open: true, cred, result: null });
  };

  const runTest = async () => {
    if (!testDialog.cred) return;
    setTestDialog(prev => ({ ...prev, result: null }));
    try {
      const result = await apiAdmin<TestResult>(`/platform-admin/integrations/${testDialog.cred.id}/test`, {
        method: 'POST',
      });
      setTestDialog(prev => ({ ...prev, result }));
    } catch (err: any) {
      setTestDialog(prev => ({
        ...prev,
        result: { success: false, message: err instanceof ApiError ? err.message : 'Falha no teste', latencyMs: 0 },
      }));
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" fontWeight={700}>Integrações & Credenciais</Typography>
        <Button variant="outlined" startIcon={<Refresh />} onClick={fetchCreds} disabled={loading}>Atualizar</Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Provedor</InputLabel>
          <Select value={filterProvider} label="Provedor" onChange={(e) => setFilterProvider(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="WHATSAPP_META_CLOUD">WhatsApp</MenuItem>
            <MenuItem value="FISCAL_FOCUS_NFE">Focus NFe</MenuItem>
            <MenuItem value="BILLING_ASAAS">Asaas</MenuItem>
            <MenuItem value="BILLING_STRIPE">Stripe</MenuItem>
            <MenuItem value="STORAGE_CLOUDFLARE_R2">R2</MenuItem>
            <MenuItem value="EMAIL_RESEND">Resend</MenuItem>
            <MenuItem value="SMS_ZENVIA">Zenvia</MenuItem>
            <MenuItem value="TEF_CLISITEF">TEF</MenuItem>
            <MenuItem value="VEHICLE_DATA_FIPE_PLACA">Placa Fipe</MenuItem>
            <MenuItem value="BANK_OPEN_FINANCE_PLUGGY">Pluggy</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Ambiente</InputLabel>
          <Select value={filterEnv} label="Ambiente" onChange={(e) => setFilterEnv(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="PRODUCTION">Produção</MenuItem>
            <MenuItem value="SANDBOX">Sandbox</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Provedor</TableCell>
                <TableCell>Ambiente</TableCell>
                <TableCell>Tenant</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Último Teste</TableCell>
                <TableCell>Resultado</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {creds.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell><Chip label={c.provider} size="small" variant="outlined" /></TableCell>
                  <TableCell><Chip label={c.environment} size="small" variant="outlined" color={c.environment === 'PRODUCTION' ? 'default' : 'info'} /></TableCell>
                  <TableCell>{c.tenantName ? <Code>{c.tenantName}</Code> : <Typography variant="body2" color="primary" fontWeight={600}>PLATAFORMA</Typography>}</TableCell>
                  <TableCell><Chip label={c.active ? 'Ativo' : 'Inativo'} size="small" color={c.active ? 'success' : 'default'} variant={c.active ? 'filled' : 'outlined'} /></TableCell>
                  <TableCell>{c.lastTestedAt ? new Date(c.lastTestedAt).toLocaleString('pt-BR') : <Typography variant="body2" color="text.secondary">Nunca</Typography>}</TableCell>
                  <TableCell>
                    {c.lastTestSuccess === null ? <Typography variant="body2" color="text.secondary">—</Typography> : c.lastTestSuccess ? (
                      <Chip label="Sucesso" size="small" color="success" variant="outlined" />
                    ) : (
                      <Chip label="Falha" size="small" color="error" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" startIcon={<PlayArrow />} onClick={() => openTest(c)} variant="outlined">
                      Testar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Teste de conexão dialog */}
      <Dialog open={testDialog.open} onClose={() => setTestDialog({ open: false, cred: null, result: null })} maxWidth="md" fullWidth>
        <DialogTitle>Teste de Conexão — {testDialog.cred?.provider}</DialogTitle>
        <DialogContent>
          {testDialog.result && (
            <Accordion sx={{ mb: 2 }} defaultExpanded>
              <AccordionSummary expandIcon={<Visibility />}>
                <Typography variant="body2" fontWeight={600}>
                  {testDialog.result.success ? '✅ Conexão bem-sucedida' : '❌ Falha na conexão'}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="body2">Status HTTP: {testDialog.result.httpStatus ?? '—'}</Typography>
                  <Typography variant="body2">Latência: {testDialog.result.latencyMs}ms</Typography>
                  <Typography variant="body2">Mensagem: {testDialog.result.message}</Typography>
                </Box>
              </AccordionDetails>
            </Accordion>
          )}
          <Typography variant="body2" color="text.secondary">
            O teste executa uma chamada real ao provedor (ex: GET /users/me no Mercado Pago, GET /myAccount na Asaas).
            Credenciais de plataforma (tenant = null) testam a conta mestra da Filitech.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestDialog({ open: false, cred: null, result: null })}>Fechar</Button>
          <Button variant="contained" onClick={runTest} disabled={!testDialog.cred || loading}>
            {loading ? <CircularProgress size={20} color="inherit" /> : 'Executar Teste'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Code({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return <Typography variant="body2" fontFamily="monospace" sx={{ fontSize: 11, color: 'text.secondary', ...sx }}>{children}</Typography>;
}