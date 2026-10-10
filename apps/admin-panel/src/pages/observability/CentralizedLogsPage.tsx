'use client';

import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, TextField, InputAdornment,
  Chip, IconButton, Tooltip, CircularProgress, Typography, FormControl,
  InputLabel, Select, MenuItem, Alert
} from '@mui/material';
import { Search, FilterList, Refresh } from '@mui/icons-material';
import { apiAdmin, ApiError } from '../../../api/apiAdmin';

interface LogEntry {
  id: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  tenantId: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestId: string;
  message: string;
  createdAt: string;
}

interface LogsResponse {
  logs: LogEntry[];
  total: number;
}

export function CentralizedLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page), pageSize: String(pageSize),
        ...(search && { search }),
        ...(levelFilter && { level: levelFilter }),
        ...(tenantFilter && { tenantId: tenantFilter }),
      });
      const data = await apiAdmin<LogsResponse>(`/platform-admin/logs?${params}`);
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [page, pageSize, search, levelFilter, tenantFilter]);
  useEffect(() => { if (autoRefresh) { const i = setInterval(fetchLogs, 10000); return () => clearInterval(i); } }, [autoRefresh]);

  const levelColors: Record<string, 'error' | 'warning' | 'info' | 'success'> = {
    error: 'error', warn: 'warning', info: 'info', debug: 'success',
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5" fontWeight={700}>Logs Centralizados</Typography>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Nível</InputLabel>
            <Select value={levelFilter} label="Nível" onChange={(e) => setLevelFilter(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="error">Error</MenuItem>
              <MenuItem value="warn">Warn</MenuItem>
              <MenuItem value="info">Info</MenuItem>
              <MenuItem value="debug">Debug</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Tenant ID</InputLabel>
            <Select value={tenantFilter} label="Tenant" onChange={(e) => setTenantFilter(e.target.value)}>
              <MenuItem value="">Todos</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button variant="outlined" size="small" startIcon={<Refresh />} onClick={fetchLogs} disabled={loading}>
              {loading ? <CircularProgress size={16} /> : 'Atualizar'}
            </Button>
            <FormControl sx={{ ml: 1 }}>
              <InputLabel>Auto-refresh</InputLabel>
              <Select value={autoRefresh.toString()} label="Auto-refresh" onChange={(e) => setAutoRefresh(e.target.value === 'true')}>
                <MenuItem value={true}>Ligado (10s)</MenuItem>
                <MenuItem value={false}>Desligado</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField size="small" placeholder="Buscar requestId, path, mensagem..." value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 400 }} InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ color: 'text.secondary' }} /></InputAdornment> }} />
        </Box>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 320px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>Nível</TableCell>
                <TableCell>Método</TableCell>
                <TableCell>Path</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Duração</TableCell>
                <TableCell>Tenant</TableCell>
                <TableCell>Request ID</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>Nenhum log encontrado</TableCell></TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} hover>
                    <TableCell>{new Date(log.createdAt).toLocaleString('pt-BR')}</TableCell>
                    <TableCell><Chip label={log.level.toUpperCase()} size="small" color={levelColors[log.level]} variant="filled" sx={{ fontSize: 10, height: 20 }} /></TableCell>
                    <TableCell><Code>{log.method}</Code></TableCell>
                    <TableCell><Code sx={{ maxWidth: 300, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.path}</Code></TableCell>
                    <TableCell>
                      <Chip label={String(log.statusCode)} size="small" variant="outlined" color={log.statusCode >= 500 ? 'error' : log.statusCode >= 400 ? 'warning' : 'success'} />
                    </TableCell>
                    <TableCell align="right"><Code>{log.durationMs}ms</Code></TableCell>
                    <TableCell>{log.tenantId ? <Code>{log.tenantId.slice(0, 8)}...</Code> : <Typography variant="body2" color="text.secondary">—</Typography>}</TableCell>
                    <TableCell><Code>{log.requestId.slice(0, 12)}...</Code></TableCell>
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

function Code({ children }: { children: React.ReactNode }) {
  return <Typography variant="body2" fontFamily="monospace" sx={{ fontSize: 11, color: 'text.secondary', maxWidth: 300, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</Typography>;
}