'use client';

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, IconButton, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material';
import { ExpandMore, Visibility, Check, Close, Add } from '@mui/icons-material';
import { apiAdmin, ApiError } from '../../api/apiAdmin';
import { brl } from '../../lib/brl';

interface TenantDetail {
  tenant: {
    id: string;
    slug: string;
    tradeName: string;
    legalName: string;
    cnpj: string | null;
    status: string;
    tenantType: string;
    nicheCode: string | null;
    taxRegime: string;
    simplesNacionalAnexo: string | null;
    inscricaoEstadual: string | null;
    uf: string | null;
    createdAt: string;
    updatedAt: string;
  };
  subscription: {
    id: string;
    status: string;
    provider: string;
    planCode: string;
    planLabel: string;
    basePrice: number;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    failedPaymentAttempts: number;
    creditBalanceMonths: number;
  } | null;
  billingEvents: Array<{
    id: string;
    type: string;
    provider: string;
    createdAt: string;
    payload: Record<string, unknown>;
  }>;
  activeModules: string[];
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    totpConfirmedAt: string | null;
    createdAt: string;
  }>;
  usage: {
    salesThisMonth: number;
    storageUsedMB: number;
    apiCallsToday: number;
  };
}

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateReason, setImpersonateReason] = useState('');
  const [tab, setTab] = useState(0);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiAdmin<TenantDetail>(`/platform-admin/tenants/${id}`);
      setData(data);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar tenant');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleImpersonate = async () => {
    if (!impersonateReason.trim()) return;
    setImpersonating(true);
    try {
      const res = await apiAdmin<{ token: string; url: string }>(`/platform-admin/tenants/${id}/impersonate`, {
        method: 'POST',
        body: JSON.stringify({ reason: impersonateReason }),
      });
      // Armazena o token de impersonação e redireciona
      localStorage.setItem('impersonation_token', res.token);
      window.open(res.url, '_blank');
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao iniciar impersonação');
    } finally {
      setImpersonating(false);
    }
  };

  const handleModuleToggle = async (moduleCode: string, active: boolean) => {
    try {
      await apiAdmin(`/platform-admin/tenants/${id}/modules/${moduleCode}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ active, reason: active ? 'Ativação manual pelo admin' : 'Desativação manual pelo admin' }),
      });
      fetchData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao alterar módulo');
    }
  };

  const handleSuspend = async () => {
    if (!window.confirm('Tem certeza? Isso bloqueará o acesso do tenant.')) return;
    try {
      await apiAdmin(`/platform-admin/tenants/${id}/suspend`, { method: 'POST' });
      fetchData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao suspender');
    }
  };

  const handleReactivate = async () => {
    try {
      await apiAdmin(`/platform-admin/tenants/${id}/reactivate`, { method: 'POST' });
      fetchData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao reativar');
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  if (error) {
    return <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>;
  }

  if (!data) return <Typography>Tenant não encontrado</Typography>;

  const { tenant, subscription, billingEvents, activeModules, users, usage } = data;

  const statusColors: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
    ACTIVE: 'success', TRIAL: 'info', PAST_DUE: 'warning', SUSPENDED: 'error', CANCELLED: 'default',
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{tenant.tradeName}</Typography>
          <Typography variant="body2" color="text.secondary">{tenant.legalName}</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip label={tenant.status} color={statusColors[tenant.status] as any} size="small" variant={tenant.status === 'ACTIVE' ? 'filled' : 'outlined'} />
          <Chip label={tenant.tenantType} color={tenant.tenantType === 'ACCOUNTING_OFFICE' ? 'warning' : 'info'} size="small" variant="outlined" />
        </Box>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Visão Geral" icon={<Visibility />} />
        <Tab label="Assinatura & Billing" />
        <Tab label="Módulos" />
        <Tab label="Usuários" />
        <Tab label="Auditoria" />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Identificação</Typography>
                  <Typography variant="body2" sx={{ display: 'block', fontFamily: 'monospace', mt: 1 }}>
                    {tenant.slug}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>CNPJ</Typography>
                  <Typography variant="body2">{tenant.cnpj ?? 'Não informado'}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Nicho</Typography>
                  <Typography variant="body2">{tenant.nicheCode ?? 'Não definido'}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Perfil Fiscal</Typography>
                  <Typography variant="body2" sx={{ display: 'block', mt: 1 }}>{tenant.taxRegime}</Typography>
                  {tenant.simplesNacionalAnexo && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Anexo Simples</Typography>
                  )}
                  {tenant.simplesNacionalAnexo && <Typography variant="body2">{tenant.simplesNacionalAnexo}</Typography>}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>IE / UF</Typography>
                  <Typography variant="body2">{[tenant.inscricaoEstadual, tenant.uf].filter(Boolean).join(' / ') || 'Não informado'}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Uso Atual</Typography>
                  <Typography variant="h6" fontWeight={700} sx={{ mt: 1 }}>{usage.salesThisMonth.toLocaleString()}</Typography>
                  <Typography variant="caption" color="text.secondary">Vendas este mês</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Armazenamento</Typography>
                  <Typography variant="h6" fontWeight={700} sx={{ mt: 1 }}>{usage.storageUsedMB} MB</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">API Calls (hoje)</Typography>
                  <Typography variant="h6" fontWeight={700} sx={{ mt: 1 }}>{usage.apiCallsToday.toLocaleString()}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h6" fontWeight={600}>Ações Administrativas</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" onClick={handleImpersonate} startIcon={<Visibility />}>
                    Entrar como este tenant
                  </Button>
                  {tenant.status === 'SUSPENDED' ? (
                    <Button variant="contained" color="success" onClick={handleReactivate} startIcon={<Check />}>
                      Reativar
                    </Button>
                  ) : tenant.status !== 'CANCELLED' ? (
                    <Button variant="outlined" color="error" onClick={handleSuspend} startIcon={<Close />}>
                      Suspender
                    </Button>
                  ) : null}
                </Box>
              </Box>
              <Box sx={{ mt: 1 }}>
                <TextField
                  size="small"
                  placeholder="Motivo obrigatório para impersonação"
                  value={impersonateReason}
                  onChange={(e) => setImpersonateReason(e.target.value)}
                  sx={{ minWidth: 300 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {tab === 1 && subscription && (
        <Box sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Plano</Typography>
                  <Typography variant="h6" fontWeight={700} sx={{ mt: 1 }}>{subscription.planLabel}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Código: {subscription.planCode}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Preço Base</Typography>
                  <Typography variant="h6" fontWeight={700} fontFamily="monospace" sx={{ mt: 1 }}>{brl(subscription.basePrice)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Status da Assinatura</Typography>
                  <Chip 
                    label={subscription.status} 
                    size="small" 
                    color={subscription.status === 'ACTIVE' ? 'success' : subscription.status === 'TRIAL' ? 'info' : 'warning'} 
                    variant={subscription.status === 'ACTIVE' ? 'filled' : 'outlined'}
                    sx={{ mt: 1, fontWeight: 600 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Próximo vencimento</Typography>
                  <Typography variant="body2">{subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR') : '—'}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Provedor</Typography>
                  <Typography variant="body2">{subscription.provider}</Typography>
                  {subscription.cancelAtPeriodEnd && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      Cancelamento agendado para o fim do período atual
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Crédito de Indicação</Typography>
                  <Typography variant="h6" fontWeight={700} sx={{ mt: 1 }}>{subscription.creditBalanceMonths} meses</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">Falhas de Pagamento</Typography>
                  <Typography variant="h6" fontWeight={700} color={subscription.failedPaymentAttempts > 0 ? 'error' : 'success'} sx={{ mt: 1 }}>
                    {subscription.failedPaymentAttempts}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">MRR Atual</Typography>
                  <Typography variant="h6" fontWeight={700} fontFamily="monospace" sx={{ mt: 1 }}>{brl(subscription.basePrice)}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>Eventos de Billing Recentes</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Data</TableCell>
                      <TableCell>Tipo</TableCell>
                      <TableCell>Provedor</TableCell>
                      <TableCell>Payload</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {billingEvents.slice(0, 20).map((e) => (
                      <TableRow key={e.id} hover>
                        <TableCell>{new Date(e.createdAt).toLocaleString('pt-BR')}</TableCell>
                        <TableCell><Chip label={e.type} size="small" variant="outlined" /></TableCell>
                        <TableCell>{e.provider}</TableCell>
                        <TableCell><Code>{JSON.stringify(e.payload).slice(0, 100)}...</Code></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Box>
      )}

      {tab === 2 && (
        <Box sx={{ py: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>Módulos Contratados</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {activeModules.map((m) => (
              <Box key={m} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip label={m} variant="filled" color="primary" size="small" />
                <IconButton size="small" onClick={() => handleModuleToggle(m, false)}><Close sx={{ fontSize: 14 }} /></IconButton>
              </Box>
            ))}
            <Button variant="outlined" size="small" startIcon={<Add />} onClick={() => {}}>Adicionar módulo</Button>
          </Box>
        </Box>
      )}

      {tab === 3 && (
        <Box sx={{ py: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>Usuários do Tenant</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell>E-mail</TableCell>
                  <TableCell>Papel</TableCell>
                  <TableCell>2FA</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Criado em</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell><Chip label={u.role} size="small" variant="outlined" /></TableCell>
                    <TableCell>{u.totpConfirmedAt ? <Chip label="Ativo" size="small" color="success" variant="outlined" /> : <Chip label="Inativo" size="small" variant="outlined" />}</TableCell>
                    <TableCell>{u.active ? <Chip label="Ativo" size="small" color="success" variant="outlined" /> : <Chip label="Inativo" size="small" variant="outlined" />}</TableCell>
                    <TableCell>{new Date(u.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {tab === 4 && (
        <Box sx={{ py: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>Eventos de Auditoria Recentes</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {billingEvents.slice(0, 30).map((e) => (
              <Accordion key={e.id} sx={{ border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Chip label={e.type} size="small" variant="outlined" />
                      <Typography variant="body2" color="text.secondary">{e.provider}</Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">{new Date(e.createdAt).toLocaleString('pt-BR')}</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Code>{JSON.stringify(e.payload, null, 2)}</Code>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function Code({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return <Typography variant="body2" fontFamily="monospace" style={{ fontSize: 12, color: '#71717A', whiteSpace: 'pre-wrap', ...(sx as object)}}>{children}</Typography>;
}