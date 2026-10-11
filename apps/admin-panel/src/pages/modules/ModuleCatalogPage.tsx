'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, Grid, IconButton, InputLabel, MenuItem, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';;
import { Add, Edit, Delete } from '@mui/icons-material';
import { apiAdmin, ApiError } from '../../api/apiAdmin';
import { brl } from '../../lib/brl';

interface Plan {
  id: string;
  code: string;
  label: string;
  basePrice: number;
  includedModules: string[];
  active: boolean;
  audience: 'BUSINESS' | 'PERSONAL' | 'BOTH';
  maxConnectedAccounts: number | null;
}

interface Module {
  id: string;
  code: string;
  label: string;
  monthlyPrice: number;
  description: string;
  active: boolean;
}

interface ModuleCatalogResponse {
  plans: Plan[];
  modules: Module[];
}

export function ModuleCatalogPage() {
  const [data, setData] = useState<ModuleCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planDialog, setPlanDialog] = useState<{ open: boolean; editing: Plan | null }>({ open: false, editing: null });
  const [moduleDialog, setModuleDialog] = useState<{ open: boolean; editing: Module | null }>({ open: false, editing: null });
  const [planForm, setPlanForm] = useState({
    code: '', label: '', basePrice: 0, includedModules: '', active: true,
    audience: 'BUSINESS' as const, maxConnectedAccounts: '',
  });
  const [moduleForm, setModuleForm] = useState({
    code: '', label: '', monthlyPrice: 0, description: '', active: true,
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiAdmin<ModuleCatalogResponse>('/platform-admin/modules/catalog');
      setData(data);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar catálogo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openCreatePlan = () => setPlanDialog({ open: true, editing: null });
  const openEditPlan = (plan: Plan) => {
    setPlanForm({
      code: plan.code, label: plan.label, basePrice: plan.basePrice,
      includedModules: plan.includedModules.join(', '), active: plan.active,
      audience: plan.audience, maxConnectedAccounts: plan.maxConnectedAccounts?.toString() ?? '',
    });
    setPlanDialog({ open: true, editing: plan });
  };

  const openCreateModule = () => setModuleDialog({ open: true, editing: null });
  const openEditModule = (mod: Module) => {
    setModuleForm({
      code: mod.code, label: mod.label, monthlyPrice: mod.monthlyPrice,
      description: mod.description, active: mod.active,
    });
    setModuleDialog({ open: true, editing: mod });
  };

  const handlePlanSubmit = async () => {
    setLoading(true);
    try {
      const payload = {
        ...planForm,
        basePrice: Number(planForm.basePrice),
        includedModules: planForm.includedModules.split(',').map(s => s.trim()).filter(Boolean),
        maxConnectedAccounts: planForm.maxConnectedAccounts ? Number(planForm.maxConnectedAccounts) : null,
      };
      if (planDialog.editing) {
        await apiAdmin(`/platform-admin/modules/plans/${planDialog.editing.id}`, {
          method: 'PATCH', body: JSON.stringify(payload),
        });
      } else {
        await apiAdmin('/platform-admin/modules/plans', {
          method: 'POST', body: JSON.stringify(payload),
        });
      }
      setPlanDialog({ open: false, editing: null });
      fetchData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar plano');
    } finally {
      setLoading(false);
    }
  };

  const handleModuleSubmit = async () => {
    setLoading(true);
    try {
      const payload = { ...moduleForm, monthlyPrice: Number(moduleForm.monthlyPrice) };
      if (moduleDialog.editing) {
        await apiAdmin(`/platform-admin/modules/modules/${moduleDialog.editing.id}`, {
          method: 'PATCH', body: JSON.stringify(payload),
        });
      } else {
        await apiAdmin('/platform-admin/modules/modules', {
          method: 'POST', body: JSON.stringify(payload),
        });
      }
      setModuleDialog({ open: false, editing: null });
      fetchData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar módulo');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (!window.confirm('Excluir este plano?')) return;
    try {
      await apiAdmin(`/platform-admin/modules/plans/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao excluir');
    }
  };

  const handleDeleteModule = async (id: string) => {
    if (!window.confirm('Excluir este módulo?')) return;
    try {
      await apiAdmin(`/platform-admin/modules/modules/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao excluir');
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>;
  if (!data) return <Typography>Carregando...</Typography>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h5" fontWeight={700}>Catálogo de Planos e Módulos</Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>Planos Base</Typography>
            <Button variant="contained" startIcon={<Add />} onClick={openCreatePlan}>Novo Plano</Button>
          </Box>
          <Card>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Código</TableCell>
                    <TableCell>Label</TableCell>
                    <TableCell align="right">Preço</TableCell>
                    <TableCell>Público</TableCell>
                    <TableCell>Módulos Inclusos</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.plans.map((p) => (
                    <TableRow key={p.id} hover>
                      <TableCell><Typography variant="body2" fontFamily="monospace" fontWeight={600}>{p.code}</Typography></TableCell>
                      <TableCell>{p.label}</TableCell>
                      <TableCell align="right"><Typography variant="body2" fontWeight={600} fontFamily="monospace">{brl(p.basePrice)}</Typography></TableCell>
                      <TableCell><Chip label={p.audience} size="small" variant="outlined" /></TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {p.includedModules.map((m) => <Chip key={m} label={m} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />)}
                        </Box>
                      </TableCell>
                      <TableCell><Chip label={p.active ? 'Ativo' : 'Inativo'} size="small" color={p.active ? 'success' : 'default'} variant={p.active ? 'filled' : 'outlined'} /></TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEditPlan(p)}><Edit /></IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDeletePlan(p.id)}><Delete /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>Módulos à La Carte</Typography>
            <Button variant="contained" startIcon={<Add />} onClick={openCreateModule}>Novo Módulo</Button>
          </Box>
          <Card>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Código</TableCell>
                    <TableCell>Label</TableCell>
                    <TableCell align="right">Preço/Mês</TableCell>
                    <TableCell>Descrição</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.modules.map((m) => (
                    <TableRow key={m.id} hover>
                      <TableCell><Typography variant="body2" fontFamily="monospace" fontWeight={600}>{m.code}</Typography></TableCell>
                      <TableCell>{m.label}</TableCell>
                      <TableCell align="right"><Typography variant="body2" fontWeight={600} fontFamily="monospace">{brl(m.monthlyPrice)}</Typography></TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary" maxLines={1} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{m.description}</Typography></TableCell>
                      <TableCell><Chip label={m.active ? 'Ativo' : 'Inativo'} size="small" color={m.active ? 'success' : 'default'} variant={m.active ? 'filled' : 'outlined'} /></TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEditModule(m)}><Edit /></IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDeleteModule(m.id)}><Delete /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>

      {/* Plan Dialog */}
      <Dialog open={planDialog.open} onClose={() => setPlanDialog({ open: false, editing: null })} maxWidth="md" fullWidth>
        <DialogTitle>{planDialog.editing ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ pt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Código" value={planForm.code} onChange={(e) => setPlanForm({...planForm, code: e.target.value})} required disabled={!!planDialog.editing} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Label" value={planForm.label} onChange={(e) => setPlanForm({...planForm, label: e.target.value})} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="number" label="Preço Base (R$)" value={planForm.basePrice} onChange={(e) => setPlanForm({...planForm, basePrice: Number(e.target.value)})} required inputProps={{ min: 0, step: 0.01 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Público</InputLabel>
                <Select value={planForm.audience} label="Público" onChange={(e) => setPlanForm({...planForm, audience: e.target.value as any})}>
                  <MenuItem value="BUSINESS">BUSINESS</MenuItem>
                  <MenuItem value="PERSONAL">PERSONAL</MenuItem>
                  <MenuItem value="BOTH">BOTH</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="number" label="Máx. Contas Conectadas (B2C Free)" value={planForm.maxConnectedAccounts} onChange={(e) => setPlanForm({...planForm, maxConnectedAccounts: e.target.value})} inputProps={{ min: 1 }} helperText="Vazio = ilimitado" />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Módulos Inclusos (códigos separados por vírgula)" value={planForm.includedModules} onChange={(e) => setPlanForm({...planForm, includedModules: e.target.value})} helperText="Ex: pdv, estoque, financeiro, crm" />
            </Grid>
            <Grid item xs={12}>
              <FormControl>
                <InputLabel>Status</InputLabel>
                <Select value={planForm.active ? 'true' : 'false'} label="Status" onChange={(e) => setPlanForm({...planForm, active: e.target.value === 'true'})}>
                  <MenuItem value="true">Ativo</MenuItem>
                  <MenuItem value="false">Inativo</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanDialog({ open: false, editing: null })}>Cancelar</Button>
          <Button variant="contained" onClick={handlePlanSubmit} disabled={loading}>{loading ? <CircularProgress size={20} color="inherit" /> : 'Salvar'}</Button>
        </DialogActions>
      </Dialog>

      {/* Module Dialog */}
      <Dialog open={moduleDialog.open} onClose={() => setModuleDialog({ open: false, editing: null })} maxWidth="md" fullWidth>
        <DialogTitle>{moduleDialog.editing ? 'Editar Módulo' : 'Novo Módulo'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ pt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Código" value={moduleForm.code} onChange={(e) => setModuleForm({...moduleForm, code: e.target.value})} required disabled={!!moduleDialog.editing} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Label" value={moduleForm.label} onChange={(e) => setModuleForm({...moduleForm, label: e.target.value})} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="number" label="Preço Mensal (R$)" value={moduleForm.monthlyPrice} onChange={(e) => setModuleForm({...moduleForm, monthlyPrice: Number(e.target.value)})} required inputProps={{ min: 0, step: 0.01 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Descrição" value={moduleForm.description} onChange={(e) => setModuleForm({...moduleForm, description: e.target.value})} required multiline rows={3} />
            </Grid>
            <Grid item xs={12}>
              <FormControl>
                <InputLabel>Status</InputLabel>
                <Select value={moduleForm.active ? 'true' : 'false'} label="Status" onChange={(e) => setModuleForm({...moduleForm, active: e.target.value === 'true'})}>
                  <MenuItem value="true">Ativo</MenuItem>
                  <MenuItem value="false">Inativo</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModuleDialog({ open: false, editing: null })}>Cancelar</Button>
          <Button variant="contained" onClick={handleModuleSubmit} disabled={loading}>{loading ? <CircularProgress size={20} color="inherit" /> : 'Salvar'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}