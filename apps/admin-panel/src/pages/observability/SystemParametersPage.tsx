'use client';

import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Typography, Alert, Grid, CircularProgress
} from '@mui/material';
import { Add, Edit, Refresh } from '@mui/icons-material';
import { apiAdmin, ApiError } from '../../../api/apiAdmin';

interface SystemParameter {
  key: string;
  value: string;
  description: string | null;
  updatedByPlatformAdminUserId: string | null;
  updatedAt: string;
}

export function SystemParametersPage() {
  const [params, setParams] = useState<SystemParameter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SystemParameter | null>(null);
  const [form, setForm] = useState({ key: '', value: '', description: '' });

  const fetchParams = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiAdmin<SystemParameter[]>('/platform-admin/parameters');
      setParams(data);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar parâmetros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchParams(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ key: '', value: '', description: '' });
    setDialogOpen(true);
  };

  const openEdit = (param: SystemParameter) => {
    setEditing(param);
    setForm({ key: param.key, value: param.value, description: param.description ?? '' });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (editing) {
        await apiAdmin(`/platform-admin/parameters/${editing.key}`, {
          method: 'PATCH', body: JSON.stringify({ value: form.value, description: form.description }),
        });
      } else {
        await apiAdmin('/platform-admin/parameters', {
          method: 'POST', body: JSON.stringify(form),
        });
      }
      setDialogOpen(false);
      fetchParams();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar parâmetro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" fontWeight={700}>Parâmetros do Sistema</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>Novo Parâmetro</Button>
          <Button variant="outlined" startIcon={<Refresh />} onClick={fetchParams} disabled={loading}>Recarregar</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Chave</TableCell>
                <TableCell>Valor</TableCell>
                <TableCell>Descrição</TableCell>
                <TableCell>Atualizado por</TableCell>
                <TableCell>Atualizado em</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {params.map((p) => (
                <TableRow key={p.key} hover>
                  <TableCell><Typography variant="body2" fontFamily="monospace" fontWeight={600}>{p.key}</Typography></TableCell>
                  <TableCell><Typography variant="body2" fontFamily="monospace">{p.value}</Typography></TableCell>
                  <TableCell>{p.description ?? <Typography variant="body2" color="text.secondary">—</Typography>}</TableCell>
                  <TableCell>{p.updatedByPlatformAdminUserId ? <Code>{p.updatedByPlatformAdminUserId.slice(0, 8)}...</Code> : <Typography variant="body2" color="text.secondary">—</Typography>}</TableCell>
                  <TableCell>{new Date(p.updatedAt).toLocaleString('pt-BR')}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(p)}><Edit /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editing ? 'Editar Parâmetro' : 'Novo Parâmetro'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ pt: 1 }}>
            <Grid item xs={12}>
              <TextField fullWidth label="Chave" value={form.key} onChange={(e) => setForm({...form, key: e.target.value})} required disabled={!!editing} helperText="Ex: FREE_TIER_MAX_SALES_PER_MONTH, TRIAL_DAYS, ENFORCE_2FA_FOR_ROLES" />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Valor" value={form.value} onChange={(e) => setForm({...form, value: e.target.value})} required multiline rows={3} helperText="Armazenado como string; o consumidor valida/converte conforme tipo esperado" />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Descrição" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} multiline rows={2} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={loading}>
            {loading ? <CircularProgress size={20} color="inherit" /> : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <Typography variant="body2" fontFamily="monospace" sx={{ fontSize: 11, color: 'text.secondary' }}>{children}</Typography>;
}