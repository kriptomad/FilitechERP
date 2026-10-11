'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, Grid, IconButton, InputLabel, MenuItem, Select, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';;
import { Add, Delete, Edit } from '@mui/icons-material';;
import { apiAdmin, ApiError } from '../../api/apiAdmin';
import { brl } from '../../lib/brl';

interface Coupon {
  id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  scopeType: 'PLAN' | 'MODULE' | 'GLOBAL';
  scopeReferenceId: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  validFrom: string;
  validUntil: string;
  active: boolean;
  createdAt: string;
}

interface CouponsResponse {
  coupons: Coupon[];
  total: number;
}

export function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState({
    code: '',
    discountType: 'PERCENTAGE',
    discountValue: 0,
    scopeType: 'GLOBAL',
    scopeReferenceId: '',
    maxRedemptions: '',
    validFrom: new Date().toISOString().slice(0, 16),
    validUntil: new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0, 16),
    active: true,
  });

  const fetchCoupons = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiAdmin<CouponsResponse>(`/platform-admin/billing/coupons?page=${page}&pageSize=${pageSize}`);
      setCoupons(data.coupons);
      setTotal(data.total);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar cupons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCoupons(); }, [page, pageSize]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      code: '', discountType: 'PERCENTAGE', discountValue: 0, scopeType: 'GLOBAL',
      scopeReferenceId: '', maxRedemptions: '', validFrom: new Date().toISOString().slice(0, 16),
      validUntil: new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0, 16), active: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditing(coupon);
    setForm({
      code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue,
      scopeType: coupon.scopeType, scopeReferenceId: coupon.scopeReferenceId ?? '',
      maxRedemptions: coupon.maxRedemptions?.toString() ?? '',
      validFrom: coupon.validFrom.slice(0, 16), validUntil: coupon.validUntil.slice(0, 16),
      active: coupon.active,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (editing) {
        await apiAdmin(`/platform-admin/billing/coupons/${editing.id}`, {
          method: 'PATCH', body: JSON.stringify(form),
        });
      } else {
        await apiAdmin('/platform-admin/billing/coupons', {
          method: 'POST', body: JSON.stringify(form),
        });
      }
      setDialogOpen(false);
      fetchCoupons();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar cupom');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este cupom?')) return;
    try {
      await apiAdmin(`/platform-admin/billing/coupons/${id}`, { method: 'DELETE' });
      fetchCoupons();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao excluir');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" fontWeight={700}>Cupons e Promoções</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate}>Novo Cupom</Button>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Código</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Valor</TableCell>
                <TableCell>Escopo</TableCell>
                <TableCell>Validade</TableCell>
                <TableCell>Usos</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {coupons.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell><Typography variant="body2" fontFamily="monospace" fontWeight={600}>{c.code}</Typography></TableCell>
                  <TableCell><Chip label={c.discountType} size="small" variant="outlined" /></TableCell>
                  <TableCell>
                    {c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : brl(c.discountValue)}
                  </TableCell>
                  <TableCell>
                    {c.scopeType === 'GLOBAL' ? 'Global' : `${c.scopeType}: ${c.scopeReferenceId ?? '—'}`}
                  </TableCell>
                  <TableCell>
                    {new Date(c.validFrom).toLocaleDateString('pt-BR')} a {new Date(c.validUntil).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell>
                    {c.maxRedemptions ? `${c.redemptionCount}/${c.maxRedemptions}` : `${c.redemptionCount}/∞`}
                  </TableCell>
                  <TableCell>
                    <Chip label={c.active ? 'Ativo' : 'Inativo'} size="small" color={c.active ? 'success' : 'default'} variant={c.active ? 'filled' : 'outlined'} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(c)}><Edit /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(c.id)}><Delete /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          rowsPerPage={pageSize}
          page={page}
          onPageChange={(_: unknown, newPage: number) => setPage(newPage)}
          onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
        />
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editing ? 'Editar Cupom' : 'Novo Cupom'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ pt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Código" value={form.code} onChange={(e) => setForm({...form, code: e.target.value})} required disabled={!!editing} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Tipo de Desconto</InputLabel>
                <Select value={form.discountType} label="Tipo" onChange={(e) => setForm({...form, discountType: e.target.value as any})}>
                  <MenuItem value="PERCENTAGE">Porcentagem (%)</MenuItem>
                  <MenuItem value="FIXED_AMOUNT">Valor Fixo (R$)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="number" label="Valor" value={form.discountValue} onChange={(e) => setForm({...form, discountValue: Number(e.target.value)})} required inputProps={{ min: 0, step: 0.01 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Escopo</InputLabel>
                <Select value={form.scopeType} label="Escopo" onChange={(e) => setForm({...form, scopeType: e.target.value as any})}>
                  <MenuItem value="GLOBAL">Global (todos os planos/módulos)</MenuItem>
                  <MenuItem value="PLAN">Plano Específico</MenuItem>
                  <MenuItem value="MODULE">Módulo Específico</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Referência do Escopo (Plan.code ou Module.code)" value={form.scopeReferenceId} onChange={(e) => setForm({...form, scopeReferenceId: e.target.value})} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="number" label="Máx. Resgates (vazio = ilimitado)" value={form.maxRedemptions} onChange={(e) => setForm({...form, maxRedemptions: e.target.value})} inputProps={{ min: 1 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="datetime-local" label="Válido a partir de" value={form.validFrom} onChange={(e) => setForm({...form, validFrom: e.target.value})} required InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="datetime-local" label="Válido até" value={form.validUntil} onChange={(e) => setForm({...form, validUntil: e.target.value})} required InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12}>
              <FormControl>
                <InputLabel>Status</InputLabel>
                <Select value={form.active ? 'true' : 'false'} label="Status" onChange={(e) => setForm({...form, active: e.target.value === 'true'})}>
                  <MenuItem value="true">Ativo</MenuItem>
                  <MenuItem value="false">Inativo</MenuItem>
                </Select>
              </FormControl>
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