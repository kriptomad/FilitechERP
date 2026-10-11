'use client';

import { useEffect, useState } from 'react';
import { Box, Card, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, TextField, InputAdornment, Chip, CircularProgress, Typography } from '@mui/material';;;;;;;;
import { Search } from '@mui/icons-material';;;
import { apiAdmin, ApiError } from '../../api/apiAdmin';

interface AuditLog {
  id: string;
  platformAdminUserId: string;
  adminName: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  isImpersonated: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
}

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page), pageSize: String(pageSize),
        ...(search && { search }),
        ...(actionFilter && { action: actionFilter }),
        ...(targetTypeFilter && { targetType: targetTypeFilter }),
      });
      const data = await apiAdmin<AuditLogsResponse>(`/platform-admin/audit-log?${params}`);
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar auditoria');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [page, pageSize, search, actionFilter, targetTypeFilter]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" fontWeight={700}>Trilha de Auditoria</Typography>
        <TextField size="small" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 320 }} InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ color: 'text.secondary' }} /></InputAdornment> }} />
      </Box>

      {error && <Typography variant="body2" color="error" sx={{ cursor: 'pointer' }} onClick={() => setError(null)}>{error} (clique para ocultar)</Typography>}

      <Card>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 280px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Data/Hora</TableCell>
                <TableCell>Admin</TableCell>
                <TableCell>Ação</TableCell>
                <TableCell>Alvo</TableCell>
                <TableCell>Impersonado</TableCell>
                <TableCell>Metadados</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>Nenhum log encontrado</TableCell></TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} hover>
                    <TableCell>{new Date(log.createdAt).toLocaleString('pt-BR')}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{log.adminName}</Typography>
                      <Typography variant="caption" color="text.secondary">{log.adminEmail}</Typography>
                    </TableCell>
                    <TableCell><Chip label={log.action} size="small" variant="outlined" /></TableCell>
                    <TableCell>
                      {log.targetType} {log.targetId && <Code>{log.targetId.slice(0, 8)}...</Code>}
                    </TableCell>
                    <TableCell>{log.isImpersonated ? <Chip label="Sim" size="small" color="warning" variant="outlined" /> : <Chip label="Não" size="small" variant="outlined" />}</TableCell>
                    <TableCell><Code>{JSON.stringify(log.metadata).slice(0, 100)}...</Code></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={total} rowsPerPage={pageSize} page={page} onPageChange={(_: unknown, newPage: number) => setPage(newPage)} onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} />
      </Card>
    </Box>
  );
}

function Code({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return <Typography variant="body2" fontFamily="monospace" sx={{ fontSize: 11, color: 'text.secondary', ...sx }}>{children}</Typography>;
}