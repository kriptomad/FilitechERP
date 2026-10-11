// src/app/app/pessoal/contas/page.tsx — Cap. 22
// Gestão de contas bancárias (pessoais)
'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, post, patch, del } from '@/lib/api';
import { Card, CardContent, Grid, Typography, Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, Alert, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material';
import { Add, Edit, Delete, AccountBalance, Savings, CreditCard, AttachMoney, Visibility, VisibilityOff } from '@mui/icons-material';

interface Account {
  id: string;
  name: string;
  type: string;
  currentBalance: number;
  institutionName?: string;
  color: string;
  isActive: boolean;
  openFinanceConsentId?: string;
}

const TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Conta Corrente',
  SAVINGS: 'Poupança',
  CREDIT_CARD: 'Cartão de Crédito',
  INVESTMENT_BROKERAGE: 'Corretora',
  CASH: 'Dinheiro',
  WALLET_CASH: 'Carteira Digital',
};

const TYPE_ICONS: Record<string, any> = {
  CHECKING: <AccountBalance />,
  SAVINGS: <Savings />,
  CREDIT_CARD: <CreditCard />,
  INVESTMENT_BROKERAGE: <AttachMoney />,
  CASH: <Visibility />,
  WALLET_CARD: <VisibilityOff />,
};

export default function ContasPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({ name: '', type: 'CHECKING', currentBalance: 0, institutionName: '', color: '#4F46E5' });

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      const json = await api<{ accounts: Account[] }>('/api/pessoal/contas');
      setAccounts(json.accounts);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar contas');
    } finally {
      setLoading(false);
    }
  }

  function openDialog(account?: Account) {
    if (account) {
      setEditing(account);
      setForm({ name: account.name, type: account.type, currentBalance: account.currentBalance, institutionName: account.institutionName ?? '', color: account.color });
    } else {
      setEditing(null);
      setForm({ name: '', type: 'CHECKING', currentBalance: 0, institutionName: '', color: '#4F46E5' });
    }
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setForm({ name: '', type: 'CHECKING', currentBalance: 0, institutionName: '', color: '#4F46E5' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await patch(`/api/pessoal/contas/${editing.id}`, form);
      } else {
        await post('/api/pessoal/contas', form);
      }
      closeDialog();
      loadAccounts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar conta');
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Tem certeza que deseja excluir esta conta?')) return;
    try {
      await del(`/api/pessoal/contas/${id}`);
      loadAccounts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao excluir conta');
    }
  }

  if (loading) return <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" /></Box>;

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#4F46E5' }}>Contas Bancárias</Typography>
          <Typography variant="body1" color="text.secondary">Gerencie suas contas correntes, poupança, cartões e investimentos</Typography>
        </Box>
        <Button onClick={() => openDialog()} startIcon={<Add />} variant="contained">Nova Conta</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Conta</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell align="right">Saldo</TableCell>
                  <TableCell>Instituição</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: account.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                          {TYPE_ICONS[account.type] ?? <AccountBalance />}
                        </Box>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>{account.name}</Typography>
                          {account.institutionName && <Typography variant="caption" color="text.secondary">{account.institutionName}</Typography>}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={TYPE_LABELS[account.type] ?? account.type} size="small" variant="outlined" color={account.color as any} />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600} sx={{ color: account.currentBalance >= 0 ? '#10B981' : '#EF4444' }}>
                        {account.currentBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </Typography>
                    </TableCell>
                    <TableCell>{account.institutionName ?? '—'}</TableCell>
                    <TableCell>
                      <Chip label={account.isActive ? 'Ativa' : 'Inativa'} size="small" color={account.isActive ? 'success' : 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openDialog(account)} aria-label="Editar"><Edit fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => handleDelete(account.id)} aria-label="Excluir" color="error"><Delete fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField fullWidth label="Nome da conta" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Tipo</InputLabel>
                  <Select value={form.type} label="Tipo" onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <MenuItem value="CHECKING">Conta Corrente</MenuItem>
                    <MenuItem value="SAVINGS">Poupança</MenuItem>
                    <MenuItem value="CREDIT_CARD">Cartão de Crédito</MenuItem>
                    <MenuItem value="INVESTMENT_BROKERAGE">Corretora/Investimentos</MenuItem>
                    <MenuItem value="CASH">Dinheiro em Espécie</MenuItem>
                    <MenuItem value="WALLET_CASH">Carteira Digital</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Saldo inicial" type="number" value={form.currentBalance} onChange={(e) => setForm({ ...form, currentBalance: Number(e.target.value) })} inputProps={{ step: '0.01' }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Instituição" value={form.institutionName} onChange={(e) => setForm({ ...form, institutionName: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Cor" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} inputProps={{ style: { height: 48 } }} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDialog} variant="outlined">Cancelar</Button>
            <Button type="submit" variant="contained">{editing ? 'Salvar' : 'Criar'}</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}