'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, Grid, IconButton, InputLabel, MenuItem, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';;
import { Add, Edit, Delete, Visibility } from '@mui/icons-material';
import { apiAdmin, ApiError } from '../../api/apiAdmin';

interface ReleaseNote {
  id: string;
  version: string;
  summary: string;
  isPublic: boolean;
  deployedAt: string;
}

export function ChangelogPage() {
  const [releases, setReleases] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ReleaseNote | null>(null);
  const [form, setForm] = useState({ version: '', summary: '', isPublic: false });

  const fetchReleases = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiAdmin<ReleaseNote[]>('/platform-admin/releases');
      setReleases(data);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar releases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReleases(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ version: '', summary: '', isPublic: false });
    setDialogOpen(true);
  };

  const openEdit = (r: ReleaseNote) => {
    setEditing(r);
    setForm({ version: r.version, summary: r.summary, isPublic: r.isPublic });
    setDialogOpen(true);
  };

  const openView = (r: ReleaseNote) => {
    setEditing(r);
    setForm({ version: r.version, summary: r.summary, isPublic: r.isPublic });
    // abre view-only - implementar dialog separado se necessário
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (editing) {
        await apiAdmin(`/platform-admin/releases/${editing.id}`, {
          method: 'PATCH', body: JSON.stringify(form),
        });
      } else {
        await apiAdmin('/platform-admin/releases', {
          method: 'POST', body: JSON.stringify(form),
        });
      }
      setDialogOpen(false);
      fetchReleases();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar release');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este release?')) return;
    try {
      await apiAdmin(`/platform-admin/releases/${id}`, { method: 'DELETE' });
      fetchReleases();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao excluir');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" fontWeight={700}>Changelog / Releases</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate}>Nova Release</Button>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Versão</TableCell>
                <TableCell>Resumo</TableCell>
                <TableCell>Público</TableCell>
                <TableCell>Deploy</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {releases.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell><Typography variant="body2" fontFamily="monospace" fontWeight={600}>{r.version}</Typography></TableCell>
                  <TableCell><Typography variant="body2" sx={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{r.summary}</Typography></TableCell>
                  <TableCell><Chip label={r.isPublic ? 'Público' : 'Interno'} size="small" color={r.isPublic ? 'success' : 'info'} variant="outlined" /></TableCell>
                  <TableCell>{new Date(r.deployedAt).toLocaleString('pt-BR')}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(r)}><Edit /></IconButton>
                    <IconButton size="small" onClick={() => openView(r)}><Visibility /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(r.id)}><Delete /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editing ? 'Editar Release' : 'Nova Release'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ pt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Versão (semver)" value={form.version} onChange={(e) => setForm({...form, version: e.target.value})} required disabled={!!editing} helperText="Ex: 1.2.3, 2.0.0-beta.1" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl>
                <InputLabel>Público?</InputLabel>
                <Select value={form.isPublic ? 'true' : 'false'} label="Público" onChange={(e) => setForm({...form, isPublic: e.target.value === 'true'})}>
                  <MenuItem value="true">Sim (aparece no status público)</MenuItem>
                  <MenuItem value="false">Não (apenas interno)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Resumo (markdown suportado)" value={form.summary} onChange={(e) => setForm({...form, summary: e.target.value})} required multiline rows={6} />
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