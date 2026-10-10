'use client';

import { useEffect, useState } from 'react';
import { 
  Box, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, TablePagination, TextField, InputAdornment, 
  Chip, IconButton, Tooltip, CircularProgress, Typography, Paper
} from '@mui/material';
import { Search, Visibility as VisibilityIcon } from '@mui/icons-material';
import { apiAdmin, ApiError } from '../../../../api/apiAdmin';
import { brl } from '../../../../../lib/brl';

interface Tenant {
  id: string;
  slug: string;
  tradeName: string;
  legalName: string;
  status: string;
  nicheCode: string | null;
  tenantType: string;
  mrr: number;
  activeModules: string[];
  subscriptionStatus: string;
  createdAt: string;
  usersCount: number;
}

interface TenantsResponse {
  tenants: Tenant[];
  total: number;
}

export function TenantListPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [sortModel, setSortModel] = useState<{ field: string; sort: 'asc' | 'desc' }[]>([]);

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(sortModel.length && { sort: `${sortModel[0].field}:${sortModel[0].sort}` }),
      });
      const data = await apiAdmin<TenantsResponse>(`/platform-admin/tenants?${params}`);
      setTenants(data.tenants);
      setTotal(data.total);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar tenants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTenants(); }, [page, pageSize, search, statusFilter, sortModel]);

  const statusColors: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
    ACTIVE: 'success',
    TRIAL: 'info',
    PAST_DUE: 'warning',
    SUSPENDED: 'error',
    CANCELLED: 'default',
  };

  const tenantTypeColors: Record<string, 'success' | 'warning' | 'info' | 'default'> = {
    BUSINESS: 'info',
    PERSONAL: 'success',
    ACCOUNTING_OFFICE: 'warning',
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, minHeight: 'calc(100vh - 80px)' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" fontWeight={700}>Tenants</Typography>
        <TextField
          size="small"
          placeholder="Buscar por nome, CNPJ, slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 320 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search sx={{ color: 'text.secondary' }} /></InputAdornment>,
          }}
        />
      </Box>

      {error && (
        <Box sx={{ p: 2 }} onClick={() => setError(null)}>
          <Typography variant="body2" color="error" sx={{ cursor: 'pointer' }}>{error} (clique para ocultar)</Typography>
        </Box>
      )}

      <Paper sx={{ overflow: 'hidden', borderRadius: 2 }}>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 300px)' }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Empresa</TableCell>
                <TableCell>Slug</TableCell>
                <TableCell>Nicho</TableCell>
                <TableCell align="right">MRR</TableCell>
                <TableCell>Módulos</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Assinatura</TableCell>
                <TableCell>Criado em</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(() => {
                if (loading) {
                  return (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                        <CircularProgress />
                      </TableCell>
                    </TableRow>
                  );
                }
                if (tenants.length === 0) {
                  return (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        Nenhum tenant encontrado
                      </TableCell>
                    </TableRow>
                  );
                }
                return tenants.map((tenant) => (
                  <TableRow key={tenant.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2" fontWeight={600}>{tenant.tradeName}</Typography>
                        <Typography variant="caption" color="text.secondary">{tenant.legalName}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Code sx={{ fontSize: 12 }}>{tenant.slug}</Code>
                    </TableCell>
                    <TableCell>{tenant.nicheCode ?? '-'}</TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600} fontFamily="monospace">
                        {brl(tenant.mrr)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {tenant.activeModules.slice(0, 3).map((m) => (
                          <Chip key={m} label={m} size="small" variant="outlined" color="default" sx={{ fontSize: 10, height: 20 }} />
                        ))}
                        {tenant.activeModules.length > 3 && (
                          <Chip label={`+${tenant.activeModules.length - 3}`} size="small" variant="outlined" color="default" sx={{ fontSize: 10, height: 20 }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={tenant.status} 
                        size="small" 
                        color={statusColors[tenant.status] as any} 
                        variant={tenant.status === 'ACTIVE' ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={tenant.tenantType} 
                        size="small" 
                        color={tenantTypeColors[tenant.tenantType] as any} 
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={tenant.subscriptionStatus} 
                        size="small" 
                        color={tenant.subscriptionStatus === 'ACTIVE' ? 'success' : tenant.subscriptionStatus === 'TRIAL' ? 'info' : 'warning'} 
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{new Date(tenant.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Ver detalhes / Impersonar">
                        <IconButton size="small" onClick={() => window.location.href = `/tenants/${tenant.id}`}>
                          <VisibilityIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ));
              })()}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 20, 50, 100]}
          component="div"
          count={total}
          rowsPerPage={pageSize}
          page={page}
          onPageChange={(_: unknown, newPage: number) => setPage(newPage)}
          onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          labelRowsPerPage="Por página"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Paper>
    </Box>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <Typography variant="body2" fontFamily="monospace" style={{ fontSize: 12, color: '#71717A' }}>{children}</Typography>;
}